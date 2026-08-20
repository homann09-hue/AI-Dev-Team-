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

test("model agent parses and executes structured actions", async () => {
  const provider: ModelProvider = {
    name: "fake",
    async generate() {
      return { provider: "fake", model: "fake", text: JSON.stringify({ summary: "done", actions: [{ type: "write_file", path: "a.ts", content: "x", message: "change" }] }) };
    },
  };
  const actions: AgentAction[] = [];
  const executor: ActionExecutor = {
    async execute(_role, action) { actions.push(action); return undefined; },
  };
  const agent = new ModelAgent({ role: "developer", provider, systemPrompt: "Implement", actionExecutor: executor });
  const result = await agent.execute(context());
  assert.equal(result.summary, "done");
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.type, "write_file");
});

test("action request without executor fails closed", async () => {
  const provider: ModelProvider = {
    name: "fake",
    async generate() {
      return { provider: "fake", model: "fake", text: JSON.stringify({ summary: "need read", actions: [{ type: "read_file", path: "a.ts" }] }) };
    },
  };
  const agent = new ModelAgent({ role: "developer", provider, systemPrompt: "Implement" });
  await assert.rejects(agent.execute(context()), /no executor/);
});
