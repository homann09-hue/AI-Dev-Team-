import type { WorkState } from "./types.js";

const transitions: Record<WorkState, readonly WorkState[]> = {
  todo: ["planning", "blocked"],
  planning: ["ready", "blocked", "failed"],
  ready: ["implementing", "blocked"],
  implementing: ["review", "blocked", "failed"],
  review: ["implementing", "qa", "blocked", "failed"],
  qa: ["implementing", "deploying", "blocked", "failed"],
  deploying: ["live_verification", "blocked", "failed"],
  live_verification: ["implementing", "done", "blocked", "failed"],
  done: [],
  blocked: ["planning", "implementing", "review", "qa", "deploying", "live_verification", "failed"],
  failed: ["planning"],
};

export function canTransition(from: WorkState, to: WorkState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: WorkState, to: WorkState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid workflow transition: ${from} -> ${to}`);
  }
}
