import type { ModelCallRecord } from "../telemetry/model-telemetry.js";

export interface CostSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export function aggregateCost(records: readonly ModelCallRecord[]): CostSummary {
  return records.reduce<CostSummary>((total, record) => ({
    calls: total.calls + 1,
    inputTokens: total.inputTokens + (record.inputTokens ?? 0),
    outputTokens: total.outputTokens + (record.outputTokens ?? 0),
    estimatedCostUsd: total.estimatedCostUsd + (record.estimatedCostUsd ?? 0),
  }), {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  });
}
