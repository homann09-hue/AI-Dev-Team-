"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createProject,
  executeRun,
  getDashboard,
  type DashboardEvidence,
  type DashboardOverview,
  type DashboardRun,
} from "../src/api/client";
import { getSupabaseBrowserClient } from "../src/lib/supabase";

const PIPELINE = [
  { state: "planning", label: "Claude", detail: "Architecture & plan" },
  { state: "implementing", label: "Codex", detail: "Implementation" },
  { state: "review", label: "Tests", detail: "Deterministic QA" },
  { state: "qa", label: "Grok", detail: "Independent review" },
  { state: "deploying", label: "GitHub", detail: "Commit, push & PR" },
  { state: "live_verification", label: "Verify", detail: "Remote delivery" },
  { state: "done", label: "Done", detail: "Completed" },
] as const;

const STATE_ORDER = new Map(PIPELINE.map((phase, index) => [phase.state, index]));

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeTime(value?: string) {
  if (!value) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(value).toLocaleString();
}

function evidenceRole(entry: DashboardEvidence) {
  switch (entry.kind) {
    case "plan": return "Claude · Architect";
    case "diff": return "Codex · Developer";
    case "test": return "Deterministic QA";
    case "review": return "Grok · Reviewer";
    case "deployment": return "GitHub · Delivery";
    case "live_check": return "Live verifier";
    case "decision": return "Control plane";
    default: return label(entry.kind);
  }
}

