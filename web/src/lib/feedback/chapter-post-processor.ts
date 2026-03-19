// ---------------------------------------------------------------------------
// Chapter Post-Processor
//
// Runs AFTER each chapter is written and BEFORE the next chapter begins.
// Collects feedback from all subsystems, feeds into FeedbackAccumulator,
// and produces correction context for the next chapter's prompt.
// ---------------------------------------------------------------------------

import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { ConsistencyResult } from "@/lib/evaluators/consistency";
import type { PacingResult } from "@/lib/evaluators/pacing";

// TODO: integrate with ThreadTracker when available
// import type { ThreadTracker } from "@/lib/tracking/thread-tracker";

// TODO: integrate with ToneManager when available
// import type { ToneManager } from "@/lib/tracking/tone-manager";

// TODO: integrate with ProgressMonitor when available
// import type { ProgressMonitor } from "@/lib/tracking/progress-monitor";

import type { CharacterTracker } from "@/lib/tracking/character-tracker";
import type { ChapterMemory } from "@/lib/memory/hierarchical-memory";

import {
  FeedbackAccumulator,
  type CorrectionPlan,
  type Feedback,
  type FeedbackLevel,
} from "./feedback-accumulator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostProcessResult {
  feedbacks: Feedback[];
  correctionPlan: CorrectionPlan;
  /** Context string to inject into the next chapter's prompt. */
  nextChapterContext: string;
}

export interface PostProcessParams {
  chapterNumber: number;
  chapterText: string;
  seed: NovelSeed;
  previousChapters?: Array<{
    chapter: number;
    text: string;
    summary: string;
  }>;
  model?: string;

  // Optional integrations — pass in if available, otherwise stubs are used
  accumulator?: FeedbackAccumulator;
  characterTracker?: CharacterTracker;
  consistencyResult?: ConsistencyResult;
  pacingResult?: PacingResult;

  // TODO: integrate with ThreadTracker
  // threadTracker?: ThreadTracker;

  // TODO: integrate with ToneManager
  // toneManager?: ToneManager;

  // TODO: integrate with ProgressMonitor
  // progressMonitor?: ProgressMonitor;
}

// ---------------------------------------------------------------------------
// Main post-processing function
// ---------------------------------------------------------------------------

export async function postProcessChapter(
  params: PostProcessParams,
): Promise<PostProcessResult> {
  const {
    chapterNumber,
    chapterText,
    seed,
    previousChapters,
    accumulator: externalAccumulator,
    characterTracker,
    consistencyResult,
    pacingResult,
  } = params;

  const accumulator = externalAccumulator ?? new FeedbackAccumulator();

  // 1. Generate chapter summary stub
  // TODO: integrate with LLM-based summary generator
  const chapterSummary = generateChapterSummaryStub(
    chapterNumber,
    chapterText,
  );

  // 2. Check consistency
  const consistencyFeedbacks = checkConsistency(
    chapterNumber,
    chapterText,
    seed,
    previousChapters,
    consistencyResult,
  );
  for (const fb of consistencyFeedbacks) {
    accumulator.addFeedback(fb);
  }

  // 3. Check forgotten threads
  // TODO: integrate with ThreadTracker
  const threadFeedbacks = checkForgottenThreads(chapterNumber, seed);
  for (const fb of threadFeedbacks) {
    accumulator.addFeedback(fb);
  }

  // 4. Check tone compliance
  // TODO: integrate with ToneManager
  const toneFeedbacks = checkToneCompliance(chapterNumber, chapterText, seed);
  for (const fb of toneFeedbacks) {
    accumulator.addFeedback(fb);
  }

  // 5. Check pacing
  const pacingFeedbacks = checkPacing(
    chapterNumber,
    chapterText,
    seed,
    pacingResult,
  );
  for (const fb of pacingFeedbacks) {
    accumulator.addFeedback(fb);
  }

  // 6. Check character drift
  const charFeedbacks = checkCharacterDrift(
    chapterNumber,
    seed,
    characterTracker,
  );
  for (const fb of charFeedbacks) {
    accumulator.addFeedback(fb);
  }

  // 7. Generate correction plan
  const correctionPlan = accumulator.generateCorrectionPlan(
    chapterNumber,
    seed,
  );

  // 8. Build next chapter context injection
  const nextChapterContext = buildNextChapterContext(
    chapterNumber,
    correctionPlan,
    accumulator,
    chapterSummary,
  );

  // Collect all feedbacks that were added in this round
  const allNewFeedbacks = [
    ...consistencyFeedbacks,
    ...threadFeedbacks,
    ...toneFeedbacks,
    ...pacingFeedbacks,
    ...charFeedbacks,
  ];

  // Convert Omit<Feedback, "id"> to Feedback-like entries (actual ids assigned by accumulator)
  const feedbacksWithIds = accumulator
    .getFeedbacksForChapter(chapterNumber)
    .filter((fb) => !fb.resolved);

  return {
    feedbacks: feedbacksWithIds,
    correctionPlan,
    nextChapterContext,
  };
}

