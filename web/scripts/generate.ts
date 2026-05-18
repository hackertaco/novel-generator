#!/usr/bin/env tsx
/**
 * CLI entry point for the novel generation harness.
 *
 * Usage:
 *   npx tsx scripts/generate.ts --seed seed.json --chapters 1-5
 *   npx tsx scripts/generate.ts --config ./run.yml --preset budget
 *   npx tsx scripts/generate.ts --seed seed.json --chapters 1-10 --out ./output
 *
 * Options:
 *   --config <path>     Path to JSON/YAML CLI config file
 *   --seed <path>       Path to seed JSON/YAML file
 *   --chapters <range>  Chapter range, e.g. "1-5" or "1"
 *   --preset <name>     Config preset override: "default", "budget", "fast", "simple"
 *   --out <dir>         Output directory override for chapter files
 *   --budget <usd>      Budget limit override in USD
 *   --verbose           Print pipeline events (default: true)
 *   --quiet             Suppress pipeline events
 *   --renderer-regeneration-request <path>
 *                       JSON payload for renderer-only regeneration from an existing narrative snapshot
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import nextEnv from "@next/env";
import {
  buildCanonicalValidationFailureReport,
  getDefaultConfig,
  getBudgetConfig,
  getFastConfig,
  getSimpleConfig,
} from "../src/lib/harness";
import type {
  HarnessConfig,
  HarnessEvent,
  NovelHarness,
} from "../src/lib/harness";
import {
  CHAPTER_GENERATION_ARTIFACT_LAYOUT,
  CHAPTER_GENERATION_STAGE_CONTRACTS,
  CausalLedgerValidationRunError,
  CanonicalValidationRunError,
  ContradictionValidationRunError,
  ForeshadowQualityGateRunError,
  type NovelWorkflowLifecycleEvent,
  type NovelWorkflowStageId,
  type WorkflowStageContract,
} from "../src/lib/orchestration";
import type {
  CausalLedgerValidationRunReport,
  CanonicalValidationRunReport,
  ContradictionValidationRunReport,
  ForeshadowQualityGateRunReport,
} from "../src/lib/orchestration";
import {
  ChapterGenerationWorkflowRunError,
  getChapterGenerationPipelineExitCode,
  resolveChapterGenerationRunRequest,
  runChapterGenerationPipeline,
  type ChapterGenerationPipelineExitCodeValue,
} from "../src/lib/cli/pipeline-run";

export type CanonicalValidationCliReport = CanonicalValidationRunReport;
export type ForeshadowQualityGateCliReport = ForeshadowQualityGateRunReport;
export type CausalLedgerValidationCliReport = CausalLedgerValidationRunReport;
export type ContradictionValidationCliReport = ContradictionValidationRunReport;

const CanonicalValidationCliError = CanonicalValidationRunError;
const ForeshadowQualityGateCliError = ForeshadowQualityGateRunError;
const CausalLedgerValidationCliError = CausalLedgerValidationRunError;
const ContradictionValidationCliError = ContradictionValidationRunError;

export {
  CanonicalValidationCliError,
  ForeshadowQualityGateCliError,
  CausalLedgerValidationCliError,
  ContradictionValidationCliError,
};

export interface GenerateCliIo {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  write: (chunk: string) => void;
}

export interface RunGenerateCliOptions {
  args?: string[];
  io?: GenerateCliIo;
  createHarness?: (config: HarnessConfig) => Pick<NovelHarness, "run">;
  resolveConfig?: (preset: string) => HarnessConfig;
}

interface GenerateCliReportingState {
  runId: string | null;
  warningCount: number;
  errorCount: number;
  stageContracts: WorkflowStageContract[];
}

const defaultIo: GenerateCliIo = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  write: (chunk) => {
    process.stdout.write(chunk);
  },
};

function createGenerateCliReportingState(): GenerateCliReportingState {
  return {
    runId: null,
    warningCount: 0,
    errorCount: 0,
    stageContracts: CHAPTER_GENERATION_STAGE_CONTRACTS,
  };
}

function resolveStageLabel(
  stage: NovelWorkflowStageId,
  reporting: GenerateCliReportingState,
): string {
  return reporting.stageContracts.find((contract) => contract.id === stage)?.label
    ?? stage;
}

function formatStageDetails(
  stage: NovelWorkflowStageId,
  details?: Record<string, unknown>,
): string | null {
  if (!details) {
    return null;
  }

  switch (stage) {
    case "resolve_run_input":
      if (
        typeof details.startChapter === "number"
        && typeof details.endChapter === "number"
      ) {
        return `chapters=${details.startChapter}-${details.endChapter}`;
      }
      return null;
    case "resolve_config": {
      const parts: string[] = [];
      if (typeof details.preset === "string") {
        parts.push(`preset=${details.preset}`);
      }
      if (typeof details.configName === "string") {
        parts.push(`config=${details.configName}`);
      }
      return parts.join(", ") || null;
    }
    case "simulate_episodes":
      return typeof details.chapterCount === "number"
        ? `chapters=${details.chapterCount}`
        : null;
    case "render_output":
      return typeof details.generatedChapterCount === "number"
        ? `rendered=${details.generatedChapterCount}`
        : null;
    case "verify_output":
      return typeof details.canonicalValidationFailureCount === "number"
        ? `canonicalFailures=${details.canonicalValidationFailureCount}`
        : null;
    case "finalize_output": {
      const parts: string[] = [];
      if (typeof details.totalCostUsd === "number") {
        parts.push(`cost=$${details.totalCostUsd.toFixed(4)}`);
      }
      if (typeof details.totalDurationMs === "number") {
        parts.push(`duration=${(details.totalDurationMs / 1000).toFixed(1)}s`);
      }
      return parts.join(", ") || null;
    }
    default:
      return null;
  }
}

function emitLifecycleEventToCli(
  event: NovelWorkflowLifecycleEvent,
  io: GenerateCliIo,
  reporting: GenerateCliReportingState,
  verbose: boolean,
): void {
  switch (event.type) {
    case "run_started":
      reporting.runId = event.runId;
      reporting.stageContracts = event.stageContracts;
      io.log(`[workflow:start] ${event.workflow} runId=${event.runId}`);
      break;
    case "stage_started":
      io.log(
        `[stage:start] ${resolveStageLabel(event.stage, reporting)}`
        + ` [${event.stage}]`,
      );
      break;
    case "stage_progress":
      if (verbose) {
        io.log(
          `  [stage:progress] ${resolveStageLabel(event.stage, reporting)}`
          + ` — ${event.message}`,
        );
      }
      break;
    case "stage_completed": {
      const details = formatStageDetails(event.stage, event.details);
      io.log(
        `[stage:done] ${resolveStageLabel(event.stage, reporting)}`
        + ` [${event.stage}]`
        + (details ? ` (${details})` : ""),
      );
      break;
    }
    case "run_failed":
      reporting.runId = event.runId;
      reporting.errorCount += 1;
      io.error(
        `[workflow:failed] ${resolveStageLabel(event.error.stage, reporting)}`
        + ` [${event.error.code}] ${event.error.message}`,
      );
      break;
    case "run_completed":
      reporting.runId = event.runId;
      reporting.errorCount += event.errorCount;
      io.log(
        `[workflow:done] ${event.workflow} ok=${event.ok}`
        + ` errors=${event.errorCount}`,
      );
      break;
    default:
      break;
  }
}

function emitFailureArtifactSummary(
  outDir: string,
  io: Pick<GenerateCliIo, "error">,
  reporting: GenerateCliReportingState,
): void {
  const resultFile = path.join(outDir, "result.json");
  const metadataDir = path.join(
    outDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
  );
  const manifestFile = path.join(
    metadataDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.manifestFileName,
  );
  const runMetadataFile = path.join(
    metadataDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName,
  );
  const causalLedgerFile = path.join(
    outDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.ledgersDirName,
    "causal-ledger.json",
  );
  const causalLedgerAggregationFile = path.join(
    outDir,
    CHAPTER_GENERATION_ARTIFACT_LAYOUT.ledgersDirName,
    "causal-ledger-aggregation.json",
  );

  io.error("\n실패 요약");
  if (reporting.runId) {
    io.error(`   runId: ${reporting.runId}`);
  }
  io.error(`   output dir: ${outDir}`);
  if (fs.existsSync(resultFile)) {
    io.error(`   partial result: ${resultFile}`);
  }
  if (fs.existsSync(runMetadataFile)) {
    io.error(`   run metadata: ${runMetadataFile}`);
  }
  if (fs.existsSync(manifestFile)) {
    io.error(`   artifact manifest: ${manifestFile}`);
  }
  if (fs.existsSync(causalLedgerFile)) {
    io.error(`   causal ledger: ${causalLedgerFile}`);
  }
  if (fs.existsSync(causalLedgerAggregationFile)) {
    io.error(`   causal ledger aggregation: ${causalLedgerAggregationFile}`);
  }
}

export function emitCanonicalValidationCliReport(
  report: CanonicalValidationCliReport,
  io: Pick<GenerateCliIo, "error"> = defaultIo,
): void {
  io.error(`\n  ❌ ${report.chapter}화 canonical validation failure`);
  io.error(`     요약: ${report.summary}`);

  for (const failure of report.uncausedMismatchFailures) {
    const objectiveFactIds = failure.failureContext.objectiveFactIds.join(", ") || "none";
    const allowedKinds = failure.missingCause.allowedKinds.join(", ") || "none";
    io.error(
      `     [${failure.code}] ${failure.mismatch.recordType}/${failure.mismatch.recordId}`
      + ` character=${failure.mismatch.characterId}`
      + ` mismatch=${failure.mismatch.mismatchType}`
      + ` required=${failure.missingCause.required}`
      + ` allowedKinds=${allowedKinds}`
      + ` objectiveFacts=${objectiveFactIds}`,
    );
  }

  io.error("     canonicalFailurePayload:");
  for (const line of JSON.stringify(report, null, 2).split("\n")) {
    io.error(`       ${line}`);
  }
}

export function emitForeshadowQualityGateCliReport(
  report: ForeshadowQualityGateCliReport,
  io: Pick<GenerateCliIo, "error"> = defaultIo,
): void {
  io.error("\n  ❌ foreshadow quality gate failure");
  io.error(`     요약: ${report.summary}`);
  io.error(
    `     온타임 회수: ${report.resolvedWithinWindowItemCount}/${report.eligibleRegisteredItemCount}`
    + ` (${report.resolutionPercentage.toFixed(2)}%)`
    + `, 기준: ${report.thresholdPercentage.toFixed(2)}%`,
  );
  io.error(
    `     상태: pending=${report.pendingItemCount}, missed=${report.missedItemCount},`
    + ` expired=${report.expiredItemCount}, intentionallyAbandoned=${report.intentionallyAbandonedItemCount}`,
  );
  io.error("     foreshadowQualityGatePayload:");
  for (const line of JSON.stringify(report, null, 2).split("\n")) {
    io.error(`       ${line}`);
  }
}

export function emitCausalLedgerValidationCliReport(
  report: CausalLedgerValidationCliReport,
  io: Pick<GenerateCliIo, "error"> = defaultIo,
): void {
  io.error("\n  ❌ causal ledger chronology validation failure");
  io.error(`     요약: ${report.summary}`);
  for (const issue of report.validation.issues.slice(0, 5)) {
    io.error(
      `     [${issue.code}] event=${issue.eventId}`
      + ` episode=${issue.episode}`
      + ` message=${issue.message}`,
    );
  }
  io.error("     causalLedgerValidationPayload:");
  for (const line of JSON.stringify(report.validation, null, 2).split("\n")) {
    io.error(`       ${line}`);
  }
}

export function emitContradictionValidationCliReport(
  report: ContradictionValidationCliReport,
  io: Pick<GenerateCliIo, "error"> = defaultIo,
): void {
  io.error("\n  ❌ contradiction validation failure");
  io.error(`     요약: ${report.summary}`);
  io.error(
    `     분류: belief=${report.validation.counts.belief},`
    + ` memory=${report.validation.counts.memory},`
    + ` utterance=${report.validation.counts.utterance},`
    + ` continuity=${report.validation.counts.continuity}`,
  );

  for (const violation of report.validation.beliefViolations.slice(0, 2)) {
    io.error(
      `     [belief/${violation.contradictionType}] ${violation.characterId}/${violation.recordId}`
      + ` chapters=${violation.firstDetectedChapter}-${violation.lastDetectedChapter}`
      + ` message=${violation.summary}`,
    );
  }

  for (const violation of report.validation.memoryViolations.slice(0, 2)) {
    io.error(
      `     [memory/${violation.contradictionType}] ${violation.characterId}/${violation.recordId}`
      + ` chapters=${violation.firstDetectedChapter}-${violation.lastDetectedChapter}`
      + ` message=${violation.summary}`,
    );
  }

  for (const violation of report.validation.continuityViolations.slice(0, 2)) {
    io.error(
      `     [continuity/${violation.code}] event=${violation.eventId}`
      + ` episode=${violation.episode}`
      + ` message=${violation.summary}`,
    );
  }

  io.error("     contradictionValidationPayload:");
  for (const line of JSON.stringify(report.validation, null, 2).split("\n")) {
    io.error(`       ${line}`);
  }
}

export function handleGenerateCliFailure(
  error: unknown,
  io: Pick<GenerateCliIo, "error"> = defaultIo,
): ChapterGenerationPipelineExitCodeValue {
  if (error instanceof CanonicalValidationCliError) {
    for (const report of error.reports) {
      emitCanonicalValidationCliReport(report, io);
    }
    return getChapterGenerationPipelineExitCode(error);
  }

  if (error instanceof ForeshadowQualityGateCliError) {
    emitForeshadowQualityGateCliReport(error.report, io);
    return getChapterGenerationPipelineExitCode(error);
  }

  if (error instanceof CausalLedgerValidationCliError) {
    emitCausalLedgerValidationCliReport(error.report, io);
    return getChapterGenerationPipelineExitCode(error);
  }

  if (error instanceof ContradictionValidationCliError) {
    emitContradictionValidationCliReport(error.report, io);
    return getChapterGenerationPipelineExitCode(error);
  }

  if (error instanceof ChapterGenerationWorkflowRunError) {
    io.error(
      "Workflow error:",
      `[${error.workflowError.code}]`,
      error.workflowError.message,
    );
    io.error(
      `Last stage: ${error.workflowError.stage}`
      + `, runId: ${error.workflowResult.runId}`,
    );
    return getChapterGenerationPipelineExitCode(error);
  }

  io.error(
    "Fatal error:",
    error instanceof Error ? error.message : String(error),
  );
  if (error instanceof Error && error.stack) {
    io.error(error.stack);
  }
  return getChapterGenerationPipelineExitCode(error);
}

export async function runGenerateCli(options: RunGenerateCliOptions = {}): Promise<void> {
  const { loadEnvConfig } = nextEnv;
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const io = options.io ?? defaultIo;
  const resolveConfig = options.resolveConfig ?? ((preset: string) => {
    switch (preset) {
      case "budget":
        return getBudgetConfig();
      case "fast":
        return getFastConfig();
      case "simple":
        return getSimpleConfig();
      default:
        return getDefaultConfig();
    }
  });
  const normalizedRequest = resolveChapterGenerationRunRequest({
    args: options.args,
    cwd: process.cwd(),
  });
  const reporting = createGenerateCliReportingState();
  const previewConfig = resolveConfig(normalizedRequest.command.preset);
  const canonicalValidationFailuresByChapter = new Map<number, CanonicalValidationCliReport>();

  // Create output directory
  const outDir = normalizedRequest.command.outDir;
  fs.mkdirSync(outDir, { recursive: true });

  io.log("\n📖 소설 생성 하네스");
  io.log(`   설정: ${previewConfig.name}`);
  io.log(`   시드: ${normalizedRequest.seed.title}`);
  io.log(
    `   범위: ${normalizedRequest.input.startChapter}~${normalizedRequest.input.endChapter}화`,
  );
  io.log(`   출력: ${outDir}`);
  if (normalizedRequest.command.budgetUsd !== null) {
    io.log(`   예산: $${normalizedRequest.command.budgetUsd}`);
  } else if (previewConfig.budgetUsd) {
    io.log(`   예산: $${previewConfig.budgetUsd}`);
  }
  if (normalizedRequest.rendererRegeneration) {
    io.log(
      "   모드: renderer_regeneration "
      + `(${normalizedRequest.rendererRegeneration.snapshot.chapterNumber}화 snapshot)`,
    );
  }
  io.log("");

  const startTime = Date.now();
  let execution;
  try {
    execution = await runChapterGenerationPipeline({
      request: normalizedRequest,
      createHarness: options.createHarness,
      resolveConfig: (preset: string) => {
        const config = resolveConfig(preset);
        if (normalizedRequest.command.budgetUsd !== null) {
          config.budgetUsd = normalizedRequest.command.budgetUsd;
        }
        config.output = { mode: "file", dir: outDir, verbose: false };
        return config;
      },
      onLifecycleEvent: async (event) => {
        emitLifecycleEventToCli(
          event,
          io,
          reporting,
          normalizedRequest.command.verbose,
        );

        if (event.type !== "source_event" || event.source !== "harness") {
          return;
        }

        const harnessEvent = event.payload as HarnessEvent;
        switch (harnessEvent.type) {
          case "chapter_start":
            if (normalizedRequest.command.verbose) {
              io.log(`\n--- ${harnessEvent.chapter}화 생성 시작 ---`);
            }
            break;
          case "pipeline_event":
            if (
              normalizedRequest.command.verbose
              && harnessEvent.event.type === "stage_change"
            ) {
              io.write(`  [${harnessEvent.event.stage}] `);
            }
            break;
          case "chapter_complete": {
            const result = harnessEvent.result;
            const validationReport = result.verification
              ? buildCanonicalValidationFailureReport(
                result.chapterNumber,
                result.verification,
              )
              : null;

            io.log(`\n  ✅ ${result.chapterNumber}화 완료`);
            io.log(`     분량: ${result.text.length.toLocaleString()}자`);
            io.log(`     점수: ${Math.round(result.score * 100)}점`);
            io.log(`     토큰: ${result.usage.total_tokens.toLocaleString()}`);
            io.log(`     비용: $${result.usage.cost_usd.toFixed(4)}`);
            io.log(`     시간: ${(result.durationMs / 1000).toFixed(1)}초`);
            if (result.beliefInterpretationRecovery) {
              const recovery = result.beliefInterpretationRecovery;
              io.log(
                `     belief recovery: ${recovery.status} `
                + `(대상 ${recovery.targetedBeliefIds.length}, 재계산 기억 ${recovery.selectedMemoryIds.length}, `
                + `남은 실패 ${recovery.unresolvedBeliefIds.length})`,
              );
            }
            if (result.verification) {
              io.log(
                `     검증: ${result.verification.passed ? "통과" : "실패"} `
                + `(허용 예외 ${result.verification.allowedExceptionCount}, 치명 모순 ${result.verification.invalidContradictionCount})`,
              );

              if (validationReport) {
                canonicalValidationFailuresByChapter.set(
                  result.chapterNumber,
                  validationReport,
                );
              }

              if (result.verification.allowedExceptionCount > 0) {
                reporting.warningCount += result.verification.allowedExceptionCount;
                io.log(
                  `     warning: allowed verification exceptions=${result.verification.allowedExceptionCount}`,
                );
              }

              if (result.verification.invalidContradictionCount > 0) {
                reporting.errorCount += result.verification.invalidContradictionCount;
                io.error(
                  `     error: invalid contradictions=${result.verification.invalidContradictionCount}`,
                );
              }

              for (const mismatch of result.verification.allowedExceptions.slice(0, 2)) {
                io.log(
                  `     warning: ${mismatch.characterId}/${mismatch.recordType} — ${mismatch.explanation}`,
                );
              }

              for (const mismatch of result.verification.invalidContradictions.slice(0, 2)) {
                io.error(
                  `     error: ${mismatch.characterId}/${mismatch.recordType} — ${mismatch.explanation}`,
                );
              }
            }
            break;
          }
          case "error": {
            const canonicalValidationReport = canonicalValidationFailuresByChapter.get(
              harnessEvent.chapter,
            );
            if (
              canonicalValidationReport
              && harnessEvent.message === canonicalValidationReport.summary
            ) {
              break;
            }

            reporting.errorCount += 1;
            io.error(`\n  ❌ ${harnessEvent.chapter}화 에러: ${harnessEvent.message}`);
            break;
          }
          default:
            break;
        }
      },
    });
  } catch (error) {
    emitFailureArtifactSummary(outDir, io, reporting);
    throw error;
  }

  const d = execution.execution.outcome.result;
  io.log(`\n${"=".repeat(50)}`);
  io.log(`📊 결과 요약 (${d.config})`);
  io.log(`   runId: ${reporting.runId ?? execution.execution.workflowResult.runId}`);
  io.log(`   총 ${d.chapters.length}화 생성`);
  io.log(`   총 토큰: ${d.totalUsage.total_tokens.toLocaleString()}`);
  io.log(`   총 비용: $${d.totalCostUsd.toFixed(4)}`);
  io.log(`   총 시간: ${(d.totalDurationMs / 1000).toFixed(1)}초`);
  io.log(`   평균 점수: ${Math.round(d.chapters.reduce((s, c) => s + c.score, 0) / d.chapters.length * 100)}점`);
  io.log(`   warnings: ${reporting.warningCount}`);
  io.log(`   output dir: ${execution.execution.artifactPaths?.outDir ?? outDir}`);
  if (execution.execution.artifactPaths?.resultFile) {
    io.log(`   result.json: ${execution.execution.artifactPaths.resultFile}`);
  }
  if (execution.execution.artifactPaths?.runMetadataFile) {
    io.log(`   run metadata: ${execution.execution.artifactPaths.runMetadataFile}`);
  }
  if (execution.execution.artifactPaths?.manifestFile) {
    io.log(`   artifact manifest: ${execution.execution.artifactPaths.manifestFile}`);
  }
  if (execution.execution.artifactPaths?.causalLedgerFile) {
    io.log(`   causal ledger: ${execution.execution.artifactPaths.causalLedgerFile}`);
  }
  if (execution.execution.artifactPaths?.causalLedgerAggregationFile) {
    io.log(
      `   causal ledger aggregation: ${execution.execution.artifactPaths.causalLedgerAggregationFile}`,
    );
  }
  if (execution.execution.artifactPaths?.rendererRegenerationFiles.length) {
    io.log(
      `   renderer state files: ${execution.execution.artifactPaths.rendererRegenerationFiles.length}`,
    );
    for (const artifactPath of execution.execution.artifactPaths.rendererRegenerationFiles) {
      io.log(`   renderer state: ${artifactPath}`);
    }
  }
  io.log(`${"=".repeat(50)}\n`);
  io.log(`완료! (${((Date.now() - startTime) / 1000).toFixed(1)}초)`);
}

async function main(): Promise<void> {
  try {
    await runGenerateCli();
  } catch (error) {
    process.exitCode = handleGenerateCliFailure(error);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedFile === currentFile) {
  void main();
}
