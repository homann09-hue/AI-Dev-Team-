import type { Agent } from "../agents/agent.js";
import type { ProjectRun, WorkItem, WorkState } from "../core/types.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import type { RunStore } from "../storage/run-store.js";

export class Runtime {
  private readonly orchestrator = new Orchestrator();

  constructor(private readonly store: RunStore, agents: readonly Agent[]) {
    for (const agent of agents) this.orchestrator.register(agent);
  }

  async createRun(repository: string, masterGoal: string): Promise<ProjectRun> {
    const now = new Date().toISOString();
    const run: ProjectRun = {
      id: crypto.randomUUID(),
      repository,
      masterGoal,
      status: "active",
      workItems: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.save(run);
    return run;
  }

  async addWorkItem(runId: string, title: string, objective: string, acceptanceCriteria: string[]): Promise<WorkItem> {
    const run = await this.requireRun(runId);
    const item: WorkItem = {
      id: crypto.randomUUID(),
      title,
      objective,
      state: "todo",
      acceptanceCriteria,
      attempt: 0,
      evidence: [],
    };
    run.workItems.push(item);
    run.updatedAt = new Date().toISOString();
    await this.store.save(run);
    return item;
  }

  async transition(runId: string, workItemId: string, next: WorkState): Promise<WorkItem> {
    const run = await this.requireRun(runId);
    const index = run.workItems.findIndex((item) => item.id === workItemId);
    if (index < 0) throw new Error(`Unknown work item: ${workItemId}`);
    const current = run.workItems[index];
    if (!current) throw new Error(`Unknown work item: ${workItemId}`);
    const transitioned = this.orchestrator.transition(current, next);
    run.workItems[index] = transitioned;
    run.updatedAt = new Date().toISOString();
    await this.store.save(run);
    return transitioned;
  }

  async execute(runId: string, workItemId: string): Promise<WorkItem> {
    const run = await this.requireRun(runId);
    const item = run.workItems.find((candidate) => candidate.id === workItemId);
    if (!item) throw new Error(`Unknown work item: ${workItemId}`);
    const result = await this.orchestrator.executeCurrent(run, item);
    item.evidence.push(...result.evidence);
    item.attempt += 1;
    run.updatedAt = new Date().toISOString();
    await this.store.save(run);
    return item;
  }

  private async requireRun(runId: string): Promise<ProjectRun> {
    const run = await this.store.get(runId);
    if (!run) throw new Error(`Unknown project run: ${runId}`);
    return run;
  }
}
