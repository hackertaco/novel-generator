import * as fs from "fs";
import * as path from "path";

import {
  buildChapterGenerationArtifactBundle,
  persistNovelArtifactBundle,
  type ChapterGenerationArtifactBundle,
} from "../novel-engine/artifacts";
import {
  buildCanonicalValidationFailureReport,
  buildForeshadowContinuityVerifierReport,
  buildForeshadowVerificationInput,
  buildForeshadowVerificationVerdictSummary,
  buildForeshadowingVerificationItems,
  buildLongFormContradictionValidationReport,
  mergeCanonicalValidationFailureReports,
} from "../harness";
import type {
  BeliefInterpretationRecoveryReport,
  CanonicalValidationFailureReport,
  HarnessEvent,
  HarnessResult,
  HarnessRunOutcome,
  RendererRegenerationRequest,
} from "../harness";
import type {
  CanonicalValidationFailureReport as CanonicalValidationFailureReportContract,
  ForeshadowContinuityVerifierReport,
  ForeshadowResolutionWindowSummary,
  ForeshadowVerificationInput,
  ForeshadowVerificationItemSummary,
  ForeshadowVerificationVerdictSummary,
  LongFormContradictionValidationReport,
} from "../harness";
import { evaluateForeshadowResolutionWindows } from "../harness";
import { FORESHADOW_QUALITY_GATE_THRESHOLD } from "../evolution/evaluators/foreshadowing-usage";
import type { NovelSeed } from "../schema/novel";
import {
  buildSimulationCausalLedgerAggregation,
  validateMajorPlotActionLedger,
} from "../sim";
import type {
  MajorPlotActionLedgerValidation,
  SimulationCausalLedgerAggregation,
  SimulationValidationVerdict,
} from "../sim";
import type {
  ChapterGenerationWorkflowPayload,
  RunChapterGenerationWorkflowOptions,
} from "./workflow";
import { runChapterGenerationWorkflow } from "./workflow";
import type {
  ChapterGenerationRunInput,
  NovelWorkflowRunResult,
} from "./contracts";

export type CanonicalValidationRunReport = CanonicalValidationFailureReportContract;

export class CanonicalValidationRunError extends Error {
  readonly reports: CanonicalValidationRunReport[];

  constructor(reports: CanonicalValidationRunReport[]) {
    const chapters = reports.map((report) => report.chapter).join(", ");
    super(`Canonical simulation validation failed for chapter(s): ${chapters}`);
    this.name = "CanonicalValidationRunError";
    this.reports = reports;
  }
}

export interface ForeshadowQualityGateRunReport {
  code: "foreshadow_quality_gate";
  summary: string;
  thresholdPercentage: number;
  resolutionWindowEpisodes: number;
  evaluationHorizonEpisode: number;
  totalRegisteredItemCount: number;
  eligibleRegisteredItemCount: number;
  intentionallyAbandonedItemCount: number;
  resolvedWithinWindowItemCount: number;
  unresolvedItemCount: number;
  pendingItemCount: number;
  missedItemCount: number;
  expiredItemCount: number;
  resolutionPercentage: number;
  pass: boolean;
}

export class ForeshadowQualityGateRunError extends Error {
  readonly report: ForeshadowQualityGateRunReport;

  constructor(report: ForeshadowQualityGateRunReport) {
    super(report.summary);
    this.name = "ForeshadowQualityGateRunError";
    this.report = report;
  }
}

export interface CausalLedgerValidationRunReport {
  code: "causal_ledger_validation_failed";
  summary: string;
  issueCount: number;
  validation: MajorPlotActionLedgerValidation;
}

export class CausalLedgerValidationRunError extends Error {
  readonly report: CausalLedgerValidationRunReport;

  constructor(report: CausalLedgerValidationRunReport) {
    super(report.summary);
    this.name = "CausalLedgerValidationRunError";
    this.report = report;
  }
}

export interface ContradictionValidationRunReport {
  code: "contradiction_validation_failed";
  summary: string;
  validation: LongFormContradictionValidationReport;
}

