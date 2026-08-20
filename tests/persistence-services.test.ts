import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryRunEventStore, RunEventService } from "../src/persistence/run-event-service.js";
import { RunCostTracker } from "../src/persistence/run-cost-service.js";

test("run events can be queried by run", async () => {
  const store = new InMemoryRunEventStore();
  const service = new RunEventService(store);
  const run = { id: "r1" } as any;
  const item = { id: "w1" } as any;
  await service.recordAgentStart(run, item, "developer");
  const events = await store.list("r1");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.role, "developer");
});

test("cost tracker summarizes model usage", async () => {
  const tracker = new RunCostTracker();
  await tracker.record({ at: "now", provider: "p", model: "m", runId: "r1", inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.01 });
  const summary = tracker.summarize("r1");
  assert.deepEqual(summary, { calls: 1, inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.01 });
});
