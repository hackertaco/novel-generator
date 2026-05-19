import { z } from "zod";

import type {
  EventMemoryUpdateInput,
  SimulationEvent,
  SimulationState,
} from "./types";
import {
  parseSimulationEvent,
  SimulationCausalLedgerSchema,
  SimulationEventCorrectionRecordSchema,
  type SimulationCausalLedger,
  type SimulationEventCorrectionEdit,
  type SimulationEventCorrectionRecord,
  type SimulationEventCorrectionWindow,
  type NormalizedSimulationEvent,
  type SimulationEventOutcomeType,
  type SimulationEventStateDomain,
  type SimulationEventStateOperation,
} from "./causal-ledger";
import {
  addAudienceKnowledge,
  cloneAudienceKnowledgeStore,
  hasAudienceKnowledgeSummary,
  type AudienceKnowledgeSource,
} from "./audience-knowledge";
import {
  ensureCharacterBeliefInterpretationStore,
} from "./belief-interpretation-state";
import {
  addCharacterBelief,
  addActiveBeliefThread,
  adjustCharacterTrust,
  cloneCharacterBeliefStore,
  removeActiveBeliefThread,
} from "./belief-state";
import {
  addObjectiveFact,
  cloneObjectiveFactStore,
  closeMatchingObjectiveFacts,
} from "./objective-facts";
import {
  addCharacterMemory,
  cloneCharacterMemoryStore,
  recordMemoryRecall,
} from "./memory-state";
import { cloneForeshadowRegistryStore } from "./foreshadow-registry";
import {
  RetroactiveCorrectionPlanSchema,
  RetroactiveLedgerMutationKindSchema,
  RetroactiveLedgerMutationOperationSchema,
  type RetroactiveCorrectionPlan,
} from "./retroactive-correction";
import { cloneCharacterUtteranceStore } from "./utterance-state";
import { assertImmediateCognitionWrite } from "./verifier";

function cloneState(state: SimulationState): SimulationState {
  return {
    ...state,
    objectiveFacts: cloneObjectiveFactStore(state.objectiveFacts),
    audienceKnowledge: cloneAudienceKnowledgeStore(state.audienceKnowledge),
    characters: Object.fromEntries(
      Object.entries(state.characters).map(([id, value]) => [
        id,
        {
          ...value,
          inventory: [...value.inventory],
          secretsKnown: [...value.secretsKnown],
          relationships: { ...value.relationships },
        },
      ]),
    ),
    memories: cloneCharacterMemoryStore(state.memories),
    beliefs: cloneCharacterBeliefStore(state.beliefs),
    beliefInterpretations: ensureCharacterBeliefInterpretationStore(
      state.beliefInterpretations,
      Object.keys(state.characters),
    ),
    utterances: cloneCharacterUtteranceStore(state.utterances),
    foreshadowRegistry: cloneForeshadowRegistryStore(state.foreshadowRegistry),
    threads: Object.fromEntries(
      Object.entries(state.threads).map(([id, value]) => [id, { ...value }]),
    ),
    eventLog: [...state.eventLog],
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function clonePlainValue<T>(value: T): T {
  return value === undefined
    ? value
    : JSON.parse(JSON.stringify(value)) as T;
}

function normalizeFactId(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  if (!trimmed) {
    return "unknown";
  }

  return Array.from(trimmed)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "x")
    .join("-");
}

function buildRelationshipFactTag(a: string, b: string): string {
  return ["relationship", ...[a, b].sort()].join(":");
}

function appendPrerequisite(
  event: NormalizedSimulationEvent,
  prerequisite: {
    prerequisiteId: string;
    type: "event" | "objective_fact" | "memory" | "belief" | "utterance" | "thread" | "scene_state" | "world_rule";
    description: string;
    entityId?: string;
    eventId?: string;
    stateKey?: string;
  },
): void {
  if (
    event.prerequisites.some(
      (candidate) => candidate.prerequisiteId === prerequisite.prerequisiteId,
    )
  ) {
    return;
  }

  event.prerequisites.push(prerequisite);
}

function appendStateChange(
  event: NormalizedSimulationEvent,
  input: {
    suffix: string;
    domain: SimulationEventStateDomain;
    operation: SimulationEventStateOperation;
    stateKey: string;
    summary: string;
    entityIds?: string[];
    resultingRecordId?: string;
    beforeValue?: unknown;
    afterValue?: unknown;
  },
): string {
  const changeId = `${event.id}:${input.suffix}`;
  event.stateChanges.push({
    changeId,
    domain: input.domain,
    operation: input.operation,
    stateKey: input.stateKey,
    summary: input.summary,
    entityIds: input.entityIds ?? [],
    resultingRecordId: input.resultingRecordId,
    beforeValue: input.beforeValue,
    afterValue: input.afterValue,
  });
  return changeId;
}

function appendOutcome(
  event: NormalizedSimulationEvent,
  input: {
    suffix: string;
    type: SimulationEventOutcomeType;
    summary: string;
    stateChangeIds?: string[];
    resultingRecordIds?: string[];
    resultingFactIds?: string[];
  },
): string {
  const outcomeId = `${event.id}:${input.suffix}`;
  event.outcomes.push({
    outcomeId,
    type: input.type,
    summary: input.summary,
    stateChangeIds: input.stateChangeIds ?? [],
    resultingRecordIds: input.resultingRecordIds ?? [],
    resultingFactIds: input.resultingFactIds ?? [],
  });
  return outcomeId;
}

export const SimulationEventLedgerPatchEditSchema = z.object({
  mutationKind: RetroactiveLedgerMutationKindSchema,
  targetEventId: z.string().min(1),
  fieldPath: z.string().min(1),
  operation: RetroactiveLedgerMutationOperationSchema,
  value: z.unknown().optional(),
  index: z.number().int().nonnegative().optional(),
});

export const SimulationEventLedgerPatchBlockedEditSchema =
  SimulationEventLedgerPatchEditSchema.extend({
    reason: z.string().min(1),
    approvedTargetEventIds: z.array(z.string().min(1)),
    correctionWindowEventIds: z.array(z.string().min(1)),
    allowedFieldPaths: z.array(z.string().min(1)),
    allowedOperations: z.array(RetroactiveLedgerMutationOperationSchema),
  });

export const SimulationEventLedgerPatchReportSchema = z.object({
  correctionId: z.string().min(1),
  attemptedEditCount: z.number().int().nonnegative(),
  appliedEditCount: z.number().int().nonnegative(),
  blockedEditCount: z.number().int().nonnegative(),
  patchedEventIds: z.array(z.string().min(1)),
  correctionWindowEventIds: z.array(z.string().min(1)),
  blockedEdits: z.array(SimulationEventLedgerPatchBlockedEditSchema),
});

export type SimulationEventLedgerPatchEdit = z.infer<
  typeof SimulationEventLedgerPatchEditSchema
>;
export type SimulationEventLedgerPatchBlockedEdit = z.infer<
  typeof SimulationEventLedgerPatchBlockedEditSchema
>;
export type SimulationEventLedgerPatchReport = z.infer<
  typeof SimulationEventLedgerPatchReportSchema
>;

export interface ApplySimulationEventLedgerPatchOptions {
  correctionId?: string;
}

interface FieldPathSegment {
  raw: string;
  isIndex: boolean;
  index?: number;
}

function parseFieldPathSegments(fieldPath: string): FieldPathSegment[] {
  const segments = fieldPath
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error(`Invalid ledger patch field path "${fieldPath}".`);
  }

  return segments.map((segment) => {
    if (
      segment === "__proto__"
      || segment === "prototype"
      || segment === "constructor"
    ) {
      throw new Error(
        `Unsafe ledger patch field path segment "${segment}" is not allowed.`,
      );
    }

    if (/^\d+$/.test(segment)) {
      return {
        raw: segment,
        isIndex: true,
        index: Number.parseInt(segment, 10),
      };
    }

    return {
      raw: segment,
      isIndex: false,
    };
  });
}

function normalizeFieldPathForAllowance(fieldPath: string): string {
  return parseFieldPathSegments(fieldPath)
    .filter((segment) => !segment.isIndex)
    .map((segment) => segment.raw)
    .join(".");
}

