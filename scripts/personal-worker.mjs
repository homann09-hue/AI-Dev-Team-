#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { homedir, hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';

const SUPABASE_URL = (process.env.AI_DEV_TEAM_SUPABASE_URL ?? 'https://lutbicxvaupjmmxgtkjn.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.AI_DEV_TEAM_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_qXwHvaKvJR5JA1LQY0xp6Q_6Xeatyuo';
const HOME = process.env.AI_DEV_TEAM_HOME ?? join(homedir(), '.ai-dev-team');
const SESSION_FILE = process.env.AI_DEV_TEAM_SESSION_FILE ?? join(HOME, 'session.json');
const WORKSPACE_ROOT = process.env.AI_DEV_TEAM_WORKSPACE_ROOT ?? join(HOME, 'workspaces');
const POLL_MS = Math.max(2_000, Number(process.env.AI_DEV_TEAM_POLL_MS ?? 5_000));
const WORKER_ID = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function truncate(value, max = 8_000) { const text = String(value ?? '').trim(); return text.length <= max ? text : `${text.slice(0, max)}\n…truncated`; }
async function exists(path) { try { await stat(path); return true; } catch { return false; } }

async function run(command, args = [], options = {}) {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const maxOutput = options.maxOutput ?? 4_000_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      stderr += `\nTimed out after ${timeoutMs}ms`;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
    }, timeoutMs);
    timer.unref();

    const finish = (code, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) return reject(error);
      resolve({ command, args, code: code ?? 1, stdout, stderr, durationMs: Date.now() - started });
    };
    const append = (target, chunk) => {
      if (target === 'stdout') stdout += chunk; else stderr += chunk;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutput) {
        child.kill('SIGTERM');
        finish(1, new Error(`${command} exceeded ${maxOutput} output bytes`));
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => append('stdout', chunk));
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.on('error', (error) => finish(1, error));
    child.on('close', (code) => finish(code));
    child.stdin.end(options.input ?? '');
  });
}

