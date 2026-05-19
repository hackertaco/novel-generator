import { ChapterSummarySchema, type ChapterSummary } from "@/lib/schema/chapter";
import {
  getArcForChapter,
  type NovelSeed,
  type PlotPoint,
} from "@/lib/schema/novel";

import {
  buildSimulationCausalLedger,
  validateMajorPlotActionLedger,
  type MajorPlotActionLedgerValidation,
  type SimulationCausalLedger,
} from "./causal-ledger";
import {
  DialogueTurnSchema,
  SceneLogSchema,
  type DialogueSpeechAct,
  type DialogueTurn,
  type NarrativeDirectorPressure,
  type SceneLog,
  type ScenePurpose,
} from "./scene-log";
import {
  applyAgentBrainEvent,
  cloneAgentBrainState,
  createAgentBrainState,
  type AgentBrainState,
} from "./agent-brain-state";
import {
  compileActionLogsToSimulationEvents,
  runCharacterActionSimulation,
  type CharacterActionLog,
  type CharacterActionSimulationDiagnostics,
  type InteractionResolution,
  type SimulationClock,
} from "./character-action-sim";
import {
  createWorldStateAuthority,
  createWorldStateAuthorityFromSnapshot,
  type WorldStateAuthority,
  type WorldStateAuthoritySnapshot,
} from "./world-state-authority";
import {
  buildWorldBrainFromSeed,
  summarizeWorldBrain,
  type CharacterMind,
  type WorldBrain,
  type WorldBrainActionEconomics,
  type WorldBrainKnowledgeFlow,
  type WorldBrainPlanTransition,
  WorldBrainActionEconomicsSchema,
  WorldBrainKnowledgeFlowSchema,
  WorldBrainPlanTransitionSchema,
} from "./world-brain";
import type { SimulationEvent, SimulationState } from "./types";
import { buildGenreConventionEvents } from "./genre-convention";

interface CharacterActionDecision {
  beat: string;
  cause: string;
  consequence: string;
  beliefSubject: string;
  belief: string;
  confidence: "low" | "medium" | "high";
  decisionMode: string;
}

export interface RuntimeMindState {
  characterId: string;
  currentPlan: string;
  knownFacts: string[];
  recentMemorySummaries: string[];
  recentVisibleBehaviors: string[];
  recentUtterances: string[];
  reflectionNotes: string[];
  proceduralMemory: string[];
  actionFatigueByType: Record<string, number>;
  agentBrainState: AgentBrainState;
  trustDeltasByCharacter: Record<string, number>;
}

export interface WorldModelRunCheckpoint {
  worldStateAuthority: WorldStateAuthoritySnapshot;
  runtimeMindStates: Record<string, RuntimeMindState>;
  previousEvent?: SimulationEvent;
}

export interface WorldModelRunOptions {
  startChapter?: number;
  endChapter?: number;
  maxBeatsPerChapter?: number;
  characterActionsPerChapter?: number;
  enableWorldBrainActions?: boolean;
  characterSimulationMode?: "legacy" | "agent_ticks";
  initialCheckpoint?: WorldModelRunCheckpoint;
  skipRenderedChapters?: boolean;
  fastLedgerValidation?: boolean;
  fastEventApplication?: boolean;
}

export interface WorldModelRenderedChapter {
  chapterNumber: number;
  title: string;
  text: string;
  sourceEventIds: string[];
  sceneLog: SceneLog;
  summary: ChapterSummary;
}

export interface WorldModelRunReport {
  mode: "simulation_first_world_model";
  title: string;
  startChapter: number;
  endChapter: number;
  generatedChapterCount: number;
  generatedEventCount: number;
  worldBrain: {
    characterMindCount: number;
    characterActionEventCount: number;
    narrativeDirectorPressureCount: number;
    sceneLogCount: number;
    dialogueTurnCount: number;
    runtimeMindStateCount: number;
    runtimeContinuity: {
      planCarryoverEventCount: number;
      charactersWithNewKnowledge: number;
      charactersWithTrustDeltas: number;
    };
    agentActionSimulation: {
      mode: "legacy" | "agent_ticks";
      actionLogCount: number;
      interactionResolutionCount: number;
      reactionCoverage: number;
      memoryUpdateRate: number;
    };
  };
  rendererSourceCoverage: {
    renderedChapterCount: number;
    chaptersWithSourceEvents: number;
    sourceBackedChapterRatio: number;
  };
  validation: MajorPlotActionLedgerValidation;
  costUsd: 0;
}

export interface WorldModelRunResult {
  seed: NovelSeed;
  brain: WorldBrain;
  state: SimulationState;
  ledger: SimulationCausalLedger;
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  interactionResolutions: InteractionResolution[];
  simulationClocks: SimulationClock[];
  simulationDiagnostics: CharacterActionSimulationDiagnostics[];
  runtimeMindStates: Record<string, RuntimeMindState>;
  checkpoint: WorldModelRunCheckpoint;
  chapters: WorldModelRenderedChapter[];
  report: WorldModelRunReport;
}

function padChapter(chapter: number): string {
  return String(chapter).padStart(3, "0");
}

function validateLedgerLight(events: ReadonlyArray<SimulationEvent>): MajorPlotActionLedgerValidation {
  const issues: MajorPlotActionLedgerValidation["issues"] = [];
  let previous: SimulationEvent | undefined;

  for (const event of events) {
    const episode = event.episode ?? 0;
    const previousEpisode = previous?.episode ?? 0;
    if (previous && episode < previousEpisode) {
      issues.push({
        code: "episode_order_violation",
        eventId: event.id,
        chapter: Math.max(1, episode),
        episode: Math.max(1, episode),
        message: `Event "${event.id}" is out of chronology after "${previous.id}".`,
        referencedEventId: previous.id,
        field: "episode",
      });
      break;
    }
    previous = event;
  }

  const majorPlotActionCount = events.filter((event) =>
    event.type === "plot_action" || (event.tags ?? []).includes("major-plot-action")
  ).length;

  return {
    passed: issues.length === 0,
    majorPlotActionCount,
    issueCount: issues.length,
    issues,
  };
}

function buildLedgerLight(events: ReadonlyArray<SimulationEvent>): SimulationCausalLedger {
  return {
    version: "sim-causal-ledger.v1",
    events: events.map((event) => ({
      ...event,
      episode: event.episode ?? event.chapter,
    })),
  } as SimulationCausalLedger;
}

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function stableRunnerScore(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function chooseRunnerLine(lines: string[], key: string): string {
  return lines[Math.floor(stableRunnerScore(key) * lines.length)] ?? lines[0] ?? "";
}

function hasFinalConsonant(value: string): boolean {
  const char = value.trim().at(-1);
  if (!char) return false;
  const code = char.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

function topic(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "은" : "는"}`;
}

function subject(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "이" : "가"}`;
}

function object(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "을" : "를"}`;
}

function conjunction(left: string, right: string): string {
  return `${left}${hasFinalConsonant(left) ? "과" : "와"} ${right}`;
}

function companion(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "과" : "와"}`;
}

