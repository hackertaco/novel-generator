"use client";

const GENRE_INFO: Record<string, { emoji: string; desc: string; sub: string }> = {
  "현대 판타지": {
    emoji: "🗡️",
    desc: "헌터물, 회귀, 빙의 등 현대 배경의 판타지",
    sub: "헌터 / 시스템 / 각성",
  },
  "정통 판타지": {
    emoji: "🏰",
    desc: "이세계, 마법사, 기사 등 정통 판타지",
    sub: "이세계 / 마법 / 기사",
  },
  무협: {
    emoji: "⚔️",
    desc: "강호를 누비는 무림인의 이야기",
    sub: "무공 / 문파 / 강호",
  },
  로맨스: {
    emoji: "💕",
    desc: "로맨스, 로판, 감성 스토리",
    sub: "로판 / 현로 / 빙의",
  },
};

interface GenreCardProps {
  genre: string;
  selected: boolean;
  onClick: () => void;
}

export default function GenreCard({ genre, selected, onClick }: GenreCardProps) {
  const info = GENRE_INFO[genre] ?? { emoji: "📖", desc: genre, sub: "" };

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-start gap-3 rounded-xl border p-6 text-left transition-all ${
        selected
          ? "border-violet-500 bg-violet-500/10"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50"
      }`}
    >
      <span className="text-3xl">{info.emoji}</span>
      <div>
        <h3 className="text-lg font-semibold text-white">{genre}</h3>
        <p className="mt-1 text-sm text-zinc-400">{info.desc}</p>
        <p className="mt-2 text-xs text-zinc-500">{info.sub}</p>
      </div>
      {selected && (
        <div className="absolute right-4 top-4 h-3 w-3 rounded-full bg-violet-500" />
      )}
    </button>
  );
}
