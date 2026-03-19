// ---------------------------------------------------------------------------
// FeedbackAccumulator — bottom-up feedback collection & correction planner
// ---------------------------------------------------------------------------

import { getArcForChapter } from "@/lib/schema/novel";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackLevel = "warn" | "adjust" | "rewrite";

export type FeedbackCategory =
  | "consistency" // contradictions between chapters
  | "foreshadowing_debt" // missed foreshadowing deadlines
  | "pacing_drift" // tension plan vs reality mismatch
  | "character_drift" // character voice/behavior change without arc
  | "thread_forgotten" // narrative threads past deadline
  | "tone_mismatch"; // arc tone violation

const ALL_CATEGORIES: FeedbackCategory[] = [
  "consistency",
  "foreshadowing_debt",
  "pacing_drift",
  "character_drift",
  "thread_forgotten",
  "tone_mismatch",
];

export interface Feedback {
  id: string;
  chapter: number;
  category: FeedbackCategory;
  severity: FeedbackLevel;
  message: string;
  suggestion: string;
  /** Chapter that caused the issue */
  source_chapter?: number;
  /** Chapters impacted by this issue */
  affected_chapters?: number[];
  /** Whether this feedback has been resolved by a correction */
  resolved?: boolean;
}

export interface AccumulatorState {
  scores: Record<FeedbackCategory, number>;
  feedbacks: Feedback[];
  warnThreshold: number;
  adjustThreshold: number;
  rewriteThreshold: number;
}

export interface CorrectionPlan {
  level: FeedbackLevel;
  actions: CorrectionAction[];
}

export type CorrectionAction =
  | { type: "prompt_injection"; content: string }
  | { type: "blueprint_revision"; arcId: string; guidance: string }
  | { type: "rewrite_chapter"; chapter: number; reason: string }
  | { type: "character_update"; characterId: string; update: string }
  | { type: "thread_reminder"; threadIds: string[] }
  | { type: "tone_correction"; guidance: string };

// Severity weights used when incrementing scores
const SEVERITY_WEIGHT: Record<FeedbackLevel, number> = {
  warn: 1,
  adjust: 2,
  rewrite: 3,
};

// ---------------------------------------------------------------------------
// FeedbackAccumulator
// ---------------------------------------------------------------------------

export class FeedbackAccumulator {
  private state: AccumulatorState;

  constructor(
    thresholds?: Partial<
      Pick<
        AccumulatorState,
        "warnThreshold" | "adjustThreshold" | "rewriteThreshold"
      >
    >,
  ) {
    const scores = {} as Record<FeedbackCategory, number>;
    for (const cat of ALL_CATEGORIES) {
      scores[cat] = 0;
    }
    this.state = {
      scores,
      feedbacks: [],
      warnThreshold: thresholds?.warnThreshold ?? 2,
      adjustThreshold: thresholds?.adjustThreshold ?? 5,
      rewriteThreshold: thresholds?.rewriteThreshold ?? 8,
    };
  }

  // -----------------------------------------------------------------------
  // Mutation
  // -----------------------------------------------------------------------

  /** Add feedback from any subsystem. */
  addFeedback(feedback: Omit<Feedback, "id">): void {
    const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry: Feedback = { ...feedback, id, resolved: false };
    this.state.feedbacks.push(entry);

    // Increment category score by severity weight
    this.state.scores[feedback.category] +=
      SEVERITY_WEIGHT[feedback.severity];
  }

  /** Reset a single category score (after correction applied). */
  resetCategory(category: FeedbackCategory): void {
    this.state.scores[category] = 0;
    // Mark all feedbacks in this category as resolved
    for (const fb of this.state.feedbacks) {
      if (fb.category === category && !fb.resolved) {
        fb.resolved = true;
      }
    }
  }

