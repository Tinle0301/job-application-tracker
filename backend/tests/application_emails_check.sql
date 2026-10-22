-- application_emails_check.sql — the emails listed under an application:
-- users read only their own and cannot write them, deleting the application
-- removes them, and a new application reopens the scan's look back.
-- Everything rolls back.

\set ON_ERROR_STOP on

begin;

-- The scan runs as the service role; here the table owner stands in for it.
insert into email_connections (user_id, email, refresh_token_enc, emails_scanned_at)
values ('11111111-1111-1111-1111-111111111111', 'alex@example.com', 'enc', now());

insert into application_emails (user_id, application_id, message_id, from_name, from_address, subject, received_at, link)
select user_id, id, 'e1', 'Contoso Recruiting', 'jobs@contoso.com', 'Interview invitation', now(),
       'https://mail.google.com/mail/?authuser=alex%40example.com#all/e1'
from applications where company = 'Contoso Analytics';

insert into application_emails (user_id, application_id, message_id, from_address, subject, received_at)
select user_id, id, 'e2', 'jobs@contoso.com', 'We received your application', now() - interval '3 days'
from applications where company = 'Contoso Analytics';

do $$
begin
  -- One email, one application.
  begin
    insert into application_emails (user_id, application_id, message_id, received_at)
    select user_id, id, 'e1', now() from applications where company = 'Northwind Labs';
    raise exception 'application emails: same email stored twice';
  exception when unique_violation then null;
  end;
  begin
    insert into application_emails (user_id, application_id, message_id, received_at, link)
    select user_id, id, 'e3', now(), 'javascript:alert(1)' from applications where company = 'Northwind Labs';
    raise exception 'application emails: non-https link accepted';
  exception when check_violation then null;
  end;
end $$;

-- An email moves the job to Assessment; the step then takes the newest email's date.
insert into email_status_updates
  (id, user_id, application_id, message_id, from_address, subject, received_at, detected_status, previous_status, confidence, state)
select 'cccccccc-0000-0000-0000-000000000001', user_id, id, 'e2', 'jobs@contoso.com', 'Assessment', now() - interval '3 days',
       'assessment', status, 0.9, 'suggested'
from applications where company = 'Contoso Analytics';
insert into application_emails (user_id, application_id, message_id, from_address, subject, received_at)
select user_id, id, 'e4', 'jobs@contoso.com', 'Assessment reminder', now() + interval '1 day'
from applications where company = 'Contoso Analytics';
-- The scan lists emails before it reads them for a status change.
select apply_email_update('cccccccc-0000-0000-0000-000000000001');

do $$
declare h status_history;
begin
  select s.* into h from status_history s join applications a on a.id = s.application_id
  where a.company = 'Contoso Analytics' order by s.id desc limit 1;
  if h.status <> 'assessment' or h.changed_at < now() + interval '23 hours' then
    raise exception 'application emails: Assessment not dated by the newest email: %', h;
  end if;
  -- Applied keeps its own date.
  select s.* into h from status_history s join applications a on a.id = s.application_id
  where a.company = 'Northwind Labs' and s.status = 'applied';
  if h.changed_at > now() then raise exception 'application emails: Applied restamped'; end if;
end $$;

set local role authenticated;

-- Alex sees both emails; Sam sees none and nobody writes directly.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n int;
begin
  select count(*) into n from application_emails;
  if n <> 3 then raise exception 'application emails: Alex sees % emails, expected 3', n; end if;
  begin
    insert into application_emails (user_id, application_id, message_id, received_at)
    select user_id, id, 'x1', now() from applications where company = 'Northwind Labs';
    raise exception 'application emails: user inserted an email';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare n int;
begin
  select count(*) into n from application_emails;
  if n <> 0 then raise exception 'application emails: Sam sees % of Alex''s emails', n; end if;
end $$;

-- A new application clears the look-back cursor so its earlier emails are found.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into applications (company, role) values ('Litware', 'Data Engineer');
reset role;

do $$
declare n int;
begin
  if (select emails_scanned_at from email_connections where user_id = '11111111-1111-1111-1111-111111111111') is not null then
    raise exception 'application emails: new application left the look back closed';
  end if;
  delete from applications where company = 'Contoso Analytics';
  select count(*) into n from application_emails;
  if n <> 0 then raise exception 'application emails: % emails outlived their application', n; end if;
end $$;

rollback;

\echo 'application_emails_check: all checks passed'
