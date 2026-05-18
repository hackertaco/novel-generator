import { z } from "zod";

import {
  CharacterClaimMismatchTypeSchema,
  CharacterMismatchProvenanceSchema,
  ensureCharacterMismatchCausationProvenance,
  CognitionRecordTypeSchema,
  type CharacterClaimMismatchType,
  type CognitionRecordType,
} from "./mismatch-causation";
import type {
  ObjectiveFactRecord,
  ObjectiveFactStore,
} from "./objective-facts";
import type { SimulationState } from "./types";
import {
  ObjectiveStateCanonicalTruthValueSchema,
  ObjectiveStateContradictionCategorySchema,
  ObjectiveStateNormalizedTruthValueSchema,
  verifyCharacterCognitionConsistency,
  type CharacterClaimMismatchRecord,
  type CharacterClaimMismatchValidityStatus,
  type CognitionVerifierOptions,
  type ObjectiveStateCanonicalTruthValue,
  type ObjectiveStateContradictionCategory,
  type ObjectiveStateNormalizedTruthValue,
  type ObjectiveStateVerificationRecord,
} from "./verifier";

export const MismatchAffectedEntitiesSchema = z.object({
  characterIds: z.array(z.string()).default([]),
  objectiveFactIds: z.array(z.string()).default([]),
  entityIds: z.array(z.string()).default([]),
  scopeIds: z.array(z.string()).default([]),
});

export const NormalizedMismatchClassificationResultSchema = z.object({
  recordType: CognitionRecordTypeSchema,
  characterId: z.string().min(1),
  recordId: z.string().min(1),
  chapter: z.number().int().min(0),
  contradictionType: CharacterClaimMismatchTypeSchema,
  contradictionCategories: z.array(ObjectiveStateContradictionCategorySchema).default([]),
  validityStatus: z.enum(["valid", "invalid"]),
  normalizedCanonicalTruths: z.array(ObjectiveStateCanonicalTruthValueSchema).default([]),
  normalizedObservedClaims: z.array(ObjectiveStateNormalizedTruthValueSchema).min(1),
  issueCodes: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
  affectedEntities: MismatchAffectedEntitiesSchema,
  provenance: CharacterMismatchProvenanceSchema,
});

export const MismatchClassificationReportSchema = z.object({
  mismatchCount: z.number().int().min(0),
  byContradictionType: z.record(z.string(), z.number().int().min(0)).default({}),
  byCauseType: z.record(z.string(), z.number().int().min(0)).default({}),
  byRecordType: z.record(z.string(), z.number().int().min(0)).default({}),
  results: z.array(NormalizedMismatchClassificationResultSchema),
});

export type MismatchAffectedEntities = z.infer<
  typeof MismatchAffectedEntitiesSchema
>;
export type NormalizedMismatchClassificationResult = z.infer<
  typeof NormalizedMismatchClassificationResultSchema
>;
export type MismatchClassificationReport = z.infer<
  typeof MismatchClassificationReportSchema
>;

export type MismatchClassificationState = Pick<
  SimulationState,
  "objectiveFacts" | "memories" | "beliefs" | "utterances" | "eventLog"
>;

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function normalizeObservedClaim(raw: string): ObjectiveStateNormalizedTruthValue {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return ObjectiveStateNormalizedTruthValueSchema.parse({
    raw,
    normalized: (collapsed || raw).toLowerCase(),
  });
}

function buildCheckKey(
  recordType: CognitionRecordType,
  recordId: string,
): string {
  return `${recordType}:${recordId}`;
}

function collectFactRecords(
  facts: ObjectiveFactStore,
  factIds: readonly string[],
): ObjectiveFactRecord[] {
  return uniqueStrings([...factIds])
    .map((factId) => facts.byId[factId])
    .filter((fact): fact is ObjectiveFactRecord => Boolean(fact));
}

