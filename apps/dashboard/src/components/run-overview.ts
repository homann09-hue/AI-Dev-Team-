export interface RunOverview {
  runId: string;
  status: string;
  activeAgent?: string;
  progress: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function createRunOverview(data: RunOverview): RunOverview {
  return data;
}