// ---------------------------------------------------------------------------
// Sub-checks
// ---------------------------------------------------------------------------

/**
 * Stub: generate a chapter summary for the memory system.
 * TODO: replace with LLM-based summarizer call
 */
function generateChapterSummaryStub(
  chapterNumber: number,
  chapterText: string,
): ChapterMemory {
  // Extract first ~100 chars as a rough summary placeholder
  const rough = chapterText.replace(/\n+/g, " ").trim().slice(0, 200);
  return {
    chapter: chapterNumber,
    title: `${chapterNumber}화`,
    summary: rough + "…",
    key_events: [],
    character_changes: [],
    active_threads: [],
    foreshadowing_actions: [],
  };
}

/**
 * Check consistency against previous chapters using the evaluator result
 * or by performing basic checks.
 */
function checkConsistency(
  chapterNumber: number,
  _chapterText: string,
  _seed: NovelSeed,
  previousChapters?: Array<{
    chapter: number;
    text: string;
    summary: string;
  }>,
  consistencyResult?: ConsistencyResult,
): Array<Omit<Feedback, "id">> {
  const feedbacks: Array<Omit<Feedback, "id">> = [];

  if (consistencyResult) {
    // Character voice issues
    if (!consistencyResult.character_voice.pass) {
      for (const issue of consistencyResult.character_voice.issues) {
        feedbacks.push({
          chapter: chapterNumber,
          category: "consistency",
          severity: severityFromScore(consistencyResult.character_voice.score),
          message: `[${issue.character}] 말투 불일치: "${issue.dialogue.slice(0, 30)}…"`,
          suggestion: `${issue.character}의 말투 패턴(${issue.expected_patterns.join(", ")})을 사용해주세요`,
        });
      }
    }

    // Foreshadowing misses
    if (!consistencyResult.foreshadowing.pass) {
      for (const missing of consistencyResult.foreshadowing.missing) {
        feedbacks.push({
          chapter: chapterNumber,
          category: "foreshadowing_debt",
          severity: "adjust",
          message: `${missing.id}: "${missing.name}" ${missing.action} 누락`,
          suggestion: `복선 "${missing.name}"을(를) ${missing.action === "plant" ? "심어" : missing.action === "hint" ? "암시하여" : "공개하여"} 주세요`,
        });
      }
    }

    // Continuity issues
    if (!consistencyResult.continuity.pass) {
      for (const issue of consistencyResult.continuity.issues) {
        feedbacks.push({
          chapter: chapterNumber,
          category: "consistency",
          severity: "adjust",
          message: `연속성 문제 (${issue.type}): ${issue.expected}`,
          suggestion: `이전 화의 클리프행어/맥락을 이어받아 주세요: "${issue.expected}"`,
          source_chapter: chapterNumber - 1,
        });
      }
    }
  }

  // Basic: if we have previous chapters, check for obvious naming inconsistencies
  if (previousChapters && previousChapters.length > 0) {
    // TODO: deeper cross-chapter consistency checks (name spelling, location, etc.)
    // For now, this is a stub placeholder
  }

  return feedbacks;
}

/**
 * Check for narrative threads that have been forgotten.
 * TODO: integrate with ThreadTracker when available
 */
function checkForgottenThreads(
  chapterNumber: number,
  seed: NovelSeed,
): Array<Omit<Feedback, "id">> {
  const feedbacks: Array<Omit<Feedback, "id">> = [];

  // Check foreshadowing that was supposed to be revealed but hasn't been
  for (const fs of seed.foreshadowing) {
    if (
      fs.status === "planted" &&
      fs.reveal_at !== null &&
      fs.reveal_at < chapterNumber
    ) {
      // Past the reveal deadline
      const overdue = chapterNumber - fs.reveal_at;
      const severity: FeedbackLevel =
        overdue >= 5 ? "rewrite" : overdue >= 2 ? "adjust" : "warn";

      feedbacks.push({
        chapter: chapterNumber,
        category: "foreshadowing_debt",
        severity,
        message: `[${fs.id}] 복선 "${fs.name}" 공개 마감(${fs.reveal_at}화) ${overdue}화 초과`,
        suggestion: `복선 "${fs.name}"을(를) 가능한 빨리 공개하거나 힌트를 추가하세요`,
      });
    }
  }

  // TODO: integrate with ThreadTracker for narrative thread deadline checks
  // threadTracker.getOverdueThreads(chapterNumber).forEach(thread => { ... })

  return feedbacks;
}

