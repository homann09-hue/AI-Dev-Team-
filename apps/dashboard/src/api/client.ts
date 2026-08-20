export interface CreateProjectRequest {
  repository: string;
  goal: string;
}

export interface DashboardWorkItem {
  id: string;
  title: string;
  state: string;
  attempt: number;
}

export interface DashboardRun {
  id: string;
  repository: string;
  goal: string;
  status: string;
  updatedAt: string;
  currentPhase: string;
  workItems: DashboardWorkItem[];
}

export interface DashboardOverview {
  generatedAt: string;
  persistence: "memory";
  activeRuns: number;
  totalRuns: number;
  totalWorkItems: number;
  runs: DashboardRun[];
}

export interface CreateProjectResponse {
  runId: string;
  run: DashboardRun;
}

export async function createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  const body = (await response.json()) as CreateProjectResponse | { error?: string };
  if (!response.ok) {
    throw new Error("error" in body && body.error ? body.error : "Project creation failed");
  }

  return body as CreateProjectResponse;
}

export async function getDashboard(): Promise<DashboardOverview> {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  if (!response.ok) throw new Error("Dashboard unavailable");
  return response.json() as Promise<DashboardOverview>;
}