export class ContradictionValidationRunError extends Error {
  readonly report: ContradictionValidationRunReport;

  constructor(report: ContradictionValidationRunReport) {
    super(report.summary);
    this.name = "ContradictionValidationRunError";
    this.report = report;
  }
}

export const CHAPTER_GENERATION_ARTIFACT_LAYOUT = Object.freeze({
  chaptersDirName: "chapters",
  summariesDirName: "summaries",
  ledgersDirName: "ledgers",
  rendererRegenerationDirName: "renderer-regeneration",
  metadataDirName: "metadata",
  manifestFileName: "artifact-manifest.json",
  runMetadataFileName: "run-metadata.json",
} as const);

export interface ChapterGenerationArtifactPaths {
  outDir: string;
  resultFile: string;
  chaptersDir: string;
  summariesDir: string;
  ledgersDir: string;
  rendererRegenerationDir: string;
  metadataDir: string;
  manifestFile: string;
  runMetadataFile: string;
  chapterFiles: string[];
  summaryFiles: string[];
  rendererRegenerationFiles: string[];
  causalLedgerFile?: string;
  causalLedgerAggregationFile?: string;
}

export interface ChapterGenerationRunMetadata {
  schemaVersion: "chapter_generation_run_metadata.v1";
  workflow: "chapter_generation";
  runId: string;
  seedTitle: string;
  mode: ChapterGenerationExecutionReport["mode"];
  config: string;
  startedAt: string;
  completedAt: string;
  chapterRange: {
    startChapter: number;
    endChapter: number;
    generatedChapterCount: number;
  };
  totals: {
    totalTokens: number;
    totalCostUsd: number;
    totalDurationMs: number;
  };
  validation: {
    validationFailed: boolean;
    canonicalValidationFailureCount: number;
    contradictionViolationCount: number;
    causalLedgerIssueCount: number;
    foreshadowQualityGatePass: boolean;
  };
  artifactLayout: {
    resultFile: string;
    chaptersDir: string;
    summariesDir: string;
    ledgersDir: string;
    rendererRegenerationDir: string;
    metadataDir: string;
    manifestFile: string;
    runMetadataFile: string;
  };
}

export interface ChapterGenerationArtifactManifest {
  schemaVersion: "chapter_generation_artifact_manifest.v1";
  workflow: "chapter_generation";
  runId: string;
  generatedAt: string;
  artifacts: {
    resultFile: string;
    runMetadataFile: string;
    chapters: Array<{
      chapterNumber: number;
      textFile: string;
      summaryFile: string;
      rendererRegenerationFile?: string;
    }>;
    causalLedgerFile?: string;
    causalLedgerAggregationFile?: string;
  };
}

export interface ChapterGenerationExecutionReport {
  mode: "standard" | "renderer_regeneration";
  config: string;
  totalUsage: HarnessResult["totalUsage"];
  totalTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  validationFailed: boolean;
  causalLedgerSummary: {
    eventCount: number;
    firstEventId: string | null;
    lastEventId: string | null;
    startEpisode: number | null;
    endEpisode: number | null;
  } | null;
  causalLedgerAggregation: SimulationCausalLedgerAggregation | null;
  causalLedgerAggregationSummary: {
    episodeCount: number;
    firstEpisode: number | null;
    lastEpisode: number | null;
    crossEpisodeLinkCount: number;
    unresolvedCrossEpisodeLinkCount: number;
  } | null;
  foreshadowingVerificationItems: ForeshadowVerificationItemSummary[];
  foreshadowVerificationInput: ForeshadowVerificationInput;
  foreshadowContinuityVerifierReport: ForeshadowContinuityVerifierReport;
  foreshadowVerificationVerdictSummary: ForeshadowVerificationVerdictSummary;
  foreshadowResolutionWindowSummary: ForeshadowResolutionWindowSummary;
  foreshadowQualityGate: ForeshadowQualityGateRunReport;
  verification?: SimulationValidationVerdict;
  beliefInterpretationRecoveries: BeliefInterpretationRecoveryReport[];
  canonicalValidationFailures: CanonicalValidationFailureReport[];
  causalLedgerValidation: MajorPlotActionLedgerValidation;
  contradictionValidation: LongFormContradictionValidationReport;
  chapters: Array<{
    chapterNumber: number;
    charCount: number;
    score: number;
    usage: HarnessResult["chapters"][number]["usage"];
    durationMs: number;
    verification?: SimulationValidationVerdict;
    beliefInterpretationRecovery?: BeliefInterpretationRecoveryReport;
    rendererRegenerationRequest?: RendererRegenerationRequest;
  }>;
}

