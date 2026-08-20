import type { AgentRole } from "../core/types.js";
import { assertActionAllowed, type ActionExecutor, type AgentAction } from "./action.js";

export interface RepositoryGateway {
  readFile(path: string, ref?: string): Promise<string>;
  searchCode(query: string): Promise<unknown>;
  writeFile(path: string, content: string, message: string): Promise<unknown>;
  runTests(command: string): Promise<unknown>;
}

export class GitHubWorker implements ActionExecutor {
  constructor(private readonly repository: RepositoryGateway) {}

  async execute(role: AgentRole, action: AgentAction): Promise<unknown> {
    assertActionAllowed(role, action);

    switch (action.type) {
      case "read_file":
        return this.repository.readFile(action.path, action.ref);
      case "search_code":
        return this.repository.searchCode(action.query);
      case "write_file":
        return this.repository.writeFile(action.path, action.content, action.message);
      case "run_tests":
        return this.repository.runTests(action.command);
      case "report":
        return { summary: action.summary };
    }
  }
}
