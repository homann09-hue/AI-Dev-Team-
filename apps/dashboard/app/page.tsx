"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDashboard, type DashboardOverview } from "../src/api/client";
import { getSupabaseBrowserClient } from "../src/lib/supabase";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setOverview(await getDashboard());
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
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [ready, refresh]);

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
  }

  const current = overview?.runs[0];
  const currentEvidence = current?.workItems.flatMap((item) => item.evidence).slice(-8).reverse() ?? [];
  if (!ready) return <main className="shell"><p className="muted">Checking session…</p></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Personal control plane · live</div>
          <h1>AI Dev Team</h1>
          <p className="subtitle">Dashboard in the cloud; Codex, Claude and Grok execution securely on your Mac.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="button" href="/projects/new">Start project</Link>
          <button className="button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

      {error ? <section className="error" style={{ marginBottom: 16 }}>{error}</section> : null}

      <section className="grid metrics">
        {[
          ["Active runs", String(overview?.activeRuns ?? 0)],
          ["Current phase", current ? label(current.currentPhase) : "Idle"],
          ["Queue", current?.job ? label(current.job.status) : "Empty"],
          ["Mac worker", overview?.worker.online ? "Online" : "Offline"],
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
            <div><div className="eyebrow">Current run</div><h2>{current?.repository ?? "No project queued"}</h2></div>
            <span className="status"><span className="dot" /> {current ? label(current.status) : "Idle"}</span>
          </div>
          <p className="muted">{current?.goal ?? "Start a project to queue the first local multi-KI run."}</p>
          <div className="agent-grid">
            {(current?.workItems ?? []).map((item) => (
              <div className="agent" key={item.id}>
                <div className="agent-head"><strong>{item.title}</strong><span className="muted">{label(item.state)}</span></div>
                <p>Attempt {item.attempt} · Claude → Codex → tests → Grok</p>
                <small className="muted">{current?.job ? `Job ${label(current.job.status)} · queue attempt ${current.job.attempt}` : `Work item ${item.id.slice(0, 8)}`}</small>
              </div>
            ))}
            {!current?.workItems.length ? <p className="muted">No work items yet.</p> : null}
          </div>
          {current?.job?.lastError ? <div className="error" style={{ marginTop: 14 }}>{current.job.lastError}</div> : null}
        </article>

        <article className="card">
          <div className="eyebrow">Execution boundary</div>
          <h2>{overview?.worker.online ? "Mac worker connected" : "Mac worker offline"}</h2>
          <p><strong>Model authentication:</strong> local subscription sessions</p>
          <p><strong>Cloud secrets:</strong> none for ChatGPT, Claude or Grok</p>
          <p><strong>Persistence:</strong> Supabase/Postgres + RLS</p>
          <p><strong>Worker:</strong> {overview?.worker.workerId ?? "not seen"}</p>
          <p><strong>Last seen:</strong> {overview?.worker.lastSeenAt ? new Date(overview.worker.lastSeenAt).toLocaleString() : "never"}</p>
          <p className="muted">Queued jobs remain safe in Supabase while the Mac is off and continue when the worker starts again.</p>
        </article>
      </section>

      <section className="grid two" style={{ marginTop: 16 }}>
        <article className="card">
          <div className="eyebrow">Evidence</div>
          <h2>Latest gates</h2>
          <div className="timeline">
            {currentEvidence.map((entry, index) => (
              <div className="event" key={`${entry.createdAt}-${index}`}>
                <span className="muted">{label(entry.kind)}</span>
                <strong>{new Date(entry.createdAt).toLocaleTimeString()}</strong>
                <span>{entry.summary}{entry.uri ? <> · <a href={entry.uri} target="_blank" rel="noreferrer">open</a></> : null}</span>
              </div>
            ))}
            {!currentEvidence.length ? <div className="event"><span className="muted">—</span><strong>Pending</strong><span>No evidence yet.</span></div> : null}
          </div>
        </article>

        <article className="card">
          <div className="eyebrow">All runs</div>
          <h2>Project activity</h2>
          <div className="timeline">
            {(overview?.runs ?? []).map((run) => (
              <div className="event" key={run.id}>
                <span className="muted">{new Date(run.updatedAt).toLocaleTimeString()}</span>
                <strong>{run.repository}</strong>
                <span>{label(run.currentPhase)} · {run.job ? label(run.job.status) : "no job"}</span>
              </div>
            ))}
            {!overview?.runs.length ? <div className="event"><span className="muted">—</span><strong>Idle</strong><span>No runs created.</span></div> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
