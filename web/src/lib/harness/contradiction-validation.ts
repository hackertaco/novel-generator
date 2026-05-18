import { z } from "zod";

import {
  CharacterClaimMismatchTypeSchema,
  MajorPlotActionLedgerIssueCodeSchema,
  type MajorPlotActionLedgerValidation,
  type SimulationValidationVerdict,
} from "../sim";

interface ChapterContradictionValidationInput {
  chapterNumber: number;
  verification?: SimulationValidationVerdict;
}

export const LongFormCognitionContradictionViolationSchema = z.object({
  recordType: z.enum(["memory", "belief", "utterance"]),
  characterId: z.string().min(1),
  recordId: z.string().min(1),
  contradictionType: CharacterClaimMismatchTypeSchema,
  firstDetectedChapter: z.number().int().positive(),
  lastDetectedChapter: z.number().int().positive(),
  detectionCount: z.number().int().positive(),
  triggeringEventId: z.string().min(1).nullable(),
  objectiveFactIds: z.array(z.string().min(1)).default([]),
  issueCodes: z.array(z.string().min(1)).default([]),
  causeId: z.string().min(1).nullable(),
  summary: z.string().min(1),
});

export const LongFormContinuityViolationSchema = z.object({
  code: MajorPlotActionLedgerIssueCodeSchema,
  eventId: z.string().min(1),
  chapter: z.number().int().positive(),
  episode: z.number().int().positive(),
  referencedEventId: z.string().min(1).nullable(),
  stateKey: z.string().min(1).nullable(),
  foreshadowId: z.string().min(1).nullable(),
  summary: z.string().min(1),
});

export const LongFormContradictionValidationCountsSchema = z.object({
  belief: z.number().int().nonnegative(),
  memory: z.number().int().nonnegative(),
  utterance: z.number().int().nonnegative(),
  continuity: z.number().int().nonnegative(),
});

export const LongFormEpisodeContradictionDetailSchema = z.object({
  sourceType: z.enum(["belief", "memory", "utterance", "continuity"]),
  contradictionType: z.string().min(1),
  characterId: z.string().min(1).nullable(),
  recordId: z.string().min(1).nullable(),
  eventId: z.string().min(1).nullable(),
  causeId: z.string().min(1).nullable(),
  referencedEventId: z.string().min(1).nullable(),
  objectiveFactIds: z.array(z.string().min(1)).default([]),
  issueCodes: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
});

export const LongFormEpisodeContradictionDiagnosticSchema = z.object({
  episode: z.number().int().positive(),
  episodeId: z.string().min(1),
  contradictionCount: z.number().int().nonnegative(),
  details: z.array(LongFormEpisodeContradictionDetailSchema).default([]),
});

export const LongFormContradictionValidationReportSchema = z.object({
  passed: z.boolean(),
  chaptersAnalyzed: z.number().int().nonnegative(),
  causalLedgerEventCount: z.number().int().nonnegative(),
  contradiction_count: z.number().int().nonnegative(),
  totalViolationCount: z.number().int().nonnegative(),
  detectedCognitionViolationCount: z.number().int().nonnegative(),
  counts: LongFormContradictionValidationCountsSchema,
  beliefViolations: z.array(LongFormCognitionContradictionViolationSchema),
  memoryViolations: z.array(LongFormCognitionContradictionViolationSchema),
  utteranceViolations: z.array(LongFormCognitionContradictionViolationSchema),
  continuityViolations: z.array(LongFormContinuityViolationSchema),
  episodeDiagnostics: z.array(LongFormEpisodeContradictionDiagnosticSchema).default([]),
});

export type LongFormCognitionContradictionViolation = z.infer<
  typeof LongFormCognitionContradictionViolationSchema
>;
export type LongFormContinuityViolation = z.infer<
  typeof LongFormContinuityViolationSchema
>;
export type LongFormContradictionValidationCounts = z.infer<
  typeof LongFormContradictionValidationCountsSchema
>;
export type LongFormEpisodeContradictionDetail = z.infer<
  typeof LongFormEpisodeContradictionDetailSchema
>;
export type LongFormEpisodeContradictionDiagnostic = z.infer<
  typeof LongFormEpisodeContradictionDiagnosticSchema
