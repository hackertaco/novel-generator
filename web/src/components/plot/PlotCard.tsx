"use client";

import type { PlotOption } from "@/lib/schema/plot";

interface PlotCardProps {
  plot: PlotOption;
  selected: boolean;
  onClick: () => void;
}

export default function PlotCard({ plot, selected, onClick }: PlotCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-xl border p-6 text-left transition-all ${
        selected
          ? "border-violet-500 bg-violet-500/10"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-violet-400">
          {plot.id}
        </span>
        <h3 className="text-lg font-semibold text-white">{plot.title}</h3>
      </div>

      <p className="text-sm text-zinc-300">{plot.logline}</p>
      <p className="text-xs text-violet-400">{plot.hook}</p>

      <div className="mt-2 space-y-1">
        {plot.arc_summary.map((arc, i) => (
          <p key={i} className="text-xs text-zinc-500">
            {arc}
          </p>
        ))}
      </div>

      <div className="mt-2 border-t border-zinc-800 pt-2">
        <p className="text-xs text-zinc-400">
          반전: <span className="text-zinc-300">{plot.key_twist}</span>
        </p>
      </div>
    </button>
  );
}
