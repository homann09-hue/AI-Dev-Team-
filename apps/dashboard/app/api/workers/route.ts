import { NextResponse } from "next/server";
import { AuthenticatedSupabaseRunStore, authenticateRequest } from "../../../src/server/authenticated-supabase-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { token, user } = await authenticateRequest(request);
    const body = await request.json() as { action?: string; workerId?: string };
    const store = new AuthenticatedSupabaseRunStore(token, user.id);
    if (body.action === "pair") {
      const code = await store.createWorkerPairingCode();
      return NextResponse.json({ action: "pair", code, expiresInSeconds: 600 });
    }
    if (!body.workerId || !/^[A-Za-z0-9._-]{3,128}$/.test(body.workerId)) {
      return NextResponse.json({ error: "valid workerId required" }, { status: 400 });
    }
    if (body.action === "rotate") {
      const code = await store.createWorkerRotationCode(body.workerId);
      return NextResponse.json({ action: "rotate", workerId: body.workerId, code, expiresInSeconds: 600 });
    }
    if (body.action === "revoke") {
      const revoked = await store.revokeWorker(body.workerId);
      if (!revoked) return NextResponse.json({ error: "active worker not found" }, { status: 404 });
      return NextResponse.json({ action: "revoke", workerId: body.workerId, revoked: true });
    }
    return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker action failed";
    const status = message.includes("authentication") || message.includes("session") ? 401 : 500;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
