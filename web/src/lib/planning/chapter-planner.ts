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
  endingSceneState?: {
    time_of_day: string;
    location: string;
    characters_present: string[];
    ongoing_action: string;
    unresolved_tension: string;
  } | null,
): Promise<{ data: ChapterBlueprint[]; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getChapterBlueprintPrompt(seed, arc, previousChapterSummaries, previousChapterEnding, endingSceneState);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 화별 구성을 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.6,
    maxTokens: 8000,
    schema: ChapterBlueprintResponseSchema,
    format: "json",
    taskId: `chapter-blueprints-${arc.id}`,
  });

  // Post-validation
  for (const bp of result.data.chapter_blueprints) {
    // Warn if scene purposes lack Korean names
    for (const scene of bp.scenes) {
      if (!KOREAN_NAME_PATTERN.test(scene.purpose)) {
        console.warn(
          `[chapter-planner] 경고: ${bp.chapter_number}화 씬 purpose에 한국어 인물명이 없습니다: "${scene.purpose.slice(0, 60)}..."`,
        );
      }

      // Remove characters who shouldn't appear yet (introduction_chapter > this chapter)
      const before = scene.characters.length;
      scene.characters = scene.characters.filter((charId) => {
        const seedChar = seed.characters.find((c) => c.id === charId);
        if (seedChar && bp.chapter_number < seedChar.introduction_chapter) {
          console.log(
            `[chapter-planner] ${bp.chapter_number}화 씬에서 ${seedChar.name}(${charId}) 제거 — ${seedChar.introduction_chapter}화 등장 예정`,
          );
          return false;
        }
        return true;
      });
      if (scene.characters.length === 0 && before > 0) {
        // Don't leave a scene with no characters — add the protagonist
        const mc = seed.characters.find((c) => c.role === "주인공" || c.role === "protagonist");
        if (mc) scene.characters.push(mc.id);
      }
    }

    // Also filter characters_involved at chapter level
    bp.characters_involved = bp.characters_involved.filter((charId) => {
      const seedChar = seed.characters.find((c) => c.id === charId);
      return !seedChar || bp.chapter_number >= seedChar.introduction_chapter;
    });
  }

  return { data: result.data.chapter_blueprints, usage: result.usage };
}
