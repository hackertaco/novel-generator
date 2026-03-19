"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";
import { useStreamingGeneration } from "@/hooks/useStreamingGeneration";
import ChapterReader from "@/components/reader/ChapterReader";
import GenerationControls from "@/components/reader/GenerationControls";
import EvaluationBadge from "@/components/reader/EvaluationBadge";

export default function ReaderPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReaderPageInner />
    </Suspense>
  );
}

function ReaderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    seed,
    chapters,
    currentChapter,
    viewingChapter,
    isGenerating,
    streamingText,
    evaluationResult,
    error,
    pipelineStage,
    pipelineRetries,
    pipelineLogs,
    tokenUsage,
    setViewingChapter,
  } = useNovelStore();
  const { generateOrchestrated, abort } = useStreamingGeneration();
  const logEndRef = useRef<HTMLDivElement>(null);
  const didRegenerate = useRef(false);

  // Sync URL query param → viewingChapter state + auto-regenerate
  useEffect(() => {
    const chapterParam = searchParams.get("chapter");
    if (chapterParam) {
      const chapterNum = parseInt(chapterParam, 10);
      if (!isNaN(chapterNum) && chapterNum !== viewingChapter) {
        setViewingChapter(chapterNum);
      }
      if (searchParams.get("regenerate") === "true" && !isGenerating && !didRegenerate.current) {
        didRegenerate.current = true;
        router.replace(`/reader?chapter=${chapterNum}`);
        generateOrchestrated(chapterNum);
      }
    } else {
      didRegenerate.current = false;
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start generation when entering reader with no chapters
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (seed && currentChapter === 0 && !isGenerating && !didAutoStart.current && !searchParams.get("chapter")) {
      didAutoStart.current = true;
      generateOrchestrated();
    }
  }, [seed, currentChapter, isGenerating]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll pipeline logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pipelineLogs.length]);

  if (!seed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">시드가 없습니다.</p>
          <button
            onClick={() => router.push("/genre")}
            className="mt-4 rounded-lg bg-violet-600 px-6 py-2 text-sm text-white"
          >
            처음부터 시작
          </button>
        </div>
      </div>
    );
  }

  const activeChapter = viewingChapter ?? currentChapter;
  const displayContent = isGenerating
    ? streamingText
    : chapters[activeChapter] || streamingText;
  const chapterKeys = Object.keys(chapters)
    .map(Number)
    .sort((a, b) => a - b);
  const activeIndex = chapterKeys.indexOf(activeChapter);

  const handleChapterNav = (chapterNum: number) => {
    setViewingChapter(chapterNum);
    router.push(`/reader?chapter=${chapterNum}`);
  };

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => router.push("/chapters")}
          className="text-sm text-zinc-400 transition-colors hover:text-white"
        >
          &larr; 목록으로
        </button>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{seed.title}</h1>
          <p className="text-xs text-zinc-500">
            {currentChapter > 0
              ? `${currentChapter}화 완료`
              : "아직 생성된 회차 없음"}
          </p>
        </div>
        <GenerationControls
          isGenerating={isGenerating}
          currentChapter={currentChapter}
          onGenerate={(preset) => generateOrchestrated(undefined, { preset })}
          onAbort={abort}
          pipelineStage={pipelineStage}
          pipelineRetries={pipelineRetries}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
        <ChapterReader
          content={displayContent}
          isStreaming={isGenerating}
          chapterNumber={activeChapter}
        />

        <div className="space-y-4">
          {/* Pipeline log — only during generation or right after */}
          {(isGenerating || pipelineLogs.length > 0) && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="mb-2 text-sm font-semibold text-white">
                생성 과정
              </h3>
              <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
                {pipelineLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.type === "success"
                        ? "text-emerald-400"
                        : log.type === "warn"
                          ? "text-amber-400"
                          : "text-zinc-400"
                    }
                  >
                    <span className="mr-1.5 text-zinc-600">
                      {new Date(log.time).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    {log.message}
                  </div>
                ))}
                {isGenerating && pipelineStage !== "idle" && (
                  <div className="text-violet-400 animate-pulse">
                    {pipelineStage === "generating"
                      ? "작가가 글을 쓰고 있어요..."
                      : pipelineStage === "editing"
                        ? "편집장이 다듬는 중..."
                        : pipelineStage === "evaluating"
                          ? "품질 검수 중..."
                          : pipelineStage === "improving"
                            ? "한 번 더 손보는 중..."
                            : pipelineStage === "completing"
                              ? "마무리 중..."
                              : "처리 중..."}
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          <EvaluationBadge result={evaluationResult} />

          {tokenUsage.total_tokens > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-sm font-semibold text-white">토큰 사용량</h3>
              <div className="mt-2 space-y-1 text-xs text-zinc-400">
                <p>총 토큰: {tokenUsage.total_tokens.toLocaleString()}</p>
                <p>비용: ${tokenUsage.total_cost_usd.toFixed(4)}</p>
              </div>
            </div>
          )}

          {chapterKeys.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-sm font-semibold text-white">
                {activeChapter}화 보는 중
              </h3>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={activeIndex <= 0}
                  onClick={() =>
                    activeIndex > 0 &&
                    handleChapterNav(chapterKeys[activeIndex - 1])
                  }
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  &larr; 이전 화
                </button>
                <button
                  disabled={activeIndex >= chapterKeys.length - 1}
                  onClick={() =>
                    activeIndex < chapterKeys.length - 1 &&
                    handleChapterNav(chapterKeys[activeIndex + 1])
                  }
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  다음 화 &rarr;
                </button>
              </div>
              {chapters[activeChapter] && !isGenerating && (
                <button
                  onClick={() => generateOrchestrated(activeChapter)}
                  className="mt-2 w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
                >
                  이 화 다시 생성
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
