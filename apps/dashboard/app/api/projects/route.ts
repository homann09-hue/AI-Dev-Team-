import { NextResponse } from "next/server";
import { createDashboardRun } from "../../../src/server/control-plane";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { repository?: string; goal?: string };
    const run = await createDashboardRun(body.repository ?? "", body.goal ?? "");
    return NextResponse.json({ runId: run.id, run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Project creation failed" },
      { status: 400 },
    );
  }
}
