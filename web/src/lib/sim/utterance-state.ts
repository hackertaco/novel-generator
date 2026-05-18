import { z } from "zod";
import {
  CharacterBeliefCanonicalAlignmentSchema,
  CharacterDivergenceCauseSchema,
  type CharacterBeliefCanonicalAlignment,
  type CharacterDivergenceCause,
} from "./cognitive-dissonance";

export const CharacterUtteranceMediumSchema = z.enum([
  "spoken",
  "whispered",
  "broadcast",
  "written_message",
]);

export const CharacterUtteranceProvenanceSourceSchema = z.enum([
  "direct_scene_capture",
  "reported_in_scene",
  "reconstructed_from_record",
]);

export const CharacterUtteranceProvenanceSchema = z.object({
  source: CharacterUtteranceProvenanceSourceSchema,
  sceneId: z.string().min(1),
  eventId: z.string().min(1).optional(),
  sceneTurn: z.number().int().min(0).optional(),
  witnessCharacterIds: z.array(z.string()).default([]),
  objectiveFactIds: z.array(z.string()).default([]),
});

export const CharacterUtteranceRecordSchema = z.object({
  id: z.string().min(1),
  characterId: z.string().min(1),
  chapter: z.number().int().min(0),
  sceneId: z.string().min(1),
  line: z.string().min(1),
  medium: CharacterUtteranceMediumSchema.default("spoken"),
  audienceCharacterIds: z.array(z.string()).default([]),
  intent: z.string().min(1).optional(),
  cause: z.string().min(1).optional(),
  canonicalAlignment: CharacterBeliefCanonicalAlignmentSchema.default("uncertain"),
  divergenceCause: CharacterDivergenceCauseSchema.optional(),
  relatedCharacterIds: z.array(z.string()).default([]),
  provenance: CharacterUtteranceProvenanceSchema,
  tags: z.array(z.string()).default([]),
});

export const CharacterUtteranceStateSchema = z.object({
  characterId: z.string().min(1),
  byId: z.record(z.string(), CharacterUtteranceRecordSchema),
  timeline: z.array(z.string()),
  byScene: z.record(z.string(), z.array(z.string())).default({}),
});

export const CharacterUtteranceStoreSchema = z.record(
  z.string(),
  CharacterUtteranceStateSchema,
);

export type CharacterUtteranceMedium = z.infer<typeof CharacterUtteranceMediumSchema>;
export type CharacterUtteranceProvenanceSource = z.infer<
  typeof CharacterUtteranceProvenanceSourceSchema
>;
export type CharacterUtteranceProvenance = z.infer<typeof CharacterUtteranceProvenanceSchema>;
export type CharacterUtteranceCanonicalAlignment = z.infer<
  typeof CharacterBeliefCanonicalAlignmentSchema
>;
export type CharacterUtteranceRecord = z.infer<typeof CharacterUtteranceRecordSchema>;
export type CharacterUtteranceState = z.infer<typeof CharacterUtteranceStateSchema>;
export type CharacterUtteranceStore = z.infer<typeof CharacterUtteranceStoreSchema>;

export interface CharacterUtteranceInput {
  characterId: string;
  chapter: number;
  sceneId: string;
  line: string;
  medium?: CharacterUtteranceMedium;
  audienceCharacterIds?: string[];
  intent?: string;
  cause?: string;
  canonicalAlignment?: CharacterBeliefCanonicalAlignment;
  divergenceCause?: CharacterDivergenceCause;
  relatedCharacterIds?: string[];
  provenance: CharacterUtteranceProvenance;
  tags?: string[];
}

export interface ListCharacterUtterancesOptions {
  sceneId?: string;
  limit?: number;
}

function createEmptyCharacterUtteranceState(
  characterId: string,
): CharacterUtteranceState {
  return {
    characterId,
    byId: {},
    timeline: [],
    byScene: {},
  };
}

export function createCharacterUtteranceStore(
  characterIds: string[] = [],
): CharacterUtteranceStore {
  const store: Record<string, CharacterUtteranceState> = {};

  for (const characterId of characterIds) {
    store[characterId] = createEmptyCharacterUtteranceState(characterId);
  }

  return CharacterUtteranceStoreSchema.parse(store);
}

