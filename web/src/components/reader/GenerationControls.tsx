"use client";

import { useState } from "react";

const STAGE_LABELS: Record<string, string> = {
  // planning
  planning_arcs: "구성 중",
  planning_chapters: "구성 중",
  // writing
  generating: "글 쓰는 중",
  generating_chapter: "글 쓰는 중",
  writing: "글 쓰는 중",
  // validation
  scene_verify: "검수 중",
  validating: "검수 중",
  deterministic_gate: "검수 중",
  rule_check: "교정 중",
  "self-review": "교정 중",
  critiquing: "교정 중",
  evaluating: "교정 중",
  // repair
  surgery: "수정 중",
  improving: "수정 중",
  patching: "수정 중",
  polishing: "다듬는 중",
  // done
  completing: "완료",
  chapter_complete: "완료",
};

const PRESETS = [
  { id: "default", label: "기본", desc: "gpt-5.4, 전체 파이프라인" },
  { id: "budget", label: "절약", desc: "gpt-4o, 임계값 낮춤" },
  { id: "fast", label: "빠름", desc: "gpt-4o, 폴리셔 생략" },
] as const;

interface GenerationControlsProps {
  isGenerating: boolean;
  currentChapter: number;
  onGenerate: (preset?: string) => void;
  onAbort: () => void;
  pipelineStage?: string;
  pipelineRetries?: number;
}

export default function GenerationControls({
  isGenerating,
  currentChapter,
  onGenerate,
  onAbort,
  pipelineStage,
  pipelineRetries,
}: GenerationControlsProps) {
  const [selectedPreset, setSelectedPreset] = useState("default");
  const stageLabel =
    pipelineStage && pipelineStage !== "idle"
      ? STAGE_LABELS[pipelineStage] || pipelineStage
      : null;

  return (
    <div className="flex items-center gap-3">
      {isGenerating ? (
        <button
          onClick={onAbort}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
        >
          중단
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {/* Preset selector */}
          <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPreset(p.id)}
                title={p.desc}
                className={`px-3 py-2 text-xs transition-colors ${
                  selectedPreset === p.id
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => onGenerate(selectedPreset)}
            className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            {currentChapter === 0 ? "1화 생성" : `${currentChapter + 1}화 생성`}
          </button>
        </div>
      )}

      {isGenerating && stageLabel && (
        <span className="text-sm text-zinc-400">
          {stageLabel}
          {pipelineRetries && pipelineRetries > 0
            ? ` (재시도 ${pipelineRetries}회)`
            : ""}
          ...
        </span>
      )}
    </div>
  );
}
