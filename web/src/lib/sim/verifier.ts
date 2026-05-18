import { z } from "zod";
import type {
  CharacterBeliefKind,
  CharacterBeliefRecord,
  CharacterBeliefStore,
} from "./belief-state";
import type {
  CharacterDivergenceCause,
  CharacterDivergenceCauseKind,
} from "./cognitive-dissonance";
import {
  CharacterMismatchCausationRecordSchema,
  createCharacterMismatchCausationLedger,
  ensureCharacterMismatchCausationProvenance,
  type CharacterClaimMismatchType,
  type CharacterMismatchCausationLedger,
  type CharacterMismatchCausationRecord,
  type CharacterMismatchValidationFailure,
  type CognitionRecordType,
} from "./mismatch-causation";
import {
  CognitionVerificationIssueCodeSchema,
  type CognitionVerificationIssueCode,
} from "./verifier-failure-policy";
import type {
  CharacterMemoryAccuracy,
  CharacterMemoryKind,
  CharacterMemoryRecord,
  CharacterMemoryStore,
} from "./memory-state";
import type {
  ObjectiveFactRecord,
  ObjectiveFactStore,
} from "./objective-facts";
import type {
  SimulationEvent,
  SimulationState,
} from "./types";
import type {
  CharacterUtteranceProvenanceSource,
  CharacterUtteranceRecord,
  CharacterUtteranceStore,
} from "./utterance-state";
export type CharacterClaimMismatchValidityStatus = "valid" | "invalid";
export type CharacterMismatchTraceDimension =
  | "perceived"
  | "inferred"
  | "forgotten"
  | "concealed"
  | "misunderstood";
export type CharacterMismatchTraceStatus =
  | "supported"
  | "missing"
  | "not_applicable";
export type ObjectiveStateContradictionCategory =
  | "canonical_conflict"
  | "missing_canonical_truth"
  | "normalized_value_mismatch"
  | "missing_divergence_cause"
  | "missing_traceability_link"
  | "unsupported_divergence_cause"
  | "insufficient_divergence_trace"
  | "unexpected_divergence_cause";

export const ObjectiveStateNormalizedTruthValueSchema = z.object({
  raw: z.string().min(1),
  normalized: z.string().min(1),
});

export const ObjectiveStateCanonicalTruthValueSchema = z.object({
  factId: z.string().min(1),
  subject: ObjectiveStateNormalizedTruthValueSchema,
  predicate: ObjectiveStateNormalizedTruthValueSchema,
  object: ObjectiveStateNormalizedTruthValueSchema,
  summary: ObjectiveStateNormalizedTruthValueSchema,
  sourceEventId: z.string().min(1).optional(),
});

export const ObjectiveStateComparisonFieldsSchema = z.object({
  canonicalSubjects: z.array(ObjectiveStateNormalizedTruthValueSchema).default([]),
  canonicalPredicates: z.array(ObjectiveStateNormalizedTruthValueSchema).default([]),
  canonicalObjects: z.array(ObjectiveStateNormalizedTruthValueSchema).default([]),
  canonicalSummaries: z.array(ObjectiveStateNormalizedTruthValueSchema).default([]),
  observedClaims: z.array(ObjectiveStateNormalizedTruthValueSchema).min(1),
});

export const ObjectiveStateContradictionCategorySchema = z.enum([
  "canonical_conflict",
  "missing_canonical_truth",
  "normalized_value_mismatch",
  "missing_divergence_cause",
  "missing_traceability_link",
  "unsupported_divergence_cause",
  "insufficient_divergence_trace",
  "unexpected_divergence_cause",
]);

export const ObjectiveStateVerificationRecordSchema = z.object({
  recordType: z.enum(["memory", "belief", "utterance"]),
  characterId: z.string().min(1),
  recordId: z.string().min(1),
  chapter: z.number().int().min(0),
  factIds: z.array(z.string()).default([]),
  normalizedTruthValues: z.object({
    canonicalFacts: z.array(ObjectiveStateCanonicalTruthValueSchema).default([]),
    observedClaims: z.array(ObjectiveStateNormalizedTruthValueSchema).min(1),
  }),
  comparisonFields: ObjectiveStateComparisonFieldsSchema,
  contradictionCategories: z.array(ObjectiveStateContradictionCategorySchema).default([]),
  issueCodes: z.array(CognitionVerificationIssueCodeSchema).default([]),
});

export type ObjectiveStateNormalizedTruthValue = z.infer<
  typeof ObjectiveStateNormalizedTruthValueSchema
>;
export type ObjectiveStateCanonicalTruthValue = z.infer<
  typeof ObjectiveStateCanonicalTruthValueSchema
>;
export type ObjectiveStateComparisonFields = z.infer<
  typeof ObjectiveStateComparisonFieldsSchema
>;
export type ObjectiveStateVerificationRecord = z.infer<
  typeof ObjectiveStateVerificationRecordSchema
>;

export interface CognitionVerificationIssue {
  code: CognitionVerificationIssueCode;
  recordType: CognitionRecordType;
  characterId: string;
  recordId: string;
  chapter: number;
  factIds: string[];
  severity: "error";
  message: string;
}

export interface CanonicalTruthReference {
  factId: string;
  subject: string;
  predicate: string;
  object: string;
  summary: string;
  sourceEventId?: string;
}

export interface CharacterClaimMismatchEvidence {
  eventId?: string;
  sourceEventId?: string;
  objectiveFactIds: string[];
  memoryIds: string[];
  utteranceIds: string[];
  traceabilityAnchors: string[];
  unresolvedTraceabilityReferences: string[];
}

export interface CharacterMismatchRuleTraceStep {
  dimension: CharacterMismatchTraceDimension;
  status: CharacterMismatchTraceStatus;
  evidence: string[];
}

export interface CharacterMismatchRuleOutcome {
  status: CharacterClaimMismatchValidityStatus;
  causeKind?: CharacterDivergenceCauseKind;
  requiredDimensions: CharacterMismatchTraceDimension[];
  satisfiedDimensions: CharacterMismatchTraceDimension[];
  missingDimensions: CharacterMismatchTraceDimension[];
  traceabilityStatus: CharacterMismatchTraceStatus;
  traceabilityAnchors: string[];
  unresolvedTraceabilityReferences: string[];
  trace: CharacterMismatchRuleTraceStep[];
  summary: string;
}

export interface CharacterClaimMismatchRecord {
  recordType: CognitionRecordType;
  characterId: string;
  recordId: string;
  chapter: number;
  claim: string;
  mismatchType: CharacterClaimMismatchType;
  causation: CharacterMismatchCausationRecord;
  validityStatus: CharacterClaimMismatchValidityStatus;
  explanation: string;
  canonicalTruths: CanonicalTruthReference[];
  divergenceCause?: CharacterDivergenceCause;
  ruleOutcome: CharacterMismatchRuleOutcome;
  evidence: CharacterClaimMismatchEvidence;
  issueCodes: CognitionVerificationIssueCode[];
}

export interface CognitionVerificationReport {
  passed: boolean;
  checkedMemories: number;
  checkedBeliefs: number;
  checkedUtterances: number;
  issues: CognitionVerificationIssue[];
  mismatches: CharacterClaimMismatchRecord[];
  objectiveStateChecks: ObjectiveStateVerificationRecord[];
}