export interface EndToEndChapterGenerationRunResult {
  workflowResult: NovelWorkflowRunResult<ChapterGenerationWorkflowPayload>;
  outcome: HarnessRunOutcome;
  report: ChapterGenerationExecutionReport;
  artifactPaths?: ChapterGenerationArtifactPaths;
  artifactBundle?: ChapterGenerationArtifactBundle;
}

export interface RunEndToEndChapterGenerationOptions
  extends RunChapterGenerationWorkflowOptions {
  outDir?: string;
}

export function buildForeshadowQualityGateRunReport(
  summary: ForeshadowResolutionWindowSummary,
): ForeshadowQualityGateRunReport {
  const thresholdPercentage = FORESHADOW_QUALITY_GATE_THRESHOLD * 100;
  const intentionallyAbandonedItemCount = summary.totals.intentionallyAbandoned;
  const pendingItemCount = summary.totals.pending;
  const eligibleRegisteredItemCount = Math.max(
    0,
    summary.totals.total - intentionallyAbandonedItemCount - pendingItemCount,
  );
  const resolvedWithinWindowItemCount = summary.totals.resolvedWithinWindow;
  const resolutionPercentage = eligibleRegisteredItemCount === 0
    ? 100
    : Math.round((resolvedWithinWindowItemCount / eligibleRegisteredItemCount) * 10000) / 100;
  const pass = resolutionPercentage >= thresholdPercentage;
  const summaryText = eligibleRegisteredItemCount === 0
    ? `Foreshadow quality gate passed: no eligible registered items had reached their resolution deadline; ${pendingItemCount} item(s) remain pending and ${intentionallyAbandonedItemCount} item(s) were intentionally abandoned.`
    : `Foreshadow quality gate ${pass ? "passed" : "failed"}: `
      + `${resolvedWithinWindowItemCount}/${eligibleRegisteredItemCount} eligible registered item(s) `
      + `resolved within ${summary.resolutionWindowEpisodes} episode(s) `
      + `(${resolutionPercentage.toFixed(2)}% vs required ${thresholdPercentage.toFixed(2)}%).`;

  return {
    code: "foreshadow_quality_gate",
    summary: summaryText,
    thresholdPercentage,
    resolutionWindowEpisodes: summary.resolutionWindowEpisodes,
    evaluationHorizonEpisode: summary.evaluationHorizonEpisode,
    totalRegisteredItemCount: summary.totals.total,
    eligibleRegisteredItemCount,
    intentionallyAbandonedItemCount,
    resolvedWithinWindowItemCount,
    unresolvedItemCount: summary.totals.unresolved,
    pendingItemCount,
    missedItemCount: summary.totals.missed,
    expiredItemCount: summary.totals.expired,
    resolutionPercentage,
    pass,
  };
}

