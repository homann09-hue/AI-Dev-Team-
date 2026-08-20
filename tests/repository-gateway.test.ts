import assert from "node:assert/strict";
import test from "node:test";
import { HttpGitHubGateway } from "../src/repository/http-github-gateway.js";

const originalFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = originalFetch; });

test("gateway reads base64 repository content", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ encoding: "base64", content: Buffer.from("hello").toString("base64"), sha: "abc" }), { status: 200 });
  const gateway = new HttpGitHubGateway({ repository: "owner/repo", branch: "agent/task", token: "secret" });
  assert.equal(await gateway.readFile("src/a.ts"), "hello");
});

test("gateway updates existing file on configured branch", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), ...(init === undefined ? {} : { init }) });
    if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ sha: "old" }), { status: 200 });
    return new Response(JSON.stringify({ commit: { sha: "new" } }), { status: 200 });
  };
  const gateway = new HttpGitHubGateway({ repository: "owner/repo", branch: "agent/task", token: "secret" });
  await gateway.writeFile("src/a.ts", "new content", "agent change");
  const body = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.branch, "agent/task");
  assert.equal(body.sha, "old");
  assert.equal(Buffer.from(String(body.content), "base64").toString("utf8"), "new content");
});

test("tests fail closed without sandbox runner", async () => {
  const gateway = new HttpGitHubGateway({ repository: "owner/repo", branch: "agent/task", token: "secret" });
  await assert.rejects(gateway.runTests("npm test"), /No sandboxed test runner/);
});