export interface SimulationValidationVerdict {
  passed: boolean;
  checkedMemories: number;
  checkedBeliefs: number;
  checkedUtterances: number;
  issueCount: number;
  mismatchCount: number;
  invalidContradictionCount: number;
  allowedExceptionCount: number;
  mismatchCausationLedger: CharacterMismatchCausationLedger;
  invalidContradictions: CharacterClaimMismatchRecord[];
  allowedExceptions: CharacterClaimMismatchRecord[];
  issues: CognitionVerificationIssue[];
  objectiveStateChecks: ObjectiveStateVerificationRecord[];
}

export interface ImmediateCognitionWriteCheck {
  passed: boolean;
  recordType: CognitionRecordType;
  recordId: string;
  issues: CognitionVerificationIssue[];
  blockingIssues: CognitionVerificationIssue[];
  mismatch?: CharacterClaimMismatchRecord;
  objectiveStateCheck?: ObjectiveStateVerificationRecord;
}

export interface CognitionVerifierOptions {
  allowedMemoryDivergenceCauses?: CharacterDivergenceCauseKind[];
  allowedBeliefDivergenceCauses?: CharacterDivergenceCauseKind[];
  allowedUtteranceDivergenceCauses?: CharacterDivergenceCauseKind[];
}

type VerifiableSimulationState = Pick<
  SimulationState,
  "objectiveFacts" | "memories" | "beliefs" | "utterances" | "eventLog"
>;

const WRITE_TIME_BLOCKING_ISSUE_CODES = new Set<CognitionVerificationIssueCode>([
  "normalized_value_mismatch",
  "missing_divergence_cause",
  "unsupported_divergence_cause",
  "unexpected_divergence_cause",
]);

interface ClaimValidationInput {
  recordType: CognitionRecordType;
  characterId: string;
  recordId: string;
  chapter: number;
  claim: string;
  comparisonInputs?: string[];
  causeText?: string;
  factIds: string[];
  divergenceCause?: CharacterDivergenceCause;
  divergesFromCanonicalFacts: boolean;
  beliefKind?: CharacterBeliefKind;
  eventId?: string;
  memoryIds?: string[];
  memoryKind?: CharacterMemoryKind;
  memoryTruthAlignment?: CharacterMemoryAccuracy;
  recalledAtChapters?: number[];
  utteranceIds?: string[];
  utteranceProvenanceSource?: CharacterUtteranceProvenanceSource;
  witnessCharacterIds?: string[];
}

interface SimulationHistoryContext {
  eventChaptersById: Map<string, number>;
  eventActorIdsById: Map<string, string | undefined>;
  memoryChaptersById: Map<string, number>;
  utteranceChaptersById: Map<string, number>;
}

interface ResolvedTraceabilityLinks {
  eventId?: string;
  sourceEventId?: string;
  memoryIds: string[];
  utteranceIds: string[];
  traceabilityAnchors: string[];
  unresolvedReferences: string[];
}

const DEFAULT_ALLOWED_MEMORY_DIVERGENCE_CAUSES: CharacterDivergenceCauseKind[] = [
  "forgetting",
  "misunderstanding",
  "misinterpretation",
  "lack_of_information",
  "deception",
  "trauma",
];

const DEFAULT_ALLOWED_BELIEF_DIVERGENCE_CAUSES: CharacterDivergenceCauseKind[] = [
  "misunderstanding",
  "misinterpretation",
  "lack_of_information",
  "deception",
  "trauma",
  "bias",
];

const DEFAULT_ALLOWED_UTTERANCE_DIVERGENCE_CAUSES: CharacterDivergenceCauseKind[] = [
  "forgetting",
  "misunderstanding",
  "misinterpretation",
  "lying",
  "lack_of_information",
  "deception",
  "trauma",
  "bias",
];

function formatAllowedCauses(causes: Iterable<CharacterDivergenceCauseKind>): string {
  return Array.from(new Set(causes)).join(", ");
}

function uniqueStrings(values: string[] | undefined): string[] {
  return Array.from(new Set(values ?? []));
}

function buildCanonicalTruthReference(fact: ObjectiveFactRecord): CanonicalTruthReference {
  return {
    factId: fact.id,
    subject: fact.subject,
    predicate: fact.predicate,
    object: fact.object,
    summary: fact.summary,
    sourceEventId: fact.sourceEventId,
  };
}

function buildUnknownFactIssue(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factId: string,
): CognitionVerificationIssue {
  return {
    code: "unknown_objective_fact",
    recordType,
    characterId,
    recordId,
    chapter,
    factIds: [factId],
    severity: "error",
    message: `${recordType} ${recordId} for ${characterId} references missing canonical fact ${factId}`,
  };
}

function buildMissingCauseIssue(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
): CognitionVerificationIssue {
  return {
    code: "missing_divergence_cause",
    recordType,
    characterId,
    recordId,
    chapter,
    factIds,
    severity: "error",
    message: `${recordType} ${recordId} for ${characterId} diverges from canonical facts without an explicit cause`,
  };
}

function buildMissingTraceabilityLinkIssue(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
  traceability: ResolvedTraceabilityLinks,
): CognitionVerificationIssue {
  const unresolvedSuffix = traceability.unresolvedReferences.length > 0
    ? ` Unresolved references: ${traceability.unresolvedReferences.join(", ")}.`
    : "";

  return {
    code: "missing_traceability_link",
    recordType,
    characterId,
    recordId,
    chapter,
    factIds,
    severity: "error",
    message: `${recordType} ${recordId} for ${characterId} diverges from canonical facts without an explicit link to recorded simulation history.${unresolvedSuffix}`,
  };
}

function buildNormalizedValueMismatchIssue(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
): CognitionVerificationIssue {
  return {
    code: "normalized_value_mismatch",
    recordType,
    characterId,
    recordId,
    chapter,
    factIds,
    severity: "error",
    message: `${recordType} ${recordId} for ${characterId} does not match canonical truth after normalized case-insensitive comparison`,
  };
}

function buildUnsupportedCauseIssue(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
  cause: CharacterDivergenceCause,
  allowedCauses: Set<CharacterDivergenceCauseKind>,
): CognitionVerificationIssue {
  return {
    code: "unsupported_divergence_cause",
    recordType,
    characterId,
    recordId,
    chapter,
    factIds,
    severity: "error",
    message: `${recordType} ${recordId} for ${characterId} uses unsupported divergence cause ${cause.kind}; allowed causes: ${formatAllowedCauses(allowedCauses)}`,
  };
}

function buildUnexpectedCauseIssue(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
): CognitionVerificationIssue {
  return {
    code: "unexpected_divergence_cause",
    recordType,
    characterId,
    recordId,
    chapter,
    factIds,
    severity: "error",
    message: `${recordType} ${recordId} for ${characterId} includes a divergence cause without contradicting canonical facts`,
  };
}

function buildInsufficientTraceIssue(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
  outcome: CharacterMismatchRuleOutcome,
): CognitionVerificationIssue {
  return {
    code: "insufficient_divergence_trace",
    recordType,
    characterId,
    recordId,
    chapter,
    factIds,
    severity: "error",
    message: `${recordType} ${recordId} for ${characterId} cannot justify divergence with ${outcome.causeKind ?? "unknown"}; missing trace: ${outcome.missingDimensions.join(", ")}`,
  };
}

