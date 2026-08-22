import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

async function exists(path) { try { await stat(path); return true; } catch { return false; } }

function nodePlan(manifest, lockfile) {
  const scripts = manifest.scripts ?? {};
  const checks = ['lint', 'typecheck', 'test', 'build']
    .filter((name) => typeof scripts[name] === 'string' && scripts[name].trim())
    .map((name) => ({ name: `node:${name}`, command: ['npm', 'run', name] }));
  const isNext = Boolean(manifest.dependencies?.next || manifest.devDependencies?.next);
  if (isNext && (!scripts.typecheck || !scripts.build)) throw new Error('Next.js QA requires typecheck and build scripts');
  if (checks.length === 0) throw new Error('Node project has no lint, typecheck, test or build script; deterministic QA cannot be proven');

  if (lockfile === 'package-lock.json') return {
    kind: isNext ? 'nextjs' : 'node', image: 'node:22-bookworm-slim',
    install: [['npm', 'ci', '--ignore-scripts']], checks,
  };
  if (lockfile === 'pnpm-lock.yaml') return {
    kind: isNext ? 'nextjs-pnpm' : 'node-pnpm', image: 'node:22-bookworm-slim',
    install: [['corepack', 'pnpm', 'install', '--frozen-lockfile', '--ignore-scripts']],
    checks: checks.map((check) => ({ ...check, command: ['corepack', 'pnpm', 'run', check.name.split(':')[1]] })),
  };
  return {
    kind: isNext ? 'nextjs-yarn' : 'node-yarn', image: 'node:22-bookworm-slim',
    install: [['corepack', 'yarn', 'install', '--immutable', '--mode=skip-builds']],
    checks: checks.map((check) => ({ ...check, command: ['corepack', 'yarn', 'run', check.name.split(':')[1]] })),
  };
}

async function detectAt(cwd) {
  const plans = [];
  if (await exists(join(cwd, 'package.json'))) {
    const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
    const locks = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
    const lockfile = (await Promise.all(locks.map(async (name) => [name, await exists(join(cwd, name))]))).find(([, found]) => found)?.[0];
    if (!lockfile) throw new Error('Node project has no supported lockfile; refusing non-deterministic dependency installation');
    plans.push(nodePlan(manifest, lockfile));
  }

  if (await exists(join(cwd, 'pyproject.toml'))) {
    if (!(await exists(join(cwd, 'uv.lock')))) throw new Error('Python project requires uv.lock for deterministic QA');
    const pyproject = await readFile(join(cwd, 'pyproject.toml'), 'utf8');
    const hasTests = await exists(join(cwd, 'tests')) || /pytest/i.test(pyproject);
    if (!hasTests) throw new Error('Python project has no pytest configuration or tests directory');
    plans.push({
      kind: 'python-uv', image: 'ghcr.io/astral-sh/uv:python3.12-bookworm-slim',
      install: [['uv', 'sync', '--frozen', '--no-install-project']],
      checks: [
        { name: 'python:compile', command: ['uv', 'run', '--frozen', 'python', '-m', 'compileall', '-q', '.'] },
        { name: 'python:pytest', command: ['uv', 'run', '--frozen', 'pytest'] },
      ],
      env: { UV_CACHE_DIR: '/workspace/.ai-dev-team-cache/uv' },
    });
  }

  if (await exists(join(cwd, 'go.mod'))) plans.push({
    kind: 'go', image: 'golang:1.24-bookworm', install: [['go', 'mod', 'download']],
    checks: [
      { name: 'go:test', command: ['go', 'test', './...'] },
      { name: 'go:vet', command: ['go', 'vet', './...'] },
    ],
    env: { GOMODCACHE: '/workspace/.ai-dev-team-cache/go/pkg/mod', GOCACHE: '/workspace/.ai-dev-team-cache/go/build' },
  });

  if (await exists(join(cwd, 'Cargo.toml'))) {
    if (!(await exists(join(cwd, 'Cargo.lock')))) throw new Error('Rust project requires Cargo.lock for deterministic QA');
    plans.push({
      kind: 'rust', image: 'rust:1.86-bookworm', install: [['cargo', 'fetch', '--locked']],
      checks: [
        { name: 'rust:test', command: ['cargo', 'test', '--locked', '--all-targets'] },
        { name: 'rust:check', command: ['cargo', 'check', '--locked', '--all-targets'] },
      ],
      env: { CARGO_HOME: '/workspace/.ai-dev-team-cache/cargo', CARGO_TARGET_DIR: '/workspace/.ai-dev-team-cache/rust-target' },
    });
  }

  if (await exists(join(cwd, 'pom.xml'))) plans.push({
    kind: 'maven', image: 'maven:3.9-eclipse-temurin-21',
    install: [['mvn', '-B', '-Dmaven.repo.local=/workspace/.ai-dev-team-cache/maven', 'dependency:go-offline']],
    checks: [{ name: 'maven:verify', command: ['mvn', '-B', '-o', '-Dmaven.repo.local=/workspace/.ai-dev-team-cache/maven', 'verify'] }],
  });

  const hasGradle = await exists(join(cwd, 'build.gradle')) || await exists(join(cwd, 'build.gradle.kts'));
  if (hasGradle) {
    const locked = await exists(join(cwd, 'gradle.lockfile')) || await exists(join(cwd, 'gradle', 'dependency-locks'));
    if (!locked) throw new Error('Gradle project requires dependency locking for deterministic QA');
    plans.push({
      kind: 'gradle', image: 'gradle:8.14-jdk21', install: [['gradle', '--no-daemon', 'dependencies']],
      checks: [{ name: 'gradle:build', command: ['gradle', '--offline', '--no-daemon', 'test', 'build'] }],
      env: { GRADLE_USER_HOME: '/workspace/.ai-dev-team-cache/gradle' },
    });
  }

  return plans;
}

const IGNORED_DIRECTORIES = new Set(['.git', '.next', '.venv', '.ai-dev-team-cache', 'dist', 'node_modules', 'target', 'vendor']);
const PROJECT_MARKERS = new Set(['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'build.gradle.kts']);

async function discoverProjectDirectories(root, directory = root, depth = 0, found = new Set()) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && PROJECT_MARKERS.has(entry.name))) found.add(directory);
  if (depth >= 3) return found;
  for (const entry of entries) {
    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
      await discoverProjectDirectories(root, join(directory, entry.name), depth + 1, found);
    }
  }
  return found;
}

export async function detectQaPlans(cwd) {
  const directories = [...await discoverProjectDirectories(cwd)].sort();
  const plans = [];
  for (const directory of directories) {
    const workdir = relative(cwd, directory).replaceAll('\\', '/') || '.';
    try {
      plans.push(...(await detectAt(directory)).map((plan) => ({ ...plan, workdir })));
    } catch (error) {
      throw new Error(`${workdir}: ${error.message}`);
    }
  }
  if (plans.length === 0) throw new Error('Unsupported project: deterministic QA policy recognizes Node, Next.js, Python/uv, Go, Rust, Maven and locked Gradle projects');
  return plans;
}
