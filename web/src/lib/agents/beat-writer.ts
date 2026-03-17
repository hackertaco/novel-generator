/**
 * Beat-by-beat structured scene generation.
 *
 * Instead of asking the LLM to generate a full scene freely,
 * breaks it into structural beats that are individually generated
 * and validated. This ensures dialogue exists, tell-not-show is
 * caught per-beat, and the LLM focuses on one small task at a time.
 */

import { getAgent } from "./llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import type { SceneSpec } from "@/lib/schema/planning";
import type { TokenUsage } from "@/lib/agents/types";

// ---------------------------------------------------------------------------
// Beat types
// ---------------------------------------------------------------------------

export type BeatType =
  | "opening_action"   // Scene-setting action/description (1-2 sentences)
  | "dialogue"         // Character speaks (1-3 lines of dialogue + reaction)
  | "reaction"         // Physical/emotional reaction through action (1-2 sentences)
  | "internal"         // Brief internal thought (1 sentence, show-don't-tell)
  | "closing_beat"     // End of scene — hook or transition (1-2 sentences)
  ;

export interface Beat {
  type: BeatType;
  instruction: string;
  /** Which character(s) are involved */
  characters: string[];
}

// ---------------------------------------------------------------------------
// Beat plan generation
// ---------------------------------------------------------------------------

/**
 * Generate a beat plan for a scene based on its type and purpose.
 * Returns a sequence of beats that structures the scene.
 */
