export interface DashboardProject {
  id: string;
  repository: string;
  goal: string;
  status: string;
}

export interface DashboardRun {
  id: string;
  status: string;
  activeAgent?: string;
  tokens: number;
  estimatedCostUsd: number;
  events: number;
}

export interface DashboardOverview {
  projects: DashboardProject[];
  runs: DashboardRun[];
}
