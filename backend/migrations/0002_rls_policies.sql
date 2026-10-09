-- 0002_rls_policies.sql — row-level security
--
-- The publishable (anon) key ships in the browser, so RLS is the real
-- authorization layer: every row is scoped to auth.uid().

alter table applications enable row level security;
alter table status_history enable row level security;

create policy applications_select_own on applications
  for select to authenticated using (user_id = auth.uid());

create policy applications_insert_own on applications
  for insert to authenticated with check (user_id = auth.uid());

create policy applications_update_own on applications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy applications_delete_own on applications
  for delete to authenticated using (user_id = auth.uid());

-- History is read-only from the client; only the trigger inserts.
create policy status_history_select_own on status_history
  for select to authenticated using (
    exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid())
  );

grant select, insert, update, delete on applications to authenticated;
grant select on status_history to authenticated;
