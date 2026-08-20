# Architecture v0.1

## Objective

The operator supplies one master goal. The control plane converts that goal into auditable work items and advances each item only when its current quality gate passes.

## Control plane

1. Lead accepts the master goal and repository target.
2. Architect creates bounded work items, acceptance criteria and risk notes.
3. Developer receives one ready work item and owns all product-code mutations for it.
4. Reviewer independently evaluates the diff against objective and architecture.
5. QA runs deterministic tests and records evidence.
6. Deployment integration publishes an approved revision.
7. Live Verifier checks the deployed product, not merely CI output.
8. The item becomes `done` only after live verification passes.

## Failure loops

- Review rejection -> implementing.
- QA failure -> implementing.
- Live verification failure -> implementing.
- External dependency -> blocked with evidence and an explicit unblock condition.
- Invalid state changes are rejected by the state machine.

## Provider isolation

Agent behavior depends on the `ModelProvider` interface rather than a provider SDK. OpenAI, Anthropic, Google and local-model adapters can therefore be selected per role without changing orchestration semantics.

## Safety model

The orchestrator separates reasoning authority from mutation authority. Reviewer and QA agents cannot mutate product code. Repository writes, deployment and destructive operations must pass capability-specific policy gates. Secrets must remain in the runtime secret store and never enter prompts, logs or repository content.

## Planned persistence

Runs, work items, evidence, model calls, token/cost usage, repository refs and deployment refs will be persisted behind storage interfaces. The first production adapter should use PostgreSQL.

## Planned integrations

- GitHub App: repository reads, branches, commits, PRs, checks.
- OpenAI adapter.
- Anthropic adapter.
- Google Gemini adapter.
- Vercel deployment/status adapter.
- Browser/live verification runner.
- Web dashboard and operator approval queue.
