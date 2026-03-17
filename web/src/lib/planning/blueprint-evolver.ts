/**
 * Blueprint evolver — generates 3 chapter blueprint candidates at different
 * temperatures, evaluates them with code-based rules, and crossovers the
 * best + second-best into a final result.
 *
 * Mirrors the seed-evolver pattern but operates on ChapterBlueprint arrays.
 * Total LLM calls: 3 (generation) + 1 (crossover) = 4.
 */

import { getAgent, type LLMAgent } from "@/lib/agents/llm-agent";
import { getChapterBlueprintPrompt } from "@/lib/prompts/planning-prompts";
import {
  ChapterBlueprintSchema,
  type ChapterBlueprint,
  type ArcPlan,
} from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import {
  BlueprintEvaluator,
  type EvaluationResult,
} from "@/lib/evolution/blueprint-evaluator";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BLUEPRINT_TEMPERATURES = [0.5, 0.7, 0.9] as const;
export type BlueprintTemperature = (typeof BLUEPRINT_TEMPERATURES)[number];

const BLUEPRINT_SYSTEM_PROMPT =
  "당신은 한국 웹소설 화별 구성을 설계하는 전문가입니다. JSON 형식으로 출력하세요.";

const CROSSOVER_TEMPERATURE = 0.6;

const ChapterBlueprintResponseSchema = z.object({
  chapter_blueprints: z.array(ChapterBlueprintSchema),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlueprintCandidate {
  blueprints: ChapterBlueprint[];
  temperature: BlueprintTemperature;
  index: number;
  usage: TokenUsage;
}

export interface BlueprintEvolutionResult {
  blueprints: ChapterBlueprint[];
  candidates: BlueprintCandidate[];
  usage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Generate 3 blueprint candidates, evaluate with code-based rules, crossover
 * best + second-best.
 */
export async function evolveBlueprintCandidates(
  seed: NovelSeed,
  arc: ArcPlan,
  previousChapterSummaries: Array<{
    chapter: number;
    title: string;
    summary: string;
  }>,
  agent?: LLMAgent,
): Promise<BlueprintEvolutionResult> {
  const llmAgent = agent ?? getAgent();
  const prompt = getChapterBlueprintPrompt(seed, arc, previousChapterSummaries);
  const evaluator = new BlueprintEvaluator();

  // Stage 1: Generate 3 candidates in parallel
  const results = await Promise.all(
    BLUEPRINT_TEMPERATURES.map((temperature, i) =>
      llmAgent.callStructured({
        prompt,
        system: BLUEPRINT_SYSTEM_PROMPT,
        temperature,
        maxTokens: 8000,
        schema: ChapterBlueprintResponseSchema,
        format: "json",
        taskId: `blueprint-candidate-${arc.id}-${i + 1}`,
      }).then((result) => ({
        blueprints: result.data.chapter_blueprints,
        temperature,
        index: i,
        usage: result.usage,
      })),
    ),
  );

  const candidates: BlueprintCandidate[] = results;
  const totalUsage: TokenUsage = {
    prompt_tokens: results.reduce((s, r) => s + r.usage.prompt_tokens, 0),
    completion_tokens: results.reduce((s, r) => s + r.usage.completion_tokens, 0),
    total_tokens: results.reduce((s, r) => s + r.usage.total_tokens, 0),
    cost_usd: results.reduce((s, r) => s + r.usage.cost_usd, 0),
  };

  // Stage 2: Evaluate each candidate by merging blueprints into seed
  const scored = candidates.map((candidate) => {
    const mergedSeed = mergeBlueprintsIntoSeed(seed, candidate.blueprints);
    return {
      candidate,
      score: evaluator.evaluate(mergedSeed, candidate.blueprints),
    };
  });

  scored.sort((a, b) => b.score.total_score - a.score.total_score);

  const best = scored[0];
  const secondBest = scored[1];

  // Stage 3: Crossover — merge best + second-best strengths
  const crossoverPrompt = buildBlueprintCrossoverPrompt(
    best.candidate,
    best.score,
    secondBest.candidate,
    secondBest.score,
    arc,
  );

  const crossoverResult = await llmAgent.callStructured({
    prompt: crossoverPrompt,
    system: BLUEPRINT_SYSTEM_PROMPT,
    temperature: CROSSOVER_TEMPERATURE,
    maxTokens: 8000,
    schema: ChapterBlueprintResponseSchema,
    format: "json",
    taskId: `blueprint-crossover-${arc.id}`,
  });

  totalUsage.prompt_tokens += crossoverResult.usage.prompt_tokens;
  totalUsage.completion_tokens += crossoverResult.usage.completion_tokens;
  totalUsage.total_tokens += crossoverResult.usage.total_tokens;
  totalUsage.cost_usd += crossoverResult.usage.cost_usd;

  return {
    blueprints: crossoverResult.data.chapter_blueprints,
    candidates,
    usage: totalUsage,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge blueprint chapter_outlines into seed for evaluation.
 * Creates a shallow copy of seed with chapter_outlines replaced.
 */
function mergeBlueprintsIntoSeed(
  seed: NovelSeed,
  blueprints: ChapterBlueprint[],
): NovelSeed {
  return {
    ...seed,
    chapter_outlines: blueprints.map((bp) => ({
      chapter_number: bp.chapter_number,
      title: bp.title,
      arc_id: bp.arc_id,
      one_liner: bp.one_liner,
      key_points: bp.key_points,
      characters_involved: bp.characters_involved,
      tension_level: bp.tension_level,
    })),
  };
}

function buildBlueprintCrossoverPrompt(
  best: BlueprintCandidate,
  bestScore: EvaluationResult,
  secondBest: BlueprintCandidate,
  secondScore: EvaluationResult,
  arc: ArcPlan,
): string {
  const bestJson = JSON.stringify(best.blueprints, null, 2);
  const secondJson = JSON.stringify(secondBest.blueprints, null, 2);

  const allIssues = [...bestScore.issues, ...secondScore.issues];
  const issueSection =
    allIssues.length > 0
      ? `\n## 개선이 필요한 항목\n${allIssues.map((i) => `- ${i}`).join("\n")}`
      : "";

  return `두 챕터 블루프린트 설계안의 장점을 결합하여 더 나은 최종 블루프린트를 작성해주세요.

## 아크 정보
${arc.name} (${arc.start_chapter}~${arc.end_chapter}화)
테마: ${arc.theme}
핵심 사건: ${arc.key_events.join(", ")}

## 후보 1 (최우수, 종합점수: ${bestScore.total_score.toFixed(3)})
- 페이싱 품질: ${bestScore.pacing_quality.overall_score.toFixed(3)}
- 캐릭터 등장: ${bestScore.character_introduction.overall_score.toFixed(3)}
- 복선 활용: ${bestScore.foreshadowing_usage.overall_score.toFixed(3)}
- 장르 정합: ${bestScore.genre_alignment.overall_score.toFixed(3)}

\`\`\`json
{"chapter_blueprints": ${bestJson}}
\`\`\`

## 후보 2 (차선, 종합점수: ${secondScore.total_score.toFixed(3)})
- 페이싱 품질: ${secondScore.pacing_quality.overall_score.toFixed(3)}
- 캐릭터 등장: ${secondScore.character_introduction.overall_score.toFixed(3)}
- 복선 활용: ${secondScore.foreshadowing_usage.overall_score.toFixed(3)}
- 장르 정합: ${secondScore.genre_alignment.overall_score.toFixed(3)}

\`\`\`json
{"chapter_blueprints": ${secondJson}}
\`\`\`
${issueSection}
## 교배 지침
1. 후보 1의 전체 구조를 기반으로 하되, 후보 2에서 더 높은 점수를 받은 차원의 요소를 통합
2. 페이싱: 아크 첫 1~2화는 key_points ≤1, tension ≤4
3. 캐릭터: 화당 characters_involved 3명 이하, 신규 캐릭터 화당 1명 이하
4. 복선: 아크 내 최소 1개 심기 + 1개 회수
5. 핵심 사건은 아크 후반(7화~)에 배치

JSON 형식으로 최종 chapter_blueprints를 출력하세요.`;
}