function collectAffectedEntities(
  facts: ObjectiveFactStore,
  mismatch: CharacterClaimMismatchRecord,
): MismatchAffectedEntities {
  const objectiveFactIds = uniqueStrings(mismatch.evidence.objectiveFactIds);
  const factRecords = collectFactRecords(facts, objectiveFactIds);

  return MismatchAffectedEntitiesSchema.parse({
    characterIds: uniqueStrings([
      mismatch.characterId,
      ...factRecords.flatMap((fact) => [
        fact.subjectEntity.entityType === "character"
          ? fact.subjectEntity.entityId
          : undefined,
        fact.objectEntity?.entityType === "character"
          ? fact.objectEntity.entityId
          : undefined,
      ]),
    ]),
    objectiveFactIds,
    entityIds: uniqueStrings(
      factRecords.flatMap((fact) => [
        fact.subjectEntity.entityId,
        fact.objectEntity?.entityId,
        ...fact.scope.entityIds,
      ]),
    ),
    scopeIds: uniqueStrings(factRecords.map((fact) => fact.scope.scopeId)),
  });
}

function classifySingleMismatch(
  state: MismatchClassificationState,
  mismatch: CharacterClaimMismatchRecord,
  objectiveStateCheck: ObjectiveStateVerificationRecord | undefined,
): NormalizedMismatchClassificationResult {
  const causation = ensureCharacterMismatchCausationProvenance(
    mismatch.causation,
  );

  return NormalizedMismatchClassificationResultSchema.parse({
    recordType: mismatch.recordType,
    characterId: mismatch.characterId,
    recordId: mismatch.recordId,
    chapter: mismatch.chapter,
    contradictionType: mismatch.mismatchType,
    contradictionCategories: objectiveStateCheck?.contradictionCategories ?? [],
    validityStatus: mismatch.validityStatus satisfies CharacterClaimMismatchValidityStatus,
    normalizedCanonicalTruths: objectiveStateCheck?.normalizedTruthValues.canonicalFacts ?? [],
    normalizedObservedClaims: objectiveStateCheck?.normalizedTruthValues.observedClaims
      ?? [normalizeObservedClaim(mismatch.claim)],
    issueCodes: [...mismatch.issueCodes],
    explanation: mismatch.explanation,
    affectedEntities: collectAffectedEntities(state.objectiveFacts, mismatch),
    provenance: causation.provenance,
  });
}

function incrementCount(
  counts: Record<string, number>,
  key: string,
): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function classifySimulationStateMismatches(
  state: MismatchClassificationState,
  options?: CognitionVerifierOptions,
): MismatchClassificationReport {
  const verification = verifyCharacterCognitionConsistency(state, options);
  const checksByRecord = new Map<string, ObjectiveStateVerificationRecord>(
    verification.objectiveStateChecks.map((check) => [
      buildCheckKey(check.recordType, check.recordId),
      check,
    ]),
  );
  const byContradictionType: Record<string, number> = {};
  const byCauseType: Record<string, number> = {};
  const byRecordType: Record<string, number> = {};
  const results = verification.mismatches.map((mismatch) => {
    const classification = classifySingleMismatch(
      state,
      mismatch,
      checksByRecord.get(buildCheckKey(mismatch.recordType, mismatch.recordId)),
    );

    incrementCount(byContradictionType, classification.contradictionType);
    incrementCount(byCauseType, classification.provenance.causeType);
    incrementCount(byRecordType, classification.recordType);
    return classification;
  });

  return MismatchClassificationReportSchema.parse({
    mismatchCount: results.length,
    byContradictionType,
    byCauseType,
    byRecordType,
    results,
  });
}

export function filterMismatchClassificationResults(
  report: MismatchClassificationReport,
  predicate: (result: NormalizedMismatchClassificationResult) => boolean,
): NormalizedMismatchClassificationResult[] {
  return report.results.filter(predicate);
}

export function listMismatchClassificationsByType(
  report: MismatchClassificationReport,
  contradictionType: CharacterClaimMismatchType,
): NormalizedMismatchClassificationResult[] {
  return filterMismatchClassificationResults(
    report,
    (result) => result.contradictionType === contradictionType,
  );
}

export function listMismatchClassificationsByRecordType(
  report: MismatchClassificationReport,
  recordType: CognitionRecordType,
): NormalizedMismatchClassificationResult[] {
  return filterMismatchClassificationResults(
    report,
    (result) => result.recordType === recordType,
  );
}

export type {
  ObjectiveStateCanonicalTruthValue,
  ObjectiveStateContradictionCategory,
  ObjectiveStateNormalizedTruthValue,
};
