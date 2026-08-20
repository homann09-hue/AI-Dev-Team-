import test from "node:test";
import assert from "node:assert/strict";
import type { Agent } from "../src/agents/agent.js";
import type { AgentRole, Evidence } from "../src/core/types.js";
import { InMemoryRunStore } from "../src/storage/run-store.js";
import { FullRunExecutor } from "../src/workflow/full-runner.js";

function evidence(kind: Evidence["kind"], summary: string): Evidence {
  return { kind, summary, createdAt: new Date().toISOString() };
}

function agent(role: AgentRole, result: { evidence: Evidence[]; approved?: boolean; blocker?: string }): Agent {
  return {
    role,
    async execute() {
      return { summary: `${role} complete`, ...result };
    },
  };
}

test("full runner completes architect through live verification", async () => {
  const store = new InMemoryRunStore();
  const runner = new FullRunExecutor(
    store,
    agent("architect", { evidence: [evidence("plan", "plan ready")] }),
    agent("developer", { evidence: [evidence("diff", "implementation ready")] }),
    agent("reviewer", { evidence: [evidence("review", "review approved")], approved: true }),
    agent("qa", { evidence: [evidence("test", "qa approved")], approved: true }),
    agent("live_verifier", { evidence: [evidence("live_check", "production healthy")] }),
    { async run() { return evidence("test", "deterministic tests passed"); } },
    { async run() { return evidence("deployment", "deployment ready"); } },
  );

  const result = await runner.execute("owner/repo", "ship feature");

  assert.equal(result.outcome, "done");
  assert.equal(result.run.status, "completed");
  assert.equal(result.item.state, "done");
  assert.ok(result.item.evidence.some((item) => item.kind === "plan"));
  assert.ok(result.item.evidence.some((item) => item.kind === "diff"));
  assert.ok(result.item.evidence.some((item) => item.kind === "review"));
  assert.ok(result.item.evidence.some((item) => item.kind === "deployment"));
  assert.ok(result.item.evidence.some((item) => item.kind === "live_check"));
});

test("full runner fails closed when deterministic tests fail", async () => {
  const store = new InMemoryRunStore();
  const runner = new FullRunExecutor(
    store,
    agent("architect", { evidence: [evidence("plan", "plan ready")] }),
    agent("developer", { evidence: [evidence("diff", "implementation ready")] }),
    agent("reviewer", { evidence: [evidence("review", "review approved")], approved: true }),
    agent("qa", { evidence: [evidence("test", "qa approved")], approved: true }),
    agent("live_verifier", { evidence: [evidence("live_check", "production healthy")] }),
    { async run() { throw new Error("tests red"); } },
    { async run() { return evidence("deployment", "deployment ready"); } },
  );

  const result = await runner.execute("owner/repo", "ship feature");

  assert.equal(result.outcome, "failed");
  assert.equal(result.run.status, "failed");
  assert.equal(result.item.state, "blocked");
  assert.ok(result.item.evidence.some((item) => item.kind === "test" && item.summary.includes("tests red")));
  assert.equal(result.item.evidence.some((item) => item.kind === "review"), false);
  assert.equal(result.item.evidence.some((item) => item.kind === "deployment"), false);
});

test("full runner blocks when live verification has no live evidence", async () => {
  const store = new InMemoryRunStore();
  const runner = new FullRunExecutor(
    store,
    agent("architect", { evidence: [evidence("plan", "plan ready")] }),
    agent("developer", { evidence: [evidence("diff", "implementation ready")] }),
    agent("reviewer", { evidence: [evidence("review", "review approved")], approved: true }),
    agent("qa", { evidence: [evidence("test", "qa approved")], approved: true }),
    agent("live_verifier", { evidence: [evidence("decision", "could not verify")], blocker: "live unavailable" }),
    { async run() { return evidence("test", "deterministic tests passed"); } },
    { async run() { return evidence("deployment", "deployment ready"); } },
  );

  const result = await runner.execute("owner/repo", "ship feature");

  assert.equal(result.outcome, "blocked");
  assert.equal(result.run.status, "active");
  assert.equal(result.item.state, "blocked");
});
