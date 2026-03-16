import { NextRequest, NextResponse } from "next/server";
import { evolveBlueprintCandidates } from "@/lib/planning/blueprint-evolver";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ArcPlan } from "@/lib/schema/planning";

export async function POST(request: NextRequest) {
  try {
    const { seed, arc, previousChapterSummaries } = (await request.json()) as {
      seed: NovelSeed;
      arc: ArcPlan;
      previousChapterSummaries: Array<{ chapter: number; title: string; summary: string }>;
    };
    if (!seed || !arc) {
      return NextResponse.json({ error: "시드와 아크 정보가 필요합니다" }, { status: 400 });
    }

    const result = await evolveBlueprintCandidates(seed, arc, previousChapterSummaries || []);
    return NextResponse.json({ blueprints: result.blueprints, usage: result.usage });
  } catch (err) {
    console.error("[plan/chapters] Error:", err);
    const message = err instanceof Error ? err.message : "챕터 블루프린트 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
