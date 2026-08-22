create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.worker_rate_limits (
  scope text not null,
  bucket timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  primary key (scope, bucket)
);

create table if not exists private.worker_auth_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  worker_id text not null,
  operation text not null,
  succeeded boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists worker_auth_events_user_created_idx
  on private.worker_auth_events (user_id, created_at desc);
create index if not exists worker_auth_events_worker_failed_idx
  on private.worker_auth_events (worker_id, created_at desc)
  where not succeeded;

alter table private.worker_rate_limits enable row level security;
alter table private.worker_rate_limits force row level security;
alter table private.worker_auth_events enable row level security;
alter table private.worker_auth_events force row level security;
revoke all on private.worker_rate_limits from public, anon, authenticated;
revoke all on private.worker_auth_events from public, anon, authenticated;

create table if not exists private.worker_rotation_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id text not null,
  code_hash bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists worker_pairing_codes_user_id_idx
  on public.worker_pairing_codes (user_id);
create index if not exists worker_rotation_codes_user_worker_idx
  on private.worker_rotation_codes (user_id, worker_id, created_at desc);

alter table private.worker_rotation_codes enable row level security;
alter table private.worker_rotation_codes force row level security;
revoke all on private.worker_rotation_codes from public, anon, authenticated;

drop policy if exists worker_pairing_codes_select_own on public.worker_pairing_codes;
drop policy if exists worker_pairing_codes_insert_own on public.worker_pairing_codes;
drop policy if exists worker_pairing_codes_delete_own on public.worker_pairing_codes;

