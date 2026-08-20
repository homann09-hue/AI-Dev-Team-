# Personal Mac Worker

The dashboard stores user-scoped jobs in Supabase. Codex, Claude Code and Grok Build run only on the user's Mac and use the existing subscription logins already present there. No model API key is stored in Vercel or Supabase.

## First setup

```bash
npm install
npm run build
npm run worker:login -- your@email@example.com
npm run worker:doctor
npm run worker:start
```

The email must be the same Supabase account used in the dashboard. The OTP login creates a local session at `~/.ai-dev-team/session.json` with file mode `0600`.

## Successful run

1. Claude Code creates a read-only implementation plan.
2. Codex edits the dedicated checkout with workspace-write sandboxing and automatic review.
3. The worker runs the repository's deterministic test command.
4. Grok independently reviews the uncommitted diff without edit/commit/push permission.
5. The worker commits, pushes an `ai-dev-team/<run>` branch and creates a PR when GitHub CLI is available.
6. The remote branch is verified. When `AI_DEV_TEAM_LIVE_URL` is configured, the live URL must also return a successful HTTP response.

A normal successful run uses one Claude planning call, one Codex implementation call and one Grok review call. Deterministic QA does not consume model tokens.

## Optional environment variables

```text
AI_DEV_TEAM_TEST_COMMAND=npm test
AI_DEV_TEAM_DEPLOY_COMMAND=npm run deploy
AI_DEV_TEAM_LIVE_URL=https://example.vercel.app
AI_DEV_TEAM_CLAUDE_MODEL=<optional>
AI_DEV_TEAM_CODEX_MODEL=<optional>
AI_DEV_TEAM_GROK_MODEL=<optional>
AI_DEV_TEAM_POLL_MS=5000
AI_DEV_TEAM_WORKSPACE_ROOT=~/.ai-dev-team/workspaces
```

Do not place ChatGPT, Claude or Grok credentials in these variables. Their CLIs read their own local subscription sessions.
