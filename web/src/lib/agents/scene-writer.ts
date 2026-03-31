/**
 * Scene-by-scene writer.
 *
 * Instead of generating an entire chapter at once, generates each scene
 * independently with accumulated context. Between scenes, code validation
 * checks quality and triggers repair if needed.
 */

import { getAgent } from "./llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import { getForeshadowingActions, getActiveThreadsForChapter, formatThreadRevealsForPrompt } from "@/lib/schema/novel";
import type { ChapterBlueprint, SceneSpec } from "@/lib/schema/planning";
import type { TokenUsage } from "@/lib/agents/types";
import { validateScene, buildSceneRepairPrompt } from "./scene-validator";
import { planBeats, writeSceneByBeats } from "./beat-writer";
import { validateSentiment } from "./sentiment-validator";
import { detectInterSceneRepetition } from "./repetition-detector";
import { validateConflictGate } from "./conflict-gate";

export interface SceneWriterOptions {
  seed: NovelSeed;
  chapterNumber: number;
  blueprint: ChapterBlueprint;
  systemPrompt: string;
  model?: string;
  /** Previously written scenes in this chapter (for continuity) */
  previousSceneTexts?: string[];
  /** Summaries of previous chapters */
  previousSummaries?: Array<{ chapter: number; summary: string; cliffhanger?: string | null }>;
  /** Hierarchical memory context (replaces previousSummaries when available) */
  memoryContext?: string;
  /** Tone guidance for this chapter */
  toneGuidance?: string;
  /** Progress context (pacing info) */
  progressContext?: string;
  /** Thread reminders to weave into scenes */
  threadReminders?: string[];
  /** Correction context from feedback system */
  correctionContext?: string;
  /** Last ~500 chars of the previous chapter's actual text */
  previousChapterEnding?: string;
  /** Skip beat-by-beat writing and generate each scene in one call (faster) */
  fastMode?: boolean;
  /** Generate scenes in parallel + bridge stitching (fastest) */
  parallelMode?: boolean;
}

export interface SceneWriterResult {
  /** All scene texts concatenated */
  fullText: string;
  /** Individual scene texts */
  sceneTexts: string[];
  /** Total token usage across all scenes */
  usage: TokenUsage;
  /** Validation issues found (if any remain after repair) */
  remainingIssues: string[];
}

/**
 * Build the prompt for generating a single scene.
 */
