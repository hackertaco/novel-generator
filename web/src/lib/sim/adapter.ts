import type { SimulationAdapterOptions, SimulationState } from "./types";
import { listCharacterBeliefs } from "./belief-state";
import { listObjectiveFacts } from "./objective-facts";
import { listCharacterMemories } from "./memory-state";

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export interface ActiveSpeakerPromptOptions {
  speakerCharacterId: string;
  maxMemories?: number;
  maxBeliefs?: number;
}

export interface FocalCharacterPromptOptions {
  focalCharacterId: string;
  maxMemories?: number;
  maxBeliefs?: number;
}

interface CharacterCognitionPromptContextOptions {
  characterId: string;
  roleLabel: string;
  heading: string;
  instruction: string;
  maxMemories?: number;
  maxBeliefs?: number;
}

function buildCharacterCognitionPromptContext(
  state: SimulationState,
  options: CharacterCognitionPromptContextOptions,
): string {
  const {
    characterId,
    roleLabel,
    heading,
    instruction,
    maxMemories = 3,
    maxBeliefs = 3,
  } = options;
  const character = state.characters[characterId];

  if (!character) {
    return "";
  }

  const memories = listCharacterMemories(state.memories, characterId, maxMemories);
  const beliefs = listCharacterBeliefs(state.beliefs, characterId, {
    activeOnly: true,
    limit: maxBeliefs,
  });

  const parts: string[] = [];
  parts.push(heading);
  parts.push(`- ${roleLabel}: ${character.name}`);
  parts.push(`- current_state: location=${character.location ?? "unknown"} | status=${character.status}`);

  parts.push("- recent_memories:");
  if (memories.length > 0) {
    for (const memory of memories) {
      parts.push(`  - [${memory.kind}/${memory.truthAlignment}] ${memory.summary}`);
    }
  } else {
    parts.push("  - none recorded");
  }

  parts.push("- active_beliefs:");
  if (beliefs.length > 0) {
    for (const belief of beliefs) {
      parts.push(`  - [${belief.kind}/${belief.canonicalAlignment}/${belief.confidence}] ${belief.subject}: ${belief.belief}`);
    }
  } else {
    parts.push("  - none recorded");
  }

  parts.push(`- instruction: ${instruction}`);

  return parts.join("\n");
}

export function buildActiveSpeakerPromptContext(
  state: SimulationState,
  options: ActiveSpeakerPromptOptions,
): string {
  const {
    speakerCharacterId,
    maxMemories = 3,
    maxBeliefs = 3,
  } = options;
  return buildCharacterCognitionPromptContext(state, {
    characterId: speakerCharacterId,
    roleLabel: "speaker",
    heading: "### Active Speaker Cognition",
    instruction: "Generate this speaker's utterance from their remembered and believed state, not omniscient truth.",
    maxMemories,
    maxBeliefs,
  });
}

export function buildFocalCharacterPromptContext(
  state: SimulationState,
  options: FocalCharacterPromptOptions,
): string {
  const {
    focalCharacterId,
    maxMemories = 4,
    maxBeliefs = 4,
  } = options;

  return buildCharacterCognitionPromptContext(state, {
    characterId: focalCharacterId,
    roleLabel: "focal_character",
    heading: "### Focal Character Viewpoint",
    instruction: "Render internal observations and descriptive narration through this character's remembered and believed state. If canonical truth is hidden, limit the prose to what this character notices, recalls, suspects, misunderstands, or cannot yet explain.",
    maxMemories,
    maxBeliefs,
  });
}

export function buildSimulationPromptContext(
  state: SimulationState,
  options: SimulationAdapterOptions,
): string {
  const {
    chapterNumber,
    sceneCharacterIds = [],
    activeSpeakerCharacterId,
    maxFacts = 12,
    maxKnowledge = 8,
    maxEvents = 5,
    maxSpeakerMemories = 3,
    maxSpeakerBeliefs = 3,
  } = options;

  const parts: string[] = [];
  parts.push("## Simulation State");
  parts.push(`- title: ${state.seedTitle}`);
  parts.push(`- target chapter: ${chapterNumber}`);
  parts.push(`- chapter cursor: ${state.chapterCursor}`);

  const relevantFacts = listObjectiveFacts(state.objectiveFacts, {
    activeOnly: true,
    limit: maxFacts,
  });
  if (relevantFacts.length > 0) {
    parts.push("");
    parts.push("### Objective Facts");
    for (const fact of relevantFacts) {
      parts.push(`- ${fact.summary}`);
    }
  }

  const focusIds = sceneCharacterIds.length > 0
    ? sceneCharacterIds
    : Object.keys(state.characters).slice(0, 4);
  if (focusIds.length > 0) {
    parts.push("");
    parts.push("### Character State");
    for (const characterId of focusIds) {
      const character = state.characters[characterId];
      if (!character) continue;
      const inventory = character.inventory.length > 0
        ? ` | inventory=${character.inventory.join(", ")}`
        : "";
      parts.push(
        `- ${character.name}: location=${character.location ?? "unknown"} | status=${character.status}${inventory}`,
      );

      if (character.secretsKnown.length) {
        parts.push(
          `  knowledge=${character.secretsKnown.slice(-maxKnowledge).join(" | ")}`,
        );
      }

      const beliefs = listCharacterBeliefs(state.beliefs, characterId, {
        activeOnly: true,
        limit: 2,
      });
      if (beliefs.length > 0) {
        parts.push(
          `  beliefs=${beliefs.map((belief) => `${belief.subject}: ${belief.belief}`).join(" | ")}`,
        );
      }

      const memories = listCharacterMemories(state.memories, characterId, 2);
      if (memories.length > 0) {
        parts.push(
          `  memories=${memories.map((memory) => memory.summary).join(" | ")}`,
        );
      }
    }
  }

  if (activeSpeakerCharacterId) {
    const speakerBlock = buildActiveSpeakerPromptContext(state, {
      speakerCharacterId: activeSpeakerCharacterId,
      maxMemories: maxSpeakerMemories,
      maxBeliefs: maxSpeakerBeliefs,
    });
    if (speakerBlock) {
      parts.push("");
      parts.push(speakerBlock);
    }
  }

  const openThreads = Object.values(state.threads)
    .filter((thread) => thread.status === "open");
  if (openThreads.length > 0) {
    parts.push("");
    parts.push("### Open Threads");
    for (const thread of openThreads.slice(-6)) {
      parts.push(`- ${thread.title}: ${thread.summary}`);
    }
  }

  const audienceKnowledge = state.audienceKnowledge.slice(-maxKnowledge);
  if (audienceKnowledge.length > 0) {
    parts.push("");
    parts.push("### Audience Already Knows");
    for (const fact of audienceKnowledge) {
      parts.push(`- ${fact}`);
    }
  }

  const recentEvents = state.eventLog.slice(-maxEvents);
  if (recentEvents.length > 0) {
    parts.push("");
    parts.push("### Recent Event Log");
    for (const event of recentEvents) {
      const actor = event.actorId ? state.characters[event.actorId]?.name : undefined;
      const prefix = actor ? `${actor}: ` : "";
      parts.push(`- ch${event.chapter} ${prefix}${event.summary}`);
    }
  }

  return parts.join("\n");
}

export function collectSceneCharacterIds(
  state: SimulationState,
  chapterCharacterIds: string[],
): string[] {
  return unique(
    chapterCharacterIds.filter((id) => id in state.characters),
  );
}
