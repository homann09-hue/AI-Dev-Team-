export const WORK_STATES = [
  "todo",
  "planning",
  "ready",
  "implementing",
  "review",
  "qa",
  "deploying",
  "live_verification",
  "done",
  "blocked",
  "failed",
] as const;

export type WorkState = (typeof WORK_STATES)[number];

export const AGENT_ROLES = [
  "lead",
  "architect",
  "developer",
  "reviewer",
  "qa",
  "live_verifier",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export interface Evidence {
  kind: "plan" | "diff" | "review" | "test" | "deployment" | "live_check" | "decision";
  summary: string;
  uri?: string;
  createdAt: string;
}

export interface WorkItem {
  id: string;
  title: string;
  objective: string;
  state: WorkState;
  acceptanceCriteria: string[];
  owner?: AgentRole;
  attempt: number;
  evidence: Evidence[];
}

export interface ProjectRun {
  id: string;
  repository: string;
  masterGoal: string;
  status: "active" | "paused" | "completed" | "failed";
  workItems: WorkItem[];
  createdAt: string;
  updatedAt: string;
}
