import type { Agent, AgentContext, AgentResult } from "../../../../dist/src/agents/agent.js";
import { ModelAgent } from "../../../../dist/src/agents/model-agent.js";
import type { Evidence, ProjectRun, WorkItem } from "../../../../dist/src/core/types.js";
import { GitHubWorker } from "../../../../dist/src/actions/github-worker.js";
import { OpenAICompatibleProvider } from "../../../../dist/src/providers/openai-compatible.js";
import { HttpGitHubGateway } from "../../../../dist/src/repository/http-github-gateway.js";
import type { RunStore } from "../../../../dist/src/storage/run-store.js";
import { FullRunExecutor, type DeploymentGate } from "../../../../dist/src/workflow/full-runner.js";
import type { DeterministicGate } from "../../../../dist/src/workflow/gated-workflow.js";

interface RunnerConfig {
  providerBaseUrl: string;
  providerApiKey: string;
  providerModel: string;
  githubToken: string;
  deploymentUrl: string;
}

export interface RunnerReadiness {
  ready: boolean;
  missing: string[];
}

function readConfig(): RunnerConfig | undefined {
  const providerApiKey = process.env.AI_PROVIDER_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const githubToken = process.env.AI_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  const providerModel = process.env.AI_PROVIDER_MODEL ?? "";
  const deploymentUrl = process.env.AI_DEPLOYMENT_URL ?? "";
  if (!providerApiKey || !githubToken || !providerModel || !deploymentUrl) return undefined;
  return {
    providerBaseUrl: process.env.AI_PROVIDER_BASE_URL ?? "https://api.openai.com/v1",
    providerApiKey,
    providerModel,
    githubToken,
    deploymentUrl,
  };
}

export function getRunnerReadiness(): RunnerReadiness {
  const missing: string[] = [];
  if (!(process.env.AI_PROVIDER_API_KEY ?? process.env.OPENAI_API_KEY)) missing.push("AI_PROVIDER_API_KEY or OPENAI_API_KEY");
  if (!(process.env.AI_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN)) missing.push("AI_GITHUB_TOKEN or GITHUB_TOKEN");
  if (!process.env.AI_PROVIDER_MODEL) missing.push("AI_PROVIDER_MODEL");
  if (!process.env.AI_DEPLOYMENT_URL) missing.push("AI_DEPLOYMENT_URL");
  return { ready: missing.length === 0, missing };
}

class UrlLiveVerifier implements Agent {
  readonly role = "live_verifier" as const;
  constructor(private readonly url: string) {}

  async execute(_context: AgentContext): Promise<AgentResult> {
    const response = await fetch(this.url, { redirect: "follow", cache: "no-store" });
    const evidence: Evidence = {
      kind: "live_check",
      summary: `Live endpoint ${this.url} returned HTTP ${response.status}`,
      uri: this.url,
      createdAt: new Date().toISOString(),
    };
    if (!response.ok) return { summary: evidence.summary, evidence: [evidence], blocker: evidence.summary };
    return { summary: evidence.summary, evidence: [evidence], approved: true };
  }
}

async function githubRequest(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub API failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return response;
}

