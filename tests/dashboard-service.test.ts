import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardSnapshot } from "../src/dashboard/dashboard-service.js";

const now = new Date().toISOString();

test("dashboard aggregates run state and cost metrics", () => {
  const snapshot = buildDashboardSnapshot({
    id: "run-1",
    repository: "owner/repo",
    masterGoal: "ship",
    status: "active",
    workItems: [],
    createdAt: now,
    updatedAt: now,
  }, [
    { type: "agent.started", runId: "run-1", at: now },
  ], [
    { at: now, provider: "test", model: "m", inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.01 },
  ]);

  assert.equal(snapshot.events, 1);
  assert.equal(snapshot.modelCalls, 1);
  assert.equal(snapshot.inputTokens, 100);
  assert.equal(snapshot.estimatedCostUsd, 0.01);
});
