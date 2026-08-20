import type { AgentRole, Evidence, ProjectRun, WorkItem } from "../core/types.js";

export type RunEventType =
  | "run_created"
  | "agent_started"
  | "agent_completed"
  | "gate_passed"
  | "gate_failed"
  | "cost_recorded";

export interface RunEvent {
  id: string;
  runId: string;
  type: RunEventType;
  role?: AgentRole;
  workItemId?: string;
  summary: string;
  metadata?: Record<string, string | number>;
  createdAt: string;
}

export interface RunEventStore {
  append(event: RunEvent): Promise<void>;
  list(runId: string): Promise<RunEvent[]>;
}

export class InMemoryRunEventStore implements RunEventStore {
  private readonly events: RunEvent[] = [];

  async append(event: RunEvent): Promise<void> {
    this.events.push(event);
  }

  async list(runId: string): Promise<RunEvent[]> {
    return this.events.filter((event) => event.runId === runId);
  }
}

export class RunEventService {
  constructor(private readonly store: RunEventStore) {}

  async recordAgentStart(run: ProjectRun, item: WorkItem, role: AgentRole): Promise<void> {
    await this.store.append(this.event(run.id, "agent_started", role, item.id, `${role} started`));
  }

  async recordAgentComplete(run: ProjectRun, item: WorkItem, role: AgentRole, evidence: readonly Evidence[]): Promise<void> {
    await this.store.append(this.event(run.id, "agent_completed", role, item.id, `${role} completed`, { evidence: evidence.length }));
  }

  private event(runId: string, type: RunEventType, role: AgentRole, workItemId: string, summary: string, metadata?: Record<string, string | number>): RunEvent {
    return {
      id: crypto.randomUUID(),
      runId,
      type,
      role,
      workItemId,
      summary,
      ...(metadata ? { metadata } : {}),
      createdAt: new Date().toISOString(),
    };
  }
}