  /** Mark corrections as applied and reset relevant counters. */
  applyCorrections(plan: CorrectionPlan): void {
    // For each action, determine which category it addresses and reset
    for (const action of plan.actions) {
      switch (action.type) {
        case "prompt_injection":
          // Generic — don't reset any specific category
          break;
        case "blueprint_revision":
          this.resetCategory("pacing_drift");
          break;
        case "rewrite_chapter":
          this.resetCategory("consistency");
          break;
        case "character_update":
          this.resetCategory("character_drift");
          break;
        case "thread_reminder":
          this.resetCategory("thread_forgotten");
          break;
        case "tone_correction":
          this.resetCategory("tone_mismatch");
          break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /** Get current severity level for a single category. */
  getCategoryLevel(category: FeedbackCategory): FeedbackLevel {
    const score = this.state.scores[category];
    return this.scoreToLevel(score);
  }

  /** Get the maximum severity level across all categories. */
  getOverallLevel(): FeedbackLevel {
    let maxScore = 0;
    for (const cat of ALL_CATEGORIES) {
      if (this.state.scores[cat] > maxScore) {
        maxScore = this.state.scores[cat];
      }
    }
    return this.scoreToLevel(maxScore);
  }

  /** Get all unresolved feedbacks. */
  getActiveFeedbacks(): Feedback[] {
    return this.state.feedbacks.filter((fb) => !fb.resolved);
  }

  /** Get feedbacks for a specific chapter. */
  getFeedbacksForChapter(chapter: number): Feedback[] {
    return this.state.feedbacks.filter((fb) => fb.chapter === chapter);
  }

  // -----------------------------------------------------------------------
  // Correction Plan Generation
  // -----------------------------------------------------------------------

  /**
   * Generate a correction plan based on accumulated feedback.
   *
   * Logic:
   *   1. Collect unresolved feedbacks
   *   2. Determine per-category and overall level
   *   3. Generate actions proportional to severity
   *   4. Enforce conservative rewrite rules (max 1 chapter, distance check)
   */
  generateCorrectionPlan(
    currentChapter: number,
    seed?: NovelSeed,
  ): CorrectionPlan {
    const active = this.getActiveFeedbacks();
    if (active.length === 0) {
      return { level: "warn", actions: [] };
    }

    const overallLevel = this.getOverallLevel();
    const actions: CorrectionAction[] = [];

    // Group active feedbacks by category
    const byCategory = new Map<FeedbackCategory, Feedback[]>();
    for (const fb of active) {
      const list = byCategory.get(fb.category) ?? [];
      list.push(fb);
      byCategory.set(fb.category, list);
    }

    // --- Consistency issues ---
    const consistencyFbs = byCategory.get("consistency") ?? [];
    if (consistencyFbs.length > 0) {
      const level = this.getCategoryLevel("consistency");
      if (level === "rewrite") {
        // Find the most recent problematic chapter
        const source = this.findRewriteTarget(consistencyFbs, currentChapter);
        if (source !== null) {
          actions.push({
            type: "rewrite_chapter",
            chapter: source.chapter,
            reason: source.reason,
          });
        } else {
          // Downgraded — use prompt injection fix-forward
          actions.push({
            type: "prompt_injection",
            content: this.buildConsistencyInjection(consistencyFbs),
          });
        }
      } else {
        actions.push({
          type: "prompt_injection",
          content: this.buildConsistencyInjection(consistencyFbs),
        });
      }
    }

    // --- Foreshadowing debt ---
    const fsFbs = byCategory.get("foreshadowing_debt") ?? [];
    if (fsFbs.length > 0) {
      const threadIds = fsFbs
        .map((fb) => fb.message)
        .filter((m) => m.startsWith("fs_") || m.includes("_"));
      if (threadIds.length > 0) {
        actions.push({ type: "thread_reminder", threadIds });
      }
      actions.push({
        type: "prompt_injection",
        content: `[복선 미회수 경고] 다음 복선을 이번 화에서 반드시 다루세요:\n${fsFbs.map((fb) => `- ${fb.suggestion}`).join("\n")}`,
      });
    }

    // --- Character drift ---
    const charFbs = byCategory.get("character_drift") ?? [];
    if (charFbs.length > 0) {
      const level = this.getCategoryLevel("character_drift");
      for (const fb of charFbs) {
        if (level === "adjust" || level === "rewrite") {
          // Extract character ID from message if possible
          const charMatch = fb.message.match(/\[([^\]]+)\]/);
          const characterId = charMatch ? charMatch[1] : "unknown";
          actions.push({
            type: "character_update",
            characterId,
            update: fb.suggestion,
          });
        }
      }
      actions.push({
        type: "prompt_injection",
        content: `[캐릭터 일관성 주의]\n${charFbs.map((fb) => `- ${fb.message}`).join("\n")}`,
      });
    }

    // --- Pacing drift ---
    const pacingFbs = byCategory.get("pacing_drift") ?? [];
    if (pacingFbs.length > 0) {
      const level = this.getCategoryLevel("pacing_drift");
      if (level === "adjust" || level === "rewrite") {
        const arc = seed ? getArcForChapter(seed, currentChapter) : null;
        const arcId = arc?.id ?? `arc_ch${currentChapter}`;
        actions.push({
          type: "blueprint_revision",
          arcId,
          guidance: pacingFbs.map((fb) => fb.suggestion).join("; "),
        });
      } else {
        actions.push({
          type: "prompt_injection",
          content: `[페이싱 조정]\n${pacingFbs.map((fb) => `- ${fb.suggestion}`).join("\n")}`,
        });
      }
    }

    // --- Thread forgotten ---
    const threadFbs = byCategory.get("thread_forgotten") ?? [];
    if (threadFbs.length > 0) {
      const threadIds = threadFbs.map((fb) => {
        const m = fb.message.match(/\[([^\]]+)\]/);
        return m ? m[1] : fb.message;
      });
      actions.push({ type: "thread_reminder", threadIds });
    }

    // --- Tone mismatch ---
    const toneFbs = byCategory.get("tone_mismatch") ?? [];
    if (toneFbs.length > 0) {
      actions.push({
        type: "tone_correction",
        guidance: toneFbs.map((fb) => fb.suggestion).join("\n"),
      });
    }

    return { level: overallLevel, actions };
  }

  // -----------------------------------------------------------------------
  // Format
  // -----------------------------------------------------------------------

  /** Format correction plan as human-readable Korean text. */
  formatCorrectionPlan(plan: CorrectionPlan): string {
    if (plan.actions.length === 0) {
      return "✔ 문제 없음 — 보정 불필요";
    }

    const levelLabel: Record<FeedbackLevel, string> = {
      warn: "경고",
      adjust: "조정",
      rewrite: "재작성",
    };

    const lines: string[] = [
      `[피드백 보정 계획] 수준: ${levelLabel[plan.level]}`,
      `총 ${plan.actions.length}개 보정 작업:`,
      "",
    ];

    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i];
      const prefix = `${i + 1}.`;

      switch (action.type) {
        case "prompt_injection":
          lines.push(`${prefix} [프롬프트 주입] ${action.content}`);
          break;
        case "blueprint_revision":
          lines.push(
            `${prefix} [블루프린트 재생성] 아크 ${action.arcId}: ${action.guidance}`,
          );
          break;
        case "rewrite_chapter":
          lines.push(
            `${prefix} [회차 재작성] ${action.chapter}화: ${action.reason}`,
          );
          break;
        case "character_update":
          lines.push(
            `${prefix} [캐릭터 상태 갱신] ${action.characterId}: ${action.update}`,
          );
          break;
        case "thread_reminder":
          lines.push(
            `${prefix} [서사 스레드 리마인더] ${action.threadIds.join(", ")}`,
          );
          break;
        case "tone_correction":
          lines.push(`${prefix} [톤 보정] ${action.guidance}`);
          break;
      }
    }