function isLedgerFieldPathAllowed(
  allowedFieldPaths: ReadonlyArray<string>,
  fieldPath: string,
): boolean {
  const normalized = normalizeFieldPathForAllowance(fieldPath);
  return allowedFieldPaths.some((allowedPath) =>
    normalized === allowedPath || normalized.startsWith(`${allowedPath}.`)
  );
}

function ensureObjectContainer(
  target: Record<string, unknown>,
  segments: readonly FieldPathSegment[],
): Record<string, unknown> | unknown[] {
  let cursor: Record<string, unknown> | unknown[] = target;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    if (!segment) {
      break;
    }

    if (segment.isIndex) {
      if (!Array.isArray(cursor)) {
        throw new Error(
          `Ledger patch expected an array before index segment "${segment.raw}".`,
        );
      }
      const current = cursor[segment.index!];
      if (current === undefined) {
        cursor[segment.index!] = nextSegment?.isIndex ? [] : {};
      }
      const nextValue = cursor[segment.index!];
      if (
        !nextValue
        || (typeof nextValue !== "object" && !Array.isArray(nextValue))
      ) {
        cursor[segment.index!] = nextSegment?.isIndex ? [] : {};
      }
      cursor = cursor[segment.index!] as Record<string, unknown> | unknown[];
      continue;
    }

    if (Array.isArray(cursor)) {
      throw new Error(
        `Ledger patch cannot address object segment "${segment.raw}" without an explicit array index.`,
      );
    }

    const current = cursor[segment.raw];
    if (current === undefined) {
      cursor[segment.raw] = nextSegment?.isIndex ? [] : {};
    } else if (
      !Array.isArray(current)
      && typeof current !== "object"
      && nextSegment
    ) {
      cursor[segment.raw] = nextSegment.isIndex ? [] : {};
    }
    cursor = cursor[segment.raw] as Record<string, unknown> | unknown[];
  }

  return cursor;
}

function getNestedValueFromEvent(
  target: Record<string, unknown>,
  segments: readonly FieldPathSegment[],
): unknown {
  let cursor: unknown = target;

  for (const segment of segments) {
    if (segment.isIndex) {
      if (!Array.isArray(cursor)) {
        return undefined;
      }
      cursor = cursor[segment.index!];
      continue;
    }

    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[segment.raw];
  }

  return cursor;
}

function setNestedValueOnEvent(
  target: Record<string, unknown>,
  segments: readonly FieldPathSegment[],
  value: unknown,
): void {
  const parent = ensureObjectContainer(target, segments.slice(0, -1));
  const leaf = segments[segments.length - 1];
  if (!leaf) {
    return;
  }

  if (leaf.isIndex) {
    if (!Array.isArray(parent)) {
      throw new Error("Ledger patch cannot assign an array index on a non-array parent.");
    }
    parent[leaf.index!] = clonePlainValue(value);
    return;
  }

  if (Array.isArray(parent)) {
    throw new Error("Ledger patch cannot assign an object field on an array parent.");
  }
  parent[leaf.raw] = clonePlainValue(value);
}

function insertNestedValueOnEvent(
  target: Record<string, unknown>,
  segments: readonly FieldPathSegment[],
  value: unknown,
  index?: number,
): void {
  const arrayValue = getNestedValueFromEvent(target, segments);
  if (arrayValue === undefined) {
    setNestedValueOnEvent(target, segments, []);
  }

  const resolved = getNestedValueFromEvent(target, segments);
  if (!Array.isArray(resolved)) {
    throw new Error(
      `Ledger patch insert requires an array field at "${segments.map((segment) => segment.raw).join(".")}".`,
    );
  }

  const items = Array.isArray(value) ? value : [value];
  const insertionIndex = index === undefined
    ? resolved.length
    : Math.max(0, Math.min(index, resolved.length));
  resolved.splice(insertionIndex, 0, ...items.map((item) => clonePlainValue(item)));
}

function removeNestedValueFromEvent(
  target: Record<string, unknown>,
  segments: readonly FieldPathSegment[],
  value: unknown,
): void {
  const parent = ensureObjectContainer(target, segments.slice(0, -1));
  const leaf = segments[segments.length - 1];
  if (!leaf) {
    return;
  }

  if (leaf.isIndex) {
    if (!Array.isArray(parent)) {
      throw new Error("Ledger patch cannot remove an array index on a non-array parent.");
    }
    parent.splice(leaf.index!, 1);
    return;
  }

  if (Array.isArray(parent)) {
    throw new Error("Ledger patch cannot remove an object field on an array parent.");
  }

  const current = parent[leaf.raw];
  if (Array.isArray(current)) {
    if (value === undefined) {
      parent[leaf.raw] = [];
      return;
    }

    const removals = Array.isArray(value) ? value : [value];
    parent[leaf.raw] = current.filter((entry) =>
      !removals.some(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(entry),
      )
    );
    return;
  }

  delete parent[leaf.raw];
}

function buildCorrectionWindow(
  span: RetroactiveCorrectionPlan["minimalAffectedSpan"] | RetroactiveCorrectionPlan["replayScope"],
): SimulationEventCorrectionWindow {
  return {
    startEventId: span.startEventId,
    endEventId: span.endEventId,
    startEpisode: span.startEpisode,
    endEpisode: span.endEpisode,
    eventIds: [...span.eventIds],
  };
}

function buildPatchBlockedEdit(
  plan: RetroactiveCorrectionPlan,
  edit: SimulationEventLedgerPatchEdit,
  reason: string,
): SimulationEventLedgerPatchBlockedEdit {
  const matchingAllowance = plan.allowedLedgerMutations.find(
    (allowance) => allowance.kind === edit.mutationKind,
  );

  return SimulationEventLedgerPatchBlockedEditSchema.parse({
    ...edit,
    reason,
    approvedTargetEventIds: matchingAllowance
      ? [...matchingAllowance.targetEventIds]
      : [],
    correctionWindowEventIds: [...plan.minimalAffectedSpan.eventIds],
    allowedFieldPaths: matchingAllowance
      ? [...matchingAllowance.allowedFieldPaths]
      : [],
    allowedOperations: matchingAllowance
      ? [...matchingAllowance.allowedOperations]
      : [],
  });
}

function performLedgerPatchMove(
  events: NormalizedSimulationEvent[],
  edit: SimulationEventLedgerPatchEdit,
  correctionWindowEventIds: Set<string>,
): {
  beforeValue: { index: number };
  afterValue: { index: number };
} {
  const moveTarget = z.object({
    beforeEventId: z.string().min(1).optional(),
    afterEventId: z.string().min(1).optional(),
    targetIndex: z.number().int().nonnegative().optional(),
  }).superRefine((value, ctx) => {
    const present = [
      value.beforeEventId,
      value.afterEventId,
      value.targetIndex,
    ].filter((entry) => entry !== undefined);
    if (present.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "move edits require exactly one of beforeEventId, afterEventId, or targetIndex",
      });
    }
  }).parse(edit.value ?? {});

  const sourceIndex = events.findIndex((event) => event.id === edit.targetEventId);
  if (sourceIndex < 0) {
    throw new Error(`Ledger patch target "${edit.targetEventId}" does not exist.`);
  }

  const [moved] = events.splice(sourceIndex, 1);
  if (!moved) {
    throw new Error(`Ledger patch target "${edit.targetEventId}" could not be moved.`);
  }

  let destinationIndex = sourceIndex;
  if (moveTarget.beforeEventId) {
    if (!correctionWindowEventIds.has(moveTarget.beforeEventId)) {
      throw new Error(
        `Ledger patch move anchor "${moveTarget.beforeEventId}" is outside the approved correction window.`,
      );
    }
    destinationIndex = events.findIndex(
      (event) => event.id === moveTarget.beforeEventId,
    );
  } else if (moveTarget.afterEventId) {
    if (!correctionWindowEventIds.has(moveTarget.afterEventId)) {
      throw new Error(
        `Ledger patch move anchor "${moveTarget.afterEventId}" is outside the approved correction window.`,
      );
    }
    const afterIndex = events.findIndex((event) => event.id === moveTarget.afterEventId);
    destinationIndex = afterIndex + 1;
  } else if (moveTarget.targetIndex !== undefined) {
    destinationIndex = Math.max(0, Math.min(moveTarget.targetIndex, events.length));
  }

  events.splice(destinationIndex, 0, moved);

  return {
    beforeValue: { index: sourceIndex },
    afterValue: { index: destinationIndex },
  };
}

