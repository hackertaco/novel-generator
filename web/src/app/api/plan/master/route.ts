import { NextRequest, NextResponse } from "next/server";
import { generateMasterPlan } from "@/lib/planning/master-planner";
import type { NovelSeed } from "@/lib/schema/novel";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { seed } = (await request.json()) as { seed: NovelSeed };
    if (!seed) {
      return NextResponse.json({ error: "시드가 필요합니다" }, { status: 400 });
    }

    const result = await generateMasterPlan(seed);
    return NextResponse.json({ masterPlan: result.data, usage: result.usage });
  } catch (err) {
    console.error("[plan/master] Error:", err);
    const message = err instanceof Error ? err.message : "마스터 플랜 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
