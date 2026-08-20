export interface AgentCardData {
  role: string;
  status: "idle" | "running" | "completed" | "blocked";
  tokens: number;
  costUsd: number;
  lastAction?: string;
}

export function AgentCards({ agents }: { agents: AgentCardData[] }) {
  return agents.map((agent) => ({
    title: agent.role,
    status: agent.status,
    metrics: {
      tokens: agent.tokens,
      costUsd: agent.costUsd,
    },
    lastAction: agent.lastAction ?? "-",
  }));
}
