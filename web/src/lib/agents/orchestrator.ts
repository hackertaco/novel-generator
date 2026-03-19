import { getAgent } from "./llm-agent";
import type { TokenTracker } from "./token-tracker";
import {
  runChapterLifecycle,
  type LifecycleEvent,
} from "./chapter-lifecycle";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { MasterPlan, ChapterBlueprint } from "@/lib/schema/planning";
import type { TrackingInjection } from "./pipeline";
import { LazyScheduler } from "@/lib/planning/lazy-scheduler";
import { generateArcPlans } from "@/lib/planning/arc-planner";
import { generateChapterBlueprints } from "@/lib/planning/chapter-planner";

// --- Tracking/Memory/Feedback imports ---
import { HierarchicalMemory } from "@/lib/memory";
import { summarizeChapter } from "@/lib/memory";
import {
  CharacterTracker,
  ThreadTracker,
  ToneManager,
  ProgressMonitor,
  extractThreads,
} from "@/lib/tracking";
import { FeedbackAccumulator, postProcessChapter } from "@/lib/feedback";

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
  /** Enable tracking systems for multi-chapter generation */
  enableTracking?: boolean;
}

// --- Orchestrator ---

export class Orchestrator {
  private stage: PipelineStage = "idle";
  private tracker: TokenTracker;
  private options: OrchestratorOptions;

  // --- Tracking subsystems (lazily initialized) ---
  private memory?: HierarchicalMemory;
  private characterTracker?: CharacterTracker;
  private threadTracker?: ThreadTracker;
  private toneManager?: ToneManager;
  private progressMonitor?: ProgressMonitor;
  private feedbackAccumulator?: FeedbackAccumulator;

  /** Correction context carried over from post-processing of the previous chapter */
  private pendingCorrectionContext?: string;

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

  // -----------------------------------------------------------------------
  // Tracking initialization (lazy — requires seed)
  // -----------------------------------------------------------------------

  private initTracking(seed: NovelSeed): void {
    if (this.memory) return; // already initialized
    this.memory = new HierarchicalMemory();
    this.characterTracker = new CharacterTracker(seed);
    this.threadTracker = new ThreadTracker();
    this.toneManager = ToneManager.fromSeed(seed);
    this.progressMonitor = new ProgressMonitor(seed);
    this.feedbackAccumulator = new FeedbackAccumulator();
  }

  /** Whether tracking is currently active. */
  private get trackingEnabled(): boolean {
    return this.memory != null;
  }

  // -----------------------------------------------------------------------
  // Build tracking context for a chapter
  // -----------------------------------------------------------------------

  private buildTrackingContext(
    seed: NovelSeed,
    chapterNumber: number,
  ): TrackingInjection | undefined {
    if (!this.trackingEnabled) return undefined;

    const injection: TrackingInjection = {};

    // Hierarchical memory snapshot
    if (this.memory!.size > 0) {
      const snapshot = this.memory!.getSnapshot(chapterNumber, seed);
      injection.memoryContext = this.memory!.formatForPrompt(snapshot);
    }

    // Tone guidance
    if (this.toneManager) {
      const toneGuidance = this.toneManager.formatToneGuidance(chapterNumber, seed);
      if (toneGuidance) injection.toneGuidance = toneGuidance;
    }

    // Progress / pacing context
    if (this.progressMonitor) {
      const progressContext = this.progressMonitor.formatProgressContext(chapterNumber, seed);
      if (progressContext) injection.progressContext = progressContext;
    }

    // Correction context from previous chapter's post-processing
    if (this.pendingCorrectionContext) {
      injection.correctionContext = this.pendingCorrectionContext;
    }

    // Thread reminders (urgent + suggested)
    if (this.threadTracker) {
      const urgent = this.threadTracker.getUrgentThreads(chapterNumber);
      const suggested = this.threadTracker.getSuggestedThreads(chapterNumber);
      const allThreads = [...urgent, ...suggested];
      if (allThreads.length > 0) {
        const threadLines = allThreads.map((t) => {
          const urgency = urgent.includes(t) ? "[긴급]" : "[권장]";
          return `${urgency} ${t.content} (${t.type}, ${t.planted_chapter}화에서 시작)`;
        });
        const threadSection = `## 서사 스레드 리마인더\n${threadLines.join("\n")}`;
        // Append to correction context or set as new
        injection.correctionContext = injection.correctionContext
          ? `${injection.correctionContext}\n\n${threadSection}`
          : threadSection;
      }
    }

    // Return undefined if nothing was populated
    const hasContent = injection.memoryContext || injection.toneGuidance
      || injection.progressContext || injection.correctionContext;
    return hasContent ? injection : undefined;
  }

