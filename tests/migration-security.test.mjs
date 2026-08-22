import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../supabase/migrations/20260822145856_harden_worker_credentials_and_pairing.sql', import.meta.url), 'utf8');

test('worker credential migration has rate limits, audit and management RPCs', () => {
  assert.match(sql, /private\.worker_rate_limits/);
  assert.match(sql, /private\.worker_auth_events/);
  assert.match(sql, /consume_worker_rate_limit/);
  assert.match(sql, /worker_operation_allowed/);
  assert.match(sql, /create_worker_rotation_code/);
  assert.match(sql, /rotate_local_worker/);
  assert.match(sql, /revoke_local_worker/);
  assert.match(sql, /list_local_workers/);
});

test('privileged management is authenticated and bearer RPCs are narrowly anon', () => {
  assert.match(sql, /grant execute on function public\.create_worker_pairing_code\(\) to authenticated/);
  assert.match(sql, /grant execute on function public\.revoke_local_worker\(text\) to authenticated/);
  assert.match(sql, /revoke all on function public\.revoke_local_worker\(text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.worker_touch\(text,text,jsonb\) to anon/);
  assert.doesNotMatch(sql, /grant execute on function public\.worker_touch\(text,text,jsonb\) to authenticated/);
});

test('pairing RLS uses init-plan-safe auth checks and indexed ownership', () => {
  assert.match(sql, /worker_pairing_codes_user_id_idx/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
});

test('public definer functions pin an empty search path', () => {
  const publicDefiners = [...sql.matchAll(/create or replace function public\.[\s\S]*?security definer\s+set search_path = ''/g)];
  assert.ok(publicDefiners.length >= 10);
});
