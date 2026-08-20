import type { DashboardApi } from "./dashboard-api.js";
import type { ProjectApi } from "./project-api.js";

export class HttpRoutes {
  constructor(
    private readonly projects: ProjectApi,
    private readonly dashboard: DashboardApi,
  ) {}

  async handle(method: string, path: string, body?: unknown): Promise<unknown> {
    if (method === "POST" && path === "/projects") {
      return this.projects.createProject(body as { repository: string; goal: string });
    }

    if (method === "GET" && path === "/dashboard") {
      return this.dashboard.getOverview();
    }

    throw new Error(`Route not found: ${method} ${path}`);
  }
}
