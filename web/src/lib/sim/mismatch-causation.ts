import { z } from "zod";

import {
  CharacterDivergenceCauseKindSchema,
  CharacterDivergenceCauseSchema,
} from "./cognitive-dissonance";

export const CognitionRecordTypeSchema = z.enum([
  "memory",
  "belief",
  "utterance",
]);

export const CharacterClaimMismatchTypeSchema = z.enum([
  "canonical_conflict",
  "missing_canonical_truth",
  "normalized_value_mismatch",
]);

export const CharacterMismatchSourceEventReferenceSchema = z.object({
  eventId: z.string().min(1),
  chapter: z.number().int().min(0),
});

export const CharacterMismatchAffectedEntityReferenceSchema = z.object({
  recordType: CognitionRecordTypeSchema,
  recordId: z.string().min(1),
  characterId: z.string().min(1),
});

export const CharacterMismatchTriggeringEventReferenceSchema = z.object({
  eventId: z.string().min(1),
  chapter: z.number().int().min(0),
  sourceActorId: z.string().min(1).optional(),
});

export const CharacterMismatchContradictedFactReferenceSchema = z.object({
  factId: z.string().min(1),
  lineId: z.string().min(1).optional(),
  chapter: z.number().int().min(0),
  sourceEventId: z.string().min(1).optional(),
});

export const CharacterMismatchIntroductionPointSchema = z.object({
  chapter: z.number().int().min(0),
  eventId: z.string().min(1).optional(),
});

export const CharacterMismatchEpisodeSpanSchema = z.object({
  startChapter: z.number().int().min(0),
  endChapter: z.number().int().min(0),
  chapterCount: z.number().int().min(1),
}).superRefine((span, ctx) => {
  if (span.endChapter < span.startChapter) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "episodeSpan.endChapter must be greater than or equal to startChapter",
      path: ["endChapter"],
    });
  }

  const expectedChapterCount = (span.endChapter - span.startChapter) + 1;
  if (span.chapterCount !== expectedChapterCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "episodeSpan.chapterCount must equal the inclusive chapter span",
      path: ["chapterCount"],
    });
  }
});

export const CharacterMismatchCauseStatusSchema = z.enum([
  "recorded",
  "missing",
]);

export const CharacterMismatchValidationFailureCodeSchema = z.enum([
  "uncaused_mismatch",
]);

export const CharacterMismatchRecordedCauseTypeSchema = z.union([
  CharacterDivergenceCauseKindSchema,
  CharacterMismatchValidationFailureCodeSchema,
]);

export const CharacterMismatchProvenanceSchema = z.object({
  causeId: z.string().min(1),
  causeType: CharacterMismatchRecordedCauseTypeSchema,
  sourceEpisode: z.number().int().min(0),
  sourceEventId: z.string().min(1),
});

export const CharacterMismatchValidationFailureMismatchSchema = z.object({
  recordType: CognitionRecordTypeSchema,
  recordId: z.string().min(1),
  characterId: z.string().min(1),
  chapter: z.number().int().min(0),
  mismatchType: CharacterClaimMismatchTypeSchema,
  factIds: z.array(z.string().min(1)).default([]),
});

export const CharacterMismatchMissingCauseDescriptorSchema = z.object({
  path: z.literal("divergenceCause"),
  required: z.literal("explicit_divergence_cause"),
  allowedKinds: z.array(CharacterDivergenceCauseKindSchema).default([]),
});

export const CharacterMismatchValidationFailureContextSchema = z.object({
  triggeringEventId: z.string().min(1).optional(),
  sourceEventId: z.string().min(1).optional(),
  contradictedFactId: z.string().min(1).optional(),
  objectiveFactIds: z.array(z.string().min(1)).default([]),
  traceabilityAnchors: z.array(z.string().min(1)).default([]),
  unresolvedTraceabilityReferences: z.array(z.string().min(1)).default([]),
  provenance: CharacterMismatchProvenanceSchema.optional(),
});

export const CharacterMismatchValidationFailureSchema = z.object({
  code: CharacterMismatchValidationFailureCodeSchema,
  message: z.string().min(1),
  mismatch: CharacterMismatchValidationFailureMismatchSchema,
  missingCause: CharacterMismatchMissingCauseDescriptorSchema,
  failureContext: CharacterMismatchValidationFailureContextSchema,
});