export function cloneCharacterUtteranceStore(
  store: CharacterUtteranceStore,
): CharacterUtteranceStore {
  return Object.fromEntries(
    Object.entries(store).map(([characterId, state]) => [
      characterId,
      {
        characterId,
        byId: Object.fromEntries(
          Object.entries(state.byId).map(([utteranceId, record]) => [
            utteranceId,
            {
              ...record,
              audienceCharacterIds: [...record.audienceCharacterIds],
              canonicalAlignment: record.canonicalAlignment,
              divergenceCause: record.divergenceCause
                ? { ...record.divergenceCause }
                : undefined,
              relatedCharacterIds: [...record.relatedCharacterIds],
              provenance: {
                ...record.provenance,
                witnessCharacterIds: [...record.provenance.witnessCharacterIds],
                objectiveFactIds: [...record.provenance.objectiveFactIds],
              },
              tags: [...record.tags],
            },
          ]),
        ),
        timeline: [...state.timeline],
        byScene: Object.fromEntries(
          Object.entries(state.byScene).map(([sceneId, utteranceIds]) => [
            sceneId,
            [...utteranceIds],
          ]),
        ),
      },
    ]),
  );
}

function ensureCharacterUtteranceState(
  store: CharacterUtteranceStore,
  characterId: string,
): CharacterUtteranceState {
  if (!store[characterId]) {
    store[characterId] = createEmptyCharacterUtteranceState(characterId);
  }

  return store[characterId];
}

function validateUtteranceConsistency(input: CharacterUtteranceInput): void {
  const linkedFactIds = input.provenance.objectiveFactIds ?? [];
  const canonicalAlignment = input.canonicalAlignment
    ?? (linkedFactIds.length > 0 ? "supported" : "uncertain");
  const divergesFromFacts = linkedFactIds.length > 0 && canonicalAlignment === "contradicted";

  if (divergesFromFacts && !input.divergenceCause) {
    throw new Error(
      `Utterance divergence for ${input.characterId} requires an explicit cause record`,
    );
  }

  if (!divergesFromFacts && input.divergenceCause) {
    throw new Error(
      `Utterance divergence cause for ${input.characterId} requires contradicted canonical alignment`,
    );
  }
}

export function addCharacterUtterance(
  store: CharacterUtteranceStore,
  input: CharacterUtteranceInput,
): CharacterUtteranceRecord {
  validateUtteranceConsistency(input);
  const state = ensureCharacterUtteranceState(store, input.characterId);
  const nextIndex = state.timeline.length + 1;
  const id = `utterance:${input.characterId}:${nextIndex}`;
  const linkedFactIds = input.provenance.objectiveFactIds ?? [];

  const record = CharacterUtteranceRecordSchema.parse({
    id,
    characterId: input.characterId,
    chapter: input.chapter,
    sceneId: input.sceneId,
    line: input.line,
    medium: input.medium ?? "spoken",
    audienceCharacterIds: input.audienceCharacterIds ?? [],
    intent: input.intent,
    cause: input.cause,
    canonicalAlignment: input.canonicalAlignment
      ?? (linkedFactIds.length > 0 ? "supported" : "uncertain"),
    divergenceCause: input.divergenceCause,
    relatedCharacterIds: input.relatedCharacterIds ?? [],
    provenance: {
      ...input.provenance,
      sceneId: input.sceneId,
      witnessCharacterIds: input.provenance.witnessCharacterIds ?? [],
      objectiveFactIds: input.provenance.objectiveFactIds ?? [],
    },
    tags: input.tags ?? [],
  });

  state.byId[id] = record;
  state.timeline.push(id);
  state.byScene[input.sceneId] = [...(state.byScene[input.sceneId] ?? []), id];
  return record;
}

export function listCharacterUtterances(
  store: CharacterUtteranceStore,
  characterId: string,
  options: ListCharacterUtterancesOptions = {},
): CharacterUtteranceRecord[] {
  const state = store[characterId];
  if (!state) return [];

  const utteranceIds = options.sceneId
    ? (state.byScene[options.sceneId] ?? [])
    : state.timeline;
  const utterances = utteranceIds
    .map((utteranceId) => state.byId[utteranceId])
    .filter((utterance): utterance is CharacterUtteranceRecord => Boolean(utterance));

  return options.limit ? utterances.slice(-options.limit) : utterances;
}
