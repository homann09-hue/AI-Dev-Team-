import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectQaPlans } from '../scripts/lib/qa-policy.mjs';

async function fixture(files) {
  const cwd = await mkdtemp(join(tmpdir(), 'qa-policy-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(cwd, name, '..'), { recursive: true });
    await writeFile(join(cwd, name), content);
  }
  return cwd;
}

test('detects locked Node and Next.js gates', async () => {
  const node = await fixture({ 'package.json': JSON.stringify({ scripts: { test: 'node --test', build: 'tsc' } }), 'package-lock.json': '{}' });
  assert.equal((await detectQaPlans(node))[0].kind, 'node');
  const next = await fixture({ 'package.json': JSON.stringify({ dependencies: { next: '16.0.0' }, scripts: { typecheck: 'tsc', build: 'next build' } }), 'pnpm-lock.yaml': '' });
  assert.equal((await detectQaPlans(next))[0].kind, 'nextjs-pnpm');
});

test('discovers framework projects in a monorepo', async () => {
  const cwd = await fixture({
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }), 'package-lock.json': '{}',
    'apps/web/package.json': JSON.stringify({ dependencies: { next: '16.0.0' }, scripts: { typecheck: 'tsc', build: 'next build' } }),
    'apps/web/package-lock.json': '{}',
  });
  assert.deepEqual((await detectQaPlans(cwd)).map((plan) => [plan.workdir, plan.kind]), [['.', 'node'], ['apps/web', 'nextjs']]);
});

test('fails closed for unlocked or untestable Node projects', async () => {
  const unlocked = await fixture({ 'package.json': JSON.stringify({ scripts: { test: 'test' } }) });
  await assert.rejects(detectQaPlans(unlocked), /no supported lockfile/);
  const noGate = await fixture({ 'package.json': JSON.stringify({ scripts: { start: 'node .' } }), 'package-lock.json': '{}' });
  await assert.rejects(detectQaPlans(noGate), /deterministic QA cannot be proven/);
});

test('detects Python, Go, Rust, Maven and locked Gradle', async () => {
  const cwd = await fixture({
    'pyproject.toml': '[tool.pytest.ini_options]\n', 'uv.lock': '', 'tests/.keep': '',
    'go.mod': 'module example.test/app\n', 'Cargo.toml': '[package]\nname="app"\nversion="0.1.0"\n', 'Cargo.lock': '',
    'pom.xml': '<project/>', 'build.gradle': '', 'gradle.lockfile': '',
  });
  assert.deepEqual((await detectQaPlans(cwd)).map((plan) => plan.kind), ['python-uv', 'go', 'rust', 'maven', 'gradle']);
});

test('unknown projects are explicit blockers', async () => {
  await assert.rejects(detectQaPlans(await fixture({ 'README.md': 'unknown' })), /Unsupported project/);
});
