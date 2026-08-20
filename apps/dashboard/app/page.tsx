"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getDashboard, type DashboardOverview } from "../src/api/client";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOverview(await getDashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const current = overview?.runs[0];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Control plane · live</div>
          <h1>AI Dev Team</h1>
          <p className="subtitle">One master goal, gated multi-agent execution and runtime-backed project state.</p>
        </div>
        <Link className="button" href="/projects/new">Start project</Link>
      </header>

      {error ? <section className="error" style={{ marginBottom: 16 }}>{error}</section> : null}

      <section className="grid metrics">
        {[
          ["Active runs", String(overview?.activeRuns ?? 0)],
          ["Current phase", current ? label(current.currentPhase) : "Idle"],
          ["Work items", String(overview?.totalWorkItems ?? 0)],
          ["Persistence", overview?.persistence === "memory" ? "Memory" : "—"],
        ].map(([metricLabel, value]) => (
          <article className="card" key={metricLabel}>
            <div className="metric-label">{metricLabel}</div>
            <div className="metric-value">{value}</div>
          </article>
        ))}
      </section>

      <section className="grid two">
        <article className="card">
          <div className="agent-head">
            <div>
              <div className="eyebrow">Current run</div>
              <h2>{current?.repository ?? "No active project"}</h2>
            </div>
            <span className="status"><span className="dot" /> {current ? label(current.status) : "Idle"}</span>
          </div>
          <p className="muted">{current?.goal ?? "Start a project to create the first runtime-backed run."}</p>
          <div className="agent-grid">
            {(current?.workItems ?? []).map((item) => (
              <div className="agent" key={item.id}>
                <div className="agent-head"><strong>{item.title}</strong><span className="muted">{label(item.state)}</span></div>
                <p>Attempt {item.attempt} · deterministic gated workflow</p>
                <small className="muted">Work item {item.id.slice(0, 8)}</small>
              </div>
            ))}
            {!current?.workItems.length ? <p className="muted">No work items yet.</p> : null}
          </div>
        </article>

        <article className="card">
          <div className="eyebrow">Runtime status</div>
          <h2>Execution boundary</h2>
          <p><strong>Runtime API:</strong> connected</p>
          <p><strong>Polling:</strong> every 4 seconds</p>
          <p><strong>Mutation policy:</strong> Developer only</p>
          <p><strong>Persistence:</strong> in-memory process store</p>
          <p className="muted">Database persistence is intentionally not claimed yet; server restarts can clear this state.</p>
        </article>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="eyebrow">Runtime runs</div>
        <h2>Project activity</h2>
        <div className="timeline">
          {(overview?.runs ?? []).map((run) => (
            <div className="event" key={run.id}>
              <span className="muted">{new Date(run.updatedAt).toLocaleTimeString()}</span>
              <strong>{run.repository}</strong>
              <span>{label(run.currentPhase)} · {run.workItems.length} work item(s)</span>
            </div>
          ))}
          {!overview?.runs.length ? <div className="event"><span className="muted">—</span><strong>Idle</strong><span>No runs created.</span></div> : null}
        </div>
      </section>
    </main>
  );
}