export function planBeats(scene: SceneSpec, seed: NovelSeed): Beat[] {
  const chars = scene.characters
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);

  const mcName = chars.find((c) => c?.role === "주인공")?.name || chars[0]?.name || "주인공";
  const otherNames = chars.filter((c) => c?.name !== mcName).map((c) => c!.name);

  const beats: Beat[] = [];

  // Opening action — always starts with a concrete action
  beats.push({
    type: "opening_action",
    instruction: `장면의 시작. ${mcName}의 행동이나 감각으로 시작하세요. 설명이 아닌 행동으로. (1-2문장)\n씬 목적: ${scene.purpose}`,
    characters: [mcName],
  });

  // Middle beats depend on scene type
  switch (scene.type) {
    case "dialogue": {
      // Dialogue scene: alternate dialogue and reactions
      if (otherNames.length > 0) {
        beats.push({
          type: "dialogue",
          instruction: `${mcName}이(가) 먼저 말합니다. 캐릭터 말투에 맞는 대사 1-2줄 + 짧은 행동 비트.\n씬 목적: ${scene.purpose}`,
          characters: [mcName],
        });
        beats.push({
          type: "dialogue",
          instruction: `${otherNames[0]}이(가) 대답합니다. 캐릭터 말투에 맞는 대사 1-2줄 + ${mcName}의 반응.\n씬 목적: ${scene.purpose}`,
          characters: [otherNames[0], mcName],
        });
        beats.push({
          type: "dialogue",
          instruction: `대화가 핵심 정보를 전달하거나 갈등이 드러나는 2-3줄의 대사 교환. 씬의 목적을 달성하세요.\n씬 목적: ${scene.purpose}`,
          characters: [mcName, ...otherNames],
        });
      } else {
        // Monologue/self-dialogue
        beats.push({
          type: "internal",
          instruction: `${mcName}의 내면 독백. 감정을 설명하지 말고 구체적 생각이나 기억으로 보여주세요. (2-3문장)\n씬 목적: ${scene.purpose}`,
          characters: [mcName],
        });
        beats.push({
          type: "dialogue",
          instruction: `${mcName}이(가) 혼잣말하거나 짧은 독백을 합니다. 캐릭터 말투가 드러나야 합니다.\n씬 목적: ${scene.purpose}`,
          characters: [mcName],
        });
      }
      break;
    }
    case "action": {
      beats.push({
        type: "reaction",
        instruction: `${mcName}이(가) 상황에 반응합니다. 몸의 감각(시각/청각/촉각)으로 묘사. (2-3문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
      });
      if (otherNames.length > 0) {
        beats.push({
          type: "dialogue",
          instruction: `${otherNames[0]}이(가) 짧게 말합니다. 상황에 대한 반응이나 정보 전달. (1-2줄 대사)\n씬 목적: ${scene.purpose}`,
          characters: [otherNames[0]],
        });
      }
      beats.push({
        type: "reaction",
        instruction: `상황이 변화합니다. ${mcName}이(가) 결정을 내리거나 행동합니다. (2-3문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
      });
      break;
    }
    case "hook": {
      beats.push({
        type: "reaction",
        instruction: `긴장감이 고조됩니다. ${mcName}의 감각이 무언가를 감지합니다. (1-2문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
      });
      break;
    }
    case "introspection": {
      beats.push({
        type: "internal",
        instruction: `${mcName}의 내면. 감정을 직접 서술하지 말고, 구체적 기억이나 생각으로 보여주세요. (3-4문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
      });
      break;
    }
    default: {
      // exposition, flashback, transition — simple structure
      beats.push({
        type: "reaction",
        instruction: `씬의 핵심 내용을 행동과 대화로 전달하세요. 설명체 금지. (3-5문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName, ...otherNames],
      });
      break;
    }
  }

  // Closing beat — always end with a hook or transition
  beats.push({
    type: "closing_beat",
    instruction: `씬을 마무리합니다. 독자가 "그래서?"라고 궁금해할 문장으로 끝내세요. (1-2문장)\n씬 목적: ${scene.purpose}`,
    characters: [mcName],
  });

  return beats;
}

// ---------------------------------------------------------------------------
// Beat generation
// ---------------------------------------------------------------------------

const ZERO_USAGE: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 };

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}

export interface BeatWriterResult {
  text: string;
  usage: TokenUsage;
}

/**
 * Generate a scene by writing each beat sequentially.
 * Each beat gets the accumulated text as context for continuity.
 */
export async function writeSceneByBeats(options: {
  beats: Beat[];
  scene: SceneSpec;
  seed: NovelSeed;
  chapterNumber: number;
  previousText: string; // text from previous scenes in this chapter
  systemPrompt: string;
  model?: string;
}): Promise<BeatWriterResult> {
  const { beats, scene, seed, chapterNumber, previousText, systemPrompt, model } = options;
  const agent = getAgent();
  let totalUsage: TokenUsage = { ...ZERO_USAGE };
  const beatTexts: string[] = [];

  // Character voice reference
  const charVoices = scene.characters
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => `${c!.name}: ${c!.voice.tone} / 말투: "${c!.voice.sample_dialogues[0] || ""}"`)
    .join("\n");

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const accumulatedText = beatTexts.join("\n");

    const prompt = `# 소설 정보
제목: ${seed.title} | 장르: ${seed.world.genre} | ${chapterNumber}화
감정톤: ${scene.emotional_tone}

# 캐릭터 목소리
${charVoices}

${previousText ? `# 이전 씬 (마지막 부분)\n${previousText.slice(-500)}\n` : ""}
${accumulatedText ? `# 현재 씬 (여기까지 작성됨)\n${accumulatedText}\n` : ""}
# 지금 쓸 비트: [${beat.type}]
${beat.instruction}

규칙:
- 감정을 설명하지 말고 행동/감각으로 보여주세요
- "~였다" 어미 반복 금지
- 캐릭터 말투를 지키세요
- 이전 텍스트에 자연스럽게 이어지게 쓰세요

출력: 비트 텍스트만 (메타 정보 없이)`;

    const result = await agent.call({
      prompt,
      system: systemPrompt,
      model,
      temperature: 0.5,
      maxTokens: 800,
      taskId: `ch${chapterNumber}-scene-beat-${i + 1}`,
    });
    totalUsage = addUsage(totalUsage, result.usage);
    beatTexts.push(result.data.trim());
  }

  return {
    text: beatTexts.join("\n\n"),
    usage: totalUsage,
  };
}
