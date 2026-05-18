import { z } from "zod";
import {
  CharacterBeliefCanonicalAlignmentSchema,
  CharacterDivergenceCauseSchema,
  type CharacterDivergenceCause,
} from "./cognitive-dissonance";

export const CharacterBeliefKindSchema = z.enum([
  "interpretation",
  "suspicion",
  "deduction",
  "self_concept",
  "trust_assessment",
]);

export const CharacterBeliefConfidenceSchema = z.enum([
  "low",
  "medium",
  "high",
]);

export const CharacterBeliefStatusSchema = z.enum([
  "active",
  "revised",
  "discarded",
]);

export const CharacterBeliefReferenceSchema = z.object({
  eventId: z.string().min(1).optional(),
  objectiveFactIds: z.array(z.string()).default([]),
  memoryIds: z.array(z.string()).default([]),
  utteranceIds: z.array(z.string()).default([]),
  relatedCharacterIds: z.array(z.string()).default([]),
});

export const CharacterBeliefRecordSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1),
  chapter: z.number().int().min(0),
  kind: CharacterBeliefKindSchema,
  subject: z.string().min(1),
  belief: z.string().min(1),
  confidence: CharacterBeliefConfidenceSchema.default("medium"),
  cause: z.string().min(1),
  canonicalAlignment: CharacterBeliefCanonicalAlignmentSchema.default("supported"),
  divergenceCause: CharacterDivergenceCauseSchema.optional(),
  status: CharacterBeliefStatusSchema.default("active"),
  supersededByBeliefId: z.string().min(1).optional(),
  references: CharacterBeliefReferenceSchema,
  tags: z.array(z.string()).default([]),
});

export const CharacterBeliefStateSchema = z.object({
  characterId: z.string().min(1),
  byId: z.record(z.string(), CharacterBeliefRecordSchema),
  timeline: z.array(z.string()),
  activeThreads: z.array(z.string()).default([]),
  trustByCharacter: z.record(z.string(), z.number()).default({}),
});

export const CharacterBeliefStoreSchema = z.record(
  z.string(),
  CharacterBeliefStateSchema,
);

export type CharacterBeliefKind = z.infer<typeof CharacterBeliefKindSchema>;
export type CharacterBeliefConfidence = z.infer<typeof CharacterBeliefConfidenceSchema>;
export type CharacterBeliefStatus = z.infer<typeof CharacterBeliefStatusSchema>;
export type CharacterBeliefCanonicalAlignment = z.infer<
  typeof CharacterBeliefCanonicalAlignmentSchema
>;
export type CharacterBeliefReference = z.infer<typeof CharacterBeliefReferenceSchema>;
export type CharacterBeliefRecord = z.infer<typeof CharacterBeliefRecordSchema>;
export type CharacterBeliefState = z.infer<typeof CharacterBeliefStateSchema>;
export type CharacterBeliefStore = z.infer<typeof CharacterBeliefStoreSchema>;

export interface CharacterBeliefInput {
  characterId: string;
  chapter: number;
  kind: CharacterBeliefKind;
  subject: string;
  belief: string;
  confidence?: CharacterBeliefConfidence;
  cause: string;
  canonicalAlignment?: CharacterBeliefCanonicalAlignment;
  divergenceCause?: CharacterDivergenceCause;
  status?: CharacterBeliefStatus;
  supersededByBeliefId?: string;
  references?: Partial<CharacterBeliefReference>;
  tags?: string[];
}

export interface ListCharacterBeliefsOptions {
  activeOnly?: boolean;
  kinds?: CharacterBeliefKind[];
  limit?: number;
}

function createEmptyCharacterBeliefState(
  characterId: string,
): CharacterBeliefState {
  return {
    characterId,
    byId: {},
    timeline: [],
    activeThreads: [],
    trustByCharacter: {},
  };
}

export function createCharacterBeliefStore(
  characterIds: string[] = [],
): CharacterBeliefStore {
  const store: Record<string, CharacterBeliefState> = {};

  for (const characterId of characterIds) {
    store[characterId] = createEmptyCharacterBeliefState(characterId);
  }

  return CharacterBeliefStoreSchema.parse(store);
}

export function cloneCharacterBeliefStore(
  store: CharacterBeliefStore,
): CharacterBeliefStore {
  return Object.fromEntries(
    Object.entries(store).map(([characterId, state]) => [
      characterId,
      {
        characterId,
        byId: Object.fromEntries(
          Object.entries(state.byId).map(([beliefId, record]) => [
            beliefId,
            {
              ...record,
              divergenceCause: record.divergenceCause
                ? { ...record.divergenceCause }
                : undefined,
              references: {
                eventId: record.references.eventId,
                objectiveFactIds: [...record.references.objectiveFactIds],
                memoryIds: [...record.references.memoryIds],
                utteranceIds: [...record.references.utteranceIds],
                relatedCharacterIds: [...record.references.relatedCharacterIds],
              },
              tags: [...record.tags],
            },
          ]),
        ),
        timeline: [...state.timeline],
        activeThreads: [...state.activeThreads],
        trustByCharacter: { ...state.trustByCharacter },
      },
    ]),
  );
}