function collectFactIssues(
  facts: ObjectiveFactStore,
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
): CognitionVerificationIssue[] {
  return factIds.flatMap((factId) =>
    facts.byId[factId]
      ? []
      : [buildUnknownFactIssue(recordType, characterId, recordId, chapter, factId)]
  );
}

function uniqueDefinedStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function buildSimulationHistoryContext(
  state: VerifiableSimulationState,
): SimulationHistoryContext {
  return {
    eventChaptersById: new Map(
      state.eventLog.map((event) => [event.id, event.chapter]),
    ),
    eventActorIdsById: new Map(
      state.eventLog.map((event) => [event.id, event.actorId]),
    ),
    memoryChaptersById: new Map(
      listMemoryRecords(state.memories).map((memory) => [memory.id, memory.chapter]),
    ),
    utteranceChaptersById: new Map(
      listUtteranceRecords(state.utterances).map((utterance) => [utterance.id, utterance.chapter]),
    ),
  };
}

function resolveEventHistoryRecord(
  history: SimulationHistoryContext,
  eventId: string | undefined,
  chapter: number,
): Pick<SimulationEvent, "id" | "chapter" | "actorId"> | undefined {
  if (!eventId) {
    return undefined;
  }

  const eventChapter = history.eventChaptersById.get(eventId);
  if (eventChapter === undefined || eventChapter > chapter) {
    return undefined;
  }

  return {
    id: eventId,
    chapter: eventChapter,
    actorId: history.eventActorIdsById.get(eventId),
  };
}

function resolveTraceabilityLinks(
  input: ClaimValidationInput,
  history: SimulationHistoryContext,
): ResolvedTraceabilityLinks {
  const resolveEventId = (eventId: string | undefined): string | undefined => {
    if (!eventId) {
      return undefined;
    }

    const chapter = history.eventChaptersById.get(eventId);
    return chapter !== undefined && chapter <= input.chapter ? eventId : undefined;
  };
  const resolveRecordIds = (
    ids: string[] | undefined,
    chaptersById: Map<string, number>,
  ): string[] =>
    uniqueStrings(ids).filter((id) => {
      const chapter = chaptersById.get(id);
      return chapter !== undefined && chapter <= input.chapter;
    });

  const eventId = resolveEventId(input.eventId);
  const sourceEventId = resolveEventId(input.divergenceCause?.sourceEventId);
  const memoryIds = resolveRecordIds(input.memoryIds, history.memoryChaptersById);
  const utteranceIds = resolveRecordIds(input.utteranceIds, history.utteranceChaptersById);

  return {
    eventId,
    sourceEventId,
    memoryIds,
    utteranceIds,
    traceabilityAnchors: uniqueDefinedStrings([
      eventId ? `event:${eventId}` : undefined,
      sourceEventId ? `cause-event:${sourceEventId}` : undefined,
      ...memoryIds.map((memoryId) => `memory:${memoryId}`),
      ...utteranceIds.map((utteranceId) => `utterance:${utteranceId}`),
    ]),
    unresolvedReferences: uniqueDefinedStrings([
      input.eventId && !eventId ? `event:${input.eventId}` : undefined,
      input.divergenceCause?.sourceEventId && !sourceEventId
        ? `cause-event:${input.divergenceCause.sourceEventId}`
        : undefined,
      ...uniqueStrings(input.memoryIds)
        .filter((memoryId) => !memoryIds.includes(memoryId))
        .map((memoryId) => `memory:${memoryId}`),
      ...uniqueStrings(input.utteranceIds)
        .filter((utteranceId) => !utteranceIds.includes(utteranceId))
        .map((utteranceId) => `utterance:${utteranceId}`),
    ]),
  };
}

function normalizeTruthValue(raw: string): ObjectiveStateNormalizedTruthValue {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return ObjectiveStateNormalizedTruthValueSchema.parse({
    raw,
    normalized: (collapsed || raw).toLowerCase(),
  });
}

function buildComparableFragments(value: ObjectiveStateNormalizedTruthValue): string[] {
  const normalized = value.normalized;
  const compact = normalized.replace(/\s+/g, "");
  const tokenVariants = buildComparableTokens(value).flatMap((token) => {
    const variants = [token];
    if (token.length >= 3) {
      variants.push(token.slice(0, -1));
    }
    return variants;
  });

  return uniqueStrings([
    normalized,
    compact,
    ...tokenVariants,
  ]).filter((fragment) => fragment.length >= 2);
}

function buildComparableTokens(value: ObjectiveStateNormalizedTruthValue): string[] {
  return uniqueStrings(
    value.normalized
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => {
        if (token.length < 2) {
          return false;
        }

        if (/^[a-z0-9]+$/i.test(token)) {
          return token.length >= 4;
        }

        return true;
      }),
  );
}

function hasComparableOverlap(
  left: ObjectiveStateNormalizedTruthValue,
  right: ObjectiveStateNormalizedTruthValue,
): boolean {
  const leftFragments = buildComparableFragments(left);
  const rightFragments = buildComparableFragments(right);

  return leftFragments.some((leftFragment) =>
    rightFragments.some((rightFragment) =>
      leftFragment === rightFragment
      || leftFragment.includes(rightFragment)
      || rightFragment.includes(leftFragment)
    )
  );
}

function hasAnyComparableOverlap(
  observedValues: ObjectiveStateNormalizedTruthValue[],
  canonicalValues: ObjectiveStateNormalizedTruthValue[],
): boolean {
  return observedValues.some((observed) =>
    canonicalValues.some((canonical) => hasComparableOverlap(observed, canonical))
  );
}

function shouldFlagNormalizedValueMismatch(
  input: ClaimValidationInput,
  canonicalTruths: ObjectiveStateCanonicalTruthValue[],
): boolean {
  if (input.divergesFromCanonicalFacts || canonicalTruths.length === 0) {
    return false;
  }

  const observedValues = [
    normalizeTruthValue(input.claim),
    ...uniqueStrings(input.comparisonInputs).map(normalizeTruthValue),
  ];
  const subjectMatched = hasAnyComparableOverlap(
    observedValues,
    canonicalTruths.map((truth) => truth.subject),
  );
  const objectMatched = hasAnyComparableOverlap(
    observedValues,
    canonicalTruths.map((truth) => truth.object),
  );
  const observedTokens = uniqueStrings(
    observedValues.flatMap((observed) => buildComparableTokens(observed)),
  );
  const summaryAnchorMatched = canonicalTruths.some((truth) => {
    const subjectTokens = new Set(buildComparableTokens(truth.subject));
    const predicateTokens = new Set(buildComparableTokens(truth.predicate));
    const summaryAnchorTokens = buildComparableTokens(truth.summary).filter((token) =>
      !subjectTokens.has(token) && !predicateTokens.has(token)
    );

    return summaryAnchorTokens.some((summaryToken) =>
      observedTokens.some((observedToken) =>
        observedToken === summaryToken
        || observedToken.includes(summaryToken)
        || summaryToken.includes(observedToken)
      )
    );
  });
  const objectOrSummaryMatched = objectMatched || summaryAnchorMatched;

  return !subjectMatched || !objectOrSummaryMatched;
}

function buildCanonicalTruthValue(
  fact: ObjectiveFactRecord,
): ObjectiveStateCanonicalTruthValue {
  return ObjectiveStateCanonicalTruthValueSchema.parse({
    factId: fact.id,
    subject: normalizeTruthValue(fact.subject),
    predicate: normalizeTruthValue(fact.predicate),
    object: normalizeTruthValue(fact.object),
    summary: normalizeTruthValue(fact.summary),
    sourceEventId: fact.sourceEventId,
  });
}

