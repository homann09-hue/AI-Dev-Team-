import { NextResponse } from "next/server";
import { AuthenticatedSupabaseRunStore, authenticateRequest } from "../../../../../src/server/authenticated-supabase-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const { token, user } = await authenticateRequest(request);
    const { runId } = await context.params;
    const store = new AuthenticatedSupabaseRunStore(token, user.id);
    const run = await store.get(runId);
    if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
    const item = run.workItems[0];
    if (!item) return NextResponse.json({ error: "run has no work item" }, { status: 409 });

    if (["done", "failed", "blocked"].includes(item.state)) {
      item.state = "planning";
      run.status = "active";
      run.updatedAt = new Date().toISOString();
      await store.save(run);
    }

    const job = await store.enqueue(runId);
    return NextResponse.json({ queued: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run queueing failed";
    const status = message.includes("authentication") || message.includes("session") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