>;
export type LongFormContradictionValidationReport = z.infer<
  typeof LongFormContradictionValidationReportSchema
>;

function uniqueStrings(values: ReadonlyArray<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function formatEpisodeId(episode: number): string {
  return `ep_${String(episode).padStart(3, "0")}`;
}

function buildCognitionViolationKey(
  chapter: number,
  mismatch: NonNullable<SimulationValidationVerdict["invalidContradictions"]>[number],
): string {
  return [
    mismatch.causation.provenance?.causeId ?? "no-cause-id",
    mismatch.recordType,
    mismatch.characterId,
    mismatch.recordId,
    mismatch.mismatchType,
    String(chapter),
  ].join(":");
}

function buildCognitionViolations(
  chapters: ReadonlyArray<ChapterContradictionValidationInput>,
): {
  detectedCount: number;
  beliefViolations: LongFormCognitionContradictionViolation[];
  memoryViolations: LongFormCognitionContradictionViolation[];
  utteranceViolations: LongFormCognitionContradictionViolation[];
} {
  const aggregated = new Map<string, LongFormCognitionContradictionViolation>();
  let detectedCount = 0;

  for (const chapter of chapters) {
    for (const mismatch of chapter.verification?.invalidContradictions ?? []) {
      detectedCount += 1;
      const key = buildCognitionViolationKey(chapter.chapterNumber, mismatch);
      const existing = aggregated.get(key);
      const violation: LongFormCognitionContradictionViolation = {
        recordType: mismatch.recordType,
        characterId: mismatch.characterId,
        recordId: mismatch.recordId,
        contradictionType: mismatch.mismatchType,
        firstDetectedChapter: existing?.firstDetectedChapter ?? chapter.chapterNumber,
        lastDetectedChapter: chapter.chapterNumber,
        detectionCount: (existing?.detectionCount ?? 0) + 1,
        triggeringEventId:
          existing?.triggeringEventId
          ?? mismatch.causation.triggeringEvent?.eventId
          ?? mismatch.causation.validationFailure?.failureContext.triggeringEventId
          ?? null,
        objectiveFactIds: uniqueStrings([
          ...(existing?.objectiveFactIds ?? []),
          ...mismatch.evidence.objectiveFactIds,
        ]),
        issueCodes: uniqueStrings([
          ...(existing?.issueCodes ?? []),
          ...mismatch.issueCodes,
        ]),
        causeId: existing?.causeId ?? mismatch.causation.provenance?.causeId ?? null,
        summary: existing?.summary ?? mismatch.explanation,
      };

      aggregated.set(
        key,
        LongFormCognitionContradictionViolationSchema.parse(violation),
      );
    }
  }

  const violations = Array.from(aggregated.values()).sort((left, right) =>
    left.firstDetectedChapter - right.firstDetectedChapter
    || left.characterId.localeCompare(right.characterId)
    || left.recordId.localeCompare(right.recordId),
  );

  return {
    detectedCount,
    beliefViolations: violations.filter((violation) => violation.recordType === "belief"),
    memoryViolations: violations.filter((violation) => violation.recordType === "memory"),
    utteranceViolations: violations.filter((violation) => violation.recordType === "utterance"),
  };
}

function buildContinuityViolations(
  causalLedgerValidation?: MajorPlotActionLedgerValidation,
): LongFormContinuityViolation[] {
  return (causalLedgerValidation?.issues ?? []).map((issue) =>
    LongFormContinuityViolationSchema.parse({
      code: issue.code,
      eventId: issue.eventId,
      chapter: issue.chapter,
      episode: issue.episode,
      referencedEventId: issue.referencedEventId ?? null,
      stateKey: issue.stateKey ?? null,
      foreshadowId: issue.foreshadowId ?? null,
      summary: issue.message,
    }),
  );
}

function compareEpisodeContradictionDetails(
  left: LongFormEpisodeContradictionDetail,
  right: LongFormEpisodeContradictionDetail,
): number {
  return left.sourceType.localeCompare(right.sourceType)
    || (left.characterId ?? "").localeCompare(right.characterId ?? "")
    || (left.recordId ?? "").localeCompare(right.recordId ?? "")
    || (left.eventId ?? "").localeCompare(right.eventId ?? "")
    || left.contradictionType.localeCompare(right.contradictionType);
}

function buildEpisodeContradictionDiagnostics(
  chapters: ReadonlyArray<ChapterContradictionValidationInput>,
  continuityViolations: ReadonlyArray<LongFormContinuityViolation>,
): LongFormEpisodeContradictionDiagnostic[] {
  const diagnostics = new Map<
    number,
    {
      episode: number;
      episodeId: string;
      details: LongFormEpisodeContradictionDetail[];
    }
  >();

  const getOrCreate = (
    episode: number,
  ): {
    episode: number;
    episodeId: string;
    details: LongFormEpisodeContradictionDetail[];
  } => {
    const existing = diagnostics.get(episode);
    if (existing) {
      return existing;
    }

    const created = {
      episode,
      episodeId: formatEpisodeId(episode),
      details: [],
    };
    diagnostics.set(episode, created);
    return created;
  };

  for (const chapter of chapters) {
    for (const mismatch of chapter.verification?.invalidContradictions ?? []) {
      const bucket = getOrCreate(chapter.chapterNumber);
      bucket.details.push(
        LongFormEpisodeContradictionDetailSchema.parse({
          sourceType: mismatch.recordType,
          contradictionType: mismatch.mismatchType,
          characterId: mismatch.characterId,
          recordId: mismatch.recordId,
          eventId:
            mismatch.causation.triggeringEvent?.eventId
            ?? mismatch.causation.validationFailure?.failureContext.triggeringEventId
            ?? mismatch.causation.sourceEvent?.eventId
            ?? null,
          causeId: mismatch.causation.provenance?.causeId ?? null,
          referencedEventId: null,
          objectiveFactIds: mismatch.evidence.objectiveFactIds,
          issueCodes: mismatch.issueCodes,
          summary: mismatch.explanation,
        }),
      );
    }
  }

  for (const violation of continuityViolations) {
    const bucket = getOrCreate(violation.episode);
    bucket.details.push(
      LongFormEpisodeContradictionDetailSchema.parse({
        sourceType: "continuity",
        contradictionType: violation.code,
        characterId: null,
        recordId: null,
        eventId: violation.eventId,
        causeId: null,
        referencedEventId: violation.referencedEventId,
        objectiveFactIds: [],
        issueCodes: [violation.code],
        summary: violation.summary,
      }),
    );
  }

  return Array.from(diagnostics.values())
    .map((diagnostic) =>
      LongFormEpisodeContradictionDiagnosticSchema.parse({
        ...diagnostic,
        contradictionCount: diagnostic.details.length,
        details: [...diagnostic.details].sort(compareEpisodeContradictionDetails),
      }))
    .sort((left, right) => left.episode - right.episode);
}

export function buildLongFormContradictionValidationReport(options: {
  chapters: ReadonlyArray<ChapterContradictionValidationInput>;
  causalLedgerValidation?: MajorPlotActionLedgerValidation;
  causalLedgerEventCount?: number;
}): LongFormContradictionValidationReport {
  const cognitionViolations = buildCognitionViolations(options.chapters);
  const continuityViolations = buildContinuityViolations(
    options.causalLedgerValidation,
  );
  const counts: LongFormContradictionValidationCounts = {
    belief: cognitionViolations.beliefViolations.length,
    memory: cognitionViolations.memoryViolations.length,
    utterance: cognitionViolations.utteranceViolations.length,
    continuity: continuityViolations.length,
  };
  const totalViolationCount =
    counts.belief + counts.memory + counts.utterance + counts.continuity;
  const episodeDiagnostics = buildEpisodeContradictionDiagnostics(
    options.chapters,
    continuityViolations,
  );

  return LongFormContradictionValidationReportSchema.parse({
    passed: totalViolationCount === 0,
    chaptersAnalyzed: options.chapters.length,
    causalLedgerEventCount: options.causalLedgerEventCount ?? 0,
    contradiction_count: totalViolationCount,
    totalViolationCount,
    detectedCognitionViolationCount: cognitionViolations.detectedCount,
    counts,
    beliefViolations: cognitionViolations.beliefViolations,
    memoryViolations: cognitionViolations.memoryViolations,
    utteranceViolations: cognitionViolations.utteranceViolations,
    continuityViolations,
    episodeDiagnostics,
  });
}
