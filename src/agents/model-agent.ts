import type { Agent, AgentContext, AgentResult } from "./agent.js";
import type { AgentRole, Evidence } from "../core/types.js";
import type { ModelProvider } from "../providers/provider.js";

export interface ModelAgentOptions {
  role: AgentRole;
  provider: ModelProvider;
  systemPrompt: string;
}

export class ModelAgent implements Agent {
  readonly role: AgentRole;
  private readonly provider: ModelProvider;
  private readonly systemPrompt: string;

  constructor(options: ModelAgentOptions) {
    this.role = options.role;
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const response = await this.provider.generate({
      system: this.systemPrompt,
      prompt: JSON.stringify({
        masterGoal: context.run.masterGoal,
        repository: context.run.repository,
        workItem: context.workItem,
        priorEvidence: context.priorEvidence,
      }),
      metadata: { runId: context.run.id, workItemId: context.workItem.id, role: this.role },
    });

    const evidence: Evidence = {
      kind: this.role === "reviewer" ? "review" : this.role === "qa" ? "test" : this.role === "live_verifier" ? "live_check" : "decision",
      summary: response.text,
      createdAt: new Date().toISOString(),
    };

    return { summary: response.text, evidence: [evidence] };
  }
}