function runEvidence(run?: DashboardRun) {
  return run?.workItems.flatMap((item) => item.evidence).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) ?? [];
}

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [repository, setRepository] = useState("homann09-hue/AI-Dev-Team-");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getDashboard();
      setOverview(next);
      setSelectedRunId((current) => {
        if (current && next.runs.some((run) => run.id === current)) return current;
        return next.runs[0]?.id ?? null;
      });
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Dashboard unavailable";
      if (message.includes("authentication")) {
        router.replace("/login");
        return;
      }
      setError(message);
    }
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setReady(true);
      void refresh();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => listener.subscription.unsubscribe();
  }, [refresh, router]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [ready, refresh]);

  const selectedRun = useMemo(
    () => overview?.runs.find((run) => run.id === selectedRunId) ?? overview?.runs[0],
    [overview, selectedRunId],
  );
  const evidence = useMemo(() => runEvidence(selectedRun), [selectedRun]);
  const currentIndex = STATE_ORDER.get(selectedRun?.currentPhase as (typeof PIPELINE)[number]["state"]);
  const queuedCount = overview?.runs.filter((run) => run.job?.status === "queued").length ?? 0;
  const runningCount = overview?.runs.filter((run) => run.job?.status === "running").length ?? 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const repo = repository.trim();
    const masterGoal = goal.trim();
    if (!/^[-_.A-Za-z0-9]+\/[-_.A-Za-z0-9]+$/.test(repo)) {
      setError("Repository must use owner/name format.");
      return;
    }
    if (!masterGoal) {
      setError("Enter a master goal.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setActionStatus("Creating run and adding it to the Mac queue…");
    try {
      const created = await createProject({ repository: repo, goal: masterGoal });
      setSelectedRunId(created.runId);
      setGoal("");
      setActionStatus(`Queued run ${created.runId.slice(0, 8)}. The Mac worker will pick it up automatically.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project queueing failed");
      setActionStatus(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function retrySelected() {
    if (!selectedRun) return;
    setRetrying(true);
    setError(null);
    setActionStatus("Requeueing failed run…");
    try {
      await executeRun(selectedRun.id);
      setActionStatus("Run requeued. The Mac worker will retry it automatically.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not requeue run");
      setActionStatus(null);
    } finally {
      setRetrying(false);
    }
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
  }

  if (!ready) return <main className="shell"><p className="muted">Checking session…</p></main>;

  return (
    <main className="shell command-shell">
      <header className="command-header">
        <div>
          <div className="brand-line"><span className="brand-mark">AD</span><span>AI Dev Team</span></div>
          <h1>Development command center</h1>
          <p className="subtitle">One goal in. Claude plans, Codex builds, deterministic gates test, Grok reviews, GitHub delivers.</p>
        </div>
        <div className="header-actions">
          <div className={`worker-pill ${overview?.worker.online ? "online" : "offline"}`}>
            <span className="status-light" />
            <div><strong>Mac worker {overview?.worker.online ? "online" : "offline"}</strong><small>{relativeTime(overview?.worker.lastSeenAt)}</small></div>
          </div>
          <button className="ghost-button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

      {error ? <div className="banner error-banner">{error}</div> : null}
      {actionStatus ? <div className="banner success-banner">{actionStatus}</div> : null}

      <section className="metrics-row">
        <div className="metric-tile"><span>Worker</span><strong>{overview?.worker.online ? "Online" : "Offline"}</strong><small>{overview?.worker.workerId?.split("-").slice(0, -1).join("-") || "Not connected"}</small></div>
        <div className="metric-tile"><span>Running</span><strong>{runningCount}</strong><small>active local execution</small></div>
        <div className="metric-tile"><span>Queued</span><strong>{queuedCount}</strong><small>waiting for the Mac</small></div>
        <div className="metric-tile"><span>Total runs</span><strong>{overview?.totalRuns ?? 0}</strong><small>persistent history</small></div>
      </section>

      <section className="command-grid">
        <aside className="left-rail">
          <article className="panel compose-panel">
            <div className="panel-heading"><div><span className="eyebrow">New job</span><h2>Give the team a goal</h2></div><span className="mini-badge">local AI</span></div>
            <form className="form" onSubmit={submit}>
              <label className="field">
                <span>GitHub repository</span>
                <input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" autoComplete="off" />
              </label>
              <label className="field">
                <span>Master goal</span>
                <textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the result you want. Include constraints and Definition of Done when useful." />
              </label>
              <button className="primary-button" type="submit" disabled={submitting || !overview?.worker.online}>
                {submitting ? "Queueing…" : overview?.worker.online ? "Start AI Dev Team" : "Worker offline"}
              </button>
              <p className="microcopy">The cloud stores the job and evidence. Model sessions stay on your Mac.</p>
            </form>
          </article>

          <article className="panel history-panel">
            <div className="panel-heading"><div><span className="eyebrow">History</span><h2>Runs</h2></div><span className="count-badge">{overview?.runs.length ?? 0}</span></div>
            <div className="run-list">
              {(overview?.runs ?? []).map((run) => (
                <button key={run.id} className={`run-row ${run.id === selectedRun?.id ? "selected" : ""}`} onClick={() => setSelectedRunId(run.id)}>
                  <div className="run-row-top"><strong>{run.repository}</strong><span className={`job-state state-${run.job?.status ?? run.status}`}>{label(run.job?.status ?? run.status)}</span></div>
                  <span className="run-goal">{run.goal}</span>
                  <div className="run-meta"><span>{label(run.currentPhase)}</span><span>{relativeTime(run.updatedAt)}</span></div>
                </button>
              ))}
              {!overview?.runs.length ? <div className="empty-state">No runs yet. Create your first job above.</div> : null}
            </div>
          </article>
        </aside>

        <section className="workspace">
          <article className="panel run-hero">
            <div className="run-title-row">
              <div>
                <span className="eyebrow">Selected run</span>
                <h2>{selectedRun?.repository ?? "No run selected"}</h2>
                <p>{selectedRun?.goal ?? "Create a job to see the full execution trace here."}</p>
              </div>
              {selectedRun ? <div className="run-actions">
                <span className={`large-state state-${selectedRun.job?.status ?? selectedRun.status}`}>{label(selectedRun.job?.status ?? selectedRun.status)}</span>
                {(selectedRun.job?.status === "failed" || selectedRun.status === "failed") ? <button className="secondary-button" disabled={retrying} onClick={() => void retrySelected()}>{retrying ? "Requeueing…" : "Retry run"}</button> : null}
              </div> : null}
            </div>
            {selectedRun?.job?.lastError ? <pre className="failure-box">{selectedRun.job.lastError}</pre> : null}
          </article>

          <article className="panel pipeline-panel">
            <div className="panel-heading"><div><span className="eyebrow">Live pipeline</span><h2>Execution</h2></div><span className="refresh-note">auto-refresh 2.5s</span></div>
            <div className="pipeline">
              {PIPELINE.map((phase, index) => {
                const isFailed = selectedRun?.currentPhase === "failed";
                const isDone = selectedRun?.currentPhase === "done" || selectedRun?.status === "completed";
                const completed = isDone || (currentIndex !== undefined && index < currentIndex);
                const active = currentIndex === index && !isDone;
                return (
                  <div className={`phase ${completed ? "complete" : ""} ${active ? "active" : ""} ${isFailed && index === Math.max(0, currentIndex ?? 0) ? "failed" : ""}`} key={phase.state}>
                    <div className="phase-index">{completed ? "✓" : index + 1}</div>
                    <div><strong>{phase.label}</strong><span>{phase.detail}</span></div>
                  </div>
                );
              })}
            </div>
          </article>

          <div className="workspace-split">
            <article className="panel output-panel">
              <div className="panel-heading"><div><span className="eyebrow">Agent output</span><h2>Evidence & decisions</h2></div><span className="count-badge">{evidence.length}</span></div>
              <div className="output-stream">
                {evidence.map((entry, index) => (
                  <details className="output-entry" key={`${entry.createdAt}-${index}`} open={index === evidence.length - 1}>
                    <summary>
                      <div className="output-icon">{entry.kind === "test" ? "T" : entry.kind === "review" ? "G" : entry.kind === "diff" ? "C" : entry.kind === "plan" ? "A" : "•"}</div>
                      <div className="output-heading"><strong>{evidenceRole(entry)}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span></div>
                      <span className="output-kind">{label(entry.kind)}</span>
                    </summary>
                    <pre>{entry.summary}</pre>
                    {entry.uri ? <a className="output-link" href={entry.uri} target="_blank" rel="noreferrer">Open evidence ↗</a> : null}
                  </details>
                ))}
                {!evidence.length ? <div className="empty-state tall">Agent output will appear here as soon as the worker starts processing this run.</div> : null}
              </div>
            </article>

            <aside className="panel details-panel">
              <div className="panel-heading"><div><span className="eyebrow">Runtime</span><h2>Run details</h2></div></div>
              <dl className="detail-list">
                <div><dt>Run ID</dt><dd>{selectedRun?.id ?? "—"}</dd></div>
                <div><dt>Job ID</dt><dd>{selectedRun?.job?.id ?? "—"}</dd></div>
                <div><dt>Queue attempt</dt><dd>{selectedRun?.job?.attempt ?? 0}</dd></div>
                <div><dt>Current phase</dt><dd>{selectedRun ? label(selectedRun.currentPhase) : "—"}</dd></div>
                <div><dt>Worker</dt><dd>{selectedRun?.job?.workerId ?? overview?.worker.workerId ?? "—"}</dd></div>
                <div><dt>Heartbeat</dt><dd>{relativeTime(selectedRun?.job?.heartbeatAt)}</dd></div>
              </dl>
              <div className="security-note"><strong>Execution boundary</strong><p>Claude, Codex and Grok run locally. Supabase stores only orchestration state, evidence and queue data.</p></div>
            </aside>
          </div>
        </section>
      </section>
    </main>
  );
}
