import type { AgentAction } from "../actions/action.js";
import { validateAgentAction } from "../actions/validate-action.js";

export interface StructuredAgentOutput {
  summary: string;
  approved?: boolean;
  blocker?: string;
  actions: AgentAction[];
}

export function parseStructuredAgentOutput(text: string): StructuredAgentOutput {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Agent output must be valid JSON");
  }

  if (!value || typeof value !== "object") throw new Error("Agent output must be an object");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.summary !== "string") throw new Error("Agent output requires summary");
  if (!Array.isArray(candidate.actions)) throw new Error("Agent output requires actions array");

  return {
    summary: candidate.summary,
    ...(typeof candidate.approved === "boolean" ? { approved: candidate.approved } : {}),
    ...(typeof candidate.blocker === "string" ? { blocker: candidate.blocker } : {}),
    actions: candidate.actions.map(validateAgentAction),
  };
}
