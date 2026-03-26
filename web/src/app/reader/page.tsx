"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";
import { useStreamingGeneration } from "@/hooks/useStreamingGeneration";
import ChapterReader from "@/components/reader/ChapterReader";
import GenerationControls from "@/components/reader/GenerationControls";
import EvaluationBadge from "@/components/reader/EvaluationBadge";
import GenerationProgress from "@/components/reader/GenerationProgress";

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
    generationStartTime,
    setViewingChapter,
  } = useNovelStore();
  const { generateOrchestrated, abort } = useStreamingGeneration();
  const logEndRef = useRef<HTMLDivElement>(null);
  const didRegenerate = useRef(false);
  const [showPanel, setShowPanel] = useState(false);

  // Sync URL query param -> viewingChapter state + auto-regenerate
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

  const chapterOutline = seed.chapter_outlines?.find(
    (o: { chapter_number: number; title?: string }) => o.chapter_number === activeChapter
  );

  const handleChapterNav = (chapterNum: number) => {
    setViewingChapter(chapterNum);
    router.push(`/reader?chapter=${chapterNum}`);
  };

  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < chapterKeys.length - 1;

  return (
    <div className="relative">
      {/* Top bar: minimal navigation + controls toggle */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => router.push("/chapters")}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          &larr; 목록
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPanel(!showPanel)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              showPanel
                ? "border-violet-500/40 bg-violet-500/10 text-violet-400"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
            title="생성 도구 패널"
          >
            도구
          </button>
        </div>
      </div>

      {/* Novel title */}
      <div className="mb-4 text-center">
        <h1 className="text-lg font-semibold text-zinc-300">{seed.title}</h1>
      </div>

      {error && (
        <div className="mx-auto mb-4 max-w-[680px] rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Progress indicator — visible during generation */}
      <div className="mx-auto mb-4 max-w-[680px]">
        <GenerationProgress
          isGenerating={isGenerating}
          pipelineStage={pipelineStage}
          generationStartTime={generationStartTime}
        />
      </div>

      {/* Main reading area */}
      <div className="relative">
        {/* Collapsible tools panel */}
        {showPanel && (
          <div className="mx-auto mb-6 max-w-[680px] space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
            <GenerationControls
              isGenerating={isGenerating}
              currentChapter={currentChapter}
              onGenerate={(preset) => generateOrchestrated(undefined, { preset })}
              onAbort={abort}
              pipelineStage={pipelineStage}
              pipelineRetries={pipelineRetries}
            />

            {/* Pipeline logs */}
            {(isGenerating || pipelineLogs.length > 0) && (
              <div className="border-t border-zinc-800 pt-3">
                <h3 className="mb-2 text-xs font-semibold text-zinc-500">생성 로그</h3>
                <div className="max-h-36 space-y-0.5 overflow-y-auto text-xs">
                  {pipelineLogs.map((log, i) => (
                    <div
                      key={i}
                      className={
                        log.type === "success"
                          ? "text-emerald-400"
                          : log.type === "warn"
                            ? "text-amber-400"
                            : "text-zinc-500"
                      }
                    >
                      <span className="mr-1.5 text-zinc-700">
                        {new Date(log.time).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      {log.message}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}

            <EvaluationBadge result={evaluationResult} />

            {tokenUsage.total_tokens > 0 && (
              <div className="border-t border-zinc-800 pt-3 text-xs text-zinc-600">
                토큰: {tokenUsage.total_tokens.toLocaleString()} | 비용: ${tokenUsage.total_cost_usd.toFixed(4)}
              </div>
            )}

            {chapters[activeChapter] && !isGenerating && (
              <button
                onClick={() => generateOrchestrated(activeChapter)}
                className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
              >
                이 화 다시 생성
              </button>
            )}
          </div>
        )}

        {/* The novel content */}
        <ChapterReader
          content={displayContent}
          isStreaming={isGenerating}
          chapterNumber={activeChapter}
          title={chapterOutline?.title}
        />

        {/* Bottom chapter navigation */}
        {chapterKeys.length > 0 && !isGenerating && (
          <nav className="mx-auto mt-8 flex max-w-[680px] items-center gap-3 border-t border-zinc-800/40 px-4 pt-8 sm:px-0">
            <button
              disabled={!hasPrev}
              onClick={() => hasPrev && handleChapterNav(chapterKeys[activeIndex - 1])}
              className="flex flex-1 flex-col items-start rounded-xl border border-zinc-800 px-5 py-4 text-left transition-colors hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-20"
            >
              <span className="text-xs text-zinc-600">이전 화</span>
              {hasPrev && (
                <span className="mt-1 text-sm text-zinc-300">
                  제{chapterKeys[activeIndex - 1]}화
                </span>
              )}
            </button>

            <button
              onClick={() => router.push("/chapters")}
              className="rounded-xl border border-zinc-800 px-4 py-4 text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300"
              title="목록으로"
            >
              목록
            </button>

            <button
              disabled={!hasNext}
              onClick={() => hasNext && handleChapterNav(chapterKeys[activeIndex + 1])}
              className="flex flex-1 flex-col items-end rounded-xl border border-zinc-800 px-5 py-4 text-right transition-colors hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-20"
            >
              <span className="text-xs text-zinc-600">다음 화</span>
              {hasNext && (
                <span className="mt-1 text-sm text-zinc-300">
                  제{chapterKeys[activeIndex + 1]}화
                </span>
              )}
            </button>
          </nav>
        )}

        {/* Spacer at bottom */}
        <div className="h-16" />
      </div>
    </div>
  );
}
