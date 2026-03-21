import { NextRequest, NextResponse } from "next/server";
import type { NovelSeed } from "@/lib/schema/novel";
import type { MasterPlan } from "@/lib/schema/planning";
import { NovelHarness, getDefaultConfig } from "@/lib/harness";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { seed } = (await request.json()) as { seed: NovelSeed };
    if (!seed) {
      return NextResponse.json({ error: "시드가 필요합니다" }, { status: 400 });
    }

    const harness = new NovelHarness(getDefaultConfig());
    let masterPlan: MasterPlan | undefined;
    let plausibilityResult: { passed: boolean; issues: unknown[] } | undefined;

    for await (const event of harness.stepPlan(seed)) {
      if (event.type === "plan_generated") {
        masterPlan = event.plan;
      }
      if (event.type === "plausibility_check") {
        plausibilityResult = { passed: event.passed, issues: event.issues };
      }
    }

    if (!masterPlan) {
      return NextResponse.json({ error: "마스터 플랜 생성 실패" }, { status: 500 });
    }

    return NextResponse.json({
      masterPlan,
      plausibility: plausibilityResult,
    });
  } catch (err) {
    console.error("[plan/master] Error:", err);
    const message = err instanceof Error ? err.message : "마스터 플랜 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