  // -----------------------------------------------------------------------
  // Post-chapter tracking updates
  // -----------------------------------------------------------------------

  private async *runPostChapterTracking(
    seed: NovelSeed,
    chapterNumber: number,
    chapterText: string,
    summary: ChapterSummary,
  ): AsyncGenerator<OrchestratorEvent> {
    if (!this.trackingEnabled) return;

    // 1. Summarize chapter for hierarchical memory (LLM call)
    const chapterMemory = await summarizeChapter(chapterText, chapterNumber, seed);
    this.memory!.addChapter(chapterMemory);

    // 2. Update character tracker with rich state changes
    if (this.characterTracker && chapterMemory.character_changes.length > 0) {
      for (const change of chapterMemory.character_changes) {
        const currentState = this.characterTracker.getCurrentState(change.characterId);
        if (currentState) {
          // Merge relationship updates
          const updatedRelationships = { ...currentState.relationships };
          const relUpdates = (change as Record<string, unknown>).relationship_updates as Record<string, string> | undefined;
          if (relUpdates) {
            for (const [key, val] of Object.entries(relUpdates)) {
              updatedRelationships[key] = val;
            }
          }

          // Extract new fields
          const emotionalState = (change as Record<string, unknown>).emotional_state as string | undefined;
          const newLocation = (change as Record<string, unknown>).location as string | undefined;
          const newSecrets = (change as Record<string, unknown>).new_secrets as string[] | undefined;

          // Build status string from emotional state
          const status = emotionalState && emotionalState !== "neutral"
            ? emotionalState
            : currentState.status;

          this.characterTracker.recordState({
            ...currentState,
            chapter: chapterNumber,
            growth_note: change.change,
            relationships: updatedRelationships,
            status,
            location: newLocation || currentState.location,
          });

          // Also update the seed's character state for downstream use
          const seedChar = seed.characters.find((c) => c.id === change.characterId);
          if (seedChar) {
            if (relUpdates) {
              seedChar.state.relationships = { ...seedChar.state.relationships, ...relUpdates };
            }
            if (newLocation) seedChar.state.location = newLocation;
            if (emotionalState) seedChar.state.status = status;
            if (newSecrets && newSecrets.length > 0) {
              seedChar.state.secrets_known = [...(seedChar.state.secrets_known || []), ...newSecrets];
            }
          }
        }
      }
    }

    // 3. Extract and update narrative threads (LLM call)
    if (this.threadTracker) {
      const existingThreads = this.threadTracker.getOpenThreads();
      const threadResult = await extractThreads(
        chapterText,
        chapterNumber,
        existingThreads,
      );

      // Add new threads
      for (const newThread of threadResult.newThreads) {
        this.threadTracker.addThread(newThread);
      }
      // Update progressed threads
      for (const threadId of threadResult.progressedThreadIds) {
        this.threadTracker.updateThread(threadId, chapterNumber, "progressing");
      }
      // Resolve completed threads
      for (const threadId of threadResult.resolvedThreadIds) {
        this.threadTracker.updateThread(threadId, chapterNumber, "resolved");
      }
    }

    // 4. Update progress monitor
    if (this.progressMonitor) {
      this.progressMonitor.recordChapter(
        chapterNumber,
        chapterMemory.key_events,
        seed,
      );
    }

    // 5. Run post-processor for feedback
    const postResult = await postProcessChapter({
      chapterNumber,
      chapterText,
      seed,
      accumulator: this.feedbackAccumulator,
      characterTracker: this.characterTracker,
    });

    // Store correction context for next chapter
    this.pendingCorrectionContext = postResult.nextChapterContext || undefined;

    // Emit post_process event
    if (postResult.feedbacks.length > 0) {
      yield {
        type: "post_process",
        feedbacks: postResult.feedbacks,
        correctionLevel: postResult.correctionPlan.level,
      };
    }

    // Apply corrections to the accumulator
    if (postResult.correctionPlan.actions.length > 0 && this.feedbackAccumulator) {
      this.feedbackAccumulator.applyCorrections(postResult.correctionPlan);
    }
  }

