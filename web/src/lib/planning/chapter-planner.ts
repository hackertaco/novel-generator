import { getAgent } from "@/lib/agents/llm-agent";
import { getChapterBlueprintPrompt } from "@/lib/prompts/planning-prompts";
import { ChapterBlueprintSchema, type ChapterBlueprint, type ArcPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import { z } from "zod";

const ChapterBlueprintResponseSchema = z.object({
  chapter_blueprints: z.array(ChapterBlueprintSchema),
});

export async function generateChapterBlueprints(
  seed: NovelSeed,
  arc: ArcPlan,
  previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>,
): Promise<{ data: ChapterBlueprint[]; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getChapterBlueprintPrompt(seed, arc, previousChapterSummaries);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 화별 구성을 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.6,
    maxTokens: 8000,
    schema: ChapterBlueprintResponseSchema,
    format: "json",
    taskId: `chapter-blueprints-${arc.id}`,
  });

  return { data: result.data.chapter_blueprints, usage: result.usage };
}
