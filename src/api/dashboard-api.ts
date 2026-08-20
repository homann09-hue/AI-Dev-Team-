import type { DashboardSnapshotService } from "../dashboard/snapshot.js";

export interface DashboardApi {
  getOverview(): Promise<unknown>;
}

export class DashboardApiService implements DashboardApi {
  constructor(private readonly snapshotService: DashboardSnapshotService) {}

  async getOverview(): Promise<unknown> {
    return this.snapshotService.create();
  }
}
