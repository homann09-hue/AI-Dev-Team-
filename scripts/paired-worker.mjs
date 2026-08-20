#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const SUPABASE_URL = (process.env.AI_DEV_TEAM_SUPABASE_URL ?? 'https://lutbicxvaupjmmxgtkjn.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.AI_DEV_TEAM_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_qXwHvaKvJR5JA1LQY0xp6Q_6Xeatyuo';
const HOME = process.env.AI_DEV_TEAM_HOME ?? join(homedir(), '.ai-dev-team');
const CREDENTIAL_FILE = process.env.AI_DEV_TEAM_WORKER_CREDENTIAL_FILE ?? join(HOME, 'worker-credential.json');
const WORKSPACE_ROOT = process.env.AI_DEV_TEAM_WORKSPACE_ROOT ?? join(HOME, 'workspaces');
const POLL_MS = Math.max(2000, Number(process.env.AI_DEV_TEAM_POLL_MS ?? 5000));
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const truncate = (value, max = 8000) => { const text = String(value ?? '').trim(); return text.length <= max ? text : `${text.slice(0, max)}\n…truncated`; };
async function exists(path) { try { await stat(path); return true; } catch { return false; } }

async function run(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  const maxOutput = options.maxOutput ?? 4_000_000;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...(options.env ?? {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => { if (!settled) { stderr += `\nTimed out after ${timeoutMs}ms`; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 2000).unref(); } }, timeoutMs);
    timer.unref();
    const finish = (code, error) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) return reject(error);
      resolve({ code: code ?? 1, stdout, stderr });
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutput) child.kill('SIGTERM'); });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutput) child.kill('SIGTERM'); });
    child.on('error', (error) => finish(1, error)); child.on('close', (code) => finish(code));
    child.stdin.end(options.input ?? '');
  });
}
async function checked(command, args = [], options = {}) { const result = await run(command, args, options); if (result.code !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.code}): ${truncate(result.stderr || result.stdout, 1500)}`); return result; }
async function shell(command, cwd, timeoutMs = 20 * 60_000) { return run('/bin/zsh', ['-lc', command], { cwd, timeoutMs, maxOutput: 6_000_000 }); }

function nestedText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  for (const key of ['result', 'response', 'text', 'output', 'content', 'message']) { const found = nestedText(value[key]); if (found) return found; }
}
function parseDecision(outputText, requireApproval = false) {
  const raw = String(outputText ?? '').trim(); if (!raw) throw new Error('Agent returned empty output');
  let text = raw; try { const parsed = JSON.parse(raw); text = nestedText(parsed) ?? raw; } catch {}
  const candidates = [text];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) if (match[1]) candidates.push(match[1].trim());
  const first = text.indexOf('{'), last = text.lastIndexOf('}'); if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  let parsed;
  for (const candidate of candidates) { try { const value = JSON.parse(candidate); if (value && typeof value === 'object' && !Array.isArray(value)) { parsed = value; break; } } catch {} }
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) throw new Error(`Agent did not return valid decision JSON: ${truncate(text, 700)}`);
  if (requireApproval && typeof parsed.approved !== 'boolean') throw new Error('Review JSON must include approved=true or false');
  return { summary: parsed.summary.trim(), approved: typeof parsed.approved === 'boolean' ? parsed.approved : undefined, blocker: typeof parsed.blocker === 'string' && parsed.blocker.trim() ? parsed.blocker.trim() : undefined };
}

async function rpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase RPC ${name} failed (${response.status}): ${truncate(text, 1000)}`);
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return text; }
}