async function checked(command, args = [], options = {}) {
  const result = await run(command, args, options);
  if (result.code !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.code}): ${truncate(result.stderr || result.stdout, 1_500)}`);
  return result;
}

async function shell(command, cwd, timeoutMs = 20 * 60_000) {
  return run('/bin/zsh', ['-lc', command], { cwd, timeoutMs, maxOutput: 6_000_000 });
}

function nestedText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  for (const key of ['result', 'response', 'text', 'output', 'content', 'message']) {
    const candidate = nestedText(value[key]);
    if (candidate) return candidate;
  }
  return undefined;
}

function unwrap(outputText) {
  const trimmed = String(outputText ?? '').trim();
  if (!trimmed) throw new Error('Agent returned empty output');
  try { const parsed = JSON.parse(trimmed); return nestedText(parsed) ?? trimmed; } catch { return trimmed; }
}

function parseDecision(outputText, requireApproval = false) {
  const text = unwrap(outputText);
  const candidates = [text];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) if (match[1]) candidates.push(match[1].trim());
  const first = text.indexOf('{'); const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  let parsed;
  for (const candidate of candidates) {
    try { const value = JSON.parse(candidate); if (value && typeof value === 'object' && !Array.isArray(value)) { parsed = value; break; } } catch { /* next */ }
  }
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) throw new Error(`Agent did not return valid decision JSON: ${truncate(text, 700)}`);
  if (requireApproval && typeof parsed.approved !== 'boolean') throw new Error('Review JSON must include approved=true or approved=false');
  return {
    summary: parsed.summary.trim(),
    approved: typeof parsed.approved === 'boolean' ? parsed.approved : undefined,
    blocker: typeof parsed.blocker === 'string' && parsed.blocker.trim() ? parsed.blocker.trim() : undefined,
  };
}

class SupabaseClient {
  constructor() { this.session = undefined; }
  async raw(path, init = {}, token) {
    const headers = new Headers(init.headers);
    headers.set('apikey', SUPABASE_KEY);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(`${SUPABASE_URL}${path}`, { ...init, headers, cache: 'no-store' });
  }
  async requestOtp(email) {
    const response = await this.raw('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ email, create_user: true }) });
    if (!response.ok) throw new Error(`OTP request failed (${response.status}): ${truncate(await response.text(), 500)}`);
  }
  async verifyOtp(email, token) {
    const response = await this.raw('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ email, token, type: 'email' }) });
    if (!response.ok) throw new Error(`OTP verification failed (${response.status}): ${truncate(await response.text(), 500)}`);
    const session = await response.json();
    this.validateSession(session);
    this.session = session;
    await this.saveSession(session);
    return session.user;
  }
  validateSession(session) {
    if (!session?.access_token || !session?.refresh_token || !session?.user?.id) throw new Error('Supabase returned an invalid session');
  }
  async saveSession(session) {
    await mkdir(dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
    const temporary = `${SESSION_FILE}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, SESSION_FILE);
  }
  async loadSession() {
    try { const session = JSON.parse(await readFile(SESSION_FILE, 'utf8')); this.validateSession(session); return session; }
    catch (error) { if (error?.code === 'ENOENT') throw new Error(`No worker login found. Run: npm run worker:login -- your@email`); throw error; }
  }
  async refresh(refreshToken) {
    const response = await this.raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
    if (!response.ok) throw new Error('Worker session expired. Run worker:login again.');
    const session = await response.json(); this.validateSession(session); this.session = session; await this.saveSession(session); return session;
  }
  async auth() {
    this.session ??= await this.loadSession();
    const expiresAt = Number(this.session.expires_at ?? 0);
    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1_000) + 90) await this.refresh(this.session.refresh_token);
    return this.session;
  }
  async request(path, init = {}) {
    const session = await this.auth();
    let response = await this.raw(path, init, session.access_token);
    if (response.status === 401) { const refreshed = await this.refresh(session.refresh_token); response = await this.raw(path, init, refreshed.access_token); }
    if (!response.ok) throw new Error(`Supabase ${path} failed (${response.status}): ${truncate(await response.text(), 700)}`);
    return response;
  }
  async touchPresence() {
    const session = await this.auth();
    await this.request('/rest/v1/worker_presence?on_conflict=user_id,worker_id', {
      method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ user_id: session.user.id, worker_id: WORKER_ID, last_seen_at: new Date().toISOString(), details: { hostname: hostname(), pid: process.pid } }]),
    });
  }
  async claim() {
    const response = await this.request('/rest/v1/rpc/claim_next_agent_job', {
      method: 'POST', body: JSON.stringify({ p_worker_id: WORKER_ID, p_stale_after_seconds: 300 }),
    });
    const rows = await response.json(); return rows[0];
  }
  async heartbeat(jobId) {
    await this.request(`/rest/v1/agent_jobs?id=eq.${encodeURIComponent(jobId)}&worker_id=eq.${encodeURIComponent(WORKER_ID)}&status=eq.running`, {
      method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
  }
  async finish(jobId, status, error) {
    await this.request(`/rest/v1/agent_jobs?id=eq.${encodeURIComponent(jobId)}&worker_id=eq.${encodeURIComponent(WORKER_ID)}`, {
      method: 'PATCH', headers: { prefer: 'return=minimal' }, body: JSON.stringify({ status, last_error: error ? truncate(error, 4_000) : null, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
  }
  async getRun(runId) {
    const query = new URLSearchParams({ id: `eq.${runId}`, select: 'payload', limit: '1' });
    const response = await this.request(`/rest/v1/project_runs?${query}`); const rows = await response.json(); return rows[0]?.payload;
  }
  async saveRun(runRecord) {
    const session = await this.auth(); runRecord.updatedAt = new Date().toISOString();
    await this.request('/rest/v1/project_runs?on_conflict=id', {
      method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ id: runRecord.id, user_id: session.user.id, payload: runRecord, updated_at: runRecord.updatedAt }]),
    });
  }
}

function currentItem(runRecord) { const item = runRecord?.workItems?.[0]; if (!item) throw new Error('Run has no work item'); return item; }
function evidence(runRecord, kind, summary, uri) {
  const entry = { kind, summary: truncate(summary, 12_000), createdAt: new Date().toISOString() };
  if (uri) entry.uri = uri;
  currentItem(runRecord).evidence.push(entry);
}
async function stage(client, runRecord, state) { currentItem(runRecord).state = state; await client.saveRun(runRecord); }
function context(runRecord) {
  const item = currentItem(runRecord);
  const recent = item.evidence.slice(-12).map((entry) => `- [${entry.kind}] ${truncate(entry.summary, 1_000)}`).join('\n') || '- none';
  return `Repository: ${runRecord.repository}\nMaster goal: ${runRecord.masterGoal}\nWork item: ${item.title}\nAcceptance criteria:\n${item.acceptanceCriteria.map((value) => `- ${value}`).join('\n')}\nPrior evidence:\n${recent}`;
}

async function prepareWorkspace(repository, runId) {
  if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(repository)) throw new Error('Invalid repository owner/name');
  const cwd = join(WORKSPACE_ROOT, repository.replace('/', '__'), runId);
  await mkdir(dirname(cwd), { recursive: true, mode: 0o700 });
  if (!(await exists(join(cwd, '.git')))) {
    const ghClone = await run('gh', ['repo', 'clone', repository, cwd, '--', '--depth=1'], { timeoutMs: 180_000 });
    if (ghClone.code !== 0) await checked('git', ['clone', '--depth=1', `https://github.com/${repository}.git`, cwd], { timeoutMs: 180_000 });
  }
  await checked('git', ['fetch', 'origin', '--prune'], { cwd, timeoutMs: 120_000 });
  const view = await run('gh', ['repo', 'view', repository, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], { cwd, timeoutMs: 30_000 });
  let defaultBranch = view.code === 0 ? view.stdout.trim() : '';
  if (!defaultBranch) {
    const symbolic = await run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd });
    defaultBranch = symbolic.code === 0 ? symbolic.stdout.trim().replace(/^origin\//, '') : 'main';
  }
  const branch = `ai-dev-team/${runId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12)}`;
  const local = await run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd });
  if (local.code === 0) await checked('git', ['checkout', branch], { cwd });
  else {
    const remote = await run('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`], { cwd });
    if (remote.code === 0) await checked('git', ['checkout', '-b', branch, '--track', `origin/${branch}`], { cwd });
    else await checked('git', ['checkout', '-b', branch, `origin/${defaultBranch}`], { cwd });
  }
  const name = await run('git', ['config', 'user.name'], { cwd }); if (!name.stdout.trim()) await checked('git', ['config', 'user.name', 'AI Dev Team Worker'], { cwd });
  const email = await run('git', ['config', 'user.email'], { cwd }); if (!email.stdout.trim()) await checked('git', ['config', 'user.email', 'ai-dev-team@localhost'], { cwd });
  return { cwd, branch, defaultBranch, repository };
}

