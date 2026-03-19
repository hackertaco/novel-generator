import { NextRequest, NextResponse } from "next/server";
import type { PlotOption } from "@/lib/schema/plot";
import { generateSeedCandidates } from "@/lib/planning/seed-evolver";
import { evaluateCandidate } from "@/lib/evolution/candidate-evaluator";
import { crossoverSeeds } from "@/lib/evolution/seed-crossover";
import type { TokenUsage } from "@/lib/agents/types";

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

    const archetypeInfo = plot.male_archetype || plot.female_archetype
      ? `\n남주 아키타입: ${plot.male_archetype || "미지정"}\n여주 아키타입: ${plot.female_archetype || "미지정"}`
      : "";

    const interviewResult = `장르: ${genre}

## 선택한 플롯
제목: ${plot.title}
로그라인: ${plot.logline}
훅: ${plot.hook}
전개:
${plot.arc_summary.map((a) => `- ${a}`).join("\n")}
핵심 반전: ${plot.key_twist}${archetypeInfo}`;

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

    // ── Stage 3: Crossover (only if 2+ candidates) ─────────────────────────
    let seed;
    let crossoverUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 };

    if (secondBest) {
      const crossoverResult = await crossoverSeeds(
        best.candidate,
        best.score,
        secondBest.candidate,
        secondBest.score,
      );
      seed = crossoverResult.seed;
      crossoverUsage = crossoverResult.usage;
    } else {
      seed = best.candidate.seed;
    }

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
