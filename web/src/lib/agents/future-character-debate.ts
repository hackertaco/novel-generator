import { z } from "zod";

import { getAgent } from "./llm-agent";
import type { PreviousChapterSummary } from "./pipeline";
import { resolveCharacterReference } from "../schema/character";
import type { NovelSeed } from "../schema/novel";
import type { ChapterBlueprint } from "../schema/planning";
import type { TokenUsage } from "./types";

const FutureCharacterDebateSchema = z.object({
  decision: z.enum(["keep_original", "revise_blueprint", "revise_seed_and_blueprint"]),
  rationale: z.string(),
  approved_character: z.string().default(""),
  target_scene_indexes: z.array(z.number().int().min(0)).default([]),
  guidance: z.string().default(""),
});

export type FutureCharacterDebateDecision = z.infer<typeof FutureCharacterDebateSchema>;

export interface FutureCharacterDebateResult {
  decisionId: string;
  decision: FutureCharacterDebateDecision["decision"];
  rationale: string;
  guidance: string;
  characterId: string;
  targetSceneIndexes: number[];
  usage: TokenUsage;
}

export function buildFutureCharacterDebatePrompt(args: {
  chapterNumber: number;
  characterName: string;
  characterId: string;
  introductionChapter: number;
  blueprint: ChapterBlueprint;
  text: string;
  previousSummaries: PreviousChapterSummary[];
}): string {
  const previousSummarySection = args.previousSummaries.length > 0
    ? args.previousSummaries.slice(-3).map((summary) => `- ${summary.chapter}화: ${summary.summary}`).join("\n")
    : "없음";

  return `당신은 웹소설 내부 검토 회의실입니다. 두 관점이 토론한 뒤 보수적으로 최종 결론을 내려주세요.

## 문제 상황
- 현재 화: ${args.chapterNumber}화
- 문제 인물: ${args.characterName} (${args.characterId})
- 원래 introduction_chapter: ${args.introductionChapter}화
- 이 인물이 아직 예정 화보다 이르게 직접 등장했습니다.

## 현재 블루프린트
제목: ${args.blueprint.title}
한 줄 요약: ${args.blueprint.one_liner}
현재 characters_involved: ${args.blueprint.characters_involved.join(", ") || "없음"}
씬 수: ${args.blueprint.scenes.length}
${args.blueprint.scenes.map((scene, index) => `${index}. ${scene.purpose} | 인물: ${scene.characters.join(", ") || "없음"}`).join("\n")}

## 직전 화 요약
${previousSummarySection}

## 실제 생성 본문 일부
${args.text.slice(0, 2500)}

## 토론 규칙
1. [보수파]는 introduction_chapter와 페이싱 계획을 지켜야 한다고 주장합니다.
2. [옹호파]는 이 인물이 지금 화에 직접 등장해야만 인과/감정/긴장이 더 논리적인지 주장합니다.
3. 최종 판정은 **매우 보수적**이어야 합니다. 단순히 자연스럽다 수준이면 keep_original입니다.
4. revise_blueprint는 블루프린트만 고치면 충분한 경우에만.
5. revise_seed_and_blueprint는 이 인물의 첫 등장 회차 자체를 앞당겨야 연속된 검증이 안 깨질 때만.
6. target_scene_indexes는 이 인물이 실제로 있어야 하는 씬 인덱스만 넣으세요. 확신이 없으면 빈 배열.

## 출력 형식
JSON만 출력:
{
  "decision": "keep_original | revise_blueprint | revise_seed_and_blueprint",
  "rationale": "왜 그런지 한 문단",
  "approved_character": "${args.characterId} 또는 ${args.characterName}",
  "target_scene_indexes": [0],
  "guidance": "재생성 시 writer에게 줄 짧고 구체적인 지시"
}`;
}

export async function debateFutureCharacterIntroduction(args: {
  chapterNumber: number;
  characterId: string;
  seed: NovelSeed;
  blueprint: ChapterBlueprint;
  text: string;
  previousSummaries: PreviousChapterSummary[];
}): Promise<FutureCharacterDebateResult | null> {
  const character = args.seed.characters.find((item) => item.id === args.characterId);
  if (!character) return null;

  const agent = getAgent();
  const prompt = buildFutureCharacterDebatePrompt({
    chapterNumber: args.chapterNumber,
    characterName: character.name,
    characterId: character.id,
    introductionChapter: character.introduction_chapter,
    blueprint: args.blueprint,
    text: args.text,
    previousSummaries: args.previousSummaries,
  });

  const result = await agent.callStructured({
    prompt,
    system: "당신은 웹소설 continuity 심의위원입니다. 보수적으로 판단하고, 허용할 때만 구조화된 JSON으로 수정 결론을 내리세요.",
    temperature: 0.2,
    maxTokens: 1200,
    schema: FutureCharacterDebateSchema,
    format: "json",
    taskId: `future-character-debate-ch${args.chapterNumber}-${args.characterId}`,
  });

  const approvedCharacter = result.data.approved_character
    ? resolveCharacterReference(result.data.approved_character, args.seed.characters)
    : character;
  const decisionId = `future-character:${args.chapterNumber}:${approvedCharacter?.id || args.characterId}`;

  return {
    decisionId,
    decision: result.data.decision,
    rationale: result.data.rationale,
    guidance: result.data.guidance,
    characterId: approvedCharacter?.id || args.characterId,
    targetSceneIndexes: result.data.target_scene_indexes,
    usage: result.usage,
  };
}

export function applyFutureCharacterDebate(args: {
  seed: NovelSeed;
  blueprint: ChapterBlueprint;
  verdict: FutureCharacterDebateResult;
  chapterNumber: number;
}): { applied: boolean; summary: string } {
  const character = args.seed.characters.find((item) => item.id === args.verdict.characterId);
  if (!character) {
    return { applied: false, summary: `알 수 없는 캐릭터 ${args.verdict.characterId}` };
  }

  if (args.verdict.decision === "keep_original") {
    return { applied: false, summary: `${character.name} 유지 거부` };
  }

  if (args.verdict.decision === "revise_seed_and_blueprint") {
    character.introduction_chapter = Math.min(character.introduction_chapter, args.chapterNumber);
  }

  if (!args.blueprint.characters_involved.includes(character.id)) {
    args.blueprint.characters_involved.push(character.id);
  }

  const sceneIndexes = args.verdict.targetSceneIndexes.length > 0
    ? args.verdict.targetSceneIndexes.filter((index) => index >= 0 && index < args.blueprint.scenes.length)
    : [0];

  for (const sceneIndex of sceneIndexes) {
    const scene = args.blueprint.scenes[sceneIndex];
    if (scene && !scene.characters.includes(character.id)) {
      scene.characters.push(character.id);
    }
  }

  return {
    applied: true,
    summary: args.verdict.decision === "revise_seed_and_blueprint"
      ? `${character.name}의 introduction_chapter를 ${character.introduction_chapter}화로 당기고 블루프린트에 반영`
      : `${character.name}을 블루프린트에 예외 반영`,
  };
}
