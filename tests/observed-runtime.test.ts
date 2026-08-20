import assert from "node:assert/strict";
import test from "node:test";
import type { Agent } from "../src/agents/agent.js";
import type { EventStore, RuntimeEvent } from "../src/events/event-store.js";
import { ObservedRuntime } from "../src/observability/observed-runtime.js";

class MemoryEvents implements EventStore {
  events: RuntimeEvent[] = [];
  async append(event: RuntimeEvent) { this.events.push(event); }
}

test("observed runtime records successful agent lifecycle", async () => {
  const events = new MemoryEvents();
  const agent: Agent = { role: "developer", async execute() { return { summary: "ok", evidence: [] }; } };
  const now = new Date().toISOString();
  await new ObservedRuntime(events).executeAgent(agent, { id: "r", repository: "repo", masterGoal: "goal", status: "active", workItems: [], createdAt: now, updatedAt: now }, { id: "w", title: "w", objective: "x", state: "implementing", acceptanceCriteria: [], attempt: 0, evidence: [] });
  assert.deepEqual(events.events.map((event) => event.type), ["agent.started", "agent.completed"]);
});
