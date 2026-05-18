import * as fs from "fs";
import * as path from "path";

import { z } from "zod";

import {
  buildLongFormVerificationArtifactBundle,
  persistNovelArtifactBundle,
  type LongFormVerificationArtifactBundle,
} from "../novel-engine/artifacts";
import {
  buildSimulationCausalLedgerAggregation,
  CharacterClaimMismatchTypeSchema,
  CharacterDivergenceCauseKindSchema,
  CharacterMismatchProvenanceSchema,
  CharacterMismatchValidationFailureSchema,
  CognitionRecordTypeSchema,
  createSimulationState,
  ensureCharacterMismatchCausationProvenance,
  resolveLongFormValidationScenario,
  MajorPlotActionLedgerValidationSchema,
  validateMajorPlotActionLedger,
} from "../sim";
import type {
  CharacterClaimMismatchRecord,
  MajorPlotActionLedgerValidation,
  DeterministicLongFormValidationScenario,
  SimulationValidationVerdict,
} from "../sim";
import {
  getBudgetConfig,
  getDefaultConfig,
  getFastConfig,
  getSimpleConfig,
  type HarnessConfig,
} from "./config";
import {
  buildForeshadowContinuityVerifierReport,
  buildForeshadowVerificationInput,
  buildForeshadowVerificationVerdictSummary,
  buildForeshadowingVerificationItems,
  evaluateForeshadowResolutionWindows,
} from "./reporting";
import {
  buildLongFormAcceptanceCriteriaReport,
  type LongFormAcceptanceCriteriaReport,
} from "./acceptance-criteria";
import {
  buildLongFormContradictionValidationReport,
  LongFormContradictionValidationReportSchema,
} from "./contradiction-validation";
import type {
  LongFormContradictionValidationReport,
  LongFormEpisodeContradictionDetail,
  LongFormEpisodeContradictionDiagnostic,
} from "./contradiction-validation";
import {
  NovelHarness,
} from "./harness";
import type {
  ChapterResult,
  HarnessRunOutcome,
} from "./harness";

export const LONG_FORM_VERIFICATION_REPORT_FILENAME = "validation-report.json";
export const LONG_FORM_VERIFICATION_RESULT_FILENAME = "result.json";
export const LONG_FORM_VERIFICATION_SCENARIO_FILENAME = "scenario.seed.json";
export const LONG_FORM_ACCEPTANCE_CRITERIA_FILENAME = "ac-results.json";

export interface LongFormVerificationIo {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface RunLongFormVerificationOptions {
  preset?: string;
  outDir?: string;
  budget?: number | null;
  verbose?: boolean;
  scenario?: DeterministicLongFormValidationScenario;
  scenarioPath?: string;
  io?: LongFormVerificationIo;
  createHarness?: (config: HarnessConfig) => Pick<NovelHarness, "runToCompletion">;
  resolveConfig?: (preset: string) => HarnessConfig;
}

export interface BuildLongFormVerificationReportOptions {
  scenario: DeterministicLongFormValidationScenario;
  preset: string;
  outcome: HarnessRunOutcome;
  startedAt: string;
  completedAt: string;
}

export interface LongFormVerificationArtifactPaths {
  outDir: string;
  reportFile: string;
  resultFile: string;
  scenarioSeedFile: string;
  acceptanceCriteriaFile: string;
}

export interface LongFormVerificationExecutionResult {
  scenario: DeterministicLongFormValidationScenario;
  outcome: HarnessRunOutcome;
  report: LongFormVerificationReport;
  acceptanceCriteria: LongFormAcceptanceCriteriaReport;
  contradictionValidation: LongFormContradictionValidationReport;
  validationFailed: boolean;
  artifactPaths: LongFormVerificationArtifactPaths;
  artifactBundle: LongFormVerificationArtifactBundle;
}

export interface PreparedLongFormVerificationRun {
  preset: string;
  io: LongFormVerificationIo;
  scenario: DeterministicLongFormValidationScenario;
  config: HarnessConfig;
  outDir: string;
  artifactPaths: LongFormVerificationArtifactPaths;
  createHarness: (config: HarnessConfig) => Pick<NovelHarness, "runToCompletion">;
}

export interface ExecutedLongFormVerificationRun {
  startedAt: string;
  completedAt: string;
  scenario: DeterministicLongFormValidationScenario;
  outcome: HarnessRunOutcome;
  report: LongFormVerificationReport;
  contradictionValidation: LongFormContradictionValidationReport;
  validationFailed: boolean;
}

const defaultIo: LongFormVerificationIo = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
};

