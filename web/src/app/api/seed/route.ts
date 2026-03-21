import { NextRequest, NextResponse } from "next/server";
import type { PlotOption } from "@/lib/schema/plot";
import type { NovelSeed } from "@/lib/schema/novel";
import { NovelHarness, getDefaultConfig } from "@/lib/harness";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { genre, plot } = (await request.json()) as {
      genre: string;
      plot: PlotOption;
    };

    if (!genre || !plot) {
      return NextResponse.json(
        { error: "장르와 플롯이 필요합니다" },
        { status: 400 },
      );
    }

    const harness = new NovelHarness(getDefaultConfig());
    let seed: NovelSeed | undefined;

    for await (const event of harness.stepSeed(genre, plot)) {
      if (event.type === "seed_generated") {
        seed = event.seed;
      }
    }

    if (!seed) {
      return NextResponse.json({ error: "시드 생성 실패" }, { status: 500 });
    }

    return NextResponse.json({ seed });
  } catch (err) {
    console.error("[seed] Error:", err);
    const message = err instanceof Error ? err.message : "시드 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
