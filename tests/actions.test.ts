import assert from "node:assert/strict";
import test from "node:test";
import { GitHubWorker, type RepositoryGateway } from "../src/actions/github-worker.js";

function gateway(): RepositoryGateway {
  return {
    async readFile(path) { return path; },
    async searchCode(query) { return query; },
    async writeFile(path) { return path; },
    async runTests(command) { return command; },
  };
}

test("developer can mutate repository through worker", async () => {
  const worker = new GitHubWorker(gateway());
  const result = await worker.execute("developer", { type: "write_file", path: "a.ts", content: "x", message: "change" });
  assert.equal(result, "a.ts");
});

test("reviewer and qa cannot mutate repository", async () => {
  const worker = new GitHubWorker(gateway());
  const action = { type: "write_file", path: "a.ts", content: "x", message: "change" } as const;
  await assert.rejects(worker.execute("reviewer", action));
  await assert.rejects(worker.execute("qa", action));
});

test("reviewer can read repository", async () => {
  const worker = new GitHubWorker(gateway());
  assert.equal(await worker.execute("reviewer", { type: "read_file", path: "a.ts" }), "a.ts");
});
