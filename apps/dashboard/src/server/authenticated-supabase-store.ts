import type { ProjectRun } from "../../../../dist/src/core/types.js";
import type { RunStore } from "../../../../dist/src/storage/run-store.js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/supabase";

interface SupabaseUser { id: string; email?: string }
interface RunRow { payload: ProjectRun }

export type AgentJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AgentJob {
  id: string;
  run_id: string;
  user_id: string;
  status: AgentJobStatus;
  worker_id: string | null;
  attempt: number;
  last_error: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerPresence {
  user_id: string;
  worker_id: string;
  last_seen_at: string;
  details: Record<string, unknown>;
}

export interface WorkerCredentialStatus {
  worker_id: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  failed_auth_24h: number;
}

export async function authenticateRequest(request: Request): Promise<{ token: string; user: SupabaseUser }> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("authentication required");
  const token = match[1];
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("invalid or expired session");
  const user = await response.json() as SupabaseUser;
  if (!user.id) throw new Error("invalid user session");
  return { token, user };
}

export class AuthenticatedSupabaseRunStore implements RunStore {
  constructor(private readonly token: string, private readonly userId: string) {}

  async get(runId: string): Promise<ProjectRun | undefined> {
    const query = new URLSearchParams({ id: `eq.${runId}`, user_id: `eq.${this.userId}`, select: "payload", limit: "1" });
    const rows = await this.request<RunRow[]>(`/rest/v1/project_runs?${query.toString()}`);
    return rows[0]?.payload;
  }

  async save(run: ProjectRun): Promise<void> {
    await this.request("/rest/v1/project_runs?on_conflict=id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ id: run.id, user_id: this.userId, payload: run, updated_at: run.updatedAt }]),
    });
  }

  async list(): Promise<ProjectRun[]> {
    const query = new URLSearchParams({ user_id: `eq.${this.userId}`, select: "payload", order: "updated_at.desc" });
    const rows = await this.request<RunRow[]>(`/rest/v1/project_runs?${query.toString()}`);
    return rows.map((row) => row.payload);
  }

  async enqueue(runId: string): Promise<AgentJob> {
    const now = new Date().toISOString();
    const rows = await this.request<AgentJob[]>("/rest/v1/agent_jobs?on_conflict=run_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([{
        run_id: runId,
        user_id: this.userId,
        status: "queued",
        worker_id: null,
        last_error: null,
        claimed_at: null,
        heartbeat_at: null,
        updated_at: now,
      }]),
    });
    const job = rows[0];
    if (!job) throw new Error("Supabase did not return the queued job");
    return job;
  }

  async listJobs(): Promise<AgentJob[]> {
    const query = new URLSearchParams({ user_id: `eq.${this.userId}`, select: "*", order: "updated_at.desc" });
    return this.request<AgentJob[]>(`/rest/v1/agent_jobs?${query.toString()}`);
  }

  async listWorkers(): Promise<WorkerPresence[]> {
    const query = new URLSearchParams({ user_id: `eq.${this.userId}`, select: "*", order: "last_seen_at.desc" });
    return this.request<WorkerPresence[]>(`/rest/v1/worker_presence?${query.toString()}`);
  }

  async listWorkerCredentials(): Promise<WorkerCredentialStatus[]> {
    return this.rpc<WorkerCredentialStatus[]>("list_local_workers");
  }

  async createWorkerPairingCode(): Promise<string> {
    return this.rpc<string>("create_worker_pairing_code");
  }

  async createWorkerRotationCode(workerId: string): Promise<string> {
    return this.rpc<string>("create_worker_rotation_code", { p_worker_id: workerId });
  }

  async revokeWorker(workerId: string): Promise<boolean> {
    return this.rpc<boolean>("revoke_local_worker", { p_worker_id: workerId });
  }

  private async rpc<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
