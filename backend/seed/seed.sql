-- seed.sql — demo data for local development and CI.
--
-- Two users so the RLS tests can prove isolation. On a real Supabase
-- project, create the users through Auth first and replace these ids.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alex@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'sam@example.com')
on conflict do nothing;

insert into applications (user_id, company, role, location, status, applied_on, salary, job_description) values
  ('11111111-1111-1111-1111-111111111111', 'Northwind Labs', 'Software Engineer, New Grad', 'Remote, US', 'applied', '2026-09-28', '$110K–$130K',
   'Build backend services in Python and Go. Requirements: SQL, REST APIs, Docker, CI/CD.'),
  ('11111111-1111-1111-1111-111111111111', 'Contoso Analytics', 'Data Analyst I', 'Remote, US', 'applied', '2026-10-01', '', ''),
  ('22222222-2222-2222-2222-222222222222', 'Fabrikam', 'Backend Engineer', 'San Jose, CA', 'applied', '2026-10-04', '', '');

-- Move one application through the pipeline so status_history has a timeline.
update applications set status = 'assessment' where company = 'Northwind Labs';
update applications set status = 'interviewing' where company = 'Northwind Labs';

insert into resumes (user_id, title, content) values
  ('11111111-1111-1111-1111-111111111111', 'SWE resume',
   'Software engineer with experience in Python, Go, TypeScript, PostgreSQL, Docker, and GitHub Actions CI. Led a 5-person team building a point-of-sale system.');
