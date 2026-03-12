"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";

export default function PlanPage() {
  const router = useRouter();
  const { seed, masterPlan, setMasterPlan, setPlanningStage, error, setError } =
    useNovelStore();
  const [loading, setLoading] = useState(false);
  const didFetch = useRef(false);

  useEffect(() => {
    if (seed && !masterPlan && !loading && !didFetch.current) {
      didFetch.current = true;
      generatePlan();
    }
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const generatePlan = async () => {
    if (!seed) return;
    setLoading(true);
    setError(null);
    setPlanningStage("master");

    try {
      const res = await fetch("/api/plan/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "플랜 생성 실패" }));
        throw new Error(err.error);
      }

      const data = await res.json();
      setMasterPlan(data.masterPlan);
      setPlanningStage("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "플랜 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  if (!seed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400">시드를 먼저 생성해주세요.</p>
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

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">전체 구조 설계 중...</h1>
          <p className="mt-2 text-sm text-zinc-400">
            세계관 복잡도를 분석하고, 대막과 아크를 설계하고 있습니다.
          </p>
        </div>
        <div className="space-y-4">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!masterPlan) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          {error ? (
            <>
              <p className="text-red-400">플랜 생성 실패: {error}</p>
              <button
                onClick={() => { didFetch.current = false; generatePlan(); }}
                className="mt-4 rounded-lg bg-violet-600 px-6 py-2 text-sm text-white"
              >
                다시 시도
              </button>
            </>
          ) : (
            <p className="text-zinc-400">플랜을 생성하고 있습니다...</p>
          )}
        </div>
      </div>
    );
  }

  const { estimated_total_chapters, world_complexity, parts } = masterPlan;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{seed.title} — 전체 구조</h1>
        <p className="mt-2 text-sm text-zinc-400">{seed.logline}</p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            예상 {estimated_total_chapters.min}~{estimated_total_chapters.max}화
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            대막 {parts.length}개
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            진영 {world_complexity.faction_count}개
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            장소 {world_complexity.location_count}개
          </span>
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
            능력 체계: {world_complexity.power_system_depth === "deep" ? "심층" : world_complexity.power_system_depth === "moderate" ? "보통" : "단순"}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {parts.map((part, i) => (
          <div key={part.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">
                Part {i + 1}: {part.name}
              </h2>
              <span className="text-xs text-zinc-500">
                {part.start_chapter}~{part.end_chapter}화 ({part.estimated_chapter_count}화)
              </span>
            </div>
            <p className="text-sm text-zinc-300 mb-2">{part.theme}</p>
            <div className="text-xs text-zinc-500 space-y-1">
              <p>핵심 갈등: {part.core_conflict}</p>
              <p>도달점: {part.resolution_target}</p>
              {part.transition_to_next && (
                <p className="text-violet-400">→ {part.transition_to_next}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {masterPlan.global_foreshadowing_timeline.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">장기 복선</h2>
          <div className="space-y-2">
            {masterPlan.global_foreshadowing_timeline.map((fs) => (
              <div key={fs.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                {fs.description}
                <span className="text-xs text-zinc-500 ml-2">
                  (심기: {fs.plant_part} → 회수: {fs.reveal_part})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => { didFetch.current = false; generatePlan(); }}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          다시 생성
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/preview")}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            이전
          </button>
          <button
            onClick={() => router.push("/reader")}
            className="rounded-lg bg-violet-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            소설 생성 시작
          </button>
        </div>
      </div>
    </div>
  );
}
