# AI Dev Team Dashboard MVP

Frontend foundation for operating multi-agent development runs.

Implemented direction:

- Project creation flow
- Active runs overview
- Agent execution timeline
- Token and cost dashboard
- Gate status monitoring
- Evidence history

Architecture:

`Dashboard UI -> API Services -> Runtime -> Orchestrator -> Agents`

The frontend consumes API contracts and never bypasses orchestrator policies.
