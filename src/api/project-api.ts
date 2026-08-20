import type { Runtime } from "../runtime/runtime.js";

export interface CreateProjectRequest {
  repository: string;
  goal: string;
}

export class ProjectApi {
  constructor(private readonly runtime: Runtime) {}

  async createProject(request: CreateProjectRequest) {
    if (!request.repository.trim()) throw new Error("repository required");
    if (!request.goal.trim()) throw new Error("goal required");

    return this.runtime.createRun(request.repository, request.goal);
  }
}
