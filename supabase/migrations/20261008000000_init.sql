-- Job Application Tracker schema
-- Each user only sees their own rows (row-level security), and every status
-- change is recorded in status_history by a trigger so the timeline can't drift.

create type application_status as enum (
  'wishlist', 'applied', 'assessment', 'interviewing', 'offer', 'rejected', 'withdrawn'
);

create table applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company     text not null check (length(trim(company)) > 0),
  role        text not null check (length(trim(role)) > 0),
  location    text not null default '',
  url         text not null default '',
  status      application_status not null default 'applied',
  applied_on  date,
  salary      text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index applications_user_updated_idx on applications (user_id, updated_at desc);

create table status_history (
  id              bigint generated always as identity primary key,
  application_id  uuid not null references applications (id) on delete cascade,
  status          application_status not null,
  changed_at      timestamptz not null default now()
);

create index status_history_application_idx on status_history (application_id, changed_at);

-- Keep updated_at fresh and log status transitions.
create or replace function track_application_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into status_history (application_id, status) values (new.id, new.status);
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status is distinct from old.status then
      insert into status_history (application_id, status) values (new.id, new.status);
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_before_update
  before update on applications
  for each row execute function track_application_changes();

create trigger applications_after_insert
  after insert on applications
  for each row execute function track_application_changes();

-- Row-level security: users can only touch their own applications.
alter table applications enable row level security;
alter table status_history enable row level security;

create policy "own applications" on applications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read own history" on status_history
  for select using (
    exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid())
  );
