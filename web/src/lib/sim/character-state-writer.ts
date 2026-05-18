import {
  addCharacterBelief,
  cloneCharacterBeliefStore,
  type CharacterBeliefCanonicalAlignment,
  type CharacterBeliefConfidence,
  type CharacterBeliefKind,
  type CharacterBeliefRecord,
  type CharacterBeliefStatus,
} from "./belief-state";
import type { CharacterDivergenceCause } from "./cognitive-dissonance";
import {
  addCharacterMemory,
  cloneCharacterMemoryStore,
  type CharacterMemoryAccuracy,
  type CharacterMemoryKind,
  type CharacterMemoryRecord,
} from "./memory-state";
import type { SimulationState } from "./types";
import {
  addCharacterUtterance,
  cloneCharacterUtteranceStore,
  type CharacterUtteranceCanonicalAlignment,
  type CharacterUtteranceMedium,
  type CharacterUtteranceProvenance,
  type CharacterUtteranceRecord,
} from "./utterance-state";
import { assertImmediateCognitionWrite } from "./verifier";

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function mergeTags(...tagSets: Array<string[] | undefined>): string[] {
  return uniqueStrings(tagSets.flat());
}

function defaultRelatedCharacterIds(
  speakerId: string,
  audienceCharacterIds: string[],
  relatedCharacterIds: string[] | undefined,
  targetCharacterId: string,
): string[] {
  if (relatedCharacterIds && relatedCharacterIds.length > 0) {
    return relatedCharacterIds;
  }

  return uniqueStrings([
    speakerId === targetCharacterId ? undefined : speakerId,
    ...audienceCharacterIds.map((characterId) =>
      characterId === targetCharacterId ? undefined : characterId
    ),
  ]);
}

export interface DialogueMemoryUpdateInput {
  characterId: string;
  summary: string;
  kind?: CharacterMemoryKind;
  location?: string | null;
  emotionalTone?: string;
  truthAlignment?: CharacterMemoryAccuracy;
  cause?: string;
  divergenceCause?: CharacterDivergenceCause;
  objectiveFactIds?: string[];
  relatedCharacterIds?: string[];
  tags?: string[];
}

export interface DialogueBeliefUpdateInput {
  characterId: string;
  kind: CharacterBeliefKind;
  subject: string;
  belief: string;
  confidence?: CharacterBeliefConfidence;
  cause: string;
  canonicalAlignment?: CharacterBeliefCanonicalAlignment;
  divergenceCause?: CharacterDivergenceCause;
  status?: CharacterBeliefStatus;
  supersededByBeliefId?: string;
  objectiveFactIds?: string[];
  memoryIds?: string[];
  relatedCharacterIds?: string[];
  tags?: string[];
}

export interface GeneratedDialogueTurnInput {
  characterId: string;
  chapter: number;
  sceneId: string;
  line: string;
  medium?: CharacterUtteranceMedium;
  audienceCharacterIds?: string[];
  intent?: string;
  cause?: string;
  canonicalAlignment?: CharacterUtteranceCanonicalAlignment;
  divergenceCause?: CharacterDivergenceCause;
  relatedCharacterIds?: string[];
  provenance: CharacterUtteranceProvenance;
  tags?: string[];
  memoryUpdates?: DialogueMemoryUpdateInput[];
  beliefUpdates?: DialogueBeliefUpdateInput[];
}

export interface GeneratedDialogueSceneInput {
  chapter: number;
  sceneId: string;
  turns: Array<Omit<GeneratedDialogueTurnInput, "chapter" | "sceneId">>;
}

export interface DialogueTurnWriteResult {
  utterance: CharacterUtteranceRecord;
  memories: CharacterMemoryRecord[];
  beliefs: CharacterBeliefRecord[];
}

export interface DialogueSceneWriteResult {
  utterances: CharacterUtteranceRecord[];
  memories: CharacterMemoryRecord[];
  beliefs: CharacterBeliefRecord[];
}

function createDialogueWritePreviewState(
  state: SimulationState,
): SimulationState {
  return {
    ...state,
    memories: cloneCharacterMemoryStore(state.memories),
    beliefs: cloneCharacterBeliefStore(state.beliefs),
    utterances: cloneCharacterUtteranceStore(state.utterances),
  };
}

