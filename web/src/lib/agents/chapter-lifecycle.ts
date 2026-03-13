import { extractSummaryRuleBased } from "@/lib/evaluators/summary";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterBlueprint } from "@/lib/schema/planning";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { ChapterContext, PipelineAgent } from "./pipeline";
import { WriterAgent } from "./writer-agent";
import { RuleGuardAgent } from "./rule-guard";
import { QualityLoop } from "./quality-loop";
import { PolisherAgent } from "./polisher-agent";

// Re-export LifecycleEvent from pipeline.ts for backward compatibility
export type { LifecycleEvent } from "./pipeline";

// --- Options ---

export interface ChapterLifecycleOptions {
  seed: NovelSeed;
  chapterNumber: number;
  previousSummaries: Array<{
    chapter: number;
    title: string;
    summary: string;
  }>;
  qualityThreshold?: number;
  maxAttempts?: number;
  useHybridEval?: boolean;
  blueprint?: ChapterBlueprint;
}

// --- Main lifecycle generator ---

export async function* runChapterLifecycle(
  options: ChapterLifecycleOptions,
): AsyncGenerator<import("./pipeline").LifecycleEvent> {
  const ctx: ChapterContext = {
    seed: options.seed,
    chapterNumber: options.chapterNumber,
    blueprint: options.blueprint,
    previousSummaries: options.previousSummaries,
    text: "",
    snapshots: [],
    bestScore: 0,
    ruleIssues: [],
    critiqueHistory: [],
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
  };

  const pipeline: PipelineAgent[] = [
    new WriterAgent(),
    new RuleGuardAgent(),
    new QualityLoop(),
    new PolisherAgent(),
  ];

  for (const agent of pipeline) {
    yield* agent.run(ctx);
  }

  // Extract summary
  yield { type: "stage_change", stage: "completing" };

  const outline = options.seed.chapter_outlines.find(
    (o) => o.chapter_number === options.chapterNumber,
  );
  const title = options.blueprint?.title || outline?.title || `${options.chapterNumber}화`;
  const summary = extractSummaryRuleBased(options.chapterNumber, title, ctx.text);
  summary.style_score = ctx.bestScore;

  yield { type: "complete", summary, final_score: ctx.bestScore };
  yield { type: "done" };
}