function deriveContradictionCategories(
  input: ClaimValidationInput,
  issues: CognitionVerificationIssue[],
  canonicalTruths: ObjectiveStateCanonicalTruthValue[],
): ObjectiveStateContradictionCategory[] {
  const categories = new Set<ObjectiveStateContradictionCategory>();

  if (issues.some((issue) => issue.code === "unknown_objective_fact")) {
    categories.add("missing_canonical_truth");
  } else if (input.divergesFromCanonicalFacts && canonicalTruths.length > 0) {
    categories.add("canonical_conflict");
  }

  for (const issue of issues) {
    switch (issue.code) {
      case "unknown_objective_fact":
        categories.add("missing_canonical_truth");
        break;
      case "normalized_value_mismatch":
        categories.add("normalized_value_mismatch");
        break;
      case "missing_divergence_cause":
        categories.add("missing_divergence_cause");
        break;
      case "missing_traceability_link":
        categories.add("missing_traceability_link");
        break;
      case "unsupported_divergence_cause":
        categories.add("unsupported_divergence_cause");
        break;
      case "insufficient_divergence_trace":
        categories.add("insufficient_divergence_trace");
        break;
      case "unexpected_divergence_cause":
        categories.add("unexpected_divergence_cause");
        break;
    }
  }

  return Array.from(categories);
}

function buildObjectiveStateVerificationRecord(
  facts: ObjectiveFactStore,
  input: ClaimValidationInput,
  issues: CognitionVerificationIssue[],
): ObjectiveStateVerificationRecord {
  const canonicalTruths = uniqueStrings(input.factIds)
    .map((factId) => facts.byId[factId])
    .filter((fact): fact is ObjectiveFactRecord => Boolean(fact))
    .map(buildCanonicalTruthValue);
  const observedClaims = [normalizeTruthValue(input.claim)];

  return ObjectiveStateVerificationRecordSchema.parse({
    recordType: input.recordType,
    characterId: input.characterId,
    recordId: input.recordId,
    chapter: input.chapter,
    factIds: uniqueStrings(input.factIds),
    normalizedTruthValues: {
      canonicalFacts: canonicalTruths,
      observedClaims,
    },
    comparisonFields: {
      canonicalSubjects: canonicalTruths.map((truth) => truth.subject),
      canonicalPredicates: canonicalTruths.map((truth) => truth.predicate),
      canonicalObjects: canonicalTruths.map((truth) => truth.object),
      canonicalSummaries: canonicalTruths.map((truth) => truth.summary),
      observedClaims,
    },
    contradictionCategories: deriveContradictionCategories(
      input,
      issues,
      canonicalTruths,
    ),
    issueCodes: Array.from(new Set(issues.map((issue) => issue.code))),
  });
}

function buildTraceEvidence(
  input: ClaimValidationInput,
  traceability: ResolvedTraceabilityLinks,
): Record<CharacterMismatchTraceDimension, string[]> {
  const perceived = uniqueDefinedStrings([
    traceability.eventId ? `event:${traceability.eventId}` : undefined,
    traceability.sourceEventId
      ? `cause-event:${traceability.sourceEventId}`
      : undefined,
    input.memoryKind === "direct_experience"
      ? "memory-kind:direct_experience"
      : undefined,
    input.memoryKind === "secondhand_report"
      ? "memory-kind:secondhand_report"
      : undefined,
    input.utteranceProvenanceSource === "direct_scene_capture"
      || input.utteranceProvenanceSource === "reported_in_scene"
      ? `utterance-source:${input.utteranceProvenanceSource}`
      : undefined,
    (input.witnessCharacterIds?.length ?? 0) > 0
      ? `witnesses:${input.witnessCharacterIds!.length}`
      : undefined,
    traceability.utteranceIds.length > 0
      ? `utterances:${traceability.utteranceIds.length}`
      : undefined,
  ]);
  const inferred = uniqueDefinedStrings([
    input.beliefKind ? `belief-kind:${input.beliefKind}` : undefined,
    input.memoryKind === "inference" ? "memory-kind:inference" : undefined,
    input.causeText ? "cause-text" : undefined,
    traceability.memoryIds.length > 0
      ? `memories:${traceability.memoryIds.length}`
      : undefined,
    traceability.utteranceIds.length > 0
      ? `utterances:${traceability.utteranceIds.length}`
      : undefined,
  ]);
  const forgotten = uniqueDefinedStrings([
    input.divergenceCause?.kind === "forgetting" ? "cause-kind:forgetting" : undefined,
    input.memoryKind === "recollection" ? "memory-kind:recollection" : undefined,
    (input.recalledAtChapters?.length ?? 0) > 0
      ? `recalled-at:${input.recalledAtChapters!.length}`
      : undefined,
    input.memoryTruthAlignment === "partial" ? "truth-alignment:partial" : undefined,
  ]);
  const concealed = uniqueDefinedStrings([
    input.divergenceCause?.kind === "lying" ? "cause-kind:lying" : undefined,
    input.divergenceCause?.kind === "deception" ? "cause-kind:deception" : undefined,
    input.recordType === "utterance" ? "record-type:utterance" : undefined,
    input.causeText ? "cause-text" : undefined,
    input.divergenceCause?.sourceCharacterId
      ? `source-character:${input.divergenceCause.sourceCharacterId}`
      : undefined,
  ]);
  const misunderstood = uniqueDefinedStrings([
    input.divergenceCause && (
      input.divergenceCause.kind === "misunderstanding"
      || input.divergenceCause.kind === "misinterpretation"
      || input.divergenceCause.kind === "lack_of_information"
      || input.divergenceCause.kind === "trauma"
      || input.divergenceCause.kind === "bias"
    )
      ? `cause-kind:${input.divergenceCause.kind}`
      : undefined,
    input.divergenceCause?.summary ? "cause-summary" : undefined,
    input.memoryTruthAlignment === "distorted" ? "truth-alignment:distorted" : undefined,
    input.beliefKind ? `belief-kind:${input.beliefKind}` : undefined,
  ]);

  return {
    perceived,
    inferred,
    forgotten,
    concealed,
    misunderstood,
  };
}

function requiredTraceDimensions(
  input: ClaimValidationInput,
): CharacterMismatchTraceDimension[] {
  const causeKind = input.divergenceCause?.kind;
  if (!causeKind) {
    return [];
  }

  switch (causeKind) {
    case "forgetting":
      return ["perceived", "forgotten"];
    case "misunderstanding":
      return ["perceived", "misunderstood"];
    case "misinterpretation":
      return ["perceived", "inferred", "misunderstood"];
    case "lying":
      return ["concealed"];
    case "lack_of_information":
      return ["inferred"];
    case "deception":
      return input.recordType === "utterance"
        ? ["concealed"]
        : ["perceived", "concealed"];
    case "trauma":
      return ["perceived", "misunderstood"];
    case "bias":
      return ["inferred", "misunderstood"];
  }
}

