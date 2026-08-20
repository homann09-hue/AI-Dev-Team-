import assert from "node:assert/strict";
import test from "node:test";
import { validateProjectStart } from "../src/web/project-form.js";

test("project start requires repository and goal", () => {
  assert.throws(() => validateProjectStart({ repository: "", goal: "x" }));
  assert.throws(() => validateProjectStart({ repository: "repo", goal: "" }));
});

test("project start normalizes input", () => {
  const result = validateProjectStart({ repository: " repo ", goal: " build " });
  assert.deepEqual(result, { repository: "repo", goal: "build" });
});
