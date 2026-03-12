import { getAgent } from "./llm-agent";
import type { TokenTracker } from "./token-tracker";
import {
  runChapterLifecycle,
  type LifecycleEvent,
} from "./chapter-lifecycle";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { MasterPlan, ChapterBlueprint } from "@/lib/schema/planning";
import { LazyScheduler } from "@/lib/planning/lazy-scheduler";
import { generateArcPlans } from "@/lib/planning/arc-planner";
import { generateChapterBlueprints } from "@/lib/planning/chapter-planner";

// --- Pipeline stages ---

export type PipelineStage =
  | "idle"
  | "generating_plots"
  | "awaiting_plot_selection"
  | "generating_seed"
  | "planning_arcs"
  | "planning_chapters"
  | "generating_chapter"
  | "evaluating"
  | "improving"
  | "chapter_complete";

// --- Events ---

export type OrchestratorEvent =
  | { type: "pipeline_stage"; stage: PipelineStage }
  | {
      type: "budget";
      total_tokens: number;
      total_cost_usd: number;
      budget_remaining_usd: number | null;
    }
  | { type: "plan_update"; plan: MasterPlan }
  | LifecycleEvent;

// --- Options ---

export interface OrchestratorOptions {
  budgetUsd?: number;
  qualityThreshold?: number;
  maxAttemptsPerChapter?: number;
  masterPlan?: MasterPlan;
  onPlanUpdate?: (plan: MasterPlan) => void;
}

// --- Orchestrator ---

export class Orchestrator {
  private stage: PipelineStage = "idle";
  private tracker: TokenTracker;
  private options: OrchestratorOptions;

  constructor(options?: OrchestratorOptions) {
    this.options = options || {};
    this.tracker = getAgent(options?.budgetUsd).getTracker();
  }

  getStage(): PipelineStage {
    return this.stage;
  }

  getBudgetSnapshot(): {
    total_tokens: number;
    total_cost_usd: number;
    budget_remaining_usd: number | null;
  } {
    const snapshot = this.tracker.getSnapshot();
    return {
      total_tokens: snapshot.total_tokens,
      total_cost_usd: snapshot.total_cost_usd,
      budget_remaining_usd:
        this.options.budgetUsd != null
          ? this.options.budgetUsd - snapshot.total_cost_usd
          : null,
    };
  }

  /** Generate a single chapter through the full lifecycle */
  async *generateChapter(
    seed: NovelSeed,
    chapterNumber: number,
    previousSummaries: Array<{
      chapter: number;
      title: string;
      summary: string;
    }>,
  ): AsyncGenerator<OrchestratorEvent> {
    let blueprint: ChapterBlueprint | undefined;

    // Lazy planning: generate arcs/blueprints if needed
    if (this.options.masterPlan) {
      const scheduler = new LazyScheduler(this.options.masterPlan);
      const needs = scheduler.getPlanningNeeds(chapterNumber);

      if (needs.needsL2 && needs.part) {
        this.stage = "planning_arcs";
        yield { type: "pipeline_stage", stage: this.stage };

        const arcResult = await generateArcPlans(seed, needs.part);
        needs.part.arcs = arcResult.data;
        this.options.onPlanUpdate?.(this.options.masterPlan);
        yield { type: "plan_update", plan: this.options.masterPlan };

        yield { type: "usage", ...arcResult.usage };
        yield { type: "budget", ...this.getBudgetSnapshot() };
      }

      // Re-check after L2
      const arc = scheduler.getArcForChapter(chapterNumber);
      if (arc && scheduler.needsChapterBlueprint(chapterNumber)) {
        this.stage = "planning_chapters";
        yield { type: "pipeline_stage", stage: this.stage };

        const bpResult = await generateChapterBlueprints(seed, arc, previousSummaries);
        arc.chapter_blueprints = bpResult.data;
        this.options.onPlanUpdate?.(this.options.masterPlan);
        yield { type: "plan_update", plan: this.options.masterPlan };

        yield { type: "usage", ...bpResult.usage };
        yield { type: "budget", ...this.getBudgetSnapshot() };
      }

      blueprint = scheduler.getBlueprint(chapterNumber);
    }

    this.stage = "generating_chapter";
    yield { type: "pipeline_stage", stage: this.stage };

    const lifecycle = runChapterLifecycle({
      seed,
      chapterNumber,
      previousSummaries,
      qualityThreshold: this.options.qualityThreshold,
      maxAttempts: this.options.maxAttemptsPerChapter,
      blueprint,
    });

    for await (const event of lifecycle) {
      if (event.type === "stage_change") {
        if (event.stage === "evaluating") this.stage = "evaluating";
        else if (event.stage === "improving") this.stage = "improving";
      }
      yield event;
      if (event.type === "usage") {
        yield { type: "budget", ...this.getBudgetSnapshot() };
      }
    }

    this.stage = "chapter_complete";
    yield { type: "pipeline_stage", stage: this.stage };
  }

  /** Generate a batch of chapters sequentially */
  async *generateBatch(
    seed: NovelSeed,
    startChapter: number,
    endChapter: number,
    previousSummaries: Array<{
      chapter: number;
      title: string;
      summary: string;
    }>,
  ): AsyncGenerator<OrchestratorEvent & { chapterNumber?: number }> {
    const summaries = [...previousSummaries];

    for (let ch = startChapter; ch <= endChapter; ch++) {
      // Budget check before each chapter
      const budget = this.getBudgetSnapshot();
      if (
        budget.budget_remaining_usd !== null &&
        budget.budget_remaining_usd < 0.01
      ) {
        yield {
          type: "error" as const,
          message: `예산 초과: $${budget.total_cost_usd.toFixed(4)} 사용 (한도: $${this.options.budgetUsd})`,
        };
        break;
      }

      for await (const event of this.generateChapter(seed, ch, summaries)) {
        yield { ...event, chapterNumber: ch };

        // Collect summary for next chapter's context
        if (event.type === "complete") {
          summaries.push({
            chapter: ch,
            title: event.summary.title,
            summary: event.summary.plot_summary,
          });
        }
      }
    }

    this.stage = "idle";
    yield { type: "pipeline_stage", stage: "idle" };
  }
}
