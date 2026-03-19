import { getAgent, LLMAgent } from "@/lib/agents/llm-agent";
import { getSeedPrompt } from "@/lib/prompts/seed-prompt";
import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

/**
 * The three temperature values used for candidate generation.
 * Low (0.7): conservative, coherent
 * Mid  (0.9): balanced creativity
 * High (1.1): creative, exploratory
 */
export const SEED_TEMPERATURES = [0.8] as const;
export type SeedTemperature = (typeof SEED_TEMPERATURES)[number];

/** A single generated seed candidate with its generation metadata. */
export interface SeedCandidate {
  seed: NovelSeed;
  temperature: SeedTemperature;
  index: number; // 0-based position in SEED_TEMPERATURES
  usage: TokenUsage;
}

/** Result returned by generateSeedCandidates. */
export interface SeedEvolutionResult {
  candidates: SeedCandidate[];
  /** Aggregated usage across all candidate generations. */
  usage: TokenUsage;
}

const SEED_SYSTEM_PROMPT =
  "당신은 한국 웹소설 기획 전문가입니다. YAML 형식으로 출력하세요.";

/**
 * Generates 3 NovelSeed candidates using different temperature values.
 *
 * Candidates are generated sequentially to avoid rate-limit issues.
 * Returns all 3 candidates along with aggregated token usage.
 *
 * @param interviewResult  The structured interview text (genre + plot info).
 * @param agent            Optional LLMAgent instance; uses singleton if omitted.
 */
export async function generateSeedCandidates(
  interviewResult: string,
  agent?: LLMAgent,
): Promise<SeedEvolutionResult> {
  const llmAgent = agent ?? getAgent();
  const prompt = getSeedPrompt(interviewResult);

  // Generate all 3 candidates in parallel for speed
  const results = await Promise.all(
    SEED_TEMPERATURES.map((temperature, i) =>
      llmAgent.callStructured({
        prompt,
        system: SEED_SYSTEM_PROMPT,
        temperature,
        maxTokens: 16000,
        schema: NovelSeedSchema,
        format: "yaml",
        taskId: `seed-generation-candidate-${i + 1}`,
      }).then((result) => ({
        seed: result.data,
        temperature,
        index: i,
        usage: result.usage,
      })),
    ),
  );

  const candidates: SeedCandidate[] = results;
  const totalUsage: TokenUsage = {
    prompt_tokens: results.reduce((s, r) => s + r.usage.prompt_tokens, 0),
    completion_tokens: results.reduce((s, r) => s + r.usage.completion_tokens, 0),
    total_tokens: results.reduce((s, r) => s + r.usage.total_tokens, 0),
    cost_usd: results.reduce((s, r) => s + r.usage.cost_usd, 0),
  };

  return { candidates, usage: totalUsage };
}
