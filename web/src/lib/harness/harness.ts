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
import { checkPlausibility, fixPlausibilityIssues } from "../evaluators/plausibility";

// Full pipeline imports
import { runPlotPipeline } from "../agents/plot-pipeline";
import { generateSeedCandidates } from "../planning/seed-evolver";
import { evaluateCandidate } from "../evolution/candidate-evaluator";
import { crossoverSeeds } from "../evolution/seed-crossover";
import type { PlotOption } from "../schema/plot";

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
  | { type: "plausibility_check"; passed: boolean; issues: Array<{ severity: string; category: string; description: string; suggestion: string }> }
  | { type: "plausibility_fixed"; fixes: string[] }
  | { type: "error"; chapter: number; message: string }
  | { type: "done"; result: HarnessResult }
  // Full pipeline events
  | { type: "stage"; stage: "plots" | "seed" | "plausibility" | "master_plan" | "chapters" }
  | { type: "plots_generated"; plots: PlotOption[] }
  | { type: "plot_selected"; plot: PlotOption }
  | { type: "seed_generated"; seed: NovelSeed };

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
          const updatedRelationships = { ...state.relationships };
          const relUpdates = (change as Record<string, unknown>).relationship_updates as Record<string, string> | undefined;
          if (relUpdates) {
            for (const [key, val] of Object.entries(relUpdates)) {
              updatedRelationships[key] = val;
            }
          }
          const emotionalState = (change as Record<string, unknown>).emotional_state as string | undefined;
          const newLocation = (change as Record<string, unknown>).location as string | undefined;
          const newSecrets = (change as Record<string, unknown>).new_secrets as string[] | undefined;

          this.characterTracker.recordState({
            ...state,
            chapter: chapterNumber,
            growth_note: change.change,
            relationships: updatedRelationships,
            status: emotionalState && emotionalState !== "neutral" ? emotionalState : state.status,
            location: newLocation || state.location,
          });

          // Update seed character state
          const seedChar = seed.characters.find((c) => c.id === change.characterId);
          if (seedChar) {
            if (relUpdates) seedChar.state.relationships = { ...seedChar.state.relationships, ...relUpdates };
            if (newLocation) seedChar.state.location = newLocation;
            if (emotionalState) seedChar.state.status = emotionalState;
            if (newSecrets?.length) seedChar.state.secrets_known = [...(seedChar.state.secrets_known || []), ...newSecrets];
          }
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

    // Lazy planning (with fallback — planning failure shouldn't block generation)
    if (this.masterPlan) {
      const scheduler = new LazyScheduler(this.masterPlan);
      const needs = scheduler.getPlanningNeeds(chapterNumber);

      if (needs.needsL2 && needs.part) {
        try {
          const arcResult = await generateArcPlans(seed, needs.part);
          needs.part.arcs = arcResult.data;
          if (arcResult.newCharacters.length > 0) {
            seed.characters.push(...arcResult.newCharacters);
          }
          yield { type: "plan_generated", plan: this.masterPlan };
        } catch (err) {
          console.warn(`[harness] 아크 플래닝 실패, 블루프린트 없이 진행: ${err instanceof Error ? err.message : err}`);
        }
      }

      const arc = scheduler.getArcForChapter(chapterNumber);
      if (arc && scheduler.needsChapterBlueprint(chapterNumber)) {
        try {
          const bpResult = await generateChapterBlueprints(seed, arc, previousSummaries);
          arc.chapter_blueprints = bpResult.data;
        } catch (err) {
          console.warn(`[harness] 블루프린트 생성 실패, 없이 진행: ${err instanceof Error ? err.message : err}`);
        }
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
      fastMode: this.config.fastMode,
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

    // Plausibility check — catch logical holes before writing
    try {
      const plausibility = await checkPlausibility(seed);
      yield {
        type: "plausibility_check",
        passed: plausibility.passed,
        issues: plausibility.issues,
      };

      // Auto-fix critical issues
      if (!plausibility.passed) {
        const criticalIssues = plausibility.issues.filter((i) => i.severity === "critical");
        if (criticalIssues.length > 0) {
          const fixResult = await fixPlausibilityIssues(seed, criticalIssues);
          // Apply fixes to seed (logline update, etc.)
          if (fixResult.seed.logline !== seed.logline) {
            seed.logline = fixResult.seed.logline;
          }
          yield { type: "plausibility_fixed", fixes: fixResult.fixes };
        }
      }
    } catch (err) {
      console.warn(`[harness] 개연성 검증 실패, 건너뜀: ${err instanceof Error ? err.message : err}`);
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

  // -----------------------------------------------------------------------
  // Full pipeline: genre → plots → seed → plan → chapters
  // -----------------------------------------------------------------------

  /**
   * Run the complete novel generation pipeline from genre selection.
   *
   * @param genre - Genre string (e.g. "로맨스", "판타지")
   * @param plotIndex - Which plot to pick (0-based). If omitted, picks the first.
   * @param chapterRange - How many chapters to generate (default: 1-3)
   */
  async *runFullPipeline(
    genre: string,
    options?: {
      plotIndex?: number;
      startChapter?: number;
      endChapter?: number;
    },
  ): AsyncGenerator<HarnessEvent> {
    const startChapter = options?.startChapter ?? 1;
    const endChapter = options?.endChapter ?? 3;
    const plotIndex = options?.plotIndex ?? 0;

    // --- Stage 1: Plot generation ---
    yield { type: "stage", stage: "plots" };
    let plots: PlotOption[];
    try {
      const plotResult = await runPlotPipeline(genre);
      plots = plotResult.plots;
      yield { type: "plots_generated", plots };
    } catch (err) {
      yield { type: "error", chapter: 0, message: `플롯 생성 실패: ${err instanceof Error ? err.message : err}` };
      return;
    }

    if (plots.length === 0) {
      yield { type: "error", chapter: 0, message: "생성된 플롯이 없습니다" };
      return;
    }

    const selectedPlot = plots[Math.min(plotIndex, plots.length - 1)];
    yield { type: "plot_selected", plot: selectedPlot };

    // --- Stage 2: Seed generation ---
    yield { type: "stage", stage: "seed" };

    const archetypeInfo = selectedPlot.male_archetype || selectedPlot.female_archetype
      ? `\n남주 아키타입: ${selectedPlot.male_archetype || "미지정"}\n여주 아키타입: ${selectedPlot.female_archetype || "미지정"}`
      : "";

    const interviewResult = `장르: ${genre}

## 선택한 플롯
제목: ${selectedPlot.title}
로그라인: ${selectedPlot.logline}
훅: ${selectedPlot.hook}
전개:
${selectedPlot.arc_summary.map((a: string) => `- ${a}`).join("\n")}
핵심 반전: ${selectedPlot.key_twist}${archetypeInfo}`;

    let seed: NovelSeed;
    try {
      const { candidates, usage: genUsage } = await generateSeedCandidates(interviewResult);

      const scored = candidates.map((c) => ({
        candidate: c,
        score: evaluateCandidate(c.seed),
      }));
      scored.sort((a, b) => b.score.overall_score - a.score.overall_score);

      const best = scored[0];
      const secondBest = scored[1];

      if (secondBest) {
        const crossResult = await crossoverSeeds(best.candidate, best.score, secondBest.candidate, secondBest.score);
        seed = crossResult.seed;
      } else {
        seed = best.candidate.seed;
      }

      yield { type: "seed_generated", seed };
    } catch (err) {
      yield { type: "error", chapter: 0, message: `시드 생성 실패: ${err instanceof Error ? err.message : err}` };
      return;
    }

    // --- Stage 3+: Delegate to existing run() which handles plan + plausibility + chapters ---
    yield { type: "stage", stage: "chapters" };
    yield* this.run(seed, startChapter, endChapter);
  }
}
