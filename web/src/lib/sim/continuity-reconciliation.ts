import { z } from "zod";

import {
  type CharacterBeliefInterpretationRecord,
  type CharacterBeliefInterpretationStore,
} from "./belief-interpretation-state";
import {
  type CharacterBeliefRecord,
  type CharacterBeliefStore,
} from "./belief-state";
import {
  type CharacterMemoryRecord,
  type CharacterMemoryStore,
} from "./memory-state";
import {
  SimulationCausalLedgerSchema,
  parseSimulationEvent,
  type NormalizedSimulationEvent,
  type SimulationCausalLedger,
} from "./causal-ledger";
import {
  RetroactiveCorrectionPlanSchema,
  type RetroactiveCorrectionPlan,
} from "./retroactive-correction";
import type { SimulationEvent, SimulationState } from "./types";

export const ContinuityReconciliationReportSchema = z.object({
  replayEventIds: z.array(z.string().min(1)).default([]),
  updatedMemoryIds: z.array(z.string().min(1)).default([]),
  updatedBeliefIds: z.array(z.string().min(1)).default([]),
  updatedInterpretationIds: z.array(z.string().min(1)).default([]),
  reorderedMemoryCharacters: z.array(z.string().min(1)).default([]),
  reorderedBeliefCharacters: z.array(z.string().min(1)).default([]),
  reorderedInterpretationCharacters: z.array(z.string().min(1)).default([]),
});

export type ContinuityReconciliationReport = z.infer<
  typeof ContinuityReconciliationReportSchema
>;

interface RecordDescriptor {
  eventId: string;
  eventIndex: number;
  chapter: number;
  objectiveFactIds: string[];
}

