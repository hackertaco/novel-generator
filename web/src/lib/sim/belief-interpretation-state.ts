import { z } from "zod";
import {
  CharacterBeliefCanonicalAlignmentSchema,
  type CharacterBeliefCanonicalAlignment,
  type CharacterDivergenceCause,
  CharacterDivergenceCauseSchema,
} from "./cognitive-dissonance";
import {
  CharacterBeliefConfidenceSchema,
  CharacterBeliefKindSchema,
  CharacterBeliefReferenceSchema,
  type CharacterBeliefConfidence,
  type CharacterBeliefKind,
  type CharacterBeliefReference,
} from "./belief-state";

export const CharacterBeliefInterpretationStatusSchema = z.enum([
  "active",
  "invalidated",
]);

export const CharacterBeliefInterpretationInvalidationSchema = z.object({
  chapter: z.number().int().min(0),
  reason: z.string().min(1),
  replacementInterpretationIds: z.array(z.string().min(1)).default([]),
});

export const CharacterBeliefInterpretationRecordSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1),
  chapter: z.number().int().min(0),
  kind: CharacterBeliefKindSchema,
  subject: z.string().min(1),
  belief: z.string().min(1),
  confidence: CharacterBeliefConfidenceSchema.default("medium"),
  cause: z.string().min(1),
  canonicalAlignment: CharacterBeliefCanonicalAlignmentSchema.default("uncertain"),
  divergenceCause: CharacterDivergenceCauseSchema.optional(),
  status: CharacterBeliefInterpretationStatusSchema.default("active"),
  sourceMemoryIds: z.array(z.string().min(1)).default([]),
  producedBeliefIds: z.array(z.string().min(1)).default([]),
  references: CharacterBeliefReferenceSchema,
  tags: z.array(z.string()).default([]),
  invalidation: CharacterBeliefInterpretationInvalidationSchema.optional(),
});

export const CharacterBeliefInterpretationStateSchema = z.object({
  characterId: z.string().min(1),
  byId: z.record(z.string(), CharacterBeliefInterpretationRecordSchema),
  timeline: z.array(z.string()),
});

export const CharacterBeliefInterpretationStoreSchema = z.record(
  z.string(),
  CharacterBeliefInterpretationStateSchema,
);

export type CharacterBeliefInterpretationStatus = z.infer<
  typeof CharacterBeliefInterpretationStatusSchema
>;
export type CharacterBeliefInterpretationInvalidation = z.infer<
  typeof CharacterBeliefInterpretationInvalidationSchema
>;
export type CharacterBeliefInterpretationRecord = z.infer<
  typeof CharacterBeliefInterpretationRecordSchema
>;
export type CharacterBeliefInterpretationState = z.infer<
  typeof CharacterBeliefInterpretationStateSchema
>;
export type CharacterBeliefInterpretationStore = z.infer<
  typeof CharacterBeliefInterpretationStoreSchema
>;

export interface CharacterBeliefInterpretationInput {
  characterId: string;
  chapter: number;
  kind: CharacterBeliefKind;
  subject: string;
  belief: string;
  confidence?: CharacterBeliefConfidence;
  cause: string;
  canonicalAlignment?: CharacterBeliefCanonicalAlignment;
  divergenceCause?: CharacterDivergenceCause;
  sourceMemoryIds: string[];
  producedBeliefIds: string[];
  references: Partial<CharacterBeliefReference>;
  tags?: string[];
}

export interface ListCharacterBeliefInterpretationsOptions {
  activeOnly?: boolean;
  sourceMemoryIds?: string[];
  producedBeliefIds?: string[];
  limit?: number;
}

export interface InvalidateCharacterBeliefInterpretationsOptions {
  characterId: string;
  interpretationIds?: string[];
  sourceMemoryIds?: string[];
  producedBeliefIds?: string[];
  invalidatedAtChapter: number;
  reason: string;
  replacementInterpretationIds?: string[];
}

function createEmptyCharacterBeliefInterpretationState(
  characterId: string,
): CharacterBeliefInterpretationState {
  return {
    characterId,
    byId: {},
    timeline: [],
  };
}