export const CharacterMismatchCausationRecordSchema = z.object({
  mismatchType: CharacterClaimMismatchTypeSchema,
  causeStatus: CharacterMismatchCauseStatusSchema,
  provenance: CharacterMismatchProvenanceSchema.optional(),
  explicitCause: CharacterDivergenceCauseSchema.optional(),
  validationFailure: CharacterMismatchValidationFailureSchema.optional(),
  sourceEvent: CharacterMismatchSourceEventReferenceSchema.optional(),
  affectedEntity: CharacterMismatchAffectedEntityReferenceSchema,
  triggeringEvent: CharacterMismatchTriggeringEventReferenceSchema.optional(),
  contradictedFact: CharacterMismatchContradictedFactReferenceSchema.optional(),
  introduction: CharacterMismatchIntroductionPointSchema,
  episodeSpan: CharacterMismatchEpisodeSpanSchema,
}).superRefine((record, ctx) => {
  const requiresExplicitCause = record.mismatchType === "canonical_conflict";
  const hasExplicitCause = Boolean(record.explicitCause);

  if (hasExplicitCause && record.causeStatus !== "recorded") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "causeStatus must be recorded when explicitCause is present",
      path: ["causeStatus"],
    });
  }

  if (!hasExplicitCause && record.causeStatus !== "missing") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "causeStatus must be missing when explicitCause is absent",
      path: ["causeStatus"],
    });
  }

  if (!hasExplicitCause && !record.validationFailure) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "mismatch records without an explicitCause require a validationFailure",
      path: ["validationFailure"],
    });
  }

  if (hasExplicitCause && record.validationFailure) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "validationFailure cannot be present when explicitCause is recorded",
      path: ["validationFailure"],
    });
  }

  if (!requiresExplicitCause && record.explicitCause) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${record.mismatchType} cannot carry an explicitCause`,
      path: ["explicitCause"],
    });
  }

  if (!requiresExplicitCause && record.sourceEvent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${record.mismatchType} cannot carry a sourceEvent reference`,
      path: ["sourceEvent"],
    });
  }

  if (!record.explicitCause?.sourceEventId && record.sourceEvent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sourceEvent requires explicitCause.sourceEventId",
      path: ["sourceEvent"],
    });
  }

  if (
    record.explicitCause?.sourceEventId
    && record.sourceEvent
    && record.explicitCause.sourceEventId !== record.sourceEvent.eventId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sourceEvent.eventId must match explicitCause.sourceEventId",
      path: ["sourceEvent", "eventId"],
    });
  }

  if (record.introduction.eventId && !record.triggeringEvent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "introduction.eventId requires a triggeringEvent reference",
      path: ["introduction", "eventId"],
    });
  }

  if (record.triggeringEvent && record.introduction.eventId) {
    if (record.introduction.eventId !== record.triggeringEvent.eventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "introduction.eventId must match triggeringEvent.eventId",
        path: ["introduction", "eventId"],
      });
    }

    if (record.introduction.chapter !== record.triggeringEvent.chapter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "introduction.chapter must match triggeringEvent.chapter when eventId is present",
        path: ["introduction", "chapter"],
      });
    }
  }

  if (
    record.mismatchType === "missing_canonical_truth"
    && record.contradictedFact
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "missing_canonical_truth cannot reference a contradictedFact",
      path: ["contradictedFact"],
    });
  }

  if (record.sourceEvent) {
    if (record.episodeSpan.startChapter !== record.sourceEvent.chapter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "episodeSpan.startChapter must match sourceEvent.chapter",
        path: ["episodeSpan", "startChapter"],
      });
    }
    return;
  }

  if (record.episodeSpan.startChapter !== record.episodeSpan.endChapter) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "episodeSpan without a sourceEvent must collapse to a single chapter",
      path: ["episodeSpan", "startChapter"],
    });
  }
});

export const PersistedCharacterMismatchCausationRecordSchema =
  CharacterMismatchCausationRecordSchema.superRefine((record, ctx) => {
    if (record.mismatchType !== "canonical_conflict") {
      return;
    }

    if (!record.explicitCause && !record.validationFailure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "persisted canonical_conflict records require an explicitCause or validationFailure",
        path: ["validationFailure"],
      });
    }

    if (record.explicitCause?.sourceEventId && !record.sourceEvent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "persisted canonical_conflict records require a sourceEvent when explicitCause.sourceEventId is recorded",
        path: ["sourceEvent"],
      });
    }

    if (!record.provenance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "persisted mismatch records require provenance with cause id/type and source episode/event",
        path: ["provenance"],
      });
    }
  });

export const CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME =
  "sim.character-mismatch-causation";
export const CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION = 1;

export const CharacterMismatchCausationLedgerSchema = z.object({
  schema: z.literal(CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME),
  version: z.literal(CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION),
  records: z.array(PersistedCharacterMismatchCausationRecordSchema),
});

