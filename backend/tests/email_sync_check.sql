-- email_sync_check.sql — email status updates: apply, undo, dismiss, and
-- that users can neither read tokens nor write updates directly.
-- Everything rolls back.

\set ON_ERROR_STOP on

begin;

-- The scan runs as the service role; here the table owner stands in for it.
insert into email_connections (user_id, email, refresh_token_enc)
values ('11111111-1111-1111-1111-111111111111', 'alex@example.com', 'enc');

insert into email_status_updates
  (id, user_id, application_id, message_id, from_address, subject, received_at, detected_status, previous_status, confidence, state)
select 'aaaaaaaa-0000-0000-0000-000000000001', user_id, id, 'm1', 'jobs@contoso.com', 'Interview invitation', now(),
       'interviewing', status, 0.95, 'suggested'
from applications where company = 'Contoso Analytics';

insert into email_status_updates
  (id, user_id, application_id, message_id, from_address, subject, received_at, detected_status, previous_status, confidence, state)
select 'aaaaaaaa-0000-0000-0000-000000000002', user_id, id, 'm2', 'jobs@contoso.com', 'Your application', now(),
       'rejected', status, 0.5, 'suggested'
from applications where company = 'Contoso Analytics';

-- The scan applies a confident update (auth.uid() is null for the service role).
select apply_email_update('aaaaaaaa-0000-0000-0000-000000000001');

do $$
declare
  app applications;
  h record;
  u email_status_updates;
begin
  select * into app from applications where company = 'Contoso Analytics';
  if app.status <> 'interviewing' then raise exception 'email: status not applied (%)', app.status; end if;
  select * into h from status_history where application_id = app.id order by changed_at desc, id desc limit 1;
  if h.source <> 'email' or h.email_update_id <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    raise exception 'email: history row not tagged with its email: %', h;
  end if;
  select * into u from email_status_updates where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if u.state <> 'applied' or u.previous_status <> 'applied' then raise exception 'email: update row wrong: %', u; end if;
end $$;

set local role authenticated;

-- Sam cannot see or touch Alex's updates or connection.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from email_status_updates;
  if n <> 0 then raise exception 'email: Sam sees % of Alex''s updates', n; end if;
  select count(*) into n from my_email_connection();
  if n <> 0 then raise exception 'email: Sam sees Alex''s connection'; end if;
  begin
    perform undo_email_update('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'email: Sam undid Alex''s update';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_UPDATE_NOT_FOUND:%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare
  n int;
  c record;
  app applications;
begin
  -- Alex sees the connection without its token, and cannot read the table.
  select * into c from my_email_connection();
  if c.email <> 'alex@example.com' or c.status <> 'connected' then raise exception 'email: connection wrong: %', c; end if;
  begin
    perform refresh_token_enc from email_connections;
    raise exception 'email: tokens readable by the user';
  exception when insufficient_privilege then null;
  end;

  -- Users cannot write updates directly.
  begin
    update email_status_updates set state = 'applied';
    raise exception 'email: user updated email_status_updates directly';
  exception when insufficient_privilege then null;
  end;

  -- Undo restores the status and removes the email's timeline row.
  perform undo_email_update('aaaaaaaa-0000-0000-0000-000000000001');
  select * into app from applications where company = 'Contoso Analytics';
  if app.status <> 'applied' then raise exception 'email: undo left status %', app.status; end if;
  select count(*) into n from status_history where application_id = app.id and status = 'interviewing';
  if n <> 0 then raise exception 'email: undo left the email row in the timeline'; end if;
  select count(*) into n from status_history where application_id = app.id;
  if n <> 1 then raise exception 'email: undo added timeline rows (% rows)', n; end if;

  -- Dismiss hides a suggestion; dismissing twice fails.
  perform dismiss_email_update('aaaaaaaa-0000-0000-0000-000000000002');
  begin
    perform dismiss_email_update('aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'email: dismissed twice';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_UPDATE_NOT_FOUND:%' then raise; end if;
  end;

  -- Accepting a suggestion applies it.
  perform apply_email_update('aaaaaaaa-0000-0000-0000-000000000002');
  select * into app from applications where company = 'Contoso Analytics';
  if app.status <> 'rejected' then raise exception 'email: accepting a suggestion left status %', app.status; end if;

  -- A status changed by hand afterwards can't be undone from the email.
  update applications set status = 'withdrawn' where id = app.id;
  begin
    perform undo_email_update('aaaaaaaa-0000-0000-0000-000000000002');
    raise exception 'email: stale undo allowed';
  exception when raise_exception then
    if sqlerrm not like 'EMAIL_UPDATE_STALE:%' then raise; end if;
  end;

  -- Manual changes are tagged manual.
  if (select source from status_history where application_id = app.id and status = 'withdrawn') <> 'manual' then
    raise exception 'email: manual change not tagged manual';
  end if;
end $$;

rollback;
\echo 'email_sync_check: all checks passed'
