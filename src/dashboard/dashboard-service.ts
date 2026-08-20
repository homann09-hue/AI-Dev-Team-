import type { ProjectRun } from "../core/types.js";
import type { ModelCallRecord } from "../telemetry/model-telemetry.js";
import type { RunEvent } from "../events/run-events.js";

export interface DashboardSnapshot {
  runId: string;
  repository: string;
  status: ProjectRun["status"];
  workItems: number;
  events: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export function buildDashboardSnapshot(run: ProjectRun, events: readonly RunEvent[], calls: readonly ModelCallRecord[]): DashboardSnapshot {
  return {
    runId: run.id,
    repository: run.repository,
    status: run.status,
    workItems: run.workItems.length,
    events: events.length,
    modelCalls: calls.length,
    inputTokens: calls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
    outputTokens: calls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
    estimatedCostUsd: calls.reduce((sum, call) => sum + (call.estimatedCostUsd ?? 0), 0),
  };
}