function buildRuleOutcome(
  input: ClaimValidationInput,
  traceability: ResolvedTraceabilityLinks,
): CharacterMismatchRuleOutcome {
  const evidence = buildTraceEvidence(input, traceability);
  const requiredDimensions = requiredTraceDimensions(input);
  const trace: CharacterMismatchRuleTraceStep[] = (Object.keys(evidence) as CharacterMismatchTraceDimension[]).map(
    (dimension) => {
      const dimensionEvidence = evidence[dimension];
      const required = requiredDimensions.includes(dimension);

      return {
        dimension,
        status: required
          ? (dimensionEvidence.length > 0 ? "supported" : "missing")
          : "not_applicable",
        evidence: dimensionEvidence,
      };
    },
  );
  const satisfiedDimensions = trace
    .filter((step) => step.status === "supported")
    .map((step) => step.dimension);
  const missingDimensions = trace
    .filter((step) => step.status === "missing")
    .map((step) => step.dimension);

  if (!input.divergenceCause) {
    return {
      status: "invalid",
      requiredDimensions,
      satisfiedDimensions,
      missingDimensions,
      traceabilityStatus: "not_applicable",
      traceabilityAnchors: [],
      unresolvedTraceabilityReferences: [],
      trace,
      summary: "Divergence has no explicit cause to trace.",
    };
  }

  const traceabilityStatus = traceability.traceabilityAnchors.length > 0
    ? "supported"
    : "missing";
  const traceabilitySummary = traceabilityStatus === "supported"
    ? `traceability anchored to ${traceability.traceabilityAnchors.join(", ")}`
    : (
      traceability.unresolvedReferences.length > 0
        ? `missing traceability anchors for ${traceability.unresolvedReferences.join(", ")}`
        : "missing traceability anchors to recorded history"
    );
  const dimensionSummary = missingDimensions.length === 0
    ? `justified by ${requiredDimensions.join(", ")} trace`
    : `missing ${missingDimensions.join(", ")} evidence`;

  return {
    status: missingDimensions.length === 0 && traceabilityStatus === "supported"
      ? "valid"
      : "invalid",
    causeKind: input.divergenceCause.kind,
    requiredDimensions,
    satisfiedDimensions,
    missingDimensions,
    traceabilityStatus,
    traceabilityAnchors: traceability.traceabilityAnchors,
    unresolvedTraceabilityReferences: traceability.unresolvedReferences,
    trace,
    summary: `Divergence is ${dimensionSummary} and ${traceabilitySummary}.`,
  };
}

function formatCauseKind(kind: CharacterDivergenceCauseKind): string {
  return kind.replaceAll("_", " ");
}

function describeTraceEvidence(evidence: string): string {
  if (evidence.startsWith("event:")) {
    return `event ${evidence.slice("event:".length)}`;
  }

  if (evidence.startsWith("cause-event:")) {
    return `cause event ${evidence.slice("cause-event:".length)}`;
  }

  if (evidence.startsWith("memory-kind:")) {
    return `memory kind ${evidence.slice("memory-kind:".length)}`;
  }

  if (evidence.startsWith("utterance-source:")) {
    return `utterance source ${evidence.slice("utterance-source:".length)}`;
  }

  if (evidence.startsWith("witnesses:")) {
    return `${evidence.slice("witnesses:".length)} witnesses`;
  }

  if (evidence.startsWith("utterances:")) {
    return `${evidence.slice("utterances:".length)} linked utterances`;
  }

  if (evidence.startsWith("belief-kind:")) {
    return `belief kind ${evidence.slice("belief-kind:".length)}`;
  }

  if (evidence.startsWith("memories:")) {
    return `${evidence.slice("memories:".length)} linked memories`;
  }

  if (evidence.startsWith("recalled-at:")) {
    return `${evidence.slice("recalled-at:".length)} recall checkpoints`;
  }

  if (evidence.startsWith("truth-alignment:")) {
    return `truth alignment ${evidence.slice("truth-alignment:".length)}`;
  }

  if (evidence.startsWith("cause-kind:")) {
    return `cause kind ${evidence.slice("cause-kind:".length)}`;
  }

  if (evidence.startsWith("source-character:")) {
    return `source character ${evidence.slice("source-character:".length)}`;
  }

  if (evidence === "cause-summary") {
    return "cause summary";
  }

  if (evidence === "cause-text") {
    return "explicit cause text";
  }

  if (evidence === "record-type:utterance") {
    return "utterance record";
  }

  return evidence;
}

function formatCanonicalTruthCitation(
  canonicalTruths: CanonicalTruthReference[],
  factIds: string[],
): string {
  if (canonicalTruths.length === 0) {
    return `canonical truth could not be resolved for fact ids ${uniqueStrings(factIds).join(", ")}`;
  }

  return canonicalTruths
    .map((truth) => `${truth.factId} (${truth.summary})`)
    .join("; ");
}

function buildEvidenceChainSummary(
  ruleOutcome: CharacterMismatchRuleOutcome,
): string {
  const supportedTrace = ruleOutcome.trace.filter((step) => step.status === "supported");
  if (supportedTrace.length === 0) {
    return "no supported trace evidence";
  }

  return supportedTrace
    .map((step) =>
      `${step.dimension}[${step.evidence.map(describeTraceEvidence).join(", ")}]`
    )
    .join(" -> ");
}

function buildObservationGapSummary(
  ruleOutcome: CharacterMismatchRuleOutcome,
): string | undefined {
  if (ruleOutcome.satisfiedDimensions.includes("perceived")) {
    return undefined;
  }

  const supportedTrace = ruleOutcome.trace.filter((step) => step.status === "supported");
  if (supportedTrace.length === 0) {
    return "Observation gap: no direct perception or substitute evidence is recorded.";
  }

  return `Observation gap: no direct perception trace is recorded, so the divergence relies on ${supportedTrace
    .map((step) => `${step.dimension} evidence`)
    .join(" and ")}.`;
}

function describeTraceabilityAnchor(anchor: string): string {
  if (anchor.startsWith("event:")) {
    return `event ${anchor.slice("event:".length)}`;
  }

  if (anchor.startsWith("cause-event:")) {
    return `cause event ${anchor.slice("cause-event:".length)}`;
  }

  if (anchor.startsWith("memory:")) {
    return `memory ${anchor.slice("memory:".length)}`;
  }

  if (anchor.startsWith("utterance:")) {
    return `utterance ${anchor.slice("utterance:".length)}`;
  }

  return anchor;
}

function buildPrimaryTraceabilityAnchor(
  ruleOutcome: CharacterMismatchRuleOutcome,
): string | undefined {
  return ruleOutcome.traceabilityAnchors[0];
}

