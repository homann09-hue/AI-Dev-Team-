import type { DashboardRun } from "../types.js";

export function formatRunStatus(run: DashboardRun): string {
  return [
    `Status: ${run.status}`,
    `Agent: ${run.activeAgent ?? "idle"}`,
    `Tokens: ${run.tokens}`,
    `Cost: $${run.estimatedCostUsd.toFixed(4)}`,
    `Events: ${run.events}`,
  ].join(" | ");
}
