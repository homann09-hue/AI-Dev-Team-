drop policy if exists worker_pairing_codes_select_own on public.worker_pairing_codes;
drop policy if exists worker_pairing_codes_insert_own on public.worker_pairing_codes;
drop policy if exists worker_pairing_codes_delete_own on public.worker_pairing_codes;

create policy worker_pairing_codes_select_own
on public.worker_pairing_codes for select
to authenticated
using (auth.uid() = user_id);

create policy worker_pairing_codes_insert_own
on public.worker_pairing_codes for insert
to authenticated
with check (auth.uid() = user_id);

create policy worker_pairing_codes_delete_own
on public.worker_pairing_codes for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.create_worker_pairing_code()
returns text
language plpgsql
security invoker
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

revoke execute on function public.create_worker_pairing_code() from public, anon;
grant execute on function public.create_worker_pairing_code() to authenticated;

revoke execute on function public.pair_local_worker(text,text,text) from public, authenticated;
revoke execute on function public.worker_touch(text,text,jsonb) from public, authenticated;
revoke execute on function public.worker_claim_job(text,text,integer) from public, authenticated;
revoke execute on function public.worker_heartbeat(text,text,uuid) from public, authenticated;
revoke execute on function public.worker_finish_job(text,text,uuid,text,text) from public, authenticated;
revoke execute on function public.worker_get_run(text,text,text) from public, authenticated;
revoke execute on function public.worker_save_run(text,text,text,jsonb) from public, authenticated;

grant execute on function public.pair_local_worker(text,text,text) to anon;
grant execute on function public.worker_touch(text,text,jsonb) to anon;
grant execute on function public.worker_claim_job(text,text,integer) to anon;
grant execute on function public.worker_heartbeat(text,text,uuid) to anon;
grant execute on function public.worker_finish_job(text,text,uuid,text,text) to anon;
grant execute on function public.worker_get_run(text,text,text) to anon;
grant execute on function public.worker_save_run(text,text,text,jsonb) to anon;