export class SimulationEventLedgerPatchError extends Error {
  override readonly name = "SimulationEventLedgerPatchError";
  readonly report: SimulationEventLedgerPatchReport;

  constructor(report: SimulationEventLedgerPatchReport) {
    super(
      `Simulation event ledger patch blocked ${report.blockedEditCount} out-of-scope edit(s).`,
    );
    this.report = report;
  }
}

export function applySimulationEventLedgerPatch(
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
  plan: RetroactiveCorrectionPlan,
  edits: readonly SimulationEventLedgerPatchEdit[],
  options: ApplySimulationEventLedgerPatchOptions = {},
): {
  ledger: SimulationCausalLedger;
  report: SimulationEventLedgerPatchReport;
} {
  const parsedPlan = RetroactiveCorrectionPlanSchema.parse(plan);
  const parsedEdits = edits.map((edit) =>
    SimulationEventLedgerPatchEditSchema.parse(edit)
  );
  const normalizedLedger = Array.isArray(ledger)
    ? SimulationCausalLedgerSchema.parse({
      version: "sim-causal-ledger.v1",
      events: [...ledger],
    })
    : SimulationCausalLedgerSchema.parse(ledger);
  const correctionWindowEventIds = new Set(parsedPlan.minimalAffectedSpan.eventIds);
  const blockedEdits: SimulationEventLedgerPatchBlockedEdit[] = [];

  for (const edit of parsedEdits) {
    if (!correctionWindowEventIds.has(edit.targetEventId)) {
      blockedEdits.push(
        buildPatchBlockedEdit(
          parsedPlan,
          edit,
          `Event "${edit.targetEventId}" is outside the declared correction window.`,
        ),
      );
      continue;
    }

    const allowance = parsedPlan.allowedLedgerMutations.find(
      (candidate) =>
        candidate.kind === edit.mutationKind
        && candidate.targetEventIds.includes(edit.targetEventId),
    );

    if (!allowance) {
      blockedEdits.push(
        buildPatchBlockedEdit(
          parsedPlan,
          edit,
          `Event "${edit.targetEventId}" is not an approved target for mutation kind "${edit.mutationKind}".`,
        ),
      );
      continue;
    }

    if (!allowance.allowedOperations.includes(edit.operation)) {
      blockedEdits.push(
        buildPatchBlockedEdit(
          parsedPlan,
          edit,
          `Operation "${edit.operation}" is outside the approved mutation operations for "${edit.mutationKind}".`,
        ),
      );
      continue;
    }

    if (!isLedgerFieldPathAllowed(allowance.allowedFieldPaths, edit.fieldPath)) {
      blockedEdits.push(
        buildPatchBlockedEdit(
          parsedPlan,
          edit,
          `Field path "${edit.fieldPath}" is outside the approved mutation scope for "${edit.mutationKind}".`,
        ),
      );
    }
  }

  const correctionId = options.correctionId
    ?? `${parsedPlan.failure.eventId}:correction:${parsedEdits.length}`;
  const baseReport = {
    correctionId,
    attemptedEditCount: parsedEdits.length,
    patchedEventIds: [] as string[],
    correctionWindowEventIds: [...parsedPlan.minimalAffectedSpan.eventIds],
    blockedEdits,
  };

  if (blockedEdits.length > 0) {
    const report = SimulationEventLedgerPatchReportSchema.parse({
      ...baseReport,
      appliedEditCount: 0,
      blockedEditCount: blockedEdits.length,
    });
    throw new SimulationEventLedgerPatchError(report);
  }

  const workingEvents = normalizedLedger.events.map((event) =>
    parseSimulationEvent(clonePlainValue(event))
  );
  const perEventEdits = new Map<string, SimulationEventCorrectionEdit[]>();

  for (const edit of parsedEdits) {
    const target = workingEvents.find((event) => event.id === edit.targetEventId);
    if (!target) {
      throw new Error(`Ledger patch target "${edit.targetEventId}" does not exist.`);
    }

    let beforeValue: unknown;
    let afterValue: unknown;
    if (edit.operation === "move") {
      const moveResult = performLedgerPatchMove(
        workingEvents,
        edit,
        correctionWindowEventIds,
      );
      beforeValue = moveResult.beforeValue;
      afterValue = moveResult.afterValue;
    } else {
      const segments = parseFieldPathSegments(edit.fieldPath);
      const targetRecord = target as unknown as Record<string, unknown>;
      beforeValue = clonePlainValue(getNestedValueFromEvent(targetRecord, segments));

      switch (edit.operation) {
        case "set":
          setNestedValueOnEvent(targetRecord, segments, edit.value);
          break;
        case "insert":
          insertNestedValueOnEvent(targetRecord, segments, edit.value, edit.index);
          break;
        case "remove":
          removeNestedValueFromEvent(targetRecord, segments, edit.value);
          break;
      }

      afterValue = clonePlainValue(getNestedValueFromEvent(targetRecord, segments));
    }

    const recordedEdits = perEventEdits.get(edit.targetEventId) ?? [];
    recordedEdits.push({
      mutationKind: edit.mutationKind,
      fieldPath: edit.fieldPath,
      operation: edit.operation,
      beforeValue,
      afterValue,
    });
    perEventEdits.set(edit.targetEventId, recordedEdits);
  }

  const approvedWindow = buildCorrectionWindow(parsedPlan.minimalAffectedSpan);
  const replayWindow = buildCorrectionWindow(parsedPlan.replayScope);
  const patchedEventIds = [...perEventEdits.keys()];
  const patchedEvents = workingEvents.map((event) => {
    const eventEdits = perEventEdits.get(event.id);
    if (!eventEdits) {
      return parseSimulationEvent(event);
    }

    const correctionRecord: SimulationEventCorrectionRecord =
      SimulationEventCorrectionRecordSchema.parse({
        correctionId,
        source: parsedPlan.failure.source,
        failureCode: parsedPlan.failure.code,
        failureEventId: parsedPlan.failure.eventId,
        referencedEventId: parsedPlan.failure.referencedEventId,
        prerequisiteId: parsedPlan.failure.prerequisiteId,
        stateKey: parsedPlan.failure.stateKey,
        foreshadowId: parsedPlan.failure.foreshadowId,
        approvedWindow,
        replayWindow,
        rationale: parsedPlan.rationale,
        edits: eventEdits,
      });

    return parseSimulationEvent({
      ...event,
      corrections: [...event.corrections, correctionRecord],
    });
  });

  const report = SimulationEventLedgerPatchReportSchema.parse({
    ...baseReport,
    appliedEditCount: parsedEdits.length,
    blockedEditCount: 0,
    patchedEventIds,
  });

  return {
    ledger: SimulationCausalLedgerSchema.parse({
      version: normalizedLedger.version,
      events: patchedEvents,
    }),
    report,
  };
}

function recordObjectiveFactCreation(
  event: NormalizedSimulationEvent | undefined,
  fact: {
    id: string;
    revision: { lineId: string };
    summary: string;
    subjectEntity: { entityId: string };
    object: string;
  },
): void {
  if (!event) {
    return;
  }

  const changeId = appendStateChange(event, {
    suffix: `fact-create:${fact.id}`,
    domain: "objective_facts",
    operation: "create",
    stateKey: fact.revision.lineId,
    summary: fact.summary,
    entityIds: [fact.subjectEntity.entityId],
    resultingRecordId: fact.id,
    afterValue: fact.object,
  });

  appendOutcome(event, {
    suffix: `fact-created:${fact.id}`,
    type: "objective_fact_created",
    summary: fact.summary,
    stateChangeIds: [changeId],
    resultingRecordIds: [fact.id],
    resultingFactIds: [fact.id],
  });
}

function recordObjectiveFactClosure(
  event: NormalizedSimulationEvent | undefined,
  fact: {
    id: string;
    revision: { lineId: string };
    summary: string;
    subjectEntity: { entityId: string };
    object: string;
  },
): void {
  if (!event) {
    return;
  }

  const changeId = appendStateChange(event, {
    suffix: `fact-close:${fact.id}`,
    domain: "objective_facts",
    operation: "close",
    stateKey: fact.revision.lineId,
    summary: `Closed canonical fact: ${fact.summary}`,
    entityIds: [fact.subjectEntity.entityId],
    resultingRecordId: fact.id,
    beforeValue: fact.object,
    afterValue: null,
  });

  appendOutcome(event, {
    suffix: `fact-closed:${fact.id}`,
    type: "objective_fact_closed",
    summary: `Closed canonical fact: ${fact.summary}`,
    stateChangeIds: [changeId],
    resultingRecordIds: [fact.id],
    resultingFactIds: [fact.id],
  });
}

