-- 0005_usage_limits.sql — keep usage inside the Supabase free tier
--
-- Free tier (2026): 500 MB database, 50k monthly active users, 5 GB egress.
-- Limits live in one row of app_limits so the owner can tune them from the
-- SQL editor without a deploy, e.g.:
--   update app_limits set max_users = 2000;
-- Every limit is enforced in the database, so no client can skip it.
-- Errors are raised as 'CODE: message' and mapped to { code, message } by
-- the services (backend/services/result.ts → fromDbError).

create table app_limits (
  id                          int primary key default 1 check (id = 1),
  max_applications_per_user   int    not null default 500,
  max_writes_per_minute       int    not null default 60,
  max_writes_per_day          int    not null default 1000,
  max_users                   int    not null default 1000,
  max_db_bytes                bigint not null default 400 * 1024 * 1024  -- 80% of the 500 MB free tier
);

insert into app_limits default values;

alter table app_limits enable row level security;
create policy app_limits_read on app_limits for select to authenticated using (true);
-- Supabase grants everything by default; users may only read the limits.
revoke all on app_limits from anon, authenticated;
grant select on app_limits to authenticated;

-- Per-user write counters (one fixed 1-minute and one 1-day window).
-- No grants: only the security-definer function below touches it.
create table usage_counters (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  minute_start   timestamptz not null default now(),
  minute_writes  int not null default 0,
  day_start      timestamptz not null default now(),
  day_writes     int not null default 0
);

alter table usage_counters enable row level security;
revoke all on usage_counters from anon, authenticated;

-- Raises when the database is close to the free-tier size.
create or replace function assert_storage_available()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare lim app_limits;
begin
  select * into lim from app_limits where id = 1;
  if pg_database_size(current_database()) >= lim.max_db_bytes then
    raise exception 'STORAGE_FULL: Storage is full right now, so new data can''t be saved. Please try again later.';
  end if;
end;
$$;

-- Counts one write per statement (so a bulk import is one write) and
-- enforces the per-minute and per-day limits.
create or replace function enforce_write_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim app_limits;
  c   usage_counters;
begin
  if uid is null then
    return null; -- service role / SQL editor: not rate limited
  end if;
  select * into lim from app_limits where id = 1;

  insert into usage_counters as u (user_id) values (uid)
  on conflict (user_id) do update set
    minute_writes = case when u.minute_start < now() - interval '1 minute' then 0 else u.minute_writes end,
    minute_start  = case when u.minute_start < now() - interval '1 minute' then now() else u.minute_start end,
    day_writes    = case when u.day_start < now() - interval '1 day' then 0 else u.day_writes end,
    day_start     = case when u.day_start < now() - interval '1 day' then now() else u.day_start end
  returning * into c;

  if c.minute_writes >= lim.max_writes_per_minute then
    raise exception 'RATE_LIMITED: You''re saving changes too quickly. Wait a minute and try again.';
  end if;
  if c.day_writes >= lim.max_writes_per_day then
    raise exception 'DAILY_LIMIT: You''ve reached today''s limit of % changes. It resets in 24 hours.', lim.max_writes_per_day;
  end if;

  update usage_counters
     set minute_writes = minute_writes + 1, day_writes = day_writes + 1
   where user_id = uid;

  if tg_op <> 'DELETE' then
    perform assert_storage_available();
  end if;
  return null;
end;
$$;

create trigger applications_write_rate
  before insert or update or delete on applications
  for each statement execute function enforce_write_rate();

create trigger resumes_write_rate
  before insert or update or delete on resumes
  for each statement execute function enforce_write_rate();

-- Per-row cap on how many applications one person can keep.
create or replace function enforce_application_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim app_limits;
  n   int;
begin
  select * into lim from app_limits where id = 1;
  select count(*) into n from applications where user_id = new.user_id;
  if n >= lim.max_applications_per_user then
    raise exception 'APPLICATION_LIMIT: You''ve reached the limit of % applications. Delete old ones to add more.', lim.max_applications_per_user;
  end if;
  return new;
end;
$$;

create trigger applications_cap
  before insert on applications
  for each row execute function enforce_application_cap();

-- Close sign-ups when the account cap is reached.
create or replace function enforce_user_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare lim app_limits;
begin
  select * into lim from app_limits where id = 1;
  if (select count(*) from auth.users) >= lim.max_users then
    raise exception 'SIGNUPS_CLOSED: Sign-ups are paused right now.';
  end if;
  return new;
end;
$$;

create trigger auth_users_cap
  before insert on auth.users
  for each row execute function enforce_user_cap();

-- What the signed-in user has used (for the in-app usage meter).
create or replace function my_usage()
returns table (
  applications              int,
  max_applications          int,
  writes_today              int,
  max_writes_per_day        int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from applications where user_id = auth.uid()),
    l.max_applications_per_user,
    coalesce((select case when u.day_start < now() - interval '1 day' then 0 else u.day_writes end
              from usage_counters u where u.user_id = auth.uid()), 0),
    l.max_writes_per_day
  from app_limits l where l.id = 1;
$$;

revoke all on function my_usage() from public, anon;
grant execute on function my_usage() to authenticated;

-- Owner-only overview of the whole project against the free tier.
-- Run in the SQL editor:  select * from usage_report();
create or replace function usage_report()
returns table (metric text, used bigint, lim bigint, percent numeric)
language sql
stable
security definer
set search_path = public
as $$
  with l as (select * from app_limits where id = 1)
  select 'database bytes', pg_database_size(current_database()), l.max_db_bytes,
         round(100.0 * pg_database_size(current_database()) / l.max_db_bytes, 1) from l
  union all
  select 'users', (select count(*) from auth.users), l.max_users,
         round(100.0 * (select count(*) from auth.users) / l.max_users, 1) from l
  union all
  select 'applications (all users)', (select count(*) from applications), null, null from l
  union all
  select 'largest user (applications)',
         coalesce((select max(n) from (select count(*) n from applications group by user_id) s), 0),
         l.max_applications_per_user,
         round(100.0 * coalesce((select max(n) from (select count(*) n from applications group by user_id) s), 0)
               / l.max_applications_per_user, 1) from l;
$$;

-- Not callable from the app: only the owner (postgres) in the SQL editor.
-- (Supabase grants execute on new functions to anon/authenticated by default.)
revoke all on function usage_report() from public, anon, authenticated;
revoke all on function assert_storage_available() from public, anon, authenticated;
revoke all on function enforce_write_rate() from public, anon, authenticated;
revoke all on function enforce_application_cap() from public, anon, authenticated;
revoke all on function enforce_user_cap() from public, anon, authenticated;
