import { NextResponse } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../../../src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
  return NextResponse.json(
    {
      status: configured ? "ok" : "blocked",
      persistence: "supabase-rls",
      auth: "supabase-email-otp",
      execution: "personal-mac-worker",
      modelSecretsInCloud: false,
      configured,
      checkedAt: new Date().toISOString(),
    },
    {
      status: configured ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
