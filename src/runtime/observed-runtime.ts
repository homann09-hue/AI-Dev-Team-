import type { Agent } from "../agents/agent.js";
import type { ProjectRun, WorkItem } from "../core/types.js";
import type { TelemetrySink } from "../telemetry/model-telemetry.js";
import type { RunStore } from "../storage/run-store.js";
import type { EventStore, RunEvent } from "../events/event-store.js";
import { Runtime } from "./runtime.js";

export class ObservedRuntime extends Runtime {
  constructor(
    private readonly eventStore: EventStore,
    private readonly telemetry: TelemetrySink,
    store: RunStore,
    agents: readonly Agent[],
  ) {
    super(store, agents);
  }

  async recordEvent(event: RunEvent): Promise<void> {
    await this.eventStore.append(event);
  }

  async recordModelCost(runId: string, summary: string): Promise<void> {
    await this.eventStore.append({
      id: crypto.randomUUID(),
      runId,
      type: "model_cost",
      summary,
      createdAt: new Date().toISOString(),
    });
  }

  async executeObserved(run: ProjectRun, item: WorkItem): Promise<WorkItem> {
    await this.eventStore.append({
      id: crypto.randomUUID(),
      runId: run.id,
      type: "agent_started",
      summary: item.title,
      createdAt: new Date().toISOString(),
    });

    try {
      const result = await this.execute(run.id, item.id);
      await this.eventStore.append({
        id: crypto.randomUUID(),
        runId: run.id,
        type: "agent_finished",
        summary: item.title,
        createdAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      await this.eventStore.append({
        id: crypto.randomUUID(),
        runId: run.id,
        type: "agent_failed",
        summary: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
