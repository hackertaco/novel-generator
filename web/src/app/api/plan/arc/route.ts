import { NextRequest, NextResponse } from "next/server";
import { generateArcPlans } from "@/lib/planning/arc-planner";
import type { NovelSeed } from "@/lib/schema/novel";
import type { PartPlan } from "@/lib/schema/planning";

export async function POST(request: NextRequest) {
  try {
    const { seed, part, previousPartSummary } = (await request.json()) as {
      seed: NovelSeed;
      part: PartPlan;
      previousPartSummary?: string;
    };
    if (!seed || !part) {
      return NextResponse.json({ error: "시드와 대막 정보가 필요합니다" }, { status: 400 });
    }

    const result = await generateArcPlans(seed, part, previousPartSummary);
    return NextResponse.json({ arcs: result.data, usage: result.usage });
  } catch (err) {
    console.error("[plan/arc] Error:", err);
    const message = err instanceof Error ? err.message : "아크 플랜 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
