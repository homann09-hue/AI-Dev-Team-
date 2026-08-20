create extension if not exists pgcrypto;

create table if not exists public.worker_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.worker_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id text not null,
  token_hash bytea not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, worker_id)
);

alter table public.worker_pairing_codes enable row level security;
alter table public.worker_credentials enable row level security;
revoke all on public.worker_pairing_codes from anon, authenticated;
revoke all on public.worker_credentials from anon, authenticated;

create or replace function public.create_worker_pairing_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  code text;
begin
  if uid is null then raise exception 'authentication required'; end if;
  code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  delete from public.worker_pairing_codes where user_id = uid and used_at is null;
  insert into public.worker_pairing_codes(user_id, code_hash, expires_at)
  values (uid, digest(code, 'sha256'), now() + interval '15 minutes');
  return code;
end;
$$;

create or replace function public.pair_local_worker(p_code text, p_worker_id text, p_worker_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  pairing public.worker_pairing_codes%rowtype;
begin
  if length(coalesce(p_worker_id, '')) < 3 or length(coalesce(p_worker_token, '')) < 32 then
    raise exception 'invalid worker credentials';
  end if;

  select * into pairing
  from public.worker_pairing_codes
  where code_hash = digest(upper(trim(p_code)), 'sha256')
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if pairing.id is null then raise exception 'invalid or expired pairing code'; end if;

  insert into public.worker_credentials(user_id, worker_id, token_hash, last_seen_at, revoked_at)
  values (pairing.user_id, p_worker_id, digest(p_worker_token, 'sha256'), now(), null)
  on conflict (user_id, worker_id) do update
    set token_hash = excluded.token_hash,
        last_seen_at = now(),
        revoked_at = null;

  update public.worker_pairing_codes set used_at = now() where id = pairing.id;
  return true;
end;
$$;

create or replace function public.worker_identity(p_worker_id text, p_worker_token text)
returns uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
  select user_id
  from public.worker_credentials
  where worker_id = p_worker_id
    and token_hash = digest(p_worker_token, 'sha256')
    and revoked_at is null
  limit 1
$$;

revoke all on function public.worker_identity(text,text) from public, anon, authenticated;

create or replace function public.worker_touch(p_worker_id text, p_worker_token text, p_details jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare uid uuid;
begin
  uid := public.worker_identity(p_worker_id, p_worker_token);
  if uid is null then raise exception 'invalid worker credential'; end if;
  update public.worker_credentials set last_seen_at = now() where user_id = uid and worker_id = p_worker_id;
  insert into public.worker_presence(user_id, worker_id, last_seen_at, details)
  values (uid, p_worker_id, now(), coalesce(p_details, '{}'::jsonb))
  on conflict (user_id, worker_id) do update
    set last_seen_at = excluded.last_seen_at, details = excluded.details;
  return true;
end;
$$;

create or replace function public.worker_claim_job(p_worker_id text, p_worker_token text, p_stale_after_seconds integer default 300)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare uid uuid; claimed public.agent_jobs%rowtype;
begin
  uid := public.worker_identity(p_worker_id, p_worker_token);
  if uid is null then raise exception 'invalid worker credential'; end if;

  update public.agent_jobs
  set status = 'queued', worker_id = null, claimed_at = null, heartbeat_at = null, updated_at = now()
  where user_id = uid and status = 'running'
    and coalesce(heartbeat_at, claimed_at, updated_at) < now() - make_interval(secs => greatest(30, p_stale_after_seconds));

  select * into claimed
  from public.agent_jobs
  where user_id = uid and status = 'queued'
  order by created_at
  limit 1
  for update skip locked;

  if claimed.id is null then return; end if;

  update public.agent_jobs
  set status = 'running', worker_id = p_worker_id, attempt = attempt + 1,
      claimed_at = now(), heartbeat_at = now(), updated_at = now(), last_error = null
  where id = claimed.id
  returning * into claimed;

  return next claimed;
end;
$$;

create or replace function public.worker_heartbeat(p_worker_id text, p_worker_token text, p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare uid uuid;
begin
  uid := public.worker_identity(p_worker_id, p_worker_token);
  if uid is null then raise exception 'invalid worker credential'; end if;
  update public.agent_jobs set heartbeat_at = now(), updated_at = now()
  where id = p_job_id and user_id = uid and worker_id = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.worker_finish_job(p_worker_id text, p_worker_token text, p_job_id uuid, p_status text, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare uid uuid;
begin
  if p_status not in ('completed','failed','cancelled') then raise exception 'invalid status'; end if;
  uid := public.worker_identity(p_worker_id, p_worker_token);
  if uid is null then raise exception 'invalid worker credential'; end if;
  update public.agent_jobs
  set status = p_status, last_error = left(p_error, 4000), heartbeat_at = now(), updated_at = now()
  where id = p_job_id and user_id = uid and worker_id = p_worker_id;
  return found;
end;
$$;

create or replace function public.worker_get_run(p_worker_id text, p_worker_token text, p_run_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
stable
as $$
declare uid uuid; result jsonb;
begin
  uid := public.worker_identity(p_worker_id, p_worker_token);
  if uid is null then raise exception 'invalid worker credential'; end if;
  select payload into result from public.project_runs where id = p_run_id and user_id = uid;
  return result;
end;
$$;

create or replace function public.worker_save_run(p_worker_id text, p_worker_token text, p_run_id text, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare uid uuid;
begin
  uid := public.worker_identity(p_worker_id, p_worker_token);
  if uid is null then raise exception 'invalid worker credential'; end if;
  update public.project_runs set payload = p_payload, updated_at = now() where id = p_run_id and user_id = uid;
  return found;
end;
$$;

grant execute on function public.create_worker_pairing_code() to authenticated;
grant execute on function public.pair_local_worker(text,text,text) to anon, authenticated;
grant execute on function public.worker_touch(text,text,jsonb) to anon, authenticated;
grant execute on function public.worker_claim_job(text,text,integer) to anon, authenticated;
grant execute on function public.worker_heartbeat(text,text,uuid) to anon, authenticated;
grant execute on function public.worker_finish_job(text,text,uuid,text,text) to anon, authenticated;
grant execute on function public.worker_get_run(text,text,text) to anon, authenticated;
grant execute on function public.worker_save_run(text,text,text,jsonb) to anon, authenticated;