export function buildChapterGenerationExecutionReport(
  seed: NovelSeed,
  outcome: HarnessRunOutcome["result"],
): ChapterGenerationExecutionReport {
  const foreshadowingVerificationItems = buildForeshadowingVerificationItems(seed);
  const foreshadowVerificationInput = buildForeshadowVerificationInput(
    seed,
    outcome.chapters,
  );
  const foreshadowContinuityVerifierReport =
    buildForeshadowContinuityVerifierReport(seed, outcome.chapters);
  const foreshadowVerificationVerdictSummary =
    buildForeshadowVerificationVerdictSummary(seed);
  const foreshadowResolutionWindowSummary =
    evaluateForeshadowResolutionWindows(foreshadowVerificationInput);
  const foreshadowQualityGate =
    buildForeshadowQualityGateRunReport(foreshadowResolutionWindowSummary);
  const derivedCanonicalValidationFailures = outcome.chapters
    .map((chapter) => (
      chapter.verification
        ? buildCanonicalValidationFailureReport(
          chapter.chapterNumber,
          chapter.verification,
        )
        : null
    ))
    .filter(
      (
        report,
      ): report is CanonicalValidationFailureReport => report !== null,
    );
  const canonicalValidationFailures = mergeCanonicalValidationFailureReports(
    outcome.canonicalValidationFailures,
    derivedCanonicalValidationFailures,
  );
  const causalLedgerAggregation = outcome.causalLedgerAggregation
    ?? (outcome.causalLedger
      ? buildSimulationCausalLedgerAggregation(outcome.causalLedger)
      : null);
  const causalLedgerValidation = outcome.causalLedgerValidation
    ?? validateMajorPlotActionLedger(outcome.causalLedger ?? [], {
      foreshadowingItems: foreshadowingVerificationItems,
      foreshadowEpisodeSequence: foreshadowVerificationInput.episodeSequence,
    });
  const contradictionValidation = buildLongFormContradictionValidationReport({
    chapters: outcome.chapters,
    causalLedgerValidation,
    causalLedgerEventCount: outcome.causalLedger?.events.length ?? 0,
  });
  const validationFailed = outcome.verification
    ? !outcome.verification.passed
    : outcome.chapters.some((chapter) => chapter.verification
      ? !chapter.verification.passed
      : false);

  return {
    mode: outcome.mode ?? "standard",
    config: outcome.config,
    totalUsage: outcome.totalUsage,
    totalTokens: outcome.totalUsage.total_tokens,
    totalCostUsd: outcome.totalCostUsd,
    totalDurationMs: outcome.totalDurationMs,
    validationFailed,
    causalLedgerSummary: outcome.causalLedger
      ? {
        eventCount: outcome.causalLedger.events.length,
        firstEventId: outcome.causalLedger.events[0]?.id ?? null,
        lastEventId: outcome.causalLedger.events.at(-1)?.id ?? null,
        startEpisode: outcome.causalLedger.events[0]?.episode ?? null,
        endEpisode: outcome.causalLedger.events.at(-1)?.episode ?? null,
      }
      : null,
    causalLedgerAggregation,
    causalLedgerAggregationSummary: causalLedgerAggregation
      ? {
        episodeCount: causalLedgerAggregation.totalEpisodeCount,
        firstEpisode: causalLedgerAggregation.episodeSpan?.start ?? null,
        lastEpisode: causalLedgerAggregation.episodeSpan?.end ?? null,
        crossEpisodeLinkCount:
          causalLedgerAggregation.crossEpisode.totalLinkCount,
        unresolvedCrossEpisodeLinkCount:
          causalLedgerAggregation.crossEpisode.unresolvedLinkCount,
      }
      : null,
    foreshadowingVerificationItems,
    foreshadowVerificationInput,
    foreshadowContinuityVerifierReport,
    foreshadowVerificationVerdictSummary,
    foreshadowResolutionWindowSummary,
    foreshadowQualityGate,
    verification: outcome.verification,
    beliefInterpretationRecoveries: outcome.beliefInterpretationRecoveries,
    canonicalValidationFailures,
    causalLedgerValidation,
    contradictionValidation,
    chapters: outcome.chapters.map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      charCount: chapter.text.length,
      score: chapter.score,
      usage: chapter.usage,
      durationMs: chapter.durationMs,
      verification: chapter.verification,
      beliefInterpretationRecovery: chapter.beliefInterpretationRecovery,
      rendererRegenerationRequest: chapter.rendererRegenerationRequest,
    })),
  };
}