const CLI_CONTRADICTION_EPISODE_LIMIT = 5;
const CLI_CONTRADICTION_DETAIL_LIMIT = 3;

export const LongFormMismatchCauseLinkSchema = z.object({
  cause: CharacterMismatchProvenanceSchema,
  recordType: CognitionRecordTypeSchema,
  contradictionType: CharacterClaimMismatchTypeSchema,
  characterId: z.string().min(1),
  recordId: z.string().min(1),
  validityStatus: z.enum(["valid", "invalid"]),
  firstDetectedChapter: z.number().int().nonnegative(),
  lastDetectedChapter: z.number().int().nonnegative(),
  detectionCount: z.number().int().positive(),
  triggeringEventId: z.string().min(1).nullable(),
  objectiveFactIds: z.array(z.string().min(1)).default([]),
  traceabilityAnchors: z.array(z.string().min(1)).default([]),
  unresolvedTraceabilityReferences: z.array(z.string().min(1)).default([]),
  issueCodes: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
});

export const LongFormChapterVerificationSummarySchema = z.object({
  chapter: z.number().int().positive(),
  passed: z.boolean(),
  issueCount: z.number().int().nonnegative(),
  mismatchCount: z.number().int().nonnegative(),
  invalidContradictionCount: z.number().int().nonnegative(),
  allowedExceptionCount: z.number().int().nonnegative(),
  mismatchCauseIds: z.array(z.string().min(1)).default([]),
});

export const LongFormExpectedMismatchAttributionSchema = z.object({
  episode: z.number().int().positive(),
  arcId: z.string().min(1),
  mismatchId: z.string().min(1),
  characterId: z.string().min(1),
  recordType: CognitionRecordTypeSchema,
  mismatchType: z.literal("canonical_conflict"),
  causeKind: CharacterDivergenceCauseKindSchema,
  sourceEventId: z.string().min(1),
  canonicalFactKeys: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
});

export const CanonicalValidationFailureReportSchema = z.object({
  code: z.literal("simulation_validation_failed"),
  chapter: z.number().int().nonnegative(),
  summary: z.string().min(1),
  invalidContradictionCount: z.number().int().nonnegative(),
  allowedExceptionCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
  mismatchCount: z.number().int().nonnegative(),
  uncausedMismatchFailures: z.array(CharacterMismatchValidationFailureSchema),
});

export const LongFormVerificationRunSummarySchema = z.object({
  scenarioId: z.string().min(1),
  totalEpisodes: z.number().int().positive(),
  generatedEpisodes: z.number().int().nonnegative(),
  expectedMismatchAttributionCount: z.number().int().nonnegative(),
  continuityCheckpointCount: z.number().int().nonnegative(),
  config: z.string().min(1),
  preset: z.string().min(1),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  chapterCoverageComplete: z.boolean(),
  chapterVerificationPassed: z.boolean(),
  finalVerificationPassed: z.boolean(),
  canonicalValidationPassed: z.boolean(),
  causalLedgerValidationPassed: z.boolean(),
  contradictionValidationPassed: z.boolean(),
  passed: z.boolean(),
});

