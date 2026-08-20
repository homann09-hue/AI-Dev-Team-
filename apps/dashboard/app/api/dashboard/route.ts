import { NextResponse } from "next/server";
import { AuthenticatedSupabaseRunStore, authenticateRequest } from "../../../src/server/authenticated-supabase-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { token, user } = await authenticateRequest(request);
    const store = new AuthenticatedSupabaseRunStore(token, user.id);
    const runs = await store.list();
    const activeRuns = runs.filter((run) => run.status === "active");
    const totalWorkItems = runs.reduce((sum, run) => sum + run.workItems.length, 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      persistence: "supabase-rls",
      user: { id: user.id, email: user.email },
      activeRuns: activeRuns.length,
      totalRuns: runs.length,
      totalWorkItems,
      runs: runs.map((run) => ({
        id: run.id,
        repository: run.repository,
        goal: run.masterGoal,
        status: run.status,
        updatedAt: run.updatedAt,
        currentPhase: run.workItems[0]?.state ?? "todo",
        workItems: run.workItems.map((item) => ({ id: item.id, title: item.title, state: item.state, attempt: item.attempt })),
      })),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard unavailable";
    const status = message.includes("authentication") || message.includes("session") ? 401 : 500;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