async function ensureAgentBranch(repository: string, runId: string, token: string): Promise<string> {
  const branch = `ai-dev-team/${runId.slice(0, 12)}`;
  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  const existing = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${encodedBranch}`, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" },
    cache: "no-store",
  });
  if (existing.ok) return branch;
  if (existing.status !== 404) throw new Error(`GitHub branch lookup failed (${existing.status})`);

  const repoResponse = await githubRequest(token, `/repos/${repository}`);
  const repo = await repoResponse.json() as { default_branch?: string };
  if (!repo.default_branch) throw new Error("Repository has no default branch");
  const baseRef = await githubRequest(token, `/repos/${repository}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
  const base = await baseRef.json() as { object?: { sha?: string } };
  if (!base.object?.sha) throw new Error("Unable to resolve repository default branch SHA");
  await githubRequest(token, `/repos/${repository}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
  });
  return branch;
}

async function waitForCi(repository: string, branch: string, token: string): Promise<unknown> {
  const deadline = Date.now() + 20_000;
  let lastSummary = "No CI check runs found";
  while (Date.now() < deadline) {
    const ref = await githubRequest(token, `/repos/${repository}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`);
    const refData = await ref.json() as { object?: { sha?: string } };
    const sha = refData.object?.sha;
    if (!sha) throw new Error("Unable to resolve agent branch SHA");
    const checks = await githubRequest(token, `/repos/${repository}/commits/${sha}/check-runs`);
    const data = await checks.json() as { check_runs?: Array<{ name?: string; status?: string; conclusion?: string | null }> };
    const runs = data.check_runs ?? [];
    if (runs.length === 0) {
      lastSummary = "No CI check runs found for latest agent commit";
    } else if (runs.every((run) => run.status === "completed")) {
      const failed = runs.filter((run) => !["success", "neutral", "skipped"].includes(run.conclusion ?? ""));
      if (failed.length > 0) throw new Error(`CI failed: ${failed.map((run) => `${run.name ?? "check"}=${run.conclusion ?? "unknown"}`).join(", ")}`);
      return runs;
    } else {
      lastSummary = `CI still running: ${runs.filter((run) => run.status !== "completed").map((run) => run.name ?? "check").join(", ")}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${lastSummary}; CI gate timed out after 20s`);
}

class AutoDeploymentGate implements DeploymentGate {
  constructor(private readonly url: string) {}
  async run(_run: ProjectRun, _item: WorkItem): Promise<Evidence> {
    const response = await fetch(this.url, { redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`Deployment URL returned HTTP ${response.status}`);
    return {
      kind: "deployment",
      summary: `Deployment endpoint reachable at ${this.url}`,
      uri: this.url,
      createdAt: new Date().toISOString(),
    };
  }
}

export async function buildConfiguredFullRunner(store: RunStore, run: ProjectRun): Promise<FullRunExecutor> {
  const config = readConfig();
  if (!config) {
    const readiness = getRunnerReadiness();
    throw new Error(`Agent runner not configured: missing ${readiness.missing.join(", ")}`);
  }

  const branch = await ensureAgentBranch(run.repository, run.id, config.githubToken);
  const gateway = new HttpGitHubGateway({
    repository: run.repository,
    branch,
    token: config.githubToken,
    testRunner: async (_command) => waitForCi(run.repository, branch, config.githubToken),
  });
  const actions = new GitHubWorker(gateway);
  const provider = new OpenAICompatibleProvider({
    name: "configured-provider",
    baseUrl: config.providerBaseUrl,
    apiKey: config.providerApiKey,
    model: config.providerModel,
  });

  const architect = new ModelAgent({ role: "architect", provider, actionExecutor: actions, systemPrompt: "Create a concise implementation plan grounded in the repository. Read files as needed. Do not mutate code." });
  const developer = new ModelAgent({ role: "developer", provider, actionExecutor: actions, systemPrompt: "Implement the work item completely. You are the only role allowed to write product code. Use repository tools and keep changes focused." });
  const reviewer = new ModelAgent({ role: "reviewer", provider, actionExecutor: actions, systemPrompt: "Review the implementation and test evidence. Do not mutate code. Set approved=true only if the work satisfies the goal and acceptance criteria." });
  const qa = new ModelAgent({ role: "qa", provider, actionExecutor: actions, systemPrompt: "Validate behavior and test evidence. Do not mutate code. Set approved=true only when quality gates pass." });
  const liveVerifier = new UrlLiveVerifier(config.deploymentUrl);
  const deterministicGate: DeterministicGate = {
    run: async () => {
      await waitForCi(run.repository, branch, config.githubToken);
      return {
        kind: "test",
        summary: `GitHub CI passed for ${branch}`,
        createdAt: new Date().toISOString(),
        uri: `https://github.com/${run.repository}/tree/${branch}`,
      };
    },
  };

  return new FullRunExecutor(store, architect, developer, reviewer, qa, liveVerifier, deterministicGate, new AutoDeploymentGate(config.deploymentUrl));
}
