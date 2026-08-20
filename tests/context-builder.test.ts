import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentContext } from "../src/agents/context-builder.js";
import type { Evidence, ProjectRun, WorkItem } from "../src/core/types.js";
import { DEFAULT_EFFICIENCY_POLICY } from "../src/efficiency/policy.js";

const now = new Date().toISOString();
const item: WorkItem = { id: "w", title: "x", objective: "y", state: "review", acceptanceCriteria: ["ok"], attempt: 1, evidence: [] };
const run: ProjectRun = { id: "r", repository: "owner/repo", masterGoal: "ship", status: "active", workItems: [item], createdAt: now, updatedAt: now };
const evidence: Evidence[] = [
  { kind: "plan", summary: "large architecture history", createdAt: now },
  { kind: "diff", summary: "diff only", createdAt: now },
  { kind: "test", summary: "tests green", createdAt: now },
  { kind: "review", summary: "old review", createdAt: now },
];

test("reviewer receives diff and tests but not unrelated plan history", () => {
  const context = buildAgentContext("reviewer", run, item, evidence, DEFAULT_EFFICIENCY_POLICY);
  assert.deepEqual(context.evidence.map((entry) => entry.kind), ["diff", "test"]);
});

test("qa receives test review and diff evidence", () => {
  const context = buildAgentContext("qa", run, item, evidence, DEFAULT_EFFICIENCY_POLICY);
  assert.deepEqual(context.evidence.map((entry) => entry.kind), ["diff", "test", "review"]);
});
