import { z } from "zod";

import {
  CharacterBeliefRecordSchema,
  type CharacterBeliefStore,
} from "./belief-state";
import {
  CharacterMismatchCausationRecordSchema,
  type CharacterMismatchCausationRecord,
} from "./mismatch-causation";
import {
  CharacterMemoryRecordSchema,
  type CharacterMemoryStore,
} from "./memory-state";
import {
  ObjectiveFactRecordSchema,
  type ObjectiveFactStore,
} from "./objective-facts";
import type { SimulationState } from "./types";
import {
  CharacterUtteranceRecordSchema,
  type CharacterUtteranceStore,
} from "./utterance-state";
import {
  VerifierAutoCorrectionScopeSchema,
  VerifierFailureRoutingDecisionSchema,
  type VerifierAutoCorrectionScope,
  type VerifierFailureRoutingDecision,
} from "./verifier-failure-policy";

export const VERIFIER_AUTO_CORRECTION_TARGET_TYPES = [
  "objective_fact",
  "memory",
  "belief",
  "utterance",
  "mismatch",
] as const;

export const VerifierAutoCorrectionTargetTypeSchema = z.enum(
  VERIFIER_AUTO_CORRECTION_TARGET_TYPES,
);

export const VERIFIER_AUTO_CORRECTION_OPERATIONS = [
  "set",
  "append",
  "remove",
] as const;

export const VerifierAutoCorrectionOperationSchema = z.enum(
  VERIFIER_AUTO_CORRECTION_OPERATIONS,
);

export const VerifierAutoCorrectionEditSchema = z.object({
  targetType: VerifierAutoCorrectionTargetTypeSchema,
  targetId: z.string().min(1),
  fieldPath: z.string().min(1),
  operation: VerifierAutoCorrectionOperationSchema,
  value: z.unknown().optional(),
});

export const VerifierAutoCorrectionBlockedEditSchema = z.object({
  targetType: VerifierAutoCorrectionTargetTypeSchema,
  targetId: z.string().min(1),
  fieldPath: z.string().min(1),
  operation: VerifierAutoCorrectionOperationSchema,
  permittedScope: VerifierAutoCorrectionScopeSchema,
  allowedFieldPaths: z.array(z.string().min(1)),
  reason: z.string().min(1),
});

export const VerifierAutoCorrectionExecutionReportSchema = z.object({
  failureClass: z.string().min(1),
  source: z.string().min(1),
  autoCorrectionScope: VerifierAutoCorrectionScopeSchema,
  summary: z.string().min(1),
  policy: z.string().min(1),
  attemptedEditCount: z.number().int().nonnegative(),
  appliedEditCount: z.number().int().nonnegative(),
  blockedEditCount: z.number().int().nonnegative(),
  blockedEdits: z.array(VerifierAutoCorrectionBlockedEditSchema),
});

export const VerifierAutoCorrectionScopeErrorDetailsSchema =
  VerifierAutoCorrectionExecutionReportSchema.extend({
    name: z.literal("VerifierAutoCorrectionScopeError"),
    message: z.string().min(1),
  });

export type VerifierAutoCorrectionTargetType = z.infer<
  typeof VerifierAutoCorrectionTargetTypeSchema
>;
export type VerifierAutoCorrectionOperation = z.infer<
  typeof VerifierAutoCorrectionOperationSchema
>;
export type VerifierAutoCorrectionEdit = z.infer<
  typeof VerifierAutoCorrectionEditSchema
>;
export type VerifierAutoCorrectionBlockedEdit = z.infer<
  typeof VerifierAutoCorrectionBlockedEditSchema
>;
export type VerifierAutoCorrectionExecutionReport = z.infer<
  typeof VerifierAutoCorrectionExecutionReportSchema
>;
export type VerifierAutoCorrectionScopeErrorDetails = z.infer<
  typeof VerifierAutoCorrectionScopeErrorDetailsSchema
>;

export interface VerifierAutoCorrectionExecutionContext {
  simulationState?: Pick<
    SimulationState,
    "objectiveFacts" | "memories" | "beliefs" | "utterances"
  >;
  mismatchCausationRecords?: Record<string, CharacterMismatchCausationRecord>;
}