  // -----------------------------------------------------------------------
  // generateChapter
  // -----------------------------------------------------------------------

  /** Generate a single chapter through the full lifecycle */
  async *generateChapter(
    seed: NovelSeed,
    chapterNumber: number,
    previousSummaries: Array<{
      chapter: number;
      title: string;
      summary: string;
      cliffhanger?: string | null;
    }>,
    previousChapterEnding?: string,
  ): AsyncGenerator<OrchestratorEvent> {
    // Always initialize tracking for chapter continuity
    this.initTracking(seed);

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

        // Merge new characters into seed
        if (arcResult.newCharacters.length > 0) {
          seed.characters.push(...arcResult.newCharacters);
        }

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

    // Build tracking context before lifecycle runs
    const trackingContext = this.buildTrackingContext(seed, chapterNumber);
    if (trackingContext) {
      // Emit tracking context event for UI visibility
      const contextParts: string[] = [];
      if (trackingContext.memoryContext) contextParts.push(trackingContext.memoryContext);
      if (trackingContext.toneGuidance) contextParts.push(trackingContext.toneGuidance);
      if (trackingContext.progressContext) contextParts.push(trackingContext.progressContext);
      if (trackingContext.correctionContext) contextParts.push(trackingContext.correctionContext);
      if (contextParts.length > 0) {
        yield { type: "tracking_context", context: contextParts.join("\n\n") };
      }
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
      trackingContext,
      previousChapterEnding,
    });

    let completedSummary: ChapterSummary | undefined;
    let completedText = "";

    for await (const event of lifecycle) {
      if (event.type === "stage_change") {
        if (event.stage === "evaluating") this.stage = "evaluating";
        else if (event.stage === "improving") this.stage = "improving";
      }
      yield event;
      if (event.type === "usage") {
        yield { type: "budget", ...this.getBudgetSnapshot() };
      }
      // Capture final text and summary for post-processing
      if (event.type === "replace_text") {
        completedText = event.content;
      }
      if (event.type === "complete") {
        completedSummary = event.summary;
        completedText = completedText || event.summary.plot_summary;
      }
    }

    // Run post-chapter tracking (after lifecycle completes)
    if (this.trackingEnabled && completedSummary && completedText) {
      yield* this.runPostChapterTracking(
        seed,
        chapterNumber,
        completedText,
        completedSummary,
      );
    }

    this.stage = "chapter_complete";
    yield { type: "pipeline_stage", stage: this.stage };
  }

  // -----------------------------------------------------------------------
  // generateBatch
  // -----------------------------------------------------------------------

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

    // Always enable tracking for batch generation
    if (!this.trackingEnabled) {
      this.initTracking(seed);
    }

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

      // Check if feedback says "rewrite" for the current chapter
      let rewriteAttempted = false;

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

        // Check if post-processing suggests a rewrite of the current chapter
        if (
          event.type === "post_process" &&
          event.correctionLevel === "rewrite" &&
          !rewriteAttempted
        ) {
          rewriteAttempted = true;
          // Remove the summary we just added (it will be replaced)
          const idx = summaries.findIndex((s) => s.chapter === ch);
          if (idx >= 0) summaries.splice(idx, 1);

          // Re-run this chapter (max 1 rewrite attempt)
          for await (const retryEvent of this.generateChapter(seed, ch, summaries)) {
            yield { ...retryEvent, chapterNumber: ch };
            if (retryEvent.type === "complete") {
              summaries.push({
                chapter: ch,
                title: retryEvent.summary.title,
                summary: retryEvent.summary.plot_summary,
              });
            }
          }
          // After rewrite, continue to next chapter
          break;
        }
      }
    }

    this.stage = "idle";
    yield { type: "pipeline_stage", stage: "idle" };
  }
}
