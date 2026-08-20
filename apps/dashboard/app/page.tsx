import Link from "next/link";

const agents = [
  ["Architect", "done", "Plan and acceptance criteria ready", "1,240", "$0.03"],
  ["Developer", "working", "Implementing current work item", "8,410", "$0.21"],
  ["Reviewer", "waiting", "Waiting for deterministic gates", "0", "$0.00"],
  ["QA", "waiting", "Waiting for review approval", "0", "$0.00"],
  ["Live Verifier", "waiting", "Waiting for deployment", "0", "$0.00"],
];

const events = [
  ["07:12", "Architect", "Planning completed"],
  ["07:14", "Developer", "Work item started"],
  ["07:18", "Developer", "Repository changes in progress"],
  ["—", "Tests", "Pending"],
];

export default function DashboardPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Control plane</div>
          <h1>AI Dev Team</h1>
          <p className="subtitle">One master goal, gated multi-agent execution, measurable token and cost usage.</p>
        </div>
        <Link className="button" href="/projects/new">Start project</Link>
      </header>

      <section className="grid metrics">
        {[["Active runs","1"],["Current phase","Implementing"],["Tokens","9,650"],["Estimated cost","$0.24"]].map(([label,value]) => (
          <article className="card" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
          </article>
        ))}
      </section>

      <section className="grid two">
        <article className="card">
          <div className="agent-head">
            <div>
              <div className="eyebrow">Current run</div>
              <h2>Repository delivery</h2>
            </div>
            <span className="status"><span className="dot" /> Running</span>
          </div>
          <p className="muted">Developer is the only role with product-code mutation authority. Reviewer and QA remain read-only.</p>
          <div className="agent-grid">
            {agents.map(([role,status,last,tokens,cost]) => (
              <div className="agent" key={role}>
                <div className="agent-head"><strong>{role}</strong><span className="muted">{status}</span></div>
                <p>{last}</p>
                <small className="muted">{tokens} tokens · {cost}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <div className="eyebrow">Safety & budget</div>
          <h2>Run guardrails</h2>
          <p><strong>Mutation policy:</strong> Developer only</p>
          <p><strong>Retry budget:</strong> 6 attempts/work item</p>
          <p><strong>Context policy:</strong> Role-scoped</p>
          <p><strong>Test policy:</strong> Deterministic before model review</p>
        </article>
      </section>

      <section className="card" style={{marginTop:16}}>
        <div className="eyebrow">Audit trail</div>
        <h2>Run timeline</h2>
        <div className="timeline">
          {events.map(([time,role,summary]) => (
            <div className="event" key={`${time}-${role}-${summary}`}>
              <span className="muted">{time}</span><strong>{role}</strong><span>{summary}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
