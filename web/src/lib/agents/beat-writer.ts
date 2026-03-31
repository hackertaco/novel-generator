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
import { getActiveThreadsForChapter, formatThreadRevealsForPrompt } from "@/lib/schema/novel";
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
  /** Emotional state this beat should convey (for emotional progression) */
  emotionalTarget?: string;
  /** Micro-tension element to weave in */
  microTension?: string;
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

  // Parse emotional arc from the scene's emotional_tone (e.g. "긴장→갈등→충격")
  const emotionalStages = scene.emotional_tone.includes("→")
    ? scene.emotional_tone.split("→").map((s) => s.trim())
    : [scene.emotional_tone];

  // Assign emotional targets across beats (distribute evenly)
  function getEmotionalTarget(beatIndex: number, totalBeats: number): string {
    if (emotionalStages.length <= 1) return emotionalStages[0] || "neutral";
    const stageIndex = Math.min(
      Math.floor((beatIndex / Math.max(totalBeats - 1, 1)) * emotionalStages.length),
      emotionalStages.length - 1,
    );
    return emotionalStages[stageIndex];
  }

  // Opening action — always starts with a concrete action
  beats.push({
    type: "opening_action",
    instruction: `장면의 시작. ${mcName}의 행동이나 감각으로 시작하세요. 설명이 아닌 행동으로. 장소와 시간대를 자연스럽게 설정하세요. (1-2문장)\n씬 목적: ${scene.purpose}`,
    characters: [mcName],
    emotionalTarget: emotionalStages[0],
    microTension: "장면의 분위기에 불안 요소를 하나 깔아두세요 (소리, 시선, 어색한 침묵 등)",
  });

  // Middle beats depend on scene type
  switch (scene.type) {
    case "dialogue": {
      // Dialogue scene: alternate dialogue and reactions
      if (otherNames.length > 0) {
        beats.push({
          type: "dialogue",
          instruction: `${mcName}이(가) 먼저 말합니다. 캐릭터 말투에 맞는 대사 + 행동/감정 비트.\n대사는 1~3문장 사이로 자유롭게. 짧은 대사 뒤에는 반드시 행동이나 감각 묘사를 덧붙이세요.\n씬 목적: ${scene.purpose}`,
          characters: [mcName],
          emotionalTarget: getEmotionalTarget(1, 5),
          microTension: "대사 속에 상대가 불편해할 단어나 질문을 하나 넣으세요",
        });
        beats.push({
          type: "dialogue",
          instruction: `${otherNames[0]}이(가) 대답합니다. 캐릭터 말투에 맞는 대사(2~3문장으로 길게) + ${mcName}의 내면 반응이나 행동 묘사.\n짧은 대사만 쓰지 마세요. 감정이나 의도가 드러나는 긴 대사를 쓰세요.\n씬 목적: ${scene.purpose}`,
          characters: [otherNames[0], mcName],
          emotionalTarget: getEmotionalTarget(2, 5),
          microTension: "대답 속에 숨기는 것이 있음을 행동(시선 회피, 말 끊김)으로 암시하세요",
        });
        beats.push({
          type: "dialogue",
          instruction: `대화가 핵심 정보를 전달하거나 갈등이 드러나는 장면. 대사와 대사 사이에 반드시 행동/표정/감각 묘사를 넣으세요. 대사만 연속으로 나열하지 마세요.\n씬 목적: ${scene.purpose}`,
          characters: [mcName, ...otherNames],
          emotionalTarget: getEmotionalTarget(3, 5),
          microTension: "대화의 흐름 속에서 한 캐릭터가 상대의 약점이나 비밀에 가까이 다가가게 하세요",
        });
      } else {
        // Monologue/self-dialogue
        beats.push({
          type: "internal",
          instruction: `${mcName}의 내면 독백. 감정을 설명하지 말고 구체적 생각이나 기억으로 보여주세요. (2-3문장)\n씬 목적: ${scene.purpose}`,
          characters: [mcName],
          emotionalTarget: getEmotionalTarget(1, 4),
          microTension: "기억이나 생각 속에 해결되지 않은 의문을 하나 떠올리게 하세요",
        });
        beats.push({
          type: "dialogue",
          instruction: `${mcName}이(가) 혼잣말하거나 짧은 독백을 합니다. 캐릭터 말투가 드러나야 합니다.\n씬 목적: ${scene.purpose}`,
          characters: [mcName],
          emotionalTarget: getEmotionalTarget(2, 4),
          microTension: "독백에 자기 확신이 흔들리는 순간을 넣으세요",
        });
      }
      break;
    }
    case "action": {
      beats.push({
        type: "reaction",
        instruction: `${mcName}이(가) 상황에 반응합니다. 몸의 감각(시각/청각/촉각)으로 묘사. (2-3문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
        emotionalTarget: getEmotionalTarget(1, 4),
        microTension: "감각 묘사 중 하나에 '뭔가 잘못됐다'는 신호를 넣으세요 (이상한 냄새, 멈춘 소리, 차가운 기운 등)",
      });
      if (otherNames.length > 0) {
        beats.push({
          type: "dialogue",
          instruction: `${otherNames[0]}이(가) 말합니다. 상황에 대한 반응이나 정보 전달. 대사 뒤에 행동이나 표정 묘사를 반드시 포함하세요.\n씬 목적: ${scene.purpose}`,
          characters: [otherNames[0]],
          emotionalTarget: getEmotionalTarget(2, 4),
          microTension: "대사가 상황을 완전히 설명하지 않게 하세요. 정보를 절반만 주세요.",
        });
      }
      beats.push({
        type: "reaction",
        instruction: `상황이 변화합니다. ${mcName}이(가) 결정을 내리거나 행동합니다. (2-3문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
        emotionalTarget: getEmotionalTarget(3, 4),
        microTension: "결정의 대가나 리스크를 한 문장으로 암시하세요",
      });
      break;
    }
    case "hook": {
      beats.push({
        type: "reaction",
        instruction: `긴장감이 고조됩니다. ${mcName}의 감각이 무언가를 감지합니다. (1-2문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
        emotionalTarget: getEmotionalTarget(1, 3),
        microTension: "감지한 것이 무엇인지 독자에게 완전히 알려주지 마세요. 부분만 보여주세요.",
      });
      break;
    }
    case "introspection": {
      beats.push({
        type: "internal",
        instruction: `${mcName}의 내면. 감정을 직접 서술하지 말고, 구체적 기억이나 생각으로 보여주세요. (3-4문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
        emotionalTarget: getEmotionalTarget(1, 3),
        microTension: "내면 속에 스스로도 인정하기 싫은 진실이나 모순을 한 줄 넣으세요",
      });
      break;
    }
    case "flashback": {
      // Flashback — short and tight, max 300 chars
      beats.push({
        type: "internal",
        instruction: `회상 장면. 현재 상황과 직접 연결되는 과거 기억을 **300자 이내**로 짧게 보여주세요. 길어지면 안 됩니다.\n- 감각(소리, 냄새, 촉감) 위주로 편집된 기억처럼 쓰세요\n- 회상이 끝나면 즉시 현재로 돌아오세요\n씬 목적: ${scene.purpose}`,
        characters: [mcName],
        emotionalTarget: getEmotionalTarget(1, 2),
        microTension: "과거의 기억에서 현재를 뒤흔들 한 가지 디테일을 남기세요",
      });
      break;
    }
    default: {
      // exposition, transition — simple structure
      beats.push({
        type: "reaction",
        instruction: `씬의 핵심 내용을 행동과 대화로 전달하세요. 설명체 금지. (3-5문장)\n씬 목적: ${scene.purpose}`,
        characters: [mcName, ...otherNames],
        emotionalTarget: getEmotionalTarget(1, 3),
        microTension: "정보를 전달하면서도 캐릭터 간 미묘한 감정 마찰을 넣으세요",
      });
      break;
    }
  }

  // Closing beat — always end with a hook or transition
  beats.push({
    type: "closing_beat",
    instruction: `씬을 마무리합니다. 독자가 "그래서?"라고 궁금해할 문장으로 끝내세요. (1-2문장)\n씬 목적: ${scene.purpose}`,
    characters: [mcName],
    emotionalTarget: emotionalStages[emotionalStages.length - 1],
    microTension: "새로운 의문이나 위협을 암시하는 이미지/소리/행동으로 끝내세요. 평화롭게 끝내지 마세요.",
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
  previousChapterEnding?: string; // actual text from previous chapter for continuity
}): Promise<BeatWriterResult> {
  const { beats, scene, seed, chapterNumber, previousText, systemPrompt, model, previousChapterEnding } = options;
  const agent = getAgent();
  let totalUsage: TokenUsage = { ...ZERO_USAGE };
  const beatTexts: string[] = [];

  // Character voice reference (with gender/pronouns)
  const charVoices = scene.characters
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => {
      const gender = c!.gender || "male";
      const pronoun = gender === "female" ? "그녀" : "그";
      const genderLabel = gender === "female" ? "여" : gender === "male" ? "남" : "기타";
      return `${c!.name}(${genderLabel}/${pronoun}): ${c!.voice.tone} / 말투: "${c!.voice.sample_dialogues[0] || ""}"`;
    })
    .join("\n");

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const accumulatedText = beatTexts.join("\n");

    const emotionalLine = beat.emotionalTarget
      ? `이 비트의 감정: ${beat.emotionalTarget}`
      : "";
    const tensionLine = beat.microTension
      ? `미세 긴장: ${beat.microTension}`
      : "";

    // For the first beat of the first scene, add continuity from previous chapter
    const continuityBlock = (i === 0 && previousChapterEnding && !beatTexts.length)
      ? `# ⚠️ 직전 화 마지막 장면 (이 직후부터 이어쓰세요!)
${previousChapterEnding}
→ 위 내용은 ${chapterNumber - 1}화의 끝입니다. 같은 장면을 반복하지 말고, 바로 다음 순간부터 시작하세요.
`
      : "";

    // 5W1H context for scene grounding
    const sceneContextParts: string[] = [];
    if (scene.who) sceneContextParts.push(`누가: ${scene.who}`);
    if (scene.when) sceneContextParts.push(`언제: ${scene.when}`);
    if (scene.where_detail) sceneContextParts.push(`어디서: ${scene.where_detail}`);
    if (scene.how) sceneContextParts.push(`어떻게: ${scene.how}`);
    const sceneContextBlock = sceneContextParts.length > 0
      ? `\n# 장면 맥락\n${sceneContextParts.join("\n")}\n`
      : "";

    // Thread reveal guide for this chapter
    const activeReveals = getActiveThreadsForChapter(seed.story_threads || [], chapterNumber);
    const threadGuideBlock = activeReveals.length > 0
      ? `\n# 캐릭터 내면 가이드\n${formatThreadRevealsForPrompt(activeReveals)}\n`
      : "";

    const prompt = `# 소설 정보
제목: ${seed.title} | 장르: ${seed.world.genre} | ${chapterNumber}화
감정톤: ${scene.emotional_tone}
${emotionalLine}
${sceneContextBlock}${threadGuideBlock}
# 캐릭터 목소리
${charVoices}

${continuityBlock}${previousText ? `# 이전 씬 (마지막 부분)\n${previousText.slice(-500)}\n` : ""}
${accumulatedText ? `# 현재 씬 (여기까지 작성됨)\n${accumulatedText}\n` : ""}
# 지금 쓸 비트: [${beat.type}] (${i + 1}/${beats.length})
${beat.instruction}
${tensionLine}

규칙:
- 감정을 설명하지 말고 행동/감각으로 보여주세요
- "~였다" 어미 반복 금지. 직전 문장과 다른 어미를 쓰세요.
- 캐릭터 말투를 지키세요
- 이전 텍스트에 자연스럽게 이어지게 쓰세요
- 연속 3문장을 같은 주어로 시작하지 마세요
- 대사 후 "라고 말했다" 대신 행동 비트("칼을 내려놓았다", "고개를 돌렸다")로 화자를 보여주세요
- 독자가 다음을 궁금해할 긴장 요소를 유지하세요

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
