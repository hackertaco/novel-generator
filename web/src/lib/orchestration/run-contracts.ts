import type { LongFormVerificationExecutionResult } from "../harness";
import { buildNovelWorkflowArtifactReferences } from "../novel-engine/artifacts";
import type { ChapterGenerationExecutionReport, EndToEndChapterGenerationRunResult } from "./end-to-end";
import type {
  ChapterGenerationRunInput,
  LongFormVerificationRunInput,
  NovelWorkflowError,
  NovelWorkflowKind,
  NovelWorkflowRunResult,
  NovelWorkflowStageId,
  NovelWorkflowStageRecord,
} from "./contracts";
import type { LongFormVerificationWorkflowPayload } from "./workflow";

export interface ChapterGenerationProgrammaticRunOptions {
  preset: string;
  outDir?: string;
  verbose: boolean;
  budgetUsd: number | null;
  qualityThreshold?: number;
  maxAttempts?: number;
}

export interface LongFormVerificationProgrammaticRunOptions {
  preset: string;
  outDir?: string;
  verbose: boolean;
  budgetUsd: number | null;
}

export interface ChapterGenerationProgrammaticRunRequest {
  input: ChapterGenerationRunInput;
  options: ChapterGenerationProgrammaticRunOptions;
}

export interface LongFormVerificationProgrammaticRunRequest {
  input: LongFormVerificationRunInput;
  options: LongFormVerificationProgrammaticRunOptions;
}

export type ProgrammaticNovelRunRequest =
  | ChapterGenerationProgrammaticRunRequest
  | LongFormVerificationProgrammaticRunRequest;

export interface NovelWorkflowRunProgressMetadata {
  status: "pending" | "running" | "completed" | "failed";
  totalStageCount: number;
  pendingStageCount: number;
  runningStageCount: number;
  completedStageCount: number;
  failedStageCount: number;
  completionPercent: number;
  currentStage: NovelWorkflowStageId | null;
  stageRecords: NovelWorkflowStageRecord[];
}

export type NovelWorkflowArtifactKind = "file" | "directory";

export type NovelWorkflowArtifactRole =
  | "output_directory"
  | "result_file"
  | "run_metadata_file"
  | "artifact_manifest_file"
  | "chapters_directory"
  | "chapter_text"
  | "summaries_directory"
  | "chapter_summary"
  | "ledgers_directory"
  | "causal_ledger_file"
  | "causal_ledger_aggregation_file"
  | "renderer_regeneration_directory"
  | "renderer_regeneration_state"
  | "metadata_directory"
  | "verification_report_file"
  | "verification_scenario_seed_file"
  | "acceptance_criteria_results_file";

export interface NovelWorkflowArtifactReference {
  id: string;
  role: NovelWorkflowArtifactRole;
  label: string;
  kind: NovelWorkflowArtifactKind;
  path: string;
  contentType?: string;
  chapterNumber?: number;
}

export interface ChapterGenerationRunStateMetadata {
  workflow: "chapter_generation";
  mode: ChapterGenerationExecutionReport["mode"];
  configName: string;
  startedAt: string;
  completedAt: string;
  validationFailed: boolean;
  chapterRange: {
    startChapter: number;
    endChapter: number;
    requestedChapterCount: number;
    generatedChapterCount: number;
  };
  totals: {
    totalTokens: number;
    totalCostUsd: number;
    totalDurationMs: number;
  };
  verification: {
    canonicalValidationFailureCount: number;
    contradictionViolationCount: number;
    causalLedgerIssueCount: number;
    foreshadowQualityGatePassed: boolean;
  };
}

export interface LongFormVerificationRunStateMetadata {
  workflow: "long_form_verification";
  configName: string;
  startedAt: string;
  completedAt: string;
  validationFailed: boolean;
  scenario: {
    id: string;
    totalEpisodes: number;
    continuityCheckpointCount: number;
    expectedMismatchAttributionCount: number;
  };
  totals: {
    totalTokens: number;
    totalCostUsd: number;
    totalDurationMs: number;
    generatedEpisodes: number;
  };
  verification: {
    canonicalValidationFailureCount: number;
    contradictionViolationCount: number;
    causalLedgerIssueCount: number;
    chapterVerificationPassed: boolean;
    finalVerificationPassed: boolean;
    passed: boolean;
  };
  acceptanceCriteria: {
    passedCount: number;
    failedCount: number;
    totalCount: number;
    overallPassed: boolean;
  };
}

export interface ChapterGenerationProgrammaticRunResponse {
  ok: boolean;
  workflow: "chapter_generation";
  runId: string;
  request: ChapterGenerationProgrammaticRunRequest;
  progress: NovelWorkflowRunProgressMetadata;
  state: ChapterGenerationRunStateMetadata;
  artifacts: NovelWorkflowArtifactReference[];
  report: ChapterGenerationExecutionReport;
  errors: NovelWorkflowError[];
}