/**
 * Check tone compliance against arc expectations.
 * TODO: integrate with ToneManager when available
 */
function checkToneCompliance(
  chapterNumber: number,
  chapterText: string,
  seed: NovelSeed,
): Array<Omit<Feedback, "id">> {
  const feedbacks: Array<Omit<Feedback, "id">> = [];

  // Basic check: if we have arc tension curves, compare
  const arc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNumber && chapterNumber <= a.end_chapter,
  );
  if (!arc || !arc.tension_curve) return feedbacks;

  const arcOffset = chapterNumber - arc.start_chapter;
  const expectedTension = arc.tension_curve[arcOffset];
  if (expectedTension === undefined) return feedbacks;

  // Simple heuristic: high-tension chapters should have action keywords
  const ACTION_KEYWORDS = [
    "달려", "뛰어", "검을", "마법", "공격", "방어", "폭발",
    "피", "쓰러", "죽", "싸움", "전투", "충격",
  ];

  const CALM_KEYWORDS = [
    "평화", "웃음", "미소", "따뜻", "포근", "고요",
    "산책", "식사", "대화", "일상",
  ];

  const actionCount = ACTION_KEYWORDS.filter((kw) =>
    chapterText.includes(kw),
  ).length;
  const calmCount = CALM_KEYWORDS.filter((kw) =>
    chapterText.includes(kw),
  ).length;

  // Rough estimation: action-heavy = high tension
  const estimatedTension =
    actionCount > calmCount
      ? Math.min(10, 5 + actionCount)
      : Math.max(1, 5 - calmCount);

  const tensionGap = Math.abs(expectedTension - estimatedTension);

  if (tensionGap >= 4) {
    feedbacks.push({
      chapter: chapterNumber,
      category: "tone_mismatch",
      severity: tensionGap >= 6 ? "adjust" : "warn",
      message: `긴장도 불일치: 예상 ${expectedTension}/10, 추정 ${estimatedTension}/10 (차이 ${tensionGap})`,
      suggestion:
        expectedTension > estimatedTension
          ? `이 회차는 긴장감이 ${expectedTension}/10이어야 합니다. 갈등/액션 요소를 강화하세요`
          : `이 회차는 긴장감이 ${expectedTension}/10이어야 합니다. 과도한 액션을 줄이고 호흡을 가다듬으세요`,
    });
  }

  // TODO: integrate with ToneManager for more sophisticated tone analysis
  // toneManager.evaluate(chapterText, arc).forEach(issue => { ... })

  return feedbacks;
}

/**
 * Check pacing against plan using evaluator results.
 */
function checkPacing(
  chapterNumber: number,
  _chapterText: string,
  seed: NovelSeed,
  pacingResult?: PacingResult,
): Array<Omit<Feedback, "id">> {
  const feedbacks: Array<Omit<Feedback, "id">> = [];

  if (!pacingResult) {
    // TODO: integrate with ProgressMonitor for plan vs reality comparison
    return feedbacks;
  }

  // Length issues
  if (!pacingResult.length.pass) {
    feedbacks.push({
      chapter: chapterNumber,
      category: "pacing_drift",
      severity: pacingResult.length.score < 0.5 ? "adjust" : "warn",
      message: `분량 부족: ${pacingResult.length.char_count}자 (목표 ${pacingResult.length.target_min}~${pacingResult.length.target_max}자)`,
      suggestion: `다음 화는 ${pacingResult.length.target_min}자 이상으로 작성하세요`,
    });
  }

  // Scene density issues
  if (!pacingResult.scene_density.pass) {
    feedbacks.push({
      chapter: chapterNumber,
      category: "pacing_drift",
      severity: "warn",
      message: `장면당 분량 부족: ${pacingResult.scene_density.chars_per_scene}자/장면 (${pacingResult.scene_density.scene_count}개 장면)`,
      suggestion: "장면 수를 줄이고 각 장면을 더 깊이 있게 묘사하세요",
    });
  }

  // Dialogue pacing issues
  if (!pacingResult.dialogue_pacing.pass) {
    feedbacks.push({
      chapter: chapterNumber,
      category: "pacing_drift",
      severity: "warn",
      message: `대사 연속 ${pacingResult.dialogue_pacing.max_consecutive_dialogue_lines}줄 (지문 없이)`,
      suggestion:
        "대사 사이에 행동 묘사나 내면 서술을 삽입하세요 (최대 5줄 연속 대사 권장)",
    });
  }

  // Overall pacing score too low
  if (pacingResult.overall_score < 0.5) {
    feedbacks.push({
      chapter: chapterNumber,
      category: "pacing_drift",
      severity: "adjust",
      message: `전체 페이싱 점수 낮음: ${(pacingResult.overall_score * 100).toFixed(0)}%`,
      suggestion: "분량, 장면 밀도, 묘사 비율, 대사 배분을 전반적으로 개선하세요",
    });
  }

  // TODO: integrate with ProgressMonitor for tension curve comparison
  // progressMonitor.comparePlan(chapterNumber, seed).forEach(issue => { ... })

  return feedbacks;
}