function buildMismatchExplanation(
  input: ClaimValidationInput,
  canonicalTruths: CanonicalTruthReference[],
  ruleOutcome: CharacterMismatchRuleOutcome,
  issues: CognitionVerificationIssue[],
): string {
  const canonicalTruthCitation = formatCanonicalTruthCitation(
    canonicalTruths,
    input.factIds,
  );
  if (issues.some((issue) => issue.code === "normalized_value_mismatch")) {
    return `Rejected mismatch: ${input.recordType} "${input.claim}" could not be matched to ${canonicalTruthCitation} after normalized case-insensitive comparison of the observed output against canonical subject/object/summary values.`;
  }

  const evidenceChain = buildEvidenceChainSummary(ruleOutcome);
  const observationGap = buildObservationGapSummary(ruleOutcome);

  if (!input.divergenceCause) {
    return `Rejected mismatch: ${input.recordType} "${input.claim}" conflicts with ${canonicalTruthCitation}, but no explicit divergence cause was recorded. Evidence chain: ${evidenceChain}.`;
  }

  if (issues.some((issue) => issue.code === "missing_traceability_link")) {
    const unresolvedReferences = ruleOutcome.unresolvedTraceabilityReferences.length > 0
      ? ` Missing references: ${ruleOutcome.unresolvedTraceabilityReferences
        .map(describeTraceabilityAnchor)
        .join(", ")}.`
      : "";
    return `Rejected mismatch: ${input.recordType} "${input.claim}" conflicts with ${canonicalTruthCitation}, but the recorded cause is not explicitly linked to simulation history via a recorded event, memory, or utterance.${unresolvedReferences} Evidence chain: ${evidenceChain}.`;
  }

  const sourceAnchor = buildPrimaryTraceabilityAnchor(ruleOutcome);
  const causeDescription = `${formatCauseKind(input.divergenceCause.kind)} (${input.divergenceCause.summary})`;
  const sourceAnchorCitation = sourceAnchor
    ? describeTraceabilityAnchor(sourceAnchor)
    : "the recorded evidence chain";

  if (issues.length === 0) {
    const observationClause = observationGap ? ` ${observationGap}` : "";
    return `Allowed mismatch: ${input.recordType} "${input.claim}" conflicts with ${canonicalTruthCitation}, but the divergence is allowed because ${causeDescription} is explicitly tied to ${sourceAnchorCitation}.${observationClause} Evidence chain: ${evidenceChain}.`;
  }

  return `Rejected mismatch: ${input.recordType} "${input.claim}" conflicts with ${canonicalTruthCitation}. The recorded cause ${causeDescription} is tied to ${sourceAnchorCitation}, but verification still failed with ${Array.from(new Set(issues.map((issue) => issue.code))).join(", ")}. ${observationGap ?? ""} Evidence chain: ${evidenceChain}.`.replace(
    /\s+/g,
    " ",
  ).trim();
}

function validateDivergenceCause(
  recordType: CognitionRecordType,
  characterId: string,
  recordId: string,
  chapter: number,
  factIds: string[],
  divergesFromCanonicalFacts: boolean,
  factIssues: CognitionVerificationIssue[],
  input: ClaimValidationInput,
  divergenceCause: CharacterDivergenceCause | undefined,
  allowedCauses: Set<CharacterDivergenceCauseKind>,
  history: SimulationHistoryContext,
): {
  issues: CognitionVerificationIssue[];
  ruleOutcome: CharacterMismatchRuleOutcome;
  traceability: ResolvedTraceabilityLinks;
} {
  const traceability = resolveTraceabilityLinks(input, history);
  const ruleOutcome = buildRuleOutcome(input, traceability);

  if (!divergesFromCanonicalFacts) {
    return {
      issues: divergenceCause
        ? [buildUnexpectedCauseIssue(recordType, characterId, recordId, chapter, factIds)]
        : [],
      ruleOutcome,
      traceability,
    };
  }

  if (!divergenceCause) {
    return {
      issues: [buildMissingCauseIssue(recordType, characterId, recordId, chapter, factIds)],
      ruleOutcome,
      traceability,
    };
  }

  if (!allowedCauses.has(divergenceCause.kind)) {
    return {
      issues: [
        buildUnsupportedCauseIssue(
          recordType,
          characterId,
          recordId,
          chapter,
          factIds,
          divergenceCause,
          allowedCauses,
        ),
      ],
      ruleOutcome,
      traceability,
    };
  }

  if (factIssues.length > 0) {
    return {
      issues: [],
      ruleOutcome,
      traceability,
    };
  }

  if (ruleOutcome.traceabilityStatus !== "supported") {
    return {
      issues: [
        buildMissingTraceabilityLinkIssue(
          recordType,
          characterId,
          recordId,
          chapter,
          factIds,
          traceability,
        ),
      ],
      ruleOutcome,
      traceability,
    };
  }

  if (ruleOutcome.status === "valid") {
    return {
      issues: [],
      ruleOutcome,
      traceability,
    };
  }

  return {
    issues: [
      buildInsufficientTraceIssue(
        recordType,
        characterId,
        recordId,
        chapter,
        factIds,
        ruleOutcome,
      ),
    ],
    ruleOutcome,
    traceability,
  };
}

function buildMismatchCausationRecord(
  facts: ObjectiveFactStore,
  input: ClaimValidationInput,
  mismatchType: CharacterClaimMismatchType,
  traceability: ResolvedTraceabilityLinks,
  allowedCauses: Set<CharacterDivergenceCauseKind>,
  history: SimulationHistoryContext,
): CharacterMismatchCausationRecord {
  const explicitCause = mismatchType === "canonical_conflict"
    ? input.divergenceCause
    : undefined;
  const sourceEventId = mismatchType === "canonical_conflict"
    ? traceability.sourceEventId
    : undefined;
  const sourceEventChapter = sourceEventId
    ? history.eventChaptersById.get(sourceEventId)
    : undefined;
  const startChapter = sourceEventChapter ?? input.chapter;
  const triggeringEvent = resolveEventHistoryRecord(
    history,
    input.eventId,
    input.chapter,
  );
  const contradictedFact = mismatchType === "missing_canonical_truth"
    ? undefined
    : uniqueStrings(input.factIds)
      .map((factId) => facts.byId[factId])
      .find((fact): fact is ObjectiveFactRecord => Boolean(fact));
  const validationFailure: CharacterMismatchValidationFailure | undefined = explicitCause
    ? undefined
    : {
      code: "uncaused_mismatch",
      message: `No explicit recorded cause was available for ${input.recordType}:${input.recordId} (${mismatchType}).`,
      mismatch: {
        recordType: input.recordType,
        recordId: input.recordId,
        characterId: input.characterId,
        chapter: input.chapter,
        mismatchType,
        factIds: uniqueStrings(input.factIds),
      },
      missingCause: {
        path: "divergenceCause",
        required: "explicit_divergence_cause",
        allowedKinds: Array.from(allowedCauses),
      },
      failureContext: {
        triggeringEventId: input.eventId,
        sourceEventId: input.divergenceCause?.sourceEventId,
        contradictedFactId: contradictedFact?.id,
        objectiveFactIds: uniqueStrings(input.factIds),
        traceabilityAnchors: [...traceability.traceabilityAnchors],
        unresolvedTraceabilityReferences: [...traceability.unresolvedReferences],
      },
    };

  return ensureCharacterMismatchCausationProvenance(
    CharacterMismatchCausationRecordSchema.parse({
      mismatchType,
      causeStatus: explicitCause ? "recorded" : "missing",
      explicitCause,
      validationFailure,
      sourceEvent: sourceEventId && sourceEventChapter !== undefined
      ? {
        eventId: sourceEventId,
        chapter: sourceEventChapter,
      }
      : undefined,
    affectedEntity: {
      recordType: input.recordType,
      recordId: input.recordId,
      characterId: input.characterId,
    },
    triggeringEvent: triggeringEvent
      ? {
        eventId: triggeringEvent.id,
        chapter: triggeringEvent.chapter,
        sourceActorId: triggeringEvent.actorId,
      }
      : undefined,
    contradictedFact: contradictedFact
      ? {
        factId: contradictedFact.id,
        lineId: contradictedFact.revision.lineId,
        chapter: contradictedFact.chapter,
        sourceEventId: contradictedFact.sourceEventId,
      }
      : undefined,
    introduction: {
      chapter: input.chapter,
      eventId: triggeringEvent?.chapter === input.chapter
        ? triggeringEvent.id
        : undefined,
    },
      episodeSpan: {
        startChapter,
        endChapter: input.chapter,
        chapterCount: (input.chapter - startChapter) + 1,
      },
    }),
  );
}

