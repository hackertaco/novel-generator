"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";
import CharacterCard from "@/components/preview/CharacterCard";
import WorldSettingPanel from "@/components/preview/WorldSettingPanel";
import ArcTimeline from "@/components/preview/ArcTimeline";

export default function PreviewPage() {
  const router = useRouter();
  const { genre, selectedPlot, seed, setSeed, error, setError } = useNovelStore();
  const [loading, setLoading] = useState(false);
  const didFetch = useRef(false);

  // Reset didFetch when selectedPlot changes so re-visiting triggers generation
  useEffect(() => {
    didFetch.current = false;
  }, [selectedPlot?.id]);

  useEffect(() => {
    if (!seed && genre && selectedPlot && !loading && !didFetch.current) {
      didFetch.current = true;
      generateSeed();
    }
  }, [seed, genre, selectedPlot, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const generateSeed = async () => {
    if (!genre || !selectedPlot) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre, plot: selectedPlot }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "시드 생성 실패" }));
        throw new Error(err.error);
      }

      const data = await res.json();
      setSeed(data.seed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시드 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">소설 설계 중...</h1>
          <p className="mt-2 text-sm text-zinc-400">
            캐릭터, 세계관, 스토리 아크를 설계하고 있습니다.
          </p>
        </div>
        <div className="space-y-4">
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-48 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!seed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          {error ? (
            <>
              <p className="text-red-400">시드 생성 실패: {error}</p>
              <div className="mt-4 flex gap-3 justify-center">
                <button
                  onClick={() => { didFetch.current = false; generateSeed(); }}
                  className="rounded-lg bg-violet-600 px-6 py-2 text-sm text-white"
                >
                  다시 시도
                </button>
                <button
                  onClick={() => router.push("/plot")}
                  className="rounded-lg border border-zinc-700 px-6 py-2 text-sm text-zinc-300"
                >
                  플롯 다시 선택
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-zinc-400">플롯을 먼저 선택해주세요.</p>
              <button
                onClick={() => router.push("/genre")}
                className="mt-4 rounded-lg bg-violet-600 px-6 py-2 text-sm text-white"
              >
                처음부터 시작
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{seed.title}</h1>
        <p className="mt-2 text-sm text-zinc-400">{seed.logline}</p>
        <div className="mt-2 flex gap-2">
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            {seed.world.genre}
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            {seed.total_chapters}화
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            캐릭터 {seed.characters.length}명
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Characters */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">캐릭터</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {seed.characters.map((char) => (
              <CharacterCard key={char.id} character={char} />
            ))}
          </div>
        </section>

        {/* World Setting */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">세계관</h2>
          <WorldSettingPanel world={seed.world} />
        </section>

        {/* Story Arcs & Foreshadowing */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            스토리 구조
          </h2>
          <ArcTimeline arcs={seed.arcs} foreshadowing={seed.foreshadowing} />
        </section>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={generateSeed}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          다시 생성
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/plot")}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            이전
          </button>
          <button
            onClick={() => router.push("/plan")}
            className="rounded-lg bg-violet-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            소설 구조 설계
          </button>
        </div>
      </div>
    </div>
  );
}
