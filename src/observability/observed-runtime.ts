import type { Agent } from "../agents/agent.js";
import type { ProjectRun, WorkItem } from "../core/types.js";
import type { EventStore, RuntimeEvent } from "../events/event-store.js";

export class ObservedRuntime {
  constructor(private readonly events: EventStore) {}

  async executeAgent(agent: Agent, run: ProjectRun, item: WorkItem): Promise<void> {
    await this.events.append({
      type: "agent.started",
      runId: run.id,
      workItemId: item.id,
      agent: agent.role,
      createdAt: new Date().toISOString(),
    });

    try {
      await agent.execute({ run, workItem: item, priorEvidence: item.evidence });
      await this.events.append({
        type: "agent.completed",
        runId: run.id,
        workItemId: item.id,
        agent: agent.role,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      await this.events.append({
        type: "agent.failed",
        runId: run.id,
        workItemId: item.id,
        agent: agent.role,
        detail: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
