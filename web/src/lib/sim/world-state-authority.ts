import type { NovelSeed } from "@/lib/schema/novel";
import type {
  ChapterWorldState,
  CharacterState as ExtractedCharacterState,
  RevealedFact,
  WorldFact,
} from "@/lib/memory/world-state";
import { WorldStateManager } from "@/lib/memory/world-state-manager";
import { buildSimulationPromptContext } from "./adapter";
import {
  recomputeSimulationBeliefsFromMemories,
  type RecomputeCharacterBeliefsFromMemoriesOptions,
  type RecomputeCharacterBeliefsFromMemoriesResult,
} from "./belief-recomputation";
import { ensureCharacterBeliefInterpretationStore } from "./belief-interpretation-state";
import {
  reconcileSimulationContinuityArtifacts,
  type ContinuityReconciliationReport,
} from "./continuity-reconciliation";
import {
  buildSimulationCausalLedger,
  querySimulationCausalLedger,
  type SimulationCausalLedger,
  type SimulationCausalLedgerQuery,
  type SimulationCausalLedgerQueryResult,
} from "./causal-ledger";
import { createSimulationState } from "./canonical-world";
import type { RetroactiveCorrectionPlan } from "./retroactive-correction";
import { SimulationEventLedger } from "./event-ledger";
import { applyGeneratedDialogueScene, type DialogueSceneWriteResult, type GeneratedDialogueSceneInput } from "./character-state-writer";
import type { SimulationAdapterOptions, SimulationEvent, SimulationState } from "./types";

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export interface WorldStateAuthoritySnapshot {
  simulationState: SimulationState;
  worldStateProjection?: ChapterWorldState[];
}

export interface WorldStateAuthority {
  readonly size: number;
  getSimulationState(): SimulationState;
  getCausalLedger(): SimulationCausalLedger;
  queryCausalLedger(query: SimulationCausalLedgerQuery): SimulationCausalLedgerQueryResult;
  getWorldStateSnapshot(): ChapterWorldState[];
  buildSimulationPromptContext(options: SimulationAdapterOptions): string;
  formatForWriter(chapterNumber: number): string;
  formatScenePlacement(chapterNumber: number): string;
  formatAntiRepeatContext(chapterNumber: number): string;
  getPreviousCharacterStates(chapterNumber: number): ExtractedCharacterState[] | undefined;
  getCurrentFacts(): WorldFact[];
  getAudienceKnownFacts(chapterNumber: number): RevealedFact[];
  formatAudienceKnowledge(chapterNumber: number): string;
  formatRelationshipContext(chapterNumber: number, sceneCharacterNames: string[]): string;
  formatCharacterVisibility(chapterNumber: number, sceneCharacterNames: string[]): string;
  detectContradictions(newFacts: WorldFact[]): Array<{ existing: WorldFact; incoming: WorldFact; description: string }>;
  applyEvent(event: SimulationEvent): SimulationState;
  appendEventFast(event: SimulationEvent): SimulationState;
  applyDialogueScene(input: GeneratedDialogueSceneInput): DialogueSceneWriteResult;
  recomputeBeliefsFromMemories(
    options: RecomputeCharacterBeliefsFromMemoriesOptions,
  ): RecomputeCharacterBeliefsFromMemoriesResult;
  reconcileContinuityArtifacts(
    ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
    plan: RetroactiveCorrectionPlan | Pick<RetroactiveCorrectionPlan, "replayScope">,
  ): ContinuityReconciliationReport;
  ingestNarrativeProjection(state: ChapterWorldState): void;
  ingestChapterState(state: ChapterWorldState): void;
}

export class SharedWorldStateAuthority implements WorldStateAuthority {
  private readonly ledger = new SimulationEventLedger();
  private readonly projection = new WorldStateManager();
  private state: SimulationState;

  constructor(
    seed: NovelSeed,
    snapshot?: WorldStateAuthoritySnapshot,
  ) {
    this.state = snapshot
      ? cloneValue(snapshot.simulationState)
      : createSimulationState(seed);
    this.state.beliefInterpretations = ensureCharacterBeliefInterpretationStore(
      this.state.beliefInterpretations,
      Object.keys(this.state.characters),
    );

    for (const chapterState of snapshot?.worldStateProjection ?? []) {
      this.projection.addChapterState(cloneValue(chapterState));
    }
  }

  get size(): number {
    return this.projection.size;
  }

  getSimulationState(): SimulationState {
    return this.state;
  }