function toRelativeArtifactPath(rootDir: string, targetPath: string): string {
  return path.relative(rootDir, targetPath).split(path.sep).join("/");
}

function buildChapterGenerationRunMetadata(options: {
  artifactPaths: ChapterGenerationArtifactPaths;
  input: ChapterGenerationRunInput;
  workflowResult: NovelWorkflowRunResult<ChapterGenerationWorkflowPayload>;
  report: ChapterGenerationExecutionReport;
}): ChapterGenerationRunMetadata {
  const { artifactPaths, input, workflowResult, report } = options;

  return {
    schemaVersion: "chapter_generation_run_metadata.v1",
    workflow: "chapter_generation",
    runId: workflowResult.runId,
    seedTitle: input.seed.title,
    mode: report.mode,
    config: report.config,
    startedAt: workflowResult.startedAt,
    completedAt: workflowResult.completedAt,
    chapterRange: {
      startChapter: input.startChapter,
      endChapter: input.endChapter,
      generatedChapterCount: report.chapters.length,
    },
    totals: {
      totalTokens: report.totalTokens,
      totalCostUsd: report.totalCostUsd,
      totalDurationMs: report.totalDurationMs,
    },
    validation: {
      validationFailed: report.validationFailed,
      canonicalValidationFailureCount: report.canonicalValidationFailures.length,
      contradictionViolationCount:
        report.contradictionValidation.totalViolationCount,
      causalLedgerIssueCount: report.causalLedgerValidation.issueCount,
      foreshadowQualityGatePass: report.foreshadowQualityGate.pass,
    },
    artifactLayout: {
      resultFile: toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.resultFile),
      chaptersDir: toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.chaptersDir),
      summariesDir: toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.summariesDir),
      ledgersDir: toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.ledgersDir),
      rendererRegenerationDir: toRelativeArtifactPath(
        artifactPaths.outDir,
        artifactPaths.rendererRegenerationDir,
      ),
      metadataDir: toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.metadataDir),
      manifestFile: toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.manifestFile),
      runMetadataFile: toRelativeArtifactPath(
        artifactPaths.outDir,
        artifactPaths.runMetadataFile,
      ),
    },
  };
}

function buildChapterGenerationArtifactManifest(options: {
  artifactPaths: ChapterGenerationArtifactPaths;
  workflowResult: NovelWorkflowRunResult<ChapterGenerationWorkflowPayload>;
  report: ChapterGenerationExecutionReport;
}): ChapterGenerationArtifactManifest {
  const { artifactPaths, workflowResult, report } = options;

  return {
    schemaVersion: "chapter_generation_artifact_manifest.v1",
    workflow: "chapter_generation",
    runId: workflowResult.runId,
    generatedAt: workflowResult.completedAt,
    artifacts: {
      resultFile: toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.resultFile),
      runMetadataFile: toRelativeArtifactPath(
        artifactPaths.outDir,
        artifactPaths.runMetadataFile,
      ),
      chapters: report.chapters.map((chapter, index) => ({
        chapterNumber: chapter.chapterNumber,
        textFile: toRelativeArtifactPath(
          artifactPaths.outDir,
          artifactPaths.chapterFiles[index]!,
        ),
        summaryFile: toRelativeArtifactPath(
          artifactPaths.outDir,
          artifactPaths.summaryFiles[index]!,
        ),
        rendererRegenerationFile: chapter.rendererRegenerationRequest
          ? toRelativeArtifactPath(
            artifactPaths.outDir,
            path.join(
              artifactPaths.rendererRegenerationDir,
              `chapter-${String(chapter.chapterNumber).padStart(3, "0")}.json`,
            ),
          )
          : undefined,
      })),
      causalLedgerFile: artifactPaths.causalLedgerFile
        ? toRelativeArtifactPath(artifactPaths.outDir, artifactPaths.causalLedgerFile)
        : undefined,
      causalLedgerAggregationFile: artifactPaths.causalLedgerAggregationFile
        ? toRelativeArtifactPath(
          artifactPaths.outDir,
          artifactPaths.causalLedgerAggregationFile,
        )
        : undefined,
    },
  };
}

