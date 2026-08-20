# AI Dev Team

A provider-independent multi-agent development control plane for turning one master goal into planned, implemented, reviewed, tested, deployed and verified work.

## Core workflow

`GOAL -> PLAN -> IMPLEMENT -> REVIEW -> QA -> DEPLOY -> LIVE_VERIFY -> DONE`

A failed gate returns the work item to the responsible agent with evidence. Only the developer role may mutate product code for an active work item; reviewer and QA roles are read-only by policy.

## Personal Mac worker

The personal mode uses the existing signed-in desktop subscriptions instead of model API keys:

- Claude Code -> architecture / planning
- Codex -> implementation
- local deterministic tests -> QA gate
- Grok Build -> independent review
- GitHub CLI -> branch, push and pull request delivery
- Supabase -> authenticated job queue, run state and worker presence

No ChatGPT, Anthropic or xAI API key is required for this mode.

### First-time worker login

Update the repository, then request a Supabase login link:

```bash
cd ~/AI-Dev-Team-
git switch main
git pull --ff-only
npm install
npm run worker:login -- your@email.example
```

Supabase's default free email template sends a confirmation / magic link rather than a numeric OTP. When the terminal says `Magic link:`, **do not open the email link first**. Copy the complete hyperlink behind the email button/link and paste that URL into the terminal. The worker validates that the URL belongs to this Supabase project, consumes it itself, validates the resulting session and stores the refreshable session locally at `~/.ai-dev-team/session.json` with mode `0600`.

A magic link is one-time-use. If it was already opened or expired, run `worker:login` again and use the fresh link.

Then verify local dependencies and subscription logins:

```bash
npm run worker:doctor
```

Start the worker:

```bash
npm run worker:start
```

The Mac must remain online while jobs are being executed. Queued jobs stay in Supabase when the worker is offline.

## Initial roles

- Lead / Orchestrator — decomposes the master goal and owns state transitions.
- Architect — defines solution constraints, acceptance criteria and Definition of Done.
- Developer — implements exactly one approved work item.
- Reviewer — independently reviews changes and rejects defects.
- QA — executes automated and integration gates.
- Live Verifier — validates the deployed behavior before completion.

## Design principles

- One master goal from the operator.
- One active implementation unit at a time by default.
- Provider-independent model adapters.
- Explicit state machine; no implicit agent hand-offs.
- Evidence-backed gates before progression.
- Git branches/PRs isolate changes.
- Full audit trail for prompts, outputs, decisions, tests and costs.
- Human approval gates remain available for destructive or high-risk actions.

## Repository layout

- `src/core` — domain model and state machine.
- `src/agents` — agent role contracts.
- `src/providers` — LLM provider abstraction.
- `src/orchestrator` — workflow coordinator.
- `scripts/personal-worker.mjs` — personal Mac subscription worker.
- `supabase/migrations` — persistent run and worker queue schema.
- `docs` — architecture and operating rules.

## Status

Personal Mac subscription worker is the active execution path for single-user operation.