  getCausalLedger(): SimulationCausalLedger {
    return buildSimulationCausalLedger(this.state.eventLog);
  }

  queryCausalLedger(query: SimulationCausalLedgerQuery): SimulationCausalLedgerQueryResult {
    return querySimulationCausalLedger(this.state.eventLog, query);
  }

  getWorldStateSnapshot(): ChapterWorldState[] {
    return this.projection.toJSON();
  }

  buildSimulationPromptContext(options: SimulationAdapterOptions): string {
    return buildSimulationPromptContext(this.state, options);
  }

  formatForWriter(chapterNumber: number): string {
    const canonicalBlock = buildSimulationPromptContext(this.state, {
      chapterNumber,
      maxFacts: 20,
      maxKnowledge: 10,
      maxEvents: 8,
    });
    const projectionBlock = this.projection.formatForWriter(chapterNumber);

    if (this.projection.size === 0) {
      return canonicalBlock;
    }

    return [
      canonicalBlock,
      "### Read-Only Narrative Projection",
      "아래 블록은 이미 생성된 대사/서술에서 추출한 연속성 참고 정보입니다.",
      "이 정보는 읽기 전용이며, 객관 사실이나 캐릭터 상태를 덮어쓰는 권한이 없습니다.",
      projectionBlock,
    ].join("\n\n");
  }

  formatScenePlacement(chapterNumber: number): string {
    return this.projection.formatScenePlacement(chapterNumber);
  }

  formatAntiRepeatContext(chapterNumber: number): string {
    return this.projection.formatAntiRepeatContext(chapterNumber);
  }

  getPreviousCharacterStates(chapterNumber: number): ExtractedCharacterState[] | undefined {
    return this.projection.getPreviousCharacterStates(chapterNumber);
  }

  getCurrentFacts(): WorldFact[] {
    return this.projection.getCurrentFacts();
  }

  getAudienceKnownFacts(chapterNumber: number): RevealedFact[] {
    return this.projection.getAudienceKnownFacts(chapterNumber);
  }

  formatAudienceKnowledge(chapterNumber: number): string {
    return this.projection.formatAudienceKnowledge(chapterNumber);
  }

  formatRelationshipContext(chapterNumber: number, sceneCharacterNames: string[]): string {
    return this.projection.formatRelationshipContext(chapterNumber, sceneCharacterNames);
  }

  formatCharacterVisibility(chapterNumber: number, sceneCharacterNames: string[]): string {
    return this.projection.formatCharacterVisibility(chapterNumber, sceneCharacterNames);
  }

  detectContradictions(newFacts: WorldFact[]): Array<{ existing: WorldFact; incoming: WorldFact; description: string }> {
    return this.projection.detectContradictions(newFacts);
  }

  applyEvent(event: SimulationEvent): SimulationState {
    this.state = this.ledger.applyEvent(this.state, event);
    return this.state;
  }

  appendEventFast(event: SimulationEvent): SimulationState {
    this.state.chapterCursor = Math.max(this.state.chapterCursor, event.chapter);
    this.state.eventLog.push(event);
    return this.state;
  }

  applyDialogueScene(input: GeneratedDialogueSceneInput): DialogueSceneWriteResult {
    return applyGeneratedDialogueScene(this.state, input);
  }

  recomputeBeliefsFromMemories(
    options: RecomputeCharacterBeliefsFromMemoriesOptions,
  ): RecomputeCharacterBeliefsFromMemoriesResult {
    const { state, ...result } = recomputeSimulationBeliefsFromMemories(this.state, options);
    this.state = state;
    return result;
  }

  reconcileContinuityArtifacts(
    ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
    plan: RetroactiveCorrectionPlan | Pick<RetroactiveCorrectionPlan, "replayScope">,
  ): ContinuityReconciliationReport {
    const result = reconcileSimulationContinuityArtifacts(this.state, ledger, plan);
    this.state = result.state;
    return result.report;
  }

  ingestNarrativeProjection(chapterState: ChapterWorldState): void {
    this.projection.addChapterState(chapterState);
  }

  ingestChapterState(chapterState: ChapterWorldState): void {
    this.ingestNarrativeProjection(chapterState);
  }
}

export function createWorldStateAuthority(seed: NovelSeed): WorldStateAuthority {
  return new SharedWorldStateAuthority(seed);
}

export function createWorldStateAuthorityFromSnapshot(
  seed: NovelSeed,
  snapshot: WorldStateAuthoritySnapshot,
): WorldStateAuthority {
  return new SharedWorldStateAuthority(seed, snapshot);
}
