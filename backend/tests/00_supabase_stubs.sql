-- 00_supabase_stubs.sql — minimal stand-ins for what Supabase provides.
--
-- CI runs the migrations against plain Postgres, which has no auth schema.
-- These stubs give it just enough (roles, auth.users, auth.uid()) for the
-- migrations to apply and for the RLS tests to impersonate users.
-- NEVER run this file against a real Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id     uuid primary key,
  email  text
);

-- Supabase reads the user id from the request JWT; tests set it with
-- set_config('request.jwt.claim.sub', '<uuid>', true).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
