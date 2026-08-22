import { NextResponse } from "next/server";
import { AuthenticatedSupabaseRunStore, authenticateRequest } from "../../../src/server/authenticated-supabase-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { token, user } = await authenticateRequest(request);
    const store = new AuthenticatedSupabaseRunStore(token, user.id);
    const [runs, jobs, workers, credentials] = await Promise.all([store.list(), store.listJobs(), store.listWorkers(), store.listWorkerCredentials()]);
    const activeRuns = runs.filter((run) => run.status === "active");
    const totalWorkItems = runs.reduce((sum, run) => sum + run.workItems.length, 0);
    const jobsByRun = new Map(jobs.map((job) => [job.run_id, job]));
    const latestWorker = workers[0];
    const runningJob = jobs.find((job) => job.status === "running" && job.heartbeat_at && Date.now() - new Date(job.heartbeat_at).getTime() < 45_000);
    const presenceSeenAt = latestWorker?.last_seen_at;
    const heartbeatSeenAt = runningJob?.heartbeat_at ?? undefined;
    const lastSeenAt = [presenceSeenAt, heartbeatSeenAt]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a))[0];
    const workerOnline = Boolean(
      (presenceSeenAt && Date.now() - new Date(presenceSeenAt).getTime() < 30_000)
      || runningJob,
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      persistence: "supabase-rls",
      execution: "personal-mac-worker",
      user: { id: user.id, email: user.email },
      worker: {
        online: workerOnline,
        workerId: latestWorker?.worker_id ?? runningJob?.worker_id ?? undefined,
        lastSeenAt,
        credentials: credentials.map((credential) => ({
          workerId: credential.worker_id,
          createdAt: credential.created_at,
          lastSeenAt: credential.last_seen_at,
          revokedAt: credential.revoked_at,
          failedAuth24h: Number(credential.failed_auth_24h),
        })),
      },
      activeRuns: activeRuns.length,
      totalRuns: runs.length,
      totalWorkItems,
      runs: runs.map((run) => {
        const job = jobsByRun.get(run.id);
        return {
          id: run.id,
          repository: run.repository,
          goal: run.masterGoal,
          status: run.status,
          updatedAt: run.updatedAt,
          currentPhase: run.workItems[0]?.state ?? "todo",
          job: job ? {
            id: job.id,
            status: job.status,
            workerId: job.worker_id,
            attempt: job.attempt,
            lastError: job.last_error,
            heartbeatAt: job.heartbeat_at,
            updatedAt: job.updated_at,
          } : undefined,
          workItems: run.workItems.map((item) => ({
            id: item.id,
            title: item.title,
            state: item.state,
            attempt: item.attempt,
            evidence: item.evidence,
          })),
        };
      }),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard unavailable";
    const status = message.includes("authentication") || message.includes("session") ? 401 : 500;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
