import { getAccessToken } from "../lib/supabase";

export interface CreateProjectRequest {
  repository: string;
  goal: string;
}

export interface DashboardEvidence {
  kind: string;
  summary: string;
  uri?: string;
  createdAt: string;
}

export interface DashboardJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  workerId?: string | null;
  attempt: number;
  lastError?: string | null;
  heartbeatAt?: string;
  updatedAt: string;
}

export interface DashboardWorkItem {
  id: string;
  title: string;
  state: string;
  attempt: number;
  evidence: DashboardEvidence[];
}

export interface DashboardRun {
  id: string;
  repository: string;
  goal: string;
  status: string;
  updatedAt: string;
  currentPhase: string;
  job?: DashboardJob;
  workItems: DashboardWorkItem[];
}

export interface DashboardOverview {
  generatedAt: string;
  persistence: "supabase-rls";
  execution: "personal-mac-worker";
  user: { id: string; email?: string };
  worker: {
    online: boolean;
    workerId?: string;
    lastSeenAt?: string;
    credentials: Array<{ workerId: string; createdAt: string; lastSeenAt: string; revokedAt: string | null; failedAuth24h: number }>;
  };
  activeRuns: number;
  totalRuns: number;
  totalWorkItems: number;
  runs: DashboardRun[];
}

export interface WorkerActionResponse {
  action: "pair" | "rotate" | "revoke";
  workerId?: string;
  code?: string;
  expiresInSeconds?: number;
  revoked?: true;
}

export interface CreateProjectResponse {
  runId: string;
  run: DashboardRun;
  job: DashboardJob;
}

export interface ExecuteRunResponse {
  queued: true;
  job: DashboardJob;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error("authentication required");
  return { authorization: `Bearer ${token}` };
}

export async function createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(request),
  });
  const body = (await response.json()) as CreateProjectResponse | { error?: string };
  if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Project creation failed");
  return body as CreateProjectResponse;
}

export async function executeRun(runId: string): Promise<ExecuteRunResponse> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/execute`, {
    method: "POST",
    headers: await authHeaders(),
  });
  const body = (await response.json()) as ExecuteRunResponse | { error?: string };
  if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Run queueing failed");
  return body as ExecuteRunResponse;
}

export async function getDashboard(): Promise<DashboardOverview> {
  const response = await fetch("/api/dashboard", { cache: "no-store", headers: await authHeaders() });
  const body = (await response.json()) as DashboardOverview | { error?: string };
  if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Dashboard unavailable");
  return body as DashboardOverview;
}

export async function manageWorker(action: "pair" | "rotate" | "revoke", workerId?: string): Promise<WorkerActionResponse> {
  const response = await fetch("/api/workers", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ action, workerId }),
  });
  const body = await response.json() as WorkerActionResponse | { error?: string };
  if (!response.ok) throw new Error("error" in body && body.error ? body.error : "Worker action failed");
  return body as WorkerActionResponse;
}
