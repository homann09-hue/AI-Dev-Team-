import { NextResponse } from "next/server";
import { getPersistenceHealth } from "../../../src/server/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = getPersistenceHealth();
  return NextResponse.json(
    {
      status: health.ready ? "ok" : "blocked",
      persistence: health.persistence,
      production: health.production,
      reason: health.reason,
      checkedAt: new Date().toISOString(),
    },
    {
      status: health.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
