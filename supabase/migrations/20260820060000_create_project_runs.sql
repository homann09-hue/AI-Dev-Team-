create table if not exists public.project_runs (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.project_runs enable row level security;

revoke all on table public.project_runs from anon, authenticated;
grant select, insert, update, delete on table public.project_runs to service_role;

create index if not exists project_runs_updated_at_idx
  on public.project_runs (updated_at desc);
