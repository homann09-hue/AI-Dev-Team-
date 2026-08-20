# Token and Cost Efficiency

Token efficiency is a correctness requirement, not an optional optimization.

## Rules

1. Send the smallest context that can answer the current work item.
2. Never send an entire repository when targeted files/diffs are sufficient.
3. Pass compact structured evidence between agents instead of chat transcripts.
4. Prefer deterministic tools (compiler, tests, linters, parsers) over model calls.
5. Cache repository facts and invalidate them by commit/ref changes.
6. Do not repeat an analysis when its inputs have not changed.
7. Reviewer context defaults to objective + acceptance criteria + diff + relevant evidence.
8. QA context defaults to acceptance criteria + changed behavior + test evidence.
9. Live verification receives deployment target + acceptance criteria, not implementation history.
10. Enforce per-role output budgets and per-work-item retry limits.
11. Route routine tasks to the cheapest model that meets the required capability; escalate only on evidence of need.
12. Track input tokens, output tokens, estimated cost, provider/model and cache hits per call.
13. Truncate verbose logs before model ingestion and retain the full raw log outside the prompt path.
14. Parallelize only independent work that does not duplicate context or implementation.
15. Never use a model call merely to confirm a deterministic success signal.

## Default budgets

The runtime starts conservatively: reviewer/QA/live-verifier outputs are smaller than architecture/development outputs, evidence history is bounded, and a work item cannot loop indefinitely.

Budgets are policy values and can be tuned per project without changing agent code.