async function saveCredential(credential) {
  await mkdir(dirname(CREDENTIAL_FILE), { recursive: true, mode: 0o700 });
  const temp = `${CREDENTIAL_FILE}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(credential, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, CREDENTIAL_FILE);
}
async function loadCredential() {
  try {
    const value = JSON.parse(await readFile(CREDENTIAL_FILE, 'utf8'));
    if (!value?.worker_id || !value?.token) throw new Error('invalid credential file');
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('Worker is not paired. Run: npm run worker:pair -- PAIRING_CODE');
    throw error;
  }
}

class PairedClient {
  constructor(credential) { this.credential = credential; }
  authArgs(extra = {}) { return { p_worker_id: this.credential.worker_id, p_worker_token: this.credential.token, ...extra }; }
  async touch() { return rpc('worker_touch', this.authArgs({ p_details: { hostname: hostname(), pid: process.pid } })); }
  async claim() { const rows = await rpc('worker_claim_job', this.authArgs({ p_stale_after_seconds: 300 })); return Array.isArray(rows) ? rows[0] : undefined; }
  async heartbeat(jobId) { return rpc('worker_heartbeat', this.authArgs({ p_job_id: jobId })); }
  async finish(jobId, status, error) { return rpc('worker_finish_job', this.authArgs({ p_job_id: jobId, p_status: status, p_error: error ? truncate(error, 4000) : null })); }
  async getRun(runId) { return rpc('worker_get_run', this.authArgs({ p_run_id: runId })); }
  async saveRun(runRecord) { runRecord.updatedAt = new Date().toISOString(); return rpc('worker_save_run', this.authArgs({ p_run_id: runRecord.id, p_payload: runRecord })); }
}

function currentItem(runRecord) { const item = runRecord?.workItems?.[0]; if (!item) throw new Error('Run has no work item'); return item; }
function evidence(runRecord, kind, summary, uri) { const entry = { kind, summary: truncate(summary, 12000), createdAt: new Date().toISOString() }; if (uri) entry.uri = uri; currentItem(runRecord).evidence.push(entry); }
async function stage(client, runRecord, state) { currentItem(runRecord).state = state; await client.saveRun(runRecord); }
function context(runRecord) { const item = currentItem(runRecord); const recent = item.evidence.slice(-12).map((entry) => `- [${entry.kind}] ${truncate(entry.summary, 1000)}`).join('\n') || '- none'; return `Repository: ${runRecord.repository}\nMaster goal: ${runRecord.masterGoal}\nWork item: ${item.title}\nAcceptance criteria:\n${item.acceptanceCriteria.map((v) => `- ${v}`).join('\n')}\nPrior evidence:\n${recent}`; }

async function prepareWorkspace(repository, runId) {
  if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(repository)) throw new Error('Invalid repository owner/name');
  const cwd = join(WORKSPACE_ROOT, repository.replace('/', '__'), runId); await mkdir(dirname(cwd), { recursive: true, mode: 0o700 });
  if (!(await exists(join(cwd, '.git')))) { const clone = await run('gh', ['repo', 'clone', repository, cwd, '--', '--depth=1'], { timeoutMs: 180000 }); if (clone.code !== 0) await checked('git', ['clone', '--depth=1', `https://github.com/${repository}.git`, cwd], { timeoutMs: 180000 }); }
  await checked('git', ['fetch', 'origin', '--prune'], { cwd, timeoutMs: 120000 });
  const view = await run('gh', ['repo', 'view', repository, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'], { cwd, timeoutMs: 30000 });
  let defaultBranch = view.code === 0 ? view.stdout.trim() : 'main'; if (!defaultBranch) defaultBranch = 'main';
  const branch = `ai-dev-team/${runId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12)}`;
  const local = await run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd });
  if (local.code === 0) await checked('git', ['checkout', branch], { cwd }); else await checked('git', ['checkout', '-B', branch, `origin/${defaultBranch}`], { cwd });
  if (!(await run('git', ['config', 'user.name'], { cwd })).stdout.trim()) await checked('git', ['config', 'user.name', 'AI Dev Team Worker'], { cwd });
  if (!(await run('git', ['config', 'user.email'], { cwd })).stdout.trim()) await checked('git', ['config', 'user.email', 'ai-dev-team@localhost'], { cwd });
  return { cwd, branch, defaultBranch, repository };
}

