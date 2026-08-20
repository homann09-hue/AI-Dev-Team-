"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createProject, executeRun } from "../../../src/api/client";

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
      setStatus("Creating authenticated run…");
      const created = await createProject({ repository: repo, goal: masterGoal });
      setRunId(created.runId);
      setStatus("Running Architect → Developer → CI → Review → QA → Deploy → Live Verify…");
      const executed = await executeRun(created.runId);
      setStatus(`Run finished with outcome: ${executed.outcome}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run execution failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">New run</div>
          <h1>Start project</h1>
          <p className="subtitle">One repository, one master goal, one gated full-agent execution. Missing runtime configuration fails closed instead of simulating success.</p>
        </div>
        <a className="button" href="/">Back to dashboard</a>
      </header>
      <section className="card" style={{ maxWidth: 760 }}>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Repository</span>
            <input value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="owner/repository" />
          </label>
          <label className="field">
            <span>Master goal</span>
            <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Build this product to the specified Definition of Done..." />
          </label>
          {error ? <div className="error">{error}</div> : null}
          {status ? <div className="status"><span className="dot" /> {status}</div> : null}
          {runId ? <div className="muted">Run ID: {runId}</div> : null}
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Agents running…" : "Start agents"}</button>
        </form>
      </section>
    </main>
  );
}