export function buildScenePrompt(
  seed: NovelSeed,
  chapterNumber: number,
  blueprint: ChapterBlueprint,
  scene: SceneSpec,
  sceneIndex: number,
  previousSceneTexts: string[],
  previousSummaries: Array<{ chapter: number; summary: string }>,
  extras?: {
    memoryContext?: string;
    toneGuidance?: string;
    progressContext?: string;
    threadReminders?: string[];
    correctionContext?: string;
    previousChapterEnding?: string;
  },
): string {
  const parts: string[] = [];

  // Novel context (enriched with world details)
  parts.push(`# 소설
제목: ${seed.title} | 장르: ${seed.world.genre} (${seed.world.sub_genre})
시대: ${seed.world.time_period}
${chapterNumber}화 — ${blueprint.one_liner}
`);

  // World setting context
  const worldParts: string[] = [];
  const keyLocations = seed.world.key_locations;
  if (keyLocations && Object.keys(keyLocations).length > 0) {
    const locationEntries = Object.entries(keyLocations).slice(0, 4);
    worldParts.push(`주요 장소: ${locationEntries.map(([k, v]) => `${k}(${v})`).join(", ")}`);
  }
  const factions = seed.world.factions;
  if (factions && Object.keys(factions).length > 0) {
    const factionEntries = Object.entries(factions).slice(0, 3);
    worldParts.push(`세력: ${factionEntries.map(([k, v]) => `${k}(${v})`).join(", ")}`);
  }
  if (seed.world.magic_system) {
    worldParts.push(`능력 체계: ${seed.world.magic_system}`);
  }
  if (seed.world.rules.length > 0) {
    worldParts.push(`세계 규칙: ${seed.world.rules.slice(0, 3).join("; ")}`);
  }
  if (worldParts.length > 0) {
    parts.push(`# 세계관\n${worldParts.join("\n")}\n`);
  }

  // Chapter outline context (from seed's chapter_outlines)
  const chapterOutline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNumber,
  );
  // Resolve tension level: prefer chapter outline, fall back to blueprint
  const tensionLevel = chapterOutline?.tension_level ?? blueprint.tension_level ?? 5;
  if (chapterOutline) {
    const keyPtsStr = chapterOutline.key_points.length > 0
      ? `\n핵심 사건: ${chapterOutline.key_points.join(" / ")}`
      : "";
    parts.push(`# 이번 화 설계
${chapterOutline.one_liner}${keyPtsStr}
긴장도: ${tensionLevel}/10 — 이 챕터의 긴장도는 ${tensionLevel}/10입니다. 그에 맞는 페이스로 작성하세요.
`);
  } else if (blueprint.tension_level != null) {
    parts.push(`# 이번 화 긴장도
긴장도: ${blueprint.tension_level}/10 — 이 챕터의 긴장도는 ${blueprint.tension_level}/10입니다. 그에 맞는 페이스로 작성하세요.
`);
  }

  // Characters in this scene
  const sceneChars = scene.characters
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);

  // Character full name list for name consistency
  if (seed.characters.length > 0) {
    const fullNames = seed.characters.map((c) => c.name).join(", ");
    parts.push(`# 등장 캐릭터 풀네임 (반드시 이 이름만 사용하세요!)
${fullNames}
⚠️ 위 풀네임 외에 다른 성씨나 이름을 만들어내지 마세요.
`);
  }

  if (sceneChars.length > 0) {
    parts.push("# 이 씬의 캐릭터 (말투를 반드시 구분하세요!)");
    for (const char of sceneChars) {
      if (!char) continue;
      const dialogues = char.voice.sample_dialogues.slice(0, 3);
      const speechPatterns = char.voice.speech_patterns?.slice(0, 3) || [];
      const gender = char.gender || "male";
      const pronoun = gender === "female" ? "그녀" : gender === "other" ? "그" : "그";
      const genderLabel = gender === "female" ? "여성" : gender === "male" ? "남성" : "기타";

      // Current mutable state
      const stateLines: string[] = [];
      if (char.state.status && char.state.status !== "normal") {
        stateLines.push(`현재 감정/상태: ${char.state.status}`);
      }
      if (char.state.location) {
        stateLines.push(`현재 위치: ${char.state.location}`);
      }
      const relEntries = Object.entries(char.state.relationships || {});
      if (relEntries.length > 0) {
        stateLines.push(`관계: ${relEntries.map(([k, v]) => `${k}(${v})`).join(", ")}`);
      }
      if (char.state.secrets_known && char.state.secrets_known.length > 0) {
        stateLines.push(`알고 있는 비밀: ${char.state.secrets_known.join(", ")}`);
      }
      const stateBlock = stateLines.length > 0 ? `\n${stateLines.join("\n")}` : "";

      parts.push(`**${char.name}** (${char.role}, ${genderLabel}) — 대명사: "${pronoun}"
성격: ${char.voice.personality_core}
말투: ${char.voice.tone}
${speechPatterns.length > 0 ? `말투 특징: ${speechPatterns.join(", ")}` : ""}
대사 예시:
${dialogues.map((d) => `  "${d}"`).join("\n") || '  (없음)'}${stateBlock}
⚠️ ${char.name}은(는) ${genderLabel}입니다. 반드시 "${pronoun}"로 지칭하세요. 대사는 위 말투를 따라야 합니다.
`);
    }
    if (sceneChars.length >= 2) {
      parts.push(`## 캐릭터 음성 구분 규칙
- 이름을 가리고 대사만 읽어도 누가 말하는지 알 수 있어야 합니다
- 각 캐릭터의 어휘 수준, 존댓말/반말, 감정 표현 방식이 달라야 합니다
- 같은 상황에서도 캐릭터마다 다르게 반응해야 합니다
`);
    }

    // Identify characters NOT present in the previous chapter
    // They need explicit entrance scenes (not just appear as if always there)
    if (chapterNumber > 1 && extras?.previousChapterEnding) {
      const prevEndingText = extras.previousChapterEnding;
      const newChars = sceneChars.filter(
        (c) => c && !prevEndingText.includes(c.name),
      );
      if (newChars.length > 0) {
        const newCharNames = newChars.map((c) => c!.name);
        parts.push(`## 캐릭터 등장 제약 (필수!)
다음 인물은 **이전 화에 직접 등장하지 않았습니다**: ${newCharNames.join(", ")}

**규칙:**
- 이 인물이 이 씬에서 직접 등장(대사/행동)하려면, 반드시 **등장하는 순간**을 묘사하세요.
  예: 문이 열리고 들어온다, 전갈이 도착한다, 길에서 마주친다 등.
- 이미 그 자리에 있던 것처럼 갑자기 대사하면 절대 안 됩니다.
- 다른 인물의 대화 속 **언급**이나 **회상**은 자유롭게 가능합니다.
- 가능하면 이 씬에서는 이전 화에 있던 인물 위주로 쓰고, 위 인물은 자연스러운 계기가 있을 때만 등장시키세요.
`);
      }
    }
  }

  // Previous context: hierarchical memory (preferred) or chapter summaries (fallback)
  if (extras?.memoryContext) {
    parts.push(`# 이전 내용 (기억 컨텍스트)\n${extras.memoryContext}\n`);
  } else if (previousSummaries.length > 0) {
    const recent = previousSummaries.slice(-2);
    parts.push("# 이전 내용");
    for (const s of recent) {
      parts.push(`- ${s.chapter}화: ${s.summary.slice(0, 300)}`);
    }
    parts.push("");
  }

  // For scene 0 (first scene of a new chapter), include previous chapter's ending
  // to prevent content overlap and ensure continuity
  if (sceneIndex === 0 && chapterNumber > 1) {
    const endingText = extras?.previousChapterEnding;
    if (endingText) {
      // Extract scene state from ending text for continuity
      const sceneState = extractSceneState(endingText, seed);

      parts.push(`# 직전 화 마지막 장면 (이 내용 바로 다음부터 이어서 쓰세요!)

## 직전 화 상태 (반드시 이어서!)
- 시간대: ${sceneState.timeOfDay}
- 장소: ${sceneState.location}
- 등장인물: ${sceneState.characters.join(", ")}
${sceneState.characters.length > 0 ? `⚠️ 직전 화 마지막에 위 인물들이 있었습니다.
- 같은 장면이 이어지면 새 인물이 갑자기 등장하면 안 됩니다.
- 새 인물이 등장하려면 반드시 이유가 있어야 합니다 (문을 열고 들어오는 장면, 전갈이 오는 장면 등).
- 이미 그 자리에 있던 것처럼 묘사하면 안 됩니다 — "등장하는 순간"을 보여주세요.` : ""}

---
${endingText}
---
⚠️ 위는 ${chapterNumber - 1}화의 마지막 부분입니다. 이미 독자가 읽은 내용입니다.
- 이 장면의 **직후**부터 시작하세요.
- 위 내용을 반복하거나 같은 상황을 다시 묘사하지 마세요.
- 인물의 위치, 감정, 상황이 위 장면과 자연스럽게 이어져야 합니다.
`);
    }
  }

  // Progress/pacing context
  if (extras?.progressContext) {
    parts.push(`# 진행 상황\n${extras.progressContext}\n`);
  }

  // Foreshadowing actions for this chapter
  const fsActions = getForeshadowingActions(seed, chapterNumber);
  if (fsActions.length > 0) {
    parts.push("# 복선 지시 (이 화에서 처리할 복선)");
    for (const { foreshadowing: fs, action } of fsActions) {
      switch (action) {
        case "plant":
          parts.push(`- [심기] "${fs.name}": ${fs.description}\n  → 독자가 눈치채지 못하도록 자연스러운 묘사나 대사 속에 심으세요. 직접 설명하지 마세요.`);
          break;
        case "hint":
          parts.push(`- [암시] "${fs.name}": ${fs.description}\n  → 이미 심어둔 복선의 단서를 살짝 드러내세요. 캐릭터의 행동이나 소품을 통해 간접적으로.`);
          break;
        case "reveal":
          parts.push(`- [공개] "${fs.name}": ${fs.description}\n  → 복선을 회수하세요. 독자가 "아, 그때 그거!" 하고 느낄 수 있도록 이전 장면과 연결하세요.`);
          break;
      }
    }
    parts.push("");
  }

  // Story thread reveal guide for this chapter
  const activeReveals = getActiveThreadsForChapter(seed.story_threads || [], chapterNumber);
  if (activeReveals.length > 0) {
    const revealGuide = formatThreadRevealsForPrompt(activeReveals);
    parts.push(`# 이 화에서의 캐릭터 내면 가이드
${revealGuide}
⚠️ [hidden]은 절대 독자에게 드러내지 마세요. [hinted]는 간접 암시만. [partial]은 일부만. [revealed]는 확실하게.
`);
  }

  // Previous scenes in this chapter
  if (previousSceneTexts.length > 0) {
    // Only show the last scene for continuity (not all, to keep prompt short)
    const lastScene = previousSceneTexts[previousSceneTexts.length - 1];
    parts.push(`# 직전 씬 (이어서 쓰세요)
${lastScene.slice(-800)}
`);
  }

  // Tone guidance (before scene instruction)
  if (extras?.toneGuidance) {
    parts.push(`# 톤 가이드\n${extras.toneGuidance}\n`);
  }

  // Warn about already-covered content from previous chapters
  if (sceneIndex === 0 && previousSummaries.length > 0) {
    const lastSummary = previousSummaries[previousSummaries.length - 1];
    parts.push(`# ⚠️ 이전 화에서 이미 다룬 내용 (절대 반복 금지)
${lastSummary.summary.slice(0, 300)}
→ 위 내용은 이미 독자가 읽었습니다. 같은 장면, 같은 사건, 같은 감정을 다시 쓰지 마세요.
→ 이번 화는 위 내용의 **직후**부터 시작해야 합니다.
`);
  }

  // Fun structure guidance from blueprint
  const funGuidanceParts: string[] = [];
  if (blueprint.curiosity_hook) {
    funGuidanceParts.push(`호기심 질문: "${blueprint.curiosity_hook}" — 이 의문이 독자 머릿속에 남도록 장면을 구성하세요.`);
  }
  if (blueprint.emotional_peak_position != null) {
    const totalScenes = blueprint.scenes.length;
    const peakSceneIdx = Math.round(blueprint.emotional_peak_position * (totalScenes - 1));
    if (sceneIndex === peakSceneIdx) {
      funGuidanceParts.push("🔥 이 씬이 감정 피크입니다. 감정 강도를 최대로 끌어올리세요.");
    } else if (sceneIndex === peakSceneIdx - 1) {
      funGuidanceParts.push("이 씬은 감정 피크 직전입니다. 긴장감을 차곡차곡 쌓아올리세요.");
    } else if (sceneIndex > peakSceneIdx) {
      funGuidanceParts.push("감정 피크 이후입니다. 여운을 남기되 새로운 궁금증을 심으세요.");
    }
  }
  if (blueprint.cliffhanger_type && sceneIndex === blueprint.scenes.length - 1) {
    const cliffInstructions: Record<string, string> = {
      question: "마지막 문장은 독자에게 풀리지 않은 질문을 던지세요. '왜?', '누가?', '어떻게?'를 유발하세요.",
      crisis: "주인공이 최악의 상황에 처한 순간에서 끊으세요. 탈출구가 보이지 않아야 합니다.",
      revelation: "충격적인 사실이 드러나는 바로 그 순간에서 끊으세요. 반응은 다음 화에서.",
      twist: "독자가 예상한 것과 정반대의 결과를 마지막 1~2문장에서 보여주세요.",
    };
    funGuidanceParts.push(`🎯 엔딩 지시: ${cliffInstructions[blueprint.cliffhanger_type] || ""}`);
  }
  const funGuidanceSection = funGuidanceParts.length > 0
    ? `\n## 재미 구조 가이드\n${funGuidanceParts.join("\n")}\n`
    : "";

  // Scene instruction
  const sceneLabel = `씬 ${sceneIndex + 1}/${blueprint.scenes.length}`;

  // Correction context prepended to writing rules
  const correctionRule = extras?.correctionContext
    ? `\n## 교정 지침 (이전 피드백 반영)\n${extras.correctionContext}\n`
    : "";

  // Thread reminders for last or second-to-last scene
  const isLastOrSecondToLast =
    sceneIndex >= blueprint.scenes.length - 2;
  const threadReminderSection =
    isLastOrSecondToLast && extras?.threadReminders && extras.threadReminders.length > 0
      ? `\n## 서사 스레드 힌트\n${extras.threadReminders.map((r) => `- ${r}`).join("\n")}\n`
      : "";

  // Must-reveal facts — these MUST appear in the scene text
  const mustRevealSection = scene.must_reveal && scene.must_reveal.length > 0
    ? `\n**⚠️ 반드시 전달할 정보** (이 팩트들이 독자에게 명확히 전달되어야 합니다):\n${scene.must_reveal.map((r: string) => `- ${r}`).join("\n")}\n→ 감각 묘사로 암시하지 말고, 서술이나 대사로 명확하게 전달하세요.\n`
    : "";

  // 5W1H context for this scene
  const fiveW1HParts: string[] = [];
  if (scene.who) fiveW1HParts.push(`**누가(→상대)**: ${scene.who}`);
  if (scene.when) fiveW1HParts.push(`**언제**: ${scene.when}`);
  if (scene.where_detail) fiveW1HParts.push(`**어디서**: ${scene.where_detail}`);
  if (scene.how) fiveW1HParts.push(`**어떻게**: ${scene.how}`);
  const fiveW1HSection = fiveW1HParts.length > 0
    ? `\n${fiveW1HParts.join("\n")}\n`
    : "";

  // Opening context for chapter 1
  const openingContextSection = (chapterNumber === 1 && sceneIndex === 0 && chapterOutline?.opening_context)
    ? `\n**📖 초기 맥락 (1화 도입부에서 자연스럽게 전달하세요)**:\n${chapterOutline.opening_context}\n→ 직접 설명하지 말고, 행동/감각/대사 속에 녹여서 보여주세요.\n`
    : "";

  parts.push(`# ${sceneLabel} 지시

**목적**: ${scene.purpose}
**유형**: ${scene.type}
**감정톤**: ${scene.emotional_tone}
**목표 분량**: ${scene.estimated_chars}자
${fiveW1HSection}${openingContextSection}${mustRevealSection}${correctionRule}
## 작성 규칙
1. 이 씬의 목적에만 집중하세요. 다른 사건을 끌어오지 마세요.
2. 씬 전환 시 반드시 빈 줄 + \`***\` + 빈 줄로 구분하세요. 새 씬 첫 문장에 장소와 시간을 명시하세요. 장소를 이동할 때 이동 과정을 1-2문장으로 묘사하세요.
3. 대사를 충분히 넣으세요 (전체의 30% 이상). 캐릭터 목소리가 들려야 합니다.
4. 감정을 설명하지 말고 행동/감각으로 보여주세요:
   - ❌ "불안했다" → ✅ "찻잔을 드는 손끝이 떨렸다"
   - ❌ "결심을 굳혔다" → ✅ "칼집에서 단검을 뽑았다"
5. 문장 어미를 다양하게 쓰세요 (~였다 반복 금지)
6. 짧은 문단 (3문장 이하). 문장 길이도 다양하게 (짧은 문장 → 중간 → 짧은)
7. 앞 씬에서 쓴 표현/묘사를 반복하지 마세요. 새로운 감각과 비유를 사용하세요.
8. 갈등은 이 씬에서 해결하지 마세요. 더 꼬이게 만드세요.
9. 물리적 공간에 장면을 고정하세요: 장소, 시간대, 날씨/조명을 첫 2문장 안에 설정하세요.
10. 연속 3문장 이상 같은 주어로 시작하지 마세요. 주어를 생략하거나 부사/상황으로 시작하세요.
11. 대사 뒤에 "~라고 말했다"를 반복하지 마세요. 행동 비트로 화자를 보여주세요:
    - ❌ "가자." 그가 말했다. → ✅ "가자." 그가 검집을 채웠다.
${sceneIndex === blueprint.scenes.length - 1 ? "12. 마지막 씬이므로 다음 화가 궁금해지는 문장으로 끝내세요. 반전이나 새로운 위기를 던지세요." : ""}
${threadReminderSection}${funGuidanceSection}
출력: 씬 본문만 (메타 정보 없이)`);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Extract scene state from text for continuity
// ---------------------------------------------------------------------------