export interface LongFormVerificationProgrammaticRunResponse {
  ok: boolean;
  workflow: "long_form_verification";
  runId: string;
  request: LongFormVerificationProgrammaticRunRequest;
  progress: NovelWorkflowRunProgressMetadata;
  state: LongFormVerificationRunStateMetadata;
  result: LongFormVerificationExecutionResult;
  artifacts: NovelWorkflowArtifactReference[];
  errors: NovelWorkflowError[];
}

export type ProgrammaticNovelRunResponse =
  | ChapterGenerationProgrammaticRunResponse
  | LongFormVerificationProgrammaticRunResponse;

function cloneStageRecord(record: NovelWorkflowStageRecord): NovelWorkflowStageRecord {
  return {
    ...record,
    dependsOn: [...record.dependsOn],
    components: [...record.components],
    details: record.details ? { ...record.details } : undefined,
  };
}

export function buildNovelWorkflowRunProgressMetadata(
  stageRecords: NovelWorkflowStageRecord[],
): NovelWorkflowRunProgressMetadata {
  const clonedRecords = stageRecords.map(cloneStageRecord);
  const totalStageCount = clonedRecords.length;
  const pendingStageCount = clonedRecords.filter((record) => record.status === "pending").length;
  const runningStageCount = clonedRecords.filter((record) => record.status === "running").length;
  const completedStageCount = clonedRecords.filter((record) => record.status === "completed").length;
  const failedStageCount = clonedRecords.filter((record) => record.status === "failed").length;
  const currentStage = clonedRecords.find((record) => record.status === "running")?.stage
    ?? clonedRecords.find((record) => record.status === "failed")?.stage
    ?? null;
  const status = failedStageCount > 0
    ? "failed"
    : runningStageCount > 0
      ? "running"
      : completedStageCount === totalStageCount
        ? "completed"
        : "pending";

  return {
    status,
    totalStageCount,
    pendingStageCount,
    runningStageCount,
    completedStageCount,
    failedStageCount,
    completionPercent: totalStageCount === 0
      ? 0
      : Math.round((completedStageCount / totalStageCount) * 10000) / 100,
    currentStage,
    stageRecords: clonedRecords,
  };
}

export function createChapterGenerationProgrammaticRunRequest(options: {
  input: ChapterGenerationRunInput;
  preset?: string;
  outDir?: string;
  verbose?: boolean;
  budgetUsd?: number | null;
  qualityThreshold?: number;
  maxAttempts?: number;
}): ChapterGenerationProgrammaticRunRequest {
  return {
    input: {
      ...options.input,
    },
    options: {
      preset: options.preset ?? options.input.preset ?? "default",
      outDir: options.outDir,
      verbose: options.verbose ?? true,
      budgetUsd: options.budgetUsd ?? options.input.budgetUsd ?? null,
      qualityThreshold: options.qualityThreshold,
      maxAttempts: options.maxAttempts,
    },
  };
}

export function createLongFormVerificationProgrammaticRunRequest(options: {
  input: LongFormVerificationRunInput;
  preset?: string;
  outDir?: string;
  verbose?: boolean;
  budgetUsd?: number | null;
}): LongFormVerificationProgrammaticRunRequest {
  return {
    input: {
      ...options.input,
    },
    options: {
      preset: options.preset ?? options.input.preset ?? "default",
      outDir: options.outDir ?? options.input.outDir,
      verbose: options.verbose ?? options.input.verbose ?? true,
      budgetUsd: options.budgetUsd ?? options.input.budgetUsd ?? null,
    },
  };
}

