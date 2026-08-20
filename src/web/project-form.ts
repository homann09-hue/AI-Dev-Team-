export interface ProjectStartInput {
  repository: string;
  goal: string;
}

export function validateProjectStart(input: ProjectStartInput): ProjectStartInput {
  if (!input.repository.trim()) throw new Error("Repository required");
  if (!input.goal.trim()) throw new Error("Goal required");

  return {
    repository: input.repository.trim(),
    goal: input.goal.trim(),
  };
}
