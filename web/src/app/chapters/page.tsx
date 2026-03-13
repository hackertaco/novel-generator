"use client";

import { useRouter } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";

export default function ChaptersPage() {
  const router = useRouter();
  const { seed, chapters, currentChapter, resetToPlotSelection } =
    useNovelStore();

  if (!seed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">소설 정보가 없습니다.</p>
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

  const chapterKeys = Object.keys(chapters)
    .map(Number)
    .sort((a, b) => a - b);

  const handleBackToPlot = () => {
    resetToPlotSelection();
    router.push("/plot");
  };

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={handleBackToPlot}
          className="text-sm text-zinc-400 transition-colors hover:text-white"
        >
          &larr; 플롯 선택으로
        </button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{seed.title}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {chapterKeys.length > 0
            ? `${chapterKeys.length}화 저장됨`
            : "아직 생성된 회차가 없습니다."}
        </p>
      </div>

      {/* Chapter cards */}
      <div className="space-y-3">
        {chapterKeys.map((chNum) => {
          const content = chapters[chNum];
          const chapterOutline = seed.chapter_outlines?.find(
            (o) => o.chapter_number === chNum
          );

          return (
            <div
              key={chNum}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-600"
            >
              <div
                className="cursor-pointer"
                onClick={() => router.push(`/reader?chapter=${chNum}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white">
                      {chNum}화{chapterOutline?.title ? `: ${chapterOutline.title}` : ""}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {content.length.toLocaleString()}자
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                    저장됨
                  </span>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => router.push(`/reader?chapter=${chNum}`)}
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  읽기
                </button>
                <button
                  onClick={() => router.push(`/reader?chapter=${chNum}&regenerate=true`)}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
                >
                  다시 생성
                </button>
              </div>
            </div>
          );
        })}

        {/* Generate next chapter button */}
        <button
          onClick={() => router.push("/reader")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-5 text-sm text-zinc-400 transition-colors hover:border-violet-500/50 hover:text-violet-400"
        >
          <span className="text-lg">+</span>
          {currentChapter === 0
            ? "1화 생성하기"
            : `${currentChapter + 1}화 생성하기`}
        </button>
      </div>
    </div>
  );
}
