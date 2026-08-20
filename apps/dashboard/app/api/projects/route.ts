import { NextResponse } from "next/server";
import { Runtime } from "../../../../../dist/src/runtime/runtime.js";
import { AuthenticatedSupabaseRunStore, authenticateRequest } from "../../../src/server/authenticated-supabase-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { token, user } = await authenticateRequest(request);
    const store = new AuthenticatedSupabaseRunStore(token, user.id);
    const projectRuntime = new Runtime(store, []);
    const body = (await request.json()) as { repository?: string; goal?: string };
    const repository = (body.repository ?? "").trim();
    const goal = (body.goal ?? "").trim();
    if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(repository)) throw new Error("repository must use owner/name format");
    if (!goal) throw new Error("goal required");

    const run = await projectRuntime.createRun(repository, goal);
    const item = await projectRuntime.addWorkItem(
      run.id,
      "Execute master goal",
      goal,
      ["Master goal implemented", "Deterministic tests pass", "Independent review approves", "Changes delivered to GitHub"],
    );
    await projectRuntime.transition(run.id, item.id, "planning");
    const persisted = (await store.get(run.id)) ?? run;
    const job = await store.enqueue(persisted.id);
    return NextResponse.json({ runId: persisted.id, run: persisted, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project creation failed";
    const status = message.includes("authentication") || message.includes("session") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