const VERIFIER_AUTO_CORRECTION_ALLOWED_FIELD_PATHS = {
  objective_fact_reference_resolution: {
    objective_fact: [
      "sourceEventId",
      "recordedAt.eventId",
      "effectiveRange.fromEventId",
      "effectiveRange.toEventId",
      "revision.previousFactId",
      "revision.closedByFactId",
      "revision.closedByEventId",
    ],
    memory: ["references.objectiveFactIds"],
    belief: ["references.objectiveFactIds"],
    utterance: ["provenance.objectiveFactIds"],
    mismatch: [
      "validationFailure.mismatch.factIds",
      "validationFailure.failureContext.objectiveFactIds",
      "contradictedFact.factId",
      "contradictedFact.lineId",
      "contradictedFact.sourceEventId",
    ],
  },
  claim_normalization: {
    objective_fact: [],
    memory: ["summary"],
    belief: ["subject", "belief"],
    utterance: ["line"],
    mismatch: [],
  },
  divergence_cause_annotation: {
    objective_fact: [],
    memory: ["divergenceCause"],
    belief: ["divergenceCause"],
    utterance: ["divergenceCause"],
    mismatch: [
      "causeStatus",
      "explicitCause",
      "sourceEvent",
      "provenance",
      "validationFailure",
    ],
  },
  traceability_linkage: {
    objective_fact: [
      "sourceEventId",
      "recordedAt.eventId",
      "effectiveRange.fromEventId",
      "effectiveRange.toEventId",
      "revision.closedByEventId",
    ],
    memory: [
      "references.eventId",
      "references.utteranceIds",
      "references.relatedCharacterIds",
    ],
    belief: [
      "references.eventId",
      "references.memoryIds",
      "references.utteranceIds",
      "references.relatedCharacterIds",
    ],
    utterance: [
      "provenance.eventId",
      "provenance.sceneTurn",
      "provenance.witnessCharacterIds",
      "relatedCharacterIds",
    ],
    mismatch: [
      "validationFailure.failureContext.triggeringEventId",
      "validationFailure.failureContext.sourceEventId",
      "validationFailure.failureContext.traceabilityAnchors",
      "validationFailure.failureContext.unresolvedTraceabilityReferences",
      "triggeringEvent",
      "sourceEvent",
      "introduction.eventId",
      "provenance.sourceEventId",
    ],
  },
  divergence_cause_policy_alignment: {
    objective_fact: [],
    memory: ["divergenceCause"],
    belief: ["divergenceCause"],
    utterance: ["divergenceCause"],
    mismatch: [
      "explicitCause",
      "sourceEvent",
      "provenance.causeType",
      "provenance.sourceEventId",
    ],
  },
  divergence_trace_enrichment: {
    objective_fact: [
      "sourceEventId",
      "recordedAt.eventId",
      "effectiveRange.fromEventId",
      "effectiveRange.toEventId",
    ],
    memory: [
      "cause",
      "references.eventId",
      "references.utteranceIds",
      "references.relatedCharacterIds",
      "recalledAtChapters",
      "divergenceCause.summary",
      "divergenceCause.sourceEventId",
    ],
    belief: [
      "cause",
      "references.eventId",
      "references.memoryIds",
      "references.utteranceIds",
      "references.relatedCharacterIds",
      "divergenceCause.summary",
      "divergenceCause.sourceEventId",
    ],
    utterance: [
      "cause",
      "provenance.eventId",
      "provenance.sceneTurn",
      "provenance.witnessCharacterIds",
      "relatedCharacterIds",
      "divergenceCause.summary",
      "divergenceCause.sourceEventId",
    ],
    mismatch: [
      "validationFailure.failureContext",
      "triggeringEvent",
      "sourceEvent",
      "contradictedFact.sourceEventId",
      "provenance",
      "episodeSpan",
    ],
  },
  divergence_cause_removal: {
    objective_fact: [],
    memory: ["divergenceCause"],
    belief: ["divergenceCause"],
    utterance: ["divergenceCause"],
    mismatch: ["causeStatus", "explicitCause", "sourceEvent", "provenance"],
  },
} as const satisfies Record<
  VerifierAutoCorrectionScope,
  Record<VerifierAutoCorrectionTargetType, readonly string[]>
