"use client";

const STAGE_LABELS: Record<string, string> = {
  generating: "소설 생성 중",
  generating_chapter: "소설 생성 중",
  evaluating: "품질 평가 중",
  improving: "개선 중",
  completing: "마무리 중",
  chapter_complete: "완료",
};

interface GenerationControlsProps {
  isGenerating: boolean;
  currentChapter: number;
  onGenerate: () => void;
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
        <button
          onClick={onGenerate}
          className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
        >
          {currentChapter === 0 ? "1화 생성" : `${currentChapter + 1}화 생성`}
        </button>
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
