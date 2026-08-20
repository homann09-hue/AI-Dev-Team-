import { NextResponse } from "next/server";
import { AuthenticatedSupabaseRunStore, authenticateRequest } from "../../../../../src/server/authenticated-supabase-store";
import { buildConfiguredFullRunner, getRunnerReadiness } from "../../../../../src/server/configured-full-runner";

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

    const readiness = getRunnerReadiness();
    if (!readiness.ready) {
      return NextResponse.json(
        { error: `Agent runner not configured: missing ${readiness.missing.join(", ")}`, readiness },
        { status: 503 },
      );
    }

    const executor = await buildConfiguredFullRunner(store, run);
    const result = await executor.executeExisting(run.id, item.id);
    return NextResponse.json({ outcome: result.outcome, run: result.run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run execution failed";
    const status = message.includes("authentication") || message.includes("session") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
