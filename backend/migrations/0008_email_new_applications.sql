-- 0008_email_new_applications.sql — add applications from confirmation emails
--
-- Besides updating statuses (0007), the email-scan edge function looks for
-- "thanks for applying" emails about jobs that aren't tracked yet. When the
-- model is sure of the company and role, the application is added at once
-- (status applied, applied on the email's date, a link to the email in the
-- notes) and can be undone; otherwise it waits as a suggestion the user can
-- add or dismiss. Confirmations of jobs already tracked are skipped, or move
-- a wishlist entry to applied through email_status_updates.
-- See docs/EMAIL_SYNC.md.

-- One row per confirmation-looking email the scan read, so it is never read
-- twice. Emails that turned out not to be confirmations ('ignored') keep only
-- their message id.
create table email_new_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  message_id       text not null check (length(message_id) <= 200),
  from_address     text not null default '' check (length(from_address) <= 320),
  subject          text not null default '' check (length(subject) <= 500),
  received_at      timestamptz not null,
  applied_on       date,
  link             text not null default '' check (link = '' or link ~* '^https://'),
  company          text not null default '' check (length(company) <= 200),
  role             text not null default '' check (length(role) <= 200),
  location         text not null default '' check (length(location) <= 200),
  confidence       real not null default 0 check (confidence between 0 and 1),
  reason           text not null default '' check (length(reason) <= 300),
  state            text not null check (state in ('created', 'suggested', 'undone', 'dismissed', 'duplicate', 'ignored')),
  -- The application it created, or the tracked one it duplicates.
  application_id   uuid references applications (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, message_id)
);

create index email_new_applications_user_received_idx on email_new_applications (user_id, received_at desc);

alter table email_new_applications enable row level security;

create policy email_new_applications_select_own on email_new_applications
  for select to authenticated using (user_id = auth.uid());

-- Written by the scan (service role) and changed only through the functions below.
revoke all on email_new_applications from anon, authenticated;
grant select on email_new_applications to authenticated;

-- Confirmations have their own cursor, so inboxes connected before this
-- migration still get a first look back over the last 30 days.
alter table email_connections add column confirmations_scanned_at timestamptz;

-- Adds the application a confirmation email describes. Called by the scan
-- (service role, auth.uid() is null) for confident ones and by the user to
-- accept a suggestion, optionally correcting the company and role.
-- Returns the new application's id.
create or replace function add_email_application(p_id uuid, p_company text default null, p_role text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s          email_new_applications;
  v_company  text;
  v_role     text;
  app_id     uuid;
begin
  select * into s from email_new_applications where id = p_id for update;
  if not found or (auth.uid() is not null and s.user_id <> auth.uid()) then
    raise exception 'EMAIL_SUGGESTION_NOT_FOUND: That email suggestion no longer exists.';
  end if;
  if s.state = 'created' then
    return s.application_id;
  end if;
  if s.state <> 'suggested' then
    raise exception 'EMAIL_SUGGESTION_NOT_FOUND: That email suggestion no longer exists.';
  end if;
  v_company := left(coalesce(nullif(trim(p_company), ''), trim(s.company)), 200);
  v_role := left(coalesce(nullif(trim(p_role), ''), trim(s.role)), 200);
  if v_company = '' or v_role = '' then
    raise exception 'EMAIL_SUGGESTION_INCOMPLETE: Add the company and the role first.';
  end if;

  insert into applications (user_id, company, role, location, status, applied_on, notes)
  values (
    s.user_id, v_company, v_role, s.location, 'applied', s.applied_on,
    left(format(E'Added from a confirmation email from %s: "%s"\n%s', s.from_address, s.subject, s.link), 5000)
  )
  returning id into app_id;

  update email_new_applications
    set state = 'created', application_id = app_id, company = v_company, role = v_role, updated_at = now()
    where id = p_id;
  return app_id;
end;
$$;

-- Deletes an application an email added, as long as nobody has moved it on
-- since (its status is still applied).
create or replace function undo_email_application(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s   email_new_applications;
  cur application_status;
begin
  select * into s from email_new_applications where id = p_id for update;
  if not found or (auth.uid() is not null and s.user_id <> auth.uid()) then
    raise exception 'EMAIL_SUGGESTION_NOT_FOUND: That email suggestion no longer exists.';
  end if;
  if s.state <> 'created' then
    raise exception 'EMAIL_SUGGESTION_NOT_ADDED: Only an added application can be undone.';
  end if;
  if s.application_id is not null then
    select status into cur from applications where id = s.application_id for update;
    if found and cur <> 'applied' then
      raise exception 'EMAIL_SUGGESTION_STALE: This application has moved on since. Delete it by hand instead.';
    end if;
    delete from applications where id = s.application_id;
  end if;
  update email_new_applications set state = 'undone', application_id = null, updated_at = now() where id = p_id;
end;
$$;

-- Hides a suggestion without adding anything.
create or replace function dismiss_email_application(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update email_new_applications set state = 'dismissed', updated_at = now()
  where id = p_id and user_id = auth.uid() and state = 'suggested';
  if not found then
    raise exception 'EMAIL_SUGGESTION_NOT_FOUND: That email suggestion no longer exists.';
  end if;
end;
$$;

revoke all on function add_email_application(uuid, text, text) from public, anon;
revoke all on function undo_email_application(uuid) from public, anon;
revoke all on function dismiss_email_application(uuid) from public, anon;
grant execute on function add_email_application(uuid, text, text) to authenticated, service_role;
grant execute on function undo_email_application(uuid) to authenticated;
grant execute on function dismiss_email_application(uuid) to authenticated;