async function claudePlan(runRecord, cwd) {
  const prompt = `${context(runRecord)}\n\nAct as a read-only software architect. Inspect the repository, identify the smallest complete implementation path, affected files, risks, tests and Definition of Done. Do not edit. Be concise to save tokens. End with JSON only: {"summary":"actionable plan","blocker":"optional blocker"}.`;
  const args = ['-p', prompt, '--output-format', 'json', '--max-turns', '8', '--permission-mode', 'plan'];
  if (process.env.AI_DEV_TEAM_CLAUDE_MODEL) args.push('--model', process.env.AI_DEV_TEAM_CLAUDE_MODEL);
  const result = await checked('claude', args, { cwd, timeoutMs: 12 * 60_000 }); return parseDecision(result.stdout);
}

async function codexImplement(runRecord, cwd) {
  const prompt = `${context(runRecord)}\n\nImplement the master goal completely in this existing branch. You may edit files and run focused checks. Do not commit, push, create a PR or touch secrets. Keep the diff focused and avoid unnecessary context. End with JSON only: {"summary":"changes and checks","blocker":"optional blocker"}.`;
  const lastMessage = join(tmpdir(), `ai-dev-team-codex-${randomUUID()}.txt`);
  const args = ['exec']; if (process.env.AI_DEV_TEAM_CODEX_MODEL) args.push('--model', process.env.AI_DEV_TEAM_CODEX_MODEL);
  args.push('--ephemeral', '--color', 'never', '--approve-for-me', '-C', cwd, '-o', lastMessage, '-');
  try {
    const result = await checked('codex', args, { cwd, input: prompt, timeoutMs: 30 * 60_000, maxOutput: 6_000_000 });
    let text = result.stdout; try { text = await readFile(lastMessage, 'utf8'); } catch { /* fallback */ }
    const decision = parseDecision(text); const status = await checked('git', ['status', '--porcelain'], { cwd });
    if (!status.stdout.trim() && !decision.blocker) decision.blocker = 'Codex produced no repository changes';
    decision.summary = `${decision.summary}\nChanged paths:\n${truncate(status.stdout || 'none', 4_000)}`; return decision;
  } finally { await rm(lastMessage, { force: true }); }
}

