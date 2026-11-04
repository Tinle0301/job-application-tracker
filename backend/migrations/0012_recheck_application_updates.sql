-- Inbox checks now also read updates on applications (a rejection, an
-- interview or an assessment) and add the job when it isn't tracked yet.
-- Emails from the last 14 days that earlier checks set aside as "not a
-- confirmation" are read once more on the next check.
delete from email_new_applications
where state = 'ignored' and received_at > now() - interval '14 days';

update email_connections
set confirmations_scanned_at = now() - interval '14 days'
where confirmations_scanned_at > now() - interval '14 days';
