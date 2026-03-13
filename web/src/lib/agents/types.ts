import type { z } from "zod";

// Token usage tracking
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
}

// Result wrapper for all agent calls
export interface AgentCallResult<T> {
  data: T;
  usage: TokenUsage;
  model: string;
  attempt: number;
  duration_ms: number;
}

// Options for basic LLM calls
export interface AgentCallOptions {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  taskId?: string;
  budgetTokens?: number;
  retryCount?: number;
}

// Options for structured (parsed+validated) calls
export interface StructuredCallOptions<T> extends AgentCallOptions {
  schema: z.ZodType<T>;
  format: "json" | "yaml";
  repairPrompt?: string;
}

// Log entry for tracking
export interface AgentLog {
  timestamp: Date;
  taskId: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  success: boolean;
  error?: string;
  duration_ms: number;
}

// Error class with attempt history
export class AgentCallError extends Error {
  attempts: Array<{ error: string; response?: string }>;
  constructor(
    message: string,
    attempts: Array<{ error: string; response?: string }>
  ) {
    super(message);
    this.name = "AgentCallError";
    this.attempts = attempts;
  }
}
