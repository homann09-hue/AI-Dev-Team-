#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { detectQaPlans } from './lib/qa-policy.mjs';
import { sandboxArgs } from './lib/worker-security.mjs';

const source = resolve(process.argv[2] ?? process.cwd());
const qaCwd = await mkdtemp(join(tmpdir(), 'ai-dev-team-sandbox-smoke-'));
const excluded = new Set(['.git', '.next', '.venv', 'dist', 'node_modules', 'target']);
await cp(source, qaCwd, { recursive: true, verbatimSymlinks: true, filter: (path) => !excluded.has(basename(path)) });

const engine = process.env.AI_DEV_TEAM_SANDBOX_ENGINE ?? 'docker';
const run = (args) => new Promise((resolveRun, reject) => {
  const child = spawn(engine, args, { stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolveRun() : reject(new Error(`Sandbox command failed with exit ${code ?? 1}`)));
});

const plans = await detectQaPlans(qaCwd);
for (const plan of plans) {
  for (const command of plan.install) {
    await run(sandboxArgs({ cwd: qaCwd, image: plan.image, command, network: true, env: plan.env, workdir: plan.workdir }));
  }
  for (const check of plan.checks) {
    await run(sandboxArgs({ cwd: qaCwd, image: plan.image, command: check.command, env: plan.env, workdir: plan.workdir }));
  }
}
console.log(`Hardened QA smoke passed: ${plans.map((plan) => `${plan.workdir}:${plan.kind}`).join(', ')}`);
