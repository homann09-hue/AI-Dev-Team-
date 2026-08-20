# API Design v0.1

## Project Control

Create a project run from a single master goal.

Input:
- target repository
- master goal

Output:
- run id

## Dashboard

The dashboard API exposes aggregated runtime state:

- active runs
- work item progress
- agent activity
- gate status
- token usage
- estimated cost
- latest evidence

## Design rules

- API never bypasses orchestration policies.
- Dashboard reads aggregated state only.
- Destructive operations remain behind capability checks.
- Provider secrets never enter API responses.
