import { NextResponse } from "next/server";
import { getDashboardOverview } from "../../../src/server/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDashboardOverview(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard unavailable";
    const persistenceBlocked = message.includes("Production requires SUPABASE_URL");
    return NextResponse.json(
      { error: message },
      {
        status: persistenceBlocked ? 503 : 500,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
