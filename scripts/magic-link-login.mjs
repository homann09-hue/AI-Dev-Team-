#!/usr/bin/env node
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';

const SUPABASE_URL = (process.env.AI_DEV_TEAM_SUPABASE_URL ?? 'https://lutbicxvaupjmmxgtkjn.supabase.co').replace(/\/$/, '');
const SUPABASE_KEY = process.env.AI_DEV_TEAM_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_qXwHvaKvJR5JA1LQY0xp6Q_6Xeatyuo';
const HOME = process.env.AI_DEV_TEAM_HOME ?? join(homedir(), '.ai-dev-team');
const SESSION_FILE = process.env.AI_DEV_TEAM_SESSION_FILE ?? join(HOME, 'session.json');

function truncate(value, max = 800) {
  const text = String(value ?? '').trim();
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

async function authRequest(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('apikey', SUPABASE_KEY);
  headers.set('content-type', 'application/json');
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers, cache: 'no-store' });
}

async function requestMagicLink(email) {
  const response = await authRequest('/auth/v1/otp', {
    method: 'POST',
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!response.ok) {
    throw new Error(`Magic-link request failed (${response.status}): ${truncate(await response.text())}`);
  }
}

function parseVerificationLink(link) {
  let url;
  try {
    url = new URL(String(link ?? '').trim());
  } catch {
    throw new Error('Paste the complete https://...supabase.co/auth/v1/verify?... link from the email.');
  }

  const project = new URL(SUPABASE_URL);
  if (url.protocol !== 'https:' || url.hostname !== project.hostname || url.pathname !== '/auth/v1/verify') {
    throw new Error(`Expected a verification link for ${project.hostname}. Copy the complete hyperlink from the email.`);
  }

  const tokenHash = url.searchParams.get('token');
  const rawType = url.searchParams.get('type');
  if (!tokenHash || !rawType) {
    throw new Error('The link is missing the Supabase token or verification type. Copy the complete hyperlink.');
  }

  // Current Supabase verifyOtp docs use `email` for token-hash email auth.
  // Older/default confirmation URLs may still encode `magiclink` in the query.
  const type = rawType === 'magiclink' ? 'email' : rawType;
  return { tokenHash, type };
}

async function exchangeLinkForSession(link) {
  const { tokenHash, type } = parseVerificationLink(link);
  const response = await authRequest('/auth/v1/verify', {
    method: 'POST',
    body: JSON.stringify({ token_hash: tokenHash, type }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Magic link verification failed (${response.status}): ${truncate(text) || 'request a fresh link and try again'}`);
  }

  let session;
  try {
    session = JSON.parse(text);
  } catch {
    throw new Error('Supabase verified the link but returned an unreadable session response.');
  }

  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new Error('Supabase verified the token but did not return a complete session. Request a fresh link and try again.');
  }

  const expiresIn = Number(session.expires_in ?? 3600);
  session.expires_in = Number.isFinite(expiresIn) ? expiresIn : 3600;
  session.expires_at = Number(session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in);
  return session;
}

async function saveSession(session) {
  await mkdir(dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
  const temporary = `${SESSION_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, SESSION_FILE);
}

async function main() {
  const email = String(process.argv[2] ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Usage: npm run worker:login -- your@email');
  }

  await requestMagicLink(email);
  console.log(`Magic link sent to ${email}.`);
  console.log('IMPORTANT: Do not open the link. Copy the complete hyperlink from the email and paste it here.');

  const reader = createInterface({ input, output });
  const link = (await reader.question('Magic link: ')).trim();
  reader.close();

  const session = await exchangeLinkForSession(link);
  await saveSession(session);
  console.log(`Worker logged in as ${session.user.email ?? session.user.id}. Session stored locally with mode 0600.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
