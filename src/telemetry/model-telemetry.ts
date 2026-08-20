import type { AgentRole } from "../core/types.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../providers/provider.js";

export interface ModelCallRecord {
  at: string;
  provider: string;
  model: string;
  role?: AgentRole;
  runId?: string;
  workItemId?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface TelemetrySink {
  record(call: ModelCallRecord): Promise<void>;
}

export class InMemoryTelemetrySink implements TelemetrySink {
  readonly calls: ModelCallRecord[] = [];
  async record(call: ModelCallRecord): Promise<void> { this.calls.push(call); }
}

export class TelemetryProvider implements ModelProvider {
  readonly name: string;

  constructor(private readonly inner: ModelProvider, private readonly sink: TelemetrySink) {
    this.name = inner.name;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.inner.generate(request);
    const metadata = request.metadata ?? {};
    const record: ModelCallRecord = {
      at: new Date().toISOString(),
      provider: response.provider,
      model: response.model,
      ...(isRole(metadata.role) ? { role: metadata.role } : {}),
      ...(metadata.runId ? { runId: metadata.runId } : {}),
      ...(metadata.workItemId ? { workItemId: metadata.workItemId } : {}),
      ...(response.usage?.inputTokens === undefined ? {} : { inputTokens: response.usage.inputTokens }),
      ...(response.usage?.outputTokens === undefined ? {} : { outputTokens: response.usage.outputTokens }),
      ...(response.usage?.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: response.usage.estimatedCostUsd }),
    };
    await this.sink.record(record);
    return response;
  }
}

function isRole(value: string | undefined): value is AgentRole {
  return value === "lead" || value === "architect" || value === "developer" || value === "reviewer" || value === "qa" || value === "live_verifier";
}
