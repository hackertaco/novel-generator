import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { ChapterBlueprint } from "@/lib/schema/planning";
import type { DirectionDesign } from "@/lib/schema/direction";
import type { TokenUsage } from "@/lib/agents/types";

/** Lightweight summary passed between pipeline stages (not the full ChapterSummary). */
export type PreviousChapterSummary = { chapter: number; title: string; summary: string };

/** Extra context injected by the tracking/memory/feedback systems. */
export interface TrackingInjection {
  /** Hierarchical memory snapshot formatted as prompt text */
  memoryContext?: string;
  /** Tone guidance from ToneManager */
  toneGuidance?: string;
  /** Progress/pacing context from ProgressMonitor */
  progressContext?: string;
  /** Correction context from FeedbackAccumulator post-processing */
  correctionContext?: string;
}

// --- Issue types ---

export interface RuleIssue {
  type: "ending_repeat" | "sentence_start_repeat" | "banned_expression" | "consistency" | "short_dialogue_sequence" | "speech_level_violation" | "pov_inconsistency";
  severity?: "warning" | "error" | "critical";
  message?: string;
  position: number; // paragraph index (0-based)
  detail: string;
}

export interface CriticIssue {
  startParagraph: number;
  endParagraph: number;
  category: "characterVoice" | "rhythm" | "cliche" | "narrative" | "repetition";
  description: string;
  severity: "critical" | "major" | "minor";
  suggestedFix: string;
}

export interface CriticReport {
  overallScore: number; // 0~1
  dimensions: Record<string, number>;
  issues: CriticIssue[];
}

// --- Snapshot ---

export interface Snapshot {
  text: string;
  score: number;
  iteration: number;
}

// --- Chapter context ---

export interface ChapterContext {
  seed: NovelSeed;
  chapterNumber: number;
  blueprint?: ChapterBlueprint;
  previousSummaries: PreviousChapterSummary[];
  text: string;
  snapshots: Snapshot[];
  bestScore: number;
  ruleIssues: RuleIssue[];
  critiqueHistory: CriticReport[];
  totalUsage: TokenUsage;
  /** Extra context from tracking/memory/feedback systems */
  trackingContext?: TrackingInjection;
  /** Last ~500 chars of the previous chapter's actual text */
  previousChapterEnding?: string;
  /** Individual scene texts (preserved from scene-writer for downstream verification) */
  sceneTexts?: string[];
  /** Skip beat-by-beat writing for speed */
  fastMode?: boolean;
  /** Generate scenes in parallel + bridge stitching (fastest) */
  parallelMode?: boolean;
  /** Direction design metadata (address matrix, info budget, emotion curve, hook strategy) */
  directionDesign?: DirectionDesign;
  /** Formatted world state context from WorldStateManager (facts + character states) */
  worldStateContext?: string;
}

// --- LifecycleEvent (defined here to avoid circular imports; chapter-lifecycle.ts re-exports from here) ---

export type LifecycleEvent =
  | { type: "stage_change"; stage: string }
  | { type: "chunk"; content: string }
  | { type: "usage"; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number }
  | { type: "evaluation"; report: CriticReport; overall_score: number }
  | { type: "retry"; attempt: number; reason: string; score: number }
  | { type: "replace_text"; content: string }
  | { type: "patch"; paragraphId: number; content: string }
  | { type: "revert"; reason: string; to: number }
  | { type: "complete"; summary: ChapterSummary; final_score: number }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: "tracking_context"; context: string }
  | { type: "post_process"; feedbacks: object[]; correctionLevel: string }
  | { type: "deterministic_scores"; scores: object }
  | { type: "gate_decision"; decision: "pass" | "reject" | "evaluate"; deterministicScore: number; message: string };

// --- PipelineAgent ---

export interface PipelineAgent {
  name: string;
  run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent>;
}

// --- Helper functions ---

export function accumulateUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}