function buildMismatchRecord(
  facts: ObjectiveFactStore,
  input: ClaimValidationInput,
  issues: CognitionVerificationIssue[],
  ruleOutcome: CharacterMismatchRuleOutcome,
  traceability: ResolvedTraceabilityLinks,
  allowedCauses: Set<CharacterDivergenceCauseKind>,
  history: SimulationHistoryContext,
): CharacterClaimMismatchRecord | undefined {
  const unknownFactIssueCount = issues.filter((issue) =>
    issue.code === "unknown_objective_fact"
  ).length;
  const hasNormalizedMismatchIssue = issues.some((issue) =>
    issue.code === "normalized_value_mismatch"
  );
  const mismatchType = unknownFactIssueCount > 0
    ? "missing_canonical_truth"
    : (input.divergesFromCanonicalFacts
      ? "canonical_conflict"
      : (hasNormalizedMismatchIssue ? "normalized_value_mismatch" : undefined));

  if (!mismatchType) {
    return undefined;
  }

  const canonicalTruths = uniqueStrings(input.factIds)
    .map((factId) => facts.byId[factId])
    .filter((fact): fact is ObjectiveFactRecord => Boolean(fact))
    .map(buildCanonicalTruthReference);
  const causation = buildMismatchCausationRecord(
    facts,
    input,
    mismatchType,
    traceability,
    allowedCauses,
    history,
  );

  return {
    recordType: input.recordType,
    characterId: input.characterId,
    recordId: input.recordId,
    chapter: input.chapter,
    claim: input.claim,
    mismatchType,
    causation,
    validityStatus: issues.length === 0 ? "valid" : "invalid",
    explanation: buildMismatchExplanation(input, canonicalTruths, ruleOutcome, issues),
    canonicalTruths,
    divergenceCause: input.divergenceCause,
    ruleOutcome,
    evidence: {
      eventId: input.eventId,
      sourceEventId: input.divergenceCause?.sourceEventId,
      objectiveFactIds: uniqueStrings(input.factIds),
      memoryIds: uniqueStrings(input.memoryIds),
      utteranceIds: uniqueStrings(input.utteranceIds),
      traceabilityAnchors: [...ruleOutcome.traceabilityAnchors],
      unresolvedTraceabilityReferences: [...ruleOutcome.unresolvedTraceabilityReferences],
    },
    issueCodes: Array.from(new Set(issues.map((issue) => issue.code))),
  };
}

function evaluateClaimAgainstFacts(
  facts: ObjectiveFactStore,
  input: ClaimValidationInput,
  allowedCauses: Set<CharacterDivergenceCauseKind>,
  history: SimulationHistoryContext,
): {
  issues: CognitionVerificationIssue[];
  mismatch?: CharacterClaimMismatchRecord;
  objectiveStateCheck: ObjectiveStateVerificationRecord;
} {
  const factIssues = collectFactIssues(
    facts,
    input.recordType,
    input.characterId,
    input.recordId,
    input.chapter,
    input.factIds,
  );
  const { issues: causeIssues, ruleOutcome, traceability } = validateDivergenceCause(
    input.recordType,
    input.characterId,
    input.recordId,
    input.chapter,
    input.factIds,
    input.divergesFromCanonicalFacts,
    factIssues,
    input,
    input.divergenceCause,
    allowedCauses,
    history,
  );
  const canonicalTruths = uniqueStrings(input.factIds)
    .map((factId) => facts.byId[factId])
    .filter((fact): fact is ObjectiveFactRecord => Boolean(fact))
    .map(buildCanonicalTruthValue);
  const normalizedMismatchIssues = shouldFlagNormalizedValueMismatch(
    input,
    canonicalTruths,
  )
    ? [
      buildNormalizedValueMismatchIssue(
        input.recordType,
        input.characterId,
        input.recordId,
        input.chapter,
        input.factIds,
      ),
    ]
    : [];
  const issues = [...factIssues, ...normalizedMismatchIssues, ...causeIssues];
  const mismatch = buildMismatchRecord(
    facts,
    input,
    issues,
    ruleOutcome,
    traceability,
    allowedCauses,
    history,
  );

  return {
    issues,
    mismatch,
    objectiveStateCheck: buildObjectiveStateVerificationRecord(facts, input, issues),
  };
}

function listMemoryRecords(store: CharacterMemoryStore): CharacterMemoryRecord[] {
  return Object.values(store).flatMap((state) =>
    state.timeline
      .map((memoryId) => state.byId[memoryId])
      .filter((record): record is CharacterMemoryRecord => Boolean(record))
  );
}

function listBeliefRecords(store: CharacterBeliefStore): CharacterBeliefRecord[] {
  return Object.values(store).flatMap((state) =>
    state.timeline
      .map((beliefId) => state.byId[beliefId])
      .filter((record): record is CharacterBeliefRecord => Boolean(record))
  );
}

function listUtteranceRecords(store: CharacterUtteranceStore): CharacterUtteranceRecord[] {
  return Object.values(store).flatMap((state) =>
    state.timeline
      .map((utteranceId) => state.byId[utteranceId])
      .filter((record): record is CharacterUtteranceRecord => Boolean(record))
  );
}

export class SimulationStateVerifier {
  private readonly allowedMemoryDivergenceCauses: Set<CharacterDivergenceCauseKind>;
  private readonly allowedBeliefDivergenceCauses: Set<CharacterDivergenceCauseKind>;
  private readonly allowedUtteranceDivergenceCauses: Set<CharacterDivergenceCauseKind>;

  constructor(options: CognitionVerifierOptions = {}) {
    this.allowedMemoryDivergenceCauses = new Set(
      options.allowedMemoryDivergenceCauses
        ?? DEFAULT_ALLOWED_MEMORY_DIVERGENCE_CAUSES,
    );
    this.allowedBeliefDivergenceCauses = new Set(
      options.allowedBeliefDivergenceCauses
        ?? DEFAULT_ALLOWED_BELIEF_DIVERGENCE_CAUSES,
    );
    this.allowedUtteranceDivergenceCauses = new Set(
      options.allowedUtteranceDivergenceCauses
        ?? DEFAULT_ALLOWED_UTTERANCE_DIVERGENCE_CAUSES,
    );
  }

