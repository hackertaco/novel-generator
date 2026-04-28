import { getAgent } from "@/lib/agents/llm-agent";
import { getChapterBlueprintPrompt } from "@/lib/prompts/planning-prompts";
import { ChapterBlueprintSchema, type ChapterBlueprint, type ArcPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { DirectionDesign } from "@/lib/schema/direction";
import type { TokenUsage } from "@/lib/agents/types";
import { resolveCharacterReference } from "@/lib/schema/character";
import { z } from "zod";

const ChapterBlueprintResponseSchema = z.object({
  chapter_blueprints: z.array(ChapterBlueprintSchema),
});

/**
 * Regex that checks for at least one Korean proper-noun-like pattern
 * (2+ Hangul chars followed by a particle). Used as a non-blocking quality check.
 */
const KOREAN_NAME_PATTERN = /[가-힣]{2,}[이가은는을를에의과와]/;

function normalizeCharacterRefs(
  refs: string[] | undefined,
  seed: NovelSeed,
  contextLabel: string,
): string[] {
  if (!refs || refs.length === 0) return [];

  const normalized: string[] = [];
  for (const ref of refs) {
    const resolved = resolveCharacterReference(ref, seed.characters);
    if (!resolved) {
      console.warn(`[chapter-planner] ${contextLabel}: 알 수 없는 캐릭터 참조 "${ref}" 제거`);
      continue;
    }
    if (!normalized.includes(resolved.id)) {
      normalized.push(resolved.id);
    }
  }
  return normalized;
}

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
  targetChapter?: number,
  directionDesign?: DirectionDesign,
  previousRevealedFacts?: Array<{ chapter: number; content: string; type: string }>,
): Promise<{ data: ChapterBlueprint[]; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getChapterBlueprintPrompt(seed, arc, previousChapterSummaries, previousChapterEnding, endingSceneState, targetChapter, directionDesign, previousRevealedFacts);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 화별 구성을 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.6,
    maxTokens: 4000,
    schema: ChapterBlueprintResponseSchema,
    format: "json",
    taskId: `chapter-blueprints-${arc.id}-ch${targetChapter ?? arc.start_chapter}`,
  });

  // Post-validation
  for (const bp of result.data.chapter_blueprints) {
    // Warn if scene purposes lack Korean names
    for (const scene of bp.scenes) {
      scene.characters = normalizeCharacterRefs(
        scene.characters,
        seed,
        `${bp.chapter_number}화 scene.characters`,
      );

      const dialogueTurns = (scene as { dialogue_turns?: Array<{ speaker: string; intent: string }> }).dialogue_turns;
      if (dialogueTurns) {
        for (const turn of dialogueTurns) {
          const resolvedSpeaker = resolveCharacterReference(turn.speaker, seed.characters);
          if (resolvedSpeaker) {
            turn.speaker = resolvedSpeaker.name;
          }
        }
      }

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
    bp.characters_involved = normalizeCharacterRefs(
      bp.characters_involved,
      seed,
      `${bp.chapter_number}화 characters_involved`,
    ).filter((charId) => {
      const seedChar = seed.characters.find((c) => c.id === charId);
      return !seedChar || bp.chapter_number >= seedChar.introduction_chapter;
    });

    // Flow key_points.why → scene must_reveal (connect planning layers)
    const outline = seed.chapter_outlines.find((o) => o.chapter_number === bp.chapter_number);
    const extOutline = !outline
      ? seed.extended_outlines?.find((o) => o.chapter_number === bp.chapter_number)
      : undefined;

    if (outline?.characters_involved?.length) {
      const requiredCharacters = normalizeCharacterRefs(
        outline.characters_involved,
        seed,
        `${bp.chapter_number}화 outline.characters_involved`,
      ).filter((charId) => {
        const seedChar = seed.characters.find((c) => c.id === charId);
        return !seedChar || bp.chapter_number >= seedChar.introduction_chapter;
      });
      for (const charId of requiredCharacters) {
        if (!bp.characters_involved.includes(charId)) {
          bp.characters_involved.push(charId);
        }
      }
    }

    // For extended outlines without key_points, inject the one_liner as context
    if (!outline && extOutline && bp.scenes.length > 0 && !bp.scenes[0].must_reveal?.length) {
      bp.scenes[0].must_reveal = bp.scenes[0].must_reveal || [];
      bp.scenes[0].must_reveal.push(extOutline.one_liner);
    }

    if (outline && outline.key_points.length > 0) {
      const reveals: string[] = [];
      for (const point of outline.key_points) {
        if (typeof point === "string") {
          reveals.push(point);
        } else {
          // Structured PlotPoint: flow "what" to must_reveal
          // For "immediate", also flow "why"
          reveals.push(point.what);
          if (point.reveal === "immediate" && point.why) {
            reveals.push(point.why);
          }
        }
      }
      // Distribute reveals across scenes (first scene gets most)
      if (bp.scenes.length > 0 && reveals.length > 0) {
        for (let si = 0; si < bp.scenes.length; si++) {
          if (!bp.scenes[si].must_reveal) bp.scenes[si].must_reveal = [];
        }
        for (let ri = 0; ri < reveals.length; ri++) {
          const targetScene = Math.min(ri, bp.scenes.length - 1);
          bp.scenes[targetScene].must_reveal!.push(reveals[ri]);
        }
      }
    }
  }

  return { data: result.data.chapter_blueprints, usage: result.usage };
}
