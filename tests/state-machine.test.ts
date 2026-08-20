import assert from "node:assert/strict";
import test from "node:test";
import { assertTransition, canTransition } from "../src/core/state-machine.js";

 test("happy-path transitions are allowed", () => {
  assert.equal(canTransition("implementing", "review"), true);
  assert.equal(canTransition("review", "qa"), true);
  assert.equal(canTransition("qa", "deploying"), true);
  assert.equal(canTransition("live_verification", "done"), true);
});

test("quality gates can return work to implementation", () => {
  assert.equal(canTransition("review", "implementing"), true);
  assert.equal(canTransition("qa", "implementing"), true);
  assert.equal(canTransition("live_verification", "implementing"), true);
});

test("done is terminal", () => {
  assert.equal(canTransition("done", "implementing"), false);
  assert.throws(() => assertTransition("done", "implementing"));
});
