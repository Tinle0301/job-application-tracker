-- 0007_email_sync.sql — update application statuses from the user's inbox
--
-- A user connects Gmail (read-only) from the app. The email-scan edge
-- function reads recent messages, matches them to tracked applications, asks
-- the model which stage each email shows, and records one
-- email_status_updates row per matched email. Confident forward moves are
-- applied at once (the timeline shows them as "from email" and they can be
-- undone); anything else waits as a suggestion. See docs/EMAIL_SYNC.md.

-- One Gmail connection per user. The refresh token is encrypted by the edge
-- function (AES-GCM, key in the EMAIL_TOKEN_KEY secret) and never leaves the
-- server: users get no grants on this table, only my_email_connection().
create table email_connections (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  provider           text not null default 'gmail' check (provider in ('gmail')),
  email              text not null check (length(email) <= 320),
  refresh_token_enc  text not null,
  status             text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  last_scan_at       timestamptz,
  connected_at       timestamptz not null default now()
);

alter table email_connections enable row level security;
revoke all on email_connections from anon, authenticated;

-- What the signed-in user may know about their connection (no token).
create or replace function my_email_connection()
returns table (email text, status text, last_scan_at timestamptz, connected_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.email, c.status, c.last_scan_at, c.connected_at
  from email_connections c where c.user_id = auth.uid();
$$;

revoke all on function my_email_connection() from public, anon;
grant execute on function my_email_connection() to authenticated;

-- One row per email that changed (or could change) an application's status.
-- Only matched emails are stored, and only their sender, subject and date.
create table email_status_updates (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  application_id   uuid not null references applications (id) on delete cascade,
  message_id       text not null check (length(message_id) <= 200),
  from_address     text not null default '' check (length(from_address) <= 320),
  subject          text not null default '' check (length(subject) <= 500),
  received_at      timestamptz not null,
  detected_status  application_status not null,
  previous_status  application_status not null,
  confidence       real not null default 0 check (confidence between 0 and 1),
  reason           text not null default '' check (length(reason) <= 300),
  state            text not null check (state in ('applied', 'suggested', 'undone', 'dismissed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, message_id)
);

create index email_status_updates_user_created_idx on email_status_updates (user_id, created_at desc);
create index email_status_updates_application_idx on email_status_updates (application_id);

alter table email_status_updates enable row level security;

create policy email_status_updates_select_own on email_status_updates
  for select to authenticated using (user_id = auth.uid());

-- Rows are written by the scan (service role) and changed only through the
-- functions below, so users get read access only.
revoke all on email_status_updates from anon, authenticated;
grant select on email_status_updates to authenticated;

-- The timeline records where each status change came from.
alter table status_history
  add column source text not null default 'manual' check (source in ('manual', 'email')),
  add column email_update_id uuid references email_status_updates (id) on delete set null;

-- Same trigger as 0003, plus two transaction-local settings the functions
-- below use: app.email_update_id tags the history row with its email, and
-- app.skip_status_history lets an undo revert the status without a new row.
create or replace function track_application_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_update uuid := nullif(current_setting('app.email_update_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into status_history (application_id, status) values (new.id, new.status);
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status is distinct from old.status
       and coalesce(current_setting('app.skip_status_history', true), '') <> 'on' then
      insert into status_history (application_id, status, source, email_update_id)
      values (new.id, new.status, case when email_update is null then 'manual' else 'email' end, email_update);
    end if;
  end if;
  return new;
end;
$$;

-- Moves the application to the status the email shows. Called by the scan
-- (service role, auth.uid() is null) for confident updates and by the user
-- to accept a suggestion.
create or replace function apply_email_update(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u   email_status_updates;
  cur application_status;
begin
  select * into u from email_status_updates where id = p_id for update;
  if not found or (auth.uid() is not null and u.user_id <> auth.uid()) then
    raise exception 'EMAIL_UPDATE_NOT_FOUND: That email update no longer exists.';
  end if;
  if u.state = 'applied' then
    return;
  end if;
  select status into cur from applications where id = u.application_id for update;
  perform set_config('app.email_update_id', p_id::text, true);
  update applications set status = u.detected_status where id = u.application_id;
  perform set_config('app.email_update_id', '', true);
  update email_status_updates
    set state = 'applied', previous_status = cur, updated_at = now()
    where id = p_id;
end;
$$;

-- Puts the status back and removes the email's row from the timeline, so a
-- wrong guess leaves no trace in the pipeline stats.
create or replace function undo_email_update(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u   email_status_updates;
  cur application_status;
begin
  select * into u from email_status_updates where id = p_id for update;
  if not found or (auth.uid() is not null and u.user_id <> auth.uid()) then
    raise exception 'EMAIL_UPDATE_NOT_FOUND: That email update no longer exists.';
  end if;
  if u.state <> 'applied' then
    raise exception 'EMAIL_UPDATE_NOT_APPLIED: Only an applied update can be undone.';
  end if;
  select status into cur from applications where id = u.application_id for update;
  if cur is distinct from u.detected_status then
    raise exception 'EMAIL_UPDATE_STALE: The status changed after this email. Set it by hand instead.';
  end if;
  perform set_config('app.skip_status_history', 'on', true);
  update applications set status = u.previous_status where id = u.application_id;
  perform set_config('app.skip_status_history', '', true);
  delete from status_history where email_update_id = p_id;
  update email_status_updates set state = 'undone', updated_at = now() where id = p_id;
end;
$$;

-- Hides a suggestion without changing anything.
create or replace function dismiss_email_update(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update email_status_updates set state = 'dismissed', updated_at = now()
  where id = p_id and user_id = auth.uid() and state = 'suggested';
  if not found then
    raise exception 'EMAIL_UPDATE_NOT_FOUND: That suggestion no longer exists.';
  end if;
end;
$$;

revoke all on function apply_email_update(uuid) from public, anon;
revoke all on function undo_email_update(uuid) from public, anon;
revoke all on function dismiss_email_update(uuid) from public, anon;
grant execute on function apply_email_update(uuid) to authenticated, service_role;
grant execute on function undo_email_update(uuid) to authenticated;
grant execute on function dismiss_email_update(uuid) to authenticated;

-- Email classification calls count against the same daily AI quota.
alter table ai_usage drop constraint ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('parse', 'match', 'email'));
