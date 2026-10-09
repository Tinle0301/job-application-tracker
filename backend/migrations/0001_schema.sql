-- 0001_schema.sql — core tables for the Job Application Tracker
--
-- Supabase is the entire backend (see docs/ARCHITECTURE.md). Business rules
-- that must always hold live here as constraints, not in frontend code.

create extension if not exists pgcrypto;

create type application_status as enum (
  'wishlist', 'applied', 'assessment', 'interviewing', 'offer', 'rejected', 'withdrawn'
);

create table applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company          text not null check (length(trim(company)) between 1 and 200),
  role             text not null check (length(trim(role)) between 1 and 200),
  location         text not null default '' check (length(location) <= 200),
  url              text not null default '' check (url = '' or url ~* '^https?://'),
  status           application_status not null default 'applied',
  applied_on       date,
  salary           text not null default '' check (length(salary) <= 100),
  notes            text not null default '' check (length(notes) <= 5000),
  job_description  text not null default '' check (length(job_description) <= 30000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index applications_user_updated_idx on applications (user_id, updated_at desc);

-- Append-only log of status transitions. Written only by the trigger in
-- 0003_functions.sql, so the timeline can never drift from applications.status.
create table status_history (
  id              bigint generated always as identity primary key,
  application_id  uuid not null references applications (id) on delete cascade,
  status          application_status not null,
  changed_at      timestamptz not null default now()
);

create index status_history_application_idx on status_history (application_id, changed_at);
