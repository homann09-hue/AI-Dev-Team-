import { NextResponse } from "next/server";
import { getDashboardOverview } from "../../../src/server/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getDashboardOverview(), {
    headers: { "cache-control": "no-store" },
  });
}
