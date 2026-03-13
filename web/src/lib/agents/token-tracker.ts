import type { TokenUsage, AgentLog } from "./types";

// Model pricing table (per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
};

const DEFAULT_PRICING = MODEL_PRICING["gpt-4o-mini"];

function getPricing(model: string): { input: number; output: number } {
  // Direct match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // Check if the model name contains a known key (e.g. "anthropic/claude-3-5-sonnet")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key)) return pricing;
  }
  return DEFAULT_PRICING;
}

export class TokenTracker {
  private logs: AgentLog[] = [];
  private budgetUsd: number | null;

  constructor(budgetUsd?: number) {
    this.budgetUsd = budgetUsd ?? null;
  }

  // Record a completed call's usage
  record(log: AgentLog): void {
    this.logs.push(log);
  }

  // Check if we can afford estimated tokens
  canAfford(estimatedTokens: number, model: string): boolean {
    if (this.budgetUsd === null) return true;
    const estimatedCost = TokenTracker.estimateCost(
      model,
      estimatedTokens,
      estimatedTokens
    );
    const currentCost = this.logs.reduce((sum, l) => sum + l.cost_usd, 0);
    return currentCost + estimatedCost <= this.budgetUsd;
  }

  // Get current usage snapshot
  getSnapshot(): {
    total_tokens: number;
    total_cost_usd: number;
    calls: number;
    errors: number;
  } {
    return {
      total_tokens: this.logs.reduce(
        (sum, l) => sum + l.prompt_tokens + l.completion_tokens,
        0
      ),
      total_cost_usd: this.logs.reduce((sum, l) => sum + l.cost_usd, 0),
      calls: this.logs.length,
      errors: this.logs.filter((l) => !l.success).length,
    };
  }

  // Estimate cost for a given model and token count
  static estimateCost(
    model: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    const pricing = getPricing(model);
    return (
      (promptTokens / 1_000_000) * pricing.input +
      (completionTokens / 1_000_000) * pricing.output
    );
  }

  // Get all logs
  getLogs(): AgentLog[] {
    return [...this.logs];
  }
}