    return lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  toJSON(): object {
    return {
      __type: "FeedbackAccumulator",
      state: {
        scores: { ...this.state.scores },
        feedbacks: this.state.feedbacks.map((fb) => ({ ...fb })),
        warnThreshold: this.state.warnThreshold,
        adjustThreshold: this.state.adjustThreshold,
        rewriteThreshold: this.state.rewriteThreshold,
      },
    };
  }

  static fromJSON(data: object): FeedbackAccumulator {
    const parsed = data as {
      state: AccumulatorState;
    };
    const acc = new FeedbackAccumulator({
      warnThreshold: parsed.state.warnThreshold,
      adjustThreshold: parsed.state.adjustThreshold,
      rewriteThreshold: parsed.state.rewriteThreshold,
    });
    // Restore scores directly
    for (const cat of ALL_CATEGORIES) {
      acc.state.scores[cat] = parsed.state.scores[cat] ?? 0;
    }
    acc.state.feedbacks = parsed.state.feedbacks ?? [];
    return acc;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private scoreToLevel(score: number): FeedbackLevel {
    if (score > this.state.rewriteThreshold) return "rewrite";
    if (score > this.state.adjustThreshold) return "adjust";
    // score <= adjustThreshold (includes <= warnThreshold)
    return score > this.state.warnThreshold ? "adjust" : "warn";
  }

  /**
   * Find the best chapter to rewrite. Returns null if the source is too far
   * back (>3 chapters), in which case we downgrade to fix-forward.
   */
  private findRewriteTarget(
    feedbacks: Feedback[],
    currentChapter: number,
  ): { chapter: number; reason: string } | null {
    // Sort by severity (highest first), then by chapter (most recent first)
    const sorted = [...feedbacks].sort((a, b) => {
      const sw = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
      if (sw !== 0) return sw;
      return b.chapter - a.chapter;
    });

    for (const fb of sorted) {
      const targetChapter = fb.source_chapter ?? fb.chapter;
      const distance = currentChapter - targetChapter;

      // NEVER rewrite if the problematic chapter is >3 chapters ago
      // Use fix-forward ("사실은..." technique) instead
      if (distance > 3) {
        continue;
      }

      return {
        chapter: targetChapter,
        reason: fb.message,
      };
    }

    // All candidates are too far back — downgrade to fix-forward
    return null;
  }

  /** Build a consistency-fix prompt injection from feedbacks. */
  private buildConsistencyInjection(feedbacks: Feedback[]): string {
    const lines = feedbacks.map((fb) => `- ${fb.suggestion}`);
    return `[일관성 보정 지시]\n다음 사항을 반영하여 자연스럽게 이야기를 이어가세요:\n${lines.join("\n")}`;
  }
}
