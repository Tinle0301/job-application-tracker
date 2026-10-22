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

set local role authenticated;

-- Alex sees both emails; Sam sees none and nobody writes directly.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n int;
begin
  select count(*) into n from application_emails;
  if n <> 2 then raise exception 'application emails: Alex sees % emails, expected 2', n; end if;
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
