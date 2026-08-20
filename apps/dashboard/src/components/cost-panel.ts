export interface CostPanelData {
  totalTokens: number;
  totalCostUsd: number;
  modelCalls: number;
}

export function createCostPanel(data: CostPanelData): CostPanelData {
  return data;
}
