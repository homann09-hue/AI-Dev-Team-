export interface RunStatusCardProps {
  status: string;
  activeAgent?: string;
  tokens: number;
  costUsd: number;
}

export function RunStatusCard(props: RunStatusCardProps): string {
  return [
    `Status: ${props.status}`,
    `Agent: ${props.activeAgent ?? "idle"}`,
    `Tokens: ${props.tokens}`,
    `Cost: $${props.costUsd.toFixed(4)}`,
  ].join("\n");
}
