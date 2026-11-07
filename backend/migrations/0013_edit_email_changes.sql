-- 0013_edit_email_changes.sql — fix what an email did, instead of undoing it
--
-- The inbox panel's Undo button only worked while nothing had changed since
-- the email (and on a job an email added, it deleted the job). It is
-- replaced by Edit, which shows the email and lets the user correct it:
--
--   correct_email_update: sets the stage an email moved a job to, e.g.
--     Interviewing -> Assessment. The email's timeline step is changed in
--     place (no new step), and the job's status follows only while that step
--     is still the job's latest. Passing null (or the stage the job was at
--     before the email) means "this email was not a stage change": the step
--     is removed from the timeline.
--   correct_email_application: fixes the company and role of a job a
--     confirmation email added.
-- See docs/EMAIL_SYNC.md.

create or replace function correct_email_update(p_id uuid, p_status application_status default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u        email_status_updates;
  cur      application_status;
  step_id  bigint;
  latest   bigint;
  is_now   boolean;
begin
  select * into u from email_status_updates where id = p_id for update;
  if not found or u.user_id <> auth.uid() then
    raise exception 'EMAIL_UPDATE_NOT_FOUND: That email update no longer exists.';
  end if;
  if u.state <> 'applied' then
    raise exception 'EMAIL_UPDATE_NOT_APPLIED: Only a change an email made can be edited.';
  end if;
  if p_status = 'wishlist' then
    raise exception 'EMAIL_UPDATE_BAD_STAGE: An email cannot move a job back to Wishlist.';
  end if;
  if p_status = u.detected_status then
    return;
  end if;

  select status into cur from applications where id = u.application_id for update;
  select id into step_id from status_history where email_update_id = p_id order by id desc limit 1;
  select id into latest from status_history where application_id = u.application_id order by id desc limit 1;
  -- The job is still where this email put it (nothing moved it since).
  is_now := cur = u.detected_status and (step_id is null or step_id = latest);

  perform set_config('app.skip_status_history', 'on', true);
  if p_status is null or p_status = u.previous_status then
    delete from status_history where email_update_id = p_id;
    if is_now then
      update applications set status = u.previous_status where id = u.application_id;
    end if;
    update email_status_updates set state = 'undone', updated_at = now() where id = p_id;
  else
    update status_history set status = p_status where email_update_id = p_id;
    if is_now then
      update applications set status = p_status where id = u.application_id;
    end if;
    update email_status_updates set detected_status = p_status, updated_at = now() where id = p_id;
  end if;
  perform set_config('app.skip_status_history', '', true);
end;
$$;

create or replace function correct_email_application(p_id uuid, p_company text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s          email_new_applications;
  v_company  text := left(trim(coalesce(p_company, '')), 200);
  v_role     text := left(trim(coalesce(p_role, '')), 200);
begin
  select * into s from email_new_applications where id = p_id for update;
  if not found or s.user_id <> auth.uid() or s.state <> 'created' or s.application_id is null then
    raise exception 'EMAIL_SUGGESTION_NOT_FOUND: That application no longer exists.';
  end if;
  if v_company = '' or v_role = '' then
    raise exception 'EMAIL_SUGGESTION_INCOMPLETE: Add the company and the role first.';
  end if;
  update applications set company = v_company, role = v_role where id = s.application_id;
  update email_new_applications set company = v_company, role = v_role, updated_at = now() where id = p_id;
end;
$$;

revoke all on function correct_email_update(uuid, application_status) from public, anon;
revoke all on function correct_email_application(uuid, text, text) from public, anon;
grant execute on function correct_email_update(uuid, application_status) to authenticated;
grant execute on function correct_email_application(uuid, text, text) to authenticated;
