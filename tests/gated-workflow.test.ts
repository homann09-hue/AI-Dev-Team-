import assert from "node:assert/strict";
import test from "node:test";
import type { Agent } from "../src/agents/agent.js";
import type { Evidence, ProjectRun, WorkItem } from "../src/core/types.js";
import { GatedWorkflow } from "../src/workflow/gated-workflow.js";

function fixture(): { run: ProjectRun; item: WorkItem } {
  const now = new Date().toISOString();
  const item: WorkItem = { id: "w1", title: "Implement", objective: "Ship", state: "implementing", acceptanceCriteria: ["tests pass"], attempt: 0, evidence: [] };
  return { run: { id: "r1", repository: "owner/repo", masterGoal: "ship", status: "active", workItems: [item], createdAt: now, updatedAt: now }, item };
}

function agent(role: Agent["role"], approved?: boolean): Agent {
  return {
    role,
    async execute() {
      const evidence: Evidence = { kind: role === "reviewer" ? "review" : role === "qa" ? "test" : "diff", summary: role, createdAt: new Date().toISOString() };
      return { summary: role, evidence: [evidence], ...(approved === undefined ? {} : { approved }) };
    },
  };
}

test("passes developer then deterministic tests then reviewer then qa", async () => {
  const { run, item } = fixture();
  const order: string[] = [];
  const developer: Agent = { role: "developer", async execute() { order.push("developer"); return { summary: "dev", evidence: [] }; } };
  const reviewer: Agent = { role: "reviewer", async execute() { order.push("reviewer"); return { summary: "review", evidence: [], approved: true }; } };
  const qa: Agent = { role: "qa", async execute() { order.push("qa"); return { summary: "qa", evidence: [], approved: true }; } };
  const workflow = new GatedWorkflow(developer, reviewer, qa, { async run() { order.push("tests"); return { kind: "test", summary: "green", createdAt: new Date().toISOString() }; } });
  const result = await workflow.execute(run, item);
  assert.equal(result.outcome, "qa_passed");
  assert.deepEqual(order, ["developer", "tests", "reviewer", "qa"]);
});

test("failed deterministic tests prevent reviewer and qa calls", async () => {
  const { run, item } = fixture();
  let reviewerCalls = 0;
  let qaCalls = 0;
  const reviewer: Agent = { role: "reviewer", async execute() { reviewerCalls++; return { summary: "review", evidence: [], approved: true }; } };
  const qa: Agent = { role: "qa", async execute() { qaCalls++; return { summary: "qa", evidence: [], approved: true }; } };
  const workflow = new GatedWorkflow(agent("developer"), reviewer, qa, { async run() { throw new Error("tests failed"); } });
  const result = await workflow.execute(run, item);
  assert.equal(result.outcome, "tests_failed");
  assert.equal(reviewerCalls, 0);
  assert.equal(qaCalls, 0);
});

test("review rejection prevents qa call", async () => {
  const { run, item } = fixture();
  let qaCalls = 0;
  const qa: Agent = { role: "qa", async execute() { qaCalls++; return { summary: "qa", evidence: [], approved: true }; } };
  const workflow = new GatedWorkflow(agent("developer"), agent("reviewer", false), qa, { async run() { return { kind: "test", summary: "green", createdAt: new Date().toISOString() }; } });
  const result = await workflow.execute(run, item);
  assert.equal(result.outcome, "review_rejected");
  assert.equal(qaCalls, 0);
});
