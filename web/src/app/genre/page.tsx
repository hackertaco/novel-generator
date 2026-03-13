"use client";

import { useRouter } from "next/navigation";
import { useNovelStore } from "@/hooks/useNovelStore";
import GenreCard from "@/components/genre/GenreCard";

const GENRES = ["현대 판타지", "정통 판타지", "무협", "로맨스 판타지", "현대 로맨스", "로맨스 빙의물"];

export default function GenrePage() {
  const router = useRouter();
  const { genre, setGenre } = useNovelStore();

  const handleSelect = (g: string) => {
    setGenre(g);
  };

  const handleNext = () => {
    if (genre) router.push("/plot");
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">장르 선택</h1>
        <p className="mt-2 text-sm text-zinc-400">
          어떤 장르의 웹소설을 만들어볼까요?
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GENRES.map((g) => (
          <GenreCard
            key={g}
            genre={g}
            selected={genre === g}
            onClick={() => handleSelect(g)}
          />
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleNext}
          disabled={!genre}
          className="rounded-lg bg-violet-600 px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-30"
        >
          다음: 플롯 생성
        </button>
      </div>
    </div>
  );
}
