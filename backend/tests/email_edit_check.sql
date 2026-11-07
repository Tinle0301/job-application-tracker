-- email_edit_check.sql — Edit on an email's change: correcting the stage
-- fixes the email's timeline step in place, "not a stage change" removes it,
-- the job's status follows only while that step is still the latest, and
-- jobs added from email get their company and role fixed. Everything rolls back.

\set ON_ERROR_STOP on

begin;

insert into email_status_updates
  (id, user_id, application_id, message_id, from_address, subject, received_at, detected_status, previous_status, confidence, state)
select 'cccccccc-0000-0000-0000-000000000001', user_id, id, 'e1', 'hirevue@wtw.com', 'Invitation to complete an assessment',
       '2026-10-20 10:00+00', 'interviewing', status, 0.95, 'suggested'
from applications where company = 'Contoso Analytics';

insert into email_status_updates
  (id, user_id, application_id, message_id, from_address, subject, received_at, detected_status, previous_status, confidence, state)
select 'cccccccc-0000-0000-0000-000000000002', user_id, id, 'e2', 'jobs@northwind.com', 'Newsletter',
       '2026-10-21 10:00+00', 'rejected', status, 0.95, 'suggested'
from applications where company = 'Northwind Labs';

insert into email_new_applications
  (id, user_id, message_id, from_address, subject, received_at, applied_on, company, role, confidence, state)
values
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'e3', 'no-reply@greenhouse.io',
   'Thanks for applying', '2026-10-12 15:00+00', '2026-10-12', 'Litwre', 'Role not listed', 0.8, 'suggested');

-- The scan (service role, auth.uid() is null) applies and adds them.
select apply_email_update('cccccccc-0000-0000-0000-000000000001');
select apply_email_update('cccccccc-0000-0000-0000-000000000002');
select add_email_application('cccccccc-0000-0000-0000-000000000003');

set local role authenticated;

-- Sam cannot edit Alex's changes.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  begin
    perform correct_email_update('cccccccc-0000-0000-0000-000000000001', 'assessment');
    raise exception 'edit: Sam edited Alex''s update';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_UPDATE_NOT_FOUND:%' then raise; end if;
  end;
  begin
    perform correct_email_application('cccccccc-0000-0000-0000-000000000003', 'Litware', 'Engineer');
    raise exception 'edit: Sam edited Alex''s application';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_SUGGESTION_NOT_FOUND:%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare
  app applications;
  n   int;
  h   status_history;
  u   email_status_updates;
begin
  select * into app from applications where company = 'Contoso Analytics';

  -- Interviewing -> Assessment: same step, new stage, no new timeline row.
  perform correct_email_update('cccccccc-0000-0000-0000-000000000001', 'assessment');
  select * into app from applications where id = app.id;
  if app.status <> 'assessment' then raise exception 'edit: status is %, not assessment', app.status; end if;
  select count(*) into n from status_history where application_id = app.id;
  if n <> 2 then raise exception 'edit: timeline has % rows, expected 2', n; end if;
  select * into h from status_history where email_update_id = 'cccccccc-0000-0000-0000-000000000001';
  if h.status <> 'assessment' or h.source <> 'email' or h.changed_at <> '2026-10-20 10:00+00' then
    raise exception 'edit: email step wrong: %', h;
  end if;
  select * into u from email_status_updates where id = 'cccccccc-0000-0000-0000-000000000001';
  if u.detected_status <> 'assessment' or u.state <> 'applied' then raise exception 'edit: update row wrong: %', u; end if;

  -- Moved on by hand since: the email's step is fixed, the current status stays.
  update applications set status = 'interviewing' where id = app.id;
  perform correct_email_update('cccccccc-0000-0000-0000-000000000001', 'offer');
  select * into app from applications where id = app.id;
  if app.status <> 'interviewing' then raise exception 'edit: later status changed to %', app.status; end if;
  if (select status from status_history where email_update_id = 'cccccccc-0000-0000-0000-000000000001') <> 'offer' then
    raise exception 'edit: older email step not fixed';
  end if;
  select count(*) into n from status_history where application_id = app.id;
  if n <> 3 then raise exception 'edit: timeline has % rows, expected 3', n; end if;

  -- Not a stage change: the step goes, the later status stays.
  perform correct_email_update('cccccccc-0000-0000-0000-000000000001', null);
  select * into app from applications where id = app.id;
  if app.status <> 'interviewing' then raise exception 'edit: removing old step changed status to %', app.status; end if;
  select count(*) into n from status_history where email_update_id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'edit: removed step still in timeline'; end if;
  if (select state from email_status_updates where id = 'cccccccc-0000-0000-0000-000000000001') <> 'undone' then
    raise exception 'edit: removed update not marked undone';
  end if;
  begin
    perform correct_email_update('cccccccc-0000-0000-0000-000000000001', 'assessment');
    raise exception 'edit: edited a removed update';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_UPDATE_NOT_APPLIED:%' then raise; end if;
  end;

  -- Picking the stage the job was at before the email, on its latest step, puts the status back.
  select * into app from applications where company = 'Northwind Labs';
  select * into u from email_status_updates where id = 'cccccccc-0000-0000-0000-000000000002';
  if app.status <> 'rejected' then raise exception 'edit: setup wrong, Northwind is %', app.status; end if;
  perform correct_email_update(u.id, u.previous_status);
  select * into app from applications where id = app.id;
  if app.status <> u.previous_status then raise exception 'edit: status not put back (%)', app.status; end if;
  select count(*) into n from status_history where email_update_id = 'cccccccc-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'edit: Northwind email step still in timeline'; end if;
  if (select status from status_history where application_id = app.id order by id desc limit 1) <> u.previous_status then
    raise exception 'edit: Northwind timeline does not end where it was before the email';
  end if;

  begin
    perform correct_email_update('cccccccc-0000-0000-0000-000000000002', 'wishlist');
    raise exception 'edit: wishlist allowed';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_UPDATE_%' then raise; end if;
  end;

  -- A job an email added: fix company and role.
  perform correct_email_application('cccccccc-0000-0000-0000-000000000003', '  Litware ', 'Data Engineer');
  select a.* into app from applications a join email_new_applications s on s.application_id = a.id
  where s.id = 'cccccccc-0000-0000-0000-000000000003';
  if app.company <> 'Litware' or app.role <> 'Data Engineer' then raise exception 'edit: application not fixed: %', app; end if;
  if (select company from email_new_applications where id = 'cccccccc-0000-0000-0000-000000000003') <> 'Litware' then
    raise exception 'edit: email row not fixed';
  end if;
  begin
    perform correct_email_application('cccccccc-0000-0000-0000-000000000003', 'Litware', ' ');
    raise exception 'edit: empty role allowed';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_SUGGESTION_INCOMPLETE:%' then raise; end if;
  end;
end $$;

rollback;
\echo 'email_edit_check: all checks passed'
