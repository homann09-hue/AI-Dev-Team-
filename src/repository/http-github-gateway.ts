import type { RepositoryGateway } from "../actions/github-worker.js";

export interface GitHubGatewayOptions {
  repository: string;
  branch: string;
  token: string;
  apiBaseUrl?: string;
  testRunner?: (command: string) => Promise<unknown>;
}

interface ContentResponse {
  content?: string;
  encoding?: string;
  sha?: string;
}

export class HttpGitHubGateway implements RepositoryGateway {
  private readonly repository: string;
  private readonly branch: string;
  private readonly token: string;
  private readonly apiBaseUrl: string;
  private readonly testRunner: ((command: string) => Promise<unknown>) | undefined;

  constructor(options: GitHubGatewayOptions) {
    this.repository = options.repository;
    this.branch = options.branch;
    this.token = options.token;
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.testRunner = options.testRunner;
  }

  async readFile(path: string, ref = this.branch): Promise<string> {
    const response = await this.request(`/repos/${this.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    const data = await response.json() as ContentResponse;
    if (data.encoding !== "base64" || !data.content) throw new Error(`Unsupported GitHub content response for ${path}`);
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  }

  async searchCode(query: string): Promise<unknown> {
    const q = encodeURIComponent(`${query} repo:${this.repository}`);
    const response = await this.request(`/search/code?q=${q}`);
    return response.json();
  }

  async writeFile(path: string, content: string, message: string): Promise<unknown> {
    let sha: string | undefined;
    const existing = await this.request(`/repos/${this.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`, { allowNotFound: true });
    if (existing.status === 200) {
      const data = await existing.json() as ContentResponse;
      sha = data.sha;
    }

    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    const response = await this.request(`/repos/${this.repository}/contents/${encodePath(path)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async runTests(command: string): Promise<unknown> {
    if (!this.testRunner) throw new Error("No sandboxed test runner configured");
    return this.testRunner(command);
  }

  private async request(path: string, options: { method?: string; body?: string; allowNotFound?: boolean } = {}): Promise<Response> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.token}`,
        "x-github-api-version": "2022-11-28",
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
    });
    if (!response.ok && !(options.allowNotFound && response.status === 404)) {
      throw new Error(`GitHub request failed: ${response.status} ${await response.text()}`);
    }
    return response;
  }
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
