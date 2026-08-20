import type { ActionExecutor } from "../actions/action.js";
import type { Agent, AgentContext, AgentResult } from "./agent.js";
import { buildAgentContext } from "./context-builder.js";
import { parseStructuredAgentOutput } from "./structured-output.js";
import type { AgentRole, Evidence } from "../core/types.js";
import { DEFAULT_EFFICIENCY_POLICY, outputBudget, type EfficiencyPolicy } from "../efficiency/policy.js";
import type { ModelProvider } from "../providers/provider.js";

export interface ModelAgentOptions {
  role: AgentRole;
  provider: ModelProvider;
  systemPrompt: string;
  actionExecutor?: ActionExecutor;
  efficiencyPolicy?: EfficiencyPolicy;
}

function evidenceKindForRole(role: AgentRole): Evidence["kind"] {
  switch (role) {
    case "architect": return "plan";
    case "developer": return "diff";
    case "reviewer": return "review";
    case "qa": return "test";
    case "live_verifier": return "live_check";
    case "lead": return "decision";
  }
}

export class ModelAgent implements Agent {
  readonly role: AgentRole;
  private readonly provider: ModelProvider;
  private readonly systemPrompt: string;
  private readonly actionExecutor: ActionExecutor | undefined;
  private readonly efficiencyPolicy: EfficiencyPolicy;

  constructor(options: ModelAgentOptions) {
    this.role = options.role;
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
    this.actionExecutor = options.actionExecutor;
    this.efficiencyPolicy = options.efficiencyPolicy ?? DEFAULT_EFFICIENCY_POLICY;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const promptContext = buildAgentContext(this.role, context.run, context.workItem, context.priorEvidence, this.efficiencyPolicy);
    const response = await this.provider.generate({
      system: `${this.systemPrompt}\nReturn JSON only: {"summary":string,"approved"?:boolean,"blocker"?:string,"actions":AgentAction[]}. Request only actions needed for this task.`,
      prompt: JSON.stringify(promptContext),
      maxOutputTokens: outputBudget(this.role, this.efficiencyPolicy),
      metadata: { runId: context.run.id, workItemId: context.workItem.id, role: this.role },
    });

    const structured = parseStructuredAgentOutput(response.text);
    if (structured.actions.length > 0 && !this.actionExecutor) {
      throw new Error(`${this.role} requested actions but no executor is configured`);
    }
    for (const action of structured.actions) {
      await this.actionExecutor?.execute(this.role, action);
    }

    const evidence: Evidence = {
      kind: evidenceKindForRole(this.role),
      summary: structured.summary,
      createdAt: new Date().toISOString(),
    };

    return {
      summary: structured.summary,
      evidence: [evidence],
      ...(structured.approved === undefined ? {} : { approved: structured.approved }),
      ...(structured.blocker === undefined ? {} : { blocker: structured.blocker }),
    };
  }
}
