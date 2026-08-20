export interface DashboardSnapshot {
  generatedAt: string;
  projects: unknown[];
  runs: unknown[];
}

export interface DashboardSnapshotSource {
  create(): Promise<unknown>;
}

export class DashboardSnapshotService {
  constructor(private readonly source?: DashboardSnapshotSource) {}

  async create(): Promise<unknown> {
    if (this.source) {
      return this.source.create();
    }

    const snapshot: DashboardSnapshot = {
      generatedAt: new Date().toISOString(),
      projects: [],
      runs: [],
    };

    return snapshot;
  }
}
