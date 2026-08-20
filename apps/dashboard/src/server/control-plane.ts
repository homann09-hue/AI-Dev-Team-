import type { ProjectRun } from "../../../../dist/src/core/types.js";
import { Runtime } from "../../../../dist/src/runtime/runtime.js";
import type { RunStore } from "../../../../dist/src/storage/run-store.js";
import { supabaseRunStoreFromEnv, type SupabaseRunStore } from "../../../../dist/src/storage/supabase-run-store.js";

interface DashboardStore extends RunStore {
  list(): Promise<ProjectRun[]>;
}

class DashboardMemoryRunStore implements DashboardStore {
  private readonly runs = new Map<string, ProjectRun>();

  async get(runId: string): Promise<ProjectRun | undefined> {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : undefined;
  }

  async save(run: ProjectRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async list(): Promise<ProjectRun[]> {
    return [...this.runs.values()]
      .map((run) => structuredClone(run))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

const configuredSupabase = supabaseRunStoreFromEnv() as SupabaseRunStore | undefined;
const persistenceMode = configuredSupabase ? "supabase" : "memory";

const globalState = globalThis as typeof globalThis & {
  __aiDevTeamRunStore?: DashboardStore;
  __aiDevTeamRuntime?: Runtime;
};

export const runStore: DashboardStore = globalState.__aiDevTeamRunStore
  ?? configuredSupabase
  ?? new DashboardMemoryRunStore();
export const runtime = globalState.__aiDevTeamRuntime ?? new Runtime(runStore, []);

globalState.__aiDevTeamRunStore = runStore;
globalState.__aiDevTeamRuntime = runtime;

export function getPersistenceHealth() {
  const production = process.env.VERCEL_ENV === "production";
  const ready = !production || persistenceMode === "supabase";
  return {
    ready,
    production,
    persistence: persistenceMode,
    reason: ready ? null : "Production requires SUPABASE_URL and SUPABASE_SECRET_KEY",
  };
}

function assertPersistenceReady(): void {
  const health = getPersistenceHealth();
  if (!health.ready) throw new Error(health.reason ?? "Persistence unavailable");
}

export async function createDashboardRun(repository: string, goal: string): Promise<ProjectRun> {
  assertPersistenceReady();
  const normalizedRepository = repository.trim();
  const normalizedGoal = goal.trim();
  if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(normalizedRepository)) {
    throw new Error("repository must use owner/name format");
  }
  if (!normalizedGoal) throw new Error("goal required");

  const run = await runtime.createRun(normalizedRepository, normalizedGoal);
  const item = await runtime.addWorkItem(
    run.id,
    "Plan master goal",
    normalizedGoal,
    ["Architecture and execution plan produced", "Acceptance criteria defined before implementation"],
  );
  await runtime.transition(run.id, item.id, "planning");
  return (await runStore.get(run.id)) ?? run;
}

export async function getDashboardOverview() {
  assertPersistenceReady();
  const runs = await runStore.list();
  const activeRuns = runs.filter((run) => run.status === "active");
  const totalWorkItems = runs.reduce((sum, run) => sum + run.workItems.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    persistence: persistenceMode,
    activeRuns: activeRuns.length,
    totalRuns: runs.length,
    totalWorkItems,
    runs: runs.map((run) => ({
      id: run.id,
      repository: run.repository,
      goal: run.masterGoal,
      status: run.status,
      updatedAt: run.updatedAt,
      currentPhase: run.workItems[0]?.state ?? "todo",
      workItems: run.workItems.map((item) => ({
        id: item.id,
        title: item.title,
        state: item.state,
        attempt: item.attempt,
      })),
    })),
  };
}
