-- 0004_ai.sql — resumes and AI fit analyses
--
-- AI calls happen in Supabase Edge Functions (supabase/functions/), which
-- hold the Anthropic API key. Results are stored here so the frontend can
-- show them later without paying for the call again.

create table resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default 'My resume' check (length(title) <= 120),
  content     text not null check (length(trim(content)) between 50 and 20000),
  is_default  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- At most one default resume per user.
create unique index resumes_one_default_per_user on resumes (user_id) where is_default;

create table ai_analyses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  application_id   uuid not null references applications (id) on delete cascade,
  resume_id        uuid references resumes (id) on delete set null,
  kind             text not null check (kind in ('match')),
  score            int check (score between 0 and 100),
  matched_skills   text[] not null default '{}',
  missing_skills   text[] not null default '{}',
  summary          text not null default '',
  suggestions      text[] not null default '{}',
  model            text not null,
  created_at       timestamptz not null default now()
);

create index ai_analyses_application_idx on ai_analyses (application_id, created_at desc);
create index ai_analyses_user_created_idx on ai_analyses (user_id, created_at desc);

alter table resumes enable row level security;
alter table ai_analyses enable row level security;

create policy resumes_all_own on resumes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Analyses are written by the edge function on the user's behalf (with the
-- user's JWT, so RLS still applies) and are read-only afterwards.
create policy ai_analyses_select_own on ai_analyses
  for select to authenticated using (user_id = auth.uid());

create policy ai_analyses_insert_own on ai_analyses
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid())
  );

grant select, insert, update, delete on resumes to authenticated;
grant select, insert on ai_analyses to authenticated;

-- One row per model call (parse or match). Used for the daily quota that the
-- edge functions check before calling the model, so a leaked session can't
-- run up the API bill.
create table ai_usage (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('parse', 'match')),
  created_at  timestamptz not null default now()
);

create index ai_usage_user_created_idx on ai_usage (user_id, created_at desc);

alter table ai_usage enable row level security;

create policy ai_usage_select_own on ai_usage
  for select to authenticated using (user_id = auth.uid());

create policy ai_usage_insert_own on ai_usage
  for insert to authenticated with check (user_id = auth.uid());

grant select, insert on ai_usage to authenticated;

create or replace function ai_calls_today()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int from ai_usage
  where user_id = auth.uid() and created_at > now() - interval '24 hours';
$$;

grant execute on function ai_calls_today() to authenticated;

-- Keep resumes.updated_at fresh.
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger resumes_touch before update on resumes
  for each row execute function touch_updated_at();
