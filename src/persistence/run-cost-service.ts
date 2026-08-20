import type { TelemetrySink } from "../telemetry/model-telemetry.js";
import type { ModelCallRecord } from "../telemetry/model-telemetry.js";

export interface RunCostSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export class RunCostTracker implements TelemetrySink {
  private readonly records: ModelCallRecord[] = [];

  async record(call: ModelCallRecord): Promise<void> {
    this.records.push(call);
  }

  summarize(runId: string): RunCostSummary {
    return this.records
      .filter((record) => record.runId === runId)
      .reduce<RunCostSummary>((summary, record) => ({
        calls: summary.calls + 1,
        inputTokens: summary.inputTokens + (record.inputTokens ?? 0),
        outputTokens: summary.outputTokens + (record.outputTokens ?? 0),
        estimatedCostUsd: summary.estimatedCostUsd + (record.estimatedCostUsd ?? 0),
      }), { calls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
  }
}
