import type { DashboardSnapshotService } from "../dashboard/snapshot.js";

export interface DashboardViewModel {
  title: string;
  status: string;
  projects: unknown;
}

export class DashboardViewModelService {
  constructor(private readonly snapshots: DashboardSnapshotService) {}

  async create(): Promise<DashboardViewModel> {
    const snapshot = await this.snapshots.create();
    return {
      title: "AI Dev Team Dashboard",
      status: "online",
      projects: snapshot,
    };
  }
}
