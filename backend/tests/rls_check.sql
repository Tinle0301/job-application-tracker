-- rls_check.sql — proves users can only see and change their own data.
-- Runs in CI after migrations + seed. Any failed check raises an exception,
-- which makes psql exit non-zero (ON_ERROR_STOP) and fails the build.

\set ON_ERROR_STOP on

begin;
set local role authenticated;

-- Alex sees only Alex's rows.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n int;
begin
  select count(*) into n from applications;
  if n <> 2 then raise exception 'RLS: alex expected 2 applications, saw %', n; end if;

  select count(*) into n from applications where company = 'Fabrikam';
  if n <> 0 then raise exception 'RLS: alex can see sam''s application'; end if;

  select count(*) into n from resumes;
  if n <> 1 then raise exception 'RLS: alex expected 1 resume, saw %', n; end if;
end $$;

-- Alex cannot update Sam's application (the update silently matches 0 rows).
do $$
declare n int;
begin
  update applications set notes = 'hacked' where company = 'Fabrikam';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS: alex updated sam''s application'; end if;
end $$;

-- Alex cannot insert a row owned by Sam.
do $$
begin
  begin
    insert into applications (user_id, company, role)
      values ('22222222-2222-2222-2222-222222222222', 'Evil Corp', 'Spy');
    raise exception 'RLS: alex inserted a row for sam';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- Sam sees only Sam's row and no resume.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from applications;
  if n <> 1 then raise exception 'RLS: sam expected 1 application, saw %', n; end if;
  select count(*) into n from resumes;
  if n <> 0 then raise exception 'RLS: sam can see alex''s resume'; end if;
  select count(*) into n from status_history;
  if n <> 1 then raise exception 'RLS: sam expected 1 history row, saw %', n; end if;
end $$;

-- AI tables: Sam cannot attach an analysis to Alex's application,
-- and AI usage counts are per user.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('test.northwind_id', (select id::text from applications where company = 'Northwind Labs'), true);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  begin
    insert into ai_analyses (application_id, kind, score, summary, model)
    values (current_setting('test.northwind_id')::uuid, 'match', 99, 'x', 'm');
    raise exception 'RLS: sam inserted an analysis on alex''s application';
  exception when insufficient_privilege then
    null; -- expected
  end;
  insert into ai_usage (kind) values ('parse'), ('match');
  if ai_calls_today() <> 2 then raise exception 'AI quota: sam expected 2 calls, saw %', ai_calls_today(); end if;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if ai_calls_today() <> 0 then raise exception 'AI quota: alex sees sam''s usage'; end if;
  if (select count(*) from ai_analyses) <> 0 then raise exception 'RLS: analysis leaked'; end if;
  -- Alex can store an analysis on Alex's own application.
  insert into ai_analyses (application_id, kind, score, summary, model)
  select id, 'match', 80, 'ok', 'm' from applications where company = 'Northwind Labs';
  if (select count(*) from ai_analyses) <> 1 then raise exception 'RLS: alex could not save own analysis'; end if;
end $$;

rollback;
\echo 'rls_check: all checks passed'
