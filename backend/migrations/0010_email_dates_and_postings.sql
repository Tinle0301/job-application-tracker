-- 0010_email_dates_and_postings.sql — email-driven changes keep the email's
-- date, and jobs added from email get their posting instead of a note
--
-- Timeline: a status change an email made (0007) and the Applied step of an
-- application a confirmation added (0008) are dated when the email arrived,
-- not when the inbox was checked.
--
-- Posting: an application added from a confirmation no longer gets a note
-- about the email (its emails are listed under it, 0009). Instead the
-- email-scan function looks for the job's link in the email, fetches the
-- posting, and fills in the application's link and job description.
-- See docs/EMAIL_SYNC.md.

-- The posting link found in the email, and when the scan looked for it (so
-- it looks once).
alter table email_new_applications
  add column job_url text not null default '' check (job_url = '' or job_url ~* '^https://'),
  add column described_at timestamptz;

-- Same as 0007, except a change an email made is dated by that email.
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
      insert into status_history (application_id, status, source, email_update_id, changed_at)
      values (
        new.id, new.status, case when email_update is null then 'manual' else 'email' end, email_update,
        coalesce((select received_at from email_status_updates where id = email_update), now())
      );
    end if;
  end if;
  return new;
end;
$$;

-- Same as 0008, except the application gets no note, links to the posting
-- when one is known, and its Applied step is dated by the email.
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

  insert into applications (user_id, company, role, location, url, status, applied_on)
  values (s.user_id, v_company, v_role, s.location, s.job_url, 'applied', s.applied_on)
  returning id into app_id;
  update status_history set changed_at = s.received_at, source = 'email' where application_id = app_id;

  update email_new_applications
    set state = 'created', application_id = app_id, company = v_company, role = v_role, updated_at = now()
    where id = p_id;
  return app_id;
end;
$$;

-- Earlier email changes: date them by their emails.
update status_history h
set changed_at = u.received_at
from email_status_updates u
where h.email_update_id = u.id and h.changed_at <> u.received_at;

-- Earlier applications added from email: date the first Applied step by the
-- confirmation, and drop the note 0008 wrote unless the user has edited it.
update status_history h
set changed_at = n.received_at, source = 'email'
from email_new_applications n
where n.state = 'created' and h.application_id = n.application_id and h.status = 'applied'
  and h.id = (select min(id) from status_history where application_id = n.application_id);

update applications a
set notes = ''
from email_new_applications n
where n.state = 'created' and a.id = n.application_id
  and a.notes = left(format(E'Added from a confirmation email from %s: "%s"\n%s', n.from_address, n.subject, n.link), 5000);
