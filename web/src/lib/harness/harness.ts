/**
 * Novel generation harness.
 *
 * A configurable runner that executes the novel generation pipeline
 * with swappable agents, models, evaluators, and tracking systems.
 * Can run in server (streaming), CLI (file output), or silent mode.
 */

import type { NovelSeed } from "../schema/novel";
import type { ChapterSummary } from "../schema/chapter";
import type { MasterPlan, ChapterBlueprint } from "../schema/planning";
import type { ChapterContext, LifecycleEvent, PipelineAgent } from "../agents/pipeline";
import type { HarnessConfig } from "./config";
import type { TokenUsage } from "../agents/types";
import { getDefaultConfig } from "./config";
import { LazyScheduler } from "../planning/lazy-scheduler";
import { generateArcPlans } from "../planning/arc-planner";
import { generateChapterBlueprints } from "../planning/chapter-planner";
import { generateMasterPlan } from "../planning/master-planner";
import { extractSummaryRuleBased } from "../evaluators/summary";

// Tracking imports
import { HierarchicalMemory, summarizeChapter } from "../memory";
import {
  CharacterTracker,
  ThreadTracker,
  ToneManager,
  ProgressMonitor,
  extractThreads,
} from "../tracking";
import { FeedbackAccumulator, postProcessChapter } from "../feedback";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChapterResult {
  chapterNumber: number;
  text: string;
  summary: ChapterSummary;
  score: number;
  usage: TokenUsage;
  durationMs: number;
}

export interface HarnessResult {
  config: string;
  chapters: ChapterResult[];
  totalUsage: TokenUsage;
  totalDurationMs: number;
  totalCostUsd: number;
}

