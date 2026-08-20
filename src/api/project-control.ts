import type { Runtime } from "../runtime/runtime.js";

export interface ProjectControlApi {
  startProject(repository: string, goal: string): Promise<string>;
}

export class ProjectControlService implements ProjectControlApi {
  constructor(private readonly runtime: Runtime) {}

  async startProject(repository: string, goal: string): Promise<string> {
    const run = await this.runtime.createRun(repository, goal);
    return run.id;
  }
}
