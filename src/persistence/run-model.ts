import type { AgentRole, Evidence, ProjectRun, WorkItem } from "../core/types.js";

export interface StoredRun {
  id: string;
  repository: string;
  masterGoal: string;
  status: ProjectRun["status"];
  createdAt: string;
  updatedAt: string;
}

export interface StoredAgentExecution {
  id: string;
  runId: string;
  workItemId: string;
  role: AgentRole;
  summary: string;
  evidence: Evidence[];
  createdAt: string;
}

export interface RunRepository {
  saveRun(run: StoredRun): Promise<void>;
  saveExecution(execution: StoredAgentExecution): Promise<void>;
  getRun(id: string): Promise<StoredRun | undefined>;
}

export class InMemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, StoredRun>();
  private readonly executions = new Map<string, StoredAgentExecution>();

  async saveRun(run: StoredRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async saveExecution(execution: StoredAgentExecution): Promise<void> {
    this.executions.set(execution.id, structuredClone(execution));
  }

  async getRun(id: string): Promise<StoredRun | undefined> {
    return this.runs.get(id);
  }
}

export function toStoredRun(run: ProjectRun): StoredRun {
  return {
    id: run.id,
    repository: run.repository,
    masterGoal: run.masterGoal,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function createExecution(run: ProjectRun, item: WorkItem, role: AgentRole, summary: string, evidence: Evidence[]): StoredAgentExecution {
  return {
    id: crypto.randomUUID(),
    runId: run.id,
    workItemId: item.id,
    role,
    summary,
    evidence,
    createdAt: new Date().toISOString(),
  };
}
