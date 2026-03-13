import { NextRequest, NextResponse } from "next/server";
import { evaluateStyle } from "@/lib/evaluators/style";
import { evaluateConsistency } from "@/lib/evaluators/consistency";
import type { NovelSeed, StyleGuide } from "@/lib/schema/novel";

export async function POST(request: NextRequest) {
  try {
    const { content, seed, chapterNumber } = (await request.json()) as {
      content: string;
      seed: NovelSeed;
      chapterNumber: number;
    };

    if (!content || !seed) {
      return NextResponse.json(
        { error: "내용과 시드가 필요합니다" },
        { status: 400 },
      );
    }

    const styleGuide: StyleGuide = seed.style;
    const styleResult = evaluateStyle(content, styleGuide);
    const consistencyResult = evaluateConsistency(seed, chapterNumber, content);

    return NextResponse.json({
      style: styleResult,
      consistency: consistencyResult,
      overall_score:
        styleResult.overall_score * 0.5 +
        (consistencyResult.character_voice.score +
          consistencyResult.foreshadowing.score +
          consistencyResult.continuity.score) /
          3 *
          0.5,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "평가 실패" },
      { status: 500 },
    );
  }
}
