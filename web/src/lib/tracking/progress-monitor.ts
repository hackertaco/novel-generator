/**
 * Progress monitor for arc-level pacing and event tracking.
 *
 * Tracks which planned events have been completed, detects pacing issues,
 * and provides guidance for upcoming chapters.
 */

import type { NovelSeed } from "../schema/novel";
import { getArcForChapter } from "../schema/novel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArcProgress {
  arcId: string;
  totalChapters: number;
  writtenChapters: number;
  plannedEvents: string[];
  completedEvents: string[];
  pacingStatus: "too_slow" | "on_track" | "too_fast";
  eventsPerChapter: number;
  remainingEvents: number;
  remainingChapters: number;
}

export interface ProgressFeedback {
  type: "pacing_warning" | "event_suggestion" | "subplot_needed";
  severity: "info" | "warn" | "critical";
  message: string;
  suggestion: string;
}

// ---------------------------------------------------------------------------
// ProgressMonitor
// ---------------------------------------------------------------------------

export class ProgressMonitor {
  private arcProgress: Map<string, ArcProgress>;

  constructor(seed: NovelSeed) {
    this.arcProgress = new Map();

    for (const arc of seed.arcs) {
      const totalChapters = arc.end_chapter - arc.start_chapter + 1;
      this.arcProgress.set(arc.id, {
        arcId: arc.id,
        totalChapters,
        writtenChapters: 0,
        plannedEvents: [...arc.key_events],
        completedEvents: [],
        pacingStatus: "on_track",
        eventsPerChapter: totalChapters > 0 ? arc.key_events.length / totalChapters : 0,
        remainingEvents: arc.key_events.length,
        remainingChapters: totalChapters,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Record a completed chapter
  // -----------------------------------------------------------------------

  recordChapter(
    chapterNumber: number,
    completedEvents: string[],
    seed: NovelSeed,
  ): void {
    const arc = getArcForChapter(seed, chapterNumber);
    if (!arc) return;

    const progress = this.arcProgress.get(arc.id);
    if (!progress) return;

    progress.writtenChapters++;

    // Match completed events against planned events
    for (const event of completedEvents) {
      if (!progress.completedEvents.includes(event)) {
        progress.completedEvents.push(event);
      }
    }

    // Recalculate derived fields
    progress.remainingEvents =
      progress.plannedEvents.length - progress.completedEvents.length;
    progress.remainingChapters =
      progress.totalChapters - progress.writtenChapters;
    progress.eventsPerChapter =
      progress.writtenChapters > 0
        ? progress.completedEvents.length / progress.writtenChapters
        : 0;

    // Update pacing status
    progress.pacingStatus = calculatePacingStatus(
      progress.remainingEvents,
      progress.remainingChapters,
    );
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  getArcProgress(arcId: string): ArcProgress | null {
    return this.arcProgress.get(arcId) ?? null;
  }

  // -----------------------------------------------------------------------
  // Pacing check with feedback
  // -----------------------------------------------------------------------

  checkPacing(currentChapter: number, seed: NovelSeed): ProgressFeedback[] {
    const feedback: ProgressFeedback[] = [];
    const arc = getArcForChapter(seed, currentChapter);
    if (!arc) return feedback;

    const progress = this.arcProgress.get(arc.id);
    if (!progress) return feedback;

    const { remainingEvents, remainingChapters, pacingStatus } = progress;

    // --- Pacing warnings ---
    if (pacingStatus === "too_fast") {
      const severity = remainingChapters <= 1 ? "critical" : "warn";
      feedback.push({
        type: "pacing_warning",
        severity,
        message: `이벤트 소화 속도가 너무 빠릅니다. 남은 ${remainingChapters}화에 ${remainingEvents}개의 이벤트가 남아 있습니다.`,
        suggestion:
          "이벤트 사이에 캐릭터 내면 묘사, 관계 발전, 또는 일상 장면을 추가하여 속도를 늦추세요.",
      });
    } else if (pacingStatus === "too_slow") {
      const severity = remainingChapters <= 2 ? "critical" : "warn";
      feedback.push({
        type: "pacing_warning",
        severity,
        message: `진행이 느립니다. 남은 ${remainingChapters}화에 ${remainingEvents}개의 이벤트를 소화해야 합니다.`,
        suggestion:
          "핵심 이벤트를 압축하거나, 한 화에 복수 이벤트를 배치하세요.",
      });
    }

    // --- Event suggestions ---
    const uncompletedEvents = progress.plannedEvents.filter(
      (e) => !progress.completedEvents.includes(e),
    );

    if (
      remainingChapters > 0 &&
      remainingChapters <= 2 &&
      uncompletedEvents.length > 2
    ) {
      feedback.push({
        type: "event_suggestion",
        severity: "critical",
        message: `아크 종료까지 ${remainingChapters}화 남았지만 미완료 이벤트가 ${uncompletedEvents.length}개입니다.`,
        suggestion: `우선 소화할 이벤트: ${uncompletedEvents.slice(0, 2).join(", ")}`,
      });
    }

    // --- Climax proximity check ---
    if (currentChapter === arc.climax_chapter && uncompletedEvents.length > 0) {
      const climaxEvents = uncompletedEvents.filter(
        (e) =>
          e.includes("클라이맥스") ||
          e.includes("결전") ||
          e.includes("대결") ||
          e.includes("전투") ||
          e.includes("진실"),
      );
      if (climaxEvents.length > 0) {
        feedback.push({
          type: "event_suggestion",
          severity: "warn",
          message: `클라이맥스 화입니다. 다음 이벤트를 반드시 포함하세요.`,
          suggestion: climaxEvents.join(", "),
        });
      }
    }

    // --- Subplot suggestion ---
    if (
      pacingStatus === "too_slow" &&
      remainingChapters >= 3 &&
      remainingEvents <= 1
    ) {
      feedback.push({
        type: "subplot_needed",
        severity: "warn",
        message: `남은 화수(${remainingChapters})에 비해 이벤트가 부족합니다.`,
        suggestion:
          "서브플롯(캐릭터 과거, 조력자 에피소드, 세계관 탐구 등)을 추가하여 빈 화를 채우세요.",
      });
    }

    return feedback;
  }

  // -----------------------------------------------------------------------
  // Next chapter guidance
  // -----------------------------------------------------------------------

  getNextChapterGuidance(
    chapterNumber: number,
    seed: NovelSeed,
  ): {
    suggestedEvents: string[];
    pacingAdvice: string;
    remainingBudget: string;
  } {
    const arc = getArcForChapter(seed, chapterNumber);
    if (!arc) {
      return {
        suggestedEvents: [],
        pacingAdvice: "해당 화에 대응하는 아크를 찾을 수 없습니다.",
        remainingBudget: "알 수 없음",
      };
    }

    const progress = this.arcProgress.get(arc.id);
    if (!progress) {
      return {
        suggestedEvents: [],
        pacingAdvice: "아크 진행 데이터가 없습니다.",
        remainingBudget: "알 수 없음",
      };
    }

    const uncompleted = progress.plannedEvents.filter(
      (e) => !progress.completedEvents.includes(e),
    );
    const { remainingChapters, remainingEvents } = progress;

    // How many events should this chapter cover?
    const targetEventsPerChap =
      remainingChapters > 0
        ? Math.ceil(remainingEvents / remainingChapters)
        : remainingEvents;
    const suggestedEvents = uncompleted.slice(0, Math.max(1, targetEventsPerChap));

    // Pacing advice
    let pacingAdvice: string;
    if (progress.pacingStatus === "too_fast") {
      pacingAdvice =
        "이벤트 진행을 늦추세요. 이번 화는 캐릭터 내면이나 관계 발전에 집중하는 것을 권장합니다.";
    } else if (progress.pacingStatus === "too_slow") {
      pacingAdvice = `진행이 느립니다. 이번 화에서 최소 ${suggestedEvents.length}개의 이벤트를 소화하세요.`;
    } else {
      pacingAdvice = "현재 페이싱이 적절합니다. 계획대로 진행하세요.";
    }

    // Climax handling
    if (chapterNumber === arc.climax_chapter) {
      pacingAdvice =
        "이번 화는 아크의 클라이맥스입니다! 가장 중요한 이벤트를 배치하고 긴장감을 최대로 끌어올리세요.";
    }

    const remainingBudget = `이 아크에 ${remainingChapters}화 남음, 이벤트 ${remainingEvents}개 남음`;

    return { suggestedEvents, pacingAdvice, remainingBudget };
  }

  // -----------------------------------------------------------------------
  // Format as prompt context (Korean)
  // -----------------------------------------------------------------------

  formatProgressContext(chapterNumber: number, seed: NovelSeed): string {
    const arc = getArcForChapter(seed, chapterNumber);
    if (!arc) return "";

    const progress = this.arcProgress.get(arc.id);
    if (!progress) return "";

    const guidance = this.getNextChapterGuidance(chapterNumber, seed);
    const feedbacks = this.checkPacing(chapterNumber, seed);

    const lines: string[] = [
      `## 진행 상황 (${chapterNumber}화 — ${arc.name})`,
      "",
      `- 아크 진행: ${progress.writtenChapters}/${progress.totalChapters}화 완료`,
      `- 이벤트 소화: ${progress.completedEvents.length}/${progress.plannedEvents.length}개`,
      `- 페이싱 상태: ${translatePacingStatus(progress.pacingStatus)}`,
      `- ${guidance.remainingBudget}`,
    ];

    if (guidance.suggestedEvents.length > 0) {
      lines.push("");
      lines.push("### 이번 화 추천 이벤트");
      for (const event of guidance.suggestedEvents) {
        lines.push(`- ${event}`);
      }
    }

    lines.push("");
    lines.push(`### 페이싱 조언`);
    lines.push(guidance.pacingAdvice);

    if (feedbacks.length > 0) {
      lines.push("");
      lines.push("### 경고/제안");
      for (const fb of feedbacks) {
        const icon =
          fb.severity === "critical"
            ? "[긴급]"
            : fb.severity === "warn"
              ? "[주의]"
              : "[참고]";
        lines.push(`${icon} ${fb.message}`);
        lines.push(`  → ${fb.suggestion}`);
      }
    }

    return lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  toJSON(): object {
    const arcProgress: Record<string, ArcProgress> = {};
    for (const [key, value] of this.arcProgress) {
      arcProgress[key] = value;
    }
    return { arcProgress };
  }

  static fromJSON(data: unknown, seed: NovelSeed): ProgressMonitor {
    const monitor = new ProgressMonitor(seed);
    const obj = data as { arcProgress?: Record<string, ArcProgress> };
    if (obj.arcProgress) {
      for (const [key, value] of Object.entries(obj.arcProgress)) {
        monitor.arcProgress.set(key, value);
      }
    }
    return monitor;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function calculatePacingStatus(
  remainingEvents: number,
  remainingChapters: number,
): "too_slow" | "on_track" | "too_fast" {
  if (remainingChapters <= 0) {
    return remainingEvents > 0 ? "too_fast" : "on_track";
  }

  const ratio = remainingEvents / remainingChapters;

  if (ratio > 1.5) return "too_fast";
  if (ratio < 0.5) return "too_slow";
  return "on_track";
}

function translatePacingStatus(
  status: "too_slow" | "on_track" | "too_fast",
): string {
  switch (status) {
    case "too_slow":
      return "느림 — 이벤트 부족";
    case "on_track":
      return "적절";
    case "too_fast":
      return "빠름 — 이벤트 과다";
  }
}
