-- 0003_functions.sql — triggers and RPC functions
--
-- Multi-step logic lives in plpgsql so it runs in one transaction.

-- Keep updated_at fresh and record every status transition.
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

-- Pipeline metrics computed in the database, scoped to the caller.
-- Counts an application as "responded" if it ever reached assessment,
-- interviewing, offer, or rejected; "interviewed" if it ever reached
-- interviewing or offer.
create or replace function pipeline_stats()
returns table (
  total          bigint,
  submitted      bigint,
  responded      bigint,
  interviewed    bigint,
  offers         bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select a.id, a.status,
      exists (select 1 from status_history h where h.application_id = a.id
              and h.status in ('assessment', 'interviewing', 'offer', 'rejected')) as responded,
      exists (select 1 from status_history h where h.application_id = a.id
              and h.status in ('interviewing', 'offer')) as interviewed
    from applications a
    where a.user_id = auth.uid()
  )
  select
    count(*),
    count(*) filter (where status <> 'wishlist'),
    count(*) filter (where status <> 'wishlist' and responded),
    count(*) filter (where status <> 'wishlist' and interviewed),
    count(*) filter (where status = 'offer')
  from mine;
$$;

grant execute on function pipeline_stats() to authenticated;
