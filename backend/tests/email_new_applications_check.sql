-- email_new_applications_check.sql — applications added from confirmation
-- emails: the scan adds one, the user undoes it, adds or dismisses a
-- suggestion, and nobody can touch another user's rows. Everything rolls back.

\set ON_ERROR_STOP on

begin;

-- The scan runs as the service role; here the table owner stands in for it.
insert into email_new_applications
  (id, user_id, message_id, from_address, subject, received_at, applied_on, link, company, role, location, confidence, state, job_url)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'c1', 'no-reply@greenhouse.io',
   'Thanks for applying to Litware', '2026-10-12 15:00+00', '2026-10-12', 'https://mail.google.com/mail/?authuser=alex#all/c1',
   'Litware', 'Data Engineer', 'Remote', 0.95, 'suggested', 'https://boards.greenhouse.io/litware/jobs/1234'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'c2', 'jobs@tailspin.com',
   'We received your application', now(), '2026-10-12', '', 'Tailspin', '', '', 0.6, 'suggested', ''),
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'c3', 'jobs@adatum.com',
   'Your application to Adatum', now(), '2026-10-12', '', 'Adatum', 'Analyst', '', 0.6, 'suggested', '');

-- The scan adds a confident one (auth.uid() is null for the service role).
select add_email_application('bbbbbbbb-0000-0000-0000-000000000001');

do $$
declare
  app applications;
  s   email_new_applications;
begin
  select * into s from email_new_applications where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if s.state <> 'created' or s.application_id is null then raise exception 'email apps: row not marked created: %', s; end if;
  select * into app from applications where id = s.application_id;
  if app.user_id <> '11111111-1111-1111-1111-111111111111' or app.company <> 'Litware' or app.role <> 'Data Engineer'
     or app.status <> 'applied' or app.applied_on <> '2026-10-12' or app.location <> 'Remote' then
    raise exception 'email apps: application wrong: %', app;
  end if;
  -- No note about the email; the posting link instead, and Applied dated by the email.
  if app.notes <> '' or app.url <> 'https://boards.greenhouse.io/litware/jobs/1234' then
    raise exception 'email apps: notes/link wrong: % / %', app.notes, app.url;
  end if;
  if (select changed_at from status_history where application_id = app.id) <> '2026-10-12 15:00+00' then
    raise exception 'email apps: Applied not dated by the email';
  end if;
  -- Adding again returns the same application.
  if add_email_application(s.id) <> s.application_id then raise exception 'email apps: added twice'; end if;
end $$;

set local role authenticated;

-- Sam cannot see or touch Alex's rows.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from email_new_applications;
  if n <> 0 then raise exception 'email apps: Sam sees % of Alex''s rows', n; end if;
  begin
    perform undo_email_application('bbbbbbbb-0000-0000-0000-000000000001');
    raise exception 'email apps: Sam undid Alex''s application';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_SUGGESTION_NOT_FOUND:%' then raise; end if;
  end;
  begin
    perform add_email_application('bbbbbbbb-0000-0000-0000-000000000002', 'Tailspin', 'Engineer');
    raise exception 'email apps: Sam added Alex''s suggestion';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_SUGGESTION_NOT_FOUND:%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare
  n      int;
  app_id uuid;
  s      email_new_applications;
begin
  -- Users cannot write rows directly.
  begin
    update email_new_applications set state = 'created';
    raise exception 'email apps: user updated email_new_applications directly';
  exception when insufficient_privilege then null;
  end;

  -- Undo deletes the added application.
  select application_id into app_id from email_new_applications where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  perform undo_email_application('bbbbbbbb-0000-0000-0000-000000000001');
  select count(*) into n from applications where id = app_id;
  if n <> 0 then raise exception 'email apps: undo left the application'; end if;
  select * into s from email_new_applications where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if s.state <> 'undone' or s.application_id is not null then raise exception 'email apps: undo row wrong: %', s; end if;

  -- A suggestion without a role needs one.
  begin
    perform add_email_application('bbbbbbbb-0000-0000-0000-000000000002');
    raise exception 'email apps: added without a role';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_SUGGESTION_INCOMPLETE:%' then raise; end if;
  end;
  app_id := add_email_application('bbbbbbbb-0000-0000-0000-000000000002', null, ' Support Engineer ');
  if (select role from applications where id = app_id) <> 'Support Engineer'
     or (select user_id from applications where id = app_id) <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'email apps: corrected role not used';
  end if;

  -- Once the application moves on, undo refuses.
  update applications set status = 'interviewing' where id = app_id;
  begin
    perform undo_email_application('bbbbbbbb-0000-0000-0000-000000000002');
    raise exception 'email apps: stale undo allowed';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_SUGGESTION_STALE:%' then raise; end if;
  end;

  -- Dismiss hides a suggestion; it can't be added afterwards.
  perform dismiss_email_application('bbbbbbbb-0000-0000-0000-000000000003');
  begin
    perform add_email_application('bbbbbbbb-0000-0000-0000-000000000003');
    raise exception 'email apps: added a dismissed suggestion';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_SUGGESTION_NOT_FOUND:%' then raise; end if;
  end;
end $$;

rollback;
\echo 'email_new_applications_check: all checks passed'