function buildChapterGenerationArtifactReferences(
  result: EndToEndChapterGenerationRunResult,
): NovelWorkflowArtifactReference[] {
  if (result.artifactBundle) {
    return buildNovelWorkflowArtifactReferences(result.artifactBundle);
  }

  const artifactPaths = result.artifactPaths;
  if (!artifactPaths) {
    return [];
  }

  const references: NovelWorkflowArtifactReference[] = [
    {
      id: "output_directory",
      role: "output_directory",
      label: "Output Directory",
      kind: "directory",
      path: artifactPaths.outDir,
    },
    {
      id: "result_file",
      role: "result_file",
      label: "Run Result JSON",
      kind: "file",
      path: artifactPaths.resultFile,
      contentType: "application/json",
    },
    {
      id: "chapters_directory",
      role: "chapters_directory",
      label: "Chapter Text Directory",
      kind: "directory",
      path: artifactPaths.chaptersDir,
    },
    {
      id: "summaries_directory",
      role: "summaries_directory",
      label: "Chapter Summary Directory",
      kind: "directory",
      path: artifactPaths.summariesDir,
    },
    {
      id: "ledgers_directory",
      role: "ledgers_directory",
      label: "Ledger Directory",
      kind: "directory",
      path: artifactPaths.ledgersDir,
    },
    {
      id: "renderer_regeneration_directory",
      role: "renderer_regeneration_directory",
      label: "Renderer Regeneration Directory",
      kind: "directory",
      path: artifactPaths.rendererRegenerationDir,
    },
    {
      id: "metadata_directory",
      role: "metadata_directory",
      label: "Metadata Directory",
      kind: "directory",
      path: artifactPaths.metadataDir,
    },
    {
      id: "run_metadata_file",
      role: "run_metadata_file",
      label: "Run Metadata JSON",
      kind: "file",
      path: artifactPaths.runMetadataFile,
      contentType: "application/json",
    },
    {
      id: "artifact_manifest_file",
      role: "artifact_manifest_file",
      label: "Artifact Manifest JSON",
      kind: "file",
      path: artifactPaths.manifestFile,
      contentType: "application/json",
    },
  ];

  artifactPaths.chapterFiles.forEach((artifactPath, index) => {
    const chapterNumber = result.report.chapters[index]?.chapterNumber;
    references.push({
      id: `chapter_text:${chapterNumber ?? index + 1}`,
      role: "chapter_text",
      label: `Chapter ${chapterNumber ?? index + 1} Text`,
      kind: "file",
      path: artifactPath,
      contentType: "text/plain",
      chapterNumber,
    });
  });

  artifactPaths.summaryFiles.forEach((artifactPath, index) => {
    const chapterNumber = result.report.chapters[index]?.chapterNumber;
    references.push({
      id: `chapter_summary:${chapterNumber ?? index + 1}`,
      role: "chapter_summary",
      label: `Chapter ${chapterNumber ?? index + 1} Summary`,
      kind: "file",
      path: artifactPath,
      contentType: "application/json",
      chapterNumber,
    });
  });

  artifactPaths.rendererRegenerationFiles.forEach((artifactPath, index) => {
    const chapterNumber = result.report.chapters
      .filter((chapter) => chapter.rendererRegenerationRequest)
      [index]?.chapterNumber;
    references.push({
      id: `renderer_regeneration_state:${chapterNumber ?? index + 1}`,
      role: "renderer_regeneration_state",
      label: `Renderer Regeneration State ${chapterNumber ?? index + 1}`,
      kind: "file",
      path: artifactPath,
      contentType: "application/json",
      chapterNumber,
    });
  });

  if (artifactPaths.causalLedgerFile) {
    references.push({
      id: "causal_ledger_file",
      role: "causal_ledger_file",
      label: "Causal Ledger JSON",
      kind: "file",
      path: artifactPaths.causalLedgerFile,
      contentType: "application/json",
    });
  }

  if (artifactPaths.causalLedgerAggregationFile) {
    references.push({
      id: "causal_ledger_aggregation_file",
      role: "causal_ledger_aggregation_file",
      label: "Causal Ledger Aggregation JSON",
      kind: "file",
      path: artifactPaths.causalLedgerAggregationFile,
      contentType: "application/json",
    });
  }

  return references;
}

function buildLongFormVerificationArtifactReferences(
  result: LongFormVerificationExecutionResult,
): NovelWorkflowArtifactReference[] {
  if (result.artifactBundle) {
    return buildNovelWorkflowArtifactReferences(result.artifactBundle);
  }

  return [
    {
      id: "output_directory",
      role: "output_directory",
      label: "Output Directory",
      kind: "directory",
      path: result.artifactPaths.outDir,
    },
    {
      id: "verification_report_file",
      role: "verification_report_file",
      label: "Long-Form Verification Report",
      kind: "file",
      path: result.artifactPaths.reportFile,
      contentType: "application/json",
    },
    {
      id: "result_file",
      role: "result_file",
      label: "Long-Form Verification Result JSON",
      kind: "file",
      path: result.artifactPaths.resultFile,
      contentType: "application/json",
    },
    {
      id: "verification_scenario_seed_file",
      role: "verification_scenario_seed_file",
      label: "Verification Scenario Seed",
      kind: "file",
      path: result.artifactPaths.scenarioSeedFile,
      contentType: "application/json",
    },
    {
      id: "acceptance_criteria_results_file",
      role: "acceptance_criteria_results_file",
      label: "Acceptance Criteria Results",
      kind: "file",
      path: result.artifactPaths.acceptanceCriteriaFile,
      contentType: "application/json",
    },
  ];
}

