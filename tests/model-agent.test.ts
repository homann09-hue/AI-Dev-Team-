import assert from "node:assert/strict";
import test from "node:test";
import type { ActionExecutor, AgentAction } from "../src/actions/action.js";
import { ModelAgent } from "../src/agents/model-agent.js";
import type { AgentContext } from "../src/agents/agent.js";
import type { ModelProvider } from "../src/providers/provider.js";

function context(): AgentContext {
  const now = new Date().toISOString();
  const workItem = { id: "w1", title: "Change", objective: "Change file", state: "implementing" as const, acceptanceCriteria: ["works"], attempt: 0, evidence: [] };
  return {
    run: { id: "r1", repository: "owner/repo", masterGoal: "ship", status: "active", workItems: [workItem], createdAt: now, updatedAt: now },
    workItem,
    priorEvidence: [],
  };
}

function fakeProvider(output: Record<string, unknown>): ModelProvider {
  return {
    name: "fake",
    async generate() {
      return { provider: "fake", model: "fake", text: JSON.stringify(output) };
    },
  };
}

test("model agent parses and executes structured actions", async () => {
  const provider = fakeProvider({ summary: "done", actions: [{ type: "write_file", path: "a.ts", content: "x", message: "change" }] });
  const actions: AgentAction[] = [];
  const executor: ActionExecutor = {
    async execute(_role, action) { actions.push(action); return undefined; },
  };
  const agent = new ModelAgent({ role: "developer", provider, systemPrompt: "Implement", actionExecutor: executor });
  const result = await agent.execute(context());
  assert.equal(result.summary, "done");
  assert.equal(result.evidence[0]?.kind, "diff");
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "write_file");
});

test("architect output is plan evidence for full-run gating", async () => {
  const agent = new ModelAgent({ role: "architect", provider: fakeProvider({ summary: "plan", actions: [] }), systemPrompt: "Plan" });
  const result = await agent.execute(context());
  assert.equal(result.evidence[0]?.kind, "plan");
});

test("action request without executor fails closed", async () => {
  const provider = fakeProvider({ summary: "need read", actions: [{ type: "read_file", path: "a.ts" }] });
  const agent = new ModelAgent({ role: "developer", provider, systemPrompt: "Implement" });
  await assert.rejects(agent.execute(context()), /no executor/);
});
