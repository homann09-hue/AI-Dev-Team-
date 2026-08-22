import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const worker = await readFile(new URL('scripts/paired-worker.mjs', root), 'utf8');
const claudeShim = await readFile(new URL('scripts/bin/claude', root), 'utf8');

test('active worker keeps model authority fixed', () => {
  assert.match(worker, /Act as a read-only software architect/);
  assert.match(worker, /Act as the sole code-mutating developer/);
  assert.match(worker, /Act as an independent read-only reviewer/);
  assert.match(worker, /run\('codex', \['exec',[\s\S]*'workspace-write'/);
  assert.match(worker, /run\('grok',[\s\S]*'--permission-mode', 'plan'/);
});

test('Claude fallback is Grok plan-only and limited to quota signals', () => {
  assert.match(claudeShim, /session limit\|api_error_status/);
  assert.match(claudeShim, /exec grok -p "\/plan/);
  assert.doesNotMatch(claudeShim, /exec codex|workspace-write|approve-for-me/);
  assert.match(packageJson.scripts['check:worker'], /test-provider-fallback/);
});

test('obsolete host-executing worker entrypoints are removed', async () => {
  for (const path of ['scripts/personal-worker.mjs', 'scripts/personal-worker-launcher.mjs', 'scripts/magic-link-login.mjs']) {
    await assert.rejects(access(new URL(path, root)), { code: 'ENOENT' });
  }
  const scripts = Object.values(packageJson.scripts).join('\n');
  assert.doesNotMatch(scripts, /personal-worker|magic-link|worker:login/);
});
