/**
 * AutoResearch Loop Runner — core execution engine.
 *
 * Runs the iterative optimization loop:
 *   generate → evaluate → modify → regenerate → keep/revert
 *
 * Modifications are applied as "prompt patches" prepended to the writer
 * system prompt — no files on disk are touched.
 */

import { getAgent } from "@/lib/agents/llm-agent";
import { validateScene } from "@/lib/agents/scene-validator";
import { detectChapterRepetition } from "@/lib/agents/repetition-detector";
import { validateConflictGate } from "@/lib/agents/conflict-gate";
import { validateSentimentArc } from "@/lib/agents/sentiment-validator";
import { writeChapterByScenes } from "@/lib/agents/scene-writer";
import { getWriterSystemPrompt } from "@/lib/prompts/writer-system-prompt";
import { generateChapterBlueprints } from "@/lib/planning/chapter-planner";
import { runPlotPipeline } from "@/lib/agents/plot-pipeline";
import {
  calculateScore,
  buildJudgePrompt,
  buildModificationPrompt,
  type EvaluationScore,
  type Experiment,
  type AutoResearchState,
  type QualityMetrics,
  type LLMJudgement,
  type EfficiencyMetrics,
} from "@/lib/evolution/auto-research";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import type { ArcPlan, ChapterBlueprint } from "@/lib/schema/planning";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LoopRunnerConfig {
  /** NovelSeed to use for generation */
  seed: NovelSeed;
  /** Genre for prompts */
  genre: string;
  /** Max iterations */
  maxIterations: number;
  /** Budget in USD (stop if exceeded) */
  budgetUsd: number;
  /** Chapter number to test with (default: 1) */
  testChapter?: number;
  /** Model override for generation */
  model?: string;
  /** Separate model for LLM judge evaluation (cross-model eval reduces bias) */
  judgeModel?: string;
  /** Callback for progress updates */
  onProgress?: (event: LoopProgressEvent) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface LoopProgressEvent {
  iteration: number;
  phase: "generate" | "evaluate" | "modify" | "apply" | "compare";
  message: string;
  score?: EvaluationScore;
}

export interface LoopResult {
  /** Final state */
  state: AutoResearchState;
  /** All modifications that were kept */
  keptModifications: ModificationRecord[];
  /** Total tokens used */
  totalTokens: number;
  /** Total cost */
  totalCostUsd: number;
  /** Duration in ms */
  durationMs: number;
}

export interface ModificationRecord {
  iteration: number;
  target: string;
  modification: string;
  scoreBefore: number;
  scoreAfter: number;
  improvement: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const ZERO_USAGE: TokenUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  cost_usd: 0,
};

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("AutoResearch loop aborted");
  }
}

/**
 * Generate a rising tension curve for an arc of the given length.
 * Produces a gentle rise with a peak near the climax position.
 */
function generateDefaultTensionCurve(
  arcLength: number,
  climaxChapter: number,
  startChapter: number,
): number[] {
  const curve: number[] = [];
  const climaxIndex = Math.max(0, climaxChapter - startChapter);
  for (let i = 0; i < arcLength; i++) {
    // Base rising tension from 3 to 7
    const baseProgress = i / Math.max(1, arcLength - 1);
    const base = 3 + baseProgress * 4;
    // Boost near climax
    const distFromClimax = Math.abs(i - climaxIndex) / Math.max(1, arcLength);
    const climaxBoost = Math.max(0, (1 - distFromClimax * 2)) * 3;
    curve.push(Math.min(10, Math.max(1, Math.round(base + climaxBoost))));
  }
  return curve;
}

