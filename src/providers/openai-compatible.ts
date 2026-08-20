import type { ModelProvider, ModelRequest, ModelResponse, ModelUsage } from "./provider.js";

export interface OpenAICompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
      }),
    });

    if (!response.ok) {
      throw new Error(`${this.name} request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${this.name} returned no text output`);

    const usage: ModelUsage = {};
    if (data.usage?.prompt_tokens !== undefined) usage.inputTokens = data.usage.prompt_tokens;
    if (data.usage?.completion_tokens !== undefined) usage.outputTokens = data.usage.completion_tokens;

    return {
      text,
      model: this.model,
      provider: this.name,
      ...(Object.keys(usage).length === 0 ? {} : { usage }),
    };
  }
}
