create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.project_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued',
  worker_id text,
  attempt integer not null default 0,
  last_error text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_jobs_run_id_key unique (run_id),
  constraint agent_jobs_status_check check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  constraint agent_jobs_attempt_check check (attempt >= 0)
);

create index if not exists agent_jobs_user_status_created_idx
  on public.agent_jobs (user_id, status, created_at);

create index if not exists agent_jobs_running_heartbeat_idx
  on public.agent_jobs (heartbeat_at)
  where status = 'running';

alter table public.agent_jobs enable row level security;
alter table public.agent_jobs force row level security;

revoke all on table public.agent_jobs from anon;
grant select, insert, update, delete on table public.agent_jobs to authenticated;

drop policy if exists agent_jobs_select_own on public.agent_jobs;
create policy agent_jobs_select_own
  on public.agent_jobs for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists agent_jobs_insert_own on public.agent_jobs;
create policy agent_jobs_insert_own
  on public.agent_jobs for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists agent_jobs_update_own on public.agent_jobs;
create policy agent_jobs_update_own
  on public.agent_jobs for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists agent_jobs_delete_own on public.agent_jobs;
create policy agent_jobs_delete_own
  on public.agent_jobs for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create or replace function public.claim_next_agent_job(
  p_worker_id text,
  p_stale_after_seconds integer default 300
)
returns setof public.agent_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed public.agent_jobs%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required';
  end if;

  with candidate as (
    select id
    from public.agent_jobs
    where user_id = (select auth.uid())
      and (
        status = 'queued'
        or (
          status = 'running'
          and coalesce(heartbeat_at, claimed_at, updated_at)
            < now() - make_interval(secs => greatest(p_stale_after_seconds, 60))
        )
      )
    order by created_at
    for update skip locked
    limit 1
  )
  update public.agent_jobs as job
  set
    status = 'running',
    worker_id = p_worker_id,
    attempt = job.attempt + 1,
    last_error = null,
    claimed_at = now(),
    heartbeat_at = now(),
    updated_at = now()
  from candidate
  where job.id = candidate.id
  returning job.* into claimed;

  if found then
    return next claimed;
  end if;
end;
$$;

revoke all on function public.claim_next_agent_job(text, integer) from public, anon;
grant execute on function public.claim_next_agent_job(text, integer) to authenticated;

create table if not exists public.worker_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id text not null,
  last_seen_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  primary key (user_id, worker_id)
);

create index if not exists worker_presence_user_seen_idx
  on public.worker_presence (user_id, last_seen_at desc);

alter table public.worker_presence enable row level security;
alter table public.worker_presence force row level security;

revoke all on table public.worker_presence from anon;
grant select, insert, update, delete on table public.worker_presence to authenticated;

drop policy if exists worker_presence_select_own on public.worker_presence;
create policy worker_presence_select_own
  on public.worker_presence for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists worker_presence_insert_own on public.worker_presence;
create policy worker_presence_insert_own
  on public.worker_presence for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists worker_presence_update_own on public.worker_presence;
create policy worker_presence_update_own
  on public.worker_presence for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists worker_presence_delete_own on public.worker_presence;
create policy worker_presence_delete_own
  on public.worker_presence for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
