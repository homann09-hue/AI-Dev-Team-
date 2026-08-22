# Architecture

## Runtime

The Next.js dashboard authenticates the operator with Supabase and creates user-scoped `agent_jobs`. A paired Mac worker claims jobs with a revocable, hashed bearer credential. Model sessions and repository access remain on that Mac.

```text
Dashboard → Supabase Auth/RLS + Queue → Paired Mac worker
                                         ├─ Claude: primary plan
                                         ├─ Grok: limit-only plan fallback
                                         ├─ Codex: sole code writer
                                         ├─ containerized deterministic QA
                                         ├─ Grok: independent review
                                         └─ PR → GitHub CI → deployment → live probe
```

## Authority boundaries

- Claude and Grok planning run read-only. Claude failures fall back only on explicit session/rate-limit evidence; other failures stop the job.
- Codex is the only model with a writable checkout. It cannot access protected Git metadata.
- Grok review receives status/diff evidence and has no mutation path.
- Repository scripts execute only through the hardened container QA runner.
- The dashboard can create one-time pairing/rotation codes and revoke workers, but cannot read token hashes.

## Workspace invariant

Each attempt creates a new shallow clone and a unique branch. Git metadata is placed beside, not inside, the model-writable checkout. Host Git operations disable hooks and global/system configuration. QA runs against a separate copy, so build artifacts cannot enter the developer diff. Any unexpected dirty state before work fails the attempt.

## Persistence and credential lifecycle

Supabase stores RLS-scoped runs, jobs and worker presence. Worker credentials store SHA-256 token hashes only. Pairing/rotation codes are 64-bit random, single-use and expire after ten minutes. Invalid bearer attempts and worker operations are rate-limited; audit events are private. Revocation immediately invalidates the token, removes presence and requeues a claimed job.

## Completion invariant

The worker creates and re-reads a pull request, checks its head/base/exact SHA, waits until all GitHub Actions workflows succeed, resolves a successful GitHub deployment for that exact SHA, validates the environment host against local policy, and performs an HTTP 2xx health probe. Any missing evidence blocks `done`.

## Failure behavior

- Planning/provider failure: attempt fails with bounded evidence.
- Deterministic QA or review rejection: no delivery occurs.
- PR/CI/deployment/live failure: work does not complete.
- Stale/revoked worker: running job is safely requeued.
- Unknown framework or missing lockfile: deterministic QA fails closed.