async function claudePlan(runRecord, cwd) {
  const prompt = `${context(runRecord)}\n\nAct as a read-only software architect. Inspect the repository and produce the smallest complete implementation plan, affected files, risks, tests and Definition of Done. Do not edit. Return JSON only: {"summary":"actionable plan","blocker":"optional blocker"}.`;
  const result = await run('claude', ['-p', prompt, '--output-format', 'json', '--max-turns', '8', '--permission-mode', 'plan'], { cwd, timeoutMs: 15 * 60_000, maxOutput: 2_000_000 });
  if (result.code !== 0) throw new Error(`Claude architect failed (${result.code}): ${truncate(result.stderr || result.stdout, 1500)}`);
  return parseDecision(result.stdout);
}
async function codexImplement(runRecord, cwd) {
  const prompt = `${context(runRecord)}\n\nAct as the sole code-mutating developer. Implement the goal completely. Inspect first, edit only necessary files, do not commit or push. Finish with JSON only: {"summary":"what changed and why","blocker":"optional blocker"}.`;
  const result = await run('codex', ['exec', '--ephemeral', '--approve-for-me', '--sandbox', 'workspace-write', '-C', cwd, prompt], { cwd, timeoutMs: 30 * 60_000, maxOutput: 4_000_000 });
  if (result.code !== 0) throw new Error(`Codex developer failed (${result.code}): ${truncate(result.stderr || result.stdout, 1500)}`);
  return parseDecision(result.stdout);
}
async function deterministicGate(runRecord, cwd) {
  const manifestPath = join(cwd, 'package.json');
  if (!(await exists(manifestPath))) { await checked('git', ['diff', '--check'], { cwd }); evidence(runRecord, 'test', 'git diff --check passed.'); return; }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')); const lock = await exists(join(cwd, 'package-lock.json')) ? 'npm ci' : 'npm install';
  const install = await shell(lock, cwd, 15 * 60_000); if (install.code !== 0) throw new Error(`Dependency install failed: ${truncate(install.stderr || install.stdout, 2000)}`);
  const selected = ['typecheck', 'test', 'build'].filter((name) => typeof (manifest.scripts ?? {})[name] === 'string');
  for (const name of selected) { const result = await shell(`npm run ${name}`, cwd, 20 * 60_000); evidence(runRecord, 'test', `${name}: exit ${result.code}\n${truncate(result.stdout || result.stderr, 5000)}`); if (result.code !== 0) throw new Error(`Deterministic gate failed at npm run ${name}`); }
  if (selected.length === 0) evidence(runRecord, 'test', `${lock} passed; no typecheck/test/build scripts.`);
}
async function grokReview(runRecord, cwd) {
  const diff = await checked('git', ['diff', '--no-ext-diff', '--binary', 'HEAD'], { cwd, maxOutput: 3_000_000 });
  const status = await checked('git', ['status', '--short'], { cwd });
  const prompt = `${context(runRecord)}\n\nAct as an independent read-only reviewer. Review correctness, regressions, security and goal coverage. Do not edit.\nGit status:\n${truncate(status.stdout, 3000)}\nDiff:\n${truncate(diff.stdout, 50000)}\nReturn JSON only: {"summary":"review findings","approved":true|false,"blocker":"required when rejected"}.`;
  const result = await run('grok', ['-p', prompt, '--output-format', 'json'], { cwd, timeoutMs: 15 * 60_000, maxOutput: 2_000_000 });
  if (result.code !== 0) throw new Error(`Grok reviewer failed (${result.code}): ${truncate(result.stderr || result.stdout, 1500)}`);
  return parseDecision(result.stdout, true);
}
async function deliver(runRecord, workspace) {
  const { cwd, branch, defaultBranch, repository } = workspace; const status = await checked('git', ['status', '--porcelain'], { cwd }); if (!status.stdout.trim()) throw new Error('Developer produced no repository changes');
  await checked('git', ['add', '--all'], { cwd }); const staged = await run('git', ['diff', '--cached', '--quiet'], { cwd });
  if (staged.code === 1) await checked('git', ['commit', '-m', `AI Dev Team: ${runRecord.masterGoal.replace(/\s+/g, ' ').trim().slice(0,72) || 'implement master goal'}`], { cwd, timeoutMs: 120000 });
  await checked('git', ['push', '--set-upstream', 'origin', branch], { cwd, timeoutMs: 180000 });
  let uri = `https://github.com/${repository}/tree/${encodeURIComponent(branch)}`;
  const existing = await run('gh', ['pr', 'view', branch, '--repo', repository, '--json', 'url', '--jq', '.url'], { cwd, timeoutMs: 30000 });
  if (existing.code === 0 && existing.stdout.trim()) uri = existing.stdout.trim(); else { const created = await run('gh', ['pr', 'create', '--repo', repository, '--head', branch, '--base', defaultBranch, '--title', `AI Dev Team: ${runRecord.id.slice(0,8)}`, '--body', 'Implemented by the personal local AI Dev Team worker.'], { cwd, timeoutMs: 60000 }); const found = created.stdout.trim().split(/\s+/).find((v) => v.startsWith('https://')); if (created.code === 0 && found) uri = found; }
  evidence(runRecord, 'deployment', `Committed and pushed ${branch}.`, uri); return uri;
}
async function verifyDelivery(runRecord, workspace, uri) { const remote = await run('git', ['ls-remote', '--exit-code', '--heads', 'origin', workspace.branch], { cwd: workspace.cwd, timeoutMs: 60000 }); if (remote.code !== 0) throw new Error(`Remote branch ${workspace.branch} could not be verified`); evidence(runRecord, 'live_check', `Remote GitHub delivery verified for ${workspace.branch}`, uri); }