create policy worker_pairing_codes_select_own
on public.worker_pairing_codes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy worker_pairing_codes_insert_own
on public.worker_pairing_codes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy worker_pairing_codes_delete_own
on public.worker_pairing_codes for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.consume_worker_rate_limit(
  p_scope text,
  p_limit integer,
  p_window interval
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_attempts integer;
  current_bucket timestamptz := date_bin(p_window, clock_timestamp(), '2000-01-01 00:00:00+00'::timestamptz);
begin
  -- Global buckets also act as bounded housekeeping so arbitrary worker IDs
  -- cannot grow this table indefinitely.
  if p_scope like '%:global' then
    delete from private.worker_rate_limits where bucket < current_bucket - interval '1 day';
  end if;

  insert into private.worker_rate_limits(scope, bucket, attempts)
  values (p_scope, current_bucket, 1)
  on conflict (scope, bucket) do update
    set attempts = private.worker_rate_limits.attempts + 1
  returning attempts into current_attempts;

  return current_attempts <= p_limit;
end;
$$;

create or replace function private.log_worker_auth_event(
  p_user_id uuid,
  p_worker_id text,
  p_operation text,
  p_succeeded boolean,
  p_reason text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into private.worker_auth_events(user_id, worker_id, operation, succeeded, reason)
  values (p_user_id, left(coalesce(p_worker_id, ''), 128), left(p_operation, 64), p_succeeded, left(p_reason, 200))
$$;

create or replace function private.worker_operation_allowed(
  p_worker_id text,
  p_operation text,
  p_limit integer
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.consume_worker_rate_limit(
    'worker-op:' || p_operation || ':' || pg_catalog.encode(extensions.digest(coalesce(p_worker_id, ''), 'sha256'), 'hex'),
    p_limit,
    interval '1 minute'
  )
$$;

create or replace function private.worker_identity(
  p_worker_id text,
  p_worker_token text,
  p_operation text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid;
  candidate_uid uuid;
  worker_scope text := 'worker-auth:' || pg_catalog.encode(extensions.digest(coalesce(p_worker_id, ''), 'sha256'), 'hex');
  within_worker_limit boolean;
  within_global_limit boolean;
begin
  if p_worker_id ~ '^[A-Za-z0-9._-]{3,128}$'
     and p_worker_token ~ '^[A-Fa-f0-9]{64}$' then
    select user_id into uid
    from public.worker_credentials
    where worker_id = p_worker_id
      and token_hash = extensions.digest(p_worker_token, 'sha256')
      and revoked_at is null
    order by created_at desc
    limit 1;
  end if;

  if uid is not null then return uid; end if;

  select user_id into candidate_uid
  from public.worker_credentials
  where worker_id = left(coalesce(p_worker_id, ''), 128)
  order by (revoked_at is null) desc, created_at desc
  limit 1;

  within_global_limit := private.consume_worker_rate_limit('worker-auth:global', 300, interval '1 minute');
  if within_global_limit then
    within_worker_limit := private.consume_worker_rate_limit(worker_scope, 20, interval '15 minutes');
  else
    within_worker_limit := false;
  end if;
  if within_worker_limit and within_global_limit then
    perform private.log_worker_auth_event(candidate_uid, p_worker_id, p_operation, false, 'invalid_or_revoked_credential');
  end if;
  return null;
end;
$$;

revoke all on function private.consume_worker_rate_limit(text,integer,interval) from public, anon, authenticated;
revoke all on function private.log_worker_auth_event(uuid,text,text,boolean,text) from public, anon, authenticated;
revoke all on function private.worker_operation_allowed(text,text,integer) from public, anon, authenticated;
revoke all on function private.worker_identity(text,text,text) from public, anon, authenticated;

create or replace function public.create_worker_pairing_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  code text;
begin
  if uid is null then raise exception 'authentication required'; end if;
  code := upper(substr(pg_catalog.encode(extensions.gen_random_bytes(10), 'hex'), 1, 16));
  delete from public.worker_pairing_codes where user_id = uid and used_at is null;
  delete from public.worker_pairing_codes where expires_at < now() - interval '1 day';
  delete from private.worker_rate_limits where bucket < now() - interval '1 day';
  insert into public.worker_pairing_codes(user_id, code_hash, expires_at)
  values (uid, extensions.digest(code, 'sha256'), now() + interval '10 minutes');
  return code;
end;
$$;

create or replace function public.pair_local_worker(p_code text, p_worker_id text, p_worker_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.worker_pairing_codes%rowtype;
  worker_scope text := 'worker-pair:' || pg_catalog.encode(extensions.digest(coalesce(p_worker_id, ''), 'sha256'), 'hex');
  within_worker_limit boolean;
  within_global_limit boolean;
begin
  within_global_limit := private.consume_worker_rate_limit('worker-pair:global', 120, interval '1 minute');
  if within_global_limit then
    within_worker_limit := private.consume_worker_rate_limit(worker_scope, 10, interval '15 minutes');
  else
    within_worker_limit := false;
  end if;
  if not within_worker_limit or not within_global_limit then return false; end if;

  if p_worker_id !~ '^[A-Za-z0-9._-]{3,128}$'
     or p_worker_token !~ '^[A-Fa-f0-9]{64}$'
     or upper(trim(coalesce(p_code, ''))) !~ '^[A-F0-9]{16}$' then
    perform private.log_worker_auth_event(null, p_worker_id, 'pair', false, 'invalid_input');
    return false;
  end if;

  select * into pairing
  from public.worker_pairing_codes
  where code_hash = extensions.digest(upper(trim(p_code)), 'sha256')
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if pairing.id is null then
    perform private.log_worker_auth_event(null, p_worker_id, 'pair', false, 'invalid_or_expired_code');
    return false;
  end if;

  insert into public.worker_credentials(user_id, worker_id, token_hash, last_seen_at, revoked_at)
  values (pairing.user_id, p_worker_id, extensions.digest(p_worker_token, 'sha256'), now(), null)
  on conflict (user_id, worker_id) do update
    set token_hash = excluded.token_hash, last_seen_at = now(), revoked_at = null;

  update public.worker_pairing_codes set used_at = now() where id = pairing.id;
  perform private.log_worker_auth_event(pairing.user_id, p_worker_id, 'pair', true, null);
  return true;
end;
$$;

create or replace function public.create_worker_rotation_code(p_worker_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  code text;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.worker_credentials
    where user_id = uid and worker_id = p_worker_id and revoked_at is null
  ) then raise exception 'active worker not found'; end if;

  code := upper(substr(pg_catalog.encode(extensions.gen_random_bytes(10), 'hex'), 1, 16));
  delete from private.worker_rotation_codes
  where user_id = uid and worker_id = p_worker_id and used_at is null;
  insert into private.worker_rotation_codes(user_id, worker_id, code_hash, expires_at)
  values (uid, p_worker_id, extensions.digest(code, 'sha256'), now() + interval '10 minutes');
  return code;
end;
$$;

create or replace function public.rotate_local_worker(
  p_worker_id text,
  p_worker_token text,
  p_new_worker_token text,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  rotation private.worker_rotation_codes%rowtype;
  rotation_scope text := 'worker-rotate:' || pg_catalog.encode(extensions.digest(coalesce(p_worker_id, ''), 'sha256'), 'hex');
begin
  uid := private.worker_identity(p_worker_id, p_worker_token, 'rotate');
  if uid is null then return false; end if;
  if not private.consume_worker_rate_limit(rotation_scope, 10, interval '15 minutes') then return false; end if;
  if p_new_worker_token !~ '^[A-Fa-f0-9]{64}$' or p_new_worker_token = p_worker_token
     or upper(trim(coalesce(p_code, ''))) !~ '^[A-F0-9]{16}$' then
    perform private.log_worker_auth_event(uid, p_worker_id, 'rotate', false, 'invalid_input');
    return false;
  end if;

  select * into rotation
  from private.worker_rotation_codes
  where user_id = uid and worker_id = p_worker_id
    and code_hash = extensions.digest(upper(trim(p_code)), 'sha256')
    and used_at is null and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if rotation.id is null then
    perform private.log_worker_auth_event(uid, p_worker_id, 'rotate', false, 'invalid_or_expired_code');
    return false;
  end if;

  update public.worker_credentials
  set token_hash = extensions.digest(p_new_worker_token, 'sha256'), last_seen_at = now()
  where user_id = uid and worker_id = p_worker_id and revoked_at is null;
  update private.worker_rotation_codes set used_at = now() where id = rotation.id;
  perform private.log_worker_auth_event(uid, p_worker_id, 'rotate', true, null);
  return true;
end;
$$;

create or replace function public.revoke_local_worker(p_worker_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  changed boolean;
begin
  if uid is null then raise exception 'authentication required'; end if;
  update public.worker_credentials set revoked_at = now()
  where user_id = uid and worker_id = p_worker_id and revoked_at is null;
  changed := found;
  if not changed then return false; end if;

  delete from public.worker_presence where user_id = uid and worker_id = p_worker_id;
  update public.agent_jobs
  set status = 'queued', worker_id = null, claimed_at = null, heartbeat_at = null,
      last_error = 'Worker credential revoked; job requeued', updated_at = now()
  where user_id = uid and worker_id = p_worker_id and status = 'running';
  perform private.log_worker_auth_event(uid, p_worker_id, 'revoke', true, null);
  return true;
end;
$$;

create or replace function public.list_local_workers()
returns table (
  worker_id text,
  created_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  failed_auth_24h bigint
)
language sql
security definer
set search_path = ''
as $$
  select c.worker_id, c.created_at, c.last_seen_at, c.revoked_at,
    (select count(*) from private.worker_auth_events e
     where e.user_id = c.user_id and e.worker_id = c.worker_id
       and not e.succeeded and e.created_at > now() - interval '24 hours') as failed_auth_24h
  from public.worker_credentials c
  where c.user_id = (select auth.uid())
  order by c.created_at desc
$$;

create or replace function public.worker_touch(p_worker_id text, p_worker_token text, p_details jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid;
begin
  uid := private.worker_identity(p_worker_id, p_worker_token, 'touch');
  if uid is null then return false; end if;
  if not private.worker_operation_allowed(p_worker_id, 'touch', 60) then return false; end if;
  if pg_column_size(coalesce(p_details, '{}'::jsonb)) > 8192 then return false; end if;
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
set search_path = ''
as $$
declare uid uuid; claimed public.agent_jobs%rowtype;
begin
  uid := private.worker_identity(p_worker_id, p_worker_token, 'claim');
  if uid is null then return; end if;
  if not private.worker_operation_allowed(p_worker_id, 'claim', 60) then return; end if;

  update public.agent_jobs
  set status = 'queued', worker_id = null, claimed_at = null, heartbeat_at = null, updated_at = now()
  where user_id = uid and status = 'running'
    and coalesce(heartbeat_at, claimed_at, updated_at) < now() - make_interval(secs => greatest(60, least(coalesce(p_stale_after_seconds, 300), 3600)));

  select * into claimed from public.agent_jobs
  where user_id = uid and status = 'queued'
  order by created_at limit 1 for update skip locked;
  if claimed.id is null then return; end if;

  update public.agent_jobs
  set status = 'running', worker_id = p_worker_id, attempt = attempt + 1,
      claimed_at = now(), heartbeat_at = now(), updated_at = now(), last_error = null
  where id = claimed.id returning * into claimed;
  return next claimed;
end;
$$;

create or replace function public.worker_heartbeat(p_worker_id text, p_worker_token text, p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid;
begin
  uid := private.worker_identity(p_worker_id, p_worker_token, 'heartbeat');
  if uid is null then return false; end if;
  if not private.worker_operation_allowed(p_worker_id, 'heartbeat', 180) then return false; end if;
  update public.agent_jobs set heartbeat_at = now(), updated_at = now()
  where id = p_job_id and user_id = uid and worker_id = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.worker_finish_job(p_worker_id text, p_worker_token text, p_job_id uuid, p_status text, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid;
begin
  if p_status not in ('completed','failed','cancelled') then return false; end if;
  uid := private.worker_identity(p_worker_id, p_worker_token, 'finish');
  if uid is null then return false; end if;
  if not private.worker_operation_allowed(p_worker_id, 'finish', 30) then return false; end if;
  update public.agent_jobs
  set status = p_status, last_error = left(p_error, 4000), heartbeat_at = now(), updated_at = now()
  where id = p_job_id and user_id = uid and worker_id = p_worker_id and status = 'running';
  return found;
end;
$$;

create or replace function public.worker_get_run(p_worker_id text, p_worker_token text, p_run_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid; result jsonb;
begin
  uid := private.worker_identity(p_worker_id, p_worker_token, 'get_run');
  if uid is null then return null; end if;
  if not private.worker_operation_allowed(p_worker_id, 'get_run', 120) then return null; end if;
  select payload into result from public.project_runs where id = p_run_id and user_id = uid;
  return result;
end;
$$;

create or replace function public.worker_save_run(p_worker_id text, p_worker_token text, p_run_id text, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid;
begin
  uid := private.worker_identity(p_worker_id, p_worker_token, 'save_run');
  if uid is null or pg_column_size(p_payload) > 2097152 then return false; end if;
  if not private.worker_operation_allowed(p_worker_id, 'save_run', 120) then return false; end if;
  update public.project_runs set payload = p_payload, updated_at = now()
  where id = p_run_id and user_id = uid;
  return found;
end;
$$;

drop function if exists public.worker_identity(text,text);

revoke all on function public.create_worker_pairing_code() from public, anon, authenticated;
revoke all on function public.create_worker_rotation_code(text) from public, anon, authenticated;
revoke all on function public.revoke_local_worker(text) from public, anon, authenticated;
revoke all on function public.list_local_workers() from public, anon, authenticated;
grant execute on function public.create_worker_pairing_code() to authenticated;
grant execute on function public.create_worker_rotation_code(text) to authenticated;
grant execute on function public.revoke_local_worker(text) to authenticated;
grant execute on function public.list_local_workers() to authenticated;

revoke all on function public.pair_local_worker(text,text,text) from public, anon, authenticated;
revoke all on function public.rotate_local_worker(text,text,text,text) from public, anon, authenticated;
revoke all on function public.worker_touch(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.worker_claim_job(text,text,integer) from public, anon, authenticated;
revoke all on function public.worker_heartbeat(text,text,uuid) from public, anon, authenticated;
revoke all on function public.worker_finish_job(text,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.worker_get_run(text,text,text) from public, anon, authenticated;
revoke all on function public.worker_save_run(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.pair_local_worker(text,text,text) to anon;
grant execute on function public.rotate_local_worker(text,text,text,text) to anon;
grant execute on function public.worker_touch(text,text,jsonb) to anon;
grant execute on function public.worker_claim_job(text,text,integer) to anon;
grant execute on function public.worker_heartbeat(text,text,uuid) to anon;
grant execute on function public.worker_finish_job(text,text,uuid,text,text) to anon;
grant execute on function public.worker_get_run(text,text,text) to anon;
grant execute on function public.worker_save_run(text,text,text,jsonb) to anon;
