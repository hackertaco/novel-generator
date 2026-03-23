import OpenAI from "openai";
import yaml from "js-yaml";
import type {
  TokenUsage,
  AgentCallResult,
  AgentCallOptions,
  StructuredCallOptions,
  AgentLog,
} from "./types";
import { AgentCallError } from "./types";
import { TokenTracker } from "./token-tracker";
import {
  extractJsonBlock,
  extractYamlBlock,
  fixYaml,
  formatZodErrorKorean,
} from "./parse-utils";

type LLMProvider = "openai" | "openrouter" | "zai";

function getProvider(): LLMProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ZAI_API_KEY) return "zai";
  return "openai";
}

function createClient(): OpenAI {
  const provider = getProvider();
  switch (provider) {
    case "zai":
      return new OpenAI({
        apiKey: process.env.ZAI_API_KEY,
        baseURL: process.env.ZAI_BASE_URL || "https://api.z.ai/api/openai/v1",
      });
    case "openrouter":
      return new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
      });
    default:
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
}

function getDefaultModel(): string {
  if (process.env.NOVEL_MODEL) return process.env.NOVEL_MODEL;
  const provider = getProvider();
  switch (provider) {
    case "zai":
      return "claude-sonnet-4-20250514";
    case "openrouter":
      return "anthropic/claude-3-5-sonnet";
    default:
      return "gpt-4o-mini";
  }
}

function buildMessages(
  prompt: string,
  system?: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

/**
 * Create an OpenRouter client for cross-provider model access.
 * Used when model name contains "/" (e.g., "anthropic/claude-3.5-sonnet").
 */
function createOpenRouterClient(): OpenAI | null {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
  });
}

export class LLMAgent {
  private client: OpenAI;
  private openRouterClient: OpenAI | null;
  private defaultModel: string;
  private tracker: TokenTracker;

  constructor(options?: { budgetUsd?: number }) {
    this.client = createClient();
    this.openRouterClient = createOpenRouterClient();
    this.defaultModel = getDefaultModel();
    this.tracker = new TokenTracker(options?.budgetUsd);
  }

  /**
   * Get the appropriate client for a model.
   * Models with "/" (e.g., "anthropic/claude-3.5-sonnet") route through OpenRouter.
   */
  private getClientForModel(model: string): OpenAI {
    if (model.includes("/") && this.openRouterClient) {
      return this.openRouterClient;
    }
    return this.client;
  }