interface StoreReconciliationResult<StoreType> {
  store: StoreType;
  updatedIds: Set<string>;
  reorderedCharacters: Set<string>;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function normalizeLedger(
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
): NormalizedSimulationEvent[] {
  if (Array.isArray(ledger)) {
    return ledger.map((event) => parseSimulationEvent(event));
  }

  return SimulationCausalLedgerSchema.parse(ledger).events.map((event) =>
    parseSimulationEvent(event)
  );
}

function buildRecordDescriptorIndex(
  events: ReadonlyArray<NormalizedSimulationEvent>,
): Map<string, RecordDescriptor> {
  const descriptors = new Map<string, RecordDescriptor>();

  events.forEach((event, eventIndex) => {
    for (const change of event.stateChanges) {
      if (!change.resultingRecordId) {
        continue;
      }

      const matchingFactIds = uniqueStrings(
        event.outcomes
          .filter((outcome) =>
            outcome.resultingRecordIds.includes(change.resultingRecordId!)
            || outcome.stateChangeIds.includes(change.changeId)
          )
          .flatMap((outcome) => outcome.resultingFactIds),
      );

      descriptors.set(change.resultingRecordId, {
        eventId: event.id,
        eventIndex,
        chapter: event.chapter,
        objectiveFactIds: matchingFactIds,
      });
    }
  });

  return descriptors;
}

function maybeUpdateMemoryRecord(
  record: CharacterMemoryRecord,
  replayEventIds: ReadonlySet<string>,
  eventById: ReadonlyMap<string, NormalizedSimulationEvent>,
  descriptors: ReadonlyMap<string, RecordDescriptor>,
): CharacterMemoryRecord | null {
  const sourceEventId = record.references.eventId;
  if (!sourceEventId || !replayEventIds.has(sourceEventId)) {
    return null;
  }

  const event = eventById.get(sourceEventId);
  if (!event) {
    return null;
  }

  const descriptor = descriptors.get(record.id);
  const nextObjectiveFactIds = descriptor?.objectiveFactIds.length
    ? descriptor.objectiveFactIds
    : record.references.objectiveFactIds;

  const nextRecord: CharacterMemoryRecord = {
    ...record,
    chapter: event.chapter,
    references: {
      ...record.references,
      eventId: event.id,
      objectiveFactIds: [...nextObjectiveFactIds],
    },
  };

  return JSON.stringify(nextRecord) === JSON.stringify(record) ? null : nextRecord;
}

function findBeliefEventId(
  record: CharacterBeliefRecord,
  memoryLookup: ReadonlyMap<string, CharacterMemoryRecord>,
): string | undefined {
  if (record.references.eventId) {
    return record.references.eventId;
  }

  return record.references.memoryIds
    .map((memoryId) => memoryLookup.get(memoryId)?.references.eventId)
    .find((eventId): eventId is string => Boolean(eventId));
}

function maybeUpdateBeliefRecord(
  record: CharacterBeliefRecord,
  affectedMemoryIds: ReadonlySet<string>,
  replayEventIds: ReadonlySet<string>,
  eventById: ReadonlyMap<string, NormalizedSimulationEvent>,
  descriptors: ReadonlyMap<string, RecordDescriptor>,
  memoryLookup: ReadonlyMap<string, CharacterMemoryRecord>,
): CharacterBeliefRecord | null {
  const derivedEventId = findBeliefEventId(record, memoryLookup);
  const dependsOnReplayEvent = Boolean(derivedEventId && replayEventIds.has(derivedEventId));
  const dependsOnReplayMemory = record.references.memoryIds.some((memoryId) =>
    affectedMemoryIds.has(memoryId)
  );

  if (!dependsOnReplayEvent && !dependsOnReplayMemory) {
    return null;
  }

  const event = derivedEventId ? eventById.get(derivedEventId) : undefined;
  const descriptor = descriptors.get(record.id);
  const nextEventId = derivedEventId ?? record.references.eventId;
  const nextObjectiveFactIds = descriptor?.objectiveFactIds.length
    ? descriptor.objectiveFactIds
    : record.references.objectiveFactIds;
  const nextMemoryIds = uniqueStrings(
    record.references.memoryIds.filter((memoryId) => memoryLookup.has(memoryId)),
  );
  const nextChapter = event?.chapter
    ?? nextMemoryIds
      .map((memoryId) => memoryLookup.get(memoryId)?.chapter ?? 0)
      .reduce((max, chapter) => Math.max(max, chapter), record.chapter);

  const nextRecord: CharacterBeliefRecord = {
    ...record,
    chapter: nextChapter,
    references: {
      ...record.references,
      eventId: nextEventId,
      objectiveFactIds: [...nextObjectiveFactIds],
      memoryIds: nextMemoryIds,
    },
  };

  return JSON.stringify(nextRecord) === JSON.stringify(record) ? null : nextRecord;
}

function findInterpretationEventId(
  record: CharacterBeliefInterpretationRecord,
  memoryLookup: ReadonlyMap<string, CharacterMemoryRecord>,
): string | undefined {
  if (record.references.eventId) {
    return record.references.eventId;
  }

  return record.sourceMemoryIds
    .map((memoryId) => memoryLookup.get(memoryId)?.references.eventId)
    .find((eventId): eventId is string => Boolean(eventId));
}

function maybeUpdateInterpretationRecord(
  record: CharacterBeliefInterpretationRecord,
  affectedMemoryIds: ReadonlySet<string>,
  affectedBeliefIds: ReadonlySet<string>,
  replayEventIds: ReadonlySet<string>,
  eventById: ReadonlyMap<string, NormalizedSimulationEvent>,
  memoryLookup: ReadonlyMap<string, CharacterMemoryRecord>,
  beliefLookup: ReadonlyMap<string, CharacterBeliefRecord>,
): CharacterBeliefInterpretationRecord | null {
  const dependsOnReplayMemory = record.sourceMemoryIds.some((memoryId) =>
    affectedMemoryIds.has(memoryId)
  );
  const dependsOnReplayBelief = record.producedBeliefIds.some((beliefId) =>
    affectedBeliefIds.has(beliefId)
  );
  const derivedEventId = findInterpretationEventId(record, memoryLookup);
  const dependsOnReplayEvent = Boolean(derivedEventId && replayEventIds.has(derivedEventId));

  if (!dependsOnReplayMemory && !dependsOnReplayBelief && !dependsOnReplayEvent) {
    return null;
  }

  const event = derivedEventId ? eventById.get(derivedEventId) : undefined;
  const nextSourceMemoryIds = uniqueStrings(
    record.sourceMemoryIds.filter((memoryId) => memoryLookup.has(memoryId)),
  );
  const nextProducedBeliefIds = uniqueStrings(
    record.producedBeliefIds.filter((beliefId) => beliefLookup.has(beliefId)),
  );
  const nextEventId = derivedEventId ?? record.references.eventId;
  const nextObjectiveFactIds = uniqueStrings([
    ...record.references.objectiveFactIds,
    ...nextSourceMemoryIds.flatMap((memoryId) =>
      memoryLookup.get(memoryId)?.references.objectiveFactIds ?? []
    ),
    ...nextProducedBeliefIds.flatMap((beliefId) =>
      beliefLookup.get(beliefId)?.references.objectiveFactIds ?? []
    ),
  ]);
  const nextChapter = event?.chapter
    ?? nextSourceMemoryIds
      .map((memoryId) => memoryLookup.get(memoryId)?.chapter ?? 0)
      .reduce((max, chapter) => Math.max(max, chapter), record.chapter);

  const nextRecord: CharacterBeliefInterpretationRecord = {
    ...record,
    chapter: nextChapter,
    sourceMemoryIds: nextSourceMemoryIds,
    producedBeliefIds: nextProducedBeliefIds,
    references: {
      ...record.references,
      eventId: nextEventId,
      objectiveFactIds: nextObjectiveFactIds,
      memoryIds: uniqueStrings([
        ...record.references.memoryIds,
        ...nextSourceMemoryIds,
      ]),
    },
  };

  return JSON.stringify(nextRecord) === JSON.stringify(record) ? null : nextRecord;
}

function reorderTimeline<RecordType extends { references?: { eventId?: string }; chapter: number }>(
  timeline: string[],
  byId: Record<string, RecordType>,
  eventIndexById: ReadonlyMap<string, number>,
): string[] {
  const originalPosition = new Map(
    timeline.map((recordId, index) => [recordId, index] as const),
  );

  return [...timeline].sort((leftId, rightId) => {
    const left = byId[leftId];
    const right = byId[rightId];
    if (!left || !right) {
      return (originalPosition.get(leftId) ?? 0) - (originalPosition.get(rightId) ?? 0);
    }

    const leftIndex = left.references?.eventId
      ? eventIndexById.get(left.references.eventId)
      : undefined;
    const rightIndex = right.references?.eventId
      ? eventIndexById.get(right.references.eventId)
      : undefined;

    if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    if (left.chapter !== right.chapter) {
      return left.chapter - right.chapter;
    }

    return (originalPosition.get(leftId) ?? 0) - (originalPosition.get(rightId) ?? 0);
  });
}

function shouldReorderTimeline<RecordType extends { references?: { eventId?: string } }>(
  timeline: string[],
  byId: Record<string, RecordType>,
  replayEventIds: ReadonlySet<string>,
): boolean {
  return timeline.some((recordId) => {
    const eventId = byId[recordId]?.references?.eventId;
    return Boolean(eventId && replayEventIds.has(eventId));
  });
}

function reconcileMemoryStore(
  memories: CharacterMemoryStore,
  replayEventIds: ReadonlySet<string>,
  eventById: ReadonlyMap<string, NormalizedSimulationEvent>,
  eventIndexById: ReadonlyMap<string, number>,
  descriptors: ReadonlyMap<string, RecordDescriptor>,
): StoreReconciliationResult<CharacterMemoryStore> {
  const nextEntries: Array<[string, CharacterMemoryStore[string]]> = [];
  const updatedIds = new Set<string>();
  const reorderedCharacters = new Set<string>();
  let storeChanged = false;

  for (const [characterId, memoryState] of Object.entries(memories)) {
    let nextById = memoryState.byId;

    for (const memoryId of memoryState.timeline) {
      const current = nextById[memoryId];
      if (!current) {
        continue;
      }

      const updated = maybeUpdateMemoryRecord(
        current,
        replayEventIds,
        eventById,
        descriptors,
      );
      if (!updated) {
        continue;
      }

      if (nextById === memoryState.byId) {
        nextById = { ...memoryState.byId };
      }
      nextById[memoryId] = updated;
      updatedIds.add(memoryId);
    }

    let nextTimeline = memoryState.timeline;
    if (shouldReorderTimeline(nextTimeline, nextById, replayEventIds)) {
      const reordered = reorderTimeline(nextTimeline, nextById, eventIndexById);
      if (JSON.stringify(reordered) !== JSON.stringify(nextTimeline)) {
        nextTimeline = reordered;
        reorderedCharacters.add(characterId);
      }
    }

    if (nextById !== memoryState.byId || nextTimeline !== memoryState.timeline) {
      nextEntries.push([
        characterId,
        {
          characterId,
          byId: nextById,
          timeline: nextTimeline,
        },
      ]);
      storeChanged = true;
      continue;
    }

    nextEntries.push([characterId, memoryState]);
  }

  return {
    store: storeChanged ? Object.fromEntries(nextEntries) : memories,
    updatedIds,
    reorderedCharacters,
  };
}

function reconcileBeliefStore(
  beliefs: CharacterBeliefStore,
  replayEventIds: ReadonlySet<string>,
  eventById: ReadonlyMap<string, NormalizedSimulationEvent>,
  eventIndexById: ReadonlyMap<string, number>,
  descriptors: ReadonlyMap<string, RecordDescriptor>,
  memoryLookup: ReadonlyMap<string, CharacterMemoryRecord>,
  affectedMemoryIds: ReadonlySet<string>,
): StoreReconciliationResult<CharacterBeliefStore> {
  const nextEntries: Array<[string, CharacterBeliefStore[string]]> = [];
  const updatedIds = new Set<string>();
  const reorderedCharacters = new Set<string>();
  let storeChanged = false;

  for (const [characterId, beliefState] of Object.entries(beliefs)) {
    let nextById = beliefState.byId;

    for (const beliefId of beliefState.timeline) {
      const current = nextById[beliefId];
      if (!current) {
        continue;
      }

      const updated = maybeUpdateBeliefRecord(
        current,
        affectedMemoryIds,
        replayEventIds,
        eventById,
        descriptors,
        memoryLookup,
      );
      if (!updated) {
        continue;
      }

      if (nextById === beliefState.byId) {
        nextById = { ...beliefState.byId };
      }
      nextById[beliefId] = updated;
      updatedIds.add(beliefId);
    }

    let nextTimeline = beliefState.timeline;
    if (shouldReorderTimeline(nextTimeline, nextById, replayEventIds)) {
      const reordered = reorderTimeline(nextTimeline, nextById, eventIndexById);
      if (JSON.stringify(reordered) !== JSON.stringify(nextTimeline)) {
        nextTimeline = reordered;
        reorderedCharacters.add(characterId);
      }
    }

    if (nextById !== beliefState.byId || nextTimeline !== beliefState.timeline) {
      nextEntries.push([
        characterId,
        {
          characterId,
          byId: nextById,
          timeline: nextTimeline,
          activeThreads: [...beliefState.activeThreads],
          trustByCharacter: { ...beliefState.trustByCharacter },
        },
      ]);
      storeChanged = true;
      continue;
    }

    nextEntries.push([characterId, beliefState]);
  }

  return {
    store: storeChanged ? Object.fromEntries(nextEntries) : beliefs,
    updatedIds,
    reorderedCharacters,
  };
}

function reconcileInterpretationStore(
  interpretations: CharacterBeliefInterpretationStore,
  replayEventIds: ReadonlySet<string>,
  eventById: ReadonlyMap<string, NormalizedSimulationEvent>,
  eventIndexById: ReadonlyMap<string, number>,
  memoryLookup: ReadonlyMap<string, CharacterMemoryRecord>,
  beliefLookup: ReadonlyMap<string, CharacterBeliefRecord>,
  affectedMemoryIds: ReadonlySet<string>,
  affectedBeliefIds: ReadonlySet<string>,
): StoreReconciliationResult<CharacterBeliefInterpretationStore> {
  const nextEntries: Array<[string, CharacterBeliefInterpretationStore[string]]> = [];
  const updatedIds = new Set<string>();
  const reorderedCharacters = new Set<string>();
  let storeChanged = false;

  for (const [characterId, interpretationState] of Object.entries(interpretations)) {
    let nextById = interpretationState.byId;

    for (const interpretationId of interpretationState.timeline) {
      const current = nextById[interpretationId];
      if (!current) {
        continue;
      }

      const updated = maybeUpdateInterpretationRecord(
        current,
        affectedMemoryIds,
        affectedBeliefIds,
        replayEventIds,
        eventById,
        memoryLookup,
        beliefLookup,
      );
      if (!updated) {
        continue;
      }

      if (nextById === interpretationState.byId) {
        nextById = { ...interpretationState.byId };
      }
      nextById[interpretationId] = updated;
      updatedIds.add(interpretationId);
    }

    let nextTimeline = interpretationState.timeline;
    if (shouldReorderTimeline(nextTimeline, nextById, replayEventIds)) {
      const reordered = reorderTimeline(nextTimeline, nextById, eventIndexById);
      if (JSON.stringify(reordered) !== JSON.stringify(nextTimeline)) {
        nextTimeline = reordered;
        reorderedCharacters.add(characterId);
      }
    }

    if (nextById !== interpretationState.byId || nextTimeline !== interpretationState.timeline) {
      nextEntries.push([
        characterId,
        {
          characterId,
          byId: nextById,
          timeline: nextTimeline,
        },
      ]);
      storeChanged = true;
      continue;
    }

    nextEntries.push([characterId, interpretationState]);
  }

  return {
    store: storeChanged ? Object.fromEntries(nextEntries) : interpretations,
    updatedIds,
    reorderedCharacters,
  };
}

function reconcileEventLog(
  eventLog: ReadonlyArray<SimulationEvent>,
  normalizedLedger: ReadonlyArray<NormalizedSimulationEvent>,
  replayEventIds: ReadonlySet<string>,
): SimulationEvent[] {
  const currentById = new Map(eventLog.map((event) => [event.id, event]));

  return normalizedLedger.map((event) => {
    if (replayEventIds.has(event.id)) {
      return parseSimulationEvent(event);
    }

    return currentById.get(event.id) ?? parseSimulationEvent(event);
  });
}

export function reconcileSimulationContinuityArtifacts(
  state: SimulationState,
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
  plan: RetroactiveCorrectionPlan | Pick<RetroactiveCorrectionPlan, "replayScope">,
): {
  state: SimulationState;
  report: ContinuityReconciliationReport;
} {
  const normalizedPlan = "failure" in plan
    ? RetroactiveCorrectionPlanSchema.parse(plan)
    : { replayScope: plan.replayScope };
  const normalizedLedger = normalizeLedger(ledger);
  const replayEventIds = new Set(normalizedPlan.replayScope.eventIds);
  const eventById = new Map(normalizedLedger.map((event) => [event.id, event]));
  const eventIndexById = new Map(normalizedLedger.map((event, index) => [event.id, index]));
  const descriptors = buildRecordDescriptorIndex(normalizedLedger);
  const memoryResult = reconcileMemoryStore(
    state.memories,
    replayEventIds,
    eventById,
    eventIndexById,
    descriptors,
  );
  const memories = memoryResult.store;

  const memoryLookup = new Map(
    Object.values(memories).flatMap((memoryState) =>
      memoryState.timeline
        .map((memoryId) => memoryState.byId[memoryId])
        .filter((record): record is CharacterMemoryRecord => Boolean(record))
        .map((record) => [record.id, record] as const)
    ),
  );
  const beliefResult = reconcileBeliefStore(
    state.beliefs,
    replayEventIds,
    eventById,
    eventIndexById,
    descriptors,
    memoryLookup,
    memoryResult.updatedIds,
  );
  const beliefs = beliefResult.store;

  const beliefLookup = new Map(
    Object.values(beliefs).flatMap((beliefState) =>
      beliefState.timeline
        .map((beliefId) => beliefState.byId[beliefId])
        .filter((record): record is CharacterBeliefRecord => Boolean(record))
        .map((record) => [record.id, record] as const)
    ),
  );
  const interpretationResult = reconcileInterpretationStore(
    state.beliefInterpretations,
    replayEventIds,
    eventById,
    eventIndexById,
    memoryLookup,
    beliefLookup,
    memoryResult.updatedIds,
    beliefResult.updatedIds,
  );
  const beliefInterpretations = interpretationResult.store;
  const eventLog = reconcileEventLog(state.eventLog, normalizedLedger, replayEventIds);

  return {
    state: {
      ...state,
      chapterCursor: eventLog.reduce(
        (max, event) => Math.max(max, event.chapter),
        state.chapterCursor,
      ),
      memories,
      beliefs,
      beliefInterpretations,
      eventLog,
    },
    report: ContinuityReconciliationReportSchema.parse({
      replayEventIds: normalizedPlan.replayScope.eventIds,
      updatedMemoryIds: [...memoryResult.updatedIds],
      updatedBeliefIds: [...beliefResult.updatedIds],
      updatedInterpretationIds: [...interpretationResult.updatedIds],
      reorderedMemoryCharacters: [...memoryResult.reorderedCharacters],
      reorderedBeliefCharacters: [...beliefResult.reorderedCharacters],
      reorderedInterpretationCharacters: [...interpretationResult.reorderedCharacters],
    }),
  };
}
