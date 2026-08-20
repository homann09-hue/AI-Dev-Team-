#!/usr/bin/env node

if (!process.env.AI_DEV_TEAM_TEST_COMMAND?.trim()) {
  process.env.AI_DEV_TEAM_TEST_COMMAND = [
    "if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile && pnpm test",
    "elif [ -f yarn.lock ]; then yarn install --frozen-lockfile && yarn test",
    "elif [ -f package-lock.json ]; then npm ci && npm test",
    "elif [ -f package.json ]; then npm install && npm test",
    "elif [ -f pyproject.toml ]; then python3 -m pytest",
    "elif [ -f go.mod ]; then go test ./...",
    "elif [ -f Cargo.toml ]; then cargo test",
    "else git diff --check; fi",
  ].join("; ");
}

if (process.argv[2] === "login") {
  process.argv.splice(2, 1);
  await import("./magic-link-login.mjs");
} else {
  await import("./personal-worker.mjs");
}