function ensureCharacterBeliefInterpretationState(
  store: CharacterBeliefInterpretationStore,
  characterId: string,
): CharacterBeliefInterpretationState {
  if (!store[characterId]) {
    store[characterId] = createEmptyCharacterBeliefInterpretationState(characterId);
  }

  return store[characterId];
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function hasIntersection(source: string[], candidates?: string[]): boolean {
  if (!candidates?.length) {
    return true;
  }

  const candidateSet = new Set(candidates);
  return source.some((value) => candidateSet.has(value));
}

function getNextInterpretationIndex(
  state: CharacterBeliefInterpretationState,
): number {
  let maxIndex = 0;

  for (const interpretationId of state.timeline) {
    const parsedIndex = Number.parseInt(
      interpretationId.split(":").at(-1) ?? "",
      10,
    );
    if (Number.isFinite(parsedIndex) && parsedIndex > maxIndex) {
      maxIndex = parsedIndex;
    }
  }

  return maxIndex + 1;
}

export function createCharacterBeliefInterpretationStore(
  characterIds: string[] = [],
): CharacterBeliefInterpretationStore {
  const store: Record<string, CharacterBeliefInterpretationState> = {};

  for (const characterId of characterIds) {
    store[characterId] = createEmptyCharacterBeliefInterpretationState(characterId);
  }

  return CharacterBeliefInterpretationStoreSchema.parse(store);
}

export function ensureCharacterBeliefInterpretationStore(
  store: CharacterBeliefInterpretationStore | undefined,
  characterIds: string[],
): CharacterBeliefInterpretationStore {
  if (!store) {
    return createCharacterBeliefInterpretationStore(characterIds);
  }

  const nextStore = cloneCharacterBeliefInterpretationStore(store);
  for (const characterId of characterIds) {
    ensureCharacterBeliefInterpretationState(nextStore, characterId);
  }

  return nextStore;
}

export function cloneCharacterBeliefInterpretationStore(
  store: CharacterBeliefInterpretationStore,
): CharacterBeliefInterpretationStore {
  return Object.fromEntries(
    Object.entries(store).map(([characterId, state]) => [
      characterId,
      {
        characterId,
        byId: Object.fromEntries(
          Object.entries(state.byId).map(([interpretationId, record]) => [
            interpretationId,
            {
              ...record,
              divergenceCause: record.divergenceCause
                ? { ...record.divergenceCause }
                : undefined,
              producedBeliefIds: [...record.producedBeliefIds],
              sourceMemoryIds: [...record.sourceMemoryIds],
              references: {
                eventId: record.references.eventId,
                objectiveFactIds: [...record.references.objectiveFactIds],
                memoryIds: [...record.references.memoryIds],
                utteranceIds: [...record.references.utteranceIds],
                relatedCharacterIds: [...record.references.relatedCharacterIds],
              },
              tags: [...record.tags],
              invalidation: record.invalidation
                ? {
                  chapter: record.invalidation.chapter,
                  reason: record.invalidation.reason,
                  replacementInterpretationIds: [
                    ...record.invalidation.replacementInterpretationIds,
                  ],
                }
                : undefined,
            },
          ]),
        ),
        timeline: [...state.timeline],
      },
    ]),
  );
}

export function addCharacterBeliefInterpretation(
  store: CharacterBeliefInterpretationStore,
  input: CharacterBeliefInterpretationInput,
): CharacterBeliefInterpretationRecord {
  const state = ensureCharacterBeliefInterpretationState(store, input.characterId);
  const nextIndex = getNextInterpretationIndex(state);
  const id = `belief-interpretation:${input.characterId}:${nextIndex}`;

  const record = CharacterBeliefInterpretationRecordSchema.parse({
    id,
    characterId: input.characterId,
    chapter: input.chapter,
    kind: input.kind,
    subject: input.subject,
    belief: input.belief,
    confidence: input.confidence ?? "medium",
    cause: input.cause,
    canonicalAlignment: input.canonicalAlignment ?? "uncertain",
    divergenceCause: input.divergenceCause,
    status: "active",
    sourceMemoryIds: uniqueStrings(input.sourceMemoryIds),
    producedBeliefIds: uniqueStrings(input.producedBeliefIds),
    references: {
      eventId: input.references.eventId,
      objectiveFactIds: input.references.objectiveFactIds ?? [],
      memoryIds: uniqueStrings([
        ...input.sourceMemoryIds,
        ...(input.references.memoryIds ?? []),
      ]),
      utteranceIds: input.references.utteranceIds ?? [],
      relatedCharacterIds: input.references.relatedCharacterIds ?? [],
    },
    tags: input.tags ?? [],
  });

  state.byId[id] = record;
  state.timeline.push(id);
  return record;
}

export function listCharacterBeliefInterpretations(
  store: CharacterBeliefInterpretationStore,
  characterId: string,
  options: ListCharacterBeliefInterpretationsOptions = {},
): CharacterBeliefInterpretationRecord[] {
  const state = store[characterId];
  if (!state) return [];

  const { activeOnly = false, sourceMemoryIds, producedBeliefIds, limit } = options;
  const records = state.timeline
    .map((interpretationId) => state.byId[interpretationId])
    .filter((record): record is CharacterBeliefInterpretationRecord => {
      if (!record) return false;
      if (activeOnly && record.status !== "active") return false;
      if (!hasIntersection(record.sourceMemoryIds, sourceMemoryIds)) return false;
      if (!hasIntersection(record.producedBeliefIds, producedBeliefIds)) return false;
      return true;
    });

  return limit ? records.slice(-limit) : records;
}

export function invalidateCharacterBeliefInterpretations(
  store: CharacterBeliefInterpretationStore,
  options: InvalidateCharacterBeliefInterpretationsOptions,
): CharacterBeliefInterpretationRecord[] {
  const state = store[options.characterId];
  if (!state) return [];

  const interpretationIdFilter = options.interpretationIds?.length
    ? new Set(options.interpretationIds)
    : undefined;
  const invalidated: CharacterBeliefInterpretationRecord[] = [];

  for (const interpretationId of state.timeline) {
    const record = state.byId[interpretationId];
    if (!record || record.status !== "active") {
      continue;
    }

    if (interpretationIdFilter && !interpretationIdFilter.has(interpretationId)) {
      continue;
    }

    if (
      !hasIntersection(record.sourceMemoryIds, options.sourceMemoryIds)
      || !hasIntersection(record.producedBeliefIds, options.producedBeliefIds)
    ) {
      continue;
    }

    state.byId[interpretationId] = {
      ...record,
      status: "invalidated",
      invalidation: {
        chapter: options.invalidatedAtChapter,
        reason: options.reason,
        replacementInterpretationIds: options.replacementInterpretationIds ?? [],
      },
    };
    invalidated.push(state.byId[interpretationId]!);
  }

  return invalidated;
}