function buildArcForChapter(seed: NovelSeed, chapterNumber: number): ArcPlan {
  const seedArc = seed.arcs.find(
    (a) => a.start_chapter <= chapterNumber && chapterNumber <= a.end_chapter,
  ) ?? seed.arcs[0];

  if (!seedArc) {
    // Fallback: construct a minimal arc
    const arcLength = seed.total_chapters;
    const climax = Math.ceil(arcLength / 2);
    return {
      id: "arc_1",
      name: "도입",
      part_id: "",
      start_chapter: 1,
      end_chapter: seed.total_chapters,
      summary: seed.logline,
      theme: seed.logline.slice(0, 50),
      key_events: [],
      climax_chapter: climax,
      tension_curve: generateDefaultTensionCurve(arcLength, climax, 1),
      chapter_blueprints: [],
    };
  }

  const arcLength = seedArc.end_chapter - seedArc.start_chapter + 1;

  // Derive theme: use seed arc's theme if available, otherwise extract from summary
  const theme = seedArc.theme || `${seedArc.name} — ${seedArc.summary.slice(0, 60)}`;

  // Use seed arc's tension_curve if available and correct length, otherwise generate
  const tensionCurve =
    seedArc.tension_curve && seedArc.tension_curve.length === arcLength
      ? seedArc.tension_curve
      : generateDefaultTensionCurve(arcLength, seedArc.climax_chapter, seedArc.start_chapter);

  return {
    id: seedArc.id,
    name: seedArc.name,
    part_id: "",
    start_chapter: seedArc.start_chapter,
    end_chapter: seedArc.end_chapter,
    summary: seedArc.summary,
    theme,
    key_events: seedArc.key_events,
    climax_chapter: seedArc.climax_chapter,
    tension_curve: tensionCurve,
    chapter_blueprints: [],
  };
}

/**
 * Apply prompt patches to the base system prompt.
 * Each patch is prepended as an additional instruction block.
 */
function applyPromptPatches(
  basePrompt: string,
  patches: string[],
): string {
  if (patches.length === 0) return basePrompt;

  const patchBlock = patches
    .map((p, i) => `[시스템 개선 #${i + 1}]\n${p}`)
    .join("\n\n");

  return `${patchBlock}\n\n---\n\n${basePrompt}`;
}

/**
 * Generate a chapter with optional prompt patches applied.
 * If cachedBlueprint is provided, skip blueprint generation to save tokens.
 */
async function generateChapter(
  seed: NovelSeed,
  genre: string,
  chapterNumber: number,
  promptPatches: string[],
  model?: string,
  cachedBlueprint?: ChapterBlueprint,
): Promise<{ text: string; usage: TokenUsage; blueprint: ChapterBlueprint }> {
  let cumulativeUsage: TokenUsage = { ...ZERO_USAGE };

  let blueprint: ChapterBlueprint;

  if (cachedBlueprint) {
    // Reuse cached blueprint to save tokens
    blueprint = cachedBlueprint;
  } else {
    // Generate chapter blueprints
    const arc = buildArcForChapter(seed, chapterNumber);
    const blueprintResult = await generateChapterBlueprints(seed, arc, []);
    cumulativeUsage = addUsage(cumulativeUsage, blueprintResult.usage);

    blueprint =
      blueprintResult.data.find((bp) => bp.chapter_number === chapterNumber) ??
      blueprintResult.data[0];

    if (!blueprint) {
      throw new Error(`No blueprint generated for chapter ${chapterNumber}`);
    }
  }

  // Build system prompt with patches
  const baseSystemPrompt = getWriterSystemPrompt(genre, chapterNumber);
  const patchedPrompt = applyPromptPatches(baseSystemPrompt, promptPatches);

  // Write chapter scene-by-scene
  const writeResult = await writeChapterByScenes({
    seed,
    chapterNumber,
    blueprint,
    systemPrompt: patchedPrompt,
    model,
  });
  cumulativeUsage = addUsage(cumulativeUsage, writeResult.usage);

  return {
    text: writeResult.fullText,
    usage: cumulativeUsage,
    blueprint,
  };
}

/**
 * Evaluate a generated chapter using code metrics + LLM judge.
 */
