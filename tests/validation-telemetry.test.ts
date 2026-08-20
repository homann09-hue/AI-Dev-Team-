import assert from "node:assert/strict";
import test from "node:test";
import { parseStructuredAgentOutput } from "../src/agents/structured-output.js";
import type { ModelProvider } from "../src/providers/provider.js";
import { InMemoryTelemetrySink, TelemetryProvider } from "../src/telemetry/model-telemetry.js";

test("structured output rejects unsafe paths and arbitrary commands", () => {
  assert.throws(() => parseStructuredAgentOutput(JSON.stringify({ summary: "x", actions: [{ type: "write_file", path: "../secret", content: "x", message: "x" }] })), /Unsafe/);
  assert.throws(() => parseStructuredAgentOutput(JSON.stringify({ summary: "x", actions: [{ type: "run_tests", command: "rm -rf /" }] })), /Unsupported/);
});

test("structured output accepts allowlisted deterministic test command", () => {
  const parsed = parseStructuredAgentOutput(JSON.stringify({ summary: "x", actions: [{ type: "run_tests", command: "npm run ci" }] }));
  assert.equal(parsed.actions[0]?.type, "run_tests");
});

test("telemetry records model usage with agent metadata", async () => {
  const inner: ModelProvider = {
    name: "fake",
    async generate() { return { text: "ok", model: "cheap-model", provider: "fake", usage: { inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.001 } }; },
  };
  const sink = new InMemoryTelemetrySink();
  const provider = new TelemetryProvider(inner, sink);
  await provider.generate({ system: "s", prompt: "p", metadata: { role: "reviewer", runId: "r1", workItemId: "w1" } });
  assert.equal(sink.calls.length, 1);
  assert.equal(sink.calls[0]?.role, "reviewer");
  assert.equal(sink.calls[0]?.inputTokens, 100);
  assert.equal(sink.calls[0]?.estimatedCostUsd, 0.001);
});
