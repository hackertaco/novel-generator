/**
 * Scene-by-scene writer.
 *
 * Instead of generating an entire chapter at once, generates each scene
 * independently with accumulated context. Between scenes, code validation
 * checks quality and triggers repair if needed.
 */

import { getAgent } from "./llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterBlueprint, SceneSpec } from "@/lib/schema/planning";
import type { TokenUsage } from "@/lib/agents/types";
import { validateScene, buildSceneRepairPrompt } from "./scene-validator";
import { planBeats, writeSceneByBeats } from "./beat-writer";

export interface SceneWriterOptions {
  seed: NovelSeed;
  chapterNumber: number;
  blueprint: ChapterBlueprint;
  systemPrompt: string;
  model?: string;
  /** Previously written scenes in this chapter (for continuity) */
  previousSceneTexts?: string[];
  /** Summaries of previous chapters */
  previousSummaries?: Array<{ chapter: number; summary: string }>;
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
function buildScenePrompt(
  seed: NovelSeed,
  chapterNumber: number,
  blueprint: ChapterBlueprint,
  scene: SceneSpec,
  sceneIndex: number,
  previousSceneTexts: string[],
  previousSummaries: Array<{ chapter: number; summary: string }>,
): string {
  const parts: string[] = [];

  // Novel context (minimal)
  parts.push(`# 소설
제목: ${seed.title} | 장르: ${seed.world.genre}
${chapterNumber}화 — ${blueprint.one_liner}
`);

  // Characters in this scene
  const sceneChars = scene.characters
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean);

  if (sceneChars.length > 0) {
    parts.push("# 이 씬의 캐릭터");
    for (const char of sceneChars) {
      if (!char) continue;
      parts.push(`**${char.name}** (${char.role}): ${char.voice.personality_core}
말투: ${char.voice.tone}
대사 예시: "${char.voice.sample_dialogues[0] || ""}"
`);
    }
  }

  // Previous chapter summaries (last 2, brief)
  if (previousSummaries.length > 0) {
    const recent = previousSummaries.slice(-2);
    parts.push("# 이전 내용");
    for (const s of recent) {
      parts.push(`- ${s.chapter}화: ${s.summary.slice(0, 80)}`);
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

  // Scene instruction
  const sceneLabel = `씬 ${sceneIndex + 1}/${blueprint.scenes.length}`;
  parts.push(`# ${sceneLabel} 지시

**목적**: ${scene.purpose}
**유형**: ${scene.type}
**감정톤**: ${scene.emotional_tone}
**목표 분량**: ${scene.estimated_chars}자

## 작성 규칙
1. 이 씬의 목적에만 집중하세요. 다른 사건을 끌어오지 마세요.
2. 대사를 충분히 넣으세요. 캐릭터 목소리가 들려야 합니다.
3. 감정을 설명하지 말고 행동/감각으로 보여주세요:
   - ❌ "불안했다" → ✅ "찻잔을 드는 손끝이 떨렸다"
   - ❌ "결심을 굳혔다" → ✅ "칼집에서 단검을 뽑았다"
4. 문장 어미를 다양하게 쓰세요 (~였다 반복 금지)
5. 짧은 문단 (3문장 이하)
${sceneIndex === blueprint.scenes.length - 1 ? "6. 마지막 씬이므로 다음 화가 궁금해지는 문장으로 끝내세요." : ""}

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

    // 1. Generate scene using beat-by-beat structured writing
    const beats = planBeats(scene, seed);
    const previousText = sceneTexts.length > 0 ? sceneTexts[sceneTexts.length - 1] : "";
    const beatResult = await writeSceneByBeats({
      beats,
      scene,
      seed,
      chapterNumber,
      previousText,
      systemPrompt,
      model,
    });
    totalUsage = addUsage(totalUsage, beatResult.usage);

    let sceneText = beatResult.text;

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

    sceneTexts.push(sceneText);
  }

  // Assemble all scenes with natural paragraph breaks
  const fullText = sceneTexts.join("\n\n");

  return { fullText, sceneTexts, usage: totalUsage, remainingIssues };
}
