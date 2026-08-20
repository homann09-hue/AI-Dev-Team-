import type { ProjectRun } from "../core/types.js";
import type { ModelCallRecord } from "../telemetry/model-telemetry.js";

export interface DashboardSnapshot {
  activeRuns: number;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  runs: Array<{ id: string; repository: string; status: string; updatedAt: string }>;
}

export function buildDashboardSnapshot(runs: ProjectRun[], calls: ModelCallRecord[]): DashboardSnapshot {
  return {
    activeRuns: runs.filter((run) => run.status === "active").length,
    totalCalls: calls.length,
    inputTokens: calls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
    outputTokens: calls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
    estimatedCostUsd: calls.reduce((sum, call) => sum + (call.estimatedCostUsd ?? 0), 0),
    runs: runs.map((run) => ({ id: run.id, repository: run.repository, status: run.status, updatedAt: run.updatedAt })),
  };
}
