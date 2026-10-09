-- usage_limits_check.sql — proves the free-tier limits are enforced.
-- Runs after rls_check and status_history_check; everything rolls back.
begin;

-- Tight limits so the test is fast.
update app_limits set max_applications_per_user = 3, max_writes_per_minute = 4, max_writes_per_day = 100, max_users = 3;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Alex already has 2 seeded applications: one more is fine, the 4th is blocked.
insert into applications (company, role) values ('Cap Co', 'One');
do $$
begin
  insert into applications (company, role) values ('Cap Co', 'Two');
  raise exception 'LIMIT: 4th application was allowed';
exception when raise_exception then
  if sqlerrm not like 'APPLICATION_LIMIT:%' then raise; end if;
end $$;

-- my_usage reports the count and limit.
do $$
declare r record;
begin
  select * into r from my_usage();
  if r.applications <> 3 or r.max_applications <> 3 then
    raise exception 'LIMIT: my_usage wrong: %', r;
  end if;
end $$;

-- Writes per minute: one write was used by the insert above (the failed one
-- rolled back with its counter). Three more statements fill the window of 4.
update applications set notes = 'a' where company = 'Cap Co';
update applications set notes = 'b' where company = 'Cap Co';
update applications set notes = 'c' where company = 'Cap Co';
do $$
begin
  update applications set notes = 'd' where company = 'Cap Co';
  raise exception 'LIMIT: 5th write in a minute was allowed';
exception when raise_exception then
  if sqlerrm not like 'RATE_LIMITED:%' then raise; end if;
end $$;

-- Sam has his own counter and is unaffected.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update applications set notes = 'sam' where company = 'Fabrikam';

-- Users cannot read or change the counters, or call the owner report.
do $$
begin
  begin
    perform * from usage_counters;
    raise exception 'LIMIT: usage_counters readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from usage_report();
    raise exception 'LIMIT: usage_report callable';
  exception when insufficient_privilege then null;
  end;
  begin
    update app_limits set max_users = 999999;
    raise exception 'LIMIT: app_limits writable';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Sign-up cap: 2 seeded users, cap 3 → one more is fine, the next is blocked.
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'c@example.com');
do $$
begin
  insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'd@example.com');
  raise exception 'LIMIT: sign-up beyond cap was allowed';
exception when raise_exception then
  if sqlerrm not like 'SIGNUPS_CLOSED:%' then raise; end if;
end $$;

-- Storage cap: pretend the database is full.
update app_limits set max_db_bytes = 1;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  insert into applications (company, role) values ('Full', 'Disk');
  raise exception 'LIMIT: insert allowed with storage full';
exception when raise_exception then
  if sqlerrm not like 'STORAGE_FULL:%' then raise; end if;
end $$;
-- Deleting is still allowed when storage is full (that's how you free space).
delete from applications where company = 'Fabrikam';

reset role;
-- The owner report works for the postgres role.
do $$ begin perform * from usage_report(); end $$;

rollback;
\echo 'usage_limits_check: all checks passed'