function recordCharacterMemory(
  state: SimulationState,
  input: {
    characterId: string;
    chapter: number;
    kind: NonNullable<EventMemoryUpdateInput["kind"]>;
    summary: string;
    location?: string | null;
    emotionalTone?: string;
    eventId: string;
    cause?: string;
    divergenceCause?: EventMemoryUpdateInput["divergenceCause"];
    objectiveFactIds?: string[];
    relatedCharacterIds?: string[];
    tags?: string[];
    truthAlignment?: EventMemoryUpdateInput["truthAlignment"];
  },
) {
  const record = addCharacterMemory(state.memories, {
    characterId: input.characterId,
    chapter: input.chapter,
    kind: input.kind,
    summary: input.summary,
    location: input.location,
    emotionalTone: input.emotionalTone,
    truthAlignment: input.truthAlignment,
    cause: input.cause,
    divergenceCause: input.divergenceCause,
    references: {
      eventId: input.eventId,
      objectiveFactIds: input.objectiveFactIds ?? [],
      relatedCharacterIds: input.relatedCharacterIds ?? [],
    },
    tags: input.tags,
  });
  assertImmediateCognitionWrite(state, {
    recordType: "memory",
    recordId: record.id,
  });

  return record;
}

function applyCharacterStateUpdatesFromEvent(
  state: SimulationState,
  event: NormalizedSimulationEvent,
  options: {
    defaultMemoryUpdates?: Array<{
      characterId: string;
      kind: "direct_experience" | "secondhand_report";
      summary?: string;
      location?: string | null;
      emotionalTone?: string;
      cause?: string;
      objectiveFactIds?: string[];
      relatedCharacterIds?: string[];
      tags?: string[];
    }>;
    fallbackFactIds?: string[];
    fallbackTags?: string[];
    causalEvent?: NormalizedSimulationEvent;
  } = {},
): void {
  const explicitMemoryUpdates = event.cognition?.memoryUpdates ?? [];
  const explicitMemoryCharacters = new Set(
    explicitMemoryUpdates.map((update) => update.characterId),
  );
  const memoryIdsByCharacter = new Map<string, string[]>();

  const appendMemoryId = (characterId: string, memoryId: string) => {
    memoryIdsByCharacter.set(characterId, [
      ...(memoryIdsByCharacter.get(characterId) ?? []),
      memoryId,
    ]);
  };

  for (const update of explicitMemoryUpdates) {
    const record = recordCharacterMemory(state, {
      characterId: update.characterId,
      chapter: event.chapter,
      kind: update.kind ?? "direct_experience",
      summary: update.summary ?? event.summary,
      location: update.location ?? state.characters[update.characterId]?.location ?? null,
      emotionalTone: update.emotionalTone,
      eventId: event.id,
      cause: update.cause,
      divergenceCause: update.divergenceCause,
      truthAlignment: update.truthAlignment,
      objectiveFactIds: update.objectiveFactIds ?? options.fallbackFactIds ?? [],
      relatedCharacterIds: update.relatedCharacterIds ?? [],
      tags: uniqueStrings([...(update.tags ?? []), ...(options.fallbackTags ?? [])]),
    });
    appendMemoryId(update.characterId, record.id);
    if (options.causalEvent) {
      const changeId = appendStateChange(options.causalEvent, {
        suffix: `memory:${record.id}`,
        domain: "memories",
        operation: "record",
        stateKey: `memory:${record.characterId}:${record.id}`,
        summary: record.summary,
        entityIds: [record.characterId, ...record.references.relatedCharacterIds],
        resultingRecordId: record.id,
        afterValue: {
          kind: record.kind,
          truthAlignment: record.truthAlignment,
          objectiveFactIds: record.references.objectiveFactIds,
        },
      });
      appendOutcome(options.causalEvent, {
        suffix: `memory-recorded:${record.id}`,
        type: "memory_recorded",
        summary: `Recorded ${record.kind} memory for ${record.characterId}`,
        stateChangeIds: [changeId],
        resultingRecordIds: [record.id],
        resultingFactIds: record.references.objectiveFactIds,
      });
    }
  }

  for (const update of options.defaultMemoryUpdates ?? []) {
    if (explicitMemoryCharacters.has(update.characterId)) {
      continue;
    }

    const record = recordCharacterMemory(state, {
      characterId: update.characterId,
      chapter: event.chapter,
      kind: update.kind,
      summary: update.summary ?? event.summary,
      location: update.location ?? state.characters[update.characterId]?.location ?? null,
      emotionalTone: update.emotionalTone,
      eventId: event.id,
      cause: update.cause,
      objectiveFactIds: update.objectiveFactIds ?? options.fallbackFactIds ?? [],
      relatedCharacterIds: update.relatedCharacterIds ?? [],
      tags: uniqueStrings([...(update.tags ?? []), ...(options.fallbackTags ?? [])]),
    });
    appendMemoryId(update.characterId, record.id);
    if (options.causalEvent) {
      const changeId = appendStateChange(options.causalEvent, {
        suffix: `memory:${record.id}`,
        domain: "memories",
        operation: "record",
        stateKey: `memory:${record.characterId}:${record.id}`,
        summary: record.summary,
        entityIds: [record.characterId, ...record.references.relatedCharacterIds],
        resultingRecordId: record.id,
        afterValue: {
          kind: record.kind,
          truthAlignment: record.truthAlignment,
          objectiveFactIds: record.references.objectiveFactIds,
        },
      });
      appendOutcome(options.causalEvent, {
        suffix: `memory-recorded:${record.id}`,
        type: "memory_recorded",
        summary: `Recorded ${record.kind} memory for ${record.characterId}`,
        stateChangeIds: [changeId],
        resultingRecordIds: [record.id],
        resultingFactIds: record.references.objectiveFactIds,
      });
    }
  }

  for (const update of event.cognition?.beliefUpdates ?? []) {
    const belief = addCharacterBelief(state.beliefs, {
      characterId: update.characterId,
      chapter: event.chapter,
      kind: update.kind,
      subject: update.subject,
      belief: update.belief,
      confidence: update.confidence,
      cause: update.cause,
      canonicalAlignment: update.canonicalAlignment,
      divergenceCause: update.divergenceCause,
      status: update.status,
      supersededByBeliefId: update.supersededByBeliefId,
      references: {
        eventId: event.id,
        objectiveFactIds: update.objectiveFactIds ?? options.fallbackFactIds ?? [],
        memoryIds: uniqueStrings([
          ...(update.memoryIds ?? []),
          ...(memoryIdsByCharacter.get(update.characterId) ?? []),
        ]),
        relatedCharacterIds: update.relatedCharacterIds ?? [],
      },
      tags: uniqueStrings([...(update.tags ?? []), ...(options.fallbackTags ?? [])]),
    });
    assertImmediateCognitionWrite(state, {
      recordType: "belief",
      recordId: belief.id,
    });
    if (options.causalEvent) {
      const changeId = appendStateChange(options.causalEvent, {
        suffix: `belief:${belief.id}`,
        domain: "beliefs",
        operation: "interpret",
        stateKey: `belief:${belief.characterId}:${belief.id}`,
        summary: belief.belief,
        entityIds: [belief.characterId, ...belief.references.relatedCharacterIds],
        resultingRecordId: belief.id,
        afterValue: {
          kind: belief.kind,
          canonicalAlignment: belief.canonicalAlignment,
          objectiveFactIds: belief.references.objectiveFactIds,
          memoryIds: belief.references.memoryIds,
        },
      });
      appendOutcome(options.causalEvent, {
        suffix: `belief-recorded:${belief.id}`,
        type: "belief_recorded",
        summary: `Recorded ${belief.kind} belief for ${belief.characterId}`,
        stateChangeIds: [changeId],
        resultingRecordIds: [belief.id],
        resultingFactIds: belief.references.objectiveFactIds,
      });
    }
  }
}

