"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createProject } from "../../../src/api/client";

export default function NewProjectPage() {
  const [repository, setRepository] = useState("");
  const [goal, setGoal] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRunId(null);
    const repo = repository.trim();
    const masterGoal = goal.trim();
    if (!repo.includes("/") || !masterGoal) {
      setError("Enter a repository as owner/name and a master goal.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createProject({ repository: repo, goal: masterGoal });
      setRunId(result.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project creation failed");
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
          <p className="subtitle">Give the control plane one repository and one master goal. Internal agents handle gated execution.</p>
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
          {runId ? <div className="status"><span className="dot" /> Run created: {runId}</div> : null}
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Starting…" : "Start agents"}</button>
        </form>
      </section>
    </main>
  );
}
