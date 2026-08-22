#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { sandboxArgs } from './lib/worker-security.mjs';

const cwd = resolve(process.argv[2] ?? process.cwd());
const engine = process.env.AI_DEV_TEAM_SANDBOX_ENGINE ?? 'docker';
const image = process.env.AI_DEV_TEAM_SANDBOX_IMAGE ?? 'node:22-bookworm-slim';
const child = spawn(engine, sandboxArgs({ cwd, image, command: ['npm', 'test'] }), { stdio: 'inherit' });
child.on('error', (error) => { console.error(`Sandbox smoke test could not start: ${error.message}`); process.exitCode = 1; });
child.on('close', (code) => { process.exitCode = code ?? 1; });