function extractSceneState(
  text: string,
  seed: NovelSeed,
): { timeOfDay: string; location: string; characters: string[] } {
  // Time of day detection
  const timePatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /아침|새벽|해가 뜨|일어나|기상|아침 식사|조식/, label: "아침" },
    { pattern: /점심|낮|오후|한낮|정오/, label: "낮" },
    { pattern: /저녁|해질|석양|만찬|저녁 식사|석식/, label: "저녁" },
    { pattern: /밤|야간|달빛|어둠|자정|취침|잠/, label: "밤" },
  ];
  let timeOfDay = "불명";
  for (const { pattern, label } of timePatterns) {
    if (pattern.test(text)) {
      timeOfDay = label;
      break;
    }
  }

  // Location detection from seed's key_locations
  let location = "불명";
  const keyLocations = seed.world.key_locations;
  if (keyLocations) {
    for (const [name] of Object.entries(keyLocations)) {
      if (text.includes(name)) {
        location = name;
        break;
      }
    }
  }
  // Fallback: common location words
  if (location === "불명") {
    const locationWords = [
      "식당", "서재", "침실", "복도", "정원", "거리", "광장", "성",
      "숲", "마차", "객실", "연회장", "무도회장", "궁", "왕좌",
    ];
    for (const word of locationWords) {
      if (text.includes(word)) {
        location = word;
        break;
      }
    }
  }

  // Character detection from seed
  const characters: string[] = [];
  for (const char of seed.characters) {
    if (text.includes(char.name)) {
      characters.push(char.name);
    }
  }

  return { timeOfDay, location, characters };
}

