"use client";

interface ChapterReaderProps {
  content: string;
  isStreaming: boolean;
  chapterNumber: number;
  title?: string;
}

export default function ChapterReader({
  content,
  isStreaming,
  chapterNumber,
  title,
}: ChapterReaderProps) {
  if (!content) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-zinc-500">
        생성 버튼을 눌러 {chapterNumber}화를 시작하세요
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8">
      <div className="mb-6 border-b border-zinc-800 pb-4">
        <p className="text-xs text-zinc-500">제{chapterNumber}화</p>
        {title && <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>}
      </div>

      <div className="prose prose-invert max-w-none">
        {content.split("\n\n").map((paragraph, i) => (
          <p
            key={i}
            className="mb-4 text-[15px] leading-relaxed text-zinc-200"
          >
            {paragraph}
          </p>
        ))}
        {isStreaming && <span className="cursor-blink" />}
      </div>

      {!isStreaming && content && (
        <div className="mt-6 border-t border-zinc-800 pt-4 text-right">
          <span className="text-xs text-zinc-500">
            {content.length.toLocaleString()}자
          </span>
        </div>
      )}
    </div>
  );
}
