import OpenAI from "openai";

type LLMProvider = "openai" | "openrouter" | "zai";

function getProvider(): LLMProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ZAI_API_KEY) return "zai";
  return "openai";
}

function getClient(): OpenAI {
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

export async function callLLM(options: {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const client = getClient();
  const model = options.model || getDefaultModel();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: options.prompt });

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  });

  return response.choices[0]?.message?.content || "";
}

export async function* callLLMStream(options: {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const client = getClient();
  const model = options.model || getDefaultModel();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: options.prompt });

  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) yield content;
  }
}

export { getAgent } from "@/lib/agents/llm-agent";
