export interface AgentStatus {
  role: string;
  status: "idle" | "working" | "done" | "blocked";
  tokens: number;
  costUsd: number;
  lastAction: string;
}

export function AgentStatusGrid({ agents }: { agents: AgentStatus[] }) {
  return {
    title: "Agents",
    agents,
  };
}
