"use client";

import { useEffect, useState } from "react";

/**
 * Maps every known technical stage name to a user-friendly Korean label.
 * Stages arrive from two sources:
 *   - orchestrator `pipeline_stage`: generating_chapter, evaluating, improving, ...
 *   - lifecycle `stage_change`: writing, rule_check, surgery, polishing, ...
 */
const STAGE_LABELS: Record<string, { label: string; order: number }> = {
  // --- planning ---
  planning_arcs:      { label: "이야기 구조 설계 중...",  order: 0 },
  planning_chapters:  { label: "회차 구성 중...",        order: 1 },

  // --- generation ---
  generating:         { label: "글 쓰는 중...",          order: 2 },
  generating_chapter: { label: "글 쓰는 중...",          order: 2 },
  writing:            { label: "글 쓰는 중...",          order: 2 },

  // --- validation & checks ---
  scene_verify:       { label: "검수 중...",             order: 3 },
  validating:         { label: "검수 중...",             order: 3 },
  deterministic_gate: { label: "검수 중...",             order: 3 },
  rule_check:         { label: "교정 중...",             order: 4 },
  "self-review":      { label: "교정 중...",             order: 4 },
  critiquing:         { label: "교정 중...",             order: 4 },
  evaluating:         { label: "교정 중...",             order: 4 },

  // --- repair & polish ---
  surgery:            { label: "수정 중...",             order: 5 },
  improving:          { label: "수정 중...",             order: 5 },
  patching:           { label: "수정 중...",             order: 5 },
  polishing:          { label: "다듬는 중...",           order: 6 },

  // --- done ---
  completing:         { label: "완료!",                  order: 7 },
  chapter_complete:   { label: "완료!",                  order: 7 },
};

/** The simplified step sequence shown to users. */
const USER_STEPS = [
  { key: "plan",     label: "구성",   orders: [0, 1] },
  { key: "write",    label: "집필",   orders: [2] },
  { key: "check",    label: "검수",   orders: [3, 4] },
  { key: "fix",      label: "수정",   orders: [5] },
  { key: "polish",   label: "다듬기", orders: [6] },
  { key: "done",     label: "완료",   orders: [7] },
];

function getStageInfo(stage: string) {
  return STAGE_LABELS[stage] ?? { label: "처리 중...", order: -1 };
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

interface GenerationProgressProps {
  isGenerating: boolean;
  pipelineStage: string;
  /** Timestamp (ms) when generation started; used for elapsed time. */
  generationStartTime: number | null;
}

export default function GenerationProgress({
  isGenerating,
  pipelineStage,
  generationStartTime,
}: GenerationProgressProps) {
  const computeElapsed = () =>
    isGenerating && generationStartTime
      ? Math.floor((Date.now() - generationStartTime) / 1000)
      : 0;

  const [elapsed, setElapsed] = useState(computeElapsed);

  // Elapsed-time ticker
  useEffect(() => {
    if (!isGenerating || !generationStartTime) return;
    const update = () => setElapsed(Math.floor((Date.now() - generationStartTime) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [isGenerating, generationStartTime]);

  if (!isGenerating && pipelineStage === "idle") return null;

  const info = getStageInfo(pipelineStage);
  const currentOrder = info.order;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      {/* Current stage label with spinner */}
      <div className="flex items-center gap-2.5">
        {isGenerating && pipelineStage !== "idle" && currentOrder < 7 && (
          <span className="generation-spinner" />
        )}
        <span className="text-sm font-medium text-zinc-200">
          {info.label}
        </span>
      </div>

      {/* Step dots */}
      <div className="mt-3 flex items-center gap-1">
        {USER_STEPS.map((step) => {
          const isActive = step.orders.includes(currentOrder);
          const isDone = currentOrder > Math.max(...step.orders);
          return (
            <div key={step.key} className="flex flex-col items-center flex-1">
              <div
                className={`h-1 w-full rounded-full transition-colors duration-300 ${
                  isDone
                    ? "bg-violet-500"
                    : isActive
                      ? "bg-violet-400 generation-step-pulse"
                      : "bg-zinc-700"
                }`}
              />
              <span
                className={`mt-1.5 text-[10px] transition-colors duration-300 ${
                  isActive
                    ? "text-violet-400 font-medium"
                    : isDone
                      ? "text-zinc-400"
                      : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Elapsed time */}
      {isGenerating && elapsed > 0 && (
        <p className="mt-3 text-[11px] text-zinc-500 text-right">
          {formatElapsed(elapsed)} 경과
        </p>
      )}
    </div>
  );
}
