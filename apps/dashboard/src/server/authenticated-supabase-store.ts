import type { ProjectRun } from "../../../../dist/src/core/types.js";
import type { RunStore } from "../../../../dist/src/storage/run-store.js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../lib/supabase";

interface SupabaseUser { id: string; email?: string }
interface RunRow { payload: ProjectRun }

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
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    return response.json() as Promise<T>;
  }
}
