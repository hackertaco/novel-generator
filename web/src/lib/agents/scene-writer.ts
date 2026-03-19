/**
 * Scene-by-scene writer.
 *
 * Instead of generating an entire chapter at once, generates each scene
 * independently with accumulated context. Between scenes, code validation
 * checks quality and triggers repair if needed.
 */

import { getAgent } from "./llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import { getForeshadowingActions } from "@/lib/schema/novel";
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
  if (chapterOutline) {
    const keyPtsStr = chapterOutline.key_points.length > 0
      ? `\n핵심 사건: ${chapterOutline.key_points.join(" / ")}`
      : "";
    parts.push(`# 이번 화 설계
${chapterOutline.one_liner}${keyPtsStr}
긴장도: ${chapterOutline.tension_level}/10
`);
  }

  // Characters in this scene
  const sceneChars = scene.characters
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);

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
      parts.push(`# 직전 화 마지막 장면 (이 내용 바로 다음부터 이어서 쓰세요!)
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

  parts.push(`# ${sceneLabel} 지시

**목적**: ${scene.purpose}
**유형**: ${scene.type}
**감정톤**: ${scene.emotional_tone}
**목표 분량**: ${scene.estimated_chars}자
${correctionRule}
## 작성 규칙
1. 이 씬의 목적에만 집중하세요. 다른 사건을 끌어오지 마세요.
2. 대사를 충분히 넣으세요 (전체의 30% 이상). 캐릭터 목소리가 들려야 합니다.
3. 감정을 설명하지 말고 행동/감각으로 보여주세요:
   - ❌ "불안했다" → ✅ "찻잔을 드는 손끝이 떨렸다"
   - ❌ "결심을 굳혔다" → ✅ "칼집에서 단검을 뽑았다"
4. 문장 어미를 다양하게 쓰세요 (~였다 반복 금지)
5. 짧은 문단 (3문장 이하). 문장 길이도 다양하게 (짧은 문장 → 중간 → 짧은)
6. 앞 씬에서 쓴 표현/묘사를 반복하지 마세요. 새로운 감각과 비유를 사용하세요.
7. 갈등은 이 씬에서 해결하지 마세요. 더 꼬이게 만드세요.
8. 물리적 공간에 장면을 고정하세요: 장소, 시간대, 날씨/조명을 첫 2문장 안에 설정하세요.
9. 연속 3문장 이상 같은 주어로 시작하지 마세요. 주어를 생략하거나 부사/상황으로 시작하세요.
10. 대사 뒤에 "~라고 말했다"를 반복하지 마세요. 행동 비트로 화자를 보여주세요:
    - ❌ "가자." 그가 말했다. → ✅ "가자." 그가 검집을 채웠다.
${sceneIndex === blueprint.scenes.length - 1 ? "11. 마지막 씬이므로 다음 화가 궁금해지는 문장으로 끝내세요. 반전이나 새로운 위기를 던지세요." : ""}
${threadReminderSection}
출력: 씬 본문만 (메타 정보 없이)`);

  return parts.join("\n");
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
        { memoryContext, toneGuidance, progressContext, threadReminders, correctionContext, previousChapterEnding: i === 0 ? previousChapterEnding : undefined },
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
        previousChapterEnding: i === 0 ? previousChapterEnding : undefined,
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