export type CognitionRecordType = z.infer<typeof CognitionRecordTypeSchema>;
export type CharacterClaimMismatchType = z.infer<
  typeof CharacterClaimMismatchTypeSchema
>;
export type CharacterMismatchSourceEventReference = z.infer<
  typeof CharacterMismatchSourceEventReferenceSchema
>;
export type CharacterMismatchAffectedEntityReference = z.infer<
  typeof CharacterMismatchAffectedEntityReferenceSchema
>;
export type CharacterMismatchTriggeringEventReference = z.infer<
  typeof CharacterMismatchTriggeringEventReferenceSchema
>;
export type CharacterMismatchContradictedFactReference = z.infer<
  typeof CharacterMismatchContradictedFactReferenceSchema
>;
export type CharacterMismatchIntroductionPoint = z.infer<
  typeof CharacterMismatchIntroductionPointSchema
>;
export type CharacterMismatchEpisodeSpan = z.infer<
  typeof CharacterMismatchEpisodeSpanSchema
>;
export type CharacterMismatchCauseStatus = z.infer<
  typeof CharacterMismatchCauseStatusSchema
>;
export type CharacterMismatchRecordedCauseType = z.infer<
  typeof CharacterMismatchRecordedCauseTypeSchema
>;
export type CharacterMismatchProvenance = z.infer<
  typeof CharacterMismatchProvenanceSchema
>;
export type CharacterMismatchValidationFailureCode = z.infer<
  typeof CharacterMismatchValidationFailureCodeSchema
>;
export type CharacterMismatchValidationFailureMismatch = z.infer<
  typeof CharacterMismatchValidationFailureMismatchSchema
>;
export type CharacterMismatchMissingCauseDescriptor = z.infer<
  typeof CharacterMismatchMissingCauseDescriptorSchema
>;
export type CharacterMismatchValidationFailureContext = z.infer<
  typeof CharacterMismatchValidationFailureContextSchema
>;
export type CharacterMismatchValidationFailure = z.infer<
  typeof CharacterMismatchValidationFailureSchema
>;
export type CharacterMismatchCausationRecord = z.infer<
  typeof CharacterMismatchCausationRecordSchema
>;
export type CharacterMismatchCausationLedger = z.infer<
  typeof CharacterMismatchCausationLedgerSchema
>;

function sanitizeCauseIdToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]+/g, "-");
}

function resolveMismatchProvenance(
  record: CharacterMismatchCausationRecord,
): CharacterMismatchProvenance {
  if (record.provenance) {
    return record.provenance;
  }

  const causeType = record.explicitCause?.kind
    ?? record.validationFailure?.code
    ?? "uncaused_mismatch";
  const sourceEventId = record.sourceEvent?.eventId
    ?? record.validationFailure?.failureContext.sourceEventId
    ?? record.validationFailure?.failureContext.triggeringEventId
    ?? record.triggeringEvent?.eventId
    ?? record.contradictedFact?.sourceEventId
    ?? `synthetic:${record.affectedEntity.recordType}:${record.affectedEntity.recordId}:chapter:${record.introduction.chapter}`;
  const sourceEpisode = record.sourceEvent?.chapter
    ?? record.triggeringEvent?.chapter
    ?? record.contradictedFact?.chapter
    ?? record.introduction.chapter;

  return {
    causeId: [
      "cause",
      record.affectedEntity.recordType,
      sanitizeCauseIdToken(record.affectedEntity.recordId),
      sanitizeCauseIdToken(causeType),
      sanitizeCauseIdToken(sourceEventId),
      `ep${sourceEpisode}`,
    ].join(":"),
    causeType,
    sourceEpisode,
    sourceEventId,
  };
}

export function ensureCharacterMismatchCausationProvenance(
  record: CharacterMismatchCausationRecord,
): CharacterMismatchCausationRecord {
  const provenance = resolveMismatchProvenance(record);

  return {
    ...record,
    provenance,
    validationFailure: record.validationFailure
      ? {
        ...record.validationFailure,
        failureContext: {
          ...record.validationFailure.failureContext,
          provenance,
        },
      }
      : undefined,
  };
}

export function createCharacterMismatchCausationLedger(
  records: readonly CharacterMismatchCausationRecord[],
): CharacterMismatchCausationLedger {
  return CharacterMismatchCausationLedgerSchema.parse({
    schema: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME,
    version: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION,
    records: records.map((record) =>
      PersistedCharacterMismatchCausationRecordSchema.parse(
        ensureCharacterMismatchCausationProvenance(record),
      )),
  });
}

export function loadCharacterMismatchCausationLedger(
  data: unknown,
): CharacterMismatchCausationLedger {
  return CharacterMismatchCausationLedgerSchema.parse(data);
}