>;

interface TargetBinding {
  record: Record<string, unknown>;
  commit: (nextRecord: Record<string, unknown>) => void;
  schema: z.ZodType<Record<string, unknown>>;
}

function clonePlainValue<T>(value: T): T {
  return value === undefined
    ? value
    : JSON.parse(JSON.stringify(value)) as T;
}

function splitFieldPath(fieldPath: string): string[] {
  const segments = fieldPath
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error(`Invalid auto-correction field path "${fieldPath}".`);
  }

  for (const segment of segments) {
    if (
      segment === "__proto__"
      || segment === "prototype"
      || segment === "constructor"
    ) {
      throw new Error(
        `Unsafe auto-correction field path segment "${segment}" is not allowed.`,
      );
    }
  }

  return segments;
}

function getAllowedFieldPaths(
  scope: VerifierAutoCorrectionScope,
  targetType: VerifierAutoCorrectionTargetType,
): readonly string[] {
  return VERIFIER_AUTO_CORRECTION_ALLOWED_FIELD_PATHS[scope][targetType];
}

function isFieldPathAllowed(
  scope: VerifierAutoCorrectionScope,
  targetType: VerifierAutoCorrectionTargetType,
  fieldPath: string,
): boolean {
  return getAllowedFieldPaths(scope, targetType).some((allowedPath) =>
    fieldPath === allowedPath || fieldPath.startsWith(`${allowedPath}.`)
  );
}

function buildBlockedEdit(
  route: VerifierFailureRoutingDecision,
  edit: VerifierAutoCorrectionEdit,
): VerifierAutoCorrectionBlockedEdit {
  const allowedFieldPaths = [...getAllowedFieldPaths(
    route.autoCorrectionScope,
    edit.targetType,
  )];

  return VerifierAutoCorrectionBlockedEditSchema.parse({
    targetType: edit.targetType,
    targetId: edit.targetId,
    fieldPath: edit.fieldPath,
    operation: edit.operation,
    permittedScope: route.autoCorrectionScope,
    allowedFieldPaths,
    reason: allowedFieldPaths.length > 0
      ? `Field path "${edit.fieldPath}" is outside permitted scope "${route.autoCorrectionScope}" for ${edit.targetType} targets.`
      : `Scope "${route.autoCorrectionScope}" does not permit edits against ${edit.targetType} targets.`,
  });
}

function buildExecutionReport(
  route: VerifierFailureRoutingDecision,
  edits: readonly VerifierAutoCorrectionEdit[],
  blockedEdits: readonly VerifierAutoCorrectionBlockedEdit[],
  appliedEditCount: number,
): VerifierAutoCorrectionExecutionReport {
  return VerifierAutoCorrectionExecutionReportSchema.parse({
    failureClass: route.failureClass,
    source: route.source,
    autoCorrectionScope: route.autoCorrectionScope,
    summary: route.summary,
    policy: route.policy,
    attemptedEditCount: edits.length,
    appliedEditCount,
    blockedEditCount: blockedEdits.length,
    blockedEdits,
  });
}

function buildScopeErrorDetails(
  report: VerifierAutoCorrectionExecutionReport,
): VerifierAutoCorrectionScopeErrorDetails {
  return VerifierAutoCorrectionScopeErrorDetailsSchema.parse({
    ...report,
    name: "VerifierAutoCorrectionScopeError",
    message: `Verifier auto-correction blocked ${report.blockedEditCount} out-of-scope edit(s) for failure class "${report.failureClass}".`,
  });
}

