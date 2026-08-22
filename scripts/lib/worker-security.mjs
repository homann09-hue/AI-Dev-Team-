import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

export const DEFAULT_SANDBOX_IMAGE = 'node:22-bookworm-slim';

export function normalizeRepository(value) {
  const repository = String(value ?? '').trim();
  if (!/^[A-Za-z0-9](?:[-_.A-Za-z0-9]{0,38})\/[A-Za-z0-9](?:[-_.A-Za-z0-9]{0,99})$/.test(repository)) {
    throw new Error('Invalid repository owner/name');
  }
  return repository.toLowerCase();
}

export async function loadWorkerConfig(configFile) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(configFile, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Local worker config not found: ${configFile}. Run worker:repo:allow first.`);
    }
    throw new Error(`Invalid local worker config ${configFile}: ${error.message}`);
  }
  if (!parsed || !Array.isArray(parsed.allowedRepositories)) {
    throw new Error(`Invalid local worker config ${configFile}: allowedRepositories must be an array`);
  }
  return {
    version: 1,
    allowedRepositories: [...new Set(parsed.allowedRepositories.map(normalizeRepository))].sort(),
  };
}

export function assertRepositoryAllowed(repository, config) {
  const normalized = normalizeRepository(repository);
  if (!config.allowedRepositories.includes(normalized)) {
    throw new Error(`Repository ${normalized} is not locally allowed. Run worker:repo:allow -- ${normalized} on this Mac.`);
  }
  return normalized;
}

export function sandboxArgs({ cwd, image = DEFAULT_SANDBOX_IMAGE, command, network = false, user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}` }) {
  if (!isAbsolute(cwd)) throw new Error('Sandbox workspace must be an absolute path');
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== 'string' || !part)) {
    throw new Error('Sandbox command must be a non-empty argv array');
  }
  if (!/^\d+:\d+$/.test(user)) throw new Error('Sandbox user must be numeric uid:gid');
  const [uid, gid] = user.split(':');
  return [
    'run', '--rm', '--init',
    '--network', network ? 'bridge' : 'none',
    '--read-only',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '512',
    '--memory', '4g',
    '--cpus', '2',
    '--tmpfs', `/tmp:rw,noexec,nosuid,nodev,size=512m,mode=1777,uid=${uid},gid=${gid}`,
    '--tmpfs', `/home/worker:rw,noexec,nosuid,nodev,size=128m,mode=0700,uid=${uid},gid=${gid}`,
    '--env', 'HOME=/home/worker',
    '--env', 'CI=true',
    '--env', 'NO_COLOR=1',
    '--volume', `${resolve(cwd)}:/workspace:rw`,
    '--workdir', '/workspace',
    '--user', user,
    image,
    ...command,
  ];
}

export function safeGitArgs({ cwd, gitDir }, args) {
  if (!isAbsolute(cwd) || !isAbsolute(gitDir)) throw new Error('Safe Git paths must be absolute');
  return [
    '--git-dir', gitDir,
    '--work-tree', cwd,
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    ...args,
  ];
}
