import type { AgentRole } from "../core/types.js";

export type AgentAction =
  | { type: "read_file"; path: string; ref?: string }
  | { type: "search_code"; query: string }
  | { type: "write_file"; path: string; content: string; message: string }
  | { type: "run_tests"; command: string }
  | { type: "report"; summary: string };

const MUTATING_ACTIONS = new Set<AgentAction["type"]>(["write_file"]);

export function assertActionAllowed(role: AgentRole, action: AgentAction): void {
  if (MUTATING_ACTIONS.has(action.type) && role !== "developer") {
    throw new Error(`${role} is not allowed to execute ${action.type}`);
  }
}

export interface ActionExecutor {
  execute(role: AgentRole, action: AgentAction): Promise<unknown>;
}
