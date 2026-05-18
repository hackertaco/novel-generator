import {
  addCharacterBeliefInterpretation,
  ensureCharacterBeliefInterpretationStore,
  invalidateCharacterBeliefInterpretations,
  type CharacterBeliefInterpretationRecord,
  type CharacterBeliefInterpretationStore,
} from "./belief-interpretation-state";
import {
  addCharacterBelief,
  cloneCharacterBeliefStore,
  listCharacterBeliefs,
  type CharacterBeliefInput,
  type CharacterBeliefRecord,
  type CharacterBeliefReference,
  type CharacterBeliefStore,
} from "./belief-state";
import {
  listCharacterMemories,
  type CharacterMemoryKind,
  type CharacterMemoryRecord,
  type CharacterMemoryStore,
} from "./memory-state";
import type { SimulationState } from "./types";

export interface CharacterBeliefRecomputationChapterRange {
  start?: number;
  end?: number;
}

export interface CharacterBeliefRecomputationScope {
  chapterRange?: CharacterBeliefRecomputationChapterRange;
  eventIds?: string[];
  kinds?: CharacterMemoryKind[];
  memoryIds?: string[];
  objectiveFactIds?: string[];
  tags?: string[];
}

export interface DerivedCharacterBeliefInput
  extends Omit<CharacterBeliefInput, "characterId" | "chapter" | "references"> {
  chapter?: number;
  references?: Partial<CharacterBeliefReference>;
}

export interface CharacterBeliefDerivationContext {
  characterId: string;
  currentBeliefs: CharacterBeliefRecord[];
  memory: CharacterMemoryRecord;
  scope: CharacterBeliefRecomputationScope;
}

export interface RecomputeCharacterBeliefsFromMemoriesOptions {
  characterId: string;
  deriveBeliefs: (
    context: CharacterBeliefDerivationContext,
  ) =>
    | DerivedCharacterBeliefInput
    | DerivedCharacterBeliefInput[]
    | null
    | undefined;
  scope?: CharacterBeliefRecomputationScope;
}

export interface RecomputeCharacterBeliefsFromMemoriesResult {
  characterId: string;
  createdBeliefs: CharacterBeliefRecord[];
  createdInterpretations: CharacterBeliefInterpretationRecord[];
  invalidatedInterpretationIds: string[];
  removedBeliefIds: string[];
  scope: CharacterBeliefRecomputationScope;
  selectedMemoryIds: string[];
}