  /** Basic call with token tracking and rate-limit retry */
  async call(options: AgentCallOptions): Promise<AgentCallResult<string>> {
    const model = options.model || this.defaultModel;
    const client = this.getClientForModel(model);
    const messages = buildMessages(options.prompt, options.system);
    const maxRateLimitRetries = 3;

    for (let rlAttempt = 0; rlAttempt <= maxRateLimitRetries; rlAttempt++) {
      const startTime = Date.now();

      try {
        const usesMaxCompletionTokens = model.startsWith("gpt-5") || model.startsWith("o3") || model.startsWith("o4");
        const response = await client.chat.completions.create({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          ...(usesMaxCompletionTokens
            ? { max_completion_tokens: options.maxTokens ?? 4096 }
            : { max_tokens: options.maxTokens ?? 4096 }),
        });

        const duration_ms = Date.now() - startTime;
        const promptTokens = response.usage?.prompt_tokens ?? 0;
        const completionTokens = response.usage?.completion_tokens ?? 0;
        const cost_usd = TokenTracker.estimateCost(
          model,
          promptTokens,
          completionTokens
        );

        const log: AgentLog = {
          timestamp: new Date(),
          taskId: options.taskId ?? "unknown",
          model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd,
          success: true,
          duration_ms,
        };
        this.tracker.record(log);

        return {
          data: response.choices?.[0]?.message?.content || "",
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
            cost_usd,
          },
          model,
          attempt: rlAttempt + 1,
          duration_ms,
        };
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 429 && rlAttempt < maxRateLimitRetries) {
          // Exponential backoff: 5s, 15s, 45s
          const delay = 5000 * Math.pow(3, rlAttempt);
          console.warn(`[LLMAgent] 429 Rate Limited. Waiting ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    throw new Error("Rate limit retries exhausted");
  }

  /** Structured call: parse + validate + auto-retry */
  async callStructured<T>(
    options: StructuredCallOptions<T>
  ): Promise<AgentCallResult<T>> {
    const maxRetries = options.retryCount ?? 3;
    const attempts: Array<{ error: string; response?: string }> = [];
    let totalUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
    };
    let totalDuration = 0;
    let currentPrompt = options.prompt;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.call({
        ...options,
        prompt: currentPrompt,
      });

      totalUsage = {
        prompt_tokens: totalUsage.prompt_tokens + result.usage.prompt_tokens,
        completion_tokens:
          totalUsage.completion_tokens + result.usage.completion_tokens,
        total_tokens: totalUsage.total_tokens + result.usage.total_tokens,
        cost_usd: totalUsage.cost_usd + result.usage.cost_usd,
      };
      totalDuration += result.duration_ms;

      const rawText = result.data;

      // Parse step
      let parsed: unknown;
      try {
        if (options.format === "json") {
          const extracted = extractJsonBlock(rawText);
          parsed = JSON.parse(extracted);
        } else {
          const extracted = extractYamlBlock(rawText);
          const fixed = fixYaml(extracted);
          parsed = yaml.load(fixed);
        }
      } catch (parseErr) {
        const errMsg =
          parseErr instanceof Error ? parseErr.message : String(parseErr);
        attempts.push({ error: `Parse error: ${errMsg}`, response: rawText });
        currentPrompt = `${options.prompt}\n\n⚠️ 이전 출력에서 파싱 오류 발생 (시도 ${attempt}/${maxRetries}): ${errMsg}\n\n반드시 유효한 ${options.format === "json" ? "JSON" : "YAML"}만 출력하세요. 설명이나 마크다운 코드블록(\`\`\`) 없이 순수 데이터만 출력하세요.`;
        continue;
      }

      // Validate step
      const validation = options.schema.safeParse(parsed);
      if (validation.success) {
        return {
          data: validation.data,
          usage: totalUsage,
          model: result.model,
          attempt,
          duration_ms: totalDuration,
        };
      }

      const zodErrorMsg = formatZodErrorKorean(validation.error);
      attempts.push({
        error: `Validation error: ${zodErrorMsg}`,
        response: rawText,
      });

      if (attempt < maxRetries) {
        currentPrompt = `${options.prompt}\n\n⚠️ 이전 출력에서 검증 오류가 발생했습니다 (시도 ${attempt}/${maxRetries}).\n\n오류 내용:\n${zodErrorMsg}\n\n${options.repairPrompt ?? "위 오류를 정확히 수정하세요. 필수 필드를 빠뜨리지 말고, 타입(문자열/숫자/배열)을 정확히 맞추세요."}\n\n코드블록 없이 순수 JSON만 출력하세요.`;
      }
    }

    // Log all attempts for debugging
    console.error(`[callStructured] FAILED after ${maxRetries} attempts for task: ${options.taskId ?? "unknown"}`);
    for (const [i, att] of attempts.entries()) {
      console.error(`  Attempt ${i + 1}: ${att.error}`);
      if (att.response) {
        console.error(`  Response (first 300 chars): ${att.response.slice(0, 300)}`);
      }
    }

    throw new AgentCallError(
      `Structured call failed after ${maxRetries} attempts`,
      attempts
    );
  }

  /** Streaming call with post-completion usage reporting and rate-limit retry */
  async *callStream(
    options: AgentCallOptions
  ): AsyncGenerator<string, TokenUsage> {
    const model = options.model || this.defaultModel;
    const client = this.getClientForModel(model);
    const messages = buildMessages(options.prompt, options.system);
    const startTime = Date.now();
    const isOpenAI = getProvider() === "openai" && !model.includes("/");

    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    const maxRateLimitRetries = 3;
    for (let rlAttempt = 0; rlAttempt <= maxRateLimitRetries; rlAttempt++) {
      try {
        const usesMaxCompletionTokensStream = model.startsWith("gpt-5") || model.startsWith("o3") || model.startsWith("o4");
        stream = await client.chat.completions.create({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          ...(usesMaxCompletionTokensStream
            ? { max_completion_tokens: options.maxTokens ?? 4096 }
            : { max_tokens: options.maxTokens ?? 4096 }),
          stream: true,
          ...(isOpenAI ? { stream_options: { include_usage: true } } : {}),
        });
        break;
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 429 && rlAttempt < maxRateLimitRetries) {
          const delay = 5000 * Math.pow(3, rlAttempt);
          console.warn(`[LLMAgent] 429 Rate Limited (stream). Waiting ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    if (!stream!) throw new Error("Rate limit retries exhausted");

    let promptTokens = 0;
    let completionTokens = 0;
    let charCount = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        charCount += content.length;
        yield content;
      }
      // OpenAI sends usage in the final chunk when stream_options.include_usage is true
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
      }
    }

    // If usage wasn't reported via stream, estimate from text length
    if (promptTokens === 0 && completionTokens === 0) {
      // Rough estimation: ~4 chars per token for mixed Korean/English
      completionTokens = Math.ceil(charCount / 4);
      // Estimate prompt tokens from prompt length
      const promptLength =
        (options.system?.length ?? 0) + options.prompt.length;
      promptTokens = Math.ceil(promptLength / 4);
    }

    const duration_ms = Date.now() - startTime;
    const cost_usd = TokenTracker.estimateCost(
      model,
      promptTokens,
      completionTokens
    );

    const log: AgentLog = {
      timestamp: new Date(),
      taskId: options.taskId ?? "unknown",
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd,
      success: true,
      duration_ms,
    };
    this.tracker.record(log);

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cost_usd,
    };
  }

  /** Get tracker snapshot */
  getUsageSnapshot(): {
    total_tokens: number;
    total_cost_usd: number;
    calls: number;
    errors: number;
  } {
    return this.tracker.getSnapshot();
  }

  /** Get tracker instance */
  getTracker(): TokenTracker {
    return this.tracker;
  }
}

// Singleton factory
let _agent: LLMAgent | null = null;
export function getAgent(budgetUsd?: number): LLMAgent {
  if (!_agent) _agent = new LLMAgent({ budgetUsd });
  return _agent;
}
