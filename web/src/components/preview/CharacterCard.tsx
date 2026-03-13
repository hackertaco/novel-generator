"use client";

import type { Character } from "@/lib/schema/character";

interface CharacterCardProps {
  character: Character;
}

export default function CharacterCard({ character }: CharacterCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-400">
          {character.name.charAt(0)}
        </div>
        <div>
          <h3 className="font-semibold text-white">{character.name}</h3>
          <p className="text-xs text-zinc-400">{character.role}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="text-xs text-zinc-500">톤</p>
          <p className="text-zinc-300">{character.voice.tone}</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500">말투 패턴</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {character.voice.speech_patterns.map((p, i) => (
              <span
                key={i}
                className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-zinc-500">대사 예시</p>
          <div className="mt-1 space-y-1">
            {character.voice.sample_dialogues.slice(0, 3).map((d, i) => (
              <p key={i} className="text-xs text-zinc-400 italic">
                &ldquo;{d}&rdquo;
              </p>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-zinc-500">성장 아크</p>
          <p className="text-xs text-zinc-400">{character.arc_summary}</p>
        </div>
      </div>
    </div>
  );
}
