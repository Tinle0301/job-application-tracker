-- 0006_autofill_limit.sql — a lifetime cap on AI auto-fills per user
--
-- Each successful auto-fill (paste a job link or posting text) is one
-- ai_usage row with kind = 'parse'. After max_autofills_per_user of them the
-- user adds applications by hand. Tune it from the SQL editor, e.g.:
--   update app_limits set max_autofills_per_user = 10;
-- Resume fit scores are not affected.

alter table app_limits add column max_autofills_per_user int not null default 3;

-- Enforced on insert, so the cap holds however the edge function is called.
-- The per-user advisory lock stops two parallel auto-fills both slipping in.
create or replace function enforce_autofill_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim app_limits;
  n   int;
begin
  if new.kind <> 'parse' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('autofill:' || new.user_id::text));
  select * into lim from app_limits where id = 1;
  select count(*) into n from ai_usage where user_id = new.user_id and kind = 'parse';
  if n >= lim.max_autofills_per_user then
    raise exception 'AUTOFILL_LIMIT: You''ve used all % free auto-fills. Fill in the form yourself.', lim.max_autofills_per_user;
  end if;
  return new;
end;
$$;

create trigger ai_usage_autofill_cap
  before insert on ai_usage
  for each row execute function enforce_autofill_cap();

revoke all on function enforce_autofill_cap() from public, anon, authenticated;

-- How many auto-fills the signed-in user has left (the edge function checks
-- this before calling the model, so a used-up account costs nothing).
create or replace function autofills_left()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, l.max_autofills_per_user
           - (select count(*)::int from ai_usage where user_id = auth.uid() and kind = 'parse'))
  from app_limits l where l.id = 1;
$$;

revoke all on function autofills_left() from public, anon;
grant execute on function autofills_left() to authenticated;

-- my_usage gains the auto-fill count (new columns change its return type).
drop function my_usage();

create function my_usage()
returns table (
  applications              int,
  max_applications          int,
  writes_today              int,
  max_writes_per_day        int,
  autofills_used            int,
  max_autofills             int
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
    l.max_writes_per_day,
    (select count(*)::int from ai_usage where user_id = auth.uid() and kind = 'parse'),
    l.max_autofills_per_user
  from app_limits l where l.id = 1;
$$;

revoke all on function my_usage() from public, anon;
grant execute on function my_usage() to authenticated;
