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

-- Supabase grants anon/authenticated broad default privileges on new objects
-- in public (RLS is what actually protects rows). Mirror that here so tests
-- catch anything that relies on a missing grant instead of RLS or a revoke.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
