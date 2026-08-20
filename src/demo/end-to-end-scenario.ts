export interface ScenarioStep {
  stage: string;
  agent: string;
  result: string;
}

export interface ScenarioReport {
  goal: string;
  passed: boolean;
  steps: ScenarioStep[];
}

export function runDemoScenario(): ScenarioReport {
  const steps: ScenarioStep[] = [
    { stage: "planning", agent: "architect", result: "work item created" },
    { stage: "implementation", agent: "developer", result: "change prepared" },
    { stage: "tests", agent: "deterministic-gate", result: "passed" },
    { stage: "review", agent: "reviewer", result: "approved" },
    { stage: "qa", agent: "qa", result: "approved" },
    { stage: "verification", agent: "live-verifier", result: "complete" },
  ];

  return {
    goal: "Implement a small validated feature",
    passed: true,
    steps,
  };
}
