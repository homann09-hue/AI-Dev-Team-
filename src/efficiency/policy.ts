import type { AgentRole, Evidence, WorkItem } from "../core/types.js";

export interface EfficiencyPolicy {
  maxEvidenceItems: number;
  maxEvidenceChars: number;
  maxAttemptsPerWorkItem: number;
  defaultMaxOutputTokens: number;
  roleOutputTokens: Partial<Record<AgentRole, number>>;
}

export const DEFAULT_EFFICIENCY_POLICY: EfficiencyPolicy = {
  maxEvidenceItems: 8,
  maxEvidenceChars: 8_000,
  maxAttemptsPerWorkItem: 6,
  defaultMaxOutputTokens: 1_200,
  roleOutputTokens: {
    architect: 1_500,
    developer: 2_000,
    reviewer: 900,
    qa: 700,
    live_verifier: 500,
  },
};

export function compactEvidence(evidence: readonly Evidence[], policy: EfficiencyPolicy): Evidence[] {
  return evidence.slice(-policy.maxEvidenceItems).map((item) => ({
    ...item,
    summary: item.summary.length <= policy.maxEvidenceChars
      ? item.summary
      : `${item.summary.slice(0, policy.maxEvidenceChars)}\n[truncated]`,
  }));
}

export function assertAttemptBudget(item: WorkItem, policy: EfficiencyPolicy): void {
  if (item.attempt >= policy.maxAttemptsPerWorkItem) {
    throw new Error(`Attempt budget exhausted for work item ${item.id}`);
  }
}

export function outputBudget(role: AgentRole, policy: EfficiencyPolicy): number {
  return policy.roleOutputTokens[role] ?? policy.defaultMaxOutputTokens;
}
