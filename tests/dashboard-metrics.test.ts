import assert from "node:assert/strict";
import test from "node:test";
import { calculateDashboardMetrics } from "../src/dashboard/metrics.js";

test("dashboard aggregates operational usage", () => {
  const metrics = calculateDashboardMetrics(2, [
    { id: "1", runId: "r", type: "created", summary: "start", createdAt: new Date().toISOString() },
  ], [
    { at: new Date().toISOString(), provider: "x", model: "m", inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.01 },
  ]);

  assert.equal(metrics.activeRuns, 2);
  assert.equal(metrics.totalAgentEvents, 1);
  assert.equal(metrics.totalInputTokens, 100);
  assert.equal(metrics.estimatedCostUsd, 0.01);
});