async function evaluateChapter(
  chapterText: string,
  genre: string,
  generationUsage: TokenUsage,
  model?: string,
  judgeModel?: string,
): Promise<{ score: EvaluationScore; usage: TokenUsage }> {
  // 1. Code metrics via scene validator
  const validation = validateScene(chapterText, chapterText.length, "dialogue");

  // Split text into pseudo-scenes for repetition/sentiment analysis
  const paragraphs = chapterText.split(/\n\n+/).filter((p) => p.trim().length > 100);
  const sceneChunks = paragraphs.length >= 3 ? paragraphs : [chapterText];

  // Repetition detection
  const repetitionResult = detectChapterRepetition(sceneChunks);

  // Conflict gate (chapter 1, early stage)
  const conflictResult = validateConflictGate(chapterText, 1, 200, "setup", false);

  // Sentiment arc check
  const sentimentResult = validateSentimentArc(
    sceneChunks,
    sceneChunks.map(() => "긴장"), // default tone for evaluation
  );

  const qualityMetrics: QualityMetrics = {
    dialogue_ratio: validation.metrics.dialogueRatio,
    tell_not_show_count: validation.metrics.tellNotShowCount,
    ending_repetition_rate: validation.metrics.endingRepetitionRate,
    vague_narrative_count: validation.metrics.vagueNarrativeCount,
    char_count: validation.metrics.charCount,
    repetition_overlap: repetitionResult.metrics.interSceneOverlap,
    premature_resolution: conflictResult.metrics.resolutionScore,
    sentiment_mismatch_count: sentimentResult.issues.length,
  };

  // 2. LLM judge (use judgeModel if provided for cross-model evaluation)
  const agent = getAgent();
  const judgePrompt = buildJudgePrompt(chapterText, genre);
  const judgeResult = await agent.call({
    prompt: judgePrompt,
    model: judgeModel ?? model,
    temperature: 0.3,
    maxTokens: 1024,
    taskId: "auto-research-judge",
  });

  let judgement: LLMJudgement;
  try {
    const parsed = JSON.parse(
      judgeResult.data.replace(/```json\s*|```/g, "").trim(),
    );
    judgement = {
      next_chapter_click: clampScore(parsed.next_chapter_click),
      character_voice_distinction: clampScore(parsed.character_voice_distinction),
      premise_clarity: clampScore(parsed.premise_clarity),
      coherence: clampScore(parsed.coherence),
      expression_variety: clampScore(parsed.expression_variety),
      scene_pacing: clampScore(parsed.scene_pacing ?? 5),
      sensory_detail: clampScore(parsed.sensory_detail ?? 5),
      immersion: clampScore(parsed.immersion ?? 5),
      feedback: String(parsed.feedback ?? ""),
    };
  } catch {
    // Fallback: neutral scores if LLM doesn't return valid JSON
    judgement = {
      next_chapter_click: 5,
      character_voice_distinction: 5,
      premise_clarity: 5,
      coherence: 5,
      expression_variety: 5,
      scene_pacing: 5,
      sensory_detail: 5,
      immersion: 5,
      feedback: "LLM 판정 파싱 실패 — 기본값 사용",
    };
  }

  // 3. Efficiency metrics
  const efficiencyMetrics: EfficiencyMetrics = {
    total_tokens: generationUsage.total_tokens,
    retry_count: 0, // We don't track retries at this level
  };

  const score = calculateScore(qualityMetrics, judgement, efficiencyMetrics);

  return {
    score,
    usage: judgeResult.usage,
  };
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (isNaN(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

/**
 * Ask the AI to propose a system modification based on current evaluation.
 */
async function proposeModification(
  currentScore: EvaluationScore,
  chapterText: string,
  previousExperiments: Experiment[],
  model?: string,
  forbiddenTargets?: string[],
): Promise<{
  target: string;
  modification: string;
  weakness: string;
  usage: TokenUsage;
}> {
  const agent = getAgent();
  const prompt = buildModificationPrompt(
    currentScore,
    chapterText,
    previousExperiments,
    forbiddenTargets,
  );

  const result = await agent.call({
    prompt,
    model,
    temperature: 0.7,
    maxTokens: 1024,
    taskId: "auto-research-modify",
  });

  let target = "writer_system_prompt";
  let modification = "";
  let weakness = "";

  try {
    const parsed = JSON.parse(
      result.data.replace(/```json\s*|```/g, "").trim(),
    );
    target = String(parsed.target ?? "writer_system_prompt");
    modification = String(parsed.modification ?? "");
    weakness = String(parsed.weakness ?? "");
  } catch {
    // If parsing fails, use the raw text as the modification
    modification = result.data.trim().slice(0, 500);
    weakness = "파싱 실패 — 원문을 수정 사항으로 사용";
  }

  return { target, modification, weakness, usage: result.usage };
}

/**
 * Convert a modification target + description into a prompt patch string.
 */
function modificationToPatch(target: string, modification: string): string {
  switch (target) {
    case "writer_system_prompt":
      return `## 추가 글쓰기 지침\n${modification}`;
    case "scene_validator_rules":
      return `## 씬 작성 시 추가 검증 규칙\n${modification}`;
    case "beat_structure":
      return `## 비트 구조 수정 사항\n${modification}`;
    case "blueprint_prompt":
      return `## 블루프린트 추가 지침\n${modification}`;
    default:
      return `## 시스템 수정\n${modification}`;
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

/**
 * Run the AutoResearch optimization loop.
 *
 * 1. Generate baseline chapter → evaluate
 * 2. Loop: propose modification → regenerate → evaluate → keep/revert
 * 3. Return final state with all experiments and kept modifications
 */
export async function runAutoResearchLoop(
  config: LoopRunnerConfig,
): Promise<LoopResult> {
  const {
    seed,
    genre,
    maxIterations,
    budgetUsd,
    testChapter = 1,
    model,
    judgeModel,
    onProgress,
    signal,
  } = config;

  const startTime = Date.now();
  let totalUsage: TokenUsage = { ...ZERO_USAGE };
  const experiments: Experiment[] = [];
  const keptModifications: ModificationRecord[] = [];
  const activePatches: string[] = [];
  const recentTargets: string[] = []; // Track recent targets for diversification
  let cachedBlueprint: ChapterBlueprint | undefined;

  const emit = (event: LoopProgressEvent) => {
    onProgress?.(event);
  };

  // -----------------------------------------------------------------------
  // Phase 0: Baseline generation
  // -----------------------------------------------------------------------
  checkAborted(signal);
  emit({
    iteration: 0,
    phase: "generate",
    message: "베이스라인 챕터 생성 중...",
  });

  const baselineGen = await generateChapter(
    seed,
    genre,
    testChapter,
    [],
    model,
    undefined, // no cached blueprint for baseline
  );
  totalUsage = addUsage(totalUsage, baselineGen.usage);

  // Cache the blueprint for reuse in subsequent iterations
  cachedBlueprint = baselineGen.blueprint;

  checkAborted(signal);
  emit({
    iteration: 0,
    phase: "evaluate",
    message: "베이스라인 평가 중...",
  });

  const baselineEval = await evaluateChapter(
    baselineGen.text,
    genre,
    baselineGen.usage,
    model,
    judgeModel,
  );
  totalUsage = addUsage(totalUsage, baselineEval.usage);

  const baselineExperiment: Experiment = {
    id: 0,
    modification: "baseline (원본 시스템)",
    generated_text: baselineGen.text.slice(0, 500),
    score: baselineEval.score,
    kept: true,
    timestamp: Date.now(),
  };
  experiments.push(baselineExperiment);

  const j = baselineEval.score.llm_judgement;
  emit({
    iteration: 0,
    phase: "evaluate",
    message: `베이스라인 점수: ${baselineEval.score.overall} (클릭:${j.next_chapter_click} 목소리:${j.character_voice_distinction} 전제:${j.premise_clarity} 개연:${j.coherence} 표현:${j.expression_variety} 호흡:${j.scene_pacing} 감각:${j.sensory_detail} 몰입:${j.immersion})`,
    score: baselineEval.score,
  });

  let bestScore = baselineEval.score.overall;
  let bestExperimentId = 0;
  let currentScore = baselineEval.score;
  let currentText = baselineGen.text;

  // -----------------------------------------------------------------------
  // Phase 1-N: Iterative improvement
  // -----------------------------------------------------------------------
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // Budget check
    if (totalUsage.cost_usd >= budgetUsd) {
      emit({
        iteration,
        phase: "compare",
        message: `예산 초과 ($${totalUsage.cost_usd.toFixed(4)} / $${budgetUsd}). 루프 종료.`,
      });
      break;
    }

    checkAborted(signal);

    // --- Analyze & propose modification ---
    emit({
      iteration,
      phase: "modify",
      message: `반복 ${iteration}/${maxIterations}: 약점 분석 및 수정 제안 중...`,
    });

    // Target diversification: if same target used 2+ times recently, forbid it
    const forbiddenTargets = recentTargets.length >= 2 &&
      recentTargets[recentTargets.length - 1] === recentTargets[recentTargets.length - 2]
      ? [recentTargets[recentTargets.length - 1]]
      : [];

    const proposal = await proposeModification(
      currentScore,
      currentText,
      experiments,
      model,
      forbiddenTargets,
    );
    totalUsage = addUsage(totalUsage, proposal.usage);

    checkAborted(signal);

    // --- Apply modification as prompt patch ---
    emit({
      iteration,
      phase: "apply",
      message: `수정 적용: [${proposal.target}] ${proposal.modification.slice(0, 80)}...`,
    });

    const newPatch = modificationToPatch(proposal.target, proposal.modification);
    const candidatePatches = [...activePatches, newPatch];

    // --- Regenerate with modified prompt ---
    emit({
      iteration,
      phase: "generate",
      message: `수정된 시스템으로 챕터 재생성 중...`,
    });

    const regenResult = await generateChapter(
      seed,
      genre,
      testChapter,
      candidatePatches,
      model,
      cachedBlueprint, // reuse blueprint to save tokens
    );
    totalUsage = addUsage(totalUsage, regenResult.usage);

    checkAborted(signal);

    // --- Evaluate new generation ---
    emit({
      iteration,
      phase: "evaluate",
      message: `재생성 결과 평가 중...`,
    });

    const regenEval = await evaluateChapter(
      regenResult.text,
      genre,
      regenResult.usage,
      model,
      judgeModel,
    );
    totalUsage = addUsage(totalUsage, regenEval.usage);

    const scoreBefore = currentScore.overall;
    const scoreAfter = regenEval.score.overall;
    const improvement = scoreAfter - scoreBefore;
    const kept = improvement > 0;

    // Track target for diversification
    recentTargets.push(proposal.target);

    const experiment: Experiment = {
      id: iteration,
      modification: `[${proposal.target}] ${proposal.weakness}: ${proposal.modification}`,
      generated_text: regenResult.text.slice(0, 500),
      score: regenEval.score,
      kept,
      timestamp: Date.now(),
    };
    experiments.push(experiment);

    // --- Compare & decide ---
    emit({
      iteration,
      phase: "compare",
      message: kept
        ? `개선! ${scoreBefore.toFixed(3)} → ${scoreAfter.toFixed(3)} (+${improvement.toFixed(3)}). 수정 유지.`
        : `악화. ${scoreBefore.toFixed(3)} → ${scoreAfter.toFixed(3)} (${improvement.toFixed(3)}). 수정 되돌림.`,
      score: regenEval.score,
    });

    if (kept) {
      activePatches.push(newPatch);
      currentScore = regenEval.score;
      currentText = regenResult.text;

      keptModifications.push({
        iteration,
        target: proposal.target,
        modification: proposal.modification,
        scoreBefore,
        scoreAfter,
        improvement,
      });

      if (scoreAfter > bestScore) {
        bestScore = scoreAfter;
        bestExperimentId = iteration;
      }
    }
    // If not kept, activePatches stays unchanged (revert)
  }

  // -----------------------------------------------------------------------
  // Build final state
  // -----------------------------------------------------------------------
  const state: AutoResearchState = {
    best_score: bestScore,
    best_experiment_id: bestExperimentId,
    experiments,
    total_runs: experiments.length,
    improvement_from_baseline: bestScore - baselineEval.score.overall,
  };

  return {
    state,
    keptModifications,
    totalTokens: totalUsage.total_tokens,
    totalCostUsd: totalUsage.cost_usd,
    durationMs: Date.now() - startTime,
  };
}