/**
 * Check character drift using CharacterTracker if available.
 */
function checkCharacterDrift(
  chapterNumber: number,
  seed: NovelSeed,
  characterTracker?: CharacterTracker,
): Array<Omit<Feedback, "id">> {
  const feedbacks: Array<Omit<Feedback, "id">> = [];

  if (!characterTracker) {
    // TODO: without tracker, we can't detect drift
    return feedbacks;
  }

  for (const char of seed.characters) {
    // Only check characters that should have appeared by now
    if (char.introduction_chapter > chapterNumber) continue;

    const drift = characterTracker.detectDrift(char.id);
    if (!drift.hasDrift) continue;

    // Check if this drift is justified by the character's arc
    // TODO: integrate with arc planner for justified drift detection
    const hasArcJustification = false; // stub

    if (!hasArcJustification && drift.severity === "major") {
      feedbacks.push({
        chapter: chapterNumber,
        category: "character_drift",
        severity: "adjust",
        message: `[${char.id}] ${char.name} 캐릭터 이탈 감지:\n${drift.details}`,
        suggestion: `${char.name}의 원래 성격/말투로 되돌리거나, 변화의 이유를 서사적으로 설명하세요`,
      });
    } else if (!hasArcJustification && drift.severity === "minor") {
      feedbacks.push({
        chapter: chapterNumber,
        category: "character_drift",
        severity: "warn",
        message: `[${char.id}] ${char.name} 미세 변화 감지:\n${drift.details}`,
        suggestion: `${char.name}의 말투와 성격 일관성을 유지하세요`,
      });
    }
  }

  return feedbacks;
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Build the context string to inject into the next chapter's prompt.
 */
function buildNextChapterContext(
  currentChapter: number,
  plan: CorrectionPlan,
  accumulator: FeedbackAccumulator,
  chapterSummary: ChapterMemory,
): string {
  const sections: string[] = [];

  // Always include previous chapter reference
  sections.push(
    `## 이전 화 요약 (${currentChapter}화)\n${chapterSummary.summary}`,
  );

  // If no corrections needed, return minimal context
  if (plan.actions.length === 0) {
    return sections.join("\n\n");
  }

  // Inject prompt-level corrections
  const promptInjections = plan.actions.filter(
    (a) => a.type === "prompt_injection",
  );
  if (promptInjections.length > 0) {
    sections.push(
      "## 보정 지시사항",
      ...promptInjections.map(
        (a) => (a as { type: "prompt_injection"; content: string }).content,
      ),
    );
  }

  // Thread reminders
  const threadReminders = plan.actions.filter(
    (a) => a.type === "thread_reminder",
  );
  if (threadReminders.length > 0) {
    const allThreads = threadReminders.flatMap(
      (a) => (a as { type: "thread_reminder"; threadIds: string[] }).threadIds,
    );
    const unique = [...new Set(allThreads)];
    sections.push(
      `## 잊지 말아야 할 서사 스레드\n${unique.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  // Tone corrections
  const toneCorrections = plan.actions.filter(
    (a) => a.type === "tone_correction",
  );
  if (toneCorrections.length > 0) {
    sections.push(
      `## 톤 조정\n${toneCorrections.map((a) => (a as { type: "tone_correction"; guidance: string }).guidance).join("\n")}`,
    );
  }

  // Character updates
  const charUpdates = plan.actions.filter(
    (a) => a.type === "character_update",
  );
  if (charUpdates.length > 0) {
    sections.push(
      `## 캐릭터 주의사항\n${charUpdates.map((a) => {
        const ca = a as {
          type: "character_update";
          characterId: string;
          update: string;
        };
        return `- ${ca.characterId}: ${ca.update}`;
      }).join("\n")}`,
    );
  }

  // Severity-level warning header
  const overallLevel = accumulator.getOverallLevel();
  if (overallLevel === "adjust" || overallLevel === "rewrite") {
    sections.unshift(
      `⚠️ 피드백 누적 수준: ${overallLevel === "rewrite" ? "심각" : "주의"} — 아래 보정 사항을 반드시 반영하세요`,
    );
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Convert a 0-1 score to a feedback severity level. */
function severityFromScore(score: number): FeedbackLevel {
  if (score < 0.4) return "rewrite";
  if (score < 0.7) return "adjust";
  return "warn";
}
