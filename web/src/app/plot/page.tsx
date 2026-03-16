"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";
import PlotCard from "@/components/plot/PlotCard";
import type { PlotOption } from "@/lib/schema/plot";

export default function PlotPage() {
  const router = useRouter();
  const { genre, plots, selectedPlot, setPlots, selectPlot, setSeed, setError } =
    useNovelStore();
  const [loading, setLoading] = useState(false);

  const generatePlots = async () => {
    if (!genre) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/plots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "플롯 생성 실패" }));
        throw new Error(err.error);
      }

      const data = await res.json();
      setPlots(data.plots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "플롯 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (selectedPlot) {
      // Always clear previous seed so preview page generates a fresh one
      setSeed(null);
      router.push("/preview");
    }
  };

  // Auto-generate on first visit (always fetch fresh plots)
  const didFetch = useRef(false);
  useEffect(() => {
    if (!loading && genre && !didFetch.current) {
      didFetch.current = true;
      generatePlots();
    }
  }, [genre]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">플롯 선택</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {loading
            ? `${genre} 장르의 플롯을 생성하고 있습니다...`
            : plots.length > 0
              ? `${genre} 장르의 플롯 ${plots.length}개를 생성했습니다. 마음에 드는 것을 선택하세요.`
              : `${genre} 장르의 플롯을 준비합니다.`}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {plots.map((plot: PlotOption) => (
            <PlotCard
              key={plot.id}
              plot={plot}
              selected={selectedPlot?.id === plot.id}
              onClick={() => selectPlot(plot)}
            />
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={generatePlots}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-30"
        >
          {loading ? "생성 중..." : "다시 생성"}
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => router.push("/genre")}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            이전
          </button>
          <button
            onClick={handleNext}
            disabled={!selectedPlot}
            className="rounded-lg bg-violet-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-30"
          >
            다음: 미리보기
          </button>
        </div>
      </div>
    </div>
  );
}