function instrumental(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "으로" : "로"}`;
}

interface LongArcWorldBeat {
  actKey: string;
  actLabel: string;
  eventClassKey: string;
  eventClassLabel: string;
  incidentKey: string;
  incidentLabel: string;
  locationAnchor: string;
  faction: string;
  evidence: string;
  symbolicObject: string;
  targetScenePurpose: ScenePurpose;
  pressureType: NarrativeDirectorPressure["type"];
  stakes: string;
}

function selectFromPool<T>(values: T[], chapter: number, salt = 0): T | undefined {
  if (values.length === 0) return undefined;
  return values[Math.abs((chapter - 1 + salt) % values.length)];
}

function expandedWorldLocationAnchors(seed: NovelSeed): string[] {
  const baseLocations = Object.keys(seed.world.key_locations ?? {});
  if (baseLocations.length === 0) return [seed.world.name];

  const zonesByLocation: Record<string, string[]> = {
    "크레센트 공작가": ["응접실", "문서 보관실", "하인 통로", "뒤뜰 회랑", "가문 예배실", "임시 심문실"],
    "황궁 아우레아": ["문서실", "동쪽 접견실", "서명 대기실", "기록 감사실", "의례 준비실", "외교 회랑"],
    "마법탑 알카나": ["마력 기록석실", "출입 결계실", "별자리 관측실", "금서 서고", "봉인 갱신실", "실험 회랑"],
    "라벤더 별궁": ["밤 경비 초소", "온실 회랑", "하인 명단실", "향료 창고", "별관 침실", "작은 연회실"],
  };

  return baseLocations.flatMap((baseLocation) => {
    const zones = zonesByLocation[baseLocation] ?? ["정문", "응접실", "기록실", "회랑"];
    return zones.map((zone) => `${baseLocation} ${zone}`);
  });
}

function longArcActForChapter(chapter: number): Pick<LongArcWorldBeat, "actKey" | "actLabel" | "stakes"> {
  if (chapter <= 60) {
    return {
      actKey: "evidence-foundation",
      actLabel: "증거 기반 구축",
      stakes: "사적인 의심이 기록 가능한 단서로 바뀌기 시작한다",
    };
  }
  if (chapter <= 120) {
    return {
      actKey: "alliance-realignment",
      actLabel: "동맹 재편",
      stakes: "누가 어느 편인지가 공적 절차와 사적 거래 사이에서 갈라진다",
    };
  }
  if (chapter <= 180) {
    return {
      actKey: "countermove-execution",
      actLabel: "반격 실행",
      stakes: "숨겨 둔 증거를 실제 권력 이동으로 바꾸는 선택이 필요하다",
    };
  }
  if (chapter <= 240) {
    return {
      actKey: "public-exposure",
      actLabel: "공개 노출",
      stakes: "비밀이 공개 기록으로 올라가기 전에 마지막 조작이 벌어진다",
    };
  }
  return {
    actKey: "power-settlement",
    actLabel: "권력 정산",
    stakes: "쌓인 증언과 관계 부채가 최종 책임 소재를 가른다",
  };
}

function longArcWorldBeatForChapter(seed: NovelSeed, chapter: number): LongArcWorldBeat {
  const act = longArcActForChapter(chapter);
  const eventClasses = [
    { key: "status-reframe", label: "판세 재정의", pressureType: "environment_event" as const, purpose: "establish_state" as const },
    { key: "access-lockdown", label: "출입 봉쇄", pressureType: "constraint" as const, purpose: "information_discovery" as const },
    { key: "witness-split", label: "증언 분기", pressureType: "rumor" as const, purpose: "relationship_probe" as const },
    { key: "record-audit", label: "기록 감사", pressureType: "deadline" as const, purpose: "secret_pressure" as const },
    { key: "faction-bargain", label: "파벌 거래", pressureType: "resource_scarcity" as const, purpose: "advance_plot" as const },
    { key: "omen-return", label: "징후 재출현", pressureType: "rumor" as const, purpose: "foreshadowing" as const },
    { key: "scene-aftermath", label: "후폭풍 정리", pressureType: "environment_event" as const, purpose: "aftermath" as const },
  ];
  const incidentMilestones = [
    { key: "audit-start", label: "비공개 감사 착수" },
    { key: "witness-disappearance", label: "핵심 증인 이탈" },
    { key: "seal-contest", label: "봉인 권한 쟁탈" },
    { key: "faction-defection", label: "파벌 이탈" },
    { key: "public-hearing", label: "공개 청문 준비" },
    { key: "succession-claim", label: "계승권 주장 충돌" },
    { key: "debt-reckoning", label: "관계 부채 정산" },
    { key: "final-record-lock", label: "최종 기록 봉인" },
  ];
  const eventClass = selectFromPool(eventClasses, chapter, chapter <= 200 ? 0 : 2) ?? eventClasses[0];
  const incident = selectFromPool(incidentMilestones, chapter, Math.floor(chapter / 20)) ?? incidentMilestones[0];
  const locations = expandedWorldLocationAnchors(seed);
  const symbolicObjects = (seed.world.symbolic_objects ?? [])
    .map((item) => item.name)
    .filter(Boolean);
  const evidencePool = [
    ...(seed.world.evidence_classes?.medium ?? []),
    ...(seed.world.evidence_classes?.strong ?? []),
    ...(seed.world.evidence_classes?.weak ?? []),
  ].filter(Boolean);
  const factionNames = Object.keys(seed.world.factions ?? {});

  return {
    ...act,
    eventClassKey: eventClass.key,
    eventClassLabel: eventClass.label,
    incidentKey: incident.key,
    incidentLabel: incident.label,
    locationAnchor: selectFromPool(locations, chapter, Math.floor(chapter / 8)) ?? seed.world.name,
    faction: selectFromPool(factionNames, chapter, Math.floor(chapter / 9)) ?? "궁정 세력",
    evidence: selectFromPool(evidencePool, chapter, Math.floor(chapter / 7)) ?? "목격담",
    symbolicObject: selectFromPool(symbolicObjects, chapter, Math.floor(chapter / 5)) ?? "숨겨진 단서",
    targetScenePurpose: eventClass.purpose,
    pressureType: eventClass.pressureType,
  };
}

function longArcThreadIdsForChapter(seed: NovelSeed, chapter: number): string[] {
  const beat = longArcWorldBeatForChapter(seed, chapter);
  return [
    `long-arc:${beat.actKey}`,
    `event-class:${beat.eventClassKey}`,
    `incident:${beat.incidentKey}`,
  ];
}

function fallbackChapterOneLiner(seed: NovelSeed, chapter: number): string {
  const arcBeat = longArcWorldBeatForChapter(seed, chapter);
  const location = arcBeat.locationAnchor;
  const anchor = arcBeat.symbolicObject;
  const evidence = arcBeat.evidence;
  const faction = arcBeat.faction;
  const purpose = targetScenePurposeForChapter(chapter, 5, arcBeat);
  const variantsByPurpose: Record<ScenePurpose, string[]> = {
    establish_state: [
      `${location}의 ${arcBeat.eventClassLabel} 때문에 ${arcBeat.incidentLabel}의 판세와 ${evidence}의 의미가 새로 정리된다.`,
    ],
    information_discovery: [
      `${location}에서 ${subject(conjunction(anchor, evidence))} 서로 맞지 않아 ${arcBeat.actLabel}의 다음 확인 순서가 흔들린다.`,
      `${anchor} 주변의 작은 불일치가 ${instrumental(evidence)} 이어져 ${arcBeat.stakes}.`,
    ],
    relationship_probe: [
      `${location}에서 ${faction}의 시선이 엇갈리며 ${arcBeat.actLabel} 국면의 동맹과 의심이 다시 시험대에 오른다.`,
      `${anchor} 앞에서 인물들은 서로의 편인지 적인지 확인해야 하는 자리에 놓인다.`,
    ],
    secret_pressure: [
      `${subject(evidence)} 공개되기 전에 ${anchor}의 출처를 숨기거나 먼저 장악해야 한다.`,
      `${location}에 남은 흔적이 비밀을 건드려 누가 무엇을 알고 있는지가 장면의 핵심 조건이 된다.`,
    ],
    advance_plot: [
      `${location}의 접근권이 좁아지며 ${anchor}를 확보한 사람이 ${arcBeat.actLabel}의 주도권을 잡는다.`,
      `${faction}의 움직임 때문에 ${object(evidence)} 둘러싼 선택이 더는 미뤄질 수 없게 된다.`,
    ],
    foreshadowing: [
      `${location}에서 ${anchor}에 남은 작은 흔적이 ${arcBeat.incidentLabel} 뒤에 아직 닫히지 않은 사건을 가리킨다.`,
    ],
    aftermath: [
      `${location}에 남은 말과 침묵이 다음 장면의 의심, 기억, 관계 변화를 밀어 올린다.`,
      `${anchor}를 둘러싼 방금 전 선택의 여파가 각자의 기억과 계획에 다르게 남는다.`,
    ],
  };
  return chooseRunnerLine(
    variantsByPurpose[purpose],
    `fallback-frame:${chapter}:${arcBeat.actKey}:${arcBeat.eventClassKey}:${location}:${anchor}:${evidence}`,
  );
}

function agentRoleWeightForStoryRole(storyRole: string): number {
  if (storyRole.includes("안타고니스트")) return 4;
  if (storyRole.includes("조력")) return 3;
  if (storyRole.includes("악역")) return 3;
  if (storyRole.includes("남주")) return 2;
  if (storyRole.includes("라이벌")) return 2;
  if (storyRole.includes("주인공")) return 1;
  return 0;
}

function plotPointText(point: PlotPoint): string {
  if (typeof point === "string") {
    return normalizeText(point);
  }

  return normalizeText(point.what);
}

function plotPointCause(point: PlotPoint): string | undefined {
  if (typeof point === "string") {
    return undefined;
  }

  return normalizeText(point.caused_by || point.why || point.prerequisite) || undefined;
}

function plotPointConsequence(point: PlotPoint): string | undefined {
  if (typeof point === "string") {
    return undefined;
  }

  return normalizeText(point.consequence) || undefined;
}

function getChapterFrame(seed: NovelSeed, chapter: number): {
  title: string;
  oneLiner: string;
  keyPoints: string[];
  keyPointCauses: Array<string | undefined>;
  keyPointConsequences: Array<string | undefined>;
  characterIds: string[];
  tensionLevel: number;
  threadIds: string[];
} {
  const outline = seed.chapter_outlines.find((candidate) =>
    candidate.chapter_number === chapter
  );
  const extended = seed.extended_outlines.find((candidate) =>
    candidate.chapter_number === chapter
  );
  const arc = getArcForChapter(seed, chapter);

  const rawKeyPoints = outline?.key_points ?? [];
  const keyPoints = rawKeyPoints
    .map(plotPointText)
    .filter(Boolean);
  const fallbackPoint = outline?.one_liner
    ?? extended?.one_liner
    ?? arc?.summary
    ?? fallbackChapterOneLiner(seed, chapter);

  const introducedCharacters = seed.characters
    .filter((character) => character.introduction_chapter <= chapter)
    .map((character) => character.id);
  const outlineCharacters = (outline?.characters_involved ?? [])
    .filter((characterId) => introducedCharacters.includes(characterId));
  const characterIds = outlineCharacters.length > 0
    ? outlineCharacters
    : introducedCharacters.slice(0, Math.max(1, Math.min(3, introducedCharacters.length)));

  return {
    title: outline?.title ?? extended?.title ?? `${chapter}화`,
    oneLiner: outline?.one_liner ?? extended?.one_liner ?? fallbackPoint,
    keyPoints: keyPoints.length > 0 ? keyPoints : [fallbackPoint],
    keyPointCauses: rawKeyPoints.map(plotPointCause),
    keyPointConsequences: rawKeyPoints.map(plotPointConsequence),
    characterIds,
    tensionLevel: outline?.tension_level ?? 5,
    threadIds: uniqueCharacterIds([
      ...(outline?.advances_thread ?? extended?.reveals ?? []),
      ...longArcThreadIdsForChapter(seed, chapter),
    ]),
  };
}

function narrativeDirectorPressureForChapter(input: {
  seed: NovelSeed;
  chapter: number;
  title: string;
  oneLiner: string;
  tensionLevel: number;
  location: string;
  threadIds: string[];
}): NarrativeDirectorPressure {
  const arcBeat = longArcWorldBeatForChapter(input.seed, input.chapter);
  const targetScenePurpose = targetScenePurposeForChapter(input.chapter, input.tensionLevel, arcBeat);
  const type: NarrativeDirectorPressure["type"] = input.tensionLevel >= 8
    ? "deadline"
    : arcBeat.pressureType;
  const locationAnchor = input.location.includes("황궁")
    ? "황궁 문서실과 접견 일정"
    : input.location.includes("마법") || input.location.includes("탑")
      ? "마력 기록석과 출입 결계"
      : input.location.includes("별궁")
        ? "별궁 하인 명단과 밤 경비"
        : input.location.includes("공작")
          ? "공작가 사용인 동선과 응접실 배치"
          : `${input.location}의 출입 기록`;
  const concretePressureByType: Record<NarrativeDirectorPressure["type"], string[]> = {
    environment_event: [
      `${arcBeat.eventClassLabel}의 여파로 ${subject(locationAnchor)} 새벽에 바뀌어 같은 증언의 위치가 어긋난다`,
      `${input.location}의 조명과 문 배치가 바뀌어 ${arcBeat.symbolicObject}에 숨겨 둔 표식이 드러난다`,
    ],
    constraint: [
      `${arcBeat.actLabel} 국면에서 ${subject(locationAnchor)} 상급자 명령으로 봉쇄되어 인물들이 우회 명분을 찾아야 한다`,
      `${input.location}에 외부 증인이 들어와 ${object(arcBeat.evidence)} 둘러싼 사적인 질문을 공개 발언으로 바꿔 버린다`,
    ],
    opportunity: [
      `${locationAnchor} 사이에 한 시각만 비는 틈이 생겨 ${companion(arcBeat.symbolicObject)} 연결된 기록을 확인할 수 있다`,
      `${input.location}의 감시자가 교대하며 서로 다른 인물이 ${object(arcBeat.evidence)} 같은 장소에서 보게 된다`,
    ],
    deadline: [
      `${subject(input.title)} 끝나기 전까지 ${arcBeat.faction}의 서명이 넘어가면 접근권이 영구히 닫힌다`,
      `${input.location}의 봉인 갱신 시간이 다가와 지금 확인하지 못한 ${topic(arcBeat.evidence)} 다음 장면으로 넘어간다`,
    ],
    rumor: [
      `${input.location}에 '${arcBeat.faction}이 밤에 기록을 옮겼다'는 소문이 퍼져 관계자들이 서로를 먼저 의심한다`,
      `${input.location}의 하인이 서로 다른 이름을 말하며 ${conjunction(arcBeat.evidence, "거짓 증언")}이 섞인다`,
    ],
    resource_scarcity: [
      `${object(locationAnchor)} 확인할 권한이 한 사람 몫만 남아 ${arcBeat.actLabel}의 동맹과 배신을 동시에 흔든다`,
      `${input.location}의 열쇠와 증인이 서로 다른 편에 묶여 ${conjunction(arcBeat.symbolicObject, arcBeat.evidence)} 중 하나만 얻을 수 있다`,
    ],
  };
  const concreteSummary = chooseRunnerLine(
    concretePressureByType[type],
    `director:${input.chapter}:${input.location}:${type}`,
  );
  const summaryByType: Record<NarrativeDirectorPressure["type"], string> = {
    environment_event: concreteSummary,
    constraint: concreteSummary,
    opportunity: concreteSummary,
    deadline: concreteSummary,
    rumor: concreteSummary,
    resource_scarcity: concreteSummary,
  };

  return {
    pressureId: `director_ch${padChapter(input.chapter)}_${type}`,
    targetScenePurpose,
    type,
    summary: summaryByType[type],
    targetThreadIds: uniqueCharacterIds([
      ...input.threadIds,
      ...longArcThreadIdsForChapter(input.seed, input.chapter),
    ]),
    source: "narrative_director",
  };
}

function targetScenePurposeForChapter(
  chapter: number,
  tensionLevel: number,
  arcBeat?: LongArcWorldBeat,
): ScenePurpose {
  if (arcBeat) {
    const purposesByAct: Record<string, ScenePurpose[]> = {
      "evidence-foundation": [
        "establish_state",
        "information_discovery",
        "relationship_probe",
        "secret_pressure",
        "information_discovery",
        "foreshadowing",
        "advance_plot",
      ],
      "alliance-realignment": [
        "relationship_probe",
        "advance_plot",
        "secret_pressure",
        "information_discovery",
        "relationship_probe",
        "aftermath",
        "advance_plot",
      ],
      "countermove-execution": [
        "advance_plot",
        "secret_pressure",
        "information_discovery",
        "relationship_probe",
        "advance_plot",
        "aftermath",
        "foreshadowing",
      ],
      "public-exposure": [
        "secret_pressure",
        "advance_plot",
        "relationship_probe",
        "information_discovery",
        "aftermath",
        "secret_pressure",
        "advance_plot",
      ],
      "power-settlement": [
        "aftermath",
        "advance_plot",
        "relationship_probe",
        "secret_pressure",
        "information_discovery",
        "aftermath",
        "foreshadowing",
      ],
    };
    const candidatePurposes = purposesByAct[arcBeat.actKey] ?? [
      arcBeat.targetScenePurpose,
      "information_discovery",
      "relationship_probe",
      "secret_pressure",
      "advance_plot",
      "aftermath",
    ];
    const longArcOffset = Math.floor(chapter / 11);
    const selectedPurpose = candidatePurposes[(chapter - 1 + longArcOffset) % candidatePurposes.length] ?? "";
    return selectedPurpose || arcBeat.targetScenePurpose;
  }
  if (tensionLevel >= 8) return "advance_plot";
  const cadence: ScenePurpose[] = [
    "establish_state",
    "information_discovery",
    "relationship_probe",
    "secret_pressure",
    "advance_plot",
    "foreshadowing",
    "aftermath",
  ];
  return cadence[(chapter - 1) % cadence.length] ?? "advance_plot";
}

function buildNarrativeDirectorPressureEvent(input: {
  pressure: NarrativeDirectorPressure;
  chapter: number;
  sequence: number;
  location: string;
  previousEvent?: SimulationEvent;
}): SimulationEvent {
  const eventId = `evt_world_ch${padChapter(input.chapter)}_director_pressure`;
  const changeId = `${eventId}:world-condition`;
  return {
    id: eventId,
    chapter: input.chapter,
    episode: input.chapter,
    sequence: input.sequence,
    sceneId: `world_scene_${padChapter(input.chapter)}_director`,
    type: "status_change",
    location: input.location,
    summary: input.pressure.summary,
    prerequisites: input.previousEvent
      ? [{
        prerequisiteId: `prior-event:${input.previousEvent.id}`,
        type: "event",
        description: input.previousEvent.summary,
        eventId: input.previousEvent.id,
        stateKey: `event:${input.previousEvent.id}`,
      }]
      : [],
    involvedEntities: [{
      entityId: `location:${input.location}`,
      entityType: "location",
      role: "location",
      label: input.location,
    }],
    stateChanges: [{
      changeId,
      domain: "world_model",
      operation: "record",
      stateKey: `narrative-director:${input.pressure.pressureId}`,
      summary: input.pressure.summary,
      entityIds: [input.location, ...input.pressure.targetThreadIds],
      afterValue: input.pressure,
    }],
    outcomes: [{
      outcomeId: `${eventId}:pressure-available`,
      type: "objective_fact_created",
      summary: `Narrative pressure available as world condition: ${input.pressure.summary}`,
      stateChangeIds: [changeId],
    }],
    tags: [
      "world-model:first",
      "simulation-first",
      "narrative-director",
      "world-pressure",
      `director-pressure:${input.pressure.type}`,
      ...input.pressure.targetThreadIds.map((threadId) => `thread:${threadId}`),
    ],
    payload: {
      source: "narrative_director",
      pressure: input.pressure,
      directorOutputType: "world_condition",
      actorActionForced: false,
      leadsTo: input.pressure.summary,
      visibility: "audience",
    },
  };
}

function introducedCharacterIdsForChapter(seed: NovelSeed, chapter: number): string[] {
  return seed.characters
    .filter((character) => character.introduction_chapter <= chapter)
    .map((character) => character.id);
}

function selectLowActivityPriorityCharacterIds(input: {
  seed: NovelSeed;
  brain: WorldBrain;
  chapter: number;
  baseCharacterIds: string[];
  cumulativeActionCounts: Map<string, number>;
  maxPriorityCount?: number;
}): string[] {
  const baseIds = new Set(input.baseCharacterIds);
  const maxPriorityCount = input.maxPriorityCount ?? 2;

  return introducedCharacterIdsForChapter(input.seed, input.chapter)
    .filter((characterId) => !baseIds.has(characterId))
    .filter((characterId) => Boolean(input.brain.characterMinds[characterId]))
    .map((characterId) => {
      const mind = input.brain.characterMinds[characterId];
      const role = mind ? agentRoleWeightForStoryRole(mind.role) : 0;
      return {
        characterId,
        count: input.cumulativeActionCounts.get(characterId) ?? 0,
        role,
        stable: stableRunnerScore(`priority:${input.chapter}:${characterId}`),
      };
    })
    .sort((left, right) =>
      left.count - right.count
      || right.role - left.role
      || left.stable - right.stable
    )
    .slice(0, maxPriorityCount)
    .map((item) => item.characterId);
}

function resolveLocation(seed: NovelSeed, chapter: number): string {
  return longArcWorldBeatForChapter(seed, chapter).locationAnchor;
}

function characterName(authority: WorldStateAuthority, characterId: string): string {
  return authority.getSimulationState().characters[characterId]?.name ?? characterId;
}

function characterNameFromEvent(event: SimulationEvent, characterId: string): string {
  return event.involvedEntities?.find((entity) =>
    entity.entityType === "character" && entity.entityId === characterId
  )?.label ?? characterId;
}

function uniqueCharacterIds(characterIds: string[]): string[] {
  return Array.from(new Set(characterIds.filter(Boolean)));
}

function clampTrustLevel(value: number): -2 | -1 | 0 | 1 | 2 {
  if (value <= -2) return -2;
  if (value >= 2) return 2;
  return value as -2 | -1 | 0 | 1 | 2;
}

function createRuntimeMindStates(brain: WorldBrain): Record<string, RuntimeMindState> {
  return Object.fromEntries(
    Object.values(brain.characterMinds).map((mind) => [
      mind.characterId,
      {
        characterId: mind.characterId,
        currentPlan: mind.currentPlan,
        knownFacts: [...mind.knownFacts],
        recentMemorySummaries: [...mind.memorySeeds.slice(-5)],
	        recentVisibleBehaviors: [],
	        recentUtterances: [],
	        reflectionNotes: [],
	        proceduralMemory: [],
	        actionFatigueByType: {},
	        agentBrainState: createAgentBrainState({
	          characterId: mind.characterId,
	          currentPlan: mind.currentPlan,
	          surfaceGoal: mind.desires.surfaceGoal,
	          hiddenGoal: mind.desires.hiddenGoal,
	          need: mind.desires.need,
	          fears: mind.fears,
	          taboos: mind.taboos,
	          knownFacts: mind.knownFacts,
	          memorySeeds: mind.memorySeeds,
	          trustByCharacter: Object.fromEntries(
	            Object.entries(mind.relationshipModel).map(([targetId, relationship]) => [
	              targetId,
	              relationship.trustLevel,
	            ]),
	          ),
	        }),
	        trustDeltasByCharacter: {},
	      },
	    ]),
  );
}

function cloneRuntimeMindStates(
  runtimeMindStates: Record<string, RuntimeMindState>,
): Record<string, RuntimeMindState> {
  return Object.fromEntries(
    Object.entries(runtimeMindStates).map(([characterId, runtime]) => [
      characterId,
      {
        characterId: runtime.characterId,
        currentPlan: runtime.currentPlan,
        knownFacts: [...runtime.knownFacts],
        recentMemorySummaries: [...runtime.recentMemorySummaries],
        recentVisibleBehaviors: [...(runtime.recentVisibleBehaviors ?? [])],
        recentUtterances: [...(runtime.recentUtterances ?? [])],
	        reflectionNotes: [...(runtime.reflectionNotes ?? [])],
	        proceduralMemory: [...(runtime.proceduralMemory ?? [])],
	        actionFatigueByType: { ...(runtime.actionFatigueByType ?? {}) },
	        agentBrainState: runtime.agentBrainState
	          ? cloneAgentBrainState(runtime.agentBrainState)
	          : createAgentBrainState({
	            characterId: runtime.characterId,
	            currentPlan: runtime.currentPlan,
	            surfaceGoal: runtime.currentPlan,
	            hiddenGoal: runtime.currentPlan,
	            need: runtime.currentPlan,
	            fears: [],
	            taboos: [],
	            knownFacts: runtime.knownFacts,
	            memorySeeds: runtime.recentMemorySummaries,
	            trustByCharacter: runtime.trustDeltasByCharacter,
	          }),
	        trustDeltasByCharacter: { ...runtime.trustDeltasByCharacter },
	      },
	    ]),
  );
}

function withRuntimeMindState(
  mind: CharacterMind,
  runtimeMindState: RuntimeMindState | undefined,
): CharacterMind {
  if (!runtimeMindState) {
    return mind;
  }

  return {
    ...mind,
    currentPlan: runtimeMindState.currentPlan,
    knownFacts: compactForRunner([
      ...mind.knownFacts,
	      ...runtimeMindState.knownFacts,
	      ...runtimeMindState.recentMemorySummaries,
	      ...runtimeMindState.reflectionNotes,
	      ...runtimeMindState.proceduralMemory,
	      ...runtimeMindState.agentBrainState.beliefStore.knownFacts,
	      ...runtimeMindState.agentBrainState.memoryStore.semanticMemory,
	      ...runtimeMindState.agentBrainState.memoryStore.proceduralMemory,
	    ]),
    relationshipModel: Object.fromEntries(
      Object.entries(mind.relationshipModel).map(([targetId, relationship]) => {
        const trustDelta = runtimeMindState.trustDeltasByCharacter[targetId] ?? 0;
        return [
          targetId,
          {
            ...relationship,
            trustLevel: clampTrustLevel(relationship.trustLevel + trustDelta),
          },
        ];
      }),
    ),
  };
}

function buildPrerequisites(
  authority: WorldStateAuthority,
  eventId: string,
  actorId: string,
  previousEvent: SimulationEvent | undefined,
): SimulationEvent["prerequisites"] {
  if (previousEvent) {
    return [{
      prerequisiteId: `prior-event:${previousEvent.id}`,
      type: "event",
      description: previousEvent.summary,
      eventId: previousEvent.id,
      stateKey: `event:${previousEvent.id}`,
    }];
  }

  const actor = authority.getSimulationState().characters[actorId];
  return [{
    prerequisiteId: `${eventId}:actor-exists`,
    type: "scene_state",
    description: `${actor?.name ?? actorId} exists before the simulated beat.`,
    entityId: actorId,
    stateKey: `character:${actorId}`,
  }];
}

function buildWorldEvent(input: {
  seed: NovelSeed;
  authority: WorldStateAuthority;
  chapter: number;
  beatIndex: number;
  title: string;
  beat: string;
  cause?: string;
  consequence?: string;
  characterIds: string[];
  location: string;
  previousEvent?: SimulationEvent;
  threadIds: string[];
}): SimulationEvent {
  const actorId = input.characterIds[0] ?? input.seed.characters[0]?.id ?? "narrator";
  const targetId = input.characterIds.find((characterId) => characterId !== actorId);
  const eventId = `evt_world_ch${padChapter(input.chapter)}_b${String(input.beatIndex + 1).padStart(2, "0")}`;
  const sceneId = `world_scene_${padChapter(input.chapter)}_${String(input.beatIndex + 1).padStart(2, "0")}`;
  const actorName = characterName(input.authority, actorId);
  const targetName = targetId ? characterName(input.authority, targetId) : undefined;
  const canonicalFact = targetName
    ? `${subject(actorName)} ${targetName} 앞에서 ${input.beat}`
    : `${subject(actorName)} ${input.beat}`;
  const triggeredBy = input.cause
    ?? input.previousEvent?.summary
    ?? `${input.chapter}화 "${input.title}"의 시뮬레이션 시작 조건`;
  const leadsTo = input.consequence
    ?? `${input.chapter}화 다음 시뮬레이션 비트로 이어진다`;

  return {
    id: eventId,
    chapter: input.chapter,
    episode: input.chapter,
    sequence: input.beatIndex + 1,
    sceneId,
    type: "plot_action",
    actorId,
    targetId,
    location: input.location,
    summary: input.beat,
    prerequisites: buildPrerequisites(
      input.authority,
      eventId,
      actorId,
      input.previousEvent,
    ),
    involvedEntities: input.characterIds.map((characterId) => ({
      entityId: characterId,
      entityType: "character" as const,
      role: characterId === actorId
        ? "actor" as const
        : characterId === targetId
          ? "target" as const
          : "witness" as const,
      label: characterName(input.authority, characterId),
    })),
    tags: [
      "world-model:first",
      "simulation-first",
      "renderer-source",
      "major-plot-action",
      ...input.threadIds.map((threadId) => `thread:${threadId}`),
    ],
    payload: {
      source: "world_model_simulation",
      subject: canonicalFact,
      predicate: "advances_plot",
      object: input.beat,
      canonicalFact,
      canonicalSummary: input.beat,
      triggeredBy,
      leadsTo,
      visibility: "audience",
      sceneCharacterIds: input.characterIds,
      threadIds: input.threadIds,
      rendererDirective:
        "Renderer must only dramatize this simulated event and must not introduce unsourced plot turns.",
    },
    cognition: {
      memoryUpdates: input.characterIds.map((characterId) => ({
        characterId,
        kind: "direct_experience",
        summary: input.beat,
        location: input.location,
        relatedCharacterIds: input.characterIds.filter((candidate) =>
          candidate !== characterId
        ),
        tags: ["world-model:first"],
      })),
      beliefUpdates: [],
    },
  };
}

function buildForeshadowEvent(input: {
  seed: NovelSeed;
  authority: WorldStateAuthority;
  chapter: number;
  beatIndex: number;
  characterIds: string[];
  location: string;
  previousEvent?: SimulationEvent;
}): SimulationEvent[] {
  const actions = scheduledForeshadowingActions(input.seed, input.chapter);
  return actions.map(({ foreshadowing, action }, index) => {
    const name = normalizeText(foreshadowing.name) || foreshadowing.id;
    const beat = `[${action}] ${name}: ${foreshadowing.description}`;
    const event = buildWorldEvent({
      seed: input.seed,
      authority: input.authority,
      chapter: input.chapter,
      beatIndex: input.beatIndex + index,
      title: `${input.chapter}화 복선`,
      beat,
      cause: `${foreshadowing.id} scheduled ${action} at chapter ${input.chapter}`,
      consequence: action === "reveal"
        ? `${name} 복선이 회수된다`
        : `${name} 복선이 이후 회수 후보로 유지된다`,
      characterIds: input.characterIds,
      location: input.location,
      previousEvent: index === 0 ? input.previousEvent : undefined,
      threadIds: [],
    });

    return {
      ...event,
      id: `${event.id}_fs_${foreshadowing.id}`,
      tags: [
        ...(event.tags ?? []),
        "foreshadowing",
        `foreshadow:${foreshadowing.id}`,
      ],
      payload: {
        ...(event.payload ?? {}),
        foreshadowingTouched: [{
          foreshadowingId: foreshadowing.id,
          action,
          context: beat,
        }],
      },
    };
  });
}

function scheduledForeshadowingActions(
  seed: NovelSeed,
  chapter: number,
): Array<{ foreshadowing: NovelSeed["foreshadowing"][number]; action: "plant" | "hint" | "reveal" }> {
  const actions: Array<{ foreshadowing: NovelSeed["foreshadowing"][number]; action: "plant" | "hint" | "reveal" }> = [];
  for (const foreshadowing of seed.foreshadowing) {
    if (foreshadowing.lifecycle === "intentionally_abandoned") continue;
    if (foreshadowing.planted_at === chapter) {
      actions.push({ foreshadowing, action: "plant" });
    }
    if (foreshadowing.hints_at.includes(chapter)) {
      actions.push({ foreshadowing, action: "hint" });
    }
    if (foreshadowing.reveal_at === chapter) {
      actions.push({ foreshadowing, action: "reveal" });
    }
  }
  return actions;
}

function pickActionTarget(input: {
  mind: CharacterMind;
  sceneCharacterIds: string[];
  actorId: string;
}): string | undefined {
  const sceneTargets = input.sceneCharacterIds.filter((characterId) =>
    characterId !== input.actorId
  );
  const relationshipTargets = Object.keys(input.mind.relationshipModel);

  return sceneTargets.find((characterId) =>
    relationshipTargets.includes(characterId)
  )
    ?? sceneTargets[0]
    ?? relationshipTargets[0];
}

function buildCharacterActionBeat(input: {
  mind: CharacterMind;
  authority: WorldStateAuthority;
  chapter: number;
  targetId?: string;
  chapterPressure: string;
}): CharacterActionDecision {
  const targetName = input.targetId
    ? characterName(input.authority, input.targetId)
    : undefined;
  const relationship = input.targetId
    ? input.mind.relationshipModel[input.targetId]
    : undefined;
  const distrust = relationship && relationship.trustLevel < 0;
  const trust = relationship && relationship.trustLevel > 0;
  const hasSecretPressure = input.mind.secrets.length > 0
    && input.chapter % 3 === 1;
  const hasAccessPressure = input.mind.access.accessRights.length > 0
    && input.chapter % 3 === 2;

  if (distrust && targetName) {
    return {
      beat: `${input.mind.name}: ${targetName}의 반응을 떠보며 숨은 목표 "${input.mind.desires.hiddenGoal}"에 필요한 단서를 찾는다`,
      cause: `${input.mind.name}의 숨은 목표(${input.mind.desires.hiddenGoal})와 ${targetName}에 대한 낮은 신뢰(${relationship.trustLevel})`,
      consequence: `${input.mind.name}의 ${targetName} 경계심이 강해지고, 관계 압력이 다음 장면으로 넘어간다`,
      beliefSubject: targetName,
      belief: `${topic(targetName)} 아직 믿을 수 없고 추가 확인이 필요하다`,
      confidence: "medium",
      decisionMode: "relationship_probe",
    };
  }

  if (trust && targetName) {
    return {
      beat: `${input.mind.name}: ${targetName}에게 조심스럽게 협력을 요청하며 겉목표 "${input.mind.desires.surfaceGoal}"를 계속 추진한다`,
      cause: `${targetName}에 대한 신뢰(${relationship.trustLevel})와 현재 겉목표(${input.mind.desires.surfaceGoal})`,
      consequence: `${input.mind.name}와 ${targetName}: 다음 행동을 함께 할 이유가 생긴다`,
      beliefSubject: targetName,
      belief: `${topic(targetName)} 제한적으로 의지할 수 있는 상대다`,
      confidence: "medium",
      decisionMode: "trust_based_coordination",
    };
  }

  if (hasSecretPressure) {
    const secret = input.mind.secrets[0] ?? input.mind.desires.hiddenGoal;
    return {
      beat: `${input.mind.name}: "${secret}" 비밀이 드러나지 않도록 말과 행동의 방향을 바꾼다`,
      cause: `${subject(input.mind.name)} 숨겨야 하는 비밀(${secret})과 두려움(${input.mind.fears[0] ?? "위험"})`,
      consequence: `${input.mind.name}의 비밀은 유지되지만, 주변 인물이 이상한 낌새를 볼 여지가 생긴다`,
      beliefSubject: input.mind.name,
      belief: `${topic(secret)} 아직 숨겨야 한다`,
      confidence: "high",
      decisionMode: "secret_protection",
    };
  }

  if (hasAccessPressure) {
    const accessRight = input.mind.access.accessRights[0] ?? "접근 가능한 정보";
    return {
      beat: `${input.mind.name}: "${accessRight}" 접근권을 이용해 겉목표 "${input.mind.desires.surfaceGoal}"에 필요한 다음 정보를 확인하려 한다`,
      cause: `${input.mind.name}에게 허용된 접근권(${accessRight})과 현재 목표(${input.mind.desires.surfaceGoal})`,
      consequence: `"${accessRight}"이 다음 사건의 정보 이동 경로로 열린다`,
      beliefSubject: accessRight,
      belief: `${object(accessRight)} 이용하면 다음 단서를 얻을 수 있다`,
      confidence: "medium",
      decisionMode: "access_driven_search",
    };
  }

  return {
    beat: `${input.mind.name}: ${input.chapterPressure} 속에서 겉목표 "${input.mind.desires.surfaceGoal}"를 지키는 선택을 한다`,
    cause: `${input.mind.name}의 겉목표(${input.mind.desires.surfaceGoal})와 두려움(${input.mind.fears[0] ?? "실패"})`,
    consequence: `${input.mind.name}의 현재 계획이 유지되고 다음 충돌의 원인이 남는다`,
    beliefSubject: input.mind.name,
    belief: `${object(input.mind.desires.surfaceGoal)} 우선해야 한다`,
    confidence: "low",
    decisionMode: "goal_preservation",
  };
}

function buildPlanTransition(input: {
  mind: CharacterMind;
  decision: CharacterActionDecision;
  chapterPressure: string;
}): WorldBrainPlanTransition {
  const afterPlanByMode: Record<string, string> = {
    relationship_probe: `${input.decision.beliefSubject}: 추가 탐색 및 증거 축적`,
    trust_based_coordination: `${input.decision.beliefSubject}: 제한 협력으로 다음 행동 진행`,
    secret_protection: "비밀 노출 위험을 낮추는 쪽으로 동선을 조정한다",
    access_driven_search: `${input.decision.beliefSubject} 경로로 다음 단서를 확인한다`,
    goal_preservation: input.mind.desires.surfaceGoal,
  };

  return WorldBrainPlanTransitionSchema.parse({
    characterId: input.mind.characterId,
    beforePlan: input.mind.currentPlan,
    afterPlan: afterPlanByMode[input.decision.decisionMode] ?? input.mind.currentPlan,
    reason: input.decision.cause,
    pressure: input.chapterPressure,
  });
}

function buildKnowledgeFlow(input: {
  mind: CharacterMind;
  decision: CharacterActionDecision;
  actorId: string;
  targetId?: string;
  eventCharacterIds: string[];
}): WorldBrainKnowledgeFlow {
  const blockedByForbiddenKnowledge = input.mind.access.forbiddenKnowledge.filter((item) =>
    input.decision.beat.includes(item)
    || input.decision.cause.includes(item)
    || input.decision.consequence.includes(item)
  );
  const usedKnowledge = compactForRunner([
    input.mind.desires.surfaceGoal,
    input.mind.desires.hiddenGoal,
    ...input.mind.knownFacts.slice(0, 3),
    ...(input.targetId
      ? [
        input.mind.relationshipModel[input.targetId]?.privateTruth,
        input.mind.relationshipModel[input.targetId]?.pressure,
      ]
      : []),
  ]);
  const gainedKnowledge = compactForRunner([
    input.decision.belief,
    input.decision.consequence,
  ]);
  const visibility = input.targetId ? "shared" : "private";
  const ownerCharacterIds = visibility === "shared"
    ? uniqueCharacterIds([input.actorId, input.targetId!, ...input.eventCharacterIds.slice(0, 1)])
    : [input.actorId];

  return WorldBrainKnowledgeFlowSchema.parse({
    usedKnowledge,
    gainedKnowledge,
    ownerCharacterIds,
    visibility,
    blockedByForbiddenKnowledge,
  });
}

function buildActionEconomics(input: {
  mind: CharacterMind;
  decision: CharacterActionDecision;
  targetId?: string;
}): WorldBrainActionEconomics {
  const riskByMode: Record<string, Pick<WorldBrainActionEconomics, "cost" | "risk" | "benefit" | "severity">> = {
    relationship_probe: {
      cost: "상대에게 의심받을 가능성이 생긴다",
      risk: "탐색이 들키면 관계 신뢰가 더 떨어진다",
      benefit: "상대의 숨은 의도를 확인할 단서가 생긴다",
      severity: "medium",
    },
    trust_based_coordination: {
      cost: "협력 상대도 위험에 노출된다",
      risk: "비밀이나 계획이 협력자를 통해 새어나갈 수 있다",
      benefit: "혼자서는 접근하기 어려운 행동을 실행할 수 있다",
      severity: "medium",
    },
    secret_protection: {
      cost: "자연스러운 반응을 숨기느라 행동이 부자연스러워진다",
      risk: "주변 인물이 이상한 낌새를 알아차릴 수 있다",
      benefit: "핵심 비밀의 조기 공개를 막는다",
      severity: "high",
    },
    access_driven_search: {
      cost: "접근 기록이나 동선이 남는다",
      risk: "권한 사용이 감시되면 의심을 산다",
      benefit: "다음 행동에 필요한 정보 경로가 열린다",
      severity: "medium",
    },
    goal_preservation: {
      cost: "즉각적인 반격보다 현상 유지에 머문다",
      risk: "상대가 먼저 움직일 시간을 준다",
      benefit: "공적 얼굴과 장기 계획을 유지한다",
      severity: "low",
    },
  };
  const economics = riskByMode[input.decision.decisionMode] ?? riskByMode.goal_preservation!;

  return WorldBrainActionEconomicsSchema.parse({
    ...economics,
    consequence: input.decision.consequence,
  });
}

function compactForRunner(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function collectCarryoverPressures(actionLogs: CharacterActionLog[], limit = 2): string[] {
  const pressures: string[] = [];
  for (let index = actionLogs.length - 1; index >= 0; index -= 1) {
    const log = actionLogs[index];
    if (!log || log.planLifecycle.nextStatus === "completed") continue;
    const pressure = log.actualEffect.followUpActionSeed.replace(/\s+/g, " ").trim();
    if (!pressure || pressures.includes(pressure)) continue;
    pressures.unshift(pressure);
    if (pressures.length >= limit) break;
  }
  return pressures;
}

function buildCausalStateChanges(input: {
  eventId: string;
  actorId: string;
  eventCharacterIds: string[];
  planTransition: WorldBrainPlanTransition;
  knowledgeFlow: WorldBrainKnowledgeFlow;
  actionEconomics: WorldBrainActionEconomics;
}): Pick<SimulationEvent, "stateChanges" | "outcomes"> {
  const planChangeId = `${input.eventId}:plan-transition`;
  const knowledgeChangeId = `${input.eventId}:knowledge-flow`;
  const economicsChangeId = `${input.eventId}:action-economics`;

  return {
    stateChanges: [
      {
        changeId: planChangeId,
        domain: "world_model",
        operation: "update",
        stateKey: `world-brain:${input.actorId}:currentPlan`,
        summary: `${input.planTransition.beforePlan} -> ${input.planTransition.afterPlan}`,
        entityIds: [input.actorId],
        beforeValue: input.planTransition.beforePlan,
        afterValue: input.planTransition.afterPlan,
      },
      {
        changeId: knowledgeChangeId,
        domain: "objective_facts",
        operation: "record",
        stateKey: `knowledge-flow:${input.eventId}`,
        summary: input.knowledgeFlow.gainedKnowledge.join(" / "),
        entityIds: input.knowledgeFlow.ownerCharacterIds,
        afterValue: input.knowledgeFlow,
      },
      {
        changeId: economicsChangeId,
        domain: "world_model",
        operation: "record",
        stateKey: `action-economics:${input.eventId}`,
        summary: `${input.actionEconomics.risk} / ${input.actionEconomics.benefit}`,
        entityIds: input.eventCharacterIds,
        afterValue: input.actionEconomics,
      },
    ],
    outcomes: [
      {
        outcomeId: `${input.eventId}:plan-updated`,
        type: "character_state_changed",
        summary: `Plan updated for ${input.actorId}`,
        stateChangeIds: [planChangeId],
      },
      {
        outcomeId: `${input.eventId}:knowledge-owned`,
        type: input.knowledgeFlow.visibility === "audience"
          ? "knowledge_revealed"
          : "memory_recorded",
        summary: `Knowledge now owned by ${input.knowledgeFlow.ownerCharacterIds.join(", ")}`,
        stateChangeIds: [knowledgeChangeId],
      },
      {
        outcomeId: `${input.eventId}:cost-risk-recorded`,
        type: "objective_fact_created",
        summary: `Action cost/risk recorded: ${input.actionEconomics.risk}`,
        stateChangeIds: [economicsChangeId],
      },
    ],
  };
}

function buildWorldBrainActionEvents(input: {
  seed: NovelSeed;
  brain: WorldBrain;
  runtimeMindStates: Record<string, RuntimeMindState>;
  authority: WorldStateAuthority;
  chapter: number;
  startBeatIndex: number;
  title: string;
  oneLiner: string;
  characterIds: string[];
  location: string;
  previousEvent?: SimulationEvent;
  threadIds: string[];
  maxActions: number;
}): SimulationEvent[] {
  const introducedCharacterIds = input.seed.characters
    .filter((character) => character.introduction_chapter <= input.chapter)
    .map((character) => character.id);
  const sceneCharacterIds = uniqueCharacterIds([
    ...input.characterIds,
    ...introducedCharacterIds.slice(0, 2),
  ]).filter((characterId) => input.brain.characterMinds[characterId]);
  const actorIds = sceneCharacterIds.slice(0, input.maxActions);
  const events: SimulationEvent[] = [];
  let previousEvent = input.previousEvent;

  for (const [index, actorId] of actorIds.entries()) {
    const baseMind = input.brain.characterMinds[actorId];
    if (!baseMind) continue;
    const mind = withRuntimeMindState(baseMind, input.runtimeMindStates[actorId]);

    const targetId = pickActionTarget({
      mind,
      sceneCharacterIds,
      actorId,
    });
    const decision = buildCharacterActionBeat({
      mind,
      authority: input.authority,
      chapter: input.chapter,
      targetId,
      chapterPressure: input.oneLiner,
    });
    const eventCharacterIds = uniqueCharacterIds([
      actorId,
      ...(targetId ? [targetId] : []),
      ...sceneCharacterIds.filter((characterId) => characterId !== actorId && characterId !== targetId).slice(0, 1),
    ]);
    const event = buildWorldEvent({
      seed: input.seed,
      authority: input.authority,
      chapter: input.chapter,
      beatIndex: input.startBeatIndex + index,
      title: input.title,
      beat: decision.beat,
      cause: decision.cause,
      consequence: decision.consequence,
      characterIds: eventCharacterIds,
      location: input.location,
      previousEvent,
      threadIds: input.threadIds,
    });

    const eventId = `${event.id}_brain_${actorId}`;
    const planTransition = buildPlanTransition({
      mind,
      decision,
      chapterPressure: input.oneLiner,
    });
    const knowledgeFlow = buildKnowledgeFlow({
      mind,
      decision,
      actorId,
      targetId,
      eventCharacterIds,
    });
    const actionEconomics = buildActionEconomics({
      mind,
      decision,
      targetId,
    });
    const causalChanges = buildCausalStateChanges({
      eventId,
      actorId,
      eventCharacterIds,
      planTransition,
      knowledgeFlow,
      actionEconomics,
    });
    const actorName = characterName(input.authority, actorId);
    const targetName = targetId ? characterName(input.authority, targetId) : undefined;
    const brainEvent: SimulationEvent = {
      ...event,
      id: eventId,
      type: "plot_action",
      actorId,
      targetId,
      stateChanges: [
        ...(event.stateChanges ?? []),
        ...(causalChanges.stateChanges ?? []),
      ],
      outcomes: [
        ...(event.outcomes ?? []),
        ...(causalChanges.outcomes ?? []),
      ],
      tags: [
        ...(event.tags ?? []),
        "world-brain",
        "character-action",
        "plan-transition",
        "knowledge-flow",
        "action-economics",
        `mind:${actorId}`,
        `decision:${decision.decisionMode}`,
      ],
      payload: {
        ...(event.payload ?? {}),
        source: "world_brain_character_mind",
        decisionMode: decision.decisionMode,
        actorMind: {
          characterId: mind.characterId,
          surfaceGoal: mind.desires.surfaceGoal,
          hiddenGoal: mind.desires.hiddenGoal,
          fears: mind.fears,
          secrets: mind.secrets,
          currentPlan: mind.currentPlan,
          voiceRules: mind.voiceRules,
        },
        planTransition,
        knowledgeFlow,
        actionEconomics,
        targetRelationship: targetId ? mind.relationshipModel[targetId] : undefined,
        worldPressure: input.oneLiner,
        rendererDirective:
          "Renderer must dramatize this character decision as behavior, dialogue, or withheld information grounded in WorldBrain.",
      },
      cognition: {
        memoryUpdates: eventCharacterIds.map((characterId) => ({
          characterId,
          kind: "direct_experience",
          summary: decision.beat,
          location: input.location,
          relatedCharacterIds: eventCharacterIds.filter((candidate) =>
            candidate !== characterId
          ),
          tags: ["world-brain", "character-action", `mind:${actorId}`],
        })),
        beliefUpdates: [{
          characterId: actorId,
          kind: targetId ? "trust_assessment" : "self_concept",
          subject: decision.beliefSubject,
          belief: decision.belief,
          confidence: decision.confidence,
          cause: decision.cause,
          canonicalAlignment: "supported",
          relatedCharacterIds: targetId ? [targetId] : [],
          tags: [
            "world-brain",
            "character-action",
            `mind:${actorId}`,
            ...(targetName ? [`target:${targetName}`] : [`actor:${actorName}`]),
          ],
        }],
      },
    };
    events.push(brainEvent);
    applyRuntimeMindEvent(input.runtimeMindStates, brainEvent);
    previousEvent = brainEvent;
  }

  return events;
}

function applyRuntimeMindEvent(
  runtimeMindStates: Record<string, RuntimeMindState>,
  event: SimulationEvent,
): void {
  const payload = payloadRecord(event);
  const planTransition = nestedRecord(payload.planTransition);
  const knowledgeFlow = nestedRecord(payload.knowledgeFlow);
  const actionEconomics = nestedRecord(payload.actionEconomics);
  const reflectionPass = nestedRecord(payload.reflectionPass);
  const decisionMode = String(payload.decisionMode ?? "");
  const planCharacterId = String(planTransition.characterId ?? event.actorId ?? "");
  const actorState = planCharacterId ? runtimeMindStates[planCharacterId] : undefined;

  if (actorState && typeof planTransition.afterPlan === "string") {
    actorState.currentPlan = planTransition.afterPlan;
  }

	  if (actorState) {
	    const speechDraft = nestedRecord(payload.speechDraft);
	    const gainedKnowledge = toStringList(knowledgeFlow.gainedKnowledge);
	    const beliefSummaries = (event.cognition?.beliefUpdates ?? [])
	      .filter((beliefUpdate) => beliefUpdate.characterId === actorState.characterId)
	      .map((beliefUpdate) => beliefUpdate.belief);
	    const memorySummaries = (event.cognition?.memoryUpdates ?? [])
	      .filter((memoryUpdate) => memoryUpdate.characterId === actorState.characterId)
	      .map((memoryUpdate) => memoryUpdate.summary ?? event.summary);
	    actorState.recentVisibleBehaviors = appendRecentRuntimeMemory(
	      actorState.recentVisibleBehaviors,
	      typeof payload.visibleBehavior === "string" ? payload.visibleBehavior : undefined,
      40,
    );
    actorState.recentUtterances = appendRecentRuntimeMemory(
      actorState.recentUtterances,
      typeof speechDraft.utteranceCandidate === "string" ? speechDraft.utteranceCandidate : undefined,
      180,
    );
    const reflectionNote = typeof reflectionPass.note === "string"
      ? reflectionPass.note
      : undefined;
    actorState.reflectionNotes = appendRecentRuntimeMemory(
      actorState.reflectionNotes,
      reflectionNote,
      20,
    );
    if (typeof reflectionPass.actionType === "string") {
      for (const [actionType, fatigue] of Object.entries(actorState.actionFatigueByType)) {
        actorState.actionFatigueByType[actionType] = Math.max(0, fatigue - 0.25);
      }
      const fatigueDelta = typeof reflectionPass.fatigueDelta === "number"
        ? reflectionPass.fatigueDelta
        : 0;
      const currentFatigue = actorState.actionFatigueByType[reflectionPass.actionType] ?? 0;
      actorState.actionFatigueByType[reflectionPass.actionType] = Math.max(0, currentFatigue + fatigueDelta);
	      if (typeof reflectionPass.operatorStatus === "string" && reflectionPass.operatorStatus === "accepted") {
	        actorState.proceduralMemory = appendRecentRuntimeMemory(
	          actorState.proceduralMemory,
	          reflectionNote,
	          20,
	        );
	      }
	    }
	    applyAgentBrainEvent(actorState.agentBrainState, {
	      gainedKnowledge,
	      memorySummaries,
	      beliefSummaries,
	      currentPlan: typeof planTransition.afterPlan === "string" ? planTransition.afterPlan : undefined,
	      reflectionNote,
	      proceduralNote: typeof reflectionPass.operatorStatus === "string" && reflectionPass.operatorStatus === "accepted"
	        ? reflectionNote
	        : undefined,
		      actionType: typeof reflectionPass.actionType === "string" ? reflectionPass.actionType : undefined,
		      fatigueDelta: typeof reflectionPass.fatigueDelta === "number" ? reflectionPass.fatigueDelta : 0,
		      trustDeltas: nestedNumberRecord(payload.trustDeltas),
		      chapter: event.chapter,
		    });
	  }

	  const gainedKnowledge = toStringList(knowledgeFlow.gainedKnowledge);
	  for (const ownerId of toStringList(knowledgeFlow.ownerCharacterIds)) {
	    const ownerState = runtimeMindStates[ownerId];
	    if (!ownerState) continue;
	    ownerState.knownFacts = compactForRunner([
	      ...ownerState.knownFacts,
	      ...gainedKnowledge,
	    ]);
		    applyAgentBrainEvent(ownerState.agentBrainState, {
		      gainedKnowledge,
		      chapter: event.chapter,
		    });
	  }

	  for (const memoryUpdate of event.cognition?.memoryUpdates ?? []) {
	    const runtime = runtimeMindStates[memoryUpdate.characterId];
	    if (!runtime) continue;
	    const memorySummary = memoryUpdate.summary ?? event.summary;
	    runtime.recentMemorySummaries = compactForRunner([
	      ...runtime.recentMemorySummaries,
	      memorySummary,
	      typeof actionEconomics.risk === "string" ? `위험: ${actionEconomics.risk}` : undefined,
	    ]).slice(-8);
		    applyAgentBrainEvent(runtime.agentBrainState, {
		      memorySummaries: compactForRunner([
		        `${event.id}: ${memorySummary}`,
		        typeof actionEconomics.risk === "string" ? `위험: ${actionEconomics.risk}` : undefined,
		      ]),
		      chapter: event.chapter,
		    });
	  }

  if (event.actorId && event.targetId) {
    const runtime = runtimeMindStates[event.actorId];
    if (runtime) {
      const delta = decisionMode === "trust_based_coordination"
        ? 1
        : decisionMode === "relationship_probe"
          ? -1
          : 0;
      runtime.trustDeltasByCharacter[event.targetId] =
        (runtime.trustDeltasByCharacter[event.targetId] ?? 0) + delta;
    }
  }
}

function appendRecentRuntimeMemory(
  values: string[] | undefined,
  next: string | undefined,
  limit: number,
): string[] {
  const normalizedNext = next?.replace(/\s+/g, " ").trim();
  if (!normalizedNext) return [...(values ?? [])].slice(-limit);
  return compactForRunner([
    ...(values ?? []).filter((value) => value !== normalizedNext),
    normalizedNext,
  ]).slice(-limit);
}

function evaluateRuntimeContinuity(input: {
  brain: WorldBrain;
  events: SimulationEvent[];
  runtimeMindStates: Record<string, RuntimeMindState>;
}): WorldModelRunReport["worldBrain"]["runtimeContinuity"] {
  const planCarryoverEventCount = input.events.filter((event) => {
    const planTransition = nestedRecord(payloadRecord(event).planTransition);
    const characterId = String(planTransition.characterId ?? "");
    const beforePlan = String(planTransition.beforePlan ?? "");
    const initialPlan = input.brain.characterMinds[characterId]?.currentPlan;
    return Boolean(initialPlan && beforePlan && beforePlan !== initialPlan);
  }).length;
  const charactersWithNewKnowledge = Object.values(input.runtimeMindStates).filter((runtime) => {
    const initialKnowledgeCount = input.brain.characterMinds[runtime.characterId]?.knownFacts.length ?? 0;
    return runtime.knownFacts.length > initialKnowledgeCount;
  }).length;
  const charactersWithTrustDeltas = Object.values(input.runtimeMindStates).filter((runtime) =>
    Object.keys(runtime.trustDeltasByCharacter).length > 0
  ).length;

  return {
    planCarryoverEventCount,
    charactersWithNewKnowledge,
    charactersWithTrustDeltas,
  };
}

function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function payloadRecord(event: SimulationEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object"
    ? event.payload
    : {};
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nestedNumberRecord(value: unknown): Record<string, number> {
  const record = nestedRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

function speechActForEvent(event: SimulationEvent): DialogueSpeechAct {
  const payload = payloadRecord(event);
  const decisionMode = String(payload.decisionMode ?? "");

  switch (decisionMode) {
    case "relationship_probe":
      return "probe";
    case "trust_based_coordination":
      return "request_help";
    case "secret_protection":
      return "deflect";
    case "access_driven_search":
      return "request_access";
    case "aftermath":
      return "withhold";
    default:
      return "maintain_mask";
  }
}

function describeSpeechAct(speechAct: DialogueSpeechAct): string {
  const labels: Record<DialogueSpeechAct, string> = {
    probe: "상대 반응 탐색",
    deflect: "화제 돌리기/비밀 은폐",
    request_help: "제한적 도움 요청",
    request_access: "정보/장소 접근 요청",
    maintain_mask: "공적 얼굴 유지",
    threaten_softly: "부드러운 압박",
    confess_partial: "부분 고백",
    reassure: "안심시키기",
    withhold: "정보 보류",
  };
  return labels[speechAct];
}

function scenePurposeForEvents(events: SimulationEvent[]): ScenePurpose {
  const hasCharacterAction = events.some((event) => event.tags?.includes("character-action"));
  if (!hasCharacterAction && events.some((event) => event.tags?.includes("foreshadowing"))) {
    return "foreshadowing";
  }
  const directorTargetPurpose = events
    .map((event) => payloadRecord(event).pressure)
    .find((pressure): pressure is NarrativeDirectorPressure =>
      Boolean(
        pressure
        && typeof pressure === "object"
        && !Array.isArray(pressure)
        && (pressure as { source?: unknown }).source === "narrative_director"
        && typeof (pressure as { targetScenePurpose?: unknown }).targetScenePurpose === "string",
      )
    )?.targetScenePurpose;
  if (hasCharacterAction && directorTargetPurpose) {
    return directorTargetPurpose;
  }
  const decisionModes = events
    .map((event) => String(payloadRecord(event).decisionMode ?? ""))
    .filter(Boolean);
  const counts = decisionModes.reduce<Record<string, number>>((accumulator, mode) => {
    accumulator[mode] = (accumulator[mode] ?? 0) + 1;
    return accumulator;
  }, {});
  const targetMode = directorTargetPurpose ? decisionModeForScenePurpose(directorTargetPurpose) : undefined;
  if (targetMode) {
    counts[targetMode] = (counts[targetMode] ?? 0) + 2;
  }
  const dominantMode = Object.entries(counts).sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    const priority = ["secret_protection", "access_driven_search", "relationship_probe", "trust_based_coordination", "aftermath", "goal_preservation"];
    return priority.indexOf(left[0]) - priority.indexOf(right[0]);
  })[0]?.[0];

  switch (dominantMode) {
    case "secret_protection":
      return "secret_pressure";
    case "access_driven_search":
      return "information_discovery";
    case "relationship_probe":
      return "relationship_probe";
    case "trust_based_coordination":
    case "goal_preservation":
      return "advance_plot";
    case "aftermath":
      return "aftermath";
    default:
      return hasCharacterAction
        ? "advance_plot"
        : "establish_state";
  }
}

function decisionModeForScenePurpose(scenePurpose: ScenePurpose): string | undefined {
  const mapping: Partial<Record<ScenePurpose, string>> = {
    establish_state: "goal_preservation",
    information_discovery: "access_driven_search",
    relationship_probe: "relationship_probe",
    secret_pressure: "secret_protection",
    advance_plot: "trust_based_coordination",
    foreshadowing: "access_driven_search",
    aftermath: "aftermath",
  };
  return mapping[scenePurpose];
}

function buildDialogueTurnFromEvent(event: SimulationEvent, index: number): DialogueTurn | null {
  if (!event.tags?.includes("character-action") || !event.actorId) {
    return null;
  }

  const payload = payloadRecord(event);
  const actorMind = nestedRecord(payload.actorMind);
  const knowledgeFlow = nestedRecord(payload.knowledgeFlow);
  const economics = nestedRecord(payload.actionEconomics);
  const speechDraft = nestedRecord(payload.speechDraft);
  const emotionalShift = nestedRecord(payload.emotionalShift);
  const powerShift = nestedRecord(payload.powerShift);
  const relationshipShift = nestedRecord(payload.relationshipShift);
  const writerHooks = nestedRecord(payload.writerHooks);
  const sourceActionLogIds = toStringList(payload.sourceActionLogIds);
  const informationRevealed = toStringList(knowledgeFlow.gainedKnowledge);
  const informationWithheld = toStringList(actorMind.secrets);
  const voiceGuidance = toStringList(actorMind.voiceRules);
  const hiddenIntent = String(speechDraft.hiddenIntention ?? actorMind.hiddenGoal ?? event.summary);
  const relationshipEffect = String(
    relationshipShift.reason ?? economics.consequence ?? economics.risk ?? event.payload?.leadsTo ?? "",
  );
  const listenerIds = uniqueCharacterIds([
    ...(event.targetId ? [event.targetId] : []),
    ...(event.involvedEntities ?? [])
      .filter((entity) => entity.entityType === "character" && entity.entityId !== event.actorId)
      .map((entity) => entity.entityId),
  ]);
  const targetInterpretations = Array.isArray(payload.targetInterpretations)
    ? payload.targetInterpretations
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item))
      )
      .map((item) => ({
        characterId: String(item.characterId ?? ""),
        interpretedAs: String(item.interpretedAs ?? event.summary),
        emotionalResponse: String(item.emotionalResponse ?? ""),
      }))
      .filter((item) => item.characterId)
    : [];
  const interactionDynamics = speechDraft.utteranceCandidate
    ? {
      utteranceCandidate: String(speechDraft.utteranceCandidate),
      surfaceMeaning: String(speechDraft.surfaceMeaning ?? event.summary),
      hiddenIntention: hiddenIntent,
      targetInterpretations,
      emotionalShift: {
        actorBefore: String(emotionalShift.actorBefore ?? ""),
        actorAfter: String(emotionalShift.actorAfter ?? ""),
        targetBefore: typeof emotionalShift.targetBefore === "string" ? emotionalShift.targetBefore : null,
        targetAfter: typeof emotionalShift.targetAfter === "string" ? emotionalShift.targetAfter : null,
        intensityDelta: Number.isFinite(Number(emotionalShift.intensityDelta))
          ? Number(emotionalShift.intensityDelta)
          : 0,
      },
      powerShift: {
        axis: String(powerShift.axis ?? ""),
        fromCharacterId: typeof powerShift.fromCharacterId === "string" ? powerShift.fromCharacterId : null,
        toCharacterId: String(powerShift.toCharacterId ?? event.actorId),
        delta: Number.isFinite(Number(powerShift.delta)) ? Number(powerShift.delta) : 0,
        reason: String(powerShift.reason ?? event.summary),
      },
      relationshipShift: {
        sourceCharacterId: String(relationshipShift.sourceCharacterId ?? event.actorId),
        targetCharacterId: typeof relationshipShift.targetCharacterId === "string"
          ? relationshipShift.targetCharacterId
          : null,
        trustDelta: Number.isFinite(Number(relationshipShift.trustDelta))
          ? Number(relationshipShift.trustDelta)
          : 0,
        suspicionDelta: Number.isFinite(Number(relationshipShift.suspicionDelta))
          ? Number(relationshipShift.suspicionDelta)
          : 0,
        dependencyDelta: Number.isFinite(Number(relationshipShift.dependencyDelta))
          ? Number(relationshipShift.dependencyDelta)
          : 0,
        hostilityDelta: Number.isFinite(Number(relationshipShift.hostilityDelta))
          ? Number(relationshipShift.hostilityDelta)
          : 0,
        reason: String(relationshipShift.reason ?? relationshipEffect),
      },
      writerHooks: {
        gesture: String(writerHooks.gesture ?? ""),
        silence: String(writerHooks.silence ?? ""),
        sensoryCue: String(writerHooks.sensoryCue ?? ""),
        linePurpose: String(writerHooks.linePurpose ?? ""),
      },
    }
    : undefined;

  return DialogueTurnSchema.parse({
    turnId: `${event.id}:turn:${String(index + 1).padStart(2, "0")}`,
    sourceEventId: event.id,
    speakerId: event.actorId,
    speakerName: characterNameFromEvent(event, event.actorId),
    listenerIds,
    listenerNames: listenerIds.map((characterId) => characterNameFromEvent(event, characterId)),
    utterance: interactionDynamics?.utteranceCandidate ?? null,
    draftStatus: interactionDynamics ? "drafted" : "intent_only",
    speechAct: speechActForEvent(event),
    voiceGuidance,
    renderableConstraints: {
      allowedRevealedFacts: informationRevealed,
      forbiddenExplicitFacts: informationWithheld,
      voiceRequirements: voiceGuidance,
      requiredSubtext: compactForRunner([
        hiddenIntent,
        relationshipEffect,
        interactionDynamics?.surfaceMeaning,
        interactionDynamics?.writerHooks.gesture,
      ]),
      sourceEventId: event.id,
    },
    sourceActionLogIds,
    spokenIntent: interactionDynamics?.surfaceMeaning ?? event.summary,
    hiddenIntent,
    informationRevealed,
    informationWithheld,
    listenerInterpretation: interactionDynamics?.targetInterpretations[0]?.interpretedAs
      ?? String(
        event.cognition?.beliefUpdates?.[0]?.belief
          ?? knowledgeFlow.gainedKnowledge
          ?? event.summary,
      ),
    relationshipEffect,
    interactionDynamics,
  });
}

function buildSceneLogFromEvents(input: {
  seed: NovelSeed;
  chapter: number;
  title: string;
  oneLiner: string;
  events: SimulationEvent[];
  tensionLevel: number;
  location: string;
}): SceneLog {
  const sourceEventIds = input.events.map((event) => event.id);
  const sourceActionLogIds = compactForRunner(input.events.flatMap((event) =>
    toStringList(payloadRecord(event).sourceActionLogIds)
  ));
  const participantIds = uniqueCharacterIds(input.events.flatMap((event) =>
    event.involvedEntities
      ?.filter((entity) => entity.entityType === "character")
      .map((entity) => entity.entityId) ?? []
  ));
  const participantNames = participantIds.map((characterId) => {
    const eventWithName = input.events.find((event) =>
      event.involvedEntities?.some((entity) =>
        entity.entityType === "character" && entity.entityId === characterId && entity.label
      )
    );
    return eventWithName ? characterNameFromEvent(eventWithName, characterId) : characterId;
  });
  const dialogueTurns = input.events
    .map(buildDialogueTurnFromEvent)
    .filter((turn): turn is DialogueTurn => turn !== null);
  const sensoryAnchors = compactForRunner([
    input.location,
    input.seed.world.symbolic_objects?.[0]?.name,
    input.seed.world.symbolic_objects?.[1]?.name,
    input.tensionLevel >= 7 ? "눌린 숨" : "낮은 정적",
  ]);
  const finalEvent = input.events.at(-1);
  const outcomeStateChanges = input.events.flatMap((event) => event.stateChanges ?? []);
  const finalDelta = outcomeStateChanges.at(-1);
  const finalLead = finalDelta?.summary
    ? `${input.title}: ${finalEvent?.summary ?? "장면 결과"} -> ${finalDelta.summary}`
    : (finalEvent?.payload?.leadsTo ? String(finalEvent.payload.leadsTo) : "다음 사건의 원인이 남는다");
  const sceneOutcomeDeltaIds = outcomeStateChanges.map((change) => change.changeId);
  const narrativeDirectorPressures = input.events
    .map((event) => payloadRecord(event).pressure)
    .filter((pressure): pressure is NarrativeDirectorPressure =>
      Boolean(
        pressure
        && typeof pressure === "object"
        && !Array.isArray(pressure)
        && (pressure as { source?: unknown }).source === "narrative_director",
      )
    );

  return SceneLogSchema.parse({
    sceneId: `scene_log_ch${padChapter(input.chapter)}_01`,
    chapter: input.chapter,
    title: input.title,
    scenePurpose: scenePurposeForEvents(input.events),
    location: input.location,
    atmosphere: input.tensionLevel >= 7
      ? "긴장이 표면까지 올라온 장면"
      : "겉으로는 평온하지만 속으로는 탐색이 오가는 장면",
    sensoryAnchors,
    sourceEventIds,
    sourceActionLogIds,
    participantIds,
    participantNames,
    dialogueTurns,
    emotionalArc: {
      start: input.oneLiner,
      turn: dialogueTurns[0]?.hiddenIntent ?? input.events[0]?.summary ?? input.oneLiner,
      end: finalLead,
    },
    sceneOutcome: finalLead,
    sceneOutcomeDeltaIds,
    narrativeDirectorPressures,
    rendererGuidance: [
      "EventLog의 사건 순서를 유지한다",
      "DialogueTurn의 spokenIntent와 hiddenIntent를 동시에 반영한다",
      "informationWithheld는 직접 설명하지 말고 행동/침묵/시선으로 암시한다",
      "SceneLog에 없는 새 반전은 만들지 않는다",
    ],
  });
}

function renderChapterFromEvents(input: {
  seed: NovelSeed;
  chapter: number;
  title: string;
  oneLiner: string;
  events: SimulationEvent[];
  sceneLog: SceneLog;
  tensionLevel: number;
  location: string;
}): WorldModelRenderedChapter {
  const sourceEventIds = input.events.map((event) => event.id);
  const eventLines = input.events.map((event, index) => {
    const characters = event.involvedEntities
      ?.filter((entity) => entity.entityType === "character")
      .map((entity) => entity.label ?? entity.entityId)
      .join(", ");
    return [
      `${index + 1}. ${event.summary}`,
      characters ? `등장: ${characters}` : "",
      event.payload?.leadsTo ? `결과: ${String(event.payload.leadsTo)}` : "",
    ].filter(Boolean).join("\n");
  });
  const hook = input.events.at(-1)?.payload?.leadsTo
    ? String(input.events.at(-1)?.payload?.leadsTo)
    : "다음 사건의 원인이 남는다";
  const dialogueLines = input.sceneLog.dialogueTurns.flatMap((turn) => [
    `${turn.speakerName}: [${turn.speechAct} - ${describeSpeechAct(turn.speechAct)}]`,
    `  대사 상태: ${turn.draftStatus === "intent_only" ? "문장 미생성, Renderer가 말투 규칙으로 작성" : "초안 있음"}`,
    turn.utterance ? `  대사 초안: "${turn.utterance}"` : "",
    turn.voiceGuidance.length > 0 ? `  말투 지시: ${turn.voiceGuidance.slice(0, 3).join(" / ")}` : "",
    turn.renderableConstraints.forbiddenExplicitFacts.length > 0
      ? `  직접 말하면 안 되는 정보: ${turn.renderableConstraints.forbiddenExplicitFacts.join(" / ")}`
      : "",
    `  겉뜻: ${turn.spokenIntent}`,
    `  속뜻: ${turn.hiddenIntent}`,
    `  상대 해석: ${turn.listenerInterpretation}`,
    `  관계 효과: ${turn.relationshipEffect}`,
    turn.interactionDynamics
      ? `  대사 후보: "${turn.interactionDynamics.utteranceCandidate}"`
      : "",
    turn.interactionDynamics
      ? `  감정 변화: ${turn.interactionDynamics.emotionalShift.actorBefore} -> ${turn.interactionDynamics.emotionalShift.actorAfter}`
      : "",
    turn.interactionDynamics
      ? `  권력 변화: ${turn.interactionDynamics.powerShift.axis} / ${turn.interactionDynamics.powerShift.reason}`
      : "",
    turn.interactionDynamics
      ? `  작가 훅: ${turn.interactionDynamics.writerHooks.gesture} / ${turn.interactionDynamics.writerHooks.silence}`
      : "",
    "",
  ]);
  const text = [
    `# ${input.title}`,
    "",
    `월드 모델은 ${input.chapter}화의 핵심 흐름을 먼저 확정했다. ${input.oneLiner}`,
    "",
    `장면: ${input.sceneLog.location}. ${input.sceneLog.atmosphere}`,
    `장면 목적: ${input.sceneLog.scenePurpose}`,
    `감각 앵커: ${input.sceneLog.sensoryAnchors.join(", ")}`,
    `등장: ${input.sceneLog.participantNames.join(", ")}`,
    "",
    "## 대화 로그",
    "",
    ...(dialogueLines.length > 0 ? dialogueLines : ["대화 턴 없음", ""]),
    "## 사건 로그",
    "",
    ...eventLines.flatMap((line) => [line, ""]),
    `이 화의 마지막 상태: ${input.sceneLog.sceneOutcome || hook}`,
    "",
    `<!-- sourceEventIds: ${sourceEventIds.join(", ")} -->`,
    `<!-- sceneLogId: ${input.sceneLog.sceneId} -->`,
  ].join("\n");
  const foreshadowingTouched = input.events.flatMap((event) => {
    const touched = event.payload?.foreshadowingTouched;
    if (!Array.isArray(touched)) {
      return [];
    }
    return touched.map((item) => {
      const value = item as {
        foreshadowingId?: unknown;
        action?: unknown;
        context?: unknown;
      };
      return {
        foreshadowing_id: String(value.foreshadowingId ?? ""),
        action: String(value.action ?? ""),
        context: String(value.context ?? ""),
      };
    }).filter((item) => item.foreshadowing_id && item.action && item.context);
  });
  const summary = ChapterSummarySchema.parse({
    chapter_number: input.chapter,
    title: input.title,
    events: input.events.map((event) => ({
      type: event.tags?.includes("character-action") ? "dialogue" : "discovery",
      participants: event.involvedEntities
        ?.filter((entity) => entity.entityType === "character")
        .map((entity) => entity.entityId) ?? [],
      description: event.summary,
      outcome: String(event.payload?.leadsTo ?? ""),
      consequences: {
        source_event_id: event.id,
      },
    })),
    character_changes: [],
    foreshadowing_touched: foreshadowingTouched,
    plot_summary: input.oneLiner,
    emotional_beat: input.tensionLevel >= 7 ? "고조" : "진전",
    cliffhanger: hook,
    ending_scene_state: {
      time_of_day: "연속 시뮬레이션 시간",
      location: input.location,
      characters_present: input.events.at(-1)?.involvedEntities
        ?.filter((entity) => entity.entityType === "character")
        .map((entity) => entity.label ?? entity.entityId) ?? [],
      ongoing_action: hook,
      unresolved_tension: hook,
    },
    word_count: text.length,
    style_score: 0,
  });

  return {
    chapterNumber: input.chapter,
    title: input.title,
    text,
    sourceEventIds,
    sceneLog: input.sceneLog,
    summary,
  };
}

