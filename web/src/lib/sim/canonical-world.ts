import type { Character } from "@/lib/schema/character";
import type { NovelSeed } from "@/lib/schema/novel";
import type {
  SimulationBootstrap,
  SimulationCharacterState,
  SimulationState,
  SimulationThread,
} from "./types";
import {
  createCharacterBeliefInterpretationStore,
} from "./belief-interpretation-state";
import {
  addCharacterBelief,
  createCharacterBeliefStore,
  setCharacterTrust,
} from "./belief-state";
import {
  addObjectiveFact,
  createObjectiveFactStore,
} from "./objective-facts";
import { createForeshadowRegistryFromSeed } from "./foreshadow-registry";
import { createCharacterMemoryStore } from "./memory-state";
import { createCharacterUtteranceStore } from "./utterance-state";

function createCharacterState(character: Character): SimulationCharacterState {
  return {
    characterId: character.id,
    name: character.name,
    role: character.role,
    location: character.state.location,
    status: character.state.status,
    inventory: [...character.state.inventory],
    secretsKnown: [...character.state.secrets_known],
    realizationStage: character.state.realization_stage ?? null,
    relationships: { ...character.state.relationships },
  };
}

function seedBeliefState(
  character: Character,
  state: SimulationState,
): void {
  for (const rel of character.relationship_facts ?? []) {
    setCharacterTrust(state.beliefs, character.id, rel.target, rel.trust_level);
  }

  const misbelief = character.internal_arc?.misbelief;
  if (misbelief) {
    addCharacterBelief(state.beliefs, {
      characterId: character.id,
      chapter: 0,
      kind: "self_concept",
      subject: character.name,
      belief: misbelief,
      confidence: "high",
      cause: "Initial internal arc misbelief from seed state",
      tags: ["belief:seed", "belief:misbelief"],
    });
  }
}

function createThreads(seed: NovelSeed): Record<string, SimulationThread> {
  const threads: Record<string, SimulationThread> = {};

  for (const thread of seed.story_threads ?? []) {
    threads[thread.id] = {
      id: thread.id,
      title: thread.name,
      ownerCharacterId: thread.owner,
      status: "open",
      openedAtChapter: 1,
      summary: thread.description,
    };
  }

  return threads;
}

export function createSimulationState(
  input: SimulationBootstrap | NovelSeed,
): SimulationState {
  const seed = "seed" in input ? input.seed : input;
  const characters: Record<string, SimulationCharacterState> = {};
  const objectiveFacts = createObjectiveFactStore();
  const beliefs = createCharacterBeliefStore(
    seed.characters.map((character) => character.id),
  );

  for (const character of seed.characters) {
    characters[character.id] = createCharacterState(character);

    if (character.state.location) {
      addObjectiveFact(objectiveFacts, {
        chapter: 0,
        subject: character.name,
        predicate: "is_at",
        object: character.state.location,
        category: "character_location",
        summary: `[character-location] ${character.name}: ${character.state.location}`,
        subjectEntity: {
          entityId: character.id,
          entityType: "character",
        },
        scope: {
          scopeId: `scope:character:${character.id}`,
          scopeType: "character",
          entityIds: [character.id],
        },
        factLineId: `fact-line:character-location:${character.id}`,
        tags: [`character:${character.id}`],
      });
    }

    addObjectiveFact(objectiveFacts, {
      chapter: 0,
      subject: character.name,
      predicate: "status",
      object: character.state.status,
      category: "character_status",
      summary: `[character-status] ${character.name}: ${character.state.status}`,
      subjectEntity: {
        entityId: character.id,
        entityType: "character",
      },
      scope: {
        scopeId: `scope:character:${character.id}`,
        scopeType: "character",
        entityIds: [character.id],
      },
      factLineId: `fact-line:character-status:${character.id}`,
      tags: [`character:${character.id}`],
    });

    for (const item of character.state.inventory) {
      addObjectiveFact(objectiveFacts, {
        chapter: 0,
        subject: character.name,
        predicate: "holds",
        object: item,
        category: "character_inventory",
        summary: `[character-inventory] ${character.name} holds ${item}`,
        subjectEntity: {
          entityId: character.id,
          entityType: "character",
        },
        objectEntity: {
          entityId: `item:${item}`,
          entityType: "item",
        },
        scope: {
          scopeId: `scope:inventory:${character.id}`,
          scopeType: "inventory",
          entityIds: [character.id],
        },
        factLineId: `fact-line:character-inventory:${character.id}:${item}`,
        tags: [`character:${character.id}`],
      });
    }
  }

  for (const rule of seed.world.rules) {
    addObjectiveFact(objectiveFacts, {
      chapter: 0,
      subject: seed.world.name,
      predicate: "world_rule",
      object: rule,
      category: "world_rule",
      summary: `[world-rule] ${rule}`,
      subjectEntity: {
        entityId: `world:${seed.world.name}`,
        entityType: "world",
      },
      scope: {
        scopeId: `scope:global:${seed.world.name}`,
        scopeType: "global",
        entityIds: [`world:${seed.world.name}`],
      },
      factLineId: `fact-line:world-rule:${seed.world.name}:${rule}`,
      tags: [`world:${seed.world.name}`],
    });
  }

  for (const [name, description] of Object.entries(seed.world.key_locations)) {
    addObjectiveFact(objectiveFacts, {
      chapter: 0,
      subject: name,
      predicate: "location_detail",
      object: description,
      category: "location",
      summary: `[location] ${name}: ${description}`,
      subjectEntity: {
        entityId: `location:${name}`,
        entityType: "location",
      },
      scope: {
        scopeId: `scope:location:${name}`,
        scopeType: "location",
        entityIds: [`location:${name}`],
      },
      factLineId: `fact-line:location:${name}:detail`,
      tags: ["setting"],
    });
  }

  for (const [name, description] of Object.entries(seed.world.factions)) {
    addObjectiveFact(objectiveFacts, {
      chapter: 0,
      subject: name,
      predicate: "faction_detail",
      object: description,
      category: "faction",
      summary: `[faction] ${name}: ${description}`,
      subjectEntity: {
        entityId: `faction:${name}`,
        entityType: "faction",
      },
      scope: {
        scopeId: `scope:faction:${name}`,
        scopeType: "faction",
        entityIds: [`faction:${name}`],
      },
      factLineId: `fact-line:faction:${name}:detail`,
      tags: ["setting"],
    });
  }

  const state: SimulationState = {
    seedTitle: seed.title,
    chapterCursor: 0,
    objectiveFacts,
    audienceKnowledge: [],
    characters,
    memories: createCharacterMemoryStore(seed.characters.map((character) => character.id)),
    beliefs,
    beliefInterpretations: createCharacterBeliefInterpretationStore(
      seed.characters.map((character) => character.id),
    ),
    utterances: createCharacterUtteranceStore(seed.characters.map((character) => character.id)),
    foreshadowRegistry: createForeshadowRegistryFromSeed(seed.foreshadowing),
    threads: createThreads(seed),
    eventLog: [],
  };

  for (const character of seed.characters) {
    seedBeliefState(character, state);
  }

  return state;
}