export class SimulationEventLedger {
  applyPatch(
    ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
    plan: RetroactiveCorrectionPlan,
    edits: readonly SimulationEventLedgerPatchEdit[],
    options: ApplySimulationEventLedgerPatchOptions = {},
  ): {
    ledger: SimulationCausalLedger;
    report: SimulationEventLedgerPatchReport;
  } {
    return applySimulationEventLedgerPatch(ledger, plan, edits, options);
  }

  applyEvent(state: SimulationState, event: SimulationEvent): SimulationState {
    const normalizedEvent = parseSimulationEvent(event);
    const next = cloneState(state);
    next.chapterCursor = Math.max(next.chapterCursor, normalizedEvent.chapter);

    const actor = normalizedEvent.actorId
      ? next.characters[normalizedEvent.actorId]
      : undefined;
    const target = normalizedEvent.targetId
      ? next.characters[normalizedEvent.targetId]
      : undefined;
    const actorBelief = normalizedEvent.actorId
      ? next.beliefs[normalizedEvent.actorId]
      : undefined;

    if (normalizedEvent.actorId) {
      appendPrerequisite(normalizedEvent, {
        prerequisiteId: `character:${normalizedEvent.actorId}:exists`,
        type: "scene_state",
        description: "Actor must exist in the simulation state registry.",
        entityId: normalizedEvent.actorId,
        stateKey: `character:${normalizedEvent.actorId}`,
      });
    }

    if (normalizedEvent.targetId) {
      appendPrerequisite(normalizedEvent, {
        prerequisiteId: `character:${normalizedEvent.targetId}:exists`,
        type: "scene_state",
        description: "Target must exist in the simulation state registry.",
        entityId: normalizedEvent.targetId,
        stateKey: `character:${normalizedEvent.targetId}`,
      });
    }

    switch (normalizedEvent.type) {
      case "plot_action": {
        const payload = normalizedEvent.payload;
        const participantIds = uniqueStrings([
          normalizedEvent.actorId,
          normalizedEvent.targetId,
          ...toStringArray(payload?.sceneCharacterIds),
          ...toStringArray(payload?.recipients),
        ]).filter((characterId) => Boolean(next.characters[characterId]));
        const primaryFact = toOptionalString(payload?.canonicalFact)
          ?? toOptionalString(payload?.object)
          ?? normalizedEvent.summary;
        const factSubject = toOptionalString(payload?.subject)
          ?? primaryFact;
        const factPredicate = toOptionalString(payload?.predicate)
          ?? "major_action";
        const factSummary = primaryFact;
        const visibility = toOptionalString(payload?.visibility);
        const fact = addObjectiveFact(next.objectiveFacts, {
          chapter: normalizedEvent.chapter,
          subject: factSubject,
          predicate: factPredicate,
          object: primaryFact,
          category: "discovery",
          summary: factSummary,
          sourceEventId: normalizedEvent.id,
          subjectEntity: {
            entityId: `concept:${normalizeFactId(factSubject)}`,
            entityType: "concept",
          },
          objectEntity: {
            entityId: `concept:${normalizeFactId(primaryFact)}`,
            entityType: "concept",
          },
          scope: {
            scopeId: normalizedEvent.sceneId
              ? `scope:scene:${normalizedEvent.sceneId}`
              : `scope:event:${normalizedEvent.id}`,
            scopeType: "knowledge",
            entityIds: participantIds,
          },
          factLineId: [
            "fact-line:plot-action",
            normalizeFactId(factSubject),
            normalizeFactId(factPredicate),
            normalizeFactId(primaryFact),
          ].join(":"),
          revisionReason: "Generated scene major action recorded as canonical plot action",
          tags: uniqueStrings([
            "event:plot_action",
            ...normalizedEvent.tags,
          ]),
        });
        recordObjectiveFactCreation(normalizedEvent, fact);

        const revealedSummary = toOptionalString(payload?.canonicalSummary) ?? factSummary;
        if (visibility === "audience" && !hasAudienceKnowledgeSummary(next.audienceKnowledge, revealedSummary)) {
          addAudienceKnowledge(next.audienceKnowledge, {
            chapter: normalizedEvent.chapter,
            kind: "fact_revealed",
            subject: factSubject,
            summary: revealedSummary,
            status: "revealed",
            source: "action",
            references: {
              eventId: normalizedEvent.id,
              objectiveFactIds: [fact.id],
            },
            tags: uniqueStrings([
              "event:plot_action",
              ...normalizedEvent.tags,
            ]),
          });
        }

        applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
          defaultMemoryUpdates: participantIds.map((characterId) => ({
            characterId,
            kind: "direct_experience",
            summary: primaryFact,
            location: next.characters[characterId]?.location ?? normalizedEvent.location ?? null,
            objectiveFactIds: [fact.id],
            relatedCharacterIds: participantIds.filter((candidate) => candidate !== characterId),
            tags: ["event:plot_action"],
          })),
          fallbackFactIds: [fact.id],
          fallbackTags: uniqueStrings([
            "event:plot_action",
            ...normalizedEvent.tags,
          ]),
          causalEvent: normalizedEvent,
        });
        break;
      }

