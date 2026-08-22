# AI Dev Team

A single-user development control plane that turns one goal into planned, implemented, reviewed, tested, delivered and live-verified work.

## Enforced workflow

`GOAL → PLAN → IMPLEMENT → DETERMINISTIC_QA → REVIEW → PR → GITHUB_CI → DEPLOYMENT → LIVE_VERIFY → DONE`

Every gate records evidence and fails closed. A failed attempt starts from a fresh clone and an attempt-specific branch; uncommitted state is never reused.

## Fixed provider roles

- **Claude Code** is the primary read-only architect.
- **Grok** is the planning fallback only when Claude reports an explicit subscription session/rate limit, and is the independent read-only reviewer.
- **Codex** is the only model allowed to write product code.
- **Deterministic QA** runs repository checks in a disposable Docker/Podman container.
- **GitHub Actions** and a successful deployment attached to the exact PR head SHA are hard gates.

Authentication, provider, or arbitrary Claude errors do not trigger fallback. Grok fallback is invoked in `/plan` mode and receives no write-capable Codex flags.

## Local worker setup

The dashboard stores user-scoped jobs in Supabase. Provider CLIs use their existing local subscription sessions; model API keys are not stored in Supabase or Vercel.

Install and start Docker Desktop, then use **Worker credentials → Pair new** in the dashboard:

```bash
npm ci
npm run build
npm run worker:pair -- 16CHARCODE
npm run worker:repo:allow -- homann09-hue/AI-Dev-Team- https://production.example/api/health
npm run worker:doctor
npm run worker:start
```

The worker credential and explicit repository/live-URL allowlist are local files under `~/.ai-dev-team/` with mode `0600`. Pairing and rotation codes are single-use and expire after ten minutes. Rotation and immediate revocation are available in the dashboard.

See [Local worker operations](docs/LOCAL_WORKER.md) for credential lifecycle, sandbox guarantees, QA coverage and delivery gates.
The current control inventory and explicitly accepted exceptions are recorded in [Security posture](docs/SECURITY.md).

## Security boundary

Repository content and model output are untrusted. Repository-defined install/build/test commands never run directly on macOS. They run with a read-only root filesystem, dropped capabilities, no host credentials or sockets, bounded CPU/memory/PIDs, and no network during check execution. Dependency installation uses the network only inside the disposable container and ignores npm lifecycle scripts.

Git metadata is stored outside the model-writable checkout. Hooks and global/system Git configuration are disabled. A locally configured repository allowlist is checked before cloning or invoking any model.

Supported deterministic QA includes locked npm/pnpm/yarn projects and Next.js, Python/uv, Go, Rust, Maven and locked Gradle projects. Unknown or unlocked project types fail closed.

## Delivery invariant

Completion requires all of the following for the exact pushed commit:

1. A real pull request with the expected head and base.
2. Every GitHub Actions workflow completed successfully.
3. A successful GitHub deployment object for the exact head SHA with an environment URL.
4. The deployment host matches the Mac-local live policy.
5. The configured health path returns HTTP 2xx from the Mac.

A branch push, preview URL, or green local build alone is not completion.

## Repository layout

- `scripts/paired-worker.mjs` — active local subscription worker.
- `scripts/lib/worker-security.mjs` — local allowlist, protected Git and container boundary.
- `scripts/lib/qa-policy.mjs` — language/framework QA detection.
- `scripts/lib/delivery-gates.mjs` — PR, CI, deployment and live gates.
- `apps/dashboard` — authenticated command center and credential management.
- `supabase/migrations` — user-scoped queue and hardened worker credentials.
- `src` — provider-independent orchestration/domain components.
- `docs` — operating and architecture references.

## Production deployment

`ai-dev-team-live` is the single Git-connected Vercel project. Production is accepted only through the exact-SHA deployment and live-health gates above; provider limits or failed previews remain blockers.
