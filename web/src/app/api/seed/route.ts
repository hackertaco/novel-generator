import { NextRequest, NextResponse } from "next/server";
import type { PlotOption } from "@/lib/schema/plot";
import { generateSeedCandidates } from "@/lib/planning/seed-evolver";
import { evaluateCandidate } from "@/lib/evolution/candidate-evaluator";
import { crossoverSeeds } from "@/lib/evolution/seed-crossover";
import type { TokenUsage } from "@/lib/agents/types";

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

    const interviewResult = `장르: ${genre}

## 선택한 플롯
제목: ${plot.title}
로그라인: ${plot.logline}
훅: ${plot.hook}
전개:
${plot.arc_summary.map((a) => `- ${a}`).join("\n")}
핵심 반전: ${plot.key_twist}`;

    // ── Stage 1: Generate 3 candidates (temperatures 0.7, 0.9, 1.1) ──────────
    const { candidates, usage: generationUsage } =
      await generateSeedCandidates(interviewResult);

    // ── Stage 2: Evaluate all candidates with code-based rules (no LLM) ──────
    const scored = candidates.map((candidate) => ({
      candidate,
      score: evaluateCandidate(candidate.seed),
    }));

    // Sort descending by overall_score; stable sort preserves temperature order
    // for equal scores so the most conservative candidate wins ties.
    scored.sort((a, b) => b.score.overall_score - a.score.overall_score);

    const best = scored[0];
    const secondBest = scored[1];

    // ── Stage 3: Crossover — 1 LLM call merging best + second-best ───────────
    const { seed, usage: crossoverUsage } = await crossoverSeeds(
      best.candidate,
      best.score,
      secondBest.candidate,
      secondBest.score,
    );

    // Aggregate total usage (3 generation calls + 1 crossover call = 4 total)
    const usage: TokenUsage = {
      prompt_tokens:
        generationUsage.prompt_tokens + crossoverUsage.prompt_tokens,
      completion_tokens:
        generationUsage.completion_tokens + crossoverUsage.completion_tokens,
      total_tokens:
        generationUsage.total_tokens + crossoverUsage.total_tokens,
      cost_usd: generationUsage.cost_usd + crossoverUsage.cost_usd,
    };

    return NextResponse.json({ seed, candidates, usage });
  } catch (err) {
    console.error("[seed] Error:", err);
    const message = err instanceof Error ? err.message : "시드 생성 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
