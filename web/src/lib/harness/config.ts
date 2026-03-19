/**
 * Novel generation harness configuration.
 *
 * Defines what pipeline agents to use, which models for each step,
 * evaluation criteria, and tracking options.
 */

import type { PipelineAgent } from "../agents/pipeline";

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

export interface ModelConfig {
  /** Model for seed/plan generation (high-quality reasoning) */
  planning: string;
  /** Model for chapter writing (creative generation) */
  writing: string;
  /** Model for critique/evaluation (analytical) */
  critique: string;
  /** Model for surgery/repair (targeted editing) */
  repair: string;
  /** Default fallback model */
  default: string;
}

export const DEFAULT_MODELS: ModelConfig = {
  planning: "gpt-5.4",
  writing: "gpt-5.4",
  critique: "gpt-4o",
  repair: "gpt-4o",
  default: "gpt-4o",
};

export const BUDGET_MODELS: ModelConfig = {
  planning: "gpt-4o",
  writing: "gpt-4o",
  critique: "gpt-4o-mini",
  repair: "gpt-4o-mini",
  default: "gpt-4o-mini",
};

// ---------------------------------------------------------------------------
// Evaluation configuration
// ---------------------------------------------------------------------------

export interface EvalDimension {
  name: string;
  weight: number;
  /** Korean label for display */
  label: string;
}

export const DEFAULT_EVAL_DIMENSIONS: EvalDimension[] = [
  { name: "narrative", weight: 0.25, label: "서사 전개" },
  { name: "characterVoice", weight: 0.25, label: "캐릭터 음성" },
  { name: "rhythm", weight: 0.20, label: "문장 리듬" },
  { name: "hookEnding", weight: 0.15, label: "후킹 엔딩" },
  { name: "immersion", weight: 0.15, label: "몰입감" },
];

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

export interface PipelineStepConfig {
  /** Agent class constructor */
  create: () => PipelineAgent;
  /** Whether this step is enabled */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Tracking configuration
// ---------------------------------------------------------------------------

export interface TrackingConfig {
  memory: boolean;
  characters: boolean;
  threads: boolean;
  tone: boolean;
  progress: boolean;
  feedback: boolean;
}

export const DEFAULT_TRACKING: TrackingConfig = {
  memory: true,
  characters: true,
  threads: true,
  tone: true,
  progress: true,
  feedback: true,
};

export const MINIMAL_TRACKING: TrackingConfig = {
  memory: true,
  characters: false,
  threads: false,
  tone: false,
  progress: false,
  feedback: false,
};

// ---------------------------------------------------------------------------
// Output configuration
// ---------------------------------------------------------------------------

export type OutputMode = "stream" | "file" | "silent";

export interface OutputConfig {
  mode: OutputMode;
  /** Directory for file output (only for mode="file") */
  dir?: string;
  /** Whether to print progress to stdout */
  verbose: boolean;
}

// ---------------------------------------------------------------------------
// Main harness configuration
// ---------------------------------------------------------------------------

export interface HarnessConfig {
  /** Name of this configuration (for experiments/comparison) */
  name: string;

  /** Model assignments per role */
  models: ModelConfig;

  /** Pipeline step configuration */
  pipeline: PipelineStepConfig[];

  /** Quality threshold (0-1). Chapters below this trigger improvement loop. */
  qualityThreshold: number;

  /** Max improvement attempts per chapter */
  maxAttempts: number;

  /** Budget limit in USD (null = unlimited) */
  budgetUsd: number | null;

  /** Evaluation dimensions and weights */
  evalDimensions: EvalDimension[];

  /** Tracking subsystem toggles */
  tracking: TrackingConfig;

  /** Output configuration */
  output: OutputConfig;

  /** Chapter length target range */
  chapterLength: {
    min: number;
    max: number;
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Import pipeline agents lazily to avoid circular deps */
function lazyPipeline(): PipelineStepConfig[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WriterAgent } = require("../agents/writer-agent");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RuleGuardAgent } = require("../agents/rule-guard");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { QualityLoop } = require("../agents/quality-loop");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PolisherAgent } = require("../agents/polisher-agent");

  return [
    { create: () => new WriterAgent(), enabled: true },
    { create: () => new RuleGuardAgent(), enabled: true },
    { create: () => new QualityLoop(), enabled: true },
    { create: () => new PolisherAgent(), enabled: true },
  ];
}

export function getDefaultConfig(name = "default"): HarnessConfig {
  return {
    name,
    models: DEFAULT_MODELS,
    pipeline: lazyPipeline(),
    qualityThreshold: 0.85,
    maxAttempts: 5,
    budgetUsd: null,
    evalDimensions: DEFAULT_EVAL_DIMENSIONS,
    tracking: DEFAULT_TRACKING,
    output: { mode: "stream", verbose: true },
    chapterLength: { min: 3000, max: 4000 },
  };
}

export function getBudgetConfig(name = "budget"): HarnessConfig {
  return {
    ...getDefaultConfig(name),
    name,
    models: BUDGET_MODELS,
    qualityThreshold: 0.75,
    maxAttempts: 3,
  };
}

export function getFastConfig(name = "fast"): HarnessConfig {
  const pipeline = lazyPipeline();
  // Disable polisher for speed
  pipeline[3].enabled = false;
  return {
    ...getDefaultConfig(name),
    name,
    models: BUDGET_MODELS,
    pipeline,
    qualityThreshold: 0.70,
    maxAttempts: 2,
  };
}
