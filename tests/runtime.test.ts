import assert from "node:assert/strict";
import test from "node:test";
import type { Agent } from "../src/agents/agent.js";
import { Runtime } from "../src/runtime/runtime.js";
import { InMemoryRunStore } from "../src/storage/run-store.js";

const architect: Agent = {
  role: "architect",
  async execute() {
    return {
      summary: "planned",
      evidence: [{ kind: "plan", summary: "planned", createdAt: new Date().toISOString() }],
    };
  },
};

test("runtime persists runs, transitions and agent evidence", async () => {
  const store = new InMemoryRunStore();
  const runtime = new Runtime(store, [architect]);
  const run = await runtime.createRun("owner/repo", "Ship the product");
  const item = await runtime.addWorkItem(run.id, "Plan", "Define implementation", ["DoD exists"]);

  const planning = await runtime.transition(run.id, item.id, "planning");
  assert.equal(planning.owner, "architect");

  const executed = await runtime.execute(run.id, item.id);
  assert.equal(executed.attempt, 1);
  assert.equal(executed.evidence.length, 1);

  const persisted = await store.get(run.id);
  assert.equal(persisted?.workItems[0]?.evidence[0]?.summary, "planned");
});
