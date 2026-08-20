import type { AgentRole } from "../core/types.js";

export type RuntimeEventType =
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "agent_started"
  | "agent_finished"
  | "agent_failed"
  | "model_cost";

export interface RuntimeEvent {
  type: RuntimeEventType;
  runId: string;
  createdAt: string;
  id?: string;
  workItemId?: string;
  agent?: AgentRole;
  role?: AgentRole;
  detail?: string;
  summary?: string;
}

export type RunEvent = RuntimeEvent;

export interface EventStore {
  append(event: RuntimeEvent): Promise<void>;
  list?(runId: string): Promise<RuntimeEvent[]>;
}

export class InMemoryEventStore implements EventStore {
  private readonly events: RuntimeEvent[] = [];

  async append(event: RuntimeEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async list(runId: string): Promise<RuntimeEvent[]> {
    return this.events.filter((event) => event.runId === runId).map((event) => structuredClone(event));
  }
}
