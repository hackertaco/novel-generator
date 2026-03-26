"use client";

import { useEffect, useRef } from "react";

interface ChapterReaderProps {
  content: string;
  isStreaming: boolean;
  chapterNumber: number;
  title?: string;
}

/**
 * Render a single paragraph, detecting quoted dialogue lines
 * and wrapping them with subtle visual distinction.
 */
function NovelParagraph({ text }: { text: string }) {
  // Detect if this paragraph is primarily dialogue (starts with a quote mark)
  const isDialogue =
    text.startsWith("\u201C") || // "
    text.startsWith('"') ||
    text.startsWith("\u300C") || // 「
    text.startsWith("\u300E"); // 『

  if (isDialogue) {
    return (
      <p className="my-5 border-l-2 border-violet-500/30 pl-4 font-[var(--font-serif-kr)] text-base leading-[2] text-amber-50/90">
        {text}
      </p>
    );
  }

  return (
    <p className="my-5 font-[var(--font-serif-kr)] text-base leading-[2] text-stone-300">
      {text}
    </p>
  );
}

export default function ChapterReader({
  content,
  isStreaming,
  chapterNumber,
  title,
}: ChapterReaderProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Smooth auto-scroll during streaming
  useEffect(() => {
    if (isStreaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [content, isStreaming]);

  if (!content) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="font-[var(--font-serif-kr)] text-zinc-500">
          {chapterNumber > 0
            ? `제${chapterNumber}화를 불러오는 중...`
            : "생성 버튼을 눌러 첫 화를 시작하세요"}
        </p>
      </div>
    );
  }

  const paragraphs = content.split("\n\n").filter((p) => p.trim().length > 0);

  return (
    <article className="mx-auto max-w-[680px] px-4 py-8 sm:px-0">
      {/* Chapter header */}
      <header className="mb-10 border-b border-zinc-800/60 pb-6 text-center">
        <span className="text-xs tracking-widest text-zinc-600">
          CHAPTER {chapterNumber}
        </span>
        <h2 className="mt-2 font-[var(--font-serif-kr)] text-2xl font-bold text-zinc-100">
          {title || `제${chapterNumber}화`}
        </h2>
      </header>

      {/* Novel body */}
      <div className="mb-8">
        {paragraphs.map((paragraph, i) => (
          <NovelParagraph key={i} text={paragraph} />
        ))}
        {isStreaming && <span className="cursor-blink" />}
      </div>

      {/* Word count footer */}
      {!isStreaming && content && (
        <footer className="border-t border-zinc-800/40 pt-4 text-center">
          <span className="text-xs text-zinc-600">
            {content.length.toLocaleString()}자
          </span>
        </footer>
      )}

      <div ref={bottomRef} />
    </article>
  );
}
