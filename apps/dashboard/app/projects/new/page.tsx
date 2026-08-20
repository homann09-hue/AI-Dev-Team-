export default function NewProjectPage() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Start Project Run</h1>
      <form>
        <label>
          Repository
          <input name="repository" placeholder="owner/repository" />
        </label>
        <br />
        <label>
          Master Goal
          <textarea name="goal" placeholder="Build product to market readiness" />
        </label>
        <br />
        <button type="submit">Start Agents</button>
      </form>
    </main>
  );
}