  verifyCharacterCognition(
    state: VerifiableSimulationState,
  ): CognitionVerificationReport {
    const history = buildSimulationHistoryContext(state);
    const issues: CognitionVerificationIssue[] = [];
    const mismatches: CharacterClaimMismatchRecord[] = [];
    const objectiveStateChecks: ObjectiveStateVerificationRecord[] = [];
    const memories = listMemoryRecords(state.memories);
    const beliefs = listBeliefRecords(state.beliefs);
    const utterances = listUtteranceRecords(state.utterances);

    for (const memory of memories) {
      const result = evaluateClaimAgainstFacts(
        state.objectiveFacts,
        {
          recordType: "memory",
          characterId: memory.characterId,
          recordId: memory.id,
          chapter: memory.chapter,
          claim: memory.summary,
          comparisonInputs: memory.location ? [memory.location] : undefined,
          causeText: memory.cause,
          factIds: memory.references.objectiveFactIds,
          divergenceCause: memory.divergenceCause,
          divergesFromCanonicalFacts: memory.references.objectiveFactIds.length > 0
            && memory.truthAlignment !== "accurate",
          eventId: memory.references.eventId,
          memoryKind: memory.kind,
          memoryTruthAlignment: memory.truthAlignment,
          recalledAtChapters: memory.recalledAtChapters,
          utteranceIds: memory.references.utteranceIds,
        },
        this.allowedMemoryDivergenceCauses,
        history,
      );

      issues.push(...result.issues);
      objectiveStateChecks.push(result.objectiveStateCheck);
      if (result.mismatch) {
        mismatches.push(result.mismatch);
      }
    }

    for (const belief of beliefs) {
      const result = evaluateClaimAgainstFacts(
        state.objectiveFacts,
        {
          recordType: "belief",
          characterId: belief.characterId,
          recordId: belief.id,
          chapter: belief.chapter,
          claim: belief.belief,
          comparisonInputs: [belief.subject],
          causeText: belief.cause,
          factIds: belief.references.objectiveFactIds,
          divergenceCause: belief.divergenceCause,
          divergesFromCanonicalFacts: belief.references.objectiveFactIds.length > 0
            && belief.canonicalAlignment === "contradicted",
          beliefKind: belief.kind,
          eventId: belief.references.eventId,
          memoryIds: belief.references.memoryIds,
          utteranceIds: belief.references.utteranceIds,
        },
        this.allowedBeliefDivergenceCauses,
        history,
      );

      issues.push(...result.issues);
      objectiveStateChecks.push(result.objectiveStateCheck);
      if (result.mismatch) {
        mismatches.push(result.mismatch);
      }
    }

    for (const utterance of utterances) {
      const factIds = utterance.provenance.objectiveFactIds;
      const result = evaluateClaimAgainstFacts(
        state.objectiveFacts,
        {
          recordType: "utterance",
          characterId: utterance.characterId,
          recordId: utterance.id,
          chapter: utterance.chapter,
          claim: utterance.line,
          causeText: utterance.cause,
          factIds,
          divergenceCause: utterance.divergenceCause,
          divergesFromCanonicalFacts: factIds.length > 0
            && utterance.canonicalAlignment === "contradicted",
          eventId: utterance.provenance.eventId,
          utteranceProvenanceSource: utterance.provenance.source,
          witnessCharacterIds: utterance.provenance.witnessCharacterIds,
        },
        this.allowedUtteranceDivergenceCauses,
        history,
      );

      issues.push(...result.issues);
      objectiveStateChecks.push(result.objectiveStateCheck);
      if (result.mismatch) {
        mismatches.push(result.mismatch);
      }
    }

    return {
      passed: issues.length === 0,
      checkedMemories: memories.length,
      checkedBeliefs: beliefs.length,
      checkedUtterances: utterances.length,
      issues,
      mismatches,
      objectiveStateChecks,
    };
  }
}

export function verifyCharacterCognitionConsistency(
  state: VerifiableSimulationState,
  options?: CognitionVerifierOptions,
): CognitionVerificationReport {
  return new SimulationStateVerifier(options).verifyCharacterCognition(state);
}

function isTargetedCognitionRecord(
  record: Pick<CognitionVerificationIssue, "recordType" | "recordId">,
  recordType: CognitionRecordType,
  recordId: string,
): boolean {
  return record.recordType === recordType && record.recordId === recordId;
}

function formatImmediateWriteFailure(
  check: ImmediateCognitionWriteCheck,
): string {
  return [
    `Immediate ${check.recordType} write rejected for ${check.recordId}.`,
    ...check.blockingIssues.map((issue) => issue.message),
  ].join(" ");
}

export function inspectImmediateCognitionWrite(
  state: VerifiableSimulationState,
  target: {
    recordType: CognitionRecordType;
    recordId: string;
  },
  options?: CognitionVerifierOptions,
): ImmediateCognitionWriteCheck {
  const report = verifyCharacterCognitionConsistency(state, options);
  const issues = report.issues.filter((issue) =>
    isTargetedCognitionRecord(issue, target.recordType, target.recordId)
  );
  const blockingIssues = issues.filter((issue) =>
    WRITE_TIME_BLOCKING_ISSUE_CODES.has(issue.code)
  );
  const mismatch = report.mismatches.find((candidate) =>
    isTargetedCognitionRecord(candidate, target.recordType, target.recordId)
  );
  const objectiveStateCheck = report.objectiveStateChecks.find((candidate) =>
    isTargetedCognitionRecord(candidate, target.recordType, target.recordId)
  );

  return {
    passed: blockingIssues.length === 0,
    recordType: target.recordType,
    recordId: target.recordId,
    issues,
    blockingIssues,
    mismatch,
    objectiveStateCheck,
  };
}

export function assertImmediateCognitionWrite(
  state: VerifiableSimulationState,
  target: {
    recordType: CognitionRecordType;
    recordId: string;
  },
  options?: CognitionVerifierOptions,
): ImmediateCognitionWriteCheck {
  const check = inspectImmediateCognitionWrite(state, target, options);
  if (!check.passed) {
    throw new Error(formatImmediateWriteFailure(check));
  }

  return check;
}

export function createSimulationValidationVerdict(
  report: CognitionVerificationReport,
): SimulationValidationVerdict {
  const mismatches = report.mismatches.map((mismatch) => ({
    ...mismatch,
    causation: ensureCharacterMismatchCausationProvenance(mismatch.causation),
  }));
  const invalidContradictions = mismatches.filter(
    (mismatch) => mismatch.validityStatus === "invalid",
  );
  const allowedExceptions = mismatches.filter(
    (mismatch) => mismatch.validityStatus === "valid",
  );

  return {
    passed: report.passed && invalidContradictions.length === 0,
    checkedMemories: report.checkedMemories,
    checkedBeliefs: report.checkedBeliefs,
    checkedUtterances: report.checkedUtterances,
    issueCount: report.issues.length,
    mismatchCount: mismatches.length,
    invalidContradictionCount: invalidContradictions.length,
    allowedExceptionCount: allowedExceptions.length,
    mismatchCausationLedger: createCharacterMismatchCausationLedger(
      mismatches.map((mismatch) => mismatch.causation),
    ),
    invalidContradictions,
    allowedExceptions,
    issues: report.issues,
    objectiveStateChecks: report.objectiveStateChecks,
  };
}

export function formatSimulationValidationFailure(
  verdict: SimulationValidationVerdict,
  chapterNumber?: number,
): string {
  const scope = typeof chapterNumber === "number"
    ? `${chapterNumber}화`
    : "simulation state";
  const contradictionSummary = verdict.invalidContradictions
    .slice(0, 3)
    .map((mismatch) =>
      `${mismatch.recordType}:${mismatch.recordId} ${mismatch.explanation}`
    )
    .join(" | ");
  const issueSummary = verdict.issues
    .slice(0, 3)
    .map((issue) => issue.message)
    .join(" | ");
  const detail = [contradictionSummary, issueSummary].filter(Boolean).join(" | ");

  return [
    `${scope} verification failed.`,
    `invalid contradictions=${verdict.invalidContradictionCount}`,
    `allowed exceptions=${verdict.allowedExceptionCount}`,
    detail,
  ].filter(Boolean).join(" ");
}