export type HarnessEvent =
  | { type: "chapter_start"; chapter: number }
  | { type: "chapter_complete"; result: ChapterResult }
  | { type: "pipeline_event"; chapter: number; event: LifecycleEvent }
  | { type: "plan_generated"; plan: MasterPlan }
  | { type: "error"; chapter: number; message: string }
  | { type: "done"; result: HarnessResult };

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export class NovelHarness {
  private config: HarnessConfig;
  private masterPlan?: MasterPlan;

  // Tracking subsystems
  private memory?: HierarchicalMemory;
  private characterTracker?: CharacterTracker;
  private threadTracker?: ThreadTracker;
  private toneManager?: ToneManager;
  private progressMonitor?: ProgressMonitor;
  private feedbackAccumulator?: FeedbackAccumulator;
  private pendingCorrectionContext?: string;

  constructor(config?: Partial<HarnessConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  getConfig(): HarnessConfig {
    return this.config;
  }

  // -----------------------------------------------------------------------
  // Tracking
  // -----------------------------------------------------------------------

  private initTracking(seed: NovelSeed): void {
    if (this.memory) return;
    const t = this.config.tracking;
    if (t.memory) this.memory = new HierarchicalMemory();
    if (t.characters) this.characterTracker = new CharacterTracker(seed);
    if (t.threads) this.threadTracker = new ThreadTracker();
    if (t.tone) this.toneManager = ToneManager.fromSeed(seed);
    if (t.progress) this.progressMonitor = new ProgressMonitor(seed);
    if (t.feedback) this.feedbackAccumulator = new FeedbackAccumulator();
  }

  private buildTrackingContext(seed: NovelSeed, chapterNumber: number) {
    const injection: Record<string, string> = {};

    if (this.memory && this.memory.size > 0) {
      const snapshot = this.memory.getSnapshot(chapterNumber, seed);
      injection.memoryContext = this.memory.formatForPrompt(snapshot);
    }
    if (this.toneManager) {
      const g = this.toneManager.formatToneGuidance(chapterNumber, seed);
      if (g) injection.toneGuidance = g;
    }
    if (this.progressMonitor) {
      const p = this.progressMonitor.formatProgressContext(chapterNumber, seed);
      if (p) injection.progressContext = p;
    }
    if (this.pendingCorrectionContext) {
      injection.correctionContext = this.pendingCorrectionContext;
    }
    if (this.threadTracker) {
      const urgent = this.threadTracker.getUrgentThreads(chapterNumber);
      const suggested = this.threadTracker.getSuggestedThreads(chapterNumber);
      const all = [...urgent, ...suggested];
      if (all.length > 0) {
        const lines = all.map((t) => {
          const u = urgent.includes(t) ? "[긴급]" : "[권장]";
          return `${u} ${t.content} (${t.type}, ${t.planted_chapter}화에서 시작)`;
        });
        const section = `## 서사 스레드 리마인더\n${lines.join("\n")}`;
        injection.correctionContext = injection.correctionContext
          ? `${injection.correctionContext}\n\n${section}`
          : section;
      }
    }

    return Object.keys(injection).length > 0 ? injection : undefined;
  }

  private async updateTracking(
    seed: NovelSeed,
    chapterNumber: number,
    text: string,
    summary: ChapterSummary,
  ): Promise<void> {
    if (!this.memory) return;

    const chapterMemory = await summarizeChapter(text, chapterNumber, seed);
    this.memory.addChapter(chapterMemory);

    if (this.characterTracker && chapterMemory.character_changes.length > 0) {
      for (const change of chapterMemory.character_changes) {
        const state = this.characterTracker.getCurrentState(change.characterId);
        if (state) {
          this.characterTracker.recordState({
            ...state,
            chapter: chapterNumber,
            growth_note: change.change,
          });
        }
      }
    }

    if (this.threadTracker) {
      const existing = this.threadTracker.getOpenThreads();
      const result = await extractThreads(text, chapterNumber, existing);
      for (const t of result.newThreads) this.threadTracker.addThread(t);
      for (const id of result.progressedThreadIds)
        this.threadTracker.updateThread(id, chapterNumber, "progressing");
      for (const id of result.resolvedThreadIds)
        this.threadTracker.updateThread(id, chapterNumber, "resolved");
    }

    if (this.progressMonitor) {
      this.progressMonitor.recordChapter(chapterNumber, chapterMemory.key_events, seed);
    }

    const postResult = await postProcessChapter({
      chapterNumber,
      chapterText: text,
      seed,
      accumulator: this.feedbackAccumulator,
      characterTracker: this.characterTracker,
    });
    this.pendingCorrectionContext = postResult.nextChapterContext || undefined;

    if (postResult.correctionPlan.actions.length > 0 && this.feedbackAccumulator) {
      this.feedbackAccumulator.applyCorrections(postResult.correctionPlan);
    }
  }

  // -----------------------------------------------------------------------
  // Pipeline execution
  // -----------------------------------------------------------------------

  private buildPipeline(): PipelineAgent[] {
    return this.config.pipeline
      .filter((step) => step.enabled)
      .map((step) => step.create());
  }

  private async *runPipeline(
    ctx: ChapterContext,
  ): AsyncGenerator<LifecycleEvent> {
    const agents = this.buildPipeline();
    for (const agent of agents) {
      yield* agent.run(ctx);
    }
  }

  // -----------------------------------------------------------------------
  // Chapter generation
  // -----------------------------------------------------------------------

  private async *generateChapter(
    seed: NovelSeed,
    chapterNumber: number,
    previousSummaries: Array<{ chapter: number; title: string; summary: string }>,
    previousChapterEnding?: string,
  ): AsyncGenerator<HarnessEvent> {
    yield { type: "chapter_start", chapter: chapterNumber };

    const startTime = Date.now();
    let blueprint: ChapterBlueprint | undefined;

    // Lazy planning
    if (this.masterPlan) {
      const scheduler = new LazyScheduler(this.masterPlan);
      const needs = scheduler.getPlanningNeeds(chapterNumber);

      if (needs.needsL2 && needs.part) {
        const arcResult = await generateArcPlans(seed, needs.part);
        needs.part.arcs = arcResult.data;
        if (arcResult.newCharacters.length > 0) {
          seed.characters.push(...arcResult.newCharacters);
        }
        yield { type: "plan_generated", plan: this.masterPlan };
      }

      const arc = scheduler.getArcForChapter(chapterNumber);
      if (arc && scheduler.needsChapterBlueprint(chapterNumber)) {
        const bpResult = await generateChapterBlueprints(seed, arc, previousSummaries);
        arc.chapter_blueprints = bpResult.data;
      }

      blueprint = scheduler.getBlueprint(chapterNumber);
    }

    // Build tracking context
    const trackingContext = this.buildTrackingContext(seed, chapterNumber);

    // Build chapter context
    const ctx: ChapterContext = {
      seed,
      chapterNumber,
      blueprint,
      previousSummaries,
      text: "",
      snapshots: [],
      bestScore: 0,
      ruleIssues: [],
      critiqueHistory: [],
      totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
      trackingContext,
      previousChapterEnding,
    };

    // Run pipeline
    let completedText = "";
    for await (const event of this.runPipeline(ctx)) {
      yield { type: "pipeline_event", chapter: chapterNumber, event };
      if (event.type === "replace_text") {
        completedText = event.content;
      }
    }

    completedText = completedText || ctx.text;

    // Extract summary
    const outline = seed.chapter_outlines.find((o) => o.chapter_number === chapterNumber);
    const title = blueprint?.title || outline?.title || `${chapterNumber}화`;
    const summary = extractSummaryRuleBased(chapterNumber, title, completedText);
    summary.style_score = ctx.bestScore;

    // Post-chapter tracking
    await this.updateTracking(seed, chapterNumber, completedText, summary);

    const result: ChapterResult = {
      chapterNumber,
      text: completedText,
      summary,
      score: ctx.bestScore,
      usage: ctx.totalUsage,
      durationMs: Date.now() - startTime,
    };

    yield { type: "chapter_complete", result };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate chapters from startChapter to endChapter.
   * Yields events for progress tracking.
   */
  async *run(
    seed: NovelSeed,
    startChapter: number,
    endChapter: number,
    options?: { masterPlan?: MasterPlan },
  ): AsyncGenerator<HarnessEvent> {
    const totalStart = Date.now();
    this.initTracking(seed);

    // Generate or use provided master plan
    if (options?.masterPlan) {
      this.masterPlan = options.masterPlan;
    } else {
      const planResult = await generateMasterPlan(seed);
      this.masterPlan = planResult.data;
      yield { type: "plan_generated", plan: this.masterPlan };
    }

    const chapters: ChapterResult[] = [];
    const summaries: Array<{ chapter: number; title: string; summary: string }> = [];
    let totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 };

    for (let ch = startChapter; ch <= endChapter; ch++) {
      // Budget check
      if (this.config.budgetUsd !== null && totalUsage.cost_usd >= this.config.budgetUsd) {
        yield { type: "error", chapter: ch, message: `예산 초과: $${totalUsage.cost_usd.toFixed(4)}` };
        break;
      }

      const previousEnding = chapters.length > 0
        ? chapters[chapters.length - 1].text.slice(-500)
        : undefined;

      try {
        for await (const event of this.generateChapter(seed, ch, summaries, previousEnding)) {
          yield event;
          if (event.type === "chapter_complete") {
            chapters.push(event.result);
            summaries.push({
              chapter: ch,
              title: event.result.summary.title,
              summary: event.result.summary.plot_summary,
            });
            totalUsage = {
              prompt_tokens: totalUsage.prompt_tokens + event.result.usage.prompt_tokens,
              completion_tokens: totalUsage.completion_tokens + event.result.usage.completion_tokens,
              total_tokens: totalUsage.total_tokens + event.result.usage.total_tokens,
              cost_usd: totalUsage.cost_usd + event.result.usage.cost_usd,
            };
          }
        }
      } catch (err) {
        yield {
          type: "error",
          chapter: ch,
          message: err instanceof Error ? err.message : "생성 실패",
        };
      }
    }

    yield {
      type: "done",
      result: {
        config: this.config.name,
        chapters,
        totalUsage,
        totalDurationMs: Date.now() - totalStart,
        totalCostUsd: totalUsage.cost_usd,
      },
    };
  }
}
