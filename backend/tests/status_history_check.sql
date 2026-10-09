-- status_history_check.sql — the trigger records every status change once,
-- and pipeline_stats() counts the pipeline correctly.

\set ON_ERROR_STOP on

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  app_id uuid;
  n int;
  s record;
begin
  -- Seed moved Northwind applied -> assessment -> interviewing.
  select id into app_id from applications where company = 'Northwind Labs';
  select count(*) into n from status_history where application_id = app_id;
  if n <> 3 then raise exception 'history: expected 3 rows for Northwind, saw %', n; end if;

  -- Re-saving the same status must not add a row.
  update applications set status = 'interviewing', notes = 'prep' where id = app_id;
  select count(*) into n from status_history where application_id = app_id;
  if n <> 3 then raise exception 'history: unchanged status added a row'; end if;

  select * into s from pipeline_stats();
  if s.total <> 2 or s.submitted <> 2 or s.responded <> 1 or s.interviewed <> 1 or s.offers <> 0 then
    raise exception 'pipeline_stats wrong: %', s;
  end if;
end $$;

rollback;
\echo 'status_history_check: all checks passed'
