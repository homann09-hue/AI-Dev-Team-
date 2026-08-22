import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRepositoryAllowed, normalizeRepository, safeGitArgs, sandboxArgs } from '../scripts/lib/worker-security.mjs';

test('repository allowlist is canonical and fail-closed', () => {
  assert.equal(normalizeRepository('Homann09-Hue/AI-Dev-Team-'), 'homann09-hue/ai-dev-team-');
  assert.equal(assertRepositoryAllowed('HOMANN09-HUE/AI-DEV-TEAM-', {
    allowedRepositories: ['homann09-hue/ai-dev-team-'],
  }), 'homann09-hue/ai-dev-team-');
  assert.throws(() => assertRepositoryAllowed('other/repo', { allowedRepositories: [] }), /not locally allowed/);
  assert.throws(() => normalizeRepository('../escape'), /Invalid repository/);
});

test('sandbox has no host privilege, socket, credentials or QA network', () => {
  const args = sandboxArgs({ cwd: '/tmp/workspace', command: ['npm', 'test'] });
  const text = args.join(' ');
  assert.match(text, /--network none/);
  assert.match(text, /--read-only/);
  assert.match(text, /--cap-drop ALL/);
  assert.match(text, /no-new-privileges/);
  assert.match(text, /\/tmp\/workspace:\/workspace:rw/);
  assert.doesNotMatch(text, /docker\.sock|\.ssh|\.config|AI_DEV_TEAM|SUPABASE|GITHUB_TOKEN/);
});

test('dependency resolution may use the network but remains unprivileged', () => {
  const args = sandboxArgs({ cwd: '/tmp/workspace', command: ['npm', 'ci', '--ignore-scripts'], network: true });
  assert.match(args.join(' '), /--network bridge/);
  assert.deepEqual(args.slice(-3), ['npm', 'ci', '--ignore-scripts']);
});

test('host Git operations use protected metadata and disable hooks', () => {
  const args = safeGitArgs({ cwd: '/tmp/workspace', gitDir: '/tmp/metadata' }, ['commit', '-m', 'safe']);
  const text = args.join(' ');
  assert.match(text, /--git-dir \/tmp\/metadata/);
  assert.match(text, /--work-tree \/tmp\/workspace/);
  assert.match(text, /core\.hooksPath=\/dev\/null/);
  assert.match(text, /core\.fsmonitor=false/);
});