const ZERO_USAGE: TokenUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
};

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}

/**
 * Generate a chapter scene-by-scene with code validation between each scene.
 */
export async function writeChapterByScenes(
  options: SceneWriterOptions,
): Promise<SceneWriterResult> {
  const {
    seed,
    chapterNumber,
    blueprint,
    systemPrompt,
    model,
    previousSummaries = [],
    memoryContext,
    toneGuidance,
    progressContext,
    threadReminders,
    correctionContext,
    previousChapterEnding,
    fastMode,
  } = options;

  const agent = getAgent();
  const sceneTexts: string[] = [];
  let totalUsage: TokenUsage = { ...ZERO_USAGE };
  const remainingIssues: string[] = [];

  // If no scenes in blueprint, fall back to single-shot generation
  if (blueprint.scenes.length === 0) {
    const result = await agent.call({
      prompt: `${chapterNumber}화를 작성해주세요. ${blueprint.one_liner}\n\n출력: 소설 본문만`,
      system: systemPrompt,
      model,
      temperature: 0.5,
      maxTokens: 8000,
      taskId: `chapter-${chapterNumber}-write`,
    });
    return {
      fullText: result.data,
      sceneTexts: [result.data],
      usage: result.usage,
      remainingIssues: [],
    };
  }

  for (let i = 0; i < blueprint.scenes.length; i++) {
    const scene = blueprint.scenes[i];

    // 1. Generate scene
    const previousText = sceneTexts.length > 0
      ? sceneTexts[sceneTexts.length - 1]
      : (previousChapterEnding || "");

    let sceneText: string;

    if (fastMode) {
      // Fast mode: generate entire scene in one LLM call (no beats)
      const scenePrompt = buildScenePrompt(
        seed, chapterNumber, blueprint, scene, i,
        sceneTexts, previousSummaries,
        { memoryContext, toneGuidance, progressContext, threadReminders, correctionContext, previousChapterEnding },
      );
      const result = await agent.call({
        prompt: scenePrompt,
        system: systemPrompt,
        model,
        temperature: 0.5,
        maxTokens: Math.max(2000, Math.ceil(scene.estimated_chars * 1.5)),
        taskId: `chapter-${chapterNumber}-scene-${i + 1}-fast`,
      });
      totalUsage = addUsage(totalUsage, result.usage);
      sceneText = result.data.trim();
    } else {
      // Normal mode: beat-by-beat structured writing
      const beats = planBeats(scene, seed);
      const beatResult = await writeSceneByBeats({
        beats,
        scene,
        seed,
        chapterNumber,
        previousText,
        systemPrompt,
        model,
        previousChapterEnding,
      });
      totalUsage = addUsage(totalUsage, beatResult.usage);
      sceneText = beatResult.text;
    }

    // 2. Code validation + strict retry loop (up to 3 attempts)
    const MAX_REPAIR_ATTEMPTS = 3;
    let validation = validateScene(sceneText, scene.estimated_chars, scene.type);
    let repairAttempt = 0;

    while (!validation.passed && repairAttempt < MAX_REPAIR_ATTEMPTS) {
      repairAttempt++;
      const repairPrompt = buildSceneRepairPrompt(sceneText, validation.issues);
      const repairResult = await agent.call({
        prompt: repairPrompt,
        system: systemPrompt,
        model,
        temperature: 0.3,
        maxTokens: Math.max(2000, Math.ceil(scene.estimated_chars * 1.5)),
        taskId: `chapter-${chapterNumber}-scene-${i + 1}-repair-${repairAttempt}`,
      });
      totalUsage = addUsage(totalUsage, repairResult.usage);

      const repairedText = repairResult.data.trim();
      if (repairedText.length > sceneText.length * 0.5) {
        sceneText = repairedText;
      }

      validation = validateScene(sceneText, scene.estimated_chars, scene.type);
    }

    // Log remaining issues after all retry attempts
    if (!validation.passed) {
      for (const issue of validation.issues.filter((iss) => iss.severity === "error")) {
        remainingIssues.push(`[씬${i + 1}] ${issue.message}`);
      }
    }

    // Additional validations (non-blocking — log warnings but don't retry)
    const sentimentResult = validateSentiment(sceneText, scene.emotional_tone);
    if (!sentimentResult.passed) {
      for (const issue of sentimentResult.issues) {
        remainingIssues.push(`[씬${i + 1}/감정] ${issue}`);
      }
    }

    if (sceneTexts.length > 0) {
      const repetitionResult = detectInterSceneRepetition(sceneText, sceneTexts);
      if (!repetitionResult.passed) {
        for (const issue of repetitionResult.issues.filter((iss) => iss.severity === "error")) {
          remainingIssues.push(`[씬${i + 1}/반복] ${issue.message}`);
        }
      }
    }

    const isLastScene = i === blueprint.scenes.length - 1;
    const conflictResult = validateConflictGate(
      sceneText,
      chapterNumber,
      seed.total_chapters,
      "rising_action", // default; blueprint doesn't expose role_in_arc per scene
      isLastScene,
    );
    if (!conflictResult.passed) {
      for (const issue of conflictResult.issues.filter((iss) => iss.severity === "error")) {
        remainingIssues.push(`[씬${i + 1}/갈등] ${issue.message}`);
      }
    }

    sceneTexts.push(sceneText);
  }

  // Assemble all scenes with natural paragraph breaks
  const fullText = sceneTexts.join("\n\n");

  return { fullText, sceneTexts, usage: totalUsage, remainingIssues };
}

