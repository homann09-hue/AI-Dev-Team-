import type { AgentRole, Evidence, ProjectRun, WorkItem } from "../core/types.js";

export interface AgentContext {
  run: ProjectRun;
  workItem: WorkItem;
  priorEvidence: readonly Evidence[];
}

export interface AgentResult {
  summary: string;
  evidence: Evidence[];
  approved?: boolean;
  blocker?: string;
}

export interface Agent {
  readonly role: AgentRole;
  execute(context: AgentContext): Promise<AgentResult>;
}

export const MUTATING_ROLES: readonly AgentRole[] = ["developer"];

export function mayMutateProductCode(role: AgentRole): boolean {
  return MUTATING_ROLES.includes(role);
}
