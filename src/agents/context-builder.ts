import type { AgentRole, Evidence, ProjectRun, WorkItem } from "../core/types.js";
import { compactEvidence, type EfficiencyPolicy } from "../efficiency/policy.js";

export interface AgentPromptContext {
  goal: string;
  repo: string;
  task: {
    id: string;
    title: string;
    objective: string;
    acceptanceCriteria: string[];
    state: string;
    attempt: number;
  };
  evidence: Evidence[];
}

export function buildAgentContext(role: AgentRole, run: ProjectRun, item: WorkItem, evidence: readonly Evidence[], policy: EfficiencyPolicy): AgentPromptContext {
  const relevant = role === "reviewer"
    ? evidence.filter((entry) => entry.kind === "diff" || entry.kind === "test" || entry.kind === "decision")
    : role === "qa"
      ? evidence.filter((entry) => entry.kind === "test" || entry.kind === "review" || entry.kind === "diff")
      : evidence;

  return {
    goal: run.masterGoal,
    repo: run.repository,
    task: {
      id: item.id,
      title: item.title,
      objective: item.objective,
      acceptanceCriteria: item.acceptanceCriteria,
      state: item.state,
      attempt: item.attempt,
    },
    evidence: compactEvidence(relevant, policy),
  };
}
