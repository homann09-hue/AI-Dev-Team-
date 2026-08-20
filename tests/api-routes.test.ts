import assert from "node:assert/strict";
import test from "node:test";
import { HttpRoutes } from "../src/api/http-routes.js";

test("routes forward project creation and dashboard requests", async () => {
  const routes = new HttpRoutes(
    { async createProject() { return { id: "run-1" }; } } as never,
    { async getOverview() { return { active: 1 }; } } as never,
  );

  assert.deepEqual(await routes.handle("POST", "/projects", { repository: "a/b", goal: "ship" }), { id: "run-1" });
  assert.deepEqual(await routes.handle("GET", "/dashboard"), { active: 1 });
});
