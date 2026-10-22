-- 0011_stage_dates_and_posting_links.sql — the current stage shows the
-- newest email's date, and a pasted posting link gets its description
--
-- Stage date: while an application sits at a stage an email moved it to
-- (Assessment, Interviewing, Offer, Rejected), that timeline step is dated by
-- the newest email received about the application, e.g. the latest
-- "complete your assessment" reminder. Applied keeps the confirmation's date.
--
-- Posting: the email-scan function fetches the description for any
-- application that has a posting link but no description yet (including a
-- link the user adds later with Edit). posting_checked_url records which link
-- it last tried, so each link is fetched once. See docs/EMAIL_SYNC.md.

alter table applications
  add column posting_checked_url text not null default '' check (length(posting_checked_url) <= 2000);

-- Moves the date of the application's current step up to its newest email,
-- when that step came from an email and is past Applied.
create or replace function restamp_current_step(p_application uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  newest timestamptz;
  h      status_history;
begin
  select max(received_at) into newest from application_emails where application_id = p_application;
  if newest is null then
    return;
  end if;
  -- The step that put the application at its current status.
  select h2.* into h from status_history h2 join applications a on a.id = h2.application_id
  where h2.application_id = p_application and h2.status = a.status
  order by h2.id desc limit 1;
  if found and h.source = 'email' and h.status not in ('wishlist', 'applied', 'withdrawn') and newest > h.changed_at then
    update status_history set changed_at = newest where id = h.id;
  end if;
end;
$$;

revoke all on function restamp_current_step(uuid) from public, anon, authenticated;

create or replace function restamp_after_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform restamp_current_step(new.application_id);
  return null;
end;
$$;

-- A new email about the application.
create trigger application_emails_restamp
  after insert on application_emails
  for each row execute function restamp_after_email();

-- A step an email just made (the application row isn't updated yet when this
-- runs, so the new row is dated directly).
create or replace function restamp_new_step()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update status_history h
  set changed_at = e.newest
  from (select max(received_at) as newest from application_emails where application_id = new.application_id) e
  where h.id = new.id and e.newest > h.changed_at;
  return null;
end;
$$;

create trigger status_history_restamp
  after insert on status_history
  for each row when (new.source = 'email' and new.status not in ('wishlist', 'applied', 'withdrawn'))
  execute function restamp_new_step();

-- Applications that already have emails.
select restamp_current_step(id) from applications where id in (select application_id from application_emails);
