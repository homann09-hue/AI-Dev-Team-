import assert from "node:assert/strict";
import test from "node:test";
import { buildDashboardSnapshot } from "../src/dashboard/dashboard-view.js";
import { InMemoryRunRepository, toStoredRun } from "../src/persistence/run-model.js";

test("stores runs and builds dashboard metrics", async () => {
  const now = new Date().toISOString();
  const run = { id: "r1", repository: "owner/repo", masterGoal: "ship", status: "active" as const, workItems: [], createdAt: now, updatedAt: now };
  const repository = new InMemoryRunRepository();
  await repository.saveRun(toStoredRun(run));

  const stored = await repository.getRun("r1");
  assert.equal(stored?.repository, "owner/repo");

  const dashboard = buildDashboardSnapshot([run], [{ at: now, provider: "x", model: "y", inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.01 }]);
  assert.equal(dashboard.activeRuns, 1);
  assert.equal(dashboard.inputTokens, 100);
  assert.equal(dashboard.estimatedCostUsd, 0.01);
});
