export default function DashboardPage() {
  const metrics = [
    ["Active Runs", "1"],
    ["Agents", "6"],
    ["Tokens", "18,420"],
    ["Cost", "€0.84"],
  ];

  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>AI Dev Team Dashboard</h1>
      <p>Multi-agent development control plane</p>

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(4, 1fr)" }}>
        {metrics.map(([name, value]) => (
          <div key={name} style={{ border: "1px solid #ddd", padding: 20, borderRadius: 12 }}>
            <strong>{name}</strong>
            <div>{value}</div>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Run Timeline</h2>
        <ol>
          <li>Planning completed</li>
          <li>Developer agent active</li>
          <li>Tests pending</li>
          <li>Reviewer waiting</li>
        </ol>
      </section>
    </main>
  );
}
