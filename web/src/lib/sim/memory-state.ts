import { z } from "zod";
import {
  CharacterDivergenceCauseSchema,
  type CharacterDivergenceCause,
} from "./cognitive-dissonance";

export const CharacterMemoryKindSchema = z.enum([
  "direct_experience",
  "secondhand_report",
  "inference",
  "recollection",
]);

export const CharacterMemoryAccuracySchema = z.enum([
  "accurate",
  "partial",
  "distorted",
]);

export const CharacterMemoryReferenceSchema = z.object({
  eventId: z.string().min(1).optional(),
  objectiveFactIds: z.array(z.string()).default([]),
  utteranceIds: z.array(z.string()).default([]),
  relatedCharacterIds: z.array(z.string()).default([]),
});

export const CharacterMemoryRecordSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1),
  chapter: z.number().int().min(0),
  kind: CharacterMemoryKindSchema,
  summary: z.string().min(1),
  location: z.string().min(1).optional(),
  emotionalTone: z.string().min(1).optional(),
  truthAlignment: CharacterMemoryAccuracySchema.default("accurate"),
  cause: z.string().min(1).optional(),
  divergenceCause: CharacterDivergenceCauseSchema.optional(),
  references: CharacterMemoryReferenceSchema,
  recalledAtChapters: z.array(z.number().int().min(0)).default([]),
  tags: z.array(z.string()).default([]),
});

export const CharacterMemoryStateSchema = z.object({
  characterId: z.string().min(1),
  byId: z.record(z.string(), CharacterMemoryRecordSchema),
  timeline: z.array(z.string()),
});

export const CharacterMemoryStoreSchema = z.record(
  z.string(),
  CharacterMemoryStateSchema,
);

export type CharacterMemoryKind = z.infer<typeof CharacterMemoryKindSchema>;
export type CharacterMemoryAccuracy = z.infer<typeof CharacterMemoryAccuracySchema>;
export type CharacterMemoryReference = z.infer<typeof CharacterMemoryReferenceSchema>;
export type CharacterMemoryRecord = z.infer<typeof CharacterMemoryRecordSchema>;
export type CharacterMemoryState = z.infer<typeof CharacterMemoryStateSchema>;
export type CharacterMemoryStore = z.infer<typeof CharacterMemoryStoreSchema>;

export interface CharacterMemoryInput {
  characterId: string;
  chapter: number;
  kind: CharacterMemoryKind;
  summary: string;
  location?: string | null;
  emotionalTone?: string;
  truthAlignment?: CharacterMemoryAccuracy;
  cause?: string;
  divergenceCause?: CharacterDivergenceCause;
  references?: Partial<CharacterMemoryReference>;
  recalledAtChapter?: number;
  tags?: string[];
}

export function createCharacterMemoryStore(
  characterIds: string[] = [],
): CharacterMemoryStore {
  const store: Record<string, CharacterMemoryState> = {};

  for (const characterId of characterIds) {
    store[characterId] = {
      characterId,
      byId: {},
      timeline: [],
    };
  }

  return CharacterMemoryStoreSchema.parse(store);
}

export function cloneCharacterMemoryStore(
  store: CharacterMemoryStore,
): CharacterMemoryStore {
  return Object.fromEntries(
    Object.entries(store).map(([characterId, state]) => [
      characterId,
      {
        characterId,
        byId: Object.fromEntries(
          Object.entries(state.byId).map(([memoryId, record]) => [
            memoryId,
            {
              ...record,
              divergenceCause: record.divergenceCause
                ? { ...record.divergenceCause }
                : undefined,
              references: {
                eventId: record.references.eventId,
                objectiveFactIds: [...record.references.objectiveFactIds],
                utteranceIds: [...record.references.utteranceIds],
                relatedCharacterIds: [...record.references.relatedCharacterIds],
              },
              recalledAtChapters: [...record.recalledAtChapters],
              tags: [...record.tags],
            },
          ]),
        ),
        timeline: [...state.timeline],
      },
    ]),
  );
}

function ensureCharacterMemoryState(
  store: CharacterMemoryStore,
  characterId: string,
): CharacterMemoryState {
  if (!store[characterId]) {
    store[characterId] = {
      characterId,
      byId: {},
      timeline: [],
    };
  }

  return store[characterId];
}

function validateMemoryConsistency(input: CharacterMemoryInput): void {
  const linkedFactIds = input.references?.objectiveFactIds ?? [];
  const truthAlignment = input.truthAlignment ?? "accurate";
  const divergesFromFacts = linkedFactIds.length > 0 && truthAlignment !== "accurate";

  if (divergesFromFacts && !input.divergenceCause) {
    throw new Error(
      `Memory divergence for ${input.characterId} requires an explicit cause record`,
    );
  }

  if (!divergesFromFacts && input.divergenceCause) {
    throw new Error(
      `Memory divergence cause for ${input.characterId} requires non-accurate truth alignment`,
    );
  }
}

export function addCharacterMemory(
  store: CharacterMemoryStore,
  input: CharacterMemoryInput,
): CharacterMemoryRecord {
  validateMemoryConsistency(input);
  const state = ensureCharacterMemoryState(store, input.characterId);
  const nextIndex = state.timeline.length + 1;
  const id = `memory:${input.characterId}:${nextIndex}`;
  const recalledAtChapters = input.recalledAtChapter === undefined
    ? []
    : [input.recalledAtChapter];

  const record = CharacterMemoryRecordSchema.parse({
    id,
    characterId: input.characterId,
    chapter: input.chapter,
    kind: input.kind,
    summary: input.summary,
    location: input.location ?? undefined,
    emotionalTone: input.emotionalTone,
    truthAlignment: input.truthAlignment ?? "accurate",
    cause: input.cause,
    divergenceCause: input.divergenceCause,
    references: {
      eventId: input.references?.eventId,
      objectiveFactIds: input.references?.objectiveFactIds ?? [],
      utteranceIds: input.references?.utteranceIds ?? [],
      relatedCharacterIds: input.references?.relatedCharacterIds ?? [],
    },
    recalledAtChapters,
    tags: input.tags ?? [],
  });

  state.byId[id] = record;
  state.timeline.push(id);
  return record;
}

export function listCharacterMemories(
  store: CharacterMemoryStore,
  characterId: string,
  limit?: number,
): CharacterMemoryRecord[] {
  const state = store[characterId];
  if (!state) return [];

  const memories = state.timeline
    .map((memoryId) => state.byId[memoryId])
    .filter((memory): memory is CharacterMemoryRecord => Boolean(memory));

  return limit ? memories.slice(-limit) : memories;
}
