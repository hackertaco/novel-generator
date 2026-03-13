"use client";

import type { WorldSetting } from "@/lib/schema/novel";

interface WorldSettingPanelProps {
  world: WorldSetting;
}

export default function WorldSettingPanel({ world }: WorldSettingPanelProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="font-semibold text-white">{world.name}</h3>
      <p className="mt-1 text-xs text-zinc-400">
        {world.genre} / {world.sub_genre} &middot; {world.time_period}
      </p>

      {world.magic_system && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500">능력 체계</p>
          <p className="text-sm text-zinc-300">{world.magic_system}</p>
        </div>
      )}

      {Object.keys(world.key_locations).length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500">주요 장소</p>
          <div className="mt-1 space-y-1">
            {Object.entries(world.key_locations).map(([id, desc]) => (
              <p key={id} className="text-xs text-zinc-400">
                <span className="text-zinc-300">{id}</span>: {desc}
              </p>
            ))}
          </div>
        </div>
      )}

      {Object.keys(world.factions).length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500">세력</p>
          <div className="mt-1 space-y-1">
            {Object.entries(world.factions).map(([id, desc]) => (
              <p key={id} className="text-xs text-zinc-400">
                <span className="text-zinc-300">{id}</span>: {desc}
              </p>
            ))}
          </div>
        </div>
      )}

      {world.rules.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-zinc-500">세계관 규칙</p>
          <ul className="mt-1 space-y-1">
            {world.rules.map((rule, i) => (
              <li key={i} className="text-xs text-zinc-400">
                &bull; {rule}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
