/**
 * Seed crossover — the final stage of the evolution loop.
 *
 * Takes the best and second-best SeedCandidates (ranked by evaluateCandidate),
 * builds a crossover prompt that highlights the strengths and issues of both,
 * sends it to the LLM for a single re-generation call, and returns the result
 * as the definitive final NovelSeed.
 *
 * LLM call count: exactly 1 (temperature = CROSSOVER_TEMPERATURE).
 */

import { getAgent, type LLMAgent } from "@/lib/agents/llm-agent";
import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import type { SeedCandidate } from "@/lib/planning/seed-evolver";
import type { CandidateScore } from "./candidate-evaluator";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Temperature used for the crossover re-generation call */
export const CROSSOVER_TEMPERATURE = 0.8;

/** Task ID used when calling the LLM for crossover */
export const CROSSOVER_TASK_ID = "seed-crossover";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface CrossoverResult {
  /** The final merged NovelSeed produced by the LLM */
  seed: NovelSeed;
  /** Token usage for the single crossover LLM call */
  usage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

const CROSSOVER_SYSTEM_PROMPT =
  "당신은 한국 웹소설 기획 전문가입니다. YAML 형식으로 출력하세요.";

/**
 * Build the crossover prompt that presents both candidates and instructs the
 * LLM to produce a superior merged result.
 *
 * @param best        - The top-ranked SeedCandidate.
 * @param bestScore   - Evaluation scores for the best candidate.
 * @param secondBest  - The second-ranked SeedCandidate.
 * @param secondScore - Evaluation scores for the second-best candidate.
 * @returns A prompt string ready to be sent to the LLM.
 */
export function buildCrossoverPrompt(
  best: SeedCandidate,
  bestScore: CandidateScore,
  secondBest: SeedCandidate,
  secondScore: CandidateScore,
): string {
  const bestSeedJson = JSON.stringify(best.seed, null, 2);
  const secondSeedJson = JSON.stringify(secondBest.seed, null, 2);

  const allIssues = [...bestScore.issues, ...secondScore.issues];
  const issueSection =
    allIssues.length > 0
      ? `\n## 개선이 필요한 항목\n${allIssues.map((i) => `- ${i}`).join("\n")}`
      : "";

  return `두 소설 설계안의 장점을 결합하여 더 나은 최종 설계안을 작성해주세요.

## 후보 1 (최우수, 종합점수: ${bestScore.overall_score.toFixed(3)})
- 페이싱 품질: ${bestScore.pacing_quality.toFixed(3)}
- 캐릭터 등장: ${bestScore.character_introduction.toFixed(3)}
- 복선 활용: ${bestScore.foreshadowing_usage.toFixed(3)}
- 장르 정합: ${bestScore.genre_alignment.toFixed(3)}

\`\`\`json
${bestSeedJson}
\`\`\`

## 후보 2 (차선, 종합점수: ${secondScore.overall_score.toFixed(3)})
- 페이싱 품질: ${secondScore.pacing_quality.toFixed(3)}
- 캐릭터 등장: ${secondScore.character_introduction.toFixed(3)}
- 복선 활용: ${secondScore.foreshadowing_usage.toFixed(3)}
- 장르 정합: ${secondScore.genre_alignment.toFixed(3)}

\`\`\`json
${secondSeedJson}
\`\`\`
${issueSection}
## 교배 지침
1. 후보 1의 전반적인 구조와 세계관을 기반으로 하되, 후보 2의 강점(더 높은 점수를 받은 항목)을 통합하세요.
2. 개선이 필요한 항목들을 적극 보완하세요.
3. 페이싱: 1~3화 tension_level ≤ 4, 1화 key_points ≤ 1
4. 캐릭터: 1화 최대 2명, 이후 화당 신규 ≤ 1명
5. 복선: 아크당 최소 1개 심기/회수
6. 장르: 장르 특성 키워드 적극 활용

아래 YAML 형식으로 최종 NovelSeed를 출력하세요.`;
}

// ---------------------------------------------------------------------------
// Main crossover function
// ---------------------------------------------------------------------------

/**
 * Perform one crossover LLM call to merge the best and second-best candidates
 * into a final, improved NovelSeed.
 *
 * @param best        - The top-ranked SeedCandidate.
 * @param bestScore   - Evaluation scores for the best candidate.
 * @param secondBest  - The second-ranked SeedCandidate.
 * @param secondScore - Evaluation scores for the second-best candidate.
 * @param agent       - Optional LLMAgent; uses singleton if omitted.
 * @returns CrossoverResult containing the final seed and token usage.
 */
export async function crossoverSeeds(
  best: SeedCandidate,
  bestScore: CandidateScore,
  secondBest: SeedCandidate,
  secondScore: CandidateScore,
  agent?: LLMAgent,
): Promise<CrossoverResult> {
  const llmAgent = agent ?? getAgent();
  const prompt = buildCrossoverPrompt(best, bestScore, secondBest, secondScore);

  const result = await llmAgent.callStructured({
    prompt,
    system: CROSSOVER_SYSTEM_PROMPT,
    temperature: CROSSOVER_TEMPERATURE,
    maxTokens: 8000,
    schema: NovelSeedSchema,
    format: "yaml",
    taskId: CROSSOVER_TASK_ID,
  });

  return {
    seed: result.data,
    usage: result.usage,
  };
}