async function processJob(client, job) {
  let heartbeat;
  try {
    heartbeat = setInterval(() => { void client.heartbeat(job.id).catch((e) => console.error('[heartbeat]', e.message)); }, 25000); heartbeat.unref();
    const runRecord = await client.getRun(job.run_id); if (!runRecord) throw new Error(`Run ${job.run_id} not found`); const item = currentItem(runRecord); const workspace = await prepareWorkspace(runRecord.repository, runRecord.id);
    console.log(`[${runRecord.id}] Claude architect`); await stage(client, runRecord, 'planning'); const plan = await claudePlan(runRecord, workspace.cwd); evidence(runRecord, 'plan', plan.summary); item.attempt += 1; await client.saveRun(runRecord); if (plan.blocker) throw new Error(`Architect blocked: ${plan.blocker}`);
    console.log(`[${runRecord.id}] Codex developer`); await stage(client, runRecord, 'implementing'); const implementation = await codexImplement(runRecord, workspace.cwd); evidence(runRecord, 'diff', implementation.summary); item.attempt += 1; await client.saveRun(runRecord); if (implementation.blocker) throw new Error(`Developer blocked: ${implementation.blocker}`);
    console.log(`[${runRecord.id}] Deterministic QA`); await stage(client, runRecord, 'review'); await deterministicGate(runRecord, workspace.cwd); await client.saveRun(runRecord);
    console.log(`[${runRecord.id}] Grok reviewer`); const review = await grokReview(runRecord, workspace.cwd); evidence(runRecord, 'review', review.summary); await client.saveRun(runRecord); if (review.approved !== true) throw new Error(`Review rejected: ${review.blocker ?? review.summary}`);
    await stage(client, runRecord, 'qa'); evidence(runRecord, 'decision', 'Deterministic tests and Grok review passed.'); await client.saveRun(runRecord);
    console.log(`[${runRecord.id}] GitHub delivery`); await stage(client, runRecord, 'deploying'); const uri = await deliver(runRecord, workspace); await client.saveRun(runRecord);
    await stage(client, runRecord, 'live_verification'); await verifyDelivery(runRecord, workspace, uri); item.state = 'done'; runRecord.status = 'completed'; await client.saveRun(runRecord); await client.finish(job.id, 'completed'); console.log(`[${runRecord.id}] completed: ${uri}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error); try { const failed = await client.getRun(job.run_id); if (failed?.workItems?.[0]) { failed.workItems[0].state = 'failed'; failed.status = 'failed'; evidence(failed, 'decision', `Local worker failed: ${message}`); await client.saveRun(failed); } } catch {}
    await client.finish(job.id, 'failed', message).catch(() => undefined); console.error(`[${job.run_id}] failed: ${message}`);
  } finally { if (heartbeat) clearInterval(heartbeat); }
}

async function pair(code) {
  const normalized = String(code ?? '').trim().toUpperCase(); if (!/^[A-F0-9]{12}$/.test(normalized)) throw new Error('Usage: npm run worker:pair -- 12CHARCODE');
  const credential = { worker_id: `${hostname()}-${randomUUID().slice(0,8)}`, token: randomBytes(32).toString('hex') };
  await rpc('pair_local_worker', { p_code: normalized, p_worker_id: credential.worker_id, p_worker_token: credential.token });
  await saveCredential(credential); console.log(`Worker paired as ${credential.worker_id}. Credential stored locally with mode 0600.`);
}
async function doctor() {
  const checks = [['node',['--version']],['git',['--version']],['gh',['auth','status']],['codex',['--version']],['codex',['login','status']],['claude',['--version']],['grok',['--version']]]; let failed = false;
  for (const [command,args] of checks) { const result = await run(command,args,{timeoutMs:20000}); const ok = result.code === 0; console.log(`${ok?'OK ':'ERR'} ${command} ${args.join(' ')} — ${truncate(result.stdout || result.stderr, 240)}`); if (!ok) failed = true; }
  try { const credential = await loadCredential(); const client = new PairedClient(credential); await client.touch(); console.log(`OK  Supabase pairing — ${credential.worker_id}`); } catch (e) { console.log(`ERR Supabase pairing — ${e.message}`); failed = true; }
  if (failed) process.exitCode = 1;
}
async function once() { const client = new PairedClient(await loadCredential()); await client.touch(); const job = await client.claim(); if (!job) return console.log('No queued jobs.'); console.log(`Claimed job ${job.id} for run ${job.run_id}`); await processJob(client, job); }
async function start() { const credential = await loadCredential(); const client = new PairedClient(credential); await client.touch(); console.log(`Worker ${credential.worker_id} started.`); while (!stopping) { await client.touch(); const job = await client.claim(); if (job) { console.log(`Claimed job ${job.id} for run ${job.run_id}`); await processJob(client, job); } else await sleep(POLL_MS); } console.log('Worker stopped.'); }

const [command='doctor', argument] = process.argv.slice(2);
const tasks = { pair: () => pair(argument), doctor, once, start };
if (!tasks[command]) { console.error('Commands: pair <code> | doctor | once | start'); process.exitCode = 1; } else tasks[command]().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
