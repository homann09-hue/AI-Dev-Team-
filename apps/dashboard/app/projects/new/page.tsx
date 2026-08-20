"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createProject } from "../../../src/api/client";

export default function NewProjectPage() {
  const [repository, setRepository] = useState("");
  const [goal, setGoal] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRunId(null);
    setStatus(null);
    const repo = repository.trim();
    const masterGoal = goal.trim();
    if (!repo.includes("/") || !masterGoal) {
      setError("Enter a repository as owner/name and a master goal.");
      return;
    }
    setSubmitting(true);
    try {
      setStatus("Creating run and queueing it for your Mac…");
      const created = await createProject({ repository: repo, goal: masterGoal });
      setRunId(created.runId);
      setStatus("Queued. Your local worker will use Claude → Codex → tests → Grok → GitHub delivery.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project queueing failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">New local run</div>
          <h1>Start project</h1>
          <p className="subtitle">The dashboard stores only the job. Your authenticated Mac runs Codex, Claude and Grok locally through your existing subscriptions.</p>
        </div>
        <a className="button" href="/">Back to dashboard</a>
      </header>
      <section className="card" style={{ maxWidth: 760 }}>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Repository</span>
            <input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" />
          </label>
          <label className="field">
            <span>Master goal</span>
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Build this product to the specified Definition of Done..." />
          </label>
          {error ? <div className="error">{error}</div> : null}
          {status ? <div className="status"><span className="dot" /> {status}</div> : null}
          {runId ? <div className="muted">Run ID: {runId}</div> : null}
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Queueing…" : "Queue agents"}</button>
        </form>
      </section>
    </main>
  );
}