export function writeChapterGenerationArtifacts(options: {
  outDir: string;
  input: ChapterGenerationRunInput;
  workflowResult: NovelWorkflowRunResult<ChapterGenerationWorkflowPayload>;
  outcome: HarnessRunOutcome["result"];
  report: ChapterGenerationExecutionReport;
}): ChapterGenerationArtifactPaths {
  const resolvedOutDir = path.resolve(options.outDir);
  const chaptersDir = path.join(
    resolvedOutDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.chaptersDirName,
  );
  const summariesDir = path.join(
    resolvedOutDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.summariesDirName,
  );
  const ledgersDir = path.join(
    resolvedOutDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.ledgersDirName,
  );
  const rendererRegenerationDir = path.join(
    resolvedOutDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.rendererRegenerationDirName,
  );
  const metadataDir = path.join(
    resolvedOutDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
  );

  fs.mkdirSync(resolvedOutDir, { recursive: true });
  fs.mkdirSync(chaptersDir, { recursive: true });
  fs.mkdirSync(summariesDir, { recursive: true });
  fs.mkdirSync(ledgersDir, { recursive: true });
  fs.mkdirSync(rendererRegenerationDir, { recursive: true });
  fs.mkdirSync(metadataDir, { recursive: true });

  const artifactPaths: ChapterGenerationArtifactPaths = {
    outDir: resolvedOutDir,
    resultFile: path.join(resolvedOutDir, "result.json"),
    chaptersDir,
    summariesDir,
    ledgersDir,
    rendererRegenerationDir,
    metadataDir,
    manifestFile: path.join(
      metadataDir,
      CHAPTER_GENERATION_ARTIFACT_LAYOUT.manifestFileName,
    ),
    runMetadataFile: path.join(
      metadataDir,
      CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName,
    ),
    chapterFiles: [],
    summaryFiles: [],
    rendererRegenerationFiles: [],
  };

  for (const chapter of options.outcome.chapters) {
    const paddedChapter = String(chapter.chapterNumber).padStart(3, "0");
    const chapterFile = path.join(chaptersDir, `chapter-${paddedChapter}.txt`);
    const summaryFile = path.join(
      summariesDir,
      `chapter-${paddedChapter}.summary.json`,
    );

    artifactPaths.chapterFiles.push(chapterFile);
    artifactPaths.summaryFiles.push(summaryFile);

    if (chapter.rendererRegenerationRequest) {
      const rendererFile = path.join(
        rendererRegenerationDir,
        `chapter-${paddedChapter}.json`,
      );
      artifactPaths.rendererRegenerationFiles.push(rendererFile);
    }
  }

  if (options.outcome.causalLedger) {
    artifactPaths.causalLedgerFile = path.join(ledgersDir, "causal-ledger.json");
  }

  if (options.report.causalLedgerAggregation) {
    artifactPaths.causalLedgerAggregationFile = path.join(
      ledgersDir,
      "causal-ledger-aggregation.json",
    );
  }

  const runMetadata = buildChapterGenerationRunMetadata({
    artifactPaths,
    input: options.input,
    workflowResult: options.workflowResult,
    report: options.report,
  });

  const manifest = buildChapterGenerationArtifactManifest({
    artifactPaths,
    workflowResult: options.workflowResult,
    report: options.report,
  });
  const artifactBundle = buildChapterGenerationArtifactBundle({
    artifactPaths,
    report: options.report,
    outcome: options.outcome,
    runMetadata,
    manifest,
  });
  persistNovelArtifactBundle(artifactBundle);

  return artifactPaths;
}

