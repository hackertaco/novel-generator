import { getAgent } from "@/lib/agents/llm-agent";
import { getChapterBlueprintPrompt } from "@/lib/prompts/planning-prompts";
import { ChapterBlueprintSchema, type ChapterBlueprint, type ArcPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import { z } from "zod";

const ChapterBlueprintResponseSchema = z.object({
  chapter_blueprints: z.array(ChapterBlueprintSchema),
});

/**
 * Regex that checks for at least one Korean proper-noun-like pattern
 * (2+ Hangul chars followed by a particle). Used as a non-blocking quality check.
 */
const KOREAN_NAME_PATTERN = /[가-힣]{2,}[이가은는을를에의과와]/;

export async function generateChapterBlueprints(
  seed: NovelSeed,
  arc: ArcPlan,
  previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>,
  previousChapterEnding?: string,
): Promise<{ data: ChapterBlueprint[]; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getChapterBlueprintPrompt(seed, arc, previousChapterSummaries, previousChapterEnding);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 화별 구성을 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.6,
    maxTokens: 8000,
    schema: ChapterBlueprintResponseSchema,
    format: "json",
    taskId: `chapter-blueprints-${arc.id}`,
  });

  // Post-validation: warn (but don't fail) if scene purposes lack Korean names
  for (const bp of result.data.chapter_blueprints) {
    for (const scene of bp.scenes) {
      if (!KOREAN_NAME_PATTERN.test(scene.purpose)) {
        console.warn(
          `[chapter-planner] 경고: ${bp.chapter_number}화 씬 purpose에 한국어 인물명이 없습니다: "${scene.purpose.slice(0, 60)}..."`,
        );
      }
    }
  }

  return { data: result.data.chapter_blueprints, usage: result.usage };
}
