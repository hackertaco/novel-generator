"use client";

import type { PlotArc } from "@/lib/schema/novel";

interface ArcTimelineProps {
  arcs: PlotArc[];
  foreshadowing: Array<{
    id: string;
    name: string;
    importance: string;
    planted_at: number;
    reveal_at: number | null;
  }>;
}

export default function ArcTimeline({ arcs, foreshadowing }: ArcTimelineProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="font-semibold text-white">스토리 아크</h3>

      <div className="mt-4 space-y-3">
        {arcs.map((arc) => (
          <div key={arc.id} className="relative">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-violet-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">{arc.name}</h4>
                  <span className="text-xs text-zinc-500">
                    {arc.start_chapter}-{arc.end_chapter}화
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{arc.summary}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  클라이맥스: {arc.climax_chapter}화
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {foreshadowing.length > 0 && (
        <>
          <h4 className="mt-5 text-sm font-semibold text-white">복선</h4>
          <div className="mt-2 space-y-2">
            {foreshadowing.map((fs) => (
              <div
                key={fs.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-zinc-300">
                  {fs.name}
                  {fs.importance === "critical" && (
                    <span className="ml-1 text-red-400">*</span>
                  )}
                </span>
                <span className="text-zinc-500">
                  {fs.planted_at}화 {fs.reveal_at ? `→ ${fs.reveal_at}화` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