export interface RecomputeSimulationBeliefsFromMemoriesResult
  extends RecomputeCharacterBeliefsFromMemoriesResult {
  state: SimulationState;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function hasIntersection(source: string[], candidates?: string[]): boolean {
  if (!candidates || candidates.length === 0) {
    return true;
  }

  const candidateSet = new Set(candidates);
  return source.some((value) => candidateSet.has(value));
}

function matchesChapterRange(
  chapter: number,
  range?: CharacterBeliefRecomputationChapterRange,
): boolean {
  if (!range) {
    return true;
  }

  if (range.start !== undefined && chapter < range.start) {
    return false;
  }

  if (range.end !== undefined && chapter > range.end) {
    return false;
  }

  return true;
}

function matchesMemoryScope(
  memory: CharacterMemoryRecord,
  scope: CharacterBeliefRecomputationScope,
): boolean {
  if (!matchesChapterRange(memory.chapter, scope.chapterRange)) {
    return false;
  }

  if (scope.memoryIds?.length && !scope.memoryIds.includes(memory.id)) {
    return false;
  }

  if (scope.kinds?.length && !scope.kinds.includes(memory.kind)) {
    return false;
  }

  if (!hasIntersection([memory.references.eventId ?? ""], scope.eventIds)) {
    return false;
  }

  if (!hasIntersection(memory.references.objectiveFactIds, scope.objectiveFactIds)) {
    return false;
  }

  if (!hasIntersection(memory.tags, scope.tags)) {
    return false;
  }

  return true;
}

function normalizeDerivedBeliefInputs(
  value:
    | DerivedCharacterBeliefInput
    | DerivedCharacterBeliefInput[]
    | null
    | undefined,
): DerivedCharacterBeliefInput[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function mergeBeliefReferences(
  memory: CharacterMemoryRecord,
  references: Partial<CharacterBeliefReference> | undefined,
): Partial<CharacterBeliefReference> {
  return {
    eventId: references?.eventId ?? memory.references.eventId,
    memoryIds: uniqueStrings([memory.id, ...(references?.memoryIds ?? [])]),
    objectiveFactIds: uniqueStrings([
      ...memory.references.objectiveFactIds,
      ...(references?.objectiveFactIds ?? []),
    ]),
    utteranceIds: uniqueStrings([
      ...memory.references.utteranceIds,
      ...(references?.utteranceIds ?? []),
    ]),
    relatedCharacterIds: uniqueStrings([
      ...memory.references.relatedCharacterIds,
      ...(references?.relatedCharacterIds ?? []),
    ]),
  };
}

export function recomputeCharacterBeliefsFromMemories(
  beliefs: CharacterBeliefStore,
  memories: CharacterMemoryStore,
  beliefInterpretations: CharacterBeliefInterpretationStore,
  options: RecomputeCharacterBeliefsFromMemoriesOptions,
): RecomputeCharacterBeliefsFromMemoriesResult {
  const scope = options.scope ?? {};
  const selectedMemories = listCharacterMemories(memories, options.characterId).filter((memory) =>
    matchesMemoryScope(memory, scope)
  );
  const selectedMemoryIds = new Set(selectedMemories.map((memory) => memory.id));
  const removedBeliefIds = listCharacterBeliefs(beliefs, options.characterId)
    .filter((belief) =>
      belief.references.memoryIds.some((memoryId) => selectedMemoryIds.has(memoryId))
    )
    .map((belief) => belief.id);

  if (removedBeliefIds.length > 0) {
    const removedBeliefIdSet = new Set(removedBeliefIds);
    const state = beliefs[options.characterId];

    if (state) {
      state.timeline = state.timeline.filter((beliefId) => !removedBeliefIdSet.has(beliefId));
      for (const beliefId of removedBeliefIds) {
        delete state.byId[beliefId];
      }
    }
  }

  const invalidatedAtChapter = Math.max(
    ...selectedMemories.map((memory) => memory.chapter),
    0,
  );
  const invalidatedInterpretations = invalidateCharacterBeliefInterpretations(
    beliefInterpretations,
    {
      characterId: options.characterId,
      sourceMemoryIds: Array.from(selectedMemoryIds),
      invalidatedAtChapter,
      reason: "Belief interpretation recomputed from source memories",
    },
  );
  const createdBeliefs: CharacterBeliefRecord[] = [];
  const createdInterpretations: CharacterBeliefInterpretationRecord[] = [];

  for (const memory of selectedMemories) {
    const currentBeliefs = listCharacterBeliefs(beliefs, options.characterId);
    const derivedBeliefs = normalizeDerivedBeliefInputs(
      options.deriveBeliefs({
        characterId: options.characterId,
        currentBeliefs,
        memory,
        scope,
      }),
    );

    for (const derivedBelief of derivedBeliefs) {
      const chapter = derivedBelief.chapter ?? memory.chapter;
      const references = mergeBeliefReferences(memory, derivedBelief.references);
      const belief = addCharacterBelief(beliefs, {
        ...derivedBelief,
        characterId: options.characterId,
        chapter,
        references,
        tags: uniqueStrings(["belief:memory-derived", ...(derivedBelief.tags ?? [])]),
      });
      createdBeliefs.push(belief);
      createdInterpretations.push(
        addCharacterBeliefInterpretation(beliefInterpretations, {
          characterId: options.characterId,
          chapter,
          kind: belief.kind,
          subject: belief.subject,
          belief: belief.belief,
          confidence: belief.confidence,
          cause: belief.cause,
          canonicalAlignment: belief.canonicalAlignment,
          divergenceCause: belief.divergenceCause,
          sourceMemoryIds: [memory.id],
          producedBeliefIds: [belief.id],
          references,
          tags: uniqueStrings(["belief-interpretation:memory-derived", ...belief.tags]),
        }),
      );
    }
  }
  for (const invalidatedInterpretation of invalidatedInterpretations) {
    beliefInterpretations[options.characterId]!.byId[invalidatedInterpretation.id] = {
      ...invalidatedInterpretation,
      invalidation: invalidatedInterpretation.invalidation
        ? {
          ...invalidatedInterpretation.invalidation,
          replacementInterpretationIds: createdInterpretations.map(
            (interpretation) => interpretation.id,
          ),
        }
        : undefined,
    };
  }

  return {
    characterId: options.characterId,
    createdBeliefs,
    createdInterpretations,
    invalidatedInterpretationIds: invalidatedInterpretations.map(
      (interpretation) => interpretation.id,
    ),
    removedBeliefIds,
    scope,
    selectedMemoryIds: selectedMemories.map((memory) => memory.id),
  };
}

export function recomputeSimulationBeliefsFromMemories(
  state: SimulationState,
  options: RecomputeCharacterBeliefsFromMemoriesOptions,
): RecomputeSimulationBeliefsFromMemoriesResult {
  const beliefs = cloneCharacterBeliefStore(state.beliefs);
  const beliefInterpretations = ensureCharacterBeliefInterpretationStore(
    state.beliefInterpretations,
    Object.keys(state.characters),
  );
  const result = recomputeCharacterBeliefsFromMemories(
    beliefs,
    state.memories,
    beliefInterpretations,
    options,
  );
  state.beliefs = beliefs;
  state.beliefInterpretations = beliefInterpretations;

  return {
    ...result,
    state,
  };
}
