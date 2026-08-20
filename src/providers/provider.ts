export interface ModelRequest {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  metadata?: Record<string, string>;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}

export interface ModelResponse {
  text: string;
  model: string;
  provider: string;
  usage?: ModelUsage;
}

export interface ModelProvider {
  readonly name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): ModelProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown model provider: ${name}`);
    return provider;
  }
}
