import type { AgentRole, Evidence, WorkItem } from "../core/types.js";

export interface RunEvent {
  id: string;
  runId: string;
  type: "created" | "agent_started" | "agent_completed" | "gate_passed" | "gate_failed" | "cost_recorded";
  role?: AgentRole;
  workItemId?: string;
  summary: string;
  evidence?: Evidence[];
  createdAt: string;
}

export interface EventLog {
  append(event: RunEvent): Promise<void>;
  list(runId: string): Promise<RunEvent[]>;
}

export class InMemoryEventLog implements EventLog {
  private readonly events: RunEvent[] = [];

  async append(event: RunEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async list(runId: string): Promise<RunEvent[]> {
    return this.events.filter((event) => event.runId === runId);
  }
}

export function workItemSnapshot(item: WorkItem): string {
  return `${item.id}:${item.state}:${item.attempt}`;
}