export async function runEndToEndChapterGeneration(
  options: RunEndToEndChapterGenerationOptions,
): Promise<EndToEndChapterGenerationRunResult> {
  const rendererRegenerationRequests = new Map<number, RendererRegenerationRequest>();
  const workflowResult = await runChapterGenerationWorkflow({
    ...options,
    onLifecycleEvent: async (event) => {
      if (
        event.type === "source_event"
        && event.source === "harness"
        && isChapterCompleteHarnessEvent(event.payload)
        && event.payload.result.rendererRegenerationRequest
      ) {
        rendererRegenerationRequests.set(
          event.payload.result.chapterNumber,
          event.payload.result.rendererRegenerationRequest,
        );
      }

      await options.onLifecycleEvent?.(event);
    },
  });
  const outcome = workflowResult.payload?.outcome;

  if (!outcome) {
    throw new Error(
      workflowResult.errors[0]?.message
      ?? "Chapter generation workflow completed without an outcome payload.",
    );
  }

  const resultWithCapturedChapterArtifacts = {
    ...outcome.result,
    chapters: outcome.result.chapters.map((chapter) => ({
      ...chapter,
      rendererRegenerationRequest:
        chapter.rendererRegenerationRequest
        ?? rendererRegenerationRequests.get(chapter.chapterNumber),
    })),
  } satisfies HarnessResult;
  const normalizedOutcome = outcome.ok
    ? {
      ...outcome,
      result: resultWithCapturedChapterArtifacts,
    }
    : {
      ...outcome,
      result: resultWithCapturedChapterArtifacts,
    };

  const report = buildChapterGenerationExecutionReport(
    options.input.seed,
    normalizedOutcome.result,
  );
  const artifactPaths = options.outDir
    ? writeChapterGenerationArtifacts(
      {
        outDir: options.outDir,
        input: options.input,
        workflowResult,
        outcome: normalizedOutcome.result,
        report,
      },
    )
    : undefined;
  const artifactBundle = artifactPaths
    ? buildChapterGenerationArtifactBundle({
      artifactPaths,
      report,
      outcome: normalizedOutcome.result,
      runMetadata: buildChapterGenerationRunMetadata({
        artifactPaths,
        input: options.input,
        workflowResult,
        report,
      }),
      manifest: buildChapterGenerationArtifactManifest({
        artifactPaths,
        workflowResult,
        report,
      }),
    })
    : undefined;

  return {
    workflowResult,
    outcome: normalizedOutcome,
    report,
    artifactPaths,
    artifactBundle,
  };
}

export function assertEndToEndChapterGenerationPassed(
  result: EndToEndChapterGenerationRunResult,
): void {
  if (result.report.canonicalValidationFailures.length > 0) {
    throw new CanonicalValidationRunError(
      result.report.canonicalValidationFailures,
    );
  }

  if (!result.report.foreshadowQualityGate.pass) {
    throw new ForeshadowQualityGateRunError(result.report.foreshadowQualityGate);
  }

  if (!result.report.causalLedgerValidation.passed) {
    throw new CausalLedgerValidationRunError({
      code: "causal_ledger_validation_failed",
      summary:
        `Causal ledger validation failed with ${result.report.causalLedgerValidation.issueCount} `
        + "chronology contradiction(s).",
      issueCount: result.report.causalLedgerValidation.issueCount,
      validation: result.report.causalLedgerValidation,
    });
  }

  if (!result.report.contradictionValidation.passed) {
    throw new ContradictionValidationRunError({
      code: "contradiction_validation_failed",
      summary:
        `Contradiction validation failed with ${result.report.contradictionValidation.totalViolationCount} `
        + "aggregated violation(s) across belief/memory/utterance continuity checks.",
      validation: result.report.contradictionValidation,
    });
  }

  if (result.report.validationFailed) {
    throw new Error(
      "Simulation validation failed without canonical mismatch details.",
    );
  }
}

function isChapterCompleteHarnessEvent(
  payload: unknown,
): payload is Extract<HarnessEvent, { type: "chapter_complete" }> {
  return Boolean(
    payload
    && typeof payload === "object"
    && "type" in payload
    && payload.type === "chapter_complete",
  );
}