export const LongFormMismatchSummarySchema = z.object({
  detectedMismatchCount: z.number().int().nonnegative(),
  uniqueMismatchCauseLinkCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
  invalidContradictionCount: z.number().int().nonnegative(),
  allowedExceptionCount: z.number().int().nonnegative(),
  byRecordType: z.record(z.string(), z.number().int().nonnegative()).default({}),
  byCauseType: z.record(z.string(), z.number().int().nonnegative()).default({}),
  byContradictionType: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

export const LongFormVerificationReportSchema = z.object({
  scenario: z.object({
    id: z.string().min(1),
    totalEpisodes: z.number().int().positive(),
    continuityCheckpointCount: z.number().int().nonnegative(),
    expectedMismatchAttributionCount: z.number().int().nonnegative(),
  }),
  run: LongFormVerificationRunSummarySchema,
  mismatchSummary: LongFormMismatchSummarySchema,
  mismatchCauseLinks: z.array(LongFormMismatchCauseLinkSchema),
  expectedMismatchAttributions: z.array(LongFormExpectedMismatchAttributionSchema),
  verificationReports: z.array(LongFormChapterVerificationSummarySchema),
  canonicalValidationFailures: z.array(CanonicalValidationFailureReportSchema),
  causalLedgerValidation: MajorPlotActionLedgerValidationSchema,
  contradictionValidation: LongFormContradictionValidationReportSchema,
});

export type LongFormMismatchCauseLink = z.infer<
  typeof LongFormMismatchCauseLinkSchema
>;
export type LongFormChapterVerificationSummary = z.infer<
  typeof LongFormChapterVerificationSummarySchema
>;
export type LongFormExpectedMismatchAttribution = z.infer<
  typeof LongFormExpectedMismatchAttributionSchema
>;
export type LongFormVerificationRunSummary = z.infer<
  typeof LongFormVerificationRunSummarySchema
>;
export type LongFormMismatchSummary = z.infer<
  typeof LongFormMismatchSummarySchema
>;
export type LongFormVerificationReport = z.infer<
  typeof LongFormVerificationReportSchema
>;
export type LongFormCausalLedgerValidation = MajorPlotActionLedgerValidation;

export function isLongFormVerificationValidationFailed(
  result: Pick<
    LongFormVerificationExecutionResult,
    "report" | "contradictionValidation"
  >,
): boolean {
  return !result.report.run.passed
    || result.contradictionValidation.contradiction_count !== 0;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function resolveHarnessConfig(preset: string): HarnessConfig {
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
}

function buildExpectedMismatchAttributions(
  scenario: DeterministicLongFormValidationScenario,
): LongFormExpectedMismatchAttribution[] {
  return scenario.groundTruthCausalEvents.flatMap((record) =>
    record.expectedMismatchAttributions.map((mismatch) =>
      LongFormExpectedMismatchAttributionSchema.parse({
        episode: record.episode,
        arcId: record.arcId,
        ...mismatch,
      }),
    ),
  );
}

function listVerdictMismatches(
  verification: SimulationValidationVerdict,
): CharacterClaimMismatchRecord[] {
  return [
    ...verification.allowedExceptions,
    ...verification.invalidContradictions,
  ];
}

function buildChapterVerificationSummaries(
  chapters: ReadonlyArray<ChapterResult>,
): LongFormChapterVerificationSummary[] {
  return chapters
    .filter((chapter): chapter is ChapterResult & { verification: SimulationValidationVerdict } =>
      Boolean(chapter.verification))
    .map((chapter) => LongFormChapterVerificationSummarySchema.parse({
      chapter: chapter.chapterNumber,
      passed: chapter.verification.passed,
      issueCount: chapter.verification.issueCount,
      mismatchCount: chapter.verification.mismatchCount,
      invalidContradictionCount: chapter.verification.invalidContradictionCount,
      allowedExceptionCount: chapter.verification.allowedExceptionCount,
      mismatchCauseIds: uniqueStrings(
        listVerdictMismatches(chapter.verification).map((mismatch) => {
          const causation = ensureCharacterMismatchCausationProvenance(
            mismatch.causation,
          );
          return causation.provenance?.causeId;
        }),
      ),
    }));
}

function buildMismatchCauseLinkKey(mismatch: CharacterClaimMismatchRecord): string {
  const causation = ensureCharacterMismatchCausationProvenance(
    mismatch.causation,
  );
  return causation.provenance?.causeId
    ?? `${mismatch.recordType}:${mismatch.recordId}:${mismatch.chapter}`;
}

function buildMismatchCauseLinks(
  chapters: ReadonlyArray<ChapterResult>,
): LongFormMismatchCauseLink[] {
  const aggregated = new Map<string, LongFormMismatchCauseLink>();

  for (const chapter of chapters) {
    if (!chapter.verification) {
      continue;
    }

    for (const mismatch of listVerdictMismatches(chapter.verification)) {
      const key = buildMismatchCauseLinkKey(mismatch);
      const causation = ensureCharacterMismatchCausationProvenance(
        mismatch.causation,
      );
      const provenance = causation.provenance;
      if (!provenance) {
        continue;
      }
      const triggeringEventId =
        causation.triggeringEvent?.eventId
        ?? causation.validationFailure?.failureContext.triggeringEventId
        ?? null;
      const issueCodes = uniqueStrings(mismatch.issueCodes);
      const objectiveFactIds = uniqueStrings(mismatch.evidence.objectiveFactIds);
      const traceabilityAnchors = uniqueStrings(
        mismatch.evidence.traceabilityAnchors,
      );
      const unresolvedTraceabilityReferences = uniqueStrings(
        mismatch.evidence.unresolvedTraceabilityReferences,
      );
      const existing = aggregated.get(key);

      if (!existing) {
        aggregated.set(key, LongFormMismatchCauseLinkSchema.parse({
          cause: provenance,
          recordType: mismatch.recordType,
          contradictionType: mismatch.mismatchType,
          characterId: mismatch.characterId,
          recordId: mismatch.recordId,
          validityStatus: mismatch.validityStatus,
          firstDetectedChapter: chapter.chapterNumber,
          lastDetectedChapter: chapter.chapterNumber,
          detectionCount: 1,
          triggeringEventId,
          objectiveFactIds,
          traceabilityAnchors,
          unresolvedTraceabilityReferences,
          issueCodes,
          explanation: mismatch.explanation,
        }));
        continue;
      }

      aggregated.set(key, LongFormMismatchCauseLinkSchema.parse({
        ...existing,
        lastDetectedChapter: Math.max(
          existing.lastDetectedChapter,
          chapter.chapterNumber,
        ),
        detectionCount: existing.detectionCount + 1,
        triggeringEventId: existing.triggeringEventId ?? triggeringEventId,
        objectiveFactIds: uniqueStrings([
          ...existing.objectiveFactIds,
          ...objectiveFactIds,
        ]),
        traceabilityAnchors: uniqueStrings([
          ...existing.traceabilityAnchors,
          ...traceabilityAnchors,
        ]),
        unresolvedTraceabilityReferences: uniqueStrings([
          ...existing.unresolvedTraceabilityReferences,
          ...unresolvedTraceabilityReferences,
        ]),
        issueCodes: uniqueStrings([
          ...existing.issueCodes,
          ...issueCodes,
        ]),
      }));
    }
  }

  return Array.from(aggregated.values()).sort((left, right) =>
    left.firstDetectedChapter - right.firstDetectedChapter
    || left.characterId.localeCompare(right.characterId)
    || left.recordId.localeCompare(right.recordId),
  );
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function buildMismatchSummary(
  chapters: ReadonlyArray<ChapterResult>,
  mismatchCauseLinks: ReadonlyArray<LongFormMismatchCauseLink>,
): LongFormMismatchSummary {
  const byRecordType: Record<string, number> = {};
  const byCauseType: Record<string, number> = {};
  const byContradictionType: Record<string, number> = {};

  for (const mismatch of mismatchCauseLinks) {
    incrementCount(byRecordType, mismatch.recordType);
    incrementCount(byCauseType, mismatch.cause.causeType);
    incrementCount(byContradictionType, mismatch.contradictionType);
  }

  return LongFormMismatchSummarySchema.parse({
    detectedMismatchCount: chapters.reduce(
      (total, chapter) => total + (chapter.verification?.mismatchCount ?? 0),
      0,
    ),
    uniqueMismatchCauseLinkCount: mismatchCauseLinks.length,
    issueCount: chapters.reduce(
      (total, chapter) => total + (chapter.verification?.issueCount ?? 0),
      0,
    ),
    invalidContradictionCount: chapters.reduce(
      (total, chapter) =>
        total + (chapter.verification?.invalidContradictionCount ?? 0),
      0,
    ),
    allowedExceptionCount: chapters.reduce(
      (total, chapter) =>
        total + (chapter.verification?.allowedExceptionCount ?? 0),
      0,
    ),
    byRecordType,
    byCauseType,
    byContradictionType,
  });
}

export function buildLongFormVerificationResultPayload(
  scenario: DeterministicLongFormValidationScenario,
  outcome: HarnessRunOutcome,
  report: Pick<
    LongFormVerificationReport,
    "causalLedgerValidation" | "contradictionValidation"
  >,
  acceptanceCriteria?: LongFormAcceptanceCriteriaReport,
) {
  const foreshadowVerificationInput = buildForeshadowVerificationInput(
    scenario.seed,
    outcome.result.chapters,
  );
  const causalLedgerAggregation = outcome.result.causalLedgerAggregation
    ?? (outcome.result.causalLedger
      ? buildSimulationCausalLedgerAggregation(outcome.result.causalLedger)
      : null);

  return {
    scenario: {
      id: scenario.id,
      totalEpisodes: scenario.totalEpisodes,
    },
    verification: outcome.result.verification,
    canonicalValidationFailures: outcome.result.canonicalValidationFailures,
    causalLedgerAggregation,
    causalLedgerValidation: report.causalLedgerValidation,
    contradictionValidation: report.contradictionValidation,
    foreshadowingVerificationItems: buildForeshadowingVerificationItems(
      scenario.seed,
    ),
    foreshadowVerificationInput,
    foreshadowVerificationVerdictSummary:
      buildForeshadowVerificationVerdictSummary(scenario.seed),
    foreshadowContinuityVerifierReport:
      buildForeshadowContinuityVerifierReport(scenario.seed, outcome.result.chapters),
    foreshadowResolutionWindowSummary:
      evaluateForeshadowResolutionWindows(foreshadowVerificationInput),
    acceptanceCriteria,
    chapters: outcome.result.chapters.map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      charCount: chapter.text.length,
      score: chapter.score,
      usage: chapter.usage,
      durationMs: chapter.durationMs,
      verification: chapter.verification,
    })),
    totalUsage: outcome.result.totalUsage,
    totalCostUsd: outcome.result.totalCostUsd,
    totalDurationMs: outcome.result.totalDurationMs,
    config: outcome.result.config,
  };
}

export type LongFormVerificationResultPayload = ReturnType<
  typeof buildLongFormVerificationResultPayload
>;

function formatContradictionDiagnosticDetail(
  detail: LongFormEpisodeContradictionDetail,
): string {
  const prefix = `[${detail.sourceType}/${detail.contradictionType}]`;

  if (detail.sourceType === "continuity") {
    const continuityContext = [
      detail.eventId ? `event=${detail.eventId}` : null,
      detail.referencedEventId ? `referenced=${detail.referencedEventId}` : null,
    ].filter(Boolean).join(" ");

    return [prefix, continuityContext, detail.summary].filter(Boolean).join(" ");
  }

  const cognitionContext = [
    detail.characterId && detail.recordId
      ? `${detail.characterId}/${detail.recordId}`
      : null,
    detail.eventId ? `event=${detail.eventId}` : null,
  ].filter(Boolean).join(" ");

  return [prefix, cognitionContext, detail.summary].filter(Boolean).join(" ");
}

function emitEpisodeContradictionDiagnostic(
  diagnostic: LongFormEpisodeContradictionDiagnostic,
  io: Pick<LongFormVerificationIo, "log">,
): void {
  io.log(
    `   - ${diagnostic.episodeId} (episode ${diagnostic.episode}): `
    + `${diagnostic.contradictionCount} contradiction(s)`,
  );

  for (const detail of diagnostic.details.slice(0, CLI_CONTRADICTION_DETAIL_LIMIT)) {
    io.log(`     ${formatContradictionDiagnosticDetail(detail)}`);
  }

  const omittedDetailCount = diagnostic.details.length - CLI_CONTRADICTION_DETAIL_LIMIT;
  if (omittedDetailCount > 0) {
    io.log(`     ... ${omittedDetailCount} additional contradiction detail(s)`);
  }
}

function emitContradictionValidationSummary(
  contradictionValidation: LongFormContradictionValidationReport,
  io: Pick<LongFormVerificationIo, "log">,
): void {
  io.log(
    `   contradiction validation: ${contradictionValidation.passed ? "pass" : "fail"} `
    + `(contradiction_count=${contradictionValidation.contradiction_count})`,
  );
  io.log(
    `   contradiction breakdown: belief=${contradictionValidation.counts.belief}, `
    + `memory=${contradictionValidation.counts.memory}, `
    + `utterance=${contradictionValidation.counts.utterance}, `
    + `continuity=${contradictionValidation.counts.continuity}`,
  );

  if (contradictionValidation.episodeDiagnostics.length === 0) {
    io.log("   contradiction diagnostics: none");
    return;
  }

  io.log("   contradiction diagnostics:");
  for (const diagnostic of contradictionValidation.episodeDiagnostics.slice(0, CLI_CONTRADICTION_EPISODE_LIMIT)) {
    emitEpisodeContradictionDiagnostic(diagnostic, io);
  }

  const omittedEpisodeCount =
    contradictionValidation.episodeDiagnostics.length - CLI_CONTRADICTION_EPISODE_LIMIT;
  if (omittedEpisodeCount > 0) {
    io.log(`   ... ${omittedEpisodeCount} additional episode diagnostic(s)`);
  }
}

export function buildLongFormVerificationReport(
  options: BuildLongFormVerificationReportOptions,
): LongFormVerificationReport {
  const { scenario, preset, outcome, startedAt, completedAt } = options;
  const mismatchCauseLinks = buildMismatchCauseLinks(outcome.result.chapters);
  const verificationReports = buildChapterVerificationSummaries(
    outcome.result.chapters,
  );
  const expectedMismatchAttributions = buildExpectedMismatchAttributions(scenario);
  const chapterCoverageComplete =
    outcome.result.chapters.length === scenario.totalEpisodes;
  const chapterVerificationPassed = verificationReports.every(
    (report) => report.passed,
  );
  const finalVerificationPassed = outcome.result.verification?.passed ?? true;
  const canonicalValidationPassed =
    outcome.result.canonicalValidationFailures.length === 0;
  const foreshadowVerificationInput = buildForeshadowVerificationInput(
    scenario.seed,
    outcome.result.chapters,
  );
  const causalLedgerValidation = outcome.result.causalLedgerValidation
    ?? validateMajorPlotActionLedger(outcome.result.causalLedger ?? [], {
      initialState: createSimulationState(scenario.seed),
      foreshadowingItems: buildForeshadowingVerificationItems(scenario.seed),
      foreshadowEpisodeSequence: foreshadowVerificationInput.episodeSequence,
    });
  const causalLedgerValidationPassed = causalLedgerValidation.passed;
  const contradictionValidation = buildLongFormContradictionValidationReport({
    chapters: outcome.result.chapters,
    causalLedgerValidation,
    causalLedgerEventCount: outcome.result.causalLedger?.events.length ?? 0,
  });
  const contradictionValidationPassed = contradictionValidation.passed;

  return LongFormVerificationReportSchema.parse({
    scenario: {
      id: scenario.id,
      totalEpisodes: scenario.totalEpisodes,
      continuityCheckpointCount: scenario.continuityCheckpoints.length,
      expectedMismatchAttributionCount: expectedMismatchAttributions.length,
    },
    run: {
      scenarioId: scenario.id,
      totalEpisodes: scenario.totalEpisodes,
      generatedEpisodes: outcome.result.chapters.length,
      expectedMismatchAttributionCount: expectedMismatchAttributions.length,
      continuityCheckpointCount: scenario.continuityCheckpoints.length,
      config: outcome.result.config,
      preset,
      startedAt,
      completedAt,
      durationMs: outcome.result.totalDurationMs,
      totalTokens: outcome.result.totalUsage.total_tokens,
      totalCostUsd: outcome.result.totalCostUsd,
      chapterCoverageComplete,
      chapterVerificationPassed,
      finalVerificationPassed,
      canonicalValidationPassed,
      causalLedgerValidationPassed,
      contradictionValidationPassed,
      passed:
        chapterCoverageComplete
        && chapterVerificationPassed
        && finalVerificationPassed
        && canonicalValidationPassed
        && causalLedgerValidationPassed
        && contradictionValidationPassed,
    },
    mismatchSummary: buildMismatchSummary(
      outcome.result.chapters,
      mismatchCauseLinks,
    ),
    mismatchCauseLinks,
    expectedMismatchAttributions,
    verificationReports,
    canonicalValidationFailures: outcome.result.canonicalValidationFailures,
    causalLedgerValidation,
    contradictionValidation,
  });
}

export function prepareLongFormVerificationRun(
  options: RunLongFormVerificationOptions = {},
): PreparedLongFormVerificationRun {
  const preset = options.preset ?? "default";
  const io = options.io ?? defaultIo;
  const scenario = resolveLongFormValidationScenario({
    scenario: options.scenario,
    scenarioPath: options.scenarioPath,
  });
  const resolveConfig = options.resolveConfig ?? resolveHarnessConfig;
  const config = resolveConfig(preset);
  const outDir = path.resolve(
    options.outDir ?? "./output/long-form-validation",
  );

  if (options.budget !== undefined && options.budget !== null) {
    config.budgetUsd = options.budget;
  }
  config.output = { mode: "file", dir: outDir, verbose: options.verbose ?? true };

  const createHarness =
    options.createHarness
    ?? ((resolvedConfig: HarnessConfig) => new NovelHarness(resolvedConfig));

  return {
    preset,
    io,
    scenario,
    config,
    outDir,
    artifactPaths: {
      outDir,
      reportFile: path.join(outDir, LONG_FORM_VERIFICATION_REPORT_FILENAME),
      resultFile: path.join(outDir, LONG_FORM_VERIFICATION_RESULT_FILENAME),
      scenarioSeedFile: path.join(outDir, LONG_FORM_VERIFICATION_SCENARIO_FILENAME),
      acceptanceCriteriaFile: path.join(outDir, LONG_FORM_ACCEPTANCE_CRITERIA_FILENAME),
    },
    createHarness,
  };
}

export function initializeLongFormVerificationRun(
  prepared: PreparedLongFormVerificationRun,
): void {
  fs.mkdirSync(prepared.outDir, { recursive: true });
  fs.writeFileSync(
    prepared.artifactPaths.scenarioSeedFile,
    JSON.stringify(prepared.scenario.seed, null, 2),
    "utf-8",
  );
}

export async function executeLongFormVerificationRun(
  prepared: PreparedLongFormVerificationRun,
): Promise<ExecutedLongFormVerificationRun> {
  const startedAt = new Date().toISOString();
  const harness = prepared.createHarness(prepared.config);
  const outcome = await harness.runToCompletion(
    prepared.scenario.seed,
    1,
    prepared.scenario.totalEpisodes,
  );
  const completedAt = new Date().toISOString();
  const report = buildLongFormVerificationReport({
    scenario: prepared.scenario,
    preset: prepared.preset,
    outcome,
    startedAt,
    completedAt,
  });

  return {
    startedAt,
    completedAt,
    scenario: prepared.scenario,
    outcome,
    report,
    contradictionValidation: report.contradictionValidation,
    validationFailed: isLongFormVerificationValidationFailed({
      report,
      contradictionValidation: report.contradictionValidation,
    }),
  };
}

export function finalizeLongFormVerificationRun(
  prepared: PreparedLongFormVerificationRun,
  execution: ExecutedLongFormVerificationRun,
): LongFormVerificationExecutionResult {
  const acceptanceCriteria = buildLongFormAcceptanceCriteriaReport({
    scenario: execution.scenario,
    outcome: execution.outcome,
    report: execution.report,
    contradictionValidation: execution.contradictionValidation,
    evaluatedAt: execution.completedAt,
  });
  const baseResult = {
    scenario: execution.scenario,
    outcome: execution.outcome,
    report: execution.report,
    acceptanceCriteria,
    contradictionValidation: execution.contradictionValidation,
    validationFailed: execution.validationFailed,
    artifactPaths: prepared.artifactPaths,
  };
  const artifactBundle = buildLongFormVerificationArtifactBundle({
    result: baseResult,
    resultPayload: buildLongFormVerificationResultPayload(
      execution.scenario,
      execution.outcome,
      execution.report,
      acceptanceCriteria,
    ),
  });
  persistNovelArtifactBundle(artifactBundle);

  return {
    ...baseResult,
    artifactBundle,
  };
}

function emitLongFormVerificationStart(
  prepared: Pick<PreparedLongFormVerificationRun, "scenario" | "config" | "outDir">,
  io: Pick<LongFormVerificationIo, "log">,
): void {
  io.log("\n🧪 장편 검증 러너");
  io.log(`   시나리오: ${prepared.scenario.id}`);
  io.log(`   화수: 1~${prepared.scenario.totalEpisodes}`);
  io.log(`   설정: ${prepared.config.name}`);
  io.log(`   출력: ${prepared.outDir}`);
}

export function emitLongFormVerificationSummary(
  result: LongFormVerificationExecutionResult,
  io: Pick<LongFormVerificationIo, "log">,
): void {
  io.log(
    `   mismatch cause links: ${result.report.mismatchSummary.uniqueMismatchCauseLinkCount}`,
  );
  io.log(
    `   canonical validation: ${result.report.run.canonicalValidationPassed ? "pass" : "fail"}`,
  );
  io.log(
    `   acceptance criteria: ${result.acceptanceCriteria.summary.passedCount}/`
    + `${result.acceptanceCriteria.summary.totalCount} pass`,
  );
  emitContradictionValidationSummary(result.contradictionValidation, io);
  io.log(`   report: ${result.artifactPaths.reportFile}`);
}

export async function runLongFormVerification(
  options: RunLongFormVerificationOptions = {},
): Promise<LongFormVerificationExecutionResult> {
  const prepared = prepareLongFormVerificationRun(options);
  emitLongFormVerificationStart(prepared, prepared.io);
  initializeLongFormVerificationRun(prepared);
  const execution = await executeLongFormVerificationRun(prepared);
  const result = finalizeLongFormVerificationRun(prepared, execution);
  emitLongFormVerificationSummary(result, prepared.io);
  return result;
}
