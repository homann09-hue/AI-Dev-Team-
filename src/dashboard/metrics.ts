import type { ModelCallRecord } from "../telemetry/model-telemetry.js";
import type { RunEvent } from "../persistence/event-log.js";

export interface DashboardMetrics {
  activeRuns: number;
  totalAgentEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export function calculateDashboardMetrics(runs: number, events: readonly RunEvent[], calls: readonly ModelCallRecord[]): DashboardMetrics {
  return {
    activeRuns: runs,
    totalAgentEvents: events.length,
    totalInputTokens: calls.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0),
    totalOutputTokens: calls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0),
    estimatedCostUsd: calls.reduce((sum, call) => sum + (call.estimatedCostUsd ?? 0), 0),
  };
}