function getNestedValue(
  target: Record<string, unknown>,
  segments: readonly string[],
): unknown {
  let cursor: unknown = target;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function ensureParentObject(
  target: Record<string, unknown>,
  segments: readonly string[],
): Record<string, unknown> {
  let cursor = target;

  for (const segment of segments) {
    const next = cursor[segment];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  return cursor;
}

function setNestedValue(
  target: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  const parent = ensureParentObject(target, segments.slice(0, -1));
  parent[segments[segments.length - 1]!] = clonePlainValue(value);
}

function appendNestedValue(
  target: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  const parent = ensureParentObject(target, segments.slice(0, -1));
  const key = segments[segments.length - 1]!;
  const current = parent[key];

  if (current !== undefined && !Array.isArray(current)) {
    throw new Error(
      `Auto-correction append requires an array field at "${segments.join(".")}".`,
    );
  }

  const nextArray = Array.isArray(current) ? [...current] : [];
  const values = Array.isArray(value) ? value : [value];

  for (const item of values) {
    const candidate = clonePlainValue(item);
    const alreadyPresent = nextArray.some(
      (existing) => JSON.stringify(existing) === JSON.stringify(candidate),
    );
    if (!alreadyPresent) {
      nextArray.push(candidate);
    }
  }

  parent[key] = nextArray;
}

function removeNestedValue(
  target: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  const parent = ensureParentObject(target, segments.slice(0, -1));
  const key = segments[segments.length - 1]!;
  const current = parent[key];

  if (Array.isArray(current)) {
    if (value === undefined) {
      parent[key] = [];
      return;
    }

    const removals = Array.isArray(value) ? value : [value];
    parent[key] = current.filter((entry) =>
      !removals.some(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(entry),
      )
    );
    return;
  }

  delete parent[key];
}

function applyEditToRecord(
  record: Record<string, unknown>,
  edit: VerifierAutoCorrectionEdit,
): void {
  const segments = splitFieldPath(edit.fieldPath);

  switch (edit.operation) {
    case "set":
      setNestedValue(record, segments, edit.value);
      return;
    case "append":
      appendNestedValue(record, segments, edit.value);
      return;
    case "remove":
      removeNestedValue(record, segments, edit.value);
      return;
  }
}

function resolveStoreRecordBinding(
  store: Record<
    string,
    {
      byId: Record<string, Record<string, unknown>>;
    }
  >,
  targetId: string,
  schema: z.ZodType<Record<string, unknown>>,
): TargetBinding | undefined {
  for (const state of Object.values(store)) {
    const record = state.byId[targetId];
    if (!record) {
      continue;
    }

    return {
      record,
      commit(nextRecord) {
        state.byId[targetId] = nextRecord;
      },
      schema,
    };
  }

  return undefined;
}

function resolveTargetBinding(
  context: VerifierAutoCorrectionExecutionContext,
  edit: VerifierAutoCorrectionEdit,
): TargetBinding {
  if (edit.targetType === "objective_fact") {
    const record = context.simulationState?.objectiveFacts.byId[edit.targetId];
    if (!record) {
      throw new Error(
        `Objective fact target "${edit.targetId}" is not available for auto-correction.`,
      );
    }

    return {
      record,
      commit(nextRecord) {
        context.simulationState!.objectiveFacts.byId[edit.targetId] =
          nextRecord as typeof record;
      },
      schema: ObjectiveFactRecordSchema as z.ZodType<Record<string, unknown>>,
    };
  }

  if (edit.targetType === "memory") {
    const binding = context.simulationState
      ? resolveStoreRecordBinding(
        context.simulationState.memories as CharacterMemoryStore,
        edit.targetId,
        CharacterMemoryRecordSchema as z.ZodType<Record<string, unknown>>,
      )
      : undefined;
    if (binding) {
      return binding;
    }
  }

  if (edit.targetType === "belief") {
    const binding = context.simulationState
      ? resolveStoreRecordBinding(
        context.simulationState.beliefs as CharacterBeliefStore,
        edit.targetId,
        CharacterBeliefRecordSchema as z.ZodType<Record<string, unknown>>,
      )
      : undefined;
    if (binding) {
      return binding;
    }
  }

  if (edit.targetType === "utterance") {
    const binding = context.simulationState
      ? resolveStoreRecordBinding(
        context.simulationState.utterances as CharacterUtteranceStore,
        edit.targetId,
        CharacterUtteranceRecordSchema as z.ZodType<Record<string, unknown>>,
      )
      : undefined;
    if (binding) {
      return binding;
    }
  }

  if (edit.targetType === "mismatch") {
    const record = context.mismatchCausationRecords?.[edit.targetId];
    if (record) {
      return {
        record: record as unknown as Record<string, unknown>,
        commit(nextRecord) {
          context.mismatchCausationRecords![edit.targetId] =
            nextRecord as CharacterMismatchCausationRecord;
        },
        schema: CharacterMismatchCausationRecordSchema as z.ZodType<
          Record<string, unknown>
        >,
      };
    }
  }

  throw new Error(
    `${edit.targetType} target "${edit.targetId}" is not available for auto-correction.`,
  );
}

export class VerifierAutoCorrectionScopeError extends Error {
  override readonly name = "VerifierAutoCorrectionScopeError";
  readonly report: VerifierAutoCorrectionExecutionReport;

  constructor(details: VerifierAutoCorrectionScopeErrorDetails) {
    super(details.message);
    this.report = VerifierAutoCorrectionExecutionReportSchema.parse(details);
  }

  toJSON(): VerifierAutoCorrectionScopeErrorDetails {
    return {
      ...this.report,
      name: this.name,
      message: this.message,
    };
  }
}

export function inspectVerifierAutoCorrectionEdits(
  route: VerifierFailureRoutingDecision,
  edits: readonly VerifierAutoCorrectionEdit[],
): VerifierAutoCorrectionExecutionReport {
  const parsedRoute = VerifierFailureRoutingDecisionSchema.parse(route);
  const parsedEdits = edits.map((edit) => VerifierAutoCorrectionEditSchema.parse(edit));
  const blockedEdits = parsedEdits
    .filter((edit) =>
      !isFieldPathAllowed(
        parsedRoute.autoCorrectionScope,
        edit.targetType,
        edit.fieldPath,
      )
    )
    .map((edit) => buildBlockedEdit(parsedRoute, edit));

  return buildExecutionReport(parsedRoute, parsedEdits, blockedEdits, 0);
}

export function executeVerifierAutoCorrectionEdits(
  context: VerifierAutoCorrectionExecutionContext,
  route: VerifierFailureRoutingDecision,
  edits: readonly VerifierAutoCorrectionEdit[],
): VerifierAutoCorrectionExecutionReport {
  const inspection = inspectVerifierAutoCorrectionEdits(route, edits);
  if (inspection.blockedEditCount > 0) {
    throw new VerifierAutoCorrectionScopeError(
      buildScopeErrorDetails(inspection),
    );
  }

  const parsedEdits = edits.map((edit) => VerifierAutoCorrectionEditSchema.parse(edit));
  const workingRecords = new Map<string, {
    binding: TargetBinding;
    record: Record<string, unknown>;
  }>();

  for (const edit of parsedEdits) {
    const key = `${edit.targetType}:${edit.targetId}`;
    const existing = workingRecords.get(key);
    if (existing) {
      applyEditToRecord(existing.record, edit);
      continue;
    }

    const binding = resolveTargetBinding(context, edit);
    const workingRecord = clonePlainValue(binding.record);
    applyEditToRecord(workingRecord, edit);
    workingRecords.set(key, {
      binding,
      record: workingRecord,
    });
  }

  for (const target of workingRecords.values()) {
    const parsedRecord = target.binding.schema.parse(target.record);
    target.binding.commit(parsedRecord);
  }

  return buildExecutionReport(
    VerifierFailureRoutingDecisionSchema.parse(route),
    parsedEdits,
    [],
    parsedEdits.length,
  );
}

export function getVerifierAutoCorrectionAllowedFieldPaths(
  scope: VerifierAutoCorrectionScope,
  targetType: VerifierAutoCorrectionTargetType,
): readonly string[] {
  return getAllowedFieldPaths(scope, targetType);
}

export function canVerifierAutoCorrectionEditField(
  scope: VerifierAutoCorrectionScope,
  targetType: VerifierAutoCorrectionTargetType,
  fieldPath: string,
): boolean {
  return isFieldPathAllowed(scope, targetType, fieldPath);
}