export function runWorldModelFirstSimulation(
  seed: NovelSeed,
  options: WorldModelRunOptions = {},
): WorldModelRunResult {
  const startChapter = options.startChapter ?? 1;
  const endChapter = options.endChapter ?? seed.total_chapters;
  const maxBeatsPerChapter = options.maxBeatsPerChapter ?? 3;
  const characterActionsPerChapter = options.characterActionsPerChapter ?? 2;
  const enableWorldBrainActions = options.enableWorldBrainActions ?? true;
  const characterSimulationMode = options.characterSimulationMode ?? "agent_ticks";
  const brain = buildWorldBrainFromSeed(seed);
  const runtimeMindStates = options.initialCheckpoint
    ? cloneRuntimeMindStates(options.initialCheckpoint.runtimeMindStates)
    : createRuntimeMindStates(brain);
  const authority = options.initialCheckpoint
    ? createWorldStateAuthorityFromSnapshot(seed, options.initialCheckpoint.worldStateAuthority)
    : createWorldStateAuthority(seed);
  const initialEventLogLength = authority.getSimulationState().eventLog.length;
  const chapters: WorldModelRenderedChapter[] = [];
  const sceneLogs: SceneLog[] = [];
  const actionLogs: CharacterActionLog[] = [];
  const interactionResolutions: InteractionResolution[] = [];
  const simulationClocks: SimulationClock[] = [];
  const simulationDiagnostics: CharacterActionSimulationDiagnostics[] = [];
  let narrativeDirectorPressureCount = 0;
  let previousEvent: SimulationEvent | undefined =
    options.initialCheckpoint?.previousEvent
    ?? authority.getSimulationState().eventLog.at(-1);
  const cumulativeActionCounts = new Map<string, number>();
  const cumulativeInteractionCounts = new Map<string, number>();
  for (const event of authority.getSimulationState().eventLog) {
    if (event.tags?.includes("character-action") && event.actorId) {
      cumulativeActionCounts.set(
        event.actorId,
        (cumulativeActionCounts.get(event.actorId) ?? 0) + 1,
      );
      const targetId = event.targetId;
      if (targetId) {
        const pairKey = `${event.actorId}->${targetId}`;
        cumulativeInteractionCounts.set(
          pairKey,
          (cumulativeInteractionCounts.get(pairKey) ?? 0) + 1,
        );
      }
    }
  }
  let characterActionEventCount = 0;
  let carryoverPressures: string[] = [];
  const applyEvent = (event: SimulationEvent): SimulationState =>
    options.fastEventApplication
      ? authority.appendEventFast(event)
      : authority.applyEvent(event);

  for (let chapter = startChapter; chapter <= endChapter; chapter += 1) {
    const frame = getChapterFrame(seed, chapter);
    const priorityCharacterIds = selectLowActivityPriorityCharacterIds({
      seed,
      brain,
      chapter,
      baseCharacterIds: frame.characterIds,
      cumulativeActionCounts,
    });
    const scheduledCharacterIds = compactForRunner([
      ...frame.characterIds,
      ...priorityCharacterIds,
    ]);
    const location = resolveLocation(seed, chapter);
    const beats = frame.keyPoints.slice(0, maxBeatsPerChapter);
    const events: SimulationEvent[] = [];
    const directorPressure = narrativeDirectorPressureForChapter({
      seed,
      chapter,
      title: frame.title,
      oneLiner: frame.oneLiner,
      tensionLevel: frame.tensionLevel,
      location,
      threadIds: frame.threadIds,
    });
    const directorPressureEvent = buildNarrativeDirectorPressureEvent({
      pressure: directorPressure,
      chapter,
      sequence: 1,
      location,
      previousEvent,
    });
    applyEvent(directorPressureEvent);
    events.push(directorPressureEvent);
    previousEvent = directorPressureEvent;
    narrativeDirectorPressureCount += 1;

    const genreConventionEvents = buildGenreConventionEvents({
      state: authority.getSimulationState(),
      seed,
      chapter,
      nextSequence: 2,
    });
    for (const genreEvent of genreConventionEvents) {
      applyEvent(genreEvent);
      events.push(genreEvent);
      previousEvent = genreEvent;
    }

    beats.forEach((beat, beatIndex) => {
      const event = buildWorldEvent({
        seed,
        authority,
        chapter,
        beatIndex: beatIndex + 1,
        title: frame.title,
        beat,
        cause: frame.keyPointCauses[beatIndex],
        consequence: frame.keyPointConsequences[beatIndex],
        characterIds: frame.characterIds,
        location,
        previousEvent,
        threadIds: frame.threadIds,
      });
      applyEvent(event);
      events.push(event);
      previousEvent = event;
    });

    if (enableWorldBrainActions && characterActionsPerChapter > 0 && characterSimulationMode === "agent_ticks") {
      const sceneId = `world_scene_${padChapter(chapter)}_agent_ticks`;
      const actionSimulation = runCharacterActionSimulation({
        seed,
        brain,
        chapter,
        sceneId,
        title: frame.title,
        oneLiner: frame.oneLiner,
        characterIds: scheduledCharacterIds,
        location,
        runtimeMindStates,
        threadIds: frame.threadIds,
        priorityCharacterIds,
        globalActionCounts: Object.fromEntries(cumulativeActionCounts),
        globalInteractionCounts: Object.fromEntries(cumulativeInteractionCounts),
        carryoverPressures,
        worldConditionPressures: [
          `[목표:${directorPressure.targetScenePurpose ?? "advance_plot"}] ${directorPressure.summary}`,
        ],
        scenePurposeHint: directorPressure.targetScenePurpose,
        ticksPerScene: Math.max(4, characterActionsPerChapter * 2, scheduledCharacterIds.length),
        activationMin: 1,
        activationMax: Math.max(1, characterActionsPerChapter),
      });
      actionLogs.push(...actionSimulation.actionLogs);
      interactionResolutions.push(...actionSimulation.interactionResolutions);
      simulationClocks.push(...actionSimulation.clocks);
      simulationDiagnostics.push(actionSimulation.diagnostics);

      const agentActionEvents = compileActionLogsToSimulationEvents({
        actionLogs: actionSimulation.actionLogs,
        interactionResolutions: actionSimulation.interactionResolutions,
        brain,
        chapter,
        startBeatIndex: events.length,
        title: frame.title,
        location,
        previousEvent,
        threadIds: frame.threadIds,
      });
      for (const event of agentActionEvents) {
        applyEvent(event);
        events.push(event);
        previousEvent = event;
        characterActionEventCount += 1;
        if (event.actorId) {
          cumulativeActionCounts.set(
            event.actorId,
            (cumulativeActionCounts.get(event.actorId) ?? 0) + 1,
          );
          if (event.targetId) {
            const pairKey = `${event.actorId}->${event.targetId}`;
            cumulativeInteractionCounts.set(
              pairKey,
              (cumulativeInteractionCounts.get(pairKey) ?? 0) + 1,
            );
          }
        }
        applyRuntimeMindEvent(runtimeMindStates, event);
      }
      carryoverPressures = collectCarryoverPressures(actionSimulation.actionLogs);
    } else if (enableWorldBrainActions && characterActionsPerChapter > 0) {
      carryoverPressures = [];
      const brainActionEvents = buildWorldBrainActionEvents({
        seed,
        brain,
        runtimeMindStates,
        authority,
        chapter,
        startBeatIndex: events.length,
        title: frame.title,
        oneLiner: frame.oneLiner,
        characterIds: frame.characterIds,
        location,
        previousEvent,
        threadIds: frame.threadIds,
        maxActions: characterActionsPerChapter,
      });
      for (const event of brainActionEvents) {
        applyEvent(event);
        events.push(event);
        previousEvent = event;
        characterActionEventCount += 1;
      }
    }

    const foreshadowEvents = buildForeshadowEvent({
      seed,
      authority,
      chapter,
      beatIndex: events.length,
      characterIds: frame.characterIds,
      location,
      previousEvent,
    });
    for (const event of foreshadowEvents) {
      applyEvent(event);
      events.push(event);
      previousEvent = event;
    }

    const sceneLog = buildSceneLogFromEvents({
      seed,
      chapter,
      title: frame.title,
      oneLiner: frame.oneLiner,
      events,
      tensionLevel: frame.tensionLevel,
      location,
    });
    sceneLogs.push(sceneLog);
    if (!options.skipRenderedChapters) {
      chapters.push(renderChapterFromEvents({
        seed,
        chapter,
        title: frame.title,
        oneLiner: frame.oneLiner,
        events,
        sceneLog,
        tensionLevel: frame.tensionLevel,
        location,
      }));
    }
  }

  const state = authority.getSimulationState();
  const runEvents = state.eventLog.slice(initialEventLogLength);
  const ledger = options.fastLedgerValidation
    ? buildLedgerLight(state.eventLog)
    : buildSimulationCausalLedger(state.eventLog);
  const validation = options.fastLedgerValidation
    ? validateLedgerLight(state.eventLog)
    : validateMajorPlotActionLedger(ledger);
  const generatedChapterCount = options.skipRenderedChapters ? sceneLogs.length : chapters.length;
  const chaptersWithSourceEvents = options.skipRenderedChapters
    ? sceneLogs.filter((sceneLog) => sceneLog.sourceEventIds.length > 0).length
    : chapters.filter((chapter) => chapter.sourceEventIds.length > 0).length;
  const brainSummary = summarizeWorldBrain(brain);
  const runtimeContinuity = evaluateRuntimeContinuity({
    brain,
    events: runEvents,
    runtimeMindStates,
  });
  const checkpoint: WorldModelRunCheckpoint = {
    worldStateAuthority: {
      simulationState: state,
      worldStateProjection: authority.getWorldStateSnapshot(),
    },
    runtimeMindStates: cloneRuntimeMindStates(runtimeMindStates),
    previousEvent,
  };

  return {
    seed,
    brain,
    state,
    ledger,
    sceneLogs,
    actionLogs,
    interactionResolutions,
    simulationClocks,
    simulationDiagnostics,
    runtimeMindStates,
    checkpoint,
    chapters,
    report: {
      mode: "simulation_first_world_model",
      title: seed.title,
      startChapter,
      endChapter,
      generatedChapterCount,
      generatedEventCount: runEvents.length,
      worldBrain: {
        characterMindCount: Number(brainSummary.characterMindCount ?? 0),
        characterActionEventCount,
        narrativeDirectorPressureCount,
        sceneLogCount: sceneLogs.length,
        dialogueTurnCount: sceneLogs.reduce((sum, sceneLog) =>
          sum + sceneLog.dialogueTurns.length, 0),
        runtimeMindStateCount: Object.keys(runtimeMindStates).length,
        runtimeContinuity,
        agentActionSimulation: {
          mode: characterSimulationMode,
          actionLogCount: actionLogs.length,
          interactionResolutionCount: interactionResolutions.length,
          reactionCoverage: simulationDiagnostics.length === 0
            ? 0
            : simulationDiagnostics.reduce((sum, item) => sum + item.reactionCoverage, 0) / simulationDiagnostics.length,
          memoryUpdateRate: simulationDiagnostics.length === 0
            ? 0
            : simulationDiagnostics.reduce((sum, item) => sum + item.memoryUpdateRate, 0) / simulationDiagnostics.length,
        },
      },
      rendererSourceCoverage: {
        renderedChapterCount: chapters.length,
        chaptersWithSourceEvents,
        sourceBackedChapterRatio: generatedChapterCount === 0
          ? 1
          : chaptersWithSourceEvents / generatedChapterCount,
      },
      validation,
      costUsd: 0,
    },
  };
}
