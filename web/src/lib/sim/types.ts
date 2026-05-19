import type { NovelSeed } from "@/lib/schema/novel";
import type { AudienceKnowledgeStore } from "./audience-knowledge";
import type {
  CharacterBeliefInterpretationStore,
} from "./belief-interpretation-state";
import type {
  CharacterBeliefStore,
} from "./belief-state";
import type {
  CharacterMemoryStore,
} from "./memory-state";
import type { ObjectiveFactStore } from "./objective-facts";
import type { ForeshadowRegistryStore } from "./foreshadow-registry";
import type {
  CharacterUtteranceStore,
} from "./utterance-state";
import type {
  EventBeliefUpdateInput as EventBeliefUpdateInputContract,
  EventMemoryUpdateInput as EventMemoryUpdateInputContract,
  KnowledgeVisibility as KnowledgeVisibilityContract,
  SimulationEvent as SimulationEventContract,
  SimulationEventCognition as SimulationEventCognitionContract,
  SimulationEventType as SimulationEventTypeContract,
} from "./causal-ledger";

export type KnowledgeVisibility = KnowledgeVisibilityContract;
export type SimulationEventType = SimulationEventTypeContract;

export interface SimulationThread {
  id: string;
  title: string;
  ownerCharacterId?: string;
  status: "open" | "resolved";
  openedAtChapter: number;
  resolvedAtChapter?: number;
  summary: string;
}

export interface SimulationCharacterState {
  characterId: string;
  name: string;
  role: string;
  location: string | null;
  status: string;
  inventory: string[];
  secretsKnown: string[];
  realizationStage: number | null;
  relationships: Record<string, string>;
}

export type EventMemoryUpdateInput = EventMemoryUpdateInputContract;

export type EventBeliefUpdateInput = EventBeliefUpdateInputContract;

export type SimulationEventCognition = SimulationEventCognitionContract;
export type SimulationEvent = SimulationEventContract;

export interface SimulationState {
  seedTitle: string;
  chapterCursor: number;
  objectiveFacts: ObjectiveFactStore;
  audienceKnowledge: AudienceKnowledgeStore;
  characters: Record<string, SimulationCharacterState>;
  memories: CharacterMemoryStore;
  beliefs: CharacterBeliefStore;
  beliefInterpretations: CharacterBeliefInterpretationStore;
  utterances: CharacterUtteranceStore;
  foreshadowRegistry: ForeshadowRegistryStore;
  threads: Record<string, SimulationThread>;
  eventLog: SimulationEvent[];
}

export interface SimulationAdapterOptions {
  chapterNumber: number;
  sceneCharacterIds?: string[];
  activeSpeakerCharacterId?: string;
  maxFacts?: number;
  maxKnowledge?: number;
  maxEvents?: number;
  maxSpeakerMemories?: number;
  maxSpeakerBeliefs?: number;
}

export interface SimulationBootstrap {
  seed: NovelSeed;
}
