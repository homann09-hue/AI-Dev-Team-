import type { AgentRole } from "../core/types.js";

/**
 * Read-model event shape used by dashboard aggregation.
 * It intentionally accepts both legacy dotted event names and the newer
 * persisted underscore names so existing runs remain readable.
 */
export interface RunEvent {
  type: string;
  runId: string;
  id?: string;
  at?: string;
  createdAt?: string;
  role?: AgentRole;
  agent?: AgentRole;
  workItemId?: string;
  summary?: string;
  detail?: string;
}

export type RunEventType = RunEvent["type"];
