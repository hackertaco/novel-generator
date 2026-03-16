import type { PlotOption } from "@/lib/schema/plot";
import type { TokenUsage } from "@/lib/agents/types";
import { detectGenre } from "@/lib/prompts/genre-prompts";
import { PlotWriter } from "./plot-writer";
import { PlotCritic } from "./plot-critic";
import { PlotPolisher } from "./plot-polisher";
import type { PlotContext, PlotPipelineAgent } from "./plot-writer";

// Re-export types for convenience
export type { PlotContext, PlotPipelineAgent } from "./plot-writer";

export interface PlotPipelineResult {
  plots: PlotOption[];
  usage: TokenUsage;
}

/**
 * Create an empty PlotContext with zero usage.
 */
export function createPlotContext(genre: string): PlotContext {
  return {
    genre,
    detectedGenre: detectGenre(genre),
    plots: [],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
    },
  };
}

/**
 * Run the plot generation pipeline: PlotWriter → PlotCritic → PlotPolisher.
 * Each agent transforms the PlotContext sequentially.
 */
export async function runPlotPipeline(genre: string): Promise<PlotPipelineResult> {
  const ctx = createPlotContext(genre);

  const pipeline: PlotPipelineAgent[] = [
    new PlotWriter(),
    new PlotCritic(),
    new PlotPolisher(),
  ];

  for (const agent of pipeline) {
    await agent.run(ctx);
  }

  return {
    plots: ctx.plots,
    usage: ctx.usage,
  };
}