// ---------------------------------------------------------------------------
// Parallel scene generation + bridge stitching
// ---------------------------------------------------------------------------

/**
 * Generate all scenes in parallel, then stitch with bridge passes.
 * ~2-3x faster than sequential for 3+ scenes.
 */
export async function writeChapterParallel(
  options: SceneWriterOptions,
): Promise<SceneWriterResult> {
  const {
    seed,
    chapterNumber,
    blueprint,
    systemPrompt,
    model,
    previousSummaries = [],
    memoryContext,
    toneGuidance,
    progressContext,
    threadReminders,
    correctionContext,
    previousChapterEnding,
  } = options;

  const agent = getAgent();
  let totalUsage: TokenUsage = { ...ZERO_USAGE };
  const remainingIssues: string[] = [];

  if (blueprint.scenes.length === 0) {
    const result = await agent.call({
      prompt: `${chapterNumber}화를 작성해주세요. ${blueprint.one_liner}\n\n출력: 소설 본문만`,
      system: systemPrompt,
      model,
      temperature: 0.5,
      maxTokens: 8000,
      taskId: `chapter-${chapterNumber}-write`,
    });
    return {
      fullText: result.data,
      sceneTexts: [result.data],
      usage: result.usage,
      remainingIssues: [],
    };
  }

  // --- Phase 1: Generate all scenes in parallel ---
  const scenePromises = blueprint.scenes.map((scene, i) => {
    const scenePrompt = buildScenePrompt(
      seed, chapterNumber, blueprint, scene, i,
      [], // no previous scene texts in parallel mode
      previousSummaries,
      {
        memoryContext,
        toneGuidance,
        progressContext,
        threadReminders: i >= blueprint.scenes.length - 2 ? threadReminders : undefined,
        correctionContext,
        previousChapterEnding: previousChapterEnding,
      },
    );

    return agent.call({
      prompt: scenePrompt,
      system: systemPrompt,
      model,
      temperature: 0.5,
      maxTokens: Math.max(2000, Math.ceil(scene.estimated_chars * 1.5)),
      taskId: `chapter-${chapterNumber}-scene-${i + 1}-parallel`,
    });
  });

  const sceneResults = await Promise.all(scenePromises);
  const sceneTexts = sceneResults.map((r) => r.data.trim());
  for (const r of sceneResults) {
    totalUsage = addUsage(totalUsage, r.usage);
  }

  // --- Phase 1.5a: Scene boundary dedup ---
  // If scene B's first 2 sentences overlap with scene A's last 2, trim scene B's opening
  if (sceneTexts.length >= 2) {
    for (let si = 1; si < sceneTexts.length; si++) {
      const prevText = sceneTexts[si - 1];
      const currText = sceneTexts[si];

      // Extract last 2 sentences of previous scene
      const prevSentences = prevText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      const lastTwo = prevSentences.slice(-2).map((s) => s.trim());

      // Extract first 3 sentences of current scene
      const currSentences = currText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      const firstThree = currSentences.slice(0, 3);

      // Check if any of first 3 sentences share 60%+ nouns with last 2
      const lastNouns = new Set((lastTwo.join(" ").match(/[가-힣]{2,}/g) || []));
      if (lastNouns.size >= 2) {
        let trimCount = 0;
        for (const sent of firstThree) {
          const sentNouns = new Set((sent.match(/[가-힣]{2,}/g) || []).filter((n) => n.length >= 2));
          if (sentNouns.size < 2) break;
          const overlap = [...sentNouns].filter((n) => lastNouns.has(n)).length / sentNouns.size;
          if (overlap >= 0.6) trimCount++;
          else break;
        }
        if (trimCount > 0) {
          const remaining = currSentences.slice(trimCount);
          sceneTexts[si] = remaining.join(" ");
        }
      }
    }
  }

  // --- Phase 1.5b: Cross-scene paragraph deduplication ---
  // Remove paragraphs in later scenes that duplicate earlier scene content
  if (sceneTexts.length >= 2) {
    for (let si = 1; si < sceneTexts.length; si++) {
      const prevNouns = new Set<string>();
      // Collect all nouns from previous scenes
      for (let pi = 0; pi < si; pi++) {
        const matches = sceneTexts[pi].match(/[가-힣]{2,}/g) || [];
        for (const m of matches) prevNouns.add(m);
      }

      // Check each paragraph of current scene for overlap with previous scenes
      const paragraphs = sceneTexts[si].split("\n\n").filter((p) => p.trim().length > 0);
      const kept: string[] = [];
      for (const para of paragraphs) {
        const paraNouns = new Set((para.match(/[가-힣]{2,}/g) || []).filter((n) => n.length >= 2));
        if (paraNouns.size < 3) { kept.push(para); continue; } // too short to compare

        // Check overlap: if 80%+ of this paragraph's nouns are in previous scenes, it's a duplicate
        const overlap = [...paraNouns].filter((n) => prevNouns.has(n)).length / paraNouns.size;
        if (overlap < 0.8) {
          kept.push(para);
        }
        // else: skip this paragraph (duplicate content from earlier scene)
      }

      if (kept.length < paragraphs.length) {
        sceneTexts[si] = kept.join("\n\n");
      }
    }
  }

  // --- Phase 2: Bridge stitching ---
  // For each seam between scenes, take the last 2 sentences of scene N
  // and first 2 sentences of scene N+1, and ask LLM to smooth the transition.
  if (sceneTexts.length >= 2) {
    for (let i = 0; i < sceneTexts.length - 1; i++) {
      const endOfCurrent = extractLastSentences(sceneTexts[i], 3);
      const startOfNext = extractFirstSentences(sceneTexts[i + 1], 3);

      const bridgePrompt = `다음은 소설의 연속된 두 씬의 이음새입니다. 자연스럽게 연결되도록 수정해주세요.

## 씬 ${i + 1} 끝부분
${endOfCurrent}

## 씬 ${i + 2} 시작부분
${startOfNext}

## 규칙
- 두 부분이 자연스럽게 이어지도록 수정
- 시간/공간 전환이 있으면 짧은 전환 문장 추가 가능
- 감정 흐름이 끊기지 않도록
- 기존 내용을 최대한 유지하되 이음새만 다듬기
- 출력: 수정된 "씬 ${i + 1} 끝부분" + "씬 ${i + 2} 시작부분" (구분선 --- 으로 구분)`;

      try {
        const bridgeResult = await agent.call({
          prompt: bridgePrompt,
          system: "당신은 소설 편집자입니다. 씬 간 이음새를 자연스럽게 다듬어주세요.",
          model,
          temperature: 0.3,
          maxTokens: 1000,
          taskId: `chapter-${chapterNumber}-bridge-${i + 1}`,
        });
        totalUsage = addUsage(totalUsage, bridgeResult.usage);

        // Parse bridge result: split by --- separator
        const parts = bridgeResult.data.split(/---+/).map((p: string) => p.trim()).filter((p: string) => p.length > 0);
        if (parts.length >= 2) {
          // Replace the end of current scene and start of next scene
          sceneTexts[i] = replaceEndSentences(sceneTexts[i], 3, parts[0]);
          sceneTexts[i + 1] = replaceStartSentences(sceneTexts[i + 1], 3, parts[1]);
        }
      } catch (err) {
        // Bridge failure is non-critical — just use the raw join
        remainingIssues.push(`[브릿지 ${i + 1}-${i + 2}] 이음새 다듬기 실패: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // --- Phase 3: Validation (same as sequential) ---
  for (let i = 0; i < sceneTexts.length; i++) {
    const scene = blueprint.scenes[i];
    const validation = validateScene(sceneTexts[i], scene.estimated_chars, scene.type);
    if (!validation.passed) {
      for (const issue of validation.issues.filter((iss) => iss.severity === "error")) {
        remainingIssues.push(`[씬${i + 1}] ${issue.message}`);
      }
    }
  }

  const fullText = sceneTexts.join("\n\n");
  return { fullText, sceneTexts, usage: totalUsage, remainingIssues };
}

// ---------------------------------------------------------------------------
// Bridge helpers
// ---------------------------------------------------------------------------

function splitIntoSentences(text: string): string[] {
  return text.split(/(?<=[.!?。])\s+/).filter((s) => s.trim().length > 0);
}

function extractLastSentences(text: string, n: number): string {
  const paragraphs = text.split("\n").filter((p) => p.trim());
  // Take last paragraph(s) that contain at least n sentences total
  const allSentences: string[] = [];
  for (let i = paragraphs.length - 1; i >= 0 && allSentences.length < n; i--) {
    const sentences = splitIntoSentences(paragraphs[i]);
    allSentences.unshift(...sentences);
  }
  return allSentences.slice(-n).join(" ");
}

function extractFirstSentences(text: string, n: number): string {
  const paragraphs = text.split("\n").filter((p) => p.trim());
  const allSentences: string[] = [];
  for (let i = 0; i < paragraphs.length && allSentences.length < n; i++) {
    const sentences = splitIntoSentences(paragraphs[i]);
    allSentences.push(...sentences);
  }
  return allSentences.slice(0, n).join(" ");
}

function replaceEndSentences(text: string, n: number, replacement: string): string {
  const lastSentences = extractLastSentences(text, n);
  const idx = text.lastIndexOf(lastSentences.split(" ")[0]);
  if (idx > 0) {
    return text.slice(0, idx) + replacement;
  }
  return text;
}

function replaceStartSentences(text: string, n: number, replacement: string): string {
  const firstSentences = extractFirstSentences(text, n);
  const lastWord = firstSentences.split(" ").pop() || "";
  const idx = text.indexOf(lastWord);
  if (idx >= 0) {
    return replacement + text.slice(idx + lastWord.length);
  }
  return text;
}
