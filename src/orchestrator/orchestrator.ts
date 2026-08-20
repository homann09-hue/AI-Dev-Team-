import type { Agent, AgentResult } from "../agents/agent.js";
import { assertTransition } from "../core/state-machine.js";
import type { AgentRole, ProjectRun, WorkItem, WorkState } from "../core/types.js";

const roleForState: Partial<Record<WorkState, AgentRole>> = {
  planning: "architect",
  implementing: "developer",
  review: "reviewer",
  qa: "qa",
  live_verification: "live_verifier",
};

export class Orchestrator {
  private readonly agents = new Map<AgentRole, Agent>();

  register(agent: Agent): void {
    this.agents.set(agent.role, agent);
  }

  transition(item: WorkItem, next: WorkState): WorkItem {
    assertTransition(item.state, next);
    return { ...item, state: next, owner: roleForState[next] };
  }

  async executeCurrent(run: ProjectRun, item: WorkItem): Promise<AgentResult> {
    const role = roleForState[item.state];
    if (!role) throw new Error(`No agent role mapped for state: ${item.state}`);
    const agent = this.agents.get(role);
    if (!agent) throw new Error(`No ${role} agent registered`);

    return agent.execute({ run, workItem: item, priorEvidence: item.evidence });
  }
}