      case "move":
        if (actor) {
          const previousLocation = actor.location;
          const location = normalizedEvent.location
            ?? toOptionalString(normalizedEvent.payload?.location)
            ?? null;
          const factIds: string[] = [];
          const closedFacts = closeMatchingObjectiveFacts(
            next.objectiveFacts,
            {
              subject: actor.name,
              predicate: "is_at",
              category: "character_location",
            },
            normalizedEvent.chapter,
            {
              effectiveToEventId: normalizedEvent.id,
              closedByEventId: normalizedEvent.id,
              reason: "Location updated by move event",
            },
          );
          actor.location = location;

          const locationChangeId = appendStateChange(normalizedEvent, {
            suffix: `character-location:${actor.characterId}`,
            domain: "character_state",
            operation: "update",
            stateKey: `character:${actor.characterId}:location`,
            summary: `${actor.name} location updated`,
            entityIds: [actor.characterId],
            beforeValue: previousLocation,
            afterValue: location,
          });
          appendOutcome(normalizedEvent, {
            suffix: `character-location-updated:${actor.characterId}`,
            type: "character_state_changed",
            summary: `${actor.name} moved to ${location ?? "unknown location"}`,
            stateChangeIds: [locationChangeId],
          });

          for (const closedFact of closedFacts) {
            recordObjectiveFactClosure(normalizedEvent, closedFact);
          }

          if (location) {
            const fact = addObjectiveFact(next.objectiveFacts, {
              chapter: normalizedEvent.chapter,
              subject: actor.name,
              predicate: "is_at",
              object: location,
              category: "character_location",
              summary: `[character-location] ${actor.name}: ${location}`,
              sourceEventId: normalizedEvent.id,
              subjectEntity: {
                entityId: actor.characterId,
                entityType: "character",
              },
              scope: {
                scopeId: `scope:character:${actor.characterId}`,
                scopeType: "character",
                entityIds: [actor.characterId],
              },
              factLineId: `fact-line:character-location:${actor.characterId}`,
              revisionReason: "Move event updated character location",
              tags: [`character:${actor.characterId}`],
            });
            factIds.push(fact.id);
            recordObjectiveFactCreation(normalizedEvent, fact);
          }

          applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
            defaultMemoryUpdates: [
              {
                characterId: actor.characterId,
                kind: "direct_experience",
                summary: normalizedEvent.summary,
                location,
                relatedCharacterIds: normalizedEvent.targetId
                  ? [normalizedEvent.targetId]
                  : [],
              },
            ],
            fallbackFactIds: factIds,
            fallbackTags: ["event:move"],
            causalEvent: normalizedEvent,
          });
        }
        break;

      case "status_change":
        if (actor) {
          const previousStatus = actor.status;
          const status = toOptionalString(normalizedEvent.payload?.status)
            ?? normalizedEvent.summary;
          const closedFacts = closeMatchingObjectiveFacts(
            next.objectiveFacts,
            {
              subject: actor.name,
              predicate: "status",
              category: "character_status",
            },
            normalizedEvent.chapter,
            {
              effectiveToEventId: normalizedEvent.id,
              closedByEventId: normalizedEvent.id,
              reason: "Status updated by status_change event",
            },
          );
          actor.status = status;

          const statusChangeId = appendStateChange(normalizedEvent, {
            suffix: `character-status:${actor.characterId}`,
            domain: "character_state",
            operation: "update",
            stateKey: `character:${actor.characterId}:status`,
            summary: `${actor.name} status updated`,
            entityIds: [actor.characterId],
            beforeValue: previousStatus,
            afterValue: status,
          });
          appendOutcome(normalizedEvent, {
            suffix: `character-status-updated:${actor.characterId}`,
            type: "character_state_changed",
            summary: `${actor.name} status changed to ${status}`,
            stateChangeIds: [statusChangeId],
          });

          for (const closedFact of closedFacts) {
            recordObjectiveFactClosure(normalizedEvent, closedFact);
          }

          const fact = addObjectiveFact(next.objectiveFacts, {
            chapter: normalizedEvent.chapter,
            subject: actor.name,
            predicate: "status",
            object: status,
            category: "character_status",
            summary: `[character-status] ${actor.name}: ${status}`,
            sourceEventId: normalizedEvent.id,
            subjectEntity: {
              entityId: actor.characterId,
              entityType: "character",
            },
            scope: {
              scopeId: `scope:character:${actor.characterId}`,
              scopeType: "character",
              entityIds: [actor.characterId],
            },
            factLineId: `fact-line:character-status:${actor.characterId}`,
            revisionReason: "Status change event updated character status",
            tags: [`character:${actor.characterId}`],
          });
          recordObjectiveFactCreation(normalizedEvent, fact);

          applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
            defaultMemoryUpdates: [
              {
                characterId: actor.characterId,
                kind: "direct_experience",
                summary: status,
                location: actor.location,
                objectiveFactIds: [fact.id],
              },
            ],
            fallbackFactIds: [fact.id],
            fallbackTags: ["event:status_change"],
            causalEvent: normalizedEvent,
          });
        }
        break;

      case "obtain_item": {
        if (!actor) break;
        const item = toOptionalString(normalizedEvent.payload?.item);
        if (item && !actor.inventory.includes(item)) {
          const beforeInventory = [...actor.inventory];
          actor.inventory.push(item);

          const inventoryChangeId = appendStateChange(normalizedEvent, {
            suffix: `inventory:${actor.characterId}:${normalizeFactId(item)}`,
            domain: "character_state",
            operation: "update",
            stateKey: `character:${actor.characterId}:inventory`,
            summary: `${actor.name} obtained ${item}`,
            entityIds: [actor.characterId],
            beforeValue: beforeInventory,
            afterValue: [...actor.inventory],
          });
          appendOutcome(normalizedEvent, {
            suffix: `inventory-obtained:${actor.characterId}:${normalizeFactId(item)}`,
            type: "inventory_changed",
            summary: `${actor.name} obtained ${item}`,
            stateChangeIds: [inventoryChangeId],
          });

          const fact = addObjectiveFact(next.objectiveFacts, {
            chapter: normalizedEvent.chapter,
            subject: actor.name,
            predicate: "holds",
            object: item,
            category: "character_inventory",
            summary: `[character-inventory] ${actor.name} holds ${item}`,
            sourceEventId: normalizedEvent.id,
            subjectEntity: {
              entityId: actor.characterId,
              entityType: "character",
            },
            objectEntity: {
              entityId: `item:${item}`,
              entityType: "item",
            },
            scope: {
              scopeId: `scope:inventory:${actor.characterId}`,
              scopeType: "inventory",
              entityIds: [actor.characterId],
            },
            factLineId: `fact-line:character-inventory:${actor.characterId}:${item}`,
            tags: [`character:${actor.characterId}`],
          });
          recordObjectiveFactCreation(normalizedEvent, fact);

          applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
            defaultMemoryUpdates: [
              {
                characterId: actor.characterId,
                kind: "direct_experience",
                summary: normalizedEvent.summary,
                location: actor.location,
              },
            ],
            fallbackFactIds: [fact.id],
            fallbackTags: ["event:obtain_item"],
            causalEvent: normalizedEvent,
          });
        }
        break;
      }

      case "lose_item": {
        if (!actor) break;
        const item = toOptionalString(normalizedEvent.payload?.item);
        if (item) {
          appendPrerequisite(normalizedEvent, {
            prerequisiteId: `character:${actor.characterId}:inventory:${normalizeFactId(item)}`,
            type: "scene_state",
            description: `${actor.name} must already hold ${item} before losing it.`,
            entityId: actor.characterId,
            stateKey: `character:${actor.characterId}:inventory:${normalizeFactId(item)}`,
          });
          const beforeInventory = [...actor.inventory];
          actor.inventory = actor.inventory.filter((entry) => entry !== item);
          const closedFacts = closeMatchingObjectiveFacts(
            next.objectiveFacts,
            {
              subject: actor.name,
              predicate: "holds",
              object: item,
              category: "character_inventory",
            },
            normalizedEvent.chapter,
            {
              effectiveToEventId: normalizedEvent.id,
              closedByEventId: normalizedEvent.id,
              reason: "Inventory item removed by lose_item event",
            },
          );

          const inventoryChangeId = appendStateChange(normalizedEvent, {
            suffix: `inventory:${actor.characterId}:${normalizeFactId(item)}`,
            domain: "character_state",
            operation: "remove",
            stateKey: `character:${actor.characterId}:inventory`,
            summary: `${actor.name} lost ${item}`,
            entityIds: [actor.characterId],
            beforeValue: beforeInventory,
            afterValue: [...actor.inventory],
          });
          appendOutcome(normalizedEvent, {
            suffix: `inventory-lost:${actor.characterId}:${normalizeFactId(item)}`,
            type: "inventory_changed",
            summary: `${actor.name} lost ${item}`,
            stateChangeIds: [inventoryChangeId],
          });

          for (const closedFact of closedFacts) {
            recordObjectiveFactClosure(normalizedEvent, closedFact);
          }

          applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
            defaultMemoryUpdates: [
              {
                characterId: actor.characterId,
                kind: "direct_experience",
                summary: normalizedEvent.summary,
                location: actor.location,
              },
            ],
            fallbackTags: ["event:lose_item"],
            causalEvent: normalizedEvent,
          });
        }
        break;
      }

      case "learn_fact": {
        const fact = toOptionalString(normalizedEvent.payload?.fact)
          ?? normalizedEvent.summary;
        const recipients = toStringArray(normalizedEvent.payload?.recipients);
        const visibility = toOptionalString(normalizedEvent.payload?.visibility);
        const recipientIds = recipients.length > 0
          ? recipients
          : normalizedEvent.actorId
            ? [normalizedEvent.actorId]
            : [];
        const factIds: string[] = [];

        for (const recipientId of recipientIds) {
          const character = next.characters[recipientId];
          if (character && !character.secretsKnown.includes(fact)) {
            const beforeKnowledge = [...character.secretsKnown];
            character.secretsKnown.push(fact);
            const changeId = appendStateChange(normalizedEvent, {
              suffix: `knowledge:${recipientId}:${normalizeFactId(fact)}`,
              domain: "character_state",
              operation: "reveal",
              stateKey: `character:${recipientId}:knowledge:${normalizeFactId(fact)}`,
              summary: `${character.name} learned ${fact}`,
              entityIds: [recipientId],
              beforeValue: beforeKnowledge,
              afterValue: [...character.secretsKnown],
            });
            appendOutcome(normalizedEvent, {
              suffix: `knowledge-revealed:${recipientId}:${normalizeFactId(fact)}`,
              type: "knowledge_revealed",
              summary: `${character.name} learned ${fact}`,
              stateChangeIds: [changeId],
            });
          }
        }

        if (visibility === "shared" || visibility === "audience") {
          const recordedFact = addObjectiveFact(next.objectiveFacts, {
            chapter: normalizedEvent.chapter,
            subject: toOptionalString(normalizedEvent.payload?.subject) ?? "world",
            predicate: toOptionalString(normalizedEvent.payload?.predicate) ?? "fact",
            object: toOptionalString(normalizedEvent.payload?.object) ?? fact,
            category: "discovery",
            summary: fact,
            sourceEventId: normalizedEvent.id,
            subjectEntity: {
              entityId: `concept:${normalizeFactId(toOptionalString(normalizedEvent.payload?.subject) ?? "world")}`,
              entityType: "concept",
            },
            scope: {
              scopeId: `scope:knowledge:${visibility ?? "private"}`,
              scopeType: "knowledge",
              entityIds: recipientIds,
            },
            factLineId: [
              "fact-line:discovery",
              normalizeFactId(toOptionalString(normalizedEvent.payload?.subject) ?? "world"),
              normalizeFactId(toOptionalString(normalizedEvent.payload?.predicate) ?? "fact"),
              normalizeFactId(toOptionalString(normalizedEvent.payload?.object) ?? fact),
            ].join(":"),
            tags: recipientIds.map((recipientId) => `known-by:${recipientId}`),
          });
          factIds.push(recordedFact.id);
          recordObjectiveFactCreation(normalizedEvent, recordedFact);
        }
        if (visibility === "audience" && !hasAudienceKnowledgeSummary(next.audienceKnowledge, fact)) {
          const factSubjectForAudience = toOptionalString(normalizedEvent.payload?.subject) ?? "world";
          const payloadSource = toOptionalString(normalizedEvent.payload?.source) as
            | AudienceKnowledgeSource
            | undefined;
          addAudienceKnowledge(next.audienceKnowledge, {
            chapter: normalizedEvent.chapter,
            kind: "fact_revealed",
            subject: factSubjectForAudience,
            summary: fact,
            status: "revealed",
            source: payloadSource ?? "exposition",
            references: {
              eventId: normalizedEvent.id,
              objectiveFactIds: [...factIds],
            },
            tags: ["event:learn_fact"],
          });
        }
        applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
          defaultMemoryUpdates: recipientIds.map((recipientId) => {
            const character = next.characters[recipientId];
            return {
              characterId: recipientId,
              kind: recipientId === normalizedEvent.actorId
                ? "direct_experience"
                : "secondhand_report",
              summary: fact,
              location: character?.location,
              relatedCharacterIds: [
                normalizedEvent.actorId,
                normalizedEvent.targetId,
              ].filter(
                (id): id is string => Boolean(id && id !== recipientId),
              ),
            };
          }),
          fallbackFactIds: factIds,
          fallbackTags: ["event:learn_fact"],
          causalEvent: normalizedEvent,
        });
        break;
      }

      case "relationship_shift": {
        if (!actor || !target) break;
        const previousActorRelation = actor.relationships[target.characterId];
        const label = toOptionalString(normalizedEvent.payload?.label)
          ?? normalizedEvent.summary;
        const delta = toOptionalNumber(normalizedEvent.payload?.trustDelta) ?? 0;
        const relationTag = buildRelationshipFactTag(actor.characterId, target.characterId);

        actor.relationships[target.characterId] = label;
        target.relationships[actor.characterId] = label;
        const closedFacts = closeMatchingObjectiveFacts(
          next.objectiveFacts,
          {
            category: "relationship",
            tag: relationTag,
          },
          normalizedEvent.chapter,
          {
            effectiveToEventId: normalizedEvent.id,
            closedByEventId: normalizedEvent.id,
            reason: "Relationship updated by relationship_shift event",
          },
        );
        const relationshipChangeId = appendStateChange(normalizedEvent, {
          suffix: `relationship:${actor.characterId}:${target.characterId}`,
          domain: "character_state",
          operation: "update",
          stateKey: `relationship:${[actor.characterId, target.characterId].sort().join(":")}`,
          summary: `${actor.name} and ${target.name} relationship updated`,
          entityIds: [actor.characterId, target.characterId],
          beforeValue: previousActorRelation,
          afterValue: label,
        });
        appendOutcome(normalizedEvent, {
          suffix: `relationship-updated:${actor.characterId}:${target.characterId}`,
          type: "relationship_changed",
          summary: `${actor.name} and ${target.name} relationship changed to ${label}`,
          stateChangeIds: [relationshipChangeId],
        });
        for (const closedFact of closedFacts) {
          recordObjectiveFactClosure(normalizedEvent, closedFact);
        }
        const fact = addObjectiveFact(next.objectiveFacts, {
          chapter: normalizedEvent.chapter,
          subject: `${actor.name}<->${target.name}`,
          predicate: "relationship",
          object: label,
          category: "relationship",
          summary: `[relationship] ${actor.name} / ${target.name}: ${label}`,
          sourceEventId: normalizedEvent.id,
          subjectEntity: {
            entityId: `relationship:${[actor.characterId, target.characterId].sort().join(":")}`,
            entityType: "relationship",
          },
          scope: {
            scopeId: `scope:relationship:${[actor.characterId, target.characterId].sort().join(":")}`,
            scopeType: "relationship",
            entityIds: [actor.characterId, target.characterId],
          },
          factLineId: `fact-line:relationship:${[actor.characterId, target.characterId].sort().join(":")}`,
          revisionReason: "Relationship shift event revised canonical relationship state",
          tags: [relationTag],
        });
        recordObjectiveFactCreation(normalizedEvent, fact);

        if (actorBelief) {
          adjustCharacterTrust(next.beliefs, actor.characterId, target.characterId, delta);
        }
        adjustCharacterTrust(next.beliefs, target.characterId, actor.characterId, delta);
        applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
          defaultMemoryUpdates: [
            {
              characterId: actor.characterId,
              kind: "direct_experience",
              summary: normalizedEvent.summary,
              location: actor.location,
              relatedCharacterIds: [target.characterId],
            },
            {
              characterId: target.characterId,
              kind: "direct_experience",
              summary: normalizedEvent.summary,
              location: target.location,
              relatedCharacterIds: [actor.characterId],
            },
          ],
          fallbackFactIds: [fact.id],
          fallbackTags: ["event:relationship_shift"],
          causalEvent: normalizedEvent,
        });
        break;
      }

      case "open_thread": {
        const threadId = toOptionalString(normalizedEvent.payload?.threadId);
        if (!threadId) break;
        appendPrerequisite(normalizedEvent, {
          prerequisiteId: `thread:${threadId}:create`,
          type: "scene_state",
          description: "Thread identifier must be defined before the thread can open.",
          stateKey: `thread:${threadId}`,
        });
        next.threads[threadId] = {
          id: threadId,
          title: toOptionalString(normalizedEvent.payload?.title) ?? threadId,
          ownerCharacterId: normalizedEvent.actorId,
          status: "open",
          openedAtChapter: normalizedEvent.chapter,
          summary: normalizedEvent.summary,
        };
        const threadChangeId = appendStateChange(normalizedEvent, {
          suffix: `thread-open:${threadId}`,
          domain: "threads",
          operation: "open",
          stateKey: `thread:${threadId}`,
          summary: `Opened thread ${threadId}`,
          entityIds: normalizedEvent.actorId ? [normalizedEvent.actorId] : [],
          afterValue: {
            threadId,
            status: "open",
          },
        });
        appendOutcome(normalizedEvent, {
          suffix: `thread-opened:${threadId}`,
          type: "thread_opened",
          summary: `Opened thread ${threadId}`,
          stateChangeIds: [threadChangeId],
          resultingRecordIds: [threadId],
        });
        if (actorBelief && actor) {
          addActiveBeliefThread(next.beliefs, actor.characterId, threadId);
        }
        if (actor) {
          applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
            defaultMemoryUpdates: [
              {
                characterId: actor.characterId,
                kind: "direct_experience",
                summary: normalizedEvent.summary,
                location: actor.location,
              },
            ],
            fallbackTags: ["event:open_thread"],
            causalEvent: normalizedEvent,
          });
        }
        break;
      }

      case "resolve_thread": {
        const threadId = toOptionalString(normalizedEvent.payload?.threadId);
        if (!threadId) break;
        appendPrerequisite(normalizedEvent, {
          prerequisiteId: `thread:${threadId}:open`,
          type: "thread",
          description: "Thread must already be open before it can be resolved.",
          stateKey: `thread:${threadId}`,
        });
        const thread = next.threads[threadId];
        if (thread) {
          const previousStatus = thread.status;
          thread.status = "resolved";
          thread.resolvedAtChapter = normalizedEvent.chapter;
          const threadChangeId = appendStateChange(normalizedEvent, {
            suffix: `thread-resolve:${threadId}`,
            domain: "threads",
            operation: "resolve",
            stateKey: `thread:${threadId}`,
            summary: `Resolved thread ${threadId}`,
            entityIds: thread.ownerCharacterId ? [thread.ownerCharacterId] : [],
            beforeValue: previousStatus,
            afterValue: thread.status,
          });
          appendOutcome(normalizedEvent, {
            suffix: `thread-resolved:${threadId}`,
            type: "thread_resolved",
            summary: `Resolved thread ${threadId}`,
            stateChangeIds: [threadChangeId],
            resultingRecordIds: [threadId],
          });
        }
        for (const characterId of Object.keys(next.beliefs)) {
          removeActiveBeliefThread(next.beliefs, characterId, threadId);
        }
        if (actor) {
          applyCharacterStateUpdatesFromEvent(next, normalizedEvent, {
            defaultMemoryUpdates: [
              {
                characterId: actor.characterId,
                kind: "direct_experience",
                summary: normalizedEvent.summary,
                location: actor.location,
              },
            ],
            fallbackTags: ["event:resolve_thread"],
            causalEvent: normalizedEvent,
          });
        }
        break;
      }

      case "recollection_surfaced": {
        const payload = normalizedEvent.payload;
        const characterId = toOptionalString(payload?.characterId)
          ?? normalizedEvent.actorId;
        const memoryId = toOptionalString(payload?.memoryId);
        const recallSummary = toOptionalString(payload?.summary)
          ?? normalizedEvent.summary;
        const audienceVisible = toOptionalString(payload?.visibility) !== "private";

        if (characterId && memoryId) {
          const recalled = recordMemoryRecall(
            next.memories,
            characterId,
            memoryId,
            normalizedEvent.chapter,
          );
          if (recalled) {
            appendStateChange(normalizedEvent, {
              suffix: `memory-recall:${characterId}:${memoryId}`,
              domain: "memories",
              operation: "record",
              stateKey: `memory:${memoryId}:recalledAtChapters`,
              summary: `${characterId} recalls memory ${memoryId} at chapter ${normalizedEvent.chapter}`,
              entityIds: [characterId],
              resultingRecordId: memoryId,
            });
            appendOutcome(normalizedEvent, {
              suffix: `memory-recalled:${characterId}:${memoryId}`,
              type: "memory_recorded",
              summary: `${characterId} surfaced recollection of ${recalled.summary}`,
              resultingRecordIds: [memoryId],
            });
          }
        }

        if (
          audienceVisible &&
          !hasAudienceKnowledgeSummary(next.audienceKnowledge, recallSummary)
        ) {
          addAudienceKnowledge(next.audienceKnowledge, {
            chapter: normalizedEvent.chapter,
            kind: "fact_revealed",
            subject: characterId ?? "narrator",
            summary: recallSummary,
            status: "revealed",
            source: "flashback",
            references: {
              eventId: normalizedEvent.id,
            },
            tags: uniqueStrings([
              "event:recollection_surfaced",
              ...normalizedEvent.tags,
            ]),
          });
        }
        break;
      }

      case "internal_monologue": {
        const payload = normalizedEvent.payload;
        const characterId = toOptionalString(payload?.characterId)
          ?? normalizedEvent.actorId;
        const monologueSummary = toOptionalString(payload?.summary)
          ?? normalizedEvent.summary;
        const beliefId = toOptionalString(payload?.beliefId);
        const audienceVisible = toOptionalString(payload?.visibility) !== "private";

        appendOutcome(normalizedEvent, {
          suffix: `monologue:${characterId ?? "anon"}`,
          type: "knowledge_revealed",
          summary: monologueSummary,
        });

        if (
          audienceVisible &&
          !hasAudienceKnowledgeSummary(next.audienceKnowledge, monologueSummary)
        ) {
          addAudienceKnowledge(next.audienceKnowledge, {
            chapter: normalizedEvent.chapter,
            kind: "fact_revealed",
            subject: characterId ?? "narrator",
            summary: monologueSummary,
            status: "revealed",
            source: "monologue",
            references: {
              eventId: normalizedEvent.id,
              characterBeliefIds: beliefId ? [beliefId] : [],
            },
            tags: uniqueStrings([
              "event:internal_monologue",
              ...normalizedEvent.tags,
            ]),
          });
        }
        break;
      }

      case "realization": {
        const payload = normalizedEvent.payload;
        const characterId = toOptionalString(payload?.characterId)
          ?? normalizedEvent.actorId;
        const subject = toOptionalString(payload?.subject)
          ?? normalizedEvent.summary;
        const beliefText = toOptionalString(payload?.belief)
          ?? normalizedEvent.summary;
        const cause = toOptionalString(payload?.cause)
          ?? `Realization at chapter ${normalizedEvent.chapter}`;
        const audienceVisible = toOptionalString(payload?.visibility) !== "private";
        let createdBeliefId: string | undefined;

        if (characterId) {
          const beliefRecord = addCharacterBelief(next.beliefs, {
            characterId,
            chapter: normalizedEvent.chapter,
            kind: "deduction",
            subject,
            belief: beliefText,
            cause,
            references: {
              eventId: normalizedEvent.id,
            },
            tags: ["event:realization"],
          });
          createdBeliefId = beliefRecord.id;
          appendStateChange(normalizedEvent, {
            suffix: `realization:${characterId}:${beliefRecord.id}`,
            domain: "beliefs",
            operation: "create",
            stateKey: `belief:${beliefRecord.id}`,
            summary: `${characterId} realizes ${beliefText}`,
            entityIds: [characterId],
            resultingRecordId: beliefRecord.id,
          });
          appendOutcome(normalizedEvent, {
            suffix: `belief-realized:${characterId}:${beliefRecord.id}`,
            type: "belief_recorded",
            summary: `${characterId} realizes ${beliefText}`,
            resultingRecordIds: [beliefRecord.id],
          });
        }

        if (
          audienceVisible &&
          !hasAudienceKnowledgeSummary(next.audienceKnowledge, beliefText)
        ) {
          addAudienceKnowledge(next.audienceKnowledge, {
            chapter: normalizedEvent.chapter,
            kind: "fact_revealed",
            subject,
            summary: beliefText,
            status: "revealed",
            source: "monologue",
            references: {
              eventId: normalizedEvent.id,
              characterBeliefIds: createdBeliefId ? [createdBeliefId] : [],
            },
            tags: uniqueStrings([
              "event:realization",
              ...normalizedEvent.tags,
            ]),
          });
        }
        break;
      }

      case "time_jump": {
        const payload = normalizedEvent.payload;
        const toChapter = toOptionalNumber(payload?.toChapter)
          ?? normalizedEvent.chapter;
        const fromChapter = toOptionalNumber(payload?.fromChapter);
        const jumpSummary = toOptionalString(payload?.summary)
          ?? normalizedEvent.summary;

        const previousCursor = next.chapterCursor;
        next.chapterCursor = Math.max(next.chapterCursor, toChapter);
        appendStateChange(normalizedEvent, {
          suffix: `time-jump:${previousCursor}-${toChapter}`,
          domain: "world_model",
          operation: "update",
          stateKey: "world:chapterCursor",
          summary: fromChapter !== undefined
            ? `Time jump from chapter ${fromChapter} to ${toChapter}`
            : `Time jump to chapter ${toChapter}`,
          beforeValue: previousCursor,
          afterValue: next.chapterCursor,
        });
        appendOutcome(normalizedEvent, {
          suffix: `time-jumped:${toChapter}`,
          type: "character_state_changed",
          summary: jumpSummary,
        });

        if (!hasAudienceKnowledgeSummary(next.audienceKnowledge, jumpSummary)) {
          addAudienceKnowledge(next.audienceKnowledge, {
            chapter: normalizedEvent.chapter,
            kind: "fact_revealed",
            subject: "timeline",
            summary: jumpSummary,
            status: "revealed",
            source: "exposition",
            references: {
              eventId: normalizedEvent.id,
            },
            tags: uniqueStrings([
              "event:time_jump",
              ...normalizedEvent.tags,
            ]),
          });
        }
        break;
      }
    }

    next.eventLog.push(normalizedEvent);
    return next;
  }

  applyEvents(
    state: SimulationState,
    events: SimulationEvent[],
  ): SimulationState {
    return events.reduce(
      (current, event) => this.applyEvent(current, event),
      state,
    );
  }

  getChapterEvents(
    state: SimulationState,
    chapter: number,
  ): SimulationEvent[] {
    return state.eventLog.filter((event) => event.chapter === chapter);
  }

  getRecentEvents(
    state: SimulationState,
    limit = 5,
  ): SimulationEvent[] {
    return state.eventLog.slice(-limit);
  }
}
