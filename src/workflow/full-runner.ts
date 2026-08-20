import type { Agent } from "../agents/agent.js";
import type { Evidence, ProjectRun, WorkItem } from "../core/types.js";
import { Runtime } from "../runtime/runtime.js";
import type { RunStore } from "../storage/run-store.js";
import { GatedWorkflow, type DeterministicGate } from "./gated-workflow.js";

export interface DeploymentGate {
  run(run: ProjectRun, item: WorkItem): Promise<Evidence>;
}

export interface FullRunResult {
  run: ProjectRun;
  item: WorkItem;
  outcome: "done" | "blocked" | "failed";
}

export class FullRunExecutor {
  private readonly runtime: Runtime;
  private readonly gated: GatedWorkflow;

  constructor(
    private readonly store: RunStore,
    private readonly architect: Agent,
    developer: Agent,
    reviewer: Agent,
    qa: Agent,
    private readonly liveVerifier: Agent,
    deterministicGate: DeterministicGate,
    private readonly deploymentGate: DeploymentGate,
  ) {
    if (architect.role !== "architect") throw new Error("Architect agent required");
    if (liveVerifier.role !== "live_verifier") throw new Error("Live verifier agent required");
    this.runtime = new Runtime(store, [architect, developer, reviewer, qa, liveVerifier]);
    this.gated = new GatedWorkflow(developer, reviewer, qa, deterministicGate);
  }

  async execute(repository: string, masterGoal: string): Promise<FullRunResult> {
    const run = await this.runtime.createRun(repository, masterGoal);
    const item = await this.runtime.addWorkItem(
      run.id,
      "Execute master goal",
      masterGoal,
      ["Master goal implemented, tested, reviewed, deployed and live-verified"],
    );
    await this.runtime.transition(run.id, item.id, "planning");
    return this.executeExisting(run.id, item.id);
  }

  async executeExisting(runId: string, itemId: string): Promise<FullRunResult> {
    let current = await this.require(runId, itemId);
    if (current.item.state !== "planning") {
      throw new Error(`Existing full run must be in planning state, got ${current.item.state}`);
    }

    const planResult = await this.architect.execute({ run: current.run, workItem: current.item, priorEvidence: current.item.evidence });
    current.item.evidence.push(...planResult.evidence);
    current.item.attempt += 1;
    await this.persist(current.run);
    if (planResult.blocker || !planResult.evidence.some((evidence) => evidence.kind === "plan")) {
      await this.runtime.transition(runId, itemId, "blocked");
      return this.finish(runId, itemId, "blocked");
    }

    await this.runtime.transition(runId, itemId, "ready");
    await this.runtime.transition(runId, itemId, "implementing");
    current = await this.require(runId, itemId);

    const gatedResult = await this.gated.execute(current.run, current.item);
    await this.persist(current.run);
    if (gatedResult.outcome !== "qa_passed") {
      await this.runtime.transition(runId, itemId, "blocked");
      return this.finish(runId, itemId, gatedResult.outcome === "developer_blocked" ? "blocked" : "failed");
    }

    await this.runtime.transition(runId, itemId, "review");
    await this.runtime.transition(runId, itemId, "qa");
    await this.runtime.transition(runId, itemId, "deploying");
    current = await this.require(runId, itemId);

    try {
      const deploymentEvidence = await this.deploymentGate.run(current.run, current.item);
      current.item.evidence.push(deploymentEvidence);
      await this.persist(current.run);
    } catch (error) {
      current.item.evidence.push({
        kind: "deployment",
        summary: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
      });
      await this.persist(current.run);
      await this.runtime.transition(runId, itemId, "failed");
      return this.finish(runId, itemId, "failed");
    }

    await this.runtime.transition(runId, itemId, "live_verification");
    current = await this.require(runId, itemId);
    const liveResult = await this.liveVerifier.execute({ run: current.run, workItem: current.item, priorEvidence: current.item.evidence });
    current.item.evidence.push(...liveResult.evidence);
    current.item.attempt += 1;
    await this.persist(current.run);

    if (liveResult.blocker || !liveResult.evidence.some((evidence) => evidence.kind === "live_check")) {
      await this.runtime.transition(runId, itemId, "blocked");
      return this.finish(runId, itemId, "blocked");
    }

    await this.runtime.transition(runId, itemId, "done");
    return this.finish(runId, itemId, "done");
  }

  private async require(runId: string, itemId: string): Promise<{ run: ProjectRun; item: WorkItem }> {
    const run = await this.store.get(runId);
    if (!run) throw new Error(`Unknown project run: ${runId}`);
    const item = run.workItems.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error(`Unknown work item: ${itemId}`);
    return { run, item };
  }

  private async persist(run: ProjectRun): Promise<void> {
    run.updatedAt = new Date().toISOString();
    await this.store.save(run);
  }

  private async finish(runId: string, itemId: string, outcome: FullRunResult["outcome"]): Promise<FullRunResult> {
    const current = await this.require(runId, itemId);
    current.run.status = outcome === "done" ? "completed" : outcome === "failed" ? "failed" : "active";
    await this.persist(current.run);
    return { ...current, outcome };
  }
}
