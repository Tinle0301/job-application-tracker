-- 0009_application_emails.sql — every email received about an application
--
-- The email-scan edge function records each inbox email it matches to a
-- tracked application here, whether or not the email changed the status, so
-- the application's row can list its emails with their dates. Only the
-- sender, subject, date and a Gmail link are kept. See docs/EMAIL_SYNC.md.

create table application_emails (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  application_id   uuid not null references applications (id) on delete cascade,
  message_id       text not null check (length(message_id) <= 200),
  from_name        text not null default '' check (length(from_name) <= 200),
  from_address     text not null default '' check (length(from_address) <= 320),
  subject          text not null default '' check (length(subject) <= 500),
  received_at      timestamptz not null,
  link             text not null default '' check (link = '' or link ~* '^https://'),
  created_at       timestamptz not null default now(),
  unique (user_id, message_id)
);

create index application_emails_application_idx on application_emails (application_id, received_at desc);

alter table application_emails enable row level security;

create policy application_emails_select_own on application_emails
  for select to authenticated using (user_id = auth.uid());

-- Written by the scan (service role) only.
revoke all on application_emails from anon, authenticated;
grant select on application_emails to authenticated;

-- Emails are matched by company, so one that arrived before its application
-- was added is only found by looking back. The scan does that (30 days) while
-- this cursor is null, and a new application clears it.
alter table email_connections add column emails_scanned_at timestamptz;

create or replace function reset_email_lookback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update email_connections set emails_scanned_at = null
  where user_id = new.user_id and emails_scanned_at is not null;
  return new;
end;
$$;

create trigger applications_reset_email_lookback
  after insert on applications
  for each row execute function reset_email_lookback();

-- Emails earlier scans already tied to an application.
insert into application_emails (user_id, application_id, message_id, from_address, subject, received_at, link)
select u.user_id, u.application_id, u.message_id, u.from_address, u.subject, u.received_at,
       coalesce('https://mail.google.com/mail/?authuser=' || replace(c.email, '@', '%40') || '#all/' || u.message_id, '')
from email_status_updates u
left join email_connections c on c.user_id = u.user_id
on conflict (user_id, message_id) do nothing;

insert into application_emails (user_id, application_id, message_id, from_address, subject, received_at, link)
select n.user_id, n.application_id, n.message_id, n.from_address, n.subject, n.received_at, n.link
from email_new_applications n
where n.application_id is not null and n.state in ('created', 'duplicate')
on conflict (user_id, message_id) do nothing;
