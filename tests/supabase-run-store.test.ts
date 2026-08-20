import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseRunStore } from "../src/storage/supabase-run-store.js";
import type { ProjectRun } from "../src/core/types.js";

const now = new Date().toISOString();
const run: ProjectRun = {
  id: "run-1",
  repository: "owner/repo",
  masterGoal: "ship",
  status: "active",
  workItems: [],
  createdAt: now,
  updatedAt: now,
};

test("supabase run store saves and loads runs", async () => {
  const rows = new Map<string, ProjectRun>();
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { id: string; payload: ProjectRun };
      rows.set(body.id, body.payload);
      return new Response(null, { status: 201 });
    }
    if (url.includes("id=eq.run-1")) {
      return Response.json([{ payload: rows.get("run-1") }]);
    }
    return Response.json([...rows.values()].map((payload) => ({ payload })));
  };

  const store = new SupabaseRunStore({ url: "https://example.supabase.co", secretKey: "secret", fetchImpl: fakeFetch });
  await store.save(run);
  assert.deepEqual(await store.get(run.id), run);
  assert.deepEqual(await store.list(), [run]);
});

test("supabase run store fails closed on API errors", async () => {
  const store = new SupabaseRunStore({
    url: "https://example.supabase.co",
    secretKey: "secret",
    fetchImpl: async () => new Response("denied", { status: 403 }),
  });
  await assert.rejects(() => store.get("run-1"), /403/);
});