function ensureCharacterBeliefState(
  store: CharacterBeliefStore,
  characterId: string,
): CharacterBeliefState {
  if (!store[characterId]) {
    store[characterId] = createEmptyCharacterBeliefState(characterId);
  }

  return store[characterId];
}

function getNextBeliefIndex(state: CharacterBeliefState): number {
  let maxIndex = 0;

  for (const beliefId of state.timeline) {
    const parsedIndex = Number.parseInt(beliefId.split(":").at(-1) ?? "", 10);
    if (Number.isFinite(parsedIndex) && parsedIndex > maxIndex) {
      maxIndex = parsedIndex;
    }
  }

  return maxIndex + 1;
}

function validateBeliefConsistency(input: CharacterBeliefInput): void {
  const linkedFactIds = input.references?.objectiveFactIds ?? [];
  const canonicalAlignment = input.canonicalAlignment
    ?? (linkedFactIds.length > 0 ? "supported" : "uncertain");
  const divergesFromFacts = linkedFactIds.length > 0 && canonicalAlignment === "contradicted";

  if (divergesFromFacts && !input.divergenceCause) {
    throw new Error(
      `Belief divergence for ${input.characterId} requires an explicit cause record`,
    );
  }

  if (!divergesFromFacts && input.divergenceCause) {
    throw new Error(
      `Belief divergence cause for ${input.characterId} requires contradicted canonical alignment`,
    );
  }
}

export function addCharacterBelief(
  store: CharacterBeliefStore,
  input: CharacterBeliefInput,
): CharacterBeliefRecord {
  validateBeliefConsistency(input);
  const state = ensureCharacterBeliefState(store, input.characterId);
  const nextIndex = getNextBeliefIndex(state);
  const id = `belief:${input.characterId}:${nextIndex}`;
  const linkedFactIds = input.references?.objectiveFactIds ?? [];

  const record = CharacterBeliefRecordSchema.parse({
    id,
    characterId: input.characterId,
    chapter: input.chapter,
    kind: input.kind,
    subject: input.subject,
    belief: input.belief,
    confidence: input.confidence ?? "medium",
    cause: input.cause,
    canonicalAlignment: input.canonicalAlignment
      ?? (linkedFactIds.length > 0 ? "supported" : "uncertain"),
    divergenceCause: input.divergenceCause,
    status: input.status ?? "active",
    supersededByBeliefId: input.supersededByBeliefId,
    references: {
      eventId: input.references?.eventId,
      objectiveFactIds: input.references?.objectiveFactIds ?? [],
      memoryIds: input.references?.memoryIds ?? [],
      utteranceIds: input.references?.utteranceIds ?? [],
      relatedCharacterIds: input.references?.relatedCharacterIds ?? [],
    },
    tags: input.tags ?? [],
  });

  state.byId[id] = record;
  state.timeline.push(id);
  return record;
}

export function listCharacterBeliefs(
  store: CharacterBeliefStore,
  characterId: string,
  options: ListCharacterBeliefsOptions = {},
): CharacterBeliefRecord[] {
  const state = store[characterId];
  if (!state) return [];

  const { activeOnly = false, kinds, limit } = options;
  const kindFilter = kinds ? new Set(kinds) : undefined;
  const beliefs = state.timeline
    .map((beliefId) => state.byId[beliefId])
    .filter((belief): belief is CharacterBeliefRecord => {
      if (!belief) return false;
      if (activeOnly && belief.status !== "active") return false;
      if (kindFilter && !kindFilter.has(belief.kind)) return false;
      return true;
    });

  return limit ? beliefs.slice(-limit) : beliefs;
}

export function setCharacterTrust(
  store: CharacterBeliefStore,
  characterId: string,
  targetCharacterId: string,
  trustValue: number,
): void {
  const state = ensureCharacterBeliefState(store, characterId);
  state.trustByCharacter[targetCharacterId] = trustValue;
}

export function adjustCharacterTrust(
  store: CharacterBeliefStore,
  characterId: string,
  targetCharacterId: string,
  trustDelta: number,
): number {
  const state = ensureCharacterBeliefState(store, characterId);
  const nextTrust = (state.trustByCharacter[targetCharacterId] ?? 0) + trustDelta;
  state.trustByCharacter[targetCharacterId] = nextTrust;
  return nextTrust;
}

export function addActiveBeliefThread(
  store: CharacterBeliefStore,
  characterId: string,
  threadId: string,
): void {
  const state = ensureCharacterBeliefState(store, characterId);
  if (!state.activeThreads.includes(threadId)) {
    state.activeThreads.push(threadId);
  }
}

export function removeActiveBeliefThread(
  store: CharacterBeliefStore,
  characterId: string,
  threadId: string,
): void {
  const state = ensureCharacterBeliefState(store, characterId);
  state.activeThreads = state.activeThreads.filter((activeId) => activeId !== threadId);
}
