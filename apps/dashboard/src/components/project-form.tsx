import { useState } from 'react';
import { createProject } from '../api/client';

export function ProjectForm() {
  const [repository, setRepository] = useState('');
  const [goal, setGoal] = useState('');
  const [runId, setRunId] = useState<string | null>(null);

  async function submit() {
    const result = await createProject({ repository, goal });
    setRunId(result.runId);
  }

  return (
    <section>
      <h2>Start AI Development Run</h2>
      <input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" />
      <textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Master goal" />
      <button onClick={submit}>Start</button>
      {runId && <p>Run: {runId}</p>}
    </section>
  );
}
