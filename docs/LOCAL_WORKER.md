# Personal Mac Worker

The dashboard stores user-scoped jobs in Supabase. Claude Code, Codex and Grok run only on the user's Mac with their existing subscription logins. No model API key is stored in Vercel or Supabase.

## First setup

Install and start Docker Desktop, then pair the worker with the one-time code shown by the dashboard:

```bash
npm install
npm run build
npm run worker:pair -- 16CHARCODE
npm run worker:repo:allow -- homann09-hue/AI-Dev-Team- https://your-live-dashboard.example/health
npm run worker:doctor
npm run worker:start
```

The worker credential and local repository allowlist are stored under `~/.ai-dev-team/` with file mode `0600`.

Pairing codes are one-time, 64-bit random values and expire after 10 minutes. Generate them from **Worker credentials → Pair new** in the dashboard. The endpoint is rate-limited server-side.

## Rotate or revoke a worker

The dashboard never exposes the worker token. Use **Rotate** to create a 10-minute one-time rotation code, then run the displayed command on the paired Mac:

```bash
npm run worker:rotate -- 16CHARCODE
```

The new token is written atomically only after the server accepts it; the previous token becomes invalid immediately. **Revoke** invalidates the credential, removes its online presence and safely requeues any job it held. Failed credential attempts are rate-limited and counted per worker for the dashboard audit indicator.

## Security boundary

The worker treats every repository and generated change as untrusted. Repository-defined install, test, typecheck, lint and build commands never execute directly on macOS. They run in a disposable Docker or Podman container with:

- no host credentials, Docker socket, SSH directory or user configuration mounts;
- a read-only container filesystem and only the current attempt mounted read/write;
- all Linux capabilities dropped and `no-new-privileges` enabled;
- CPU, memory and process limits;
- lifecycle scripts disabled during dependency installation;
- networking disabled while repository-defined QA scripts execute.

If the configured container engine is unavailable, the worker fails closed. Podman can be selected with `AI_DEV_TEAM_SANDBOX_ENGINE=podman`.

## Local repository authorization

Cloud input cannot authorize access to GitHub. Each repository must also be explicitly allowed on the Mac:

```bash
npm run worker:repo:allow -- owner/repository https://production.example/health
npm run worker:repo:list
npm run worker:repo:revoke -- owner/repository
```

A missing, malformed or non-matching allowlist blocks the job before clone, checkout or agent execution. The HTTPS live URL is local policy: cloud input and repository content cannot redirect the worker's production probe.

## Clean attempts

Every queue attempt starts from a brand-new shallow clone and receives a unique `ai-dev-team/<run>-a<attempt>` branch. Failed worktrees are never reused implicitly. Previous attempt directories remain available for audit, while partial changes cannot contaminate a retry.

## Successful run

1. Claude creates a read-only implementation plan.
2. Only Codex edits the dedicated checkout in its workspace-write sandbox.
3. Deterministic QA detects locked Node/Next.js, Python/uv, Go, Rust, Maven or locked Gradle projects and runs their native gates in the hardened container boundary. Unknown or unlocked projects are explicit blockers.
4. Grok independently reviews the uncommitted diff without write permission.
5. The worker commits, pushes an attempt-specific branch and creates a pull request.
6. A real pull request is mandatory. The worker waits for all GitHub Actions checks, requires a successful deployment status attached to the PR head, and then requires an HTTP 2xx response from the Mac-local live URL. Any missing or failed gate prevents completion.

## Optional environment variables

```text
AI_DEV_TEAM_POLL_MS=5000
AI_DEV_TEAM_WORKSPACE_ROOT=~/.ai-dev-team/workspaces
AI_DEV_TEAM_CONFIG_FILE=~/.ai-dev-team/config.json
AI_DEV_TEAM_SANDBOX_ENGINE=docker
AI_DEV_TEAM_SANDBOX_IMAGE=node:22-bookworm-slim
```

Do not place GitHub, Supabase, ChatGPT, Claude or Grok credentials in repository files or sandbox variables. Provider CLIs read their local subscription sessions only in the host-side agent stages.
