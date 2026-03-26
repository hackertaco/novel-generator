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
    <div className="mx-auto max-w-[680px]">
      <div className="mb-4">
        <button
          onClick={handleBackToPlot}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          &larr; 플롯 선택으로
        </button>
      </div>

      {/* Novel header */}
      <div className="mb-10 text-center">
        <h1 className="font-[var(--font-serif-kr)] text-2xl font-bold text-zinc-100">
          {seed.title}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {chapterKeys.length > 0
            ? `${chapterKeys.length}화 저장됨`
            : "아직 생성된 회차가 없습니다."}
        </p>
      </div>

      {/* Chapter list */}
      <div className="space-y-3">
        {chapterKeys.map((chNum) => {
          const content = chapters[chNum];
          const chapterOutline = seed.chapter_outlines?.find(
            (o: { chapter_number: number; title?: string }) => o.chapter_number === chNum
          );

          return (
            <div
              key={chNum}
              onClick={() => router.push(`/reader?chapter=${chNum}`)}
              className="group cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition-all hover:border-zinc-600 hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-[var(--font-serif-kr)] text-base font-semibold text-zinc-200 transition-colors group-hover:text-white">
                    제{chNum}화{chapterOutline?.title ? ` - ${chapterOutline.title}` : ""}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-600">
                    {content.length.toLocaleString()}자
                  </p>
                </div>
                <span className="text-zinc-700 transition-colors group-hover:text-zinc-400">
                  &rarr;
                </span>
              </div>
            </div>
          );
        })}

        {/* Generate next chapter button */}
        <button
          onClick={() => router.push("/reader")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-500 transition-colors hover:border-violet-500/50 hover:text-violet-400"
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
