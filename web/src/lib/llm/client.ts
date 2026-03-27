/**
 * Thin wrapper around LLMAgent for simple call/stream usage.
 * All provider logic is delegated to LLMAgent to avoid duplication.
 */
import { getAgent } from "@/lib/agents/llm-agent";

export async function callLLM(options: {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const agent = getAgent();
  const result = await agent.call({
    prompt: options.prompt,
    system: options.system,
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    taskId: "callLLM",
  });
  return result.data;
}

export async function* callLLMStream(options: {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const agent = getAgent();
  const stream = agent.callStream({
    prompt: options.prompt,
    system: options.system,
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    taskId: "callLLMStream",
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}

export { getAgent } from "@/lib/agents/llm-agent";
