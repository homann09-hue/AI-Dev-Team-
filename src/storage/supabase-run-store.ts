import type { ProjectRun } from "../core/types.js";
import type { RunStore } from "./run-store.js";

export interface SupabaseRunStoreOptions {
  url: string;
  secretKey: string;
  fetchImpl?: typeof fetch;
}

type RunRow = { id: string; payload: ProjectRun; updated_at: string };

export class SupabaseRunStore implements RunStore {
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(private readonly options: SupabaseRunStoreOptions) {
    this.endpoint = `${options.url.replace(/\/$/, "")}/rest/v1/project_runs`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get(runId: string): Promise<ProjectRun | undefined> {
    const response = await this.request(`?id=eq.${encodeURIComponent(runId)}&select=payload&limit=1`);
    const rows = await response.json() as Array<{ payload: ProjectRun }>;
    return rows[0]?.payload;
  }

  async save(run: ProjectRun): Promise<void> {
    await this.request("?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: run.id, payload: run, updated_at: run.updatedAt }),
    });
  }

  async list(): Promise<ProjectRun[]> {
    const response = await this.request("?select=payload&order=updated_at.desc");
    const rows = await response.json() as Array<{ payload: ProjectRun }>;
    return rows.map((row) => row.payload);
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(`${this.endpoint}${path}`, {
      ...init,
      headers: {
        apikey: this.options.secretKey,
        Authorization: `Bearer ${this.options.secretKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase run store request failed (${response.status}): ${detail}`);
    }
    return response;
  }
}

export function supabaseRunStoreFromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseRunStore | undefined {
  const url = env.SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return undefined;
  return new SupabaseRunStore({ url, secretKey });
}
