import type { ProjectRun } from "../core/types.js";

export interface RunStore {
  get(runId: string): Promise<ProjectRun | undefined>;
  save(run: ProjectRun): Promise<void>;
}

export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, ProjectRun>();

  async get(runId: string): Promise<ProjectRun | undefined> {
    return this.runs.get(runId);
  }

  async save(run: ProjectRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }
}