function buildChapterGenerationStateMetadata(
  request: ChapterGenerationProgrammaticRunRequest,
  result: EndToEndChapterGenerationRunResult,
): ChapterGenerationRunStateMetadata {
  return {
    workflow: "chapter_generation",
    mode: result.report.mode,
    configName: result.report.config,
    startedAt: result.workflowResult.startedAt,
    completedAt: result.workflowResult.completedAt,
    validationFailed: result.report.validationFailed,
    chapterRange: {
      startChapter: request.input.startChapter,
      endChapter: request.input.endChapter,
      requestedChapterCount:
        request.input.endChapter - request.input.startChapter + 1,
      generatedChapterCount: result.report.chapters.length,
    },
    totals: {
      totalTokens: result.report.totalTokens,
      totalCostUsd: result.report.totalCostUsd,
      totalDurationMs: result.report.totalDurationMs,
    },
    verification: {
      canonicalValidationFailureCount:
        result.report.canonicalValidationFailures.length,
      contradictionViolationCount:
        result.report.contradictionValidation.totalViolationCount,
      causalLedgerIssueCount: result.report.causalLedgerValidation.issueCount,
      foreshadowQualityGatePassed: result.report.foreshadowQualityGate.pass,
    },
  };
}

function buildLongFormVerificationStateMetadata(
  result: LongFormVerificationExecutionResult,
): LongFormVerificationRunStateMetadata {
  const continuityCheckpointCount =
    result.scenario.continuityCheckpoints?.length ?? 0;
  const expectedMismatchAttributionCount =
    result.scenario.groundTruthCausalEvents?.reduce(
      (count, record) => count + record.expectedMismatchAttributions.length,
      0,
    ) ?? 0;

  return {
    workflow: "long_form_verification",
    configName: result.report.run.config,
    startedAt: result.report.run.startedAt,
    completedAt: result.report.run.completedAt,
    validationFailed: result.validationFailed,
    scenario: {
      id: result.scenario.id,
      totalEpisodes: result.scenario.totalEpisodes,
      continuityCheckpointCount,
      expectedMismatchAttributionCount,
    },
    totals: {
      totalTokens: result.report.run.totalTokens,
      totalCostUsd: result.report.run.totalCostUsd,
      totalDurationMs: result.report.run.durationMs,
      generatedEpisodes: result.report.run.generatedEpisodes,
    },
    verification: {
      canonicalValidationFailureCount:
        result.report.canonicalValidationFailures.length,
      contradictionViolationCount:
        result.contradictionValidation.totalViolationCount,
      causalLedgerIssueCount: result.report.causalLedgerValidation.issueCount,
      chapterVerificationPassed: result.report.run.chapterVerificationPassed,
      finalVerificationPassed: result.report.run.finalVerificationPassed,
      passed: result.report.run.passed,
    },
    acceptanceCriteria: {
      passedCount: result.acceptanceCriteria.summary.passedCount,
      failedCount: result.acceptanceCriteria.summary.failedCount,
      totalCount: result.acceptanceCriteria.summary.totalCount,
      overallPassed: result.acceptanceCriteria.overallPassed,
    },
  };
}

export function buildChapterGenerationProgrammaticRunResponse(options: {
  request: ChapterGenerationProgrammaticRunRequest;
  result: EndToEndChapterGenerationRunResult;
}): ChapterGenerationProgrammaticRunResponse {
  return {
    ok: options.result.workflowResult.ok,
    workflow: "chapter_generation",
    runId: options.result.workflowResult.runId,
    request: options.request,
    progress: buildNovelWorkflowRunProgressMetadata(
      options.result.workflowResult.stageRecords,
    ),
    state: buildChapterGenerationStateMetadata(options.request, options.result),
    artifacts: buildChapterGenerationArtifactReferences(options.result),
    report: options.result.report,
    errors: [...options.result.workflowResult.errors],
  };
}

export function buildLongFormVerificationProgrammaticRunResponse(options: {
  request: LongFormVerificationProgrammaticRunRequest;
  workflowResult: NovelWorkflowRunResult<LongFormVerificationWorkflowPayload>;
  result: LongFormVerificationExecutionResult;
}): LongFormVerificationProgrammaticRunResponse {
  return {
    ok: options.workflowResult.ok,
    workflow: "long_form_verification",
    runId: options.workflowResult.runId,
    request: options.request,
    progress: buildNovelWorkflowRunProgressMetadata(
      options.workflowResult.stageRecords,
    ),
    state: buildLongFormVerificationStateMetadata(options.result),
    result: options.result,
    artifacts: buildLongFormVerificationArtifactReferences(options.result),
    errors: [...options.workflowResult.errors],
  };
}

export function isProgrammaticRunResponseForWorkflow(
  response: ProgrammaticNovelRunResponse,
  workflow: NovelWorkflowKind,
): boolean {
  return response.workflow === workflow;
}
