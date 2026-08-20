export interface CreateProjectRequest {
  repository: string;
  goal: string;
}

export interface CreateProjectResponse {
  runId: string;
}

export async function createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('Project creation failed');
  }

  return response.json() as Promise<CreateProjectResponse>;
}

export async function getDashboard(): Promise<unknown> {
  const response = await fetch('/api/dashboard');
  if (!response.ok) throw new Error('Dashboard unavailable');
  return response.json();
}
