import assert from "node:assert/strict";
import test from "node:test";
import { runDemoScenario } from "../src/demo/end-to-end-scenario.js";

test("demo scenario completes all development gates", () => {
  const report = runDemoScenario();
  assert.equal(report.passed, true);
  assert.equal(report.steps.length, 6);
  assert.equal(report.steps.at(-1)?.agent, "live-verifier");
});
