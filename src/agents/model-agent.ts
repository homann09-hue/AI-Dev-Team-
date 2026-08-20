import type { Agent, AgentContext, AgentResult } from "./agent.js";
import type { AgentRole, Evidence } from "../core/types.js";
import { compactEvidence, DEFAULT_EFFICIENCY_POLICY, outputBudget, type EfficiencyPolicy } from "../efficiency/policy.js";
import type { ModelProvider } from "../providers/provider.js";

export interface ModelAgentOptions {
  role: AgentRole;
  provider: ModelProvider;
  systemPrompt: string;
  efficiencyPolicy?: EfficiencyPolicy;
}

export class ModelAgent implements Agent {
  readonly role: AgentRole;
  private readonly provider: ModelProvider;
  private readonly systemPrompt: string;
  private readonly efficiencyPolicy: EfficiencyPolicy;

  constructor(options: ModelAgentOptions) {
    this.role = options.role;
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
    this.efficiencyPolicy = options.efficiencyPolicy ?? DEFAULT_EFFICIENCY_POLICY;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const priorEvidence = compactEvidence(context.priorEvidence, this.efficiencyPolicy);
    const response = await this.provider.generate({
      system: this.systemPrompt,
      prompt: JSON.stringify({
        goal: context.run.masterGoal,
        repo: context.run.repository,
        task: {
          id: context.workItem.id,
          title: context.workItem.title,
          objective: context.workItem.objective,
          acceptanceCriteria: context.workItem.acceptanceCriteria,
          state: context.workItem.state,
          attempt: context.workItem.attempt,
        },
        evidence: priorEvidence,
      }),
      maxOutputTokens: outputBudget(this.role, this.efficiencyPolicy),
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