export class CharacterStateWriter {
  writeDialogueTurn(
    state: SimulationState,
    input: GeneratedDialogueTurnInput,
  ): DialogueTurnWriteResult {
    const previewState = createDialogueWritePreviewState(state);
    const audienceCharacterIds = input.audienceCharacterIds ?? [];
    const utterance = addCharacterUtterance(previewState.utterances, {
      characterId: input.characterId,
      chapter: input.chapter,
      sceneId: input.sceneId,
      line: input.line,
      medium: input.medium,
      audienceCharacterIds,
      intent: input.intent,
      cause: input.cause,
      canonicalAlignment: input.canonicalAlignment,
      divergenceCause: input.divergenceCause,
      relatedCharacterIds: input.relatedCharacterIds ?? [],
      provenance: {
        ...input.provenance,
        sceneId: input.sceneId,
        witnessCharacterIds: input.provenance.witnessCharacterIds ?? audienceCharacterIds,
        objectiveFactIds: input.provenance.objectiveFactIds ?? [],
      },
      tags: mergeTags(input.tags, ["utterance:dialogue_state"]),
    });
    assertImmediateCognitionWrite(previewState, {
      recordType: "utterance",
      recordId: utterance.id,
    });

    const memories: CharacterMemoryRecord[] = [];
    const memoryIdsByCharacter = new Map<string, string[]>();

    for (const update of input.memoryUpdates ?? []) {
      const memory = addCharacterMemory(previewState.memories, {
        characterId: update.characterId,
        chapter: input.chapter,
        kind: update.kind
          ?? (update.characterId === input.characterId
            ? "direct_experience"
            : "secondhand_report"),
        summary: update.summary,
        location: update.location ?? state.characters[update.characterId]?.location ?? null,
        emotionalTone: update.emotionalTone,
        truthAlignment: update.truthAlignment,
        cause: update.cause ?? input.cause,
        divergenceCause: update.divergenceCause,
        references: {
          eventId: input.provenance.eventId,
          objectiveFactIds: update.objectiveFactIds ?? input.provenance.objectiveFactIds ?? [],
          utteranceIds: [utterance.id],
          relatedCharacterIds: defaultRelatedCharacterIds(
            input.characterId,
            audienceCharacterIds,
            update.relatedCharacterIds,
            update.characterId,
          ),
        },
        tags: mergeTags(update.tags, ["memory:dialogue"]),
      });
      assertImmediateCognitionWrite(previewState, {
        recordType: "memory",
        recordId: memory.id,
      });

      memories.push(memory);
      memoryIdsByCharacter.set(update.characterId, [
        ...(memoryIdsByCharacter.get(update.characterId) ?? []),
        memory.id,
      ]);
    }

    const beliefs: CharacterBeliefRecord[] = [];
    for (const update of input.beliefUpdates ?? []) {
      const belief = addCharacterBelief(previewState.beliefs, {
        characterId: update.characterId,
        chapter: input.chapter,
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
          eventId: input.provenance.eventId,
          objectiveFactIds: update.objectiveFactIds ?? input.provenance.objectiveFactIds ?? [],
          memoryIds: uniqueStrings([
            ...(update.memoryIds ?? []),
            ...(memoryIdsByCharacter.get(update.characterId) ?? []),
          ]),
          utteranceIds: [utterance.id],
          relatedCharacterIds: defaultRelatedCharacterIds(
            input.characterId,
            audienceCharacterIds,
            update.relatedCharacterIds,
            update.characterId,
          ),
        },
        tags: mergeTags(update.tags, ["belief:dialogue"]),
      });
      assertImmediateCognitionWrite(previewState, {
        recordType: "belief",
        recordId: belief.id,
      });

      beliefs.push(belief);
    }

    state.memories = previewState.memories;
    state.beliefs = previewState.beliefs;
    state.utterances = previewState.utterances;

    return {
      utterance,
      memories,
      beliefs,
    };
  }

  writeDialogueScene(
    state: SimulationState,
    input: GeneratedDialogueSceneInput,
  ): DialogueSceneWriteResult {
    const result: DialogueSceneWriteResult = {
      utterances: [],
      memories: [],
      beliefs: [],
    };

    input.turns.forEach((turn, index) => {
      const turnResult = this.writeDialogueTurn(state, {
        ...turn,
        chapter: input.chapter,
        sceneId: input.sceneId,
        provenance: {
          ...turn.provenance,
          sceneId: input.sceneId,
          sceneTurn: turn.provenance.sceneTurn ?? index,
        },
      });

      result.utterances.push(turnResult.utterance);
      result.memories.push(...turnResult.memories);
      result.beliefs.push(...turnResult.beliefs);
    });

    return result;
  }
}

export function applyGeneratedDialogueScene(
  state: SimulationState,
  input: GeneratedDialogueSceneInput,
): DialogueSceneWriteResult {
  return new CharacterStateWriter().writeDialogueScene(state, input);
}
