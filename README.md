# AI Dev Team

A provider-independent multi-agent development control plane for turning one master goal into planned, implemented, reviewed, tested, deployed and verified work.

## Core workflow

`GOAL -> PLAN -> IMPLEMENT -> REVIEW -> QA -> DEPLOY -> LIVE_VERIFY -> DONE`

A failed gate returns the work item to the responsible agent with evidence. Only the developer role may mutate product code for an active work item; reviewer and QA roles are read-only by policy.

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
- `docs` — architecture and operating rules.

## Status

Foundation v0.1 is being built on `feat/ai-dev-team-foundation`.
