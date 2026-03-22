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
import { ConstraintChecker } from "../evaluators/constraint-checker";

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

  // Staged state — persists across step-by-step calls
  private _plots?: PlotOption[];
  private _selectedPlot?: PlotOption;
  private _seed?: NovelSeed;

  // Tracking subsystems
  private memory?: HierarchicalMemory;
  private characterTracker?: CharacterTracker;
  private threadTracker?: ThreadTracker;
  private toneManager?: ToneManager;
  private progressMonitor?: ProgressMonitor;
  private feedbackAccumulator?: FeedbackAccumulator;
  private constraintChecker?: ConstraintChecker;
  private pendingCorrectionContext?: string;

  constructor(config?: Partial<HarnessConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  getConfig(): HarnessConfig {
    return this.config;
  }

  /** Get current staged state (for UI to read between steps) */
  getState() {
    return {
      plots: this._plots,
      selectedPlot: this._selectedPlot,
      seed: this._seed,
      masterPlan: this.masterPlan,
    };
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
    this.constraintChecker = new ConstraintChecker(seed);
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
      // Sanity check: reject suspicious state changes to prevent snowball errors
      const MAX_RELATIONSHIP_CHANGES_PER_CHAPTER = 5;
      const validChanges = chapterMemory.character_changes.filter((change) => {
        // Reject if too many relationship changes at once (likely hallucination)
        const relUpdates = (change as Record<string, unknown>).relationship_updates as Record<string, string> | undefined;
        if (relUpdates && Object.keys(relUpdates).length > MAX_RELATIONSHIP_CHANGES_PER_CHAPTER) {
          console.warn(`[harness] 트래커 sanity check: ${change.characterId}의 관계 변화 ${Object.keys(relUpdates).length}개 — 환각 가능성, 건너뜀`);
          return false;
        }
        // Reject if character ID doesn't exist in seed
        if (!seed.characters.some((c) => c.id === change.characterId)) {
          console.warn(`[harness] 트래커 sanity check: 알 수 없는 캐릭터 ${change.characterId} — 건너뜀`);
          return false;
        }
        return true;
      });

      for (const change of validChanges) {
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
    endingSceneState?: ChapterSummary["ending_scene_state"],
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
      // Force blueprint regeneration when we have ending scene state from previous chapter
      // This ensures the blueprint accounts for where the previous chapter actually ended
      const needsRegeneration = endingSceneState && chapterNumber > 1 && arc?.chapter_blueprints?.some(
        (bp) => bp.chapter_number === chapterNumber,
      );
      if (needsRegeneration && arc) {
        // Remove existing blueprint for this chapter so it gets regenerated with context
        arc.chapter_blueprints = arc.chapter_blueprints.filter(
          (bp) => bp.chapter_number !== chapterNumber,
        );
        console.log(`[harness] ${chapterNumber}화 블루프린트 재생성 (이전 화 장면 상태 반영)`);
      }
      if (arc && scheduler.needsChapterBlueprint(chapterNumber)) {
        try {
          const bpResult = await generateChapterBlueprints(seed, arc, previousSummaries, previousChapterEnding, endingSceneState);
          arc.chapter_blueprints = bpResult.data;
        } catch (err) {
          console.warn(`[harness] 블루프린트 생성 실패, 최소 블루프린트 생성: ${err instanceof Error ? err.message : err}`);

          // Generate a minimal blueprint from seed data so we don't fall back to
          // uncontrolled single-shot generation
          const outline = seed.chapter_outlines.find((o) => o.chapter_number === chapterNumber);
          const prevCharNames = previousChapterEnding
            ? seed.characters.filter((c) => previousChapterEnding.includes(c.name)).map((c) => c.id)
            : seed.characters.filter((c) => c.introduction_chapter <= chapterNumber).slice(0, 3).map((c) => c.id);

          arc.chapter_blueprints = [{
            chapter_number: chapterNumber,
            title: outline?.title || `${chapterNumber}화`,
            arc_id: arc.id,
            one_liner: outline?.one_liner || arc.summary,
            role_in_arc: chapterNumber <= arc.start_chapter + 2 ? "setup" : "rising_action",
            scenes: [
              {
                purpose: outline?.key_points?.[0] || `${chapterNumber}화 전개`,
                type: "dialogue" as const,
                characters: prevCharNames,
                estimated_chars: 1500,
                emotional_tone: outline?.tension_level && outline.tension_level > 6 ? "긴장" : "일상",
              },
              {
                purpose: outline?.key_points?.[1] || "후반 전개 + 후킹",
                type: "hook" as const,
                characters: prevCharNames,
                estimated_chars: 1500,
                emotional_tone: "긴장",
              },
            ],
            emotional_arc: "",
            key_points: outline?.key_points || [],
            characters_involved: prevCharNames,
            tension_level: outline?.tension_level || 5,
            target_word_count: 3000,
            foreshadowing_actions: [],
            dependencies: [],
          }];
        }
      }

      blueprint = scheduler.getBlueprint(chapterNumber);
    }

    // Enforce character continuity: first scene must only have characters
    // that were present in the previous chapter's ending
    if (blueprint && previousChapterEnding && blueprint.scenes.length > 0) {
      const prevCharNames = seed.characters
        .filter((c) => previousChapterEnding.includes(c.name))
        .map((c) => c.id);

      if (prevCharNames.length > 0) {
        const firstScene = blueprint.scenes[0];
        const removed = firstScene.characters.filter((id) => !prevCharNames.includes(id));
        if (removed.length > 0) {
          firstScene.characters = firstScene.characters.filter((id) => prevCharNames.includes(id));
          console.log(`[harness] 첫 씬 캐릭터 필터: ${removed.join(", ")} 제거 (이전 화에 없었음)`);
        }
      }
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
      parallelMode: this.config.parallelMode,
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
    const summary = extractSummaryRuleBased(chapterNumber, title, completedText, seed);
    summary.style_score = ctx.bestScore;

    // Post-chapter tracking
    await this.updateTracking(seed, chapterNumber, completedText, summary);

    // Validate character appearances against blueprint
    if (this.constraintChecker && blueprint) {
      const charViolations = this.constraintChecker.validateCharacterAppearances(
        completedText,
        chapterNumber,
        seed,
        blueprint.characters_involved,
      );
      for (const v of charViolations) {
        yield { type: "pipeline_event", chapter: chapterNumber, event: {
          type: "error",
          message: `[${v.type}] ${v.message}`,
        } };
      }
    }

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
    options?: {
      masterPlan?: MasterPlan;
      previousSummaries?: Array<{ chapter: number; title: string; summary: string }>;
      previousChapterEnding?: string;
    },
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

    // Plausibility check — only when generating a fresh plan (not on continuation)
    if (!options?.masterPlan) {
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
            if (fixResult.seed.logline !== seed.logline) {
              seed.logline = fixResult.seed.logline;
            }
            yield { type: "plausibility_fixed", fixes: fixResult.fixes };
          }
        }
      } catch (err) {
        console.warn(`[harness] 개연성 검증 실패, 건너뜀: ${err instanceof Error ? err.message : err}`);
      }
    }

    const chapters: ChapterResult[] = [];
    // Seed summaries from caller (for continuation from previous chapters)
    const summaries: Array<{ chapter: number; title: string; summary: string }> = [
      ...(options?.previousSummaries || []),
    ];
    let totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 };

    for (let ch = startChapter; ch <= endChapter; ch++) {
      // Budget check
      if (this.config.budgetUsd !== null && totalUsage.cost_usd >= this.config.budgetUsd) {
        yield { type: "error", chapter: ch, message: `예산 초과: $${totalUsage.cost_usd.toFixed(4)}` };
        break;
      }

      const previousEnding = chapters.length > 0
        ? chapters[chapters.length - 1].text.slice(-500)
        : options?.previousChapterEnding;

      // Pass structured scene state from the previous chapter for blueprint continuity
      const prevSceneState = chapters.length > 0
        ? chapters[chapters.length - 1].summary.ending_scene_state
        : undefined;

      try {
        for await (const event of this.generateChapter(seed, ch, summaries, previousEnding, prevSceneState)) {
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
  // Step-by-step API — user controls progression, harness manages quality
  // -----------------------------------------------------------------------

  /**
   * Step 1: Generate plot candidates.
   * Uses the harness model config for consistency.
   */
  async *stepPlots(genre: string): AsyncGenerator<HarnessEvent> {
    yield { type: "stage", stage: "plots" };
    try {
      const result = await runPlotPipeline(genre);
      this._plots = result.plots;
      yield { type: "plots_generated", plots: result.plots };
    } catch (err) {
      yield { type: "error", chapter: 0, message: `플롯 생성 실패: ${err instanceof Error ? err.message : err}` };
    }
  }

  /**
   * Step 2: Generate seed from selected plot.
   * Runs 3-temperature evolution + crossover + code-based evaluation.
   */
  async *stepSeed(genre: string, plot: PlotOption): AsyncGenerator<HarnessEvent> {
    yield { type: "stage", stage: "seed" };
    this._selectedPlot = plot;

    const archetypeInfo = plot.male_archetype || plot.female_archetype
      ? `\n남주 아키타입: ${plot.male_archetype || "미지정"}\n여주 아키타입: ${plot.female_archetype || "미지정"}`
      : "";

    const interviewResult = `장르: ${genre}

## 선택한 플롯
제목: ${plot.title}
로그라인: ${plot.logline}
훅: ${plot.hook}
전개:
${plot.arc_summary.map((a: string) => `- ${a}`).join("\n")}
핵심 반전: ${plot.key_twist}${archetypeInfo}`;

    try {
      const { candidates } = await generateSeedCandidates(interviewResult);

      const scored = candidates.map((c) => ({
        candidate: c,
        score: evaluateCandidate(c.seed),
      }));
      scored.sort((a, b) => b.score.overall_score - a.score.overall_score);

      const best = scored[0];
      const secondBest = scored[1];

      if (secondBest) {
        const crossResult = await crossoverSeeds(best.candidate, best.score, secondBest.candidate, secondBest.score);
        this._seed = crossResult.seed;
      } else {
        this._seed = best.candidate.seed;
      }

      yield { type: "seed_generated", seed: this._seed };
    } catch (err) {
      yield { type: "error", chapter: 0, message: `시드 생성 실패: ${err instanceof Error ? err.message : err}` };
    }
  }

  /**
   * Step 3: Generate master plan + plausibility check.
   * Can accept an externally modified seed (user may have edited it in UI).
   */
  async *stepPlan(seed?: NovelSeed): AsyncGenerator<HarnessEvent> {
    const s = seed || this._seed;
    if (!s) {
      yield { type: "error", chapter: 0, message: "시드가 없습니다. stepSeed를 먼저 호출하세요." };
      return;
    }
    this._seed = s; // Update with possibly user-edited seed

    yield { type: "stage", stage: "master_plan" };

    // Plausibility check
    try {
      const plausibility = await checkPlausibility(s);
      yield { type: "plausibility_check", passed: plausibility.passed, issues: plausibility.issues };

      if (!plausibility.passed) {
        const critical = plausibility.issues.filter((i) => i.severity === "critical");
        if (critical.length > 0) {
          const fixResult = await fixPlausibilityIssues(s, critical);
          if (fixResult.seed.logline !== s.logline) {
            s.logline = fixResult.seed.logline;
          }
          yield { type: "plausibility_fixed", fixes: fixResult.fixes };
        }
      }
    } catch (err) {
      console.warn(`[harness] 개연성 검증 실패, 건너뜀: ${err instanceof Error ? err.message : err}`);
    }

    // Master plan
    try {
      const planResult = await generateMasterPlan(s);
      this.masterPlan = planResult.data;
      yield { type: "plan_generated", plan: this.masterPlan };
    } catch (err) {
      yield { type: "error", chapter: 0, message: `마스터플랜 생성 실패: ${err instanceof Error ? err.message : err}` };
    }
  }

  /**
   * Step 4: Generate chapters.
   * Can accept externally provided seed/plan (user may have edited).
   * Delegates to existing run().
   */
  async *stepChapters(
    startChapter: number,
    endChapter: number,
    overrides?: { seed?: NovelSeed; masterPlan?: MasterPlan },
  ): AsyncGenerator<HarnessEvent> {
    const s = overrides?.seed || this._seed;
    const plan = overrides?.masterPlan || this.masterPlan;

    if (!s) {
      yield { type: "error", chapter: 0, message: "시드가 없습니다." };
      return;
    }

    yield { type: "stage", stage: "chapters" };
    yield* this.run(s, startChapter, endChapter, { masterPlan: plan });
  }

  // -----------------------------------------------------------------------
  // Full pipeline: genre → plots → seed → plan → chapters
  // -----------------------------------------------------------------------

  /**
   * Run the complete pipeline automatically (CLI/test use).
   * Reuses step methods internally.
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

    // Step 1: Plots
    yield* this.stepPlots(genre);
    if (!this._plots?.length) return;

    const selected = this._plots[Math.min(plotIndex, this._plots.length - 1)];
    yield { type: "plot_selected", plot: selected };

    // Step 2: Seed
    yield* this.stepSeed(genre, selected);
    if (!this._seed) return;

    // Step 3: Plan
    yield* this.stepPlan();
    if (!this.masterPlan) return;

    // Step 4: Chapters
    yield* this.stepChapters(startChapter, endChapter);
  }
}
