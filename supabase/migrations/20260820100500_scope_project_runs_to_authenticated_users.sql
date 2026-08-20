alter table public.project_runs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

revoke all on table public.project_runs from anon;
grant select, insert, update, delete on table public.project_runs to authenticated;

alter table public.project_runs enable row level security;

drop policy if exists "project_runs_select_own" on public.project_runs;
drop policy if exists "project_runs_insert_own" on public.project_runs;
drop policy if exists "project_runs_update_own" on public.project_runs;
drop policy if exists "project_runs_delete_own" on public.project_runs;

create policy "project_runs_select_own"
on public.project_runs for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "project_runs_insert_own"
on public.project_runs for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "project_runs_update_own"
on public.project_runs for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "project_runs_delete_own"
on public.project_runs for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create index if not exists project_runs_user_id_updated_at_idx
  on public.project_runs (user_id, updated_at desc);
