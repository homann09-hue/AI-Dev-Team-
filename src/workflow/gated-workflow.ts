import type { Agent } from "../agents/agent.js";
import type { Evidence, ProjectRun, WorkItem } from "../core/types.js";

export interface DeterministicGate {
  run(run: ProjectRun, item: WorkItem): Promise<Evidence>;
}

export interface GatedWorkflowResult {
  item: WorkItem;
  outcome: "qa_passed" | "developer_blocked" | "tests_failed" | "review_rejected" | "qa_rejected";
}

export class GatedWorkflow {
  constructor(
    private readonly developer: Agent,
    private readonly reviewer: Agent,
    private readonly qa: Agent,
    private readonly deterministicGate: DeterministicGate,
  ) {
    if (developer.role !== "developer") throw new Error("Developer agent required");
    if (reviewer.role !== "reviewer") throw new Error("Reviewer agent required");
    if (qa.role !== "qa") throw new Error("QA agent required");
  }

  async execute(run: ProjectRun, item: WorkItem): Promise<GatedWorkflowResult> {
    const developerResult = await this.developer.execute({ run, workItem: item, priorEvidence: item.evidence });
    item.evidence.push(...developerResult.evidence);
    item.attempt += 1;
    if (developerResult.blocker) return { item, outcome: "developer_blocked" };

    try {
      const testEvidence = await this.deterministicGate.run(run, item);
      item.evidence.push(testEvidence);
    } catch (error) {
      item.evidence.push({ kind: "test", summary: error instanceof Error ? error.message : String(error), createdAt: new Date().toISOString() });
      return { item, outcome: "tests_failed" };
    }

    const reviewResult = await this.reviewer.execute({ run, workItem: item, priorEvidence: item.evidence });
    item.evidence.push(...reviewResult.evidence);
    if (reviewResult.approved !== true) return { item, outcome: "review_rejected" };

    const qaResult = await this.qa.execute({ run, workItem: item, priorEvidence: item.evidence });
    item.evidence.push(...qaResult.evidence);
    if (qaResult.approved !== true) return { item, outcome: "qa_rejected" };

    return { item, outcome: "qa_passed" };
  }
}