async function grokReview(runRecord, cwd) {
  const diff = await checked('git', ['diff', '--no-ext-diff', '--unified=3'], { cwd, maxOutput: 1_500_000 });
  const prompt = `${context(runRecord)}\n\nIndependently review the uncommitted diff below for correctness, security, regressions, missing edge cases and acceptance-criteria gaps. Do not edit or commit.\n\nDIFF:\n${truncate(diff.stdout, 80_000)}\n\nEnd with JSON only: {"summary":"specific verdict","approved":true|false,"blocker":"required when rejected"}.`;
  const args = ['--no-auto-update', '-p', prompt, '--output-format', 'json', '--cwd', cwd, '--deny', 'Edit', '--deny', 'Bash(git commit*)', '--deny', 'Bash(git push*)'];
  if (process.env.AI_DEV_TEAM_GROK_MODEL) args.push('--model', process.env.AI_DEV_TEAM_GROK_MODEL);
  const result = await checked('grok', args, { cwd, timeoutMs: 12 * 60_000 }); return parseDecision(result.stdout, true);
}

async function detectTestCommand(cwd) {
  if (process.env.AI_DEV_TEAM_TEST_COMMAND?.trim()) return process.env.AI_DEV_TEAM_TEST_COMMAND.trim();
  if (await exists(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm test';
  if (await exists(join(cwd, 'yarn.lock'))) return 'yarn test';
  if (await exists(join(cwd, 'package.json'))) return 'npm test';
  if (await exists(join(cwd, 'pyproject.toml'))) return 'python3 -m pytest';
  if (await exists(join(cwd, 'go.mod'))) return 'go test ./...';
  if (await exists(join(cwd, 'Cargo.toml'))) return 'cargo test';
  return 'git diff --check';
}

async function deterministicGate(runRecord, cwd) {
  const command = await detectTestCommand(cwd); const result = await shell(command, cwd);
  const summary = `${command}\n${truncate([result.stdout, result.stderr].filter(Boolean).join('\n'), 10_000)}`;
  evidence(runRecord, 'test', summary);
  if (result.code !== 0) throw new Error(`Deterministic test gate failed: ${summary}`);
}

const runCommand = run;

async function deliver(projectRun, workspace) {
  const { cwd, branch, defaultBranch, repository } = workspace;
  await checked('git', ['diff', '--check'], { cwd });
  const status = await checked('git', ['status', '--porcelain'], { cwd });
  if (!status.stdout.trim()) throw new Error('Delivery gate found no changes');
  await checked('git', ['add', '--all'], { cwd });
  const staged = await runCommand('git', ['diff', '--cached', '--quiet'], { cwd });
  if (staged.code === 1) {
    const subject = projectRun.masterGoal.replace(/\s+/g, ' ').trim().slice(0, 72) || 'implement master goal';
    await checked('git', ['commit', '-m', `AI Dev Team: ${subject}`], { cwd, timeoutMs: 120_000 });
  } else if (staged.code !== 0) throw new Error('Could not inspect staged changes');
  await checked('git', ['push', '--set-upstream', 'origin', branch], { cwd, timeoutMs: 180_000 });

  let uri = `https://github.com/${repository}/tree/${encodeURIComponent(branch)}`;
  const existing = await runCommand('gh', ['pr', 'view', branch, '--repo', repository, '--json', 'url', '--jq', '.url'], { cwd, timeoutMs: 30_000 });
  if (existing.code === 0 && existing.stdout.trim()) uri = existing.stdout.trim();
  else {
    const created = await runCommand('gh', ['pr', 'create', '--repo', repository, '--head', branch, '--base', defaultBranch, '--title', `AI Dev Team: ${projectRun.id.slice(0, 8)}`, '--body', 'Implemented by the personal local AI Dev Team worker. Review evidence and CI before merging.'], { cwd, timeoutMs: 60_000 });
    const found = created.stdout.trim().split(/\s+/).find((value) => value.startsWith('https://')); if (created.code === 0 && found) uri = found;
  }
  evidence(projectRun, 'deployment', `Committed and pushed ${branch}.`, uri);

  const deployCommand = process.env.AI_DEV_TEAM_DEPLOY_COMMAND?.trim();
  if (deployCommand) {
    const deployed = await shell(deployCommand, cwd, 30 * 60_000);
    if (deployed.code !== 0) throw new Error(`Deploy command failed: ${truncate(deployed.stderr || deployed.stdout, 2_000)}`);
    evidence(projectRun, 'deployment', `Deployment command passed: ${deployCommand}\n${truncate(deployed.stdout, 6_000)}`, process.env.AI_DEV_TEAM_LIVE_URL);
  }
  return uri;
}

async function verifyDelivery(runRecord, workspace, uri) {
  const remote = await runCommand('git', ['ls-remote', '--exit-code', '--heads', 'origin', workspace.branch], { cwd: workspace.cwd, timeoutMs: 60_000 });
  if (remote.code !== 0) throw new Error(`Remote branch ${workspace.branch} could not be verified`);
  const liveUrl = process.env.AI_DEV_TEAM_LIVE_URL?.trim();
  if (liveUrl) {
    const response = await fetch(liveUrl, { redirect: 'follow', cache: 'no-store' });
    if (!response.ok) throw new Error(`Live URL returned HTTP ${response.status}`);
    evidence(runRecord, 'live_check', `Live URL returned HTTP ${response.status}`, liveUrl);
  } else evidence(runRecord, 'live_check', `Remote GitHub delivery verified for ${workspace.branch}`, uri);
}

async function processJob(client, job) {
  let heartbeat;
  try {
    heartbeat = setInterval(() => { void client.heartbeat(job.id).catch((error) => console.error('[heartbeat]', error.message)); }, 25_000);
    heartbeat.unref();
    const runRecord = await client.getRun(job.run_id); if (!runRecord) throw new Error(`Run ${job.run_id} not found`);
    const item = currentItem(runRecord); const workspace = await prepareWorkspace(runRecord.repository, runRecord.id);

    console.log(`[${runRecord.id}] Claude architect`); await stage(client, runRecord, 'planning');
    const plan = await claudePlan(runRecord, workspace.cwd); evidence(runRecord, 'plan', plan.summary); item.attempt += 1; await client.saveRun(runRecord);
    if (plan.blocker) throw new Error(`Architect blocked: ${plan.blocker}`);

    console.log(`[${runRecord.id}] Codex developer`); await stage(client, runRecord, 'implementing');
    const implementation = await codexImplement(runRecord, workspace.cwd); evidence(runRecord, 'diff', implementation.summary); item.attempt += 1; await client.saveRun(runRecord);
    if (implementation.blocker) throw new Error(`Developer blocked: ${implementation.blocker}`);

    console.log(`[${runRecord.id}] Deterministic QA`); await stage(client, runRecord, 'review'); await deterministicGate(runRecord, workspace.cwd); await client.saveRun(runRecord);

    console.log(`[${runRecord.id}] Grok reviewer`);
    const review = await grokReview(runRecord, workspace.cwd); evidence(runRecord, 'review', review.summary); await client.saveRun(runRecord);
    if (review.approved !== true) throw new Error(`Review rejected: ${review.blocker ?? review.summary}`);
    await stage(client, runRecord, 'qa'); evidence(runRecord, 'decision', 'Deterministic tests and independent Grok review passed.'); await client.saveRun(runRecord);

    console.log(`[${runRecord.id}] GitHub delivery`); await stage(client, runRecord, 'deploying'); const uri = await deliver(runRecord, workspace); await client.saveRun(runRecord);
    console.log(`[${runRecord.id}] Live verification`); await stage(client, runRecord, 'live_verification'); await verifyDelivery(runRecord, workspace, uri);

    item.state = 'done'; runRecord.status = 'completed'; await client.saveRun(runRecord); await client.finish(job.id, 'completed');
    console.log(`[${runRecord.id}] completed: ${uri}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const failed = await client.getRun(job.run_id);
      if (failed?.workItems?.[0]) { failed.workItems[0].state = 'failed'; failed.status = 'failed'; evidence(failed, 'decision', `Local worker failed: ${message}`); await client.saveRun(failed); }
    } catch (saveError) { console.error('[save failure]', saveError); }
    await client.finish(job.id, 'failed', message).catch(() => undefined);
    console.error(`[${job.run_id}] failed: ${message}`);
  } finally { if (heartbeat) clearInterval(heartbeat); }
}

async function doctor() {
  const checks = [
    ['node', ['--version'], true], ['git', ['--version'], true], ['gh', ['auth', 'status'], true],
    ['codex', ['--version'], true], ['codex', ['login', 'status'], true], ['claude', ['--version'], true], ['grok', ['--version'], true],
  ];
  let failed = false;
  for (const [command, args, required] of checks) {
    const result = await run(command, args, { timeoutMs: 20_000 }); const ok = result.code === 0;
    console.log(`${ok ? 'OK ' : 'ERR'} ${command} ${args.join(' ')}${ok ? ` — ${truncate(result.stdout || result.stderr, 180)}` : ` — ${truncate(result.stderr || result.stdout, 300)}`}`);
    if (required && !ok) failed = true;
  }
  try { const client = new SupabaseClient(); const session = await client.auth(); console.log(`OK  Supabase worker session — ${session.user.email ?? session.user.id}`); }
  catch (error) { console.log(`ERR Supabase worker session — ${error.message}`); failed = true; }
  console.log('INFO Claude/Grok authentication is additionally verified fail-closed on the first real call; doctor does not spend model tokens.');
  if (failed) process.exitCode = 1;
}

async function login(email) {
  const normalized = String(email ?? '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error('Usage: npm run worker:login -- your@email');
  const client = new SupabaseClient(); await client.requestOtp(normalized); console.log(`OTP sent to ${normalized}.`);
  const reader = createInterface({ input, output }); const token = (await reader.question('6-digit code: ')).trim(); reader.close();
  const user = await client.verifyOtp(normalized, token); console.log(`Worker logged in as ${user.email ?? user.id}. Session stored locally with mode 0600.`);
}

async function once() {
  const client = new SupabaseClient(); await client.touchPresence(); const job = await client.claim(); if (!job) { console.log('No queued jobs.'); return; }
  console.log(`Claimed job ${job.id} for run ${job.run_id}`); await processJob(client, job);
}

async function start() {
  const client = new SupabaseClient(); const session = await client.auth(); console.log(`Worker ${WORKER_ID} started for ${session.user.email ?? session.user.id}.`);
  while (!stopping) {
    await client.touchPresence();
    const job = await client.claim();
    if (job) { console.log(`Claimed job ${job.id} for run ${job.run_id}`); await processJob(client, job); }
    else await sleep(POLL_MS);
  }
  console.log('Worker stopped.');
}

async function main() {
  const [command = 'doctor', argument] = process.argv.slice(2);
  if (command === 'doctor') return doctor();
  if (command === 'login') return login(argument);
  if (command === 'once') return once();
  if (command === 'start') return start();
  throw new Error('Commands: doctor | login <email> | once | start');
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
