import type { PlotOption } from "@/lib/schema/plot";
import { PlotOptionArraySchema } from "@/lib/schema/plot";
import type { TokenUsage } from "@/lib/agents/types";
import { detectGenre } from "@/lib/prompts/genre-prompts";
import { PlotWriter, isRomanceGenre } from "./plot-writer";
import { PlotDebate } from "./plot-debate";
import { PlotPolisher } from "./plot-polisher";
import { getAgent } from "./llm-agent";
import { validatePlots, buildRepairPrompt } from "./plot-validator";
import type { PlotContext, PlotPipelineAgent } from "./plot-writer";

// Re-export types for convenience
export type { PlotContext, PlotPipelineAgent } from "./plot-writer";

export interface PlotPipelineResult {
  plots: PlotOption[];
  usage: TokenUsage;
  /** Validation issues found (empty if all passed) */
  validationIssues?: string[];
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

function addUsage(ctx: PlotContext, usage: TokenUsage): void {
  ctx.usage = {
    prompt_tokens: ctx.usage.prompt_tokens + usage.prompt_tokens,
    completion_tokens: ctx.usage.completion_tokens + usage.completion_tokens,
    total_tokens: ctx.usage.total_tokens + usage.total_tokens,
    cost_usd: ctx.usage.cost_usd + usage.cost_usd,
  };
}

/**
 * Run the plot generation pipeline: PlotWriter → PlotCritic → PlotPolisher → Validate.
 *
 * After the 3-agent LLM pipeline, a code-based validator checks quality.
 * Auto-fixable issues (archetype labels) are corrected in-place.
 * Remaining issues trigger one focused LLM repair call.
 */
export async function runPlotPipeline(genre: string): Promise<PlotPipelineResult> {
  const ctx = createPlotContext(genre);
  const romance = isRomanceGenre(genre);

  // Stage 1: LLM pipeline (Writer → Debate → Polisher)
  const pipeline: PlotPipelineAgent[] = [
    new PlotWriter(),
    new PlotDebate(),
    new PlotPolisher(),
  ];

  for (const agent of pipeline) {
    await agent.run(ctx);
  }

  // Stage 2: Code-based validation + auto-fix
  const validation = validatePlots(ctx.plots, romance);
  ctx.plots = validation.plots; // Apply auto-fixes (archetype labels, etc.)

  // Stage 3: If non-auto-fixable issues remain, do one focused repair call
  if (!validation.passed && validation.regenerationNeeded.length > 0) {
    const repairPrompt = buildRepairPrompt(ctx.plots, validation.regenerationNeeded, romance);
    const agent = getAgent();
    const result = await agent.callStructured({
      prompt: repairPrompt,
      system: "당신은 웹소설 플롯 편집자입니다. 검증 피드백을 반영하여 플롯을 수정하세요. 수정이 필요 없는 플롯은 그대로 유지하세요.",
      temperature: 0.5,
      maxTokens: 4096,
      schema: PlotOptionArraySchema,
      format: "json",
      taskId: "plot-repair",
    });

    ctx.plots = result.data;
    addUsage(ctx, result.usage);

    // Re-validate after repair (auto-fix only, no more LLM calls)
    const revalidation = validatePlots(ctx.plots, romance);
    ctx.plots = revalidation.plots;

    return {
      plots: ctx.plots,
      usage: ctx.usage,
      validationIssues: revalidation.regenerationNeeded.map((i) => `[${i.plotId}/${i.field}] ${i.issue}`),
    };
  }

  return {
    plots: ctx.plots,
    usage: ctx.usage,
  };
}
