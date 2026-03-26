"use client";

import { useState } from "react";

interface EvaluationBadgeProps {
  result: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Feedback rules: dimension key -> threshold -> Korean message
// ---------------------------------------------------------------------------

interface FeedbackRule {
  key: string;
  threshold: number;
  message: string;
}

const FEEDBACK_RULES: FeedbackRule[] = [
  { key: "dialogueQuality", threshold: 0.5, message: "대사가 단조로워요" },
  { key: "loopAvoidance", threshold: 0.5, message: "비슷한 내용이 반복돼요" },
  { key: "sentimentArc", threshold: 0.3, message: "감정 변화가 부족해요" },
  { key: "rhythm", threshold: 0.5, message: "문장 리듬이 단조로워요" },
  { key: "hookEnding", threshold: 0.5, message: "다음 화 궁금증이 약해요" },
  { key: "characterVoice", threshold: 0.5, message: "캐릭터 목소리가 비슷해요" },
];

// ---------------------------------------------------------------------------
// Verdict helpers
// ---------------------------------------------------------------------------

function getVerdict(overall: number): { emoji: string; label: string; colorClass: string } {
  if (overall >= 0.85) {
    return { emoji: "\u2705", label: "잘 나왔어요!", colorClass: "text-green-400" };
  }
  if (overall >= 0.70) {
    return { emoji: "\uD83D\uDC4D", label: "괜찮아요", colorClass: "text-yellow-400" };
  }
  return { emoji: "\u26A0\uFE0F", label: "아쉬운 부분이 있어요", colorClass: "text-orange-400" };
}

function collectFeedback(result: Record<string, unknown>): string[] {
  const items: string[] = [];
  for (const rule of FEEDBACK_RULES) {
    const value = result[rule.key];
    if (typeof value === "number" && value < rule.threshold) {
      items.push(rule.message);
    }
    if (items.length >= 3) break;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Extract overall score from any result format
// ---------------------------------------------------------------------------

function extractOverall(result: Record<string, unknown>): number {
  // Deterministic scores format
  if (typeof result.overall === "number") return result.overall;
  // CriticReport format
  if (typeof result.overallScore === "number") return result.overallScore;
  if (typeof result.overall_score === "number") return result.overall_score;
  // Legacy format — style.overall_score
  const style = result.style as Record<string, unknown> | undefined;
  if (style && typeof style.overall_score === "number") return style.overall_score;
  return 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EvaluationBadge({ result }: EvaluationBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  const overall = extractOverall(result);
  const verdict = getVerdict(overall);
  const feedback = collectFeedback(result);

  // If score is great, no feedback items to show
  const hasFeedback = feedback.length > 0 && overall < 0.85;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`text-sm font-semibold ${verdict.colorClass}`}>
          {verdict.emoji} {verdict.label}
        </span>
        {hasFeedback && (
          <span className="text-xs text-zinc-500">
            {expanded ? "접기" : "자세히"}
          </span>
        )}
      </button>

      {expanded && hasFeedback && (
        <ul className="mt-3 space-y-1.5 border-t border-zinc-800 pt-3">
          {feedback.map((msg) => (
            <li key={msg} className="text-xs text-zinc-400">
              <span className="mr-1.5 text-orange-400">{">"}</span>
              {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
