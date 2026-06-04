import { z } from "zod";

import type { NovelSeed } from "@/lib/schema/novel";
import { conjunctiveParticle } from "@/lib/utils/korean";

import type {
  CharacterMind,
  WorldBrain,
} from "./world-brain";
import type { SimulationEvent } from "./types";
import {
  AgentBrainSnapshotSchema,
  buildAgentBrainSnapshot,
  recordAgentBrainDecision,
  type AgentBrainState,
} from "./agent-brain-state";

const StringListSchema = z.array(z.string());

const AgentRoleSchema = z.enum([
  "protagonist",
  "love_interest",
  "villain",
  "antagonist",
  "ally",
  "rival",
  "wildcard",
]);

export const CharacterActionTypeSchema = z.enum([
  "observe",
  "probe_dialogue",
  "counter_probe",
  "deflect_dialogue",
  "request_help",
  "request_access",
  "maintain_mask",
  "withdraw",
  // 사건(plot-level) 행동: 대화 마누버가 아니라 월드 상태를 물질적으로 바꾼다.
  // outline-driven plotBeat 신호가 있을 때만 선택된다 (기본 동작 불변).
  "confront",
  "sabotage",
  "take_physical",
  "awaken_magic",
]);

export const ActionOperatorCategorySchema = z.enum([
  "social",
  "physical",
  "information",
  "magic",
  "political",
]);

export const ActionOperatorStatusSchema = z.enum([
  "accepted",
  "blocked",
  "partial",
  "backfired",
]);

export const PlanLifecycleStatusSchema = z.enum([
  "active",
  "blocked",
  "abandoned",
  "completed",
]);

export const WorldStateDeltaSchema = z.object({
  deltaId: z.string(),
  domain: z.enum(["belief", "relationship", "plan", "memory", "scene_pressure"]),
  operation: z.enum(["record", "update", "increase", "decrease"]),
  summary: z.string(),
  entityIds: StringListSchema,
  cause: z.string(),
});

export const WorldGameMasterResolutionSchema = z.object({
  status: ActionOperatorStatusSchema,
  reason: z.string(),
  checkedPreconditions: StringListSchema,
  failedPreconditions: StringListSchema,
  stateDeltaIds: StringListSchema,
  witnessCharacterIds: StringListSchema,
  newAffordances: StringListSchema,
});

export const CharacterSimulationProfileSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  storyRole: z.string(),
  agentRole: AgentRoleSchema,
  roleMission: z.string(),
  conflictFunction: z.string(),
  decisionPriorities: StringListSchema,
  targetPolicy: z.enum([
    "threat_first",
    "protect_anchor",
    "leverage_first",
    "protagonist_pressure",
    "reciprocal",
    "opportunity_first",
  ]),
  memoryPolicy: z.string(),
  autonomyRule: z.string(),
  activityLevel: z.number().min(0).max(1),
  initiative: z.number().min(0).max(1),
  reactivity: z.number().min(0).max(1),
  riskTolerance: z.number().min(0).max(1),
  socialMaskStrength: z.number().min(0).max(1),
  activeSceneWeights: z.record(z.string(), z.number().min(0).max(1)),
  responseDelayTicks: z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
  influenceWeight: z.number().positive(),
  preferredActionTypes: z.array(CharacterActionTypeSchema),
});

export const SimulationClockSchema = z.object({
  chapter: z.number().int().positive(),
  sceneId: z.string(),
  tick: z.number().int().positive(),
  ticksPerScene: z.number().int().positive(),
  activationMin: z.number().int().positive(),
  activationMax: z.number().int().positive(),
  peakTensionTicks: z.array(z.number().int().positive()),
  quietTicks: z.array(z.number().int().positive()),
});

export const CharacterActionLogSchema = z.object({
  logId: z.string(),
  chapter: z.number().int().positive(),
  sceneId: z.string(),
  tick: z.number().int().positive(),
  actorId: z.string(),
  actorName: z.string(),
  observed: StringListSchema,
  privateState: z.object({
    storyRole: z.string(),
    agentRole: AgentRoleSchema,
    roleMission: z.string(),
    currentPlan: z.string(),
    surfaceGoal: z.string(),
    hiddenGoal: z.string(),
    activeObjective: z.string(),
    activeIntentionId: z.string(),
    activeFear: z.string(),
    decisionPriorities: StringListSchema,
    autonomyRule: z.string(),
	    knownFacts: StringListSchema,
	    retrievedMemoryIds: StringListSchema,
	    trustSnapshot: z.record(z.string(), z.number()),
	    agentBrain: AgentBrainSnapshotSchema,
	  }),
  action: z.object({
    type: CharacterActionTypeSchema,
    operator: z.object({
      id: z.string(),
      category: ActionOperatorCategorySchema,
      preconditions: StringListSchema,
      expectedEffects: StringListSchema,
      cost: z.string(),
      risk: z.string(),
      status: ActionOperatorStatusSchema,
      statusReason: z.string(),
    }),
    intent: z.string(),
    rationale: z.string(),
    speechActHint: z.string(),
  }),
  planLifecycle: z.object({
    planId: z.string(),
    previousStatus: PlanLifecycleStatusSchema,
    nextStatus: PlanLifecycleStatusSchema,
    reason: z.string(),
    activeIntention: z.string(),
    linkedFollowUpActionSeed: z.string(),
  }),
  targetIds: StringListSchema,
  targetNames: StringListSchema,
  visibleBehavior: z.string(),
  intendedEffect: z.string(),
  actualEffect: z.object({
    targetReaction: z.string(),
    followUpActionSeed: z.string(),
    scenePressureDelta: z.number().int(),
    stateDeltas: z.array(WorldStateDeltaSchema).default([]),
    worldGameMaster: WorldGameMasterResolutionSchema,
  }),
  memoryUpdates: z.array(z.object({
    characterId: z.string(),
    summary: z.string(),
  })),
  beliefUpdates: z.array(z.object({
    characterId: z.string(),
    subject: z.string(),
    belief: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    cause: z.string(),
  })),
  trustDeltas: z.record(z.string(), z.number().int()),
  sourceRailIds: StringListSchema,
});

export const InteractionResolutionSchema = z.object({
  resolutionId: z.string(),
  chapter: z.number().int().positive(),
  sceneId: z.string(),
  tick: z.number().int().positive(),
  sourceActionLogIds: StringListSchema,
  speechDraft: z.object({
    speakerId: z.string(),
    speakerName: z.string(),
    targetIds: StringListSchema,
    targetNames: StringListSchema,
    utteranceCandidate: z.string(),
    speechAct: z.string(),
    delivery: z.string(),
    surfaceMeaning: z.string(),
    hiddenIntention: z.string(),
    subtext: z.string(),
  }),
  targetInterpretations: z.array(z.object({
    characterId: z.string(),
    characterName: z.string(),
    interpretedAs: z.string(),
    misreadRisk: z.string(),
    emotionalResponse: z.string(),
  })),
  winnerOrDominantPressure: z.string(),
  misunderstandings: StringListSchema,
  newSharedFacts: StringListSchema,
  newPrivateFacts: StringListSchema,
  emotionalShift: z.object({
    actorBefore: z.string(),
    actorAfter: z.string(),
    targetBefore: z.string().nullable(),
    targetAfter: z.string().nullable(),
    intensityDelta: z.number().int(),
    reason: z.string(),
  }),
  powerShift: z.object({
    axis: z.enum(["information", "social", "emotional", "access"]),
    fromCharacterId: z.string().nullable(),
    toCharacterId: z.string(),
    delta: z.number().int(),
    reason: z.string(),
  }),
  relationshipShift: z.object({
    sourceCharacterId: z.string(),
    targetCharacterId: z.string().nullable(),
    trustDelta: z.number().int(),
    suspicionDelta: z.number().int(),
    dependencyDelta: z.number().int(),
    hostilityDelta: z.number().int(),
    reason: z.string(),
  }),
  scenePressureDelta: z.number().int(),
  nextActionSeeds: StringListSchema,
  writerHooks: z.object({
    gesture: z.string(),
    silence: z.string(),
    sensoryCue: z.string(),
    linePurpose: z.string(),
  }),
});

export const CharacterActionSimulationDiagnosticsSchema = z.object({
  chapter: z.number().int().positive(),
  sceneId: z.string(),
  actionLogCount: z.number().int().nonnegative(),
  reactionCoverage: z.number().min(0).max(1),
  memoryUpdateRate: z.number().min(0),
  repeatedActionTypeWarnings: StringListSchema,
  inactiveCharacterWarnings: StringListSchema,
  unresolvedPressureCount: z.number().int().nonnegative(),
});

export const CharacterActionSimulationResultSchema = z.object({
  clocks: z.array(SimulationClockSchema),
  profiles: z.array(CharacterSimulationProfileSchema),
  actionLogs: z.array(CharacterActionLogSchema),
  interactionResolutions: z.array(InteractionResolutionSchema),
  diagnostics: CharacterActionSimulationDiagnosticsSchema,
});

export type CharacterActionType = z.infer<typeof CharacterActionTypeSchema>;
export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type CharacterSimulationProfile = z.infer<typeof CharacterSimulationProfileSchema>;
export type SimulationClock = z.infer<typeof SimulationClockSchema>;
export type CharacterActionLog = z.infer<typeof CharacterActionLogSchema>;
export type InteractionResolution = z.infer<typeof InteractionResolutionSchema>;
export type CharacterActionSimulationDiagnostics = z.infer<typeof CharacterActionSimulationDiagnosticsSchema>;
export type CharacterActionSimulationResult = z.infer<typeof CharacterActionSimulationResultSchema>;

export interface RuntimeMindSnapshot {
  characterId: string;
  currentPlan: string;
  knownFacts: string[];
  recentMemorySummaries: string[];
  recentVisibleBehaviors?: string[];
  recentUtterances?: string[];
  reflectionNotes?: string[];
  proceduralMemory?: string[];
  actionFatigueByType?: Record<string, number>;
  agentBrainState?: AgentBrainState;
  trustDeltasByCharacter: Record<string, number>;
}

export interface CharacterActionSimulationInput {
  seed: NovelSeed;
  brain: WorldBrain;
  chapter: number;
  sceneId: string;
  title: string;
  oneLiner: string;
  characterIds: string[];
  location: string;
  runtimeMindStates: Record<string, RuntimeMindSnapshot>;
  threadIds: string[];
  priorityCharacterIds?: string[];
  globalActionCounts?: Record<string, number>;
  globalInteractionCounts?: Record<string, number>;
  carryoverPressures?: string[];
  worldConditionPressures?: string[];
  scenePurposeHint?: string;
  ticksPerScene?: number;
  activationMin?: number;
  activationMax?: number;
  /**
   * 사건(plot-level) 행동을 명시적으로 발생시키는 outline-driven 신호.
   * 설정되지 않으면(기본) 시뮬레이션은 기존과 100% 동일하게 동작한다.
   * 설정되면 peak-tension tick에서 자격을 갖춘 actor가 해당 사건을 실행한다.
   */
  plotBeat?: {
    action: CharacterActionType;
    instigatorRoles?: AgentRole[];
  };
}

export interface CompileActionLogsToEventsInput {
  actionLogs: CharacterActionLog[];
  interactionResolutions: InteractionResolution[];
  brain: WorldBrain;
  chapter: number;
  startBeatIndex: number;
  title: string;
  location: string;
  previousEvent?: SimulationEvent;
  threadIds: string[];
}

function compact(values: Array<string | null | undefined>): string[] {
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

function pad(value: number, width = 3): string {
  return String(value).padStart(width, "0");
}

function hasFinalConsonant(value: string): boolean {
  const char = value.trim().at(-1);
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
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

function companion(value: string): string {
  return `${value}${hasFinalConsonant(value) ? "과" : "와"}`;
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^["“”']+|["“”']+$/g, "");
}

function chooseLine(lines: string[], key: string): string {
  return lines[Math.floor(stableScore(key) * lines.length)] ?? lines[0] ?? "";
}

function normalizeMemoryText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function chooseFreshLine(lines: string[], key: string, recentLines: string[] = []): string {
  const normalizedRecent = new Set(recentLines.map(normalizeMemoryText));
  const normalizedLines = lines.map(normalizeMemoryText).filter(Boolean);
  if (normalizedLines.length === 0) return "";

  const startIndex = Math.floor(stableScore(key) * normalizedLines.length);
  for (let offset = 0; offset < normalizedLines.length; offset += 1) {
    const candidate = normalizedLines[(startIndex + offset) % normalizedLines.length]!;
    if (!normalizedRecent.has(candidate)) return candidate;
  }

  const base = normalizedLines[startIndex] ?? normalizedLines[0]!;
  const suffixes = [
    "지금은 이 말만 하겠습니다.",
    "여기서 더 길게 말하진 않겠습니다.",
    "대답은 나중에 다시 듣죠.",
    "그 표정까지 같이 기억하겠습니다.",
    "같은 말은 반복하지 않겠습니다.",
    "이번엔 다르게 확인하겠습니다.",
    "그 답은 조금 더 두고 보겠습니다.",
    "여기서는 표정만 믿지 않겠습니다.",
  ];
  const suffixStartIndex = Math.floor(stableScore(`${key}:fresh-tail`) * suffixes.length);
  for (let offset = 0; offset < suffixes.length; offset += 1) {
    const suffix = suffixes[(suffixStartIndex + offset) % suffixes.length]!;
    const candidate = `${base.replace(/[.!?。！？…]+$/u, "")}. ${suffix}`;
    if (!normalizedRecent.has(normalizeMemoryText(candidate))) return candidate;
  }

  return `${base.replace(/[.!?。！？…]+$/u, "")}. ${suffixes[suffixStartIndex] ?? suffixes[0]} (${key.slice(-6)})`;
}

function chooseFreshTail(lines: string[], key: string, recentLines: string[] = []): string {
  const normalizedRecent = recentLines.map(normalizeMemoryText);
  const normalizedLines = lines.map(normalizeMemoryText).filter(Boolean);
  if (normalizedLines.length === 0) return "";

  const startIndex = Math.floor(stableScore(key) * normalizedLines.length);
  for (let offset = 0; offset < normalizedLines.length; offset += 1) {
    const candidate = normalizedLines[(startIndex + offset) % normalizedLines.length]!;
    if (!normalizedRecent.some((recent) => recent.includes(candidate))) return candidate;
  }

  return chooseFreshLine(normalizedLines, `${key}:tail-fallback`, recentLines);
}

function utteranceFragments(value: string): string[] {
  return value
    .split(/[.?!。！？…]+/u)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 4);
}

interface VoiceTailContext {
  voiceProfile?: { tone: string; speechPatterns: string[]; sampleDialogues: string[] };
}

const COGNITION_TELL_NEEDLES = [
  "마음", "느꼈", "느낀", "느낌", "생각했", "생각이",
  "깨달았", "깨달은", "깨달", "알았다", "알게 되었",
  "꿰뚫어", "간파", "결심했", "고민했", "애썼",
  "진심", "속내", "의도", "숨겨", "감춰",
  "긴장감", "불안감", "경계심",
];

function isCognitionTellFragment(fragment: string): boolean {
  return COGNITION_TELL_NEEDLES.some((needle) => fragment.includes(needle));
}

function buildVoiceTailCandidates(
  voiceProfile: VoiceTailContext["voiceProfile"],
  actionType: CharacterActionType,
): string[] {
  if (!voiceProfile) return [];
  const samples = voiceProfile.sampleDialogues
    .flatMap((dialogue) => utteranceFragments(dialogue))
    .filter((fragment) => fragment.length >= 4 && fragment.length <= 28)
    .filter((fragment) => !isCognitionTellFragment(fragment));
  const patterns = voiceProfile.speechPatterns
    .filter((pattern) => pattern.length >= 3 && pattern.length <= 24)
    .filter((pattern) => !isCognitionTellFragment(pattern));
  return [...samples, ...patterns, ...voiceToneNaturalTails(voiceProfile.tone, actionType)];
}

function voiceToneNaturalTails(
  tone: string,
  actionType: CharacterActionType,
): string[] {
  const isQuiet = /차분|냉정|단정|조용|침착/u.test(tone);
  const isDirect = /직설|단호|날카|예리/u.test(tone);
  const isSoft = /여린|부드|상냥|다정/u.test(tone);
  const isFormal = /격식|정중|단정|냉소/u.test(tone);

  const banks: Record<CharacterActionType, string[]> = {
    observe: [
      ...(isQuiet ? ["일단 듣고 있을게요", "지금은 보기만 하죠"] : []),
      ...(isDirect ? ["짧게 보고 가죠", "필요한 만큼만 봅니다"] : []),
      ...(isSoft ? ["조금만 더 지켜볼게요"] : []),
      "여기서 한 박자 두고 보죠",
    ],
    probe_dialogue: [
      ...(isQuiet ? ["하나만 여쭐게요"] : []),
      ...(isDirect ? ["바로 물어볼게요", "그 부분부터 짚죠"] : []),
      ...(isSoft ? ["혹시 그건 어떻게 보세요"] : []),
      "그것부터 듣고 싶어요",
    ],
    counter_probe: [
      ...(isQuiet ? ["저도 같은 걸 묻고 싶었어요"] : []),
      ...(isDirect ? ["저 먼저 묻죠", "그쪽이 먼저 답하시죠"] : []),
      ...(isFormal ? ["순서가 다른 것 같습니다"] : []),
      "그건 제가 더 궁금한데요",
    ],
    deflect_dialogue: [
      ...(isQuiet ? ["오늘은 거기까지만 할게요"] : []),
      ...(isSoft ? ["다음에 따로 말씀드릴게요"] : []),
      ...(isFormal ? ["이 자리에선 답을 미루겠습니다"] : []),
      "그 얘기는 자리를 옮겨서 해요",
    ],
    request_help: [
      ...(isQuiet ? ["잠깐만 도와주세요"] : []),
      ...(isDirect ? ["손이 하나 더 필요해요"] : []),
      ...(isSoft ? ["부탁 하나 드려도 될까요"] : []),
      "혼자 못 할 일이라서요",
    ],
    request_access: [
      ...(isQuiet ? ["잠깐 확인만 할게요"] : []),
      ...(isFormal ? ["열어 봐도 되겠습니까"] : []),
      ...(isDirect ? ["지금 봅시다"] : []),
      "한 번만 보게 해 주세요",
    ],
    maintain_mask: [
      ...(isQuiet ? ["오늘은 평소대로 갈게요"] : []),
      ...(isSoft ? ["별일 아니에요"] : []),
      ...(isFormal ? ["그대로 두시는 게 좋겠습니다"] : []),
      "여기까지만 보여 드릴게요",
    ],
    withdraw: [
      ...(isQuiet ? ["오늘은 여기까지 할게요"] : []),
      ...(isFormal ? ["다음 기회에 다시 청합니다"] : []),
      ...(isDirect ? ["일단 빠지겠습니다"] : []),
      "이쯤에서 끊죠",
    ],
    confront: [
      ...(isDirect ? ["이제 분명히 하죠", "더는 둘러대지 않습니다"] : []),
      ...(isQuiet ? ["할 말은 지금 하겠어요"] : []),
      "오늘은 짚고 넘어가죠",
    ],
    sabotage: [
      ...(isQuiet ? ["조용히 정리하죠"] : []),
      "이건 여기서 끊어 두겠어요",
    ],
    take_physical: [
      ...(isDirect ? ["이건 제가 맡아 두죠"] : []),
      "이 물건은 제가 가져갑니다",
    ],
    awaken_magic: [
      ...(isQuiet ? ["이제 숨기지 않을게요"] : []),
      "여기서 보여 드리죠",
    ],
  };

  const list = banks[actionType] ?? [];
  return list.filter(Boolean);
}

function speechVariationTail(input: {
  actionType: CharacterActionType;
  intent: string;
  hiddenGoal: string;
  key: string;
  worldConditionPressures?: string[];
  recentUtterances?: string[];
  voiceProfile?: VoiceTailContext["voiceProfile"];
}): string {
  const voiceCandidates = buildVoiceTailCandidates(input.voiceProfile, input.actionType);
  if (voiceCandidates.length > 0) {
    return chooseFreshTail(voiceCandidates, `${input.key}:voice-tail`, input.recentUtterances);
  }

  // Fallback (voice profile 없는 minor 캐릭터용): 자연 화법 generic, 격언체 X.
  const actionFallback: Record<CharacterActionType, string[]> = {
    observe: ["지금은 보기만 할게요", "한 박자 두고 보죠"],
    probe_dialogue: ["그것부터 들을게요", "먼저 물어볼게요"],
    counter_probe: ["저도 같은 게 궁금해요", "순서를 바꿔서 듣죠"],
    deflect_dialogue: ["오늘은 거기까지 할게요", "자리를 옮겨서 얘기해요"],
    request_help: ["손이 하나 더 필요해요", "잠깐만 같이 봐 주세요"],
    request_access: ["한 번만 보게 해 주세요", "지금 확인하죠"],
    maintain_mask: ["여기까지만 보여 드릴게요"],
    withdraw: ["이쯤에서 끊을게요"],
    confront: ["이제 분명히 하죠", "더는 미루지 않을게요"],
    sabotage: ["조용히 정리하죠"],
    take_physical: ["이건 제가 가져갈게요"],
    awaken_magic: ["여기서 보여 드리죠"],
  };
  return chooseFreshTail(
    actionFallback[input.actionType] ?? [],
    `${input.key}:speech-tail-fallback`,
    input.recentUtterances,
  );
}

function speechContextTail(input: {
  worldConditionPressures?: string[];
  location?: string;
  key: string;
  recentUtterances?: string[];
  voiceProfile?: VoiceTailContext["voiceProfile"];
}): string {
  // Voice profile 있는 캐릭터는 보조 격언체 tail 자체를 붙이지 않는다.
  // 격언체 풀은 사용자 어색 보고의 원흉이었음.
  if (input.voiceProfile) return "";
  const label = pressureTopic(input.worldConditionPressures ?? []);
  const text = `${input.location ?? ""} ${(input.worldConditionPressures ?? []).join(" ")}`;
  const candidates = compact([
    ...(/하인|명단|사용인/u.test(text) ? [
      "명단의 빈칸은 아직 닫히지 않았습니다",
      "하인들의 말이 맞기 전에 움직이죠",
      "이름 하나가 비면 모두의 말이 달라집니다",
      "빈 이름 하나가 방 안의 순서를 바꾸고 있습니다",
      "누가 같은 대답을 외웠는지 먼저 보겠습니다",
      "명부가 닫히면 남는 건 표정뿐입니다",
      "아직 맞춰지지 않은 말이 있습니다",
      "그 빈칸은 그냥 생긴 게 아닙니다",
    ] : []),
    ...(/감시|경비|교대|초소/u.test(text) ? [
      "교대 전 빈틈은 길지 않습니다",
      "경비의 발걸음이 겹치기 전입니다",
      "누가 지켜봤는지부터 정해야 합니다",
      "다음 발소리가 오기 전에 위치를 바꿔야 합니다",
      "지켜보는 눈이 바뀌면 같은 말도 달라집니다",
      "복도 끝 간격이 지금만 비어 있습니다",
    ] : []),
    ...(/문서|기록|서고|봉쇄|장부/u.test(text) ? [
      "기록은 말보다 늦게 지워집니다",
      "봉인 끈이 마르기 전에 봐야 합니다",
      "장부가 닫히면 남는 건 소문뿐입니다",
      "접힌 자국은 말보다 오래 남습니다",
      "다시 묶인 서류는 다른 증언이 됩니다",
      "기록함이 닫히기 전의 순서가 필요합니다",
    ] : []),
    ...(/서명|시한|마감|시간/u.test(text) ? [
      "서명란이 채워지면 되돌리기 어렵습니다",
      "시한이 지나면 같은 말도 다른 증거가 됩니다",
      "다음 종이 울리기 전까지가 기회입니다",
      "도장이 올라가면 질문은 늦어집니다",
      "지금 남은 시간은 말보다 짧습니다",
      "초가 넘어가기 전의 답이 필요합니다",
    ] : []),
    ...(/열쇠|권한|허락/u.test(text) ? [
      "허락은 말보다 열쇠가 먼저 증명합니다",
      "권한이 넘어가면 문은 같은 문이 아닙니다",
      "열쇠가 누구 손에 있는지부터 보겠습니다",
      "문턱을 넘은 사람의 이름이 먼저 남습니다",
      "허락받은 길과 훔친 길은 다르게 닫힙니다",
      "열린 문도 증인이 있으면 잠깁니다",
    ] : []),
    `${label}은 말보다 흔적이 먼저 남습니다`,
    `${label}을 누가 먼저 보았는지부터 정하죠`,
    `${label}이 굳기 전에 한 번만 더 확인하겠습니다`,
    `${label}을 말로 정하기 전에 움직인 손부터 보겠습니다`,
    `${label}의 순서는 아직 완전히 닫히지 않았습니다`,
    `${label}이 닫히면 침묵도 증언이 됩니다`,
  ]);
  return chooseFreshTail(candidates, `${input.key}:speech-context:${label}`, input.recentUtterances);
}

function shouldAttachSpeechContextTail(input: {
  actionType: CharacterActionType;
  key: string;
  base: string;
  tail: string;
  contextTail: string;
}): boolean {
  if (!input.contextTail) return false;

  const alreadyGrounded = pressureTopicWords(input.contextTail).some((word) =>
    input.base.includes(word) || input.tail.includes(word)
  );
  const score = stableScore(`${input.key}:attach-context-tail`);
  const thresholdByAction: Record<CharacterActionType, number> = {
    probe_dialogue: 0.7,
    request_access: 0.7,
    request_help: 0.55,
    counter_probe: 0.5,
    deflect_dialogue: 0.38,
    observe: 0.34,
    maintain_mask: 0.28,
    withdraw: 0.26,
    confront: 0.5,
    sabotage: 0.4,
    take_physical: 0.4,
    awaken_magic: 0.45,
  };
  const threshold = thresholdByAction[input.actionType];

  if (alreadyGrounded) {
    return score < threshold * 0.45;
  }
  return score < threshold;
}

function pressureTopicWords(value: string): string[] {
  return compact([
    /명단|명부|하인|사용인|빈칸|이름/u.test(value) ? "명단" : "",
    /경비|감시|교대|초소|발소리/u.test(value) ? "경비" : "",
    /기록|문서|서고|봉인|장부/u.test(value) ? "기록" : "",
    /서명|시한|마감|시간|종/u.test(value) ? "시한" : "",
    /열쇠|권한|허락|문턱/u.test(value) ? "권한" : "",
    /증인|증언|목격/u.test(value) ? "증언" : "",
  ]);
}

function worldConditionSpeechTails(pressures: string[]): string[] {
  const text = pressures.join(" ");
  return compact([
    ...(/증인|공개 발언/.test(text) ? [
      "증인이 듣기 전에요",
      "공개 발언으로 굳기 전에요",
      "누가 들었는지 정해지기 전에요",
    ] : []),
    ...(/소문|거짓 증언|목격담/.test(text) ? [
      "소문이 먼저 돌기 전에요",
      "목격담이 이름을 얻기 전에요",
      "거짓 증언이 자리를 잡기 전에요",
      "말이 복도를 건너기 전에요",
    ] : []),
    ...(/봉쇄|출입|기록|문서|서고/.test(text) ? [
      "닫힌 기록부터 열어야 합니다",
      "문서가 사라지기 전에요",
      "출입 명분이 끊기기 전에요",
      "서류 행방을 지금 확인해야 합니다",
      "봉인이 마르기 전까지가 기회입니다",
      "장부가 다시 묶이면 늦습니다",
      "문턱의 허락이 닫히기 전에요",
    ] : []),
    ...(/서명|갱신|시간|시각|마감/.test(text) ? [
      "시한이 지나기 전에요",
      "서명란이 채워지면 늦습니다",
      "다음 종이 울리기 전에요",
      "기록 시간이 바뀌기 전입니다",
      "마감 도장이 찍히면 끝입니다",
    ] : []),
    ...(/열쇠|권한|허락/.test(text) ? [
      "권한이 넘어가기 전에요",
      "열쇠의 주인이 바뀌기 전에요",
      "허락이 말로 굳기 전에요",
    ] : []),
    ...(/감시|경비|교대/.test(text) ? [
      "감시가 바뀌기 전에요",
      "경비가 자리를 옮기기 전에요",
      "다음 눈이 이쪽을 보기 전에요",
      "문가가 다시 조용해지는 순간을 보죠",
      "초소의 발걸음이 겹치기 전입니다",
      "경비 명단이 맞춰지면 늦습니다",
      "복도 끝 소리가 낮아지는 지금입니다",
      "발걸음 간격이 벌어진 틈을 보겠습니다",
    ] : []),
    ...(/하인|명단|사용인/.test(text) ? [
      "명단의 빈칸부터 보겠습니다",
      "비어 있던 이름이 곧 확정됩니다",
      "하인 명부가 닫히면 늦습니다",
      "빈 줄 하나가 증거를 삼키겠습니다",
      "하인들의 말이 맞춰지기 전에요",
      "사용인들의 입이 닫히기 전에요",
      "명단 끝에 다른 이름이 붙기 전에요",
      "장부 끝의 이름부터 확인하겠습니다",
      "사용인 표식이 바뀌기 전입니다",
    ] : []),
  ]);
}

function punctuateSpeechSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.!?。！？…]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinSpeechSentences(parts: string[]): string {
  return parts
    .map((part) => punctuateSpeechSentence(part))
    .filter(Boolean)
    .join(" ");
}

function decorateUtterance(input: {
  base: string;
  actionType: CharacterActionType;
  intent: string;
  hiddenGoal: string;
  key: string;
  recentUtterances?: string[];
  worldConditionPressures?: string[];
  location?: string;
  voiceProfile?: VoiceTailContext["voiceProfile"];
}): string {
  const normalizedBase = input.base.replace(/[.!?。！？…]+$/u, "");
  const tail = speechVariationTail({
    ...input,
    recentUtterances: input.recentUtterances,
  });
  const contextTail = speechContextTail({
    worldConditionPressures: input.worldConditionPressures,
    location: input.location,
    key: input.key,
    recentUtterances: input.recentUtterances,
    voiceProfile: input.voiceProfile,
  });
  const attachContextTail = shouldAttachSpeechContextTail({
    actionType: input.actionType,
    key: input.key,
    base: normalizedBase,
    tail,
    contextTail,
  });
  const candidate = joinSpeechSentences(attachContextTail
    ? [normalizedBase, tail, contextTail]
    : [normalizedBase, tail]);
  if (!(input.recentUtterances ?? []).map(normalizeMemoryText).includes(normalizeMemoryText(candidate))) {
    return candidate;
  }
  return chooseFreshLine([
    candidate,
    joinSpeechSentences([normalizedBase, tail, "그래서 지금 확인하죠"]),
    joinSpeechSentences([normalizedBase, tail, "그러니 말은 여기까지만 하죠"]),
    joinSpeechSentences([normalizedBase, tail, "같은 답은 반복하지 않겠습니다"]),
    joinSpeechSentences([normalizedBase, tail, "그 표정까지 확인하겠습니다"]),
    joinSpeechSentences([normalizedBase, tail, "다음 말은 장소를 바꾸겠습니다"]),
  ], `${input.key}:decorated`, input.recentUtterances);
}

function pressureTopic(pressures: string[]): string {
  const text = pressures.join(" ");
  if (/하인|명단|사용인/.test(text)) return "명단";
  if (/감시|경비|교대/.test(text)) return "경비";
  if (/소문|거짓 증언|목격담/.test(text)) return "소문";
  if (/봉쇄|출입|기록|문서|서고/.test(text)) return "기록";
  if (/서명|갱신|시간|시각|마감/.test(text)) return "시한";
  if (/열쇠|권한|허락/.test(text)) return "권한";
  if (/증인|공개 발언/.test(text)) return "증언";
  return "이 일";
}

function contextualUtteranceCandidates(input: {
  actionType: CharacterActionType;
  address: string;
  actorRole: string;
  hiddenGoal: string;
  worldConditionPressures?: string[];
}): string[] {
  const topicLabel = pressureTopic(input.worldConditionPressures ?? []);
  const address = input.address;
  const roleAngle = input.actorRole.includes("주인공")
    ? "제가 먼저"
    : input.actorRole.includes("남주")
      ? "제가 보기엔"
      : input.actorRole.includes("악역")
        ? "다들 오해하시지만"
        : input.actorRole.includes("안타고니스트")
          ? "절차상"
          : input.actorRole.includes("조력")
            ? "제가 조용히"
            : "지금은";
  const goalNudge = /빼앗|무력화|통제/.test(input.hiddenGoal)
    ? "너무 빨리 정하면 모두가 곤란해져요"
    : /보호|위험|대신/.test(input.hiddenGoal)
      ? "무리하실 일은 제가 먼저 보겠습니다"
      : /복수|살아남|증거/.test(input.hiddenGoal)
        ? "확인하지 않은 말은 믿지 않겠습니다"
        : "말보다 남은 흔적을 보겠습니다";
  const mapping: Record<CharacterActionType, string[]> = {
    observe: [
      `${address}, 지금 ${topicLabel}보다 손끝이 먼저 움직였어요.`,
      `${roleAngle} 말보다 멈춘 쪽을 봐야겠습니다.`,
      `${address}, 그 침묵은 그냥 넘어가기 어렵네요.`,
    ],
    probe_dialogue: [
      `${address}, ${topicLabel} 얘기부터 바로잡죠.`,
      `${address}, 대답을 고르기 전에 근거부터 말씀해 주세요.`,
      `${roleAngle} 빠진 이름 하나가 더 있습니다.`,
    ],
    counter_probe: [
      `${address}, 그 질문은 제게 돌리기엔 너무 이릅니다.`,
      `${topicLabel}을 먼저 꺼낸 쪽이 답할 차례 아닌가요?`,
      `${address}, 제 대답보다 당신의 이유가 먼저입니다.`,
    ],
    deflect_dialogue: [
      `${address}, 그 이야기는 여기서 크게 만들 일이 아니에요.`,
      `그 말은 아직 이 방 밖으로 나갈 필요가 없어요.`,
      `지금은 대답보다 듣는 사람이 문제예요.`,
      `${address}, 목소리를 낮추는 편이 좋겠어요.`,
      `그 질문은 지금 꺼내면 모두의 말이 달라져요.`,
      `그 부분은 나중에 확인하시죠. 지금은 ${topicLabel}이 먼저예요.`,
      `${address}, 너무 확신하시면 오히려 이상해 보여요.`,
    ],
    request_help: [
      `${address}, ${topicLabel} 쪽은 제가 맡겠습니다.`,
      `${address}, 한 번만 제 말을 따라 주세요.`,
      `${roleAngle} 움직일 테니 여기서는 표정만 지켜 주세요.`,
    ],
    request_access: [
      `${address}, ${topicLabel}을 확인할 권한만 열어 주세요.`,
      `${address}, 문을 여는 이유는 충분히 만들 수 있습니다.`,
      `${roleAngle} 들어가야 할 곳과 물러날 곳을 구분하겠습니다.`,
    ],
    maintain_mask: [
      `${address}, 그렇게까지 걱정하실 일은 아니에요.`,
      `저는 괜찮습니다. ${topicLabel} 얘기도 곧 정리될 거예요.`,
      `${goalNudge}.`,
    ],
    withdraw: [
      `${address}, 오늘 대답은 여기까지 듣겠습니다.`,
      `${topicLabel}은 남겨 두죠. 다음에 다른 말이 나올 겁니다.`,
      `${roleAngle} 여기서 물러나는 편이 더 낫겠습니다.`,
    ],
    confront: [
      `${address}, 이제 분명히 하죠.`,
      `${address}, 더는 모른 척하지 않겠습니다.`,
      `${roleAngle} 오늘은 짚고 넘어가야겠습니다.`,
    ],
    sabotage: [
      `${roleAngle} 이건 조용히 끊어 두겠습니다.`,
      `${topicLabel} 쪽은 제가 정리하겠습니다.`,
    ],
    take_physical: [
      `${address}, 이 물건은 여기 두지 않겠습니다.`,
      `이건 제가 가져가겠습니다.`,
    ],
    awaken_magic: [
      `${address}, 이제 숨길 이유가 없군요.`,
      `여기서 보여 드리죠.`,
    ],
  };
  return mapping[input.actionType];
}

function chooseFreshBehavior(variants: string[], key: string, recentBehaviors: string[] = []): string {
  const normalizedRecent = new Set(recentBehaviors.map(normalizeMemoryText));
  const normalizedVariants = variants.map(normalizeMemoryText).filter(Boolean);
  if (normalizedVariants.length === 0) return "";

  const startIndex = Math.floor(stableScore(key) * normalizedVariants.length);
  for (let offset = 0; offset < normalizedVariants.length; offset += 1) {
    const candidate = normalizedVariants[(startIndex + offset) % normalizedVariants.length]!;
    if (!normalizedRecent.has(candidate)) return candidate;
  }

  const base = normalizedVariants[startIndex] ?? normalizedVariants[0]!;
  const modifiers = [
    "조금 더 느린 호흡으로",
    "주변 시선을 의식하며",
    "한 박자 늦게",
    "감정을 더 단단히 누른 채",
  ];
  const physicalAnchors = [
    "찻잔 가장자리를 짚고",
    "소매 끝을 정리하며",
    "문가의 기척을 확인하고",
    "창문 쪽 그림자를 스치듯 보고",
    "의자 등받이에 손을 얹고",
    "바닥의 빛 번짐을 피하며",
    "테이블 위 물건의 위치를 기억하고",
    "복도 쪽 소리를 끊어 들으며",
  ];
  const socialAngles = [
    "말의 주도권을 빼앗지 않는 선에서",
    "상대가 먼저 눈을 피하는지 보며",
    "증인으로 남을 사람들의 위치를 재고",
    "방금 나온 단어 하나를 붙잡아 둔 채",
    "자기 표정이 먼저 읽히지 않게",
    "다음 질문의 방향을 숨긴 채",
    "물러설 명분을 남겨 둔 채",
    "거절당했을 때의 퇴로를 계산하며",
  ];
  return [
    base,
    chooseLine(modifiers, `${key}:fresh-behavior`),
    chooseLine(physicalAnchors, `${key}:fresh-anchor`),
    chooseLine(socialAngles, `${key}:fresh-angle`),
  ].join(", ");
}

function behaviorContextTail(input: {
  location: string;
  worldConditionPressures?: string[];
  key: string;
}): string {
  const text = `${input.location} ${(input.worldConditionPressures ?? []).join(" ")}`;
  const candidates = compact([
    ...(/응접|연회|별궁/u.test(text) ? [
      "찻잔의 위치를 곁눈으로 재며",
      "장식장 유리에 비친 표정을 확인하며",
      "문가에 선 사람들의 시선을 세며",
    ] : []),
    ...(/문서|기록|서고|장부|명단/u.test(text) ? [
      "종이 끝에 남은 접힌 자국을 보며",
      "봉인 끈의 느슨한 매듭을 확인하며",
      "장부의 빈칸을 곁눈으로 재며",
    ] : []),
    ...(/경비|초소|감시|교대|복도|회랑/u.test(text) ? [
      "복도 끝 발소리의 간격을 세며",
      "교대 직전의 짧은 빈틈을 붙잡고",
      "문가의 그림자가 겹치는 순간을 보며",
    ] : []),
    ...(/마법|봉인|결계|금서|관측/u.test(text) ? [
      "기록석 표면의 미세한 빛을 따라가며",
      "결계선이 흔들린 지점을 기억하며",
      "봉인 문양의 어긋난 획을 확인하며",
    ] : []),
    ...(/서명|권한|허락|열쇠/u.test(text) ? [
      "서명란이 비어 있는 쪽을 먼저 보며",
      "열쇠가 놓인 방향을 확인하며",
      "허락을 말로 굳히기 전의 틈을 재며",
    ] : []),
  ]);
  if (candidates.length === 0) {
    return chooseLine([
      "가장 가까운 물건의 위치를 기억하며",
      "방금 멈춘 시선의 방향을 따라가며",
      "말보다 먼저 바뀐 거리를 확인하며",
    ], `${input.key}:behavior-context:fallback`);
  }
  return chooseLine(candidates, `${input.key}:behavior-context`);
}

function behaviorPressureTail(input: {
  worldConditionPressures?: string[];
  key: string;
}): string {
  const topicLabel = pressureTopic(input.worldConditionPressures ?? []);
  const variantsByTopic: Record<string, string[]> = {
    명단: [
      "명단의 빈칸을 다음 말의 기준으로 삼고",
      "사용인 이름이 맞물리는 순서를 기억하고",
      "명부 끝의 어긋난 줄을 마음속에 접어 두고",
      "하인들의 증언이 겹치는 지점을 따로 세며",
      "비어 있는 이름 하나를 다음 질문으로 남기고",
      "기록된 이름과 들은 이름의 차이를 붙잡고",
    ],
    경비: [
      "경비 동선이 비는 순간을 기다리고",
      "교대 간격이 어긋난 쪽을 조용히 세며",
      "복도 끝 발소리를 다음 판단에 얹고",
      "감시가 멀어지는 방향을 먼저 확인하고",
      "초소 쪽 시선이 끊긴 틈을 기억하고",
      "문가의 침묵이 길어진 이유를 남겨 두고",
    ],
    기록: [
      "봉인 끈의 위치를 다음 근거로 남기고",
      "장부의 빈칸이 가리키는 순서를 떠올리고",
      "문서 가장자리의 접힌 자국을 따로 기억하고",
      "기록이 닫히기 전의 어긋남을 붙잡고",
      "서고 안쪽의 침묵을 증거처럼 남기고",
      "종이 위에서 사라진 이름의 자리를 세며",
    ],
    시한: [
      "마감 전 남은 호흡을 계산하고",
      "서명란이 채워지기 전의 틈을 재고",
      "다음 종이 울리기 전까지의 거리를 가늠하고",
      "시간이 증언을 바꾸기 전의 표정을 남기고",
      "봉인 갱신 전 마지막 순서를 정리하고",
      "늦어지면 사라질 말을 먼저 붙잡고",
    ],
    권한: [
      "허락의 경계가 닫히는 선을 확인하고",
      "열쇠가 누구 손에 있는지 다시 세며",
      "문턱을 넘을 명분과 대가를 함께 남기고",
      "접근권이 바뀌기 전의 시선을 붙잡고",
      "말로 굳지 않은 허락의 틈을 재고",
      "권한을 내준 사람의 표정을 따로 기억하고",
    ],
    증언: [
      "증인이 들은 말과 삼킨 말을 나누어 두고",
      "공개 발언으로 굳기 전의 숨을 확인하고",
      "목격담이 이름을 얻는 순간을 기다리고",
      "같은 장면을 다르게 본 사람을 마음속에 세우고",
      "소문이 증언으로 바뀌기 전의 빈칸을 남기고",
      "말이 복도를 건너기 전의 표정을 붙잡고",
    ],
    "이 일": [
      "다음 판단에 남길 작은 차이를 세고",
      "방금 바뀐 거리와 침묵을 함께 기억하고",
      "상대가 먼저 감춘 쪽을 조용히 남기고",
      "말보다 늦게 움직인 손끝을 확인하고",
      "장면의 방향이 꺾인 지점을 따로 표시하고",
      "다음 질문으로 이어질 틈을 남겨 두고",
    ],
  };
  return chooseLine(
    variantsByTopic[topicLabel] ?? variantsByTopic["이 일"],
    `${input.key}:behavior-pressure:${topicLabel}`,
  );
}

function relationshipPatternCandidates(speechRule?: string): string[] {
  const marker = "자주 쓰는 표현:";
  const index = speechRule?.indexOf(marker) ?? -1;
  if (!speechRule || index < 0) return [];
  return speechRule.slice(index + marker.length)
    .split(" / ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function characterName(brain: WorldBrain, characterId: string): string {
  return brain.characterMinds[characterId]?.name ?? characterId;
}

function relationTrust(mind: CharacterMind, targetId: string): number {
  return mind.relationshipModel[targetId]?.trustLevel ?? 0;
}

function stableScore(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function agentRoleForStoryRole(storyRole: string): AgentRole {
  if (storyRole.includes("남주")) return "love_interest";
  if (storyRole.includes("주인공")) return "protagonist";
  if (storyRole.includes("안타고니스트")) return "antagonist";
  if (storyRole.includes("악역")) return "villain";
  if (storyRole.includes("조력")) return "ally";
  if (storyRole.includes("라이벌")) return "rival";
  return "wildcard";
}

function roleMissionForMind(mind: CharacterMind, agentRole: AgentRole): string {
  const mapping: Record<AgentRole, string> = {
    protagonist: `살아남기 위해 '${mind.desires.hiddenGoal}' 목표를 자기 주도로 추진한다`,
    love_interest: `'${mind.desires.hiddenGoal}' 목표를 지키면서 주인공과의 이해관계를 계산한다`,
    villain: `'${mind.desires.hiddenGoal}' 목표를 숨기고 주인공의 확신을 흔든다`,
    antagonist: `'${mind.desires.hiddenGoal}' 목표를 위해 관계와 제도를 통제한다`,
    ally: `'${mind.desires.hiddenGoal}' 목표를 우선해 보호 대상의 위험을 줄인다`,
    rival: `'${mind.desires.hiddenGoal}' 목표를 위해 경쟁자의 빈틈을 만든다`,
    wildcard: `'${mind.desires.hiddenGoal}' 목표를 위해 가장 유리한 선택지를 찾는다`,
  };
  return mapping[agentRole];
}

function conflictFunctionForMind(mind: CharacterMind, agentRole: AgentRole): string {
  const mapping: Record<AgentRole, string> = {
    protagonist: "장면의 진실을 캐내고 다음 선택지를 연다",
    love_interest: "동맹 가능성과 자기 이익 사이의 긴장을 만든다",
    villain: "겉으로는 선의를 보이며 정보를 흐리고 죄책감을 유도한다",
    antagonist: "권위와 약속을 이용해 타인의 행동 범위를 좁힌다",
    ally: "위험을 먼저 감지하고 보호 대상의 무리한 행동을 제어한다",
    rival: "주도권을 빼앗기 위해 상대의 약점을 건드린다",
    wildcard: "정해진 편 없이 장면 압력을 예측 불가능하게 흔든다",
  };
  return `${mapping[agentRole]}: ${mind.currentPlan}`;
}

function decisionPrioritiesForMind(mind: CharacterMind, agentRole: AgentRole): string[] {
  const common = compact([
    `현재 계획 유지: ${mind.currentPlan}`,
    `숨은 목표 보호: ${mind.desires.hiddenGoal}`,
    mind.fears[0] ? `두려움 회피: ${mind.fears[0]}` : null,
  ]);
  const roleSpecific: Record<AgentRole, string[]> = {
    protagonist: ["증거 확보", "가면 유지", "다음 반격 경로 확보"],
    love_interest: ["위험한 정보 선점", "동맹 가치 평가", "황실 약점 보호"],
    villain: ["피해자 가면 유지", "의심 분산", "상대 감정 조작"],
    antagonist: ["권력 질서 유지", "약속과 의무로 압박", "도구화 가능한 관계 보존"],
    ally: ["보호 대상 안전", "실무 위험 차단", "불필요한 노출 방지"],
    rival: ["상대 주도권 흔들기", "공개 망신 회피", "자기 세력 이익"],
    wildcard: ["이익 계산", "정보 확보", "위험 회피"],
  };
  return compact([...roleSpecific[agentRole], ...common]).slice(0, 6);
}

function targetPolicyForRole(agentRole: AgentRole): CharacterSimulationProfile["targetPolicy"] {
  const mapping: Record<AgentRole, CharacterSimulationProfile["targetPolicy"]> = {
    protagonist: "threat_first",
    love_interest: "opportunity_first",
    villain: "protagonist_pressure",
    antagonist: "leverage_first",
    ally: "protect_anchor",
    rival: "threat_first",
    wildcard: "reciprocal",
  };
  return mapping[agentRole];
}

function memoryPolicyForRole(agentRole: AgentRole): string {
  const mapping: Record<AgentRole, string> = {
    protagonist: "의심, 증거, 배신 징후를 우선 저장한다",
    love_interest: "위험 정보와 동맹 가능성을 분리해 저장한다",
    villain: "자기 가면을 위협하는 반응과 조작 가능한 약점을 저장한다",
    antagonist: "통제 가능한 약속, 약점, 권력 비용을 저장한다",
    ally: "보호 대상의 상태 변화와 즉시 대응할 위험을 저장한다",
    rival: "경쟁자의 실수와 공개적으로 활용 가능한 약점을 저장한다",
    wildcard: "이익이 되는 관찰만 선택적으로 저장한다",
  };
  return mapping[agentRole];
}

function autonomyRuleForRole(agentRole: AgentRole): string {
  const mapping: Record<AgentRole, string> = {
    protagonist: "플롯을 기다리지 않고 생존과 복수에 유리한 단서를 직접 만든다",
    love_interest: "호감보다 이해관계와 위험 계산을 먼저 수행한다",
    villain: "항상 선의의 얼굴을 유지하되 내부 목표는 별도로 최적화한다",
    antagonist: "개인의 감정보다 지위와 통제 가능성을 우선한다",
    ally: "주인공 명령보다 주인공 안전을 우선할 수 있다",
    rival: "상대가 움직이면 공개/비공개 중 더 손해를 주는 방식을 고른다",
    wildcard: "어느 편에도 완전히 묶이지 않고 장면의 이익을 재계산한다",
  };
  return mapping[agentRole];
}

export function buildCharacterSimulationProfiles(brain: WorldBrain): CharacterSimulationProfile[] {
  return Object.values(brain.characterMinds).map((mind) => {
    const agentRole = agentRoleForStoryRole(mind.role);
    const secretPressure = Math.min(1, mind.secrets.length / 4);
    const relationshipCount = Object.keys(mind.relationshipModel).length;
    const hasAccess = mind.access.accessRights.length > 0;
    const preferredByRole: Record<AgentRole, CharacterActionType[]> = {
      protagonist: ["probe_dialogue", "counter_probe", "maintain_mask", "request_access"],
      love_interest: ["observe", "request_access", "counter_probe", "request_help"],
      villain: ["deflect_dialogue", "maintain_mask", "probe_dialogue", "withdraw"],
      antagonist: ["probe_dialogue", "deflect_dialogue", "request_access", "maintain_mask"],
      ally: ["request_help", "observe", "counter_probe", "maintain_mask"],
      rival: ["counter_probe", "probe_dialogue", "deflect_dialogue", "withdraw"],
      wildcard: ["observe", "probe_dialogue", "request_access", "withdraw"],
    };
    const preferredActionTypes = compact([
      ...preferredByRole[agentRole],
      secretPressure > 0.4 ? "maintain_mask" : null,
      hasAccess ? "request_access" : null,
      relationshipCount > 0 ? "counter_probe" : null,
    ]) as CharacterActionType[];

    return CharacterSimulationProfileSchema.parse({
      characterId: mind.characterId,
      name: mind.name,
      storyRole: mind.role,
      agentRole,
      roleMission: roleMissionForMind(mind, agentRole),
      conflictFunction: conflictFunctionForMind(mind, agentRole),
      decisionPriorities: decisionPrioritiesForMind(mind, agentRole),
      targetPolicy: targetPolicyForRole(agentRole),
      memoryPolicy: memoryPolicyForRole(agentRole),
      autonomyRule: autonomyRuleForRole(agentRole),
      activityLevel: clamp01(0.45 + secretPressure * 0.25 + stableScore(mind.characterId) * 0.2),
      initiative: clamp01(0.35 + mind.desires.hiddenGoal.length / 160 + (agentRole === "protagonist" ? 0.2 : 0)),
      reactivity: clamp01(0.35 + relationshipCount / 8 + (agentRole === "ally" ? 0.15 : 0)),
      riskTolerance: clamp01(0.3 + (mind.leveragePoints.length + mind.access.accessRights.length) / 10 + (agentRole === "antagonist" ? 0.15 : 0)),
      socialMaskStrength: clamp01(0.45 + mind.voiceRules.length / 16),
      activeSceneWeights: {
        court: mind.faction ? 0.7 : 0.4,
        private_room: secretPressure > 0 ? 0.8 : 0.5,
        public_event: mind.socialMask ? 0.65 : 0.4,
      },
      responseDelayTicks: {
        min: 1,
        max: secretPressure > 0.5 ? 2 : 3,
      },
      influenceWeight: Math.max(0.5, 1 + relationshipCount * 0.15 + mind.leveragePoints.length * 0.1),
      preferredActionTypes,
    });
  });
}

function selectSceneCharacterIds(input: CharacterActionSimulationInput): string[] {
  const introduced = input.seed.characters
    .filter((character) => character.introduction_chapter <= input.chapter)
    .map((character) => character.id);
  // Fallback only when caller didn't anchor the scene cast. If an outline
  // pinned characters (via input.characterIds), respect it strictly — don't
  // smuggle introduced characters in just because they were available.
  const hasAnchoredCast = input.characterIds.length > 0;
  const fallbackIds = hasAnchoredCast ? [] : introduced.slice(0, 3);
  return compact([
    ...input.characterIds,
    ...(input.priorityCharacterIds ?? []),
    ...fallbackIds,
  ]).filter((characterId) => input.brain.characterMinds[characterId]);
}

function selectActorIdForTick(input: {
  tick: number;
  sceneId: string;
  sceneCharacterIds: string[];
  profilesById: Map<string, CharacterSimulationProfile>;
  previousLog?: CharacterActionLog;
  actionLogs: CharacterActionLog[];
  priorityCharacterIds: string[];
  globalActionCounts?: Record<string, number>;
}): string | undefined {
  const counts = new Map<string, number>();
  const priorityIds = new Set(input.priorityCharacterIds);
  const globalCounts = input.globalActionCounts ?? {};
  const globalValues = input.sceneCharacterIds.map((characterId) => globalCounts[characterId] ?? 0);
  const maxGlobalCount = Math.max(0, ...globalValues);
  for (const log of input.actionLogs) {
    counts.set(log.actorId, (counts.get(log.actorId) ?? 0) + 1);
  }
  const unactedCharacterIds = input.sceneCharacterIds.filter((characterId) => !counts.has(characterId));
  const previousTargetIds = input.previousLog?.targetIds
    .filter((characterId) =>
      input.sceneCharacterIds.includes(characterId)
      && (counts.get(characterId) ?? 0) === 0
    )
    ?? [];
  const candidateIds = Array.from(new Set([
    ...previousTargetIds,
    ...(unactedCharacterIds.length > 0 ? unactedCharacterIds : input.sceneCharacterIds),
  ]));

  return candidateIds
    .map((characterId) => {
      const profile = input.profilesById.get(characterId);
      const alreadyActed = counts.get(characterId) ?? 0;
      const reactionPressure = input.previousLog?.targetIds.includes(characterId)
        ? 2 + (profile?.reactivity ?? 0.4) * 0.9
        : 0;
      const globalCount = globalCounts[characterId] ?? 0;
      const globalUnderusePressure = maxGlobalCount > 0
        ? ((maxGlobalCount - globalCount) / Math.max(1, maxGlobalCount)) * 0.75
        : 0;
      const openingPressure = input.tick === 1 && profile?.agentRole === "protagonist"
        ? Math.max(0, 0.18 - globalCount * 0.015)
        : 0;
      const plotPressure = profile?.agentRole === "villain" || profile?.agentRole === "antagonist" ? 0.08 : 0;
      const priorityPressure = priorityIds.has(characterId) && alreadyActed === 0 ? 1.2 : 0;
      const stableNoise = stableScore(`${input.sceneId}:${input.tick}:${characterId}`) * 0.12;
      const score = (profile?.initiative ?? 0.4)
        + (profile?.activityLevel ?? 0.4) * 0.4
        + reactionPressure
        + openingPressure
        + plotPressure
        + priorityPressure
        + globalUnderusePressure
        + stableNoise
        - alreadyActed * 0.55;
      return { characterId, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.characterId;
}

function selectTargetId(
  input: {
    actorId: string;
    sceneCharacterIds: string[];
    mind: CharacterMind;
    profile: CharacterSimulationProfile;
    previousLog?: CharacterActionLog;
    actionLogs: CharacterActionLog[];
    globalInteractionCounts?: Record<string, number>;
    brain?: WorldBrain;
  },
): string | undefined {
  const candidates = input.sceneCharacterIds.filter((characterId) => characterId !== input.actorId);
  const globalInteractionCounts = input.globalInteractionCounts ?? {};
  const globalPairCounts = candidates.map((characterId) =>
    globalInteractionCounts[`${input.actorId}->${characterId}`] ?? 0
  );
  const maxGlobalPairCount = Math.max(0, ...globalPairCounts);

  const scored = candidates.map((characterId) => {
    const relation = relationTrust(input.mind, characterId);
    const targetRole = input.brain?.characterMinds[characterId]?.role ?? "";
    const targetAgentRole = agentRoleForStoryRole(targetRole);
    const pairKey = `${input.actorId}->${characterId}`;
    const globalPairCount = globalInteractionCounts[pairKey] ?? 0;
    const scenePairCount = input.actionLogs.filter((log) =>
      log.actorId === input.actorId && log.targetIds.includes(characterId)
    ).length;
    const pairFatigue = maxGlobalPairCount > 0
      ? globalPairCount / Math.max(1, maxGlobalPairCount)
      : 0;
    const underusedPairBoost = maxGlobalPairCount > 0
      ? ((maxGlobalPairCount - globalPairCount) / (maxGlobalPairCount + 1)) * 1.15
      : 0;
    let score = stableScore(`${input.actorId}:${characterId}`) * 0.1;
    if (input.mind.relationshipModel[characterId]) score += 0.35;
    if (input.previousLog?.targetIds.includes(input.actorId) && input.previousLog.actorId === characterId) score += 2.4;
    if (input.profile.targetPolicy === "threat_first") score += relation < 0 ? Math.abs(relation) + 0.4 : 0;
    if (input.profile.targetPolicy === "protect_anchor") score += relation > 0 ? relation + 0.5 : 0;
    if (input.profile.targetPolicy === "leverage_first") score += relation <= 0 ? 0.5 : 0.2;
    if (input.profile.targetPolicy === "protagonist_pressure") score += targetAgentRole === "protagonist" ? 1 : 0;
    if (input.profile.targetPolicy === "opportunity_first") score += relation === 0 ? 0.45 : 0.25;
    if (input.profile.targetPolicy === "reciprocal") score += input.previousLog?.actorId === characterId ? 0.9 : 0.2;
    if (input.profile.agentRole !== "protagonist" && targetAgentRole !== "protagonist") score += underusedPairBoost * 0.45;
    score += underusedPairBoost;
    score -= pairFatigue * 0.65;
    score -= scenePairCount * 0.8;
    if (targetAgentRole === "protagonist" && pairFatigue > 0.75 && candidates.length > 2) score -= 0.35;
    return { characterId, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.characterId ?? Object.keys(input.mind.relationshipModel)[0];
}

function actionTypeForTick(input: {
  tick: number;
  mind: CharacterMind;
  profile: CharacterSimulationProfile;
  targetId?: string;
  previousLog?: CharacterActionLog;
  actionLogs: CharacterActionLog[];
  actionFatigueByType?: Record<string, number>;
  scenePurposeHint?: string;
  plotBeatAction?: CharacterActionType;
}): CharacterActionType {
  // outline-driven 사건 신호가 있으면 diversify 를 거치지 않고 그대로 실행한다.
  // (의도된 turning point 이므로 반복-회피 로직에 밀려나면 안 된다.)
  if (input.plotBeatAction) {
    return input.plotBeatAction;
  }
  const previousStatus = input.previousLog?.action.operator.status;
  const previousFailed = previousStatus === "blocked"
    || previousStatus === "partial"
    || previousStatus === "backfired";
  const diversify = (desired: CharacterActionType): CharacterActionType => {
    const actorLogs = input.actionLogs.filter((log) => log.actorId === input.mind.characterId);
    const actorAlreadyUsedDesired = actorLogs.some((log) => log.action.type === desired);
    const desiredFatigue = input.actionFatigueByType?.[desired] ?? 0;
    const desiredGlobalShare = input.actionLogs.length === 0
      ? 0
      : input.actionLogs.filter((log) => log.action.type === desired).length / input.actionLogs.length;
    const repeatedFromPrevious = input.previousLog?.actorId === input.mind.characterId
      && input.previousLog.action.type === desired;
    if (!actorAlreadyUsedDesired && desiredGlobalShare <= 0.45 && !repeatedFromPrevious && desiredFatigue < 4) {
      return desired;
    }

    const fallbackByRole: Record<AgentRole, CharacterActionType[]> = {
      protagonist: ["counter_probe", "request_access", "deflect_dialogue", "maintain_mask", "observe"],
      love_interest: ["observe", "probe_dialogue", "request_access", "counter_probe", "withdraw"],
      villain: ["probe_dialogue", "maintain_mask", "deflect_dialogue", "observe", "withdraw"],
      antagonist: ["request_access", "maintain_mask", "probe_dialogue", "deflect_dialogue", "observe"],
      ally: ["request_help", "counter_probe", "observe", "deflect_dialogue", "withdraw"],
      rival: ["probe_dialogue", "counter_probe", "deflect_dialogue", "observe", "withdraw"],
      wildcard: ["observe", "probe_dialogue", "withdraw", "counter_probe", "maintain_mask"],
    };
    const candidates = compact([
      ...input.profile.preferredActionTypes,
      ...fallbackByRole[input.profile.agentRole],
    ]) as CharacterActionType[];
    const viable = candidates.filter((candidate) => {
      if (candidate === desired && (actorAlreadyUsedDesired || repeatedFromPrevious)) return false;
      if ((candidate === "deflect_dialogue" || candidate === "maintain_mask") && input.mind.secrets.length === 0) return false;
      return true;
    });
    const ranked = viable
      .map((candidate) => ({
        candidate,
        fatigue: input.actionFatigueByType?.[candidate] ?? 0,
        repeated: actorLogs.some((log) => log.action.type === candidate) || input.previousLog?.action.type === candidate,
      }))
      .sort((left, right) =>
        Number(left.repeated) - Number(right.repeated)
        || left.fatigue - right.fatigue
      );
    return ranked[0]?.candidate ?? desired;
  };

  if (input.tick <= 3) {
    switch (input.scenePurposeHint) {
      case "establish_state":
        return diversify(input.tick === 1 ? "observe" : "maintain_mask");
      case "information_discovery":
        return diversify(input.tick === 1 ? "observe" : "request_access");
      case "relationship_probe":
        return diversify(input.tick === 1 ? "probe_dialogue" : "counter_probe");
      case "advance_plot":
        return diversify(input.profile.agentRole === "ally" ? "request_help" : "request_access");
      case "aftermath":
        return diversify(input.tick === 1 ? "withdraw" : "observe");
      case "secret_pressure":
        return diversify(input.mind.secrets.length > 0 ? "deflect_dialogue" : "maintain_mask");
      case "foreshadowing":
        return diversify(input.tick === 1 ? "observe" : "probe_dialogue");
      default:
        break;
    }
  }

  if (input.tick % 7 === 0) return diversify("withdraw");
  if (input.tick % 5 === 0 && input.profile.agentRole !== "ally") return diversify("request_access");
  if (previousFailed && input.previousLog?.targetIds.includes(input.mind.characterId)) {
    if (previousStatus === "backfired") return diversify("withdraw");
    if (previousStatus === "blocked") return diversify("request_help");
    return diversify(relationTrust(input.mind, input.previousLog.actorId) < 0 ? "counter_probe" : "request_access");
  }
  if (input.profile.agentRole === "ally" && input.targetId && relationTrust(input.mind, input.targetId) > 0) {
    return diversify("request_help");
  }
  if (input.profile.agentRole === "villain" || input.profile.agentRole === "antagonist") {
    if (input.previousLog?.targetIds.includes(input.mind.characterId)) return diversify("deflect_dialogue");
    if (input.mind.secrets.length > 0 && input.tick % 2 === 0) return diversify("maintain_mask");
    return diversify(input.targetId ? "probe_dialogue" : "observe");
  }
  if (input.previousLog?.targetIds.includes(input.mind.characterId)) {
    return diversify(relationTrust(input.mind, input.previousLog.actorId) < 0
      ? "deflect_dialogue"
      : "counter_probe");
  }
  if (input.profile.agentRole === "love_interest" && input.mind.access.accessRights.length > 0) {
    return diversify(input.tick % 2 === 0 ? "request_access" : "observe");
  }
  if (input.tick % 4 === 0 && input.mind.access.accessRights.length > 0) return diversify("request_access");
  if (input.tick % 3 === 0 && input.mind.secrets.length > 0) return diversify("maintain_mask");
  if (input.targetId && relationTrust(input.mind, input.targetId) > 0) return diversify("request_help");
  if (input.targetId) return diversify("probe_dialogue");
  return diversify("observe");
}

const DEFAULT_PLOT_INSTIGATOR_ROLES: AgentRole[] = [
  "protagonist",
  "antagonist",
  "villain",
  "rival",
];

const MAGIC_CONTEXT_PATTERN = /회귀|시간|마법|속성|봉인|기억/;

/**
 * peak-tension tick 에서 자격을 갖춘 actor 가 사건 행동을 실행할지 결정한다.
 * 자격을 못 갖추면 undefined 를 반환해 기존 선택 로직으로 폴백한다 (결정적).
 */
function resolvePlotBeatAction(input: {
  plotBeat?: { action: CharacterActionType; instigatorRoles?: AgentRole[] };
  tick: number;
  peakTick: number;
  agentRole: AgentRole;
  mind: CharacterMind;
}): CharacterActionType | undefined {
  if (!input.plotBeat || input.tick !== input.peakTick) return undefined;
  const eligibleRoles = input.plotBeat.instigatorRoles ?? DEFAULT_PLOT_INSTIGATOR_ROLES;
  if (!eligibleRoles.includes(input.agentRole)) return undefined;
  if (input.plotBeat.action === "awaken_magic") {
    const hasMagicContext = [
      ...input.mind.secrets,
      ...input.mind.knownFacts,
      ...input.mind.memorySeeds,
    ].some((value) => MAGIC_CONTEXT_PATTERN.test(value));
    if (!hasMagicContext) return undefined;
  }
  return input.plotBeat.action;
}

function speechActHintForAction(actionType: CharacterActionType): string {
  const mapping: Record<CharacterActionType, string> = {
    observe: "withhold",
    probe_dialogue: "probe",
    counter_probe: "probe",
    deflect_dialogue: "deflect",
    request_help: "request_help",
    request_access: "request_access",
    maintain_mask: "maintain_mask",
    withdraw: "withhold",
    confront: "threaten_softly",
    sabotage: "withhold",
    take_physical: "withhold",
    awaken_magic: "confess_partial",
  };
  return mapping[actionType];
}

function decisionModeForAction(actionType: CharacterActionType): string {
  const mapping: Record<CharacterActionType, string> = {
    observe: "access_driven_search",
    probe_dialogue: "relationship_probe",
    counter_probe: "relationship_probe",
    deflect_dialogue: "secret_protection",
    request_help: "trust_based_coordination",
    request_access: "access_driven_search",
    maintain_mask: "secret_protection",
    withdraw: "aftermath",
    confront: "confrontation",
    sabotage: "covert_sabotage",
    take_physical: "physical_seizure",
    awaken_magic: "power_awakening",
  };
  return mapping[actionType];
}

function actionOperatorForAction(input: {
  actionType: CharacterActionType;
  actorName: string;
  targetName?: string;
  location: string;
  mind: CharacterMind;
}): z.infer<typeof CharacterActionLogSchema>["action"]["operator"] {
  const target = input.targetName ?? input.location;
  const categoryByAction: Record<CharacterActionType, z.infer<typeof ActionOperatorCategorySchema>> = {
    observe: "information",
    probe_dialogue: "information",
    counter_probe: "information",
    deflect_dialogue: "social",
    request_help: "social",
    request_access: "political",
    maintain_mask: "social",
    withdraw: "physical",
    confront: "social",
    sabotage: "physical",
    take_physical: "physical",
    awaken_magic: "magic",
  };
  const magicalContext = [
    ...input.mind.secrets,
    ...input.mind.knownFacts,
    ...input.mind.memorySeeds,
  ].some((value) => /회귀|시간|마법|속성|봉인|기억/.test(value));
  const category = (input.actionType === "maintain_mask" || input.actionType === "counter_probe") && magicalContext
    ? "magic"
    : categoryByAction[input.actionType];
  const preconditionsByAction: Record<CharacterActionType, string[]> = {
    observe: [`${input.actorName} can perceive ${target}`],
    probe_dialogue: [input.targetName ? `${target} is present` : `${input.location} has observable pressure`],
    counter_probe: [input.targetName ? `${target} has made pressure visible` : `${input.actorName} has a prior question to reverse`],
    deflect_dialogue: [`${input.actorName} has a secret or risky topic to protect`],
    request_help: [input.targetName ? `${target} can choose whether to cooperate` : `${input.actorName} has no available helper`],
    request_access: [`${input.location} has access rules or social permission boundaries`],
    maintain_mask: [`${input.actorName} has a public mask to preserve`],
    withdraw: [`${input.actorName} can physically or socially leave the exchange`],
    confront: [`${input.actorName} has enough leverage to force a hidden conflict into the open against ${target}`],
    sabotage: [input.targetName ? `${input.actorName} can reach ${target}'s plan or resource without being caught` : `${input.location} has a plan or resource ${input.actorName} can undermine`],
    take_physical: [`${input.location} has a physical object ${input.actorName} can seize, move, or hide`],
    awaken_magic: [`${input.actorName} has a latent power, 회귀 지식, or 속성 that can manifest`],
  };
  const effectByAction: Record<CharacterActionType, string[]> = {
    observe: [`records a clue about ${target}`, "keeps direct conflict low"],
    probe_dialogue: [`forces ${target} to expose or hide information`],
    counter_probe: [`turns pressure back toward ${target}`],
    deflect_dialogue: ["protects hidden information", "raises suspicion if the dodge is noticed"],
    request_help: [`creates dependency with ${target}`],
    request_access: ["opens or narrows a permission boundary"],
    maintain_mask: ["stabilizes public posture", "delays direct exposure"],
    withdraw: ["breaks the current exchange", "moves pressure into later pursuit"],
    confront: [`forces a hidden conflict with ${target} into the open`, "raises stakes sharply and cannot be taken back"],
    sabotage: [`weakens ${target}'s plan or resource`, "stays hidden unless witnessed"],
    take_physical: ["changes who holds or where a key object is", "opens or closes a concrete affordance"],
    awaken_magic: [`manifests ${input.actorName}'s power`, "reveals something about the actor's true nature"],
  };
  // take_physical/awaken_magic 은 사물/자기 자신을 대상으로 하므로 인물 target 이 필수가 아니다.
  const requiresTarget = input.actionType !== "observe"
    && input.actionType !== "maintain_mask"
    && input.actionType !== "withdraw"
    && input.actionType !== "take_physical"
    && input.actionType !== "awaken_magic";
  const lacksTarget = requiresTarget && !input.targetName;

  return {
    id: `${category}:${input.actionType}`,
    category,
    preconditions: preconditionsByAction[input.actionType],
    expectedEffects: effectByAction[input.actionType],
    cost: input.actionType === "request_help"
      ? "상대에게 빚을 만들 수 있다"
      : input.actionType === "request_access"
        ? "거절당하면 공식 명분이 약해진다"
        : input.actionType === "confront"
          ? "되돌릴 수 없는 충돌을 만든다"
          : input.actionType === "sabotage"
            ? "발각되면 더 큰 적의를 산다"
            : input.actionType === "take_physical"
              ? "물건의 행방이 추적될 수 있다"
              : input.actionType === "awaken_magic"
                ? "힘의 정체가 드러날 수 있다"
                : "의도를 읽힐 수 있다",
    risk: input.actionType === "withdraw"
      ? "남은 단서가 상대에게 넘어갈 수 있다"
      : input.actionType === "confront"
        ? "상대가 정면으로 맞받아칠 수 있다"
        : input.actionType === "sabotage"
          ? "현장을 들키면 입장이 뒤집힌다"
          : input.actionType === "awaken_magic"
            ? "통제하지 못하면 힘이 역으로 노출된다"
            : input.targetName
              ? `${subject(target)} 역으로 의도를 해석할 수 있다`
              : "관찰만으로는 사건이 진전되지 않을 수 있다",
    status: lacksTarget ? "blocked" : "accepted",
    statusReason: lacksTarget ? "target-dependent operator has no concrete target" : "pending world game master resolution",
  };
}

function activeIntentionIdForAction(input: {
  actorId: string;
  actionType: CharacterActionType;
  targetId?: string;
  currentPlan: string;
}): string {
  const planKey = input.currentPlan
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "plan";
  return `intention:${input.actorId}:${input.actionType}:${input.targetId ?? "scene"}:${planKey}`;
}

function retrievedMemoryIdsForAction(input: {
  actorId: string;
  mind: CharacterMind;
  targetId?: string;
  intent: string;
  previousLog?: CharacterActionLog;
}): string[] {
  const candidates = [
    ...input.mind.memorySeeds.map((memory, index) => ({
      id: `memory:${input.actorId}:seed:${index}`,
      text: memory,
      score: input.intent.includes(memory.slice(0, 4)) ? 3 : 1,
    })),
    ...input.mind.knownFacts.map((fact, index) => ({
      id: `memory:${input.actorId}:fact:${index}`,
      text: fact,
      score: fact.includes("Reflection") ? 4 : fact.includes("Procedural") ? 3 : input.intent.includes(fact.slice(0, 4)) ? 3 : 1,
    })),
    ...Object.entries(input.mind.relationshipModel).map(([characterId, relation]) => ({
      id: `memory:${input.actorId}:relationship:${characterId}`,
      text: `${characterId}:${relation.privateTruth}:${relation.trustLevel}`,
      score: characterId === input.targetId ? 4 : Math.abs(relation.trustLevel),
    })),
    input.previousLog
      ? {
        id: `memory:${input.actorId}:previous-action:${input.previousLog.logId}`,
        text: `${input.previousLog.action.type}:${input.previousLog.actualEffect.followUpActionSeed}`,
        score: input.previousLog.targetIds.includes(input.actorId) ? 5 : 2,
      }
      : undefined,
  ].filter((candidate): candidate is { id: string; text: string; score: number } =>
    Boolean(candidate?.text.trim())
  );

  return candidates
    .sort((left, right) =>
      right.score - left.score
      || stableScore(`${input.actorId}:${right.id}`) - stableScore(`${input.actorId}:${left.id}`)
    )
    .slice(0, 5)
    .map((candidate) => candidate.id);
}

function isRestrictedLocation(location: string): boolean {
  return /봉인|금지|비밀|서고|기록|황실|황궁|밀약|문서|금고/.test(location);
}

function selectWitnessCharacterIds(input: {
  actionType: CharacterActionType;
  actorId: string;
  targetId?: string;
  location: string;
  operatorCategory: z.infer<typeof ActionOperatorCategorySchema>;
  worldConditionPressures?: string[];
  sceneCharacterIds: string[];
  status: z.infer<typeof ActionOperatorStatusSchema>;
  friction: number;
}): string[] {
  const candidates = input.sceneCharacterIds.filter((characterId) =>
    characterId !== input.actorId && characterId !== input.targetId
  );
  if (candidates.length === 0) return [];

  const pressureText = (input.worldConditionPressures ?? []).join(" ");
  const hasPublicPressure = /증인|감시|소문|봉쇄|서명|열쇠|출입|기록|교대|권한|하인|명단/.test(pressureText);
  const isSociallyVisible = input.operatorCategory === "social" || input.operatorCategory === "political";
  const isInformationLeak = input.operatorCategory === "information" && input.status !== "accepted";
  const isPhysicalPublicTrace = input.operatorCategory === "physical"
    && isRestrictedLocation(input.location)
    && input.status !== "accepted";

  let witnessLimit = 0;
  if (hasPublicPressure) {
    witnessLimit = input.status === "accepted" ? 0 : 1;
  } else if (isRestrictedLocation(input.location) && input.status !== "accepted") {
    witnessLimit = 1;
  } else if ((isSociallyVisible || isInformationLeak || isPhysicalPublicTrace) && input.status === "partial") {
    witnessLimit = 1;
  }

  if (witnessLimit === 0) return [];

  return candidates
    .sort((left, right) =>
      stableScore(`witness:${input.actorId}:${input.targetId ?? "scene"}:${input.location}:${pressureText}:${right}`)
      - stableScore(`witness:${input.actorId}:${input.targetId ?? "scene"}:${input.location}:${pressureText}:${left}`)
    )
    .slice(0, witnessLimit);
}

function resolveWorldGameMaster(input: {
  actionType: CharacterActionType;
  actorId: string;
  targetId?: string;
  location: string;
  worldConditionPressures?: string[];
  sceneCharacterIds: string[];
  mind: CharacterMind;
  operator: z.infer<typeof CharacterActionLogSchema>["action"]["operator"];
  stateDeltas: Array<z.infer<typeof WorldStateDeltaSchema>>;
}): z.infer<typeof WorldGameMasterResolutionSchema> {
  const checkedPreconditions = [
    ...input.operator.preconditions,
    ...(input.worldConditionPressures ?? []).map((pressure) => `world condition: ${pressure}`),
  ];
  const failedPreconditions: string[] = [];
  const worldConditionKey = (input.worldConditionPressures ?? []).join("|");
  const frictionKey = input.stateDeltas[0]?.deltaId ?? `${input.actorId}:${input.targetId ?? "none"}:${input.location}:${worldConditionKey}`;
  const friction = stableScore(`gm:${frictionKey}:${input.actionType}:${input.location}`);
  const needsTarget = input.actionType !== "observe"
    && input.actionType !== "maintain_mask"
    && input.actionType !== "withdraw";
  if (needsTarget && !input.targetId) {
    failedPreconditions.push("target required but missing");
  }
  if (
    input.actionType === "request_access"
    && isRestrictedLocation(input.location)
    && input.mind.access.accessRights.length === 0
  ) {
    failedPreconditions.push(`no access right for restricted location: ${input.location}`);
  }

  const weakSecretProtection = (input.actionType === "deflect_dialogue" || input.actionType === "maintain_mask")
    && input.mind.secrets.length === 0;
  const restrictedButPlausible = input.actionType === "request_access"
    && isRestrictedLocation(input.location)
    && input.mind.access.accessRights.length > 0;
  const publicAccessFriction = input.actionType === "request_access"
    && !isRestrictedLocation(input.location)
    && input.mind.access.accessRights.length === 0
    && friction < 0.45;
  const highSocialRisk = input.actionType === "probe_dialogue"
    && input.targetId
    && relationTrust(input.mind, input.targetId) <= -2;
  const probeBackfire = (input.actionType === "probe_dialogue" || input.actionType === "counter_probe")
    && input.targetId
    && relationTrust(input.mind, input.targetId) <= -1
    && friction < 0.18;
  const maskComplication = (input.actionType === "deflect_dialogue" || input.actionType === "maintain_mask")
    && friction < 0.16;
  const publicWitnessComplication = (input.operator.category === "social" || input.operator.category === "political")
    && input.sceneCharacterIds.length >= 4
    && friction >= 0.18
    && friction < 0.32;
  const conditionPressuresPublicAction = (input.worldConditionPressures ?? []).some((pressure) =>
    /증인|감시|소문|봉쇄|서명|열쇠|출입|기록|교대|권한/.test(pressure)
  )
    && (input.operator.category === "social" || input.operator.category === "political" || input.operator.category === "information")
    && friction >= 0.32
    && friction < 0.5;

  const status: z.infer<typeof ActionOperatorStatusSchema> = failedPreconditions.length > 0
    ? "blocked"
    : highSocialRisk || probeBackfire
      ? "backfired"
      : weakSecretProtection || restrictedButPlausible || publicAccessFriction || maskComplication || publicWitnessComplication || conditionPressuresPublicAction
        ? "partial"
        : "accepted";
  const witnessCharacterIds = selectWitnessCharacterIds({
    actionType: input.actionType,
    actorId: input.actorId,
    targetId: input.targetId,
    location: input.location,
    operatorCategory: input.operator.category,
    worldConditionPressures: input.worldConditionPressures,
    sceneCharacterIds: input.sceneCharacterIds,
    status,
    friction,
  });
  const newAffordances = status === "blocked"
    ? ["observe", "request_help"]
    : status === "partial"
      ? ["seek_witness", "narrow_access_scope"]
      : status === "backfired"
        ? ["withdraw", "repair_relationship"]
        : input.operator.expectedEffects;

  return WorldGameMasterResolutionSchema.parse({
    status,
    reason: status === "accepted"
      ? `GM accepted ${input.operator.id} in ${input.location}`
      : status === "blocked"
        ? failedPreconditions.join("; ")
        : status === "backfired"
          ? "target distrust or timing turns the probe back against the actor"
          : weakSecretProtection
            ? "secret-protection action has weak secret context"
            : restrictedButPlausible
              ? "restricted location allows only partial access"
              : publicAccessFriction
                ? "public permission boundary requires a narrower request"
                : maskComplication
                  ? "mask slips under scene pressure and leaves a trace"
                  : conditionPressuresPublicAction
                    ? `world condition complicates the action: ${(input.worldConditionPressures ?? [])[0] ?? "external pressure"}`
                    : "public witnesses limit the action to a partial effect",
    checkedPreconditions,
    failedPreconditions,
    stateDeltaIds: input.stateDeltas.map((delta) => delta.deltaId),
    witnessCharacterIds,
    newAffordances,
  });
}

function planLifecycleForAction(input: {
  logId: string;
  actionType: CharacterActionType;
  operatorStatus: z.infer<typeof ActionOperatorStatusSchema>;
  currentPlan: string;
  intent: string;
  followUpActionSeed: string;
}): z.infer<typeof CharacterActionLogSchema>["planLifecycle"] {
  const nextStatus: z.infer<typeof PlanLifecycleStatusSchema> = input.operatorStatus === "blocked"
    ? "blocked"
    : input.operatorStatus === "backfired"
      ? "abandoned"
      : input.operatorStatus === "partial"
        ? "blocked"
    : input.actionType === "withdraw"
      ? "abandoned"
      : input.actionType === "request_help" || input.actionType === "request_access"
        ? "completed"
        : "active";

  return {
    planId: `${input.logId}:plan`,
    previousStatus: "active",
    nextStatus,
    reason: nextStatus === "completed"
      ? "operator achieved a concrete cooperation/access step"
      : nextStatus === "abandoned"
        ? "actor chose to break the exchange and preserve options"
        : nextStatus === "blocked"
          ? input.operatorStatus === "partial"
            ? "operator only partially worked and must be replanned"
            : "operator preconditions failed"
          : "plan remains active and carries pressure forward",
    activeIntention: `${input.currentPlan} -> ${input.intent}`,
    linkedFollowUpActionSeed: input.followUpActionSeed,
  };
}

function visibleBehaviorForAction(
  actionType: CharacterActionType,
  actorName: string,
  targetName: string | undefined,
  variantKey: string,
  recentVisibleBehaviors: string[] = [],
  location = "",
  worldConditionPressures: string[] = [],
): string {
  const target = targetName ? `${targetName} 쪽으로` : "방 안을";
  const mapping: Record<CharacterActionType, string[]> = {
    observe: [
      `${topic(actorName)} 말없이 ${target} 살핀다`,
      `${topic(actorName)} 잔 가장자리 너머로 ${target} 시선을 둔다`,
      `${topic(actorName)} 대화에 끼지 않고 ${target} 반응을 기다린다`,
      `${topic(actorName)} 고개를 살짝 돌려 ${target} 움직임만 좇는다`,
      `${topic(actorName)} 손끝을 멈춘 채 ${target} 기척을 재본다`,
    ],
    probe_dialogue: [
      `${topic(actorName)} 예의 바른 질문으로 ${target} 반응을 떠본다`,
      `${topic(actorName)} 웃음을 얇게 걸고 ${target} 짧은 질문을 던진다`,
      `${topic(actorName)} 찻잔을 내려놓으며 ${target} 답을 요구한다`,
      `${topic(actorName)} 목소리를 낮춰 ${target} 빠져나갈 틈을 줄인다`,
      `${topic(actorName)} 한 단어씩 눌러 ${target} 대답을 끌어낸다`,
    ],
    counter_probe: [
      `${topic(actorName)} 대답 대신 되묻는 시선을 건넨다`,
      `${topic(actorName)} 질문을 그대로 돌려주듯 고개를 기울인다`,
      `${topic(actorName)} 한 박자 늦게 ${target} 반문을 남긴다`,
      `${topic(actorName)} 침묵을 길게 둔 뒤 ${target} 질문의 빈틈을 찌른다`,
      `${topic(actorName)} 표정을 바꾸지 않고 ${target} 말끝을 되받는다`,
    ],
    deflect_dialogue: [
      `${topic(actorName)} 미소를 유지한 채 화제를 비껴간다`,
      `${topic(actorName)} 손끝을 접으며 대답의 방향을 바꾼다`,
      `${topic(actorName)} 부드러운 말투로 ${target} 질문을 흐린다`,
      `${topic(actorName)} 시선을 낮추며 ${target} 핵심을 지나친다`,
      `${topic(actorName)} 예의를 앞세워 ${target} 추궁을 밀어낸다`,
    ],
    request_help: [
      `${topic(actorName)} 낮은 목소리로 제한적인 도움을 청한다`,
      `${topic(actorName)} 한 걸음 가까이 서서 ${target} 작은 부탁을 건넨다`,
      `${topic(actorName)} 주변 소음을 살핀 뒤 ${target} 짧게 도움을 청한다`,
      `${topic(actorName)} 망설임을 삼킨 뒤 ${target} 필요한 몫만 말한다`,
      `${topic(actorName)} 손을 거두지 못한 채 ${target} 협력을 요구한다`,
    ],
    request_access: [
      `${topic(actorName)} 예법을 지키며 접근 허락을 구한다`,
      `${topic(actorName)} 문서나 문 쪽으로 손을 두고 ${target} 허락을 기다린다`,
      `${topic(actorName)} 한 걸음 앞으로 나서며 ${target} 명분을 세운다`,
      `${topic(actorName)} 물러서지 않고 ${target} 정식 허가를 요구한다`,
      `${topic(actorName)} 주변의 시선을 증인 삼아 ${target} 길을 연다`,
    ],
    maintain_mask: [
      `${topic(actorName)} 흔들림 없는 얼굴로 침묵을 고른다`,
      `${topic(actorName)} 흐트러진 표정을 빠르게 거둔다`,
      `${topic(actorName)} 잔을 든 손을 그대로 둔 채 공적인 얼굴을 되찾는다`,
      `${topic(actorName)} 숨을 고르고 ${target} 향한 표정을 정돈한다`,
      `${topic(actorName)} 말끝을 삼킨 채 ${target} 평온한 얼굴만 남긴다`,
    ],
    withdraw: [
      `${topic(actorName)} 한 걸음 물러나 대화를 끊는다`,
      `${topic(actorName)} 먼저 시선을 거두고 거리를 벌린다`,
      `${topic(actorName)} 대답을 남기지 않고 몸을 반쯤 돌린다`,
      `${topic(actorName)} 더 묻지 말라는 듯 ${target} 등진다`,
      `${topic(actorName)} 말을 접고 ${target} 사이에 침묵을 세운다`,
    ],
    confront: [
      `${topic(actorName)} 물러서지 않고 ${target} 정면으로 마주 선다`,
      `${topic(actorName)} 숨겨 온 말을 ${target} 향해 그대로 꺼낸다`,
      `${topic(actorName)} 한 걸음 다가서며 ${target} 진실을 들이민다`,
      `${topic(actorName)} 더는 미루지 않고 ${target} 갈등을 공개한다`,
    ],
    sabotage: [
      `${topic(actorName)} 남의 눈을 피해 ${target} 계획의 한 축을 끊는다`,
      `${topic(actorName)} 태연한 얼굴로 ${target} 손쓸 수 없게 만든다`,
      `${topic(actorName)} 짧은 틈을 노려 ${target} 흐름을 흐트러뜨린다`,
    ],
    take_physical: [
      `${topic(actorName)} 망설임 없이 문제의 물건을 집어 든다`,
      `${topic(actorName)} 탁자 위 물건을 자기 쪽으로 옮긴다`,
      `${topic(actorName)} 물건을 소매 안으로 조용히 감춘다`,
      `${topic(actorName)} 손을 뻗어 핵심 물건을 확보한다`,
    ],
    awaken_magic: [
      `${topic(actorName)} 억눌러 온 힘을 처음으로 끌어올린다`,
      `${topic(actorName)} 손끝의 익숙한 감각을 다시 깨운다`,
      `${topic(actorName)} 숨을 고르고 봉인해 둔 힘을 연다`,
    ],
  };
  const variants = mapping[actionType];
  const base = chooseFreshBehavior(variants, variantKey, recentVisibleBehaviors);
  const contextTail = behaviorContextTail({
    location,
    worldConditionPressures,
    key: `${variantKey}:${actionType}`,
  });
  const pressureTail = behaviorPressureTail({
    worldConditionPressures,
    key: `${variantKey}:${actionType}`,
  });
  return `${base}, ${contextTail}, ${pressureTail}`;
}

function utteranceCandidateForAction(input: {
  actionType: CharacterActionType;
  actorName: string;
  mind: CharacterMind;
  tick: number;
  targetName?: string;
  targetId?: string;
  intent: string;
  hiddenGoal: string;
  variantKey: string;
  recentUtterances?: string[];
  worldConditionPressures?: string[];
  location?: string;
}): string {
  const relation = input.targetId ? input.mind.relationshipModel[input.targetId] : undefined;
  const address = relation?.speechRule.match(/호칭:\s*([^/]+)/)?.[1]?.trim()
    ?? input.targetName
    ?? "이 일";
  const relationPatterns = relationshipPatternCandidates(relation?.speechRule);
  const keyBase = `${input.variantKey}:${input.actorName}:${input.actionType}:${address}`;
  const relationPattern = relationPatterns.length > 0
    ? chooseFreshLine(relationPatterns, `${keyBase}:relation`, input.recentUtterances)
    : undefined;
  const finalize = (base: string, key = keyBase) =>
    decorateUtterance({
      base,
      actionType: input.actionType,
      intent: input.intent,
      hiddenGoal: input.hiddenGoal,
      key,
      recentUtterances: input.recentUtterances,
      worldConditionPressures: input.worldConditionPressures,
      location: input.location,
      voiceProfile: input.mind.voiceProfile,
    });
  if (relationPattern && input.actionType === "probe_dialogue") {
    const addressedPattern = relationPattern.includes(address)
      ? relationPattern
      : `${address}, ${relationPattern}`;
    return finalize(addressedPattern, `${keyBase}:relation`);
  }
  const pick = (lines: string[], key = keyBase) =>
    finalize(chooseFreshLine([
      ...lines,
      ...contextualUtteranceCandidates({
        actionType: input.actionType,
        address,
        actorRole: input.mind.role,
        hiddenGoal: input.hiddenGoal,
        worldConditionPressures: input.worldConditionPressures,
      }),
    ], key, input.recentUtterances), key);

  if (input.mind.role.includes("남주")) {
    if (input.actionType === "observe") return pick([
      `${address}, 이런 데서 보니 더 수상한데요.`,
      `길을 잃으신 건 아니죠, ${address}?`,
      `${address}, 조용히 계실수록 더 눈에 띄는 거 아십니까?`,
      `${address}, 방금 멈춘 이유부터 듣고 싶은데요.`,
      `이상하군요. ${address}답지 않은 침묵인데.`,
      `${address}, 오늘은 질문보다 표정이 먼저 움직이네요.`,
    ]);
    if (input.actionType === "request_help") return pick([
      `${address}, 혼자 할 일은 아닌 것 같은데요.`,
      `${address}, 여기서부터는 제 귀도 좀 빌려주시죠.`,
      `됐고, 일단 제 말도 들어보세요. 서서 버티기엔 판이 좀 커졌습니다.`,
    ]);
    return pick([
      `재밌네요. 보통은 그렇게 정면으로 나오지 않거든요.`,
      `${address}, 방금 그 표정은 못 본 척하기 어렵군요.`,
      `이 판에 끼어들 명분이 생긴 것 같은데요.`,
      `${address}, 대답을 아끼는 쪽이 더 위험할 때도 있습니다.`,
      `그 침묵, 제게는 허락처럼 들리는데요.`,
      `${address}, 제가 한 번 더 물으면 답이 달라질까요?`,
    ]);
  }
  if (input.mind.role.includes("주인공")) {
    if (input.actionType === "observe") return pick([
      `${address}, 오늘은 유난히 조용하시네요.`,
      `${address}, 방금 시선이 잠깐 흔들리셨어요.`,
      `이상하네요. 여기서 빠진 말이 하나 있는 것 같은데요.`,
    ]);
    if (input.actionType === "probe_dialogue") return pick([
      `${address}, 그 말은 제가 직접 확인해도 될까요?`,
      `${address}, 그렇게 말씀하신 이유가 따로 있나요?`,
      `걱정은 고맙지만, 이번엔 제가 먼저 보겠습니다.`,
    ]);
    if (input.actionType === "deflect_dialogue") return pick([
      `염려는 감사하지만, 제 일은 제가 판단하겠습니다.`,
      `그 이야기는 여기서 끝내죠. 더 끌면 보기 좋지 않으니까요.`,
      `상냥한 말일수록 확인은 필요하더군요.`,
    ]);
    return pick([
      `전 같은 실수를 반복하지 않을 겁니다.`,
      `이번엔 제가 먼저 움직일 차례예요.`,
      `괜찮습니다. 아직 제 패를 다 보인 건 아니니까요.`,
      `그 말은 여기서 멈추는 게 좋겠어요.`,
      `확인은 제가 하겠습니다. 물러서 주세요.`,
      `오늘은 제가 모르는 척하지 않을 겁니다.`,
      `그 정도 말로는 제 대답을 바꿀 수 없어요.`,
      `다음 말은 신중히 고르세요.`,
    ]);
  }
  if (input.mind.role.includes("악역")) {
    if (input.actionType === "deflect_dialogue") return pick([
      `${address}, 저는 그저 걱정돼서 그런 거예요.`,
      `${address}, 그런 뜻으로 들리셨다면 제가 잘못 말했나 봐요.`,
      `전 그저 도와드리고 싶었을 뿐이에요.`,
    ]);
    if (input.actionType === "maintain_mask") return pick([
      `제가 뭘 할 수 있겠어요. 전 그저 곁에 있었을 뿐인데요.`,
      `오해예요. 저는 아무것도 바라지 않았어요.`,
      `눈물이 나네요. 이런 모습 보이고 싶지 않았는데.`,
      `언니가 그렇게 보신다면 저는 더 말하지 않을게요.`,
      `제가 나설 자리가 아니었나 봐요.`,
      `그저 걱정됐을 뿐이에요. 다른 뜻은 없어요.`,
      `그렇게까지 말씀하시면 제가 물러날게요.`,
    ]);
    return pick([
      `${address}, 괜찮으신 거죠? 표정이 조금 무서워요.`,
      `${address}, 제가 뭘 잘못한 걸까요?`,
      `${address}, 그렇게 차갑게 보시면 제가 무서워져요.`,
      `${address}, 잠깐만 제 말도 들어주세요.`,
      `${address}, 왜 그렇게까지 경계하세요?`,
      `${address}, 제가 곁에 있으면 안 되는 건가요?`,
    ]);
  }
  if (input.mind.role.includes("안타고니스트")) {
    if (input.actionType === "request_access") return pick([
      `${address}, 약속은 감정으로 다룰 수 있는 것이 아닙니다.`,
      `${address}, 이 문제는 절차대로 처리하는 편이 안전합니다.`,
      `두 가문이 보는 일입니다. 충동으로 움직일 수는 없지요.`,
    ]);
    return pick([
      `${address}, 걱정 마세요. 제가 보기엔 아직 정리할 수 있습니다.`,
      `${address}, 과한 선택은 당신에게 어울리지 않습니다.`,
      `제가 처리하겠습니다. 당신은 제 곁에 계시면 됩니다.`,
      `${address}, 이 일은 감정으로 밀어붙일 문제가 아닙니다.`,
      `${address}, 여기서는 한 걸음 물러서는 편이 낫습니다.`,
      `${address}, 제가 먼저 정리하겠습니다. 대신 답은 서두르지 마세요.`,
    ]);
  }
  if (input.mind.role.includes("조력")) {
    if (input.actionType === "request_help") return pick([
      `${address}, 혼자 버티지 마세요. 제가 확인할게요.`,
      `${address}, 그 일은 제가 먼저 보고 올게요.`,
      `${address}, 위험한 건 저한테 맡기세요. 제발요.`,
      `${address}, 지금은 제가 움직일게요. 잠깐만 기다려 주세요.`,
      `${address}, 밖은 제가 살피겠습니다.`,
      `${address}, 대답하지 않으셔도 돼요. 제가 알아볼게요.`,
    ]);
    if (input.actionType === "counter_probe") return pick([
      `${address}, 그 사람 말 믿으시는 건 아니죠?`,
      `${address}, 저 표정 좋은 뜻 아닙니다.`,
      `${address}, 제가 보기엔 숨기는 게 있어요.`,
    ]);
    return pick([
      `${address}, 또 무리하실 생각이면 먼저 저한테 말씀하세요.`,
      `${address}, 얼굴색 안 좋으세요. 괜찮은 척하지 마세요.`,
      `${address}, 제가 옆에 있습니다. 그건 잊지 마세요.`,
      `${address}, 손이 차세요. 잠깐 앉으세요.`,
      `${address}, 지금 나가시면 제가 따라갑니다.`,
      `${address}, 제발 혼자 정리하려고 하지 마세요.`,
    ]);
  }

  const voiceSample = input.mind.voiceRules
    .filter((rule) => /["“”]/.test(rule))
    .map(stripQuotes)
    .find((rule) => rule.includes(address) || !input.targetName)
    ?? input.mind.voiceRules
      .filter((rule) => /["“”]/.test(rule))
      .map(stripQuotes)[0];
  if (voiceSample) return finalize(chooseFreshLine([voiceSample], `${keyBase}:voice`, input.recentUtterances), `${keyBase}:voice`);

  return pick([
    `${address}, 지금은 조금 더 확인해야겠습니다.`,
  ], `${keyBase}:fallback`);
}

function surfaceMeaningForAction(actionType: CharacterActionType, targetName?: string): string {
  const target = targetName ?? "상황";
  const mapping: Record<CharacterActionType, string> = {
    observe: `${object(target)} 더 보겠다는 중립적 확인`,
    probe_dialogue: `${target}에게 추가 설명을 요구하는 예의 있는 질문`,
    counter_probe: `${target}의 질문 의도를 되묻는 방어적 반문`,
    deflect_dialogue: `민감한 화제를 넘기려는 정중한 회피`,
    request_help: `${target}에게 제한적인 도움을 청하는 요청`,
    request_access: `${target}에 접근할 명분을 요구하는 말`,
    maintain_mask: `흔들리지 않는 태도를 보여주는 공적 응답`,
    withdraw: `대화를 끊고 거리를 확보하는 선언`,
    confront: `${target}에게 숨겨 온 갈등을 정면으로 드러내는 선언`,
    sabotage: `${target}의 계획을 겉으로 드러내지 않고 무력화하려는 시도`,
    take_physical: `문제의 물건을 직접 확보하는 행동`,
    awaken_magic: `억눌러 온 힘을 처음으로 드러내는 순간`,
  };
  return mapping[actionType];
}

function targetInterpretationForAction(input: {
  actionType: CharacterActionType;
  actorName: string;
  targetId?: string;
  targetName?: string;
  intent: string;
}): Array<InteractionResolution["targetInterpretations"][number]> {
  if (!input.targetId || !input.targetName) return [];

  const suspicion = input.actionType === "request_help" ? "낮음" : "중간";
  const responsePools: Record<CharacterActionType, string[]> = {
    observe: [
      "시선의 이유를 알아차리고 말수를 줄인다",
      "관찰당했다는 감각 때문에 다음 행동을 늦춘다",
      "겉으로는 모른 척하지만 자세를 더 단단히 고친다",
      "상대가 본 것과 보지 못한 것을 속으로 가른다",
    ],
    probe_dialogue: [
      "질문의 방향을 읽고 대답의 범위를 좁힌다",
      "정면 답변 대신 먼저 질문자의 근거를 찾는다",
      "압박을 인정하지 않은 채 말끝을 낮춘다",
      "드러낼 사실과 감출 사실을 빠르게 나눈다",
    ],
    counter_probe: [
      "반문 속의 방어선을 보고 한 걸음 물러난다",
      "상대가 숨긴 근거를 추적할 새 경로를 찾는다",
      "말의 주도권이 흔들렸다고 느끼고 표정을 닫는다",
      "되묻는 태도 뒤의 불안을 계산에 넣는다",
    ],
    deflect_dialogue: [
      "회피를 알아차리고 원래 질문을 기억해 둔다",
      "넘겨진 화제 뒤에 남은 빈틈을 따로 표시한다",
      "겉으로는 넘어가지만 의심의 방향을 바꾼다",
      "대답하지 않은 부분이 더 중요하다고 판단한다",
    ],
    request_help: [
      "경계가 조금 풀리지만 대가를 계산한다",
      "도움을 줄 수 있는 범위와 잃을 것을 동시에 따진다",
      "요청의 절박함을 받아들이되 조건을 먼저 세운다",
      "연민보다 위험도를 먼저 계산하고 숨을 고른다",
    ],
    request_access: [
      "허락의 명분과 감시 조건을 동시에 계산한다",
      "접근을 막을 이유가 충분한지 다시 훑는다",
      "문을 열어 주더라도 어느 선까지인지 정한다",
      "상대가 원하는 길보다 감춰진 목적을 먼저 본다",
    ],
    maintain_mask: [
      "평온한 얼굴이 오히려 방어라는 점을 눈치챈다",
      "무너지지 않는 태도 때문에 의심을 거두지 못한다",
      "가면 뒤의 균열을 찾으려 시선을 늦춘다",
      "겉모습을 믿지 않고 다음 흔들림을 기다린다",
    ],
    withdraw: [
      "끊긴 대화 뒤에 남은 정보를 따로 보관한다",
      "물러난 이유를 패배가 아니라 재정비로 해석한다",
      "따라붙을지 기다릴지 사이에서 다음 수를 고른다",
      "침묵이 남긴 단서를 다른 통로로 확인하려 한다",
    ],
    confront: [
      "정면으로 드러난 적의를 보고 물러설지 맞설지 정한다",
      "감춰 온 일이 들켰다고 판단하고 다음 수를 바꾼다",
      "공개된 갈등 앞에서 가면을 유지할지 버릴지 고른다",
      "되돌릴 수 없는 선이 그어졌다고 느낀다",
    ],
    sabotage: [
      "무언가 어긋났음을 뒤늦게 감지하고 원인을 찾는다",
      "계획의 한 축이 끊겼다고 느끼며 경계를 높인다",
      "누가 손댔는지 의심의 범위를 좁힌다",
      "겉으로는 평정을 유지하며 손실을 계산한다",
    ],
    take_physical: [
      "물건이 사라진 것을 알아차리고 행방을 쫓는다",
      "빼앗긴 것이 무엇을 의미하는지 다시 계산한다",
      "되찾을 방법과 대가를 저울질한다",
      "물건이 옮겨진 빈자리를 응시한다",
    ],
    awaken_magic: [
      "상대의 힘을 처음 보고 전제를 다시 세운다",
      "예상 밖의 능력 앞에서 거리를 다시 잰다",
      "드러난 정체를 어떻게 이용할지 계산한다",
      "두려움과 호기심 사이에서 반응을 고른다",
    ],
  };
  const responses = responsePools[input.actionType];
  const response = responses[
    Math.floor(stableScore(`interpretation:${input.actorName}:${input.targetName}:${input.actionType}:${input.intent}`) * responses.length)
  ] ?? responses[0];

  return [{
    characterId: input.targetId,
    characterName: input.targetName,
    interpretedAs: `${subject(input.actorName)} 자신을 건드린 이유를 '${input.intent}' 쪽의 계산으로 읽는다`,
    misreadRisk: `${suspicion}: 말의 표면보다 숨은 계산을 크게 볼 수 있다`,
    emotionalResponse: response,
  }];
}

function emotionalShiftForAction(input: {
  actionType: CharacterActionType;
  actorName: string;
  targetName?: string;
  intent: string;
}): InteractionResolution["emotionalShift"] {
  const afterByAction: Record<CharacterActionType, string> = {
    observe: "경계심을 낮게 유지한 집중",
    probe_dialogue: "긴장을 숨긴 탐색",
    counter_probe: "방어적인 날카로움",
    deflect_dialogue: "침착한 은폐",
    request_help: "위험을 감수한 의존",
    request_access: "명분을 세운 조급함",
    maintain_mask: "감정을 눌러 둔 평정",
    withdraw: "후퇴 뒤의 계산",
    confront: "감추지 않은 정면의 결기",
    sabotage: "겉은 태연한 은밀한 결단",
    take_physical: "물건을 쥔 단호함",
    awaken_magic: "힘을 처음 꺼낸 떨림과 확신",
  };

  return {
    actorBefore: "장면 압력을 읽는 중",
    actorAfter: afterByAction[input.actionType],
    targetBefore: input.targetName ? "상대의 의도를 확인하지 못한 경계" : null,
    targetAfter: input.targetName ? "다음 반응을 준비하는 의심" : null,
    intensityDelta: input.actionType === "request_help"
      ? 1
      : input.actionType === "confront" || input.actionType === "awaken_magic"
        ? 3
        : 2,
    reason: `${topic(input.actorName)} '${input.intent}'라는 목적을 장면 표면으로 끌어올린다`,
  };
}

function powerShiftForAction(input: {
  actionType: CharacterActionType;
  actorId: string;
  targetId?: string;
  intent: string;
}): InteractionResolution["powerShift"] {
  const axisByAction: Record<CharacterActionType, InteractionResolution["powerShift"]["axis"]> = {
    observe: "information",
    probe_dialogue: "information",
    counter_probe: "emotional",
    deflect_dialogue: "social",
    request_help: "emotional",
    request_access: "access",
    maintain_mask: "social",
    withdraw: "social",
    confront: "social",
    sabotage: "information",
    take_physical: "access",
    awaken_magic: "emotional",
  };
  const targetKeepsPower = input.actionType === "request_help" || input.actionType === "request_access";
  const bigSwing = input.actionType === "confront" || input.actionType === "awaken_magic";

  return {
    axis: axisByAction[input.actionType],
    fromCharacterId: targetKeepsPower ? input.actorId : input.targetId ?? null,
    toCharacterId: targetKeepsPower ? input.targetId ?? input.actorId : input.actorId,
    delta: targetKeepsPower ? 1 : bigSwing ? 3 : 2,
    reason: input.intent,
  };
}

function relationshipShiftForAction(input: {
  actionType: CharacterActionType;
  actorId: string;
  targetId?: string;
  trustDelta: number;
  intent: string;
}): InteractionResolution["relationshipShift"] {
  const probing = input.actionType === "probe_dialogue" || input.actionType === "counter_probe";
  const defensive = input.actionType === "deflect_dialogue" || input.actionType === "withdraw";
  const aggressive = input.actionType === "confront" || input.actionType === "sabotage";
  const seizing = input.actionType === "take_physical";

  return {
    sourceCharacterId: input.actorId,
    targetCharacterId: input.targetId ?? null,
    trustDelta: input.trustDelta,
    suspicionDelta: probing || defensive || aggressive || seizing ? 1 : 0,
    dependencyDelta: input.actionType === "request_help" ? 1 : 0,
    hostilityDelta: defensive ? 1 : aggressive ? 2 : 0,
    reason: input.intent,
  };
}

function targetReactionForAction(input: {
  logId: string;
  actionType: CharacterActionType;
  actorName: string;
  targetName?: string;
  intent: string;
  visibleBehavior: string;
  location: string;
  worldConditionPressures?: string[];
}): string {
  if (!input.targetName) {
    return `${input.actorName}의 관찰 때문에 장면의 정보 비대칭이 유지된다; ${behaviorContextTail({
      location: input.location,
      worldConditionPressures: input.worldConditionPressures,
      key: `${input.logId}:reaction:none`,
    })}`;
  }
  const target = topic(input.targetName);
  const followThrough = chooseLine([
    "답변보다 증거의 위치를 먼저 다시 본다",
    "방금 바뀐 거리와 호칭을 따로 기억한다",
    "같은 질문을 다른 통로에서 다시 열 준비를 한다",
    "상대가 건드린 물건의 순서를 마음속에 남긴다",
    "공개 답변과 사적인 확인을 분리해 둔다",
    "말이 닫힌 자리의 증인을 새로 센다",
  ], `${input.logId}:reaction-tail:${pressureTopic(input.worldConditionPressures ?? [])}`);

  const mapping: Record<CharacterActionType, string> = {
    observe: `${target} ${input.actorName}의 관찰을 알아차리고 말의 범위를 좁힌다`,
    probe_dialogue: `${target} ${input.actorName}의 질문이 ${input.intent}로 향한다고 판단한다`,
    counter_probe: `${target} 되묻는 압박 때문에 자기 질문의 근거를 감춰야 한다`,
    deflect_dialogue: `${target} 회피된 화제를 추궁할지 물러설지 선택해야 한다`,
    request_help: `${target} 도움 요청을 받아들이는 대신 대가를 계산한다`,
    request_access: `${target} 접근 허락의 명분과 위험을 동시에 따진다`,
    maintain_mask: `${target} 무너지지 않는 표정을 보고 의심의 방향을 바꾼다`,
    withdraw: `${target} 끊긴 대화 뒤에 남은 정보를 따로 보관한다`,
    confront: `${target} 정면으로 드러난 갈등 앞에서 물러설지 맞설지 정해야 한다`,
    sabotage: `${target} 계획이 어긋난 것을 감지하고 원인을 추적해야 한다`,
    take_physical: `${target} 물건이 ${input.actorName}의 손에 넘어간 것을 알아차린다`,
    awaken_magic: `${target} 드러난 힘 앞에서 전제를 다시 세워야 한다`,
  };
  return `${mapping[input.actionType]} (${input.intent}; 근거: ${input.visibleBehavior}); ${followThrough}`;
}

function followUpSeedForAction(input: {
  logId: string;
  actionType: CharacterActionType;
  actorName: string;
  targetName?: string;
  location: string;
  worldConditionPressures?: string[];
  visibleBehavior?: string;
}): string {
  if (!input.targetName) {
    return normalizeMemoryText(`${topic(input.actorName)} ${input.location}에서 관찰한 단서를 다음 행동 후보로 남긴다; ${behaviorContextTail({
      location: input.location,
      worldConditionPressures: input.worldConditionPressures,
      key: `${input.logId}:follow-up:none`,
    })} [pressure:${input.logId}]`);
  }
  const target = topic(input.targetName);
  const pressureLabel = pressureTopic(input.worldConditionPressures ?? []);
  const visibleCue = input.visibleBehavior
    ? `; 관찰 단서: ${input.visibleBehavior.replace(/\s+/g, " ").slice(0, 72)}`
    : "";
  const nextStep = chooseLine([
    `${pressureLabel}의 공개 기록과 사적 증언을 따로 맞춰야 한다`,
    `${input.location}에서 방금 움직인 물건의 순서를 확인해야 한다`,
    `다음 대화에서는 ${pressureLabel}보다 먼저 증인의 위치를 잡아야 한다`,
    `${input.targetName}의 답변 전에 닫힌 통로 하나를 다시 열어야 한다`,
    `말로 굳기 전의 허락 범위를 문서나 열쇠로 확인해야 한다`,
    `방금 남은 침묵을 다른 인물의 기억과 대조해야 한다`,
  ], `${input.logId}:follow-up-tail:${input.actionType}`);

  const mapping: Record<CharacterActionType, string> = {
    observe: `${target} ${input.location}에서 노출된 습관을 숨기거나 역이용해야 한다`,
    probe_dialogue: `${target} ${input.actorName}의 질문에 공개 답변과 회피 중 하나를 골라야 한다`,
    counter_probe: `${target} 자기 질문의 출처를 감추기 위한 우회 명분을 찾아야 한다`,
    deflect_dialogue: `${target} 비껴간 화제를 다시 열 수 있는 증거를 확보해야 한다`,
    request_help: `${target} 협력 조건을 정하거나 도움 요청을 거절해야 한다`,
    request_access: `${target} 접근을 허락할 범위와 감시 조건을 정해야 한다`,
    maintain_mask: `${target} ${input.actorName}의 가면을 깨뜨릴 새 압박을 찾아야 한다`,
    withdraw: `${target} 끊긴 대화 뒤 남은 단서를 다른 통로로 확인해야 한다`,
    confront: `${target} 공개된 갈등에 맞설지 물러설지 다음 수를 정해야 한다`,
    sabotage: `${target} 끊긴 계획을 복구하거나 손댄 사람을 찾아야 한다`,
    take_physical: `${target} 빼앗긴 물건을 되찾거나 대체할 길을 찾아야 한다`,
    awaken_magic: `${target} 드러난 힘을 막거나 이용할 방법을 찾아야 한다`,
  };
  return normalizeMemoryText(`${mapping[input.actionType]}; ${nextStep}${visibleCue} [pressure:${input.logId}]`);
}

function gainedKnowledgeForAction(input: {
  actionType: CharacterActionType;
  actorName: string;
  targetName?: string;
  location: string;
  visibleBehavior: string;
}): string {
  if (!input.targetName) {
    return `${topic(input.actorName)} ${input.location}에서 ${input.visibleBehavior}를 다음 판단 단서로 남긴다`;
  }
  const target = topic(input.targetName);

  const mapping: Record<CharacterActionType, string> = {
    observe: `${input.targetName}의 노출된 습관과 침묵이 ${input.actorName}의 관찰 단서로 분류된다`,
    probe_dialogue: `${target} ${input.actorName}의 질문 앞에서 공개 답변과 회피 사이 압박을 받는다`,
    counter_probe: `${input.targetName}의 질문 근거가 흔들려 우회 명분이 필요해진다`,
    deflect_dialogue: `${target} 비껴간 화제 뒤에 숨은 단서 경로를 다시 찾아야 한다`,
    request_help: `${target} ${input.actorName}의 도움 요청에 조건과 대가를 붙여야 한다`,
    request_access: `${target} ${input.actorName}에게 허락할 접근 범위를 새로 계산해야 한다`,
    maintain_mask: `${target} ${input.actorName}의 가면이 유지된 이유를 다시 해석해야 한다`,
    withdraw: `${target} 끊긴 대화 뒤 남은 단서를 별도 경로로 추적해야 한다`,
    confront: `${target} ${input.actorName}이(가) 더는 숨기지 않는다는 사실을 받아들여야 한다`,
    sabotage: `${target} 자신의 계획에 균열이 생겼음을 의식하게 된다`,
    take_physical: `${target} 핵심 물건이 ${input.actorName}의 손에 넘어갔음을 알게 된다`,
    awaken_magic: `${target} ${input.actorName}에게 알려지지 않은 힘이 있음을 알게 된다`,
  };

  return `${mapping[input.actionType]} (관찰 단서: ${input.visibleBehavior})`;
}

function stateDeltasForAction(input: {
  logId: string;
  actionType: CharacterActionType;
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
  location: string;
  visibleBehavior: string;
  intent: string;
  targetReaction: string;
  followUpActionSeed: string;
  gainedKnowledge: string;
  trustDelta: number;
  scenePressureDelta: number;
  worldConditionPressures?: string[];
}): Array<z.infer<typeof WorldStateDeltaSchema>> {
  const entityIds = compact([input.actorId, input.targetId]);
  const target = input.targetName ?? input.location;
  const deltas: Array<z.infer<typeof WorldStateDeltaSchema>> = [
    {
      deltaId: `${input.logId}:memory`,
      domain: "memory",
      operation: "record",
      summary: `${topic(input.actorName)} ${input.visibleBehavior}를 경험으로 기록한다`,
      entityIds,
      cause: input.intent,
    },
    {
      deltaId: `${input.logId}:belief`,
      domain: "belief",
      operation: "record",
      summary: `${input.actorName}의 ${target} 판단이 "${input.gainedKnowledge}"로 갱신된다`,
      entityIds,
      cause: input.targetReaction,
    },
    {
      deltaId: `${input.logId}:plan`,
      domain: "plan",
      operation: "update",
      summary: `${input.actorName}의 다음 선택지가 "${input.followUpActionSeed}"로 좁혀진다`,
      entityIds,
      cause: input.visibleBehavior,
    },
    {
      deltaId: `${input.logId}:pressure`,
      domain: "scene_pressure",
      operation: input.scenePressureDelta >= 0 ? "increase" : "decrease",
      summary: `${input.location}의 장면 압력이 ${input.actionType} 행동으로 ${Math.abs(input.scenePressureDelta)}만큼 이동한다${input.worldConditionPressures?.[0] ? `; 외부 조건: ${input.worldConditionPressures[0]}` : ""}`,
      entityIds,
      cause: input.intent,
    },
  ];

  if (input.targetId) {
    deltas.push({
      deltaId: `${input.logId}:relationship`,
      domain: "relationship",
      operation: input.trustDelta >= 0 ? "increase" : "decrease",
      summary: `${input.actorName}${conjunctiveParticle(input.actorName)} ${input.targetName}의 신뢰 축이 ${input.trustDelta}만큼 이동한다`,
      entityIds,
      cause: input.intent,
    });
  }

  return deltas;
}

function writerHooksForAction(input: {
  actionType: CharacterActionType;
  actorName: string;
  targetName?: string;
  location: string;
}): InteractionResolution["writerHooks"] {
  const target = input.targetName ?? "빈 자리";
  const gestureByAction: Record<CharacterActionType, string> = {
    observe: `${input.actorName}의 시선이 ${target}에 잠깐 머문다`,
    probe_dialogue: `${topic(input.actorName)} 찻잔 가장자리를 느리게 쓸며 묻는다`,
    counter_probe: `${topic(input.actorName)} 대답 대신 눈썹만 살짝 든다`,
    deflect_dialogue: `${topic(input.actorName)} 미소를 고정한 채 손끝을 접는다`,
    request_help: `${topic(input.actorName)} 목소리를 낮춰 주변 소음을 피한다`,
    request_access: `${topic(input.actorName)} 예법에 맞춰 한 걸음 앞으로 선다`,
    maintain_mask: `${topic(input.actorName)} 흐트러진 표정을 곧바로 되돌린다`,
    withdraw: `${topic(input.actorName)} 먼저 시선을 거두고 몸을 돌린다`,
    confront: `${topic(input.actorName)} 시선을 피하지 않고 ${target}에게 한 걸음 다가선다`,
    sabotage: `${topic(input.actorName)} 아무렇지 않은 얼굴로 손을 빠르게 움직인다`,
    take_physical: `${topic(input.actorName)} 망설임 없이 물건을 집어 든다`,
    awaken_magic: `${topic(input.actorName)} 숨을 고르며 손끝에 힘을 모은다`,
  };
  const sensoryCuePool: Record<CharacterActionType, string[]> = {
    observe: [
      `${input.location}의 창틀 그림자가 ${target} 쪽으로 길게 기운다`,
      `${input.location}의 은잔 표면에 ${target}의 움직임이 짧게 비친다`,
    ],
    probe_dialogue: [
      `${input.location}의 찻숟가락이 잔 벽을 아주 작게 친다`,
      `${input.location}의 촛불이 질문 끝에서 한 번 낮게 흔들린다`,
    ],
    counter_probe: [
      `${input.location}의 문틈 바람이 대답 사이를 얇게 가른다`,
      `${input.location}의 서류 모서리가 손끝 아래에서 멈춘다`,
    ],
    deflect_dialogue: [
      `${input.location}의 커튼 주름이 미소 뒤쪽 그림자를 숨긴다`,
      `${input.location}의 향 냄새가 말끝을 덮듯 천천히 번진다`,
    ],
    request_help: [
      `${input.location}의 발소리가 낮아지고 두 사람 사이만 조용해진다`,
      `${input.location}의 문손잡이가 닫힌 채 차갑게 빛난다`,
    ],
    request_access: [
      `${input.location}의 봉인이 손등 가까이에서 희미하게 반응한다`,
      `${input.location}의 문턱 위 빛이 한 걸음만큼 좁아진다`,
    ],
    maintain_mask: [
      `${input.location}의 거울 조각이 표정의 균열을 작게 삼킨다`,
      `${input.location}의 예복 소매가 굳은 손끝을 가린다`,
    ],
    withdraw: [
      `${input.location}의 의자 다리가 바닥을 낮게 긁고 멈춘다`,
      `${input.location}의 복도 쪽 소음이 멀어지며 말끝을 끊는다`,
    ],
    confront: [
      `${input.location}의 공기가 한순간 팽팽해진다`,
      `${input.location}의 모든 소리가 잠깐 멎는다`,
    ],
    sabotage: [
      `${input.location}의 그림자 하나가 소리 없이 움직인다`,
      `${input.location}의 어딘가에서 작은 어긋남이 생긴다`,
    ],
    take_physical: [
      `${input.location}의 탁자 위 빈자리가 도드라진다`,
      `${input.location}의 물건 하나가 자리를 옮긴다`,
    ],
    awaken_magic: [
      `${input.location}의 빛이 한 번 흔들린다`,
      `${input.location}의 공기에 낯선 결이 스민다`,
    ],
  };
  const sensoryCues = sensoryCuePool[input.actionType];
  const sensoryCue = sensoryCues[Math.floor(stableScore(`sensory:${input.location}:${input.actorName}:${target}:${input.actionType}`) * sensoryCues.length)] ?? sensoryCues[0];

  return {
    gesture: gestureByAction[input.actionType],
    silence: `${subject(target)} 바로 답하지 않는 짧은 침묵`,
    sensoryCue,
    linePurpose: surfaceMeaningForAction(input.actionType, input.targetName),
  };
}

function intentForAction(input: {
  actionType: CharacterActionType;
  mind: CharacterMind;
  profile: CharacterSimulationProfile;
  targetName?: string;
  oneLiner: string;
}): string {
  const target = input.targetName ?? "상황";
  // 사건 행동은 role 분기보다 우선한다 (의도가 행동 자체로 고정되어 있음).
  if (input.actionType === "confront") {
    return `${target}와(과) 숨겨 온 갈등을 정면으로 드러내 '${input.mind.desires.hiddenGoal}'의 흐름을 바꾼다`;
  }
  if (input.actionType === "sabotage") {
    return `${target}의 계획을 들키지 않게 끊어 '${input.mind.desires.hiddenGoal}'에 유리한 틈을 만든다`;
  }
  if (input.actionType === "take_physical") {
    return `문제의 물건을 직접 확보해 '${input.mind.desires.hiddenGoal}'의 다음 수를 연다`;
  }
  if (input.actionType === "awaken_magic") {
    return `억눌러 온 힘을 처음으로 끌어올려 '${input.mind.desires.hiddenGoal}'의 판을 뒤집는다`;
  }
  if (input.profile.agentRole === "protagonist") {
    if (input.actionType === "request_access") return `${companion(target)} 연결된 증거 경로를 열어 반격 가능성을 높인다`;
    if (input.actionType === "maintain_mask" || input.actionType === "deflect_dialogue") {
      return `${target} 앞에서 '${input.mind.desires.hiddenGoal}' 목표를 숨긴 채 생존 가면을 유지한다`;
    }
    return `${target}의 빈틈을 읽어 ${input.mind.desires.hiddenGoal}에 필요한 증거를 만든다`;
  }
  if (input.profile.agentRole === "villain") {
    return `${target}의 의심을 흐리고 ${input.mind.desires.hiddenGoal}에 방해되는 단서를 무력화한다`;
  }
  if (input.profile.agentRole === "antagonist") {
    return `${object(target)} 약속과 지위 안에 묶어 ${input.mind.desires.hiddenGoal}에 유리한 통제권을 유지한다`;
  }
  if (input.profile.agentRole === "ally") {
    return `${target}의 위험을 먼저 확인하고 '${input.mind.desires.hiddenGoal}' 목표를 위해 개입 준비를 한다`;
  }
  if (input.profile.agentRole === "love_interest") {
    return `${target}의 가치와 위험을 동시에 재며 ${input.mind.desires.hiddenGoal}에 쓸 정보를 확보한다`;
  }
  switch (input.actionType) {
    case "probe_dialogue":
    case "counter_probe":
      return `${target}의 반응을 통해 ${input.mind.desires.hiddenGoal}에 필요한 단서를 얻는다`;
    case "deflect_dialogue":
    case "maintain_mask":
    case "withdraw":
      return `'${input.mind.secrets[0] ?? input.mind.desires.hiddenGoal}' 정보를 직접 드러내지 않는다`;
    case "request_help":
      return `${object(target)} 제한적으로 끌어들여 '${input.mind.desires.surfaceGoal}' 목표를 계속 추진한다`;
    case "request_access":
      return `'${input.mind.access.accessRights[0] ?? "접근권"}' 권한을 이용해 다음 정보를 확인한다`;
    default:
      return `${input.oneLiner}의 압력을 관찰하고 다음 행동을 고른다`;
  }
}

function trustDeltaForAction(actionType: CharacterActionType, targetId?: string): Record<string, number> {
  if (!targetId) return {};
  if (actionType === "request_help") return { [targetId]: 1 };
  // 사건 행동은 관계를 더 크게 흔든다.
  if (actionType === "confront" || actionType === "sabotage") return { [targetId]: -2 };
  if (actionType === "take_physical") return { [targetId]: -1 };
  if (actionType === "awaken_magic") return { [targetId]: 0 };
  if (
    actionType === "probe_dialogue"
    || actionType === "counter_probe"
    || actionType === "deflect_dialogue"
    || actionType === "request_access"
    || actionType === "maintain_mask"
    || actionType === "withdraw"
  ) {
    return { [targetId]: -1 };
  }
  return { [targetId]: 0 };
}

function buildClock(input: CharacterActionSimulationInput, tick: number, ticksPerScene: number): SimulationClock {
  return SimulationClockSchema.parse({
    chapter: input.chapter,
    sceneId: input.sceneId,
    tick,
    ticksPerScene,
    activationMin: input.activationMin ?? 1,
    activationMax: input.activationMax ?? 2,
    peakTensionTicks: [Math.max(1, Math.ceil(ticksPerScene * 0.66))],
    quietTicks: [1],
  });
}

export function runCharacterActionSimulation(
  input: CharacterActionSimulationInput,
): CharacterActionSimulationResult {
  const profiles = buildCharacterSimulationProfiles(input.brain);
  const profilesById = new Map(profiles.map((profile) => [profile.characterId, profile]));
  const sceneCharacterIds = selectSceneCharacterIds(input);
  const ticksPerScene = input.ticksPerScene ?? Math.max(4, sceneCharacterIds.length);
  // buildClock 의 peakTensionTicks 계산과 동일하게 유지한다.
  const peakTick = Math.max(1, Math.ceil(ticksPerScene * 0.66));
  const clocks: SimulationClock[] = [];
  const actionLogs: CharacterActionLog[] = [];
  const interactionResolutions: InteractionResolution[] = [];

  for (let tick = 1; tick <= ticksPerScene; tick += 1) {
    clocks.push(buildClock(input, tick, ticksPerScene));
    const previousLog = actionLogs.at(-1);
    const actorId = selectActorIdForTick({
      tick,
      sceneId: input.sceneId,
      sceneCharacterIds,
      profilesById,
      previousLog,
      actionLogs,
      priorityCharacterIds: input.priorityCharacterIds ?? [],
      globalActionCounts: input.globalActionCounts,
    });
    if (!actorId) continue;
    const baseMind = input.brain.characterMinds[actorId];
    if (!baseMind) continue;
    const profile = profilesById.get(actorId);
    if (!profile) continue;
    const runtime = input.runtimeMindStates[actorId];
    const recentVisibleBehaviors = compact([
      ...(runtime?.recentVisibleBehaviors ?? []),
      ...actionLogs
        .filter((log) => log.actorId === actorId)
        .map((log) => log.visibleBehavior),
    ]);
    const recentUtterances = compact([
      ...(runtime?.recentUtterances ?? []),
      ...interactionResolutions
        .map((resolution) => resolution.speechDraft.utteranceCandidate),
      ...interactionResolutions
        .flatMap((resolution) => utteranceFragments(resolution.speechDraft.utteranceCandidate)),
    ]);
    const mind: CharacterMind = runtime
      ? {
        ...baseMind,
        currentPlan: runtime.currentPlan,
        knownFacts: compact([...baseMind.knownFacts, ...runtime.knownFacts]),
      }
      : baseMind;
    const targetId = selectTargetId({
      actorId,
      sceneCharacterIds,
      mind,
      profile,
      previousLog,
      actionLogs,
      globalInteractionCounts: input.globalInteractionCounts,
      brain: input.brain,
    });
    const actorName = mind.name;
    const targetName = targetId ? characterName(input.brain, targetId) : undefined;
	    const plotBeatAction = resolvePlotBeatAction({
	      plotBeat: input.plotBeat,
	      tick,
	      peakTick,
	      agentRole: profile.agentRole,
	      mind,
	    });
	    const actionType = actionTypeForTick({
	      tick,
	      mind,
	      profile,
	      targetId,
	      previousLog,
	      actionLogs,
	      actionFatigueByType: runtime?.actionFatigueByType,
	      scenePurposeHint: input.scenePurposeHint,
	      plotBeatAction,
	    });
    const intent = intentForAction({
      actionType,
      mind,
      profile,
      targetName,
      oneLiner: input.oneLiner,
    });
    const logId = `act_ch${pad(input.chapter)}_${pad(tick)}_${actorId}`;
    const activeIntentionId = activeIntentionIdForAction({
      actorId,
      actionType,
      targetId,
      currentPlan: mind.currentPlan,
    });
    const retrievedMemoryIds = retrievedMemoryIdsForAction({
      actorId,
      mind,
      targetId,
      intent,
      previousLog,
    });
    const visibleBehavior = visibleBehaviorForAction(
      actionType,
      actorName,
      targetName,
      logId,
      recentVisibleBehaviors,
      input.location,
      input.worldConditionPressures ?? [],
    );
    const observed = compact([
      `${input.location}의 현재 압력: ${input.oneLiner}`,
      ...(tick <= 2
        ? (input.carryoverPressures ?? []).map((pressure) => `이전 화 unresolved pressure: ${pressure}`)
        : []),
      ...(input.worldConditionPressures ?? []).map((pressure) => `월드 조건: ${pressure}`),
      previousLog?.visibleBehavior,
      previousLog?.actualEffect.followUpActionSeed
        ? `직전 follow-up pressure: ${previousLog.actualEffect.followUpActionSeed}`
        : undefined,
      previousLog && previousLog.action.operator.status !== "accepted"
        ? `직전 GM result: ${previousLog.action.operator.status} / ${previousLog.action.operator.statusReason} / alternatives: ${previousLog.actualEffect.worldGameMaster.newAffordances.join(", ")}`
        : undefined,
      targetName ? `${targetName}의 반응과 침묵` : undefined,
      mind.memorySeeds.at(-1),
    ]);
    const trustDeltas = trustDeltaForAction(actionType, targetId);
    const targetReaction = targetReactionForAction({
      logId,
      actionType,
      actorName,
      targetName,
      intent,
      visibleBehavior,
      location: input.location,
      worldConditionPressures: input.worldConditionPressures,
    });
    const followUpActionSeed = followUpSeedForAction({
      logId,
      actionType,
      actorName,
      targetName,
      location: input.location,
      worldConditionPressures: input.worldConditionPressures,
      visibleBehavior,
    });
    const gainedKnowledge = gainedKnowledgeForAction({
      actionType,
      actorName,
      targetName,
      location: input.location,
      visibleBehavior,
    });
    const trustDelta = targetId ? trustDeltas[targetId] ?? 0 : 0;
    const scenePressureDelta = actionType === "request_help"
      ? 1
      : actionType === "confront" || actionType === "awaken_magic"
        ? 3
        : 2;
    const operatorAttempt = actionOperatorForAction({
      actionType,
      actorName,
      targetName,
      location: input.location,
      mind,
    });
    const stateDeltas = stateDeltasForAction({
      logId,
      actionType,
      actorId,
      actorName,
      targetId,
      targetName,
      location: input.location,
      visibleBehavior,
      intent,
      targetReaction,
      followUpActionSeed,
      gainedKnowledge,
      trustDelta,
      scenePressureDelta,
      worldConditionPressures: input.worldConditionPressures,
    });
    const worldGameMaster = resolveWorldGameMaster({
      actionType,
      actorId,
      targetId,
      location: input.location,
      worldConditionPressures: input.worldConditionPressures,
      sceneCharacterIds,
      mind,
      operator: operatorAttempt,
      stateDeltas,
    });
    const operator = {
      ...operatorAttempt,
      status: worldGameMaster.status,
      statusReason: worldGameMaster.reason,
    };
    const planLifecycle = planLifecycleForAction({
      logId,
      actionType,
      operatorStatus: operator.status,
      currentPlan: mind.currentPlan,
      intent,
      followUpActionSeed,
    });
    const utteranceCandidate = utteranceCandidateForAction({
      actionType,
      actorName,
      mind,
      tick,
      targetName,
      targetId,
      intent,
      hiddenGoal: mind.desires.hiddenGoal,
      variantKey: logId,
      recentUtterances,
      worldConditionPressures: input.worldConditionPressures,
      location: input.location,
    });
    const speechDraft = {
      speakerId: actorId,
      speakerName: actorName,
      targetIds: targetId ? [targetId] : [],
    targetNames: targetName ? [targetName] : [],
    utteranceCandidate,
    speechAct: speechActHintForAction(actionType),
      delivery: `'${mind.socialMask}' 가면을 유지하되 '${profile.conflictFunction}' 방향이 묻어나는 말투`,
      surfaceMeaning: surfaceMeaningForAction(actionType, targetName),
      hiddenIntention: intent,
      subtext: `'${mind.desires.hiddenGoal}' 목표를 직접 말하지 않고 ${targetName ?? "상황"}의 반응을 시험한다`,
    };
    const targetInterpretations = targetInterpretationForAction({
      actionType,
      actorName,
      targetId,
      targetName,
      intent,
    });
    const emotionalShift = emotionalShiftForAction({
      actionType,
      actorName,
      targetName,
      intent,
    });
    const powerShift = powerShiftForAction({
      actionType,
      actorId,
      targetId,
      intent,
    });
    const relationshipShift = relationshipShiftForAction({
      actionType,
      actorId,
      targetId,
      trustDelta,
      intent,
    });
    const writerHooks = writerHooksForAction({
      actionType,
      actorName,
      targetName,
      location: input.location,
    });
	    const trustSnapshot = Object.fromEntries(
	      Object.keys(mind.relationshipModel).map((id) => [id, relationTrust(mind, id)]),
	    );
	    if (runtime?.agentBrainState) {
		      recordAgentBrainDecision(runtime.agentBrainState, {
		        activeIntentionId,
		        currentPlan: mind.currentPlan,
		        objective: intent,
		        targetIds: targetId ? [targetId] : [],
		        planStatus: planLifecycle.nextStatus,
		        retrievedMemoryIds,
		        chapter: input.chapter,
		      });
		    }
	    const log = CharacterActionLogSchema.parse({
      logId,
      chapter: input.chapter,
      sceneId: input.sceneId,
      tick,
      actorId,
      actorName,
      observed,
      privateState: {
        storyRole: profile.storyRole,
        agentRole: profile.agentRole,
        roleMission: profile.roleMission,
        currentPlan: mind.currentPlan,
        surfaceGoal: mind.desires.surfaceGoal,
        hiddenGoal: mind.desires.hiddenGoal,
        activeObjective: intent,
        activeIntentionId,
        activeFear: mind.fears[0] ?? "계획이 노출되는 것",
        decisionPriorities: profile.decisionPriorities,
        autonomyRule: profile.autonomyRule,
	        knownFacts: mind.knownFacts.slice(0, 6),
	        retrievedMemoryIds,
	        trustSnapshot,
	        agentBrain: buildAgentBrainSnapshot({
	          agentBrainState: runtime?.agentBrainState,
	          activeIntentionId,
	          currentPlan: mind.currentPlan,
	          objective: intent,
	          targetIds: targetId ? [targetId] : [],
	          planStatus: planLifecycle.nextStatus,
	          knownFacts: mind.knownFacts,
	          retrievedMemoryIds,
	          recentMemorySummaries: runtime?.recentMemorySummaries,
	          reflectionNotes: runtime?.reflectionNotes,
	          proceduralMemory: runtime?.proceduralMemory,
	          actionFatigueByType: runtime?.actionFatigueByType,
	          trustByCharacter: trustSnapshot,
	        }),
	      },
      action: {
        type: actionType,
        operator,
        intent,
        rationale: `${topic(mind.name)} ${profile.agentRole} 에이전트로서 ${profile.roleMission}. ${activeIntentionId} 의도와 ${retrievedMemoryIds.join(", ")} 기억을 근거로 장면 압력(${input.oneLiner})을 ${profile.conflictFunction} 방향으로 처리한다`,
        speechActHint: speechActHintForAction(actionType),
      },
      planLifecycle,
      targetIds: targetId ? [targetId] : [],
      targetNames: targetName ? [targetName] : [],
      visibleBehavior,
      intendedEffect: intent,
      actualEffect: {
        targetReaction,
        followUpActionSeed,
        scenePressureDelta,
        stateDeltas,
        worldGameMaster,
      },
      memoryUpdates: Array.from(new Set(compact([
        actorId,
        targetId,
        ...worldGameMaster.witnessCharacterIds,
      ]))).map((characterId) => ({
        characterId,
        summary: gainedKnowledge,
      })),
      beliefUpdates: [{
        characterId: actorId,
        subject: targetName ?? actorName,
        belief: gainedKnowledge,
        confidence: "medium",
        cause: intent,
      }],
      trustDeltas,
      sourceRailIds: input.threadIds,
    });
    actionLogs.push(log);
    interactionResolutions.push(InteractionResolutionSchema.parse({
      resolutionId: `res_${logId}`,
      chapter: input.chapter,
      sceneId: input.sceneId,
      tick,
      sourceActionLogIds: [logId],
      speechDraft,
      targetInterpretations,
      winnerOrDominantPressure: intent,
      misunderstandings: targetName ? [`${topic(targetName)} ${actorName}의 겉말과 속뜻을 분리해 받아들인다`] : [],
      newSharedFacts: [gainedKnowledge],
      newPrivateFacts: [profile.roleMission],
      emotionalShift,
      powerShift,
      relationshipShift,
      scenePressureDelta: log.actualEffect.scenePressureDelta,
      nextActionSeeds: [followUpActionSeed],
      writerHooks,
    }));
  }

  return CharacterActionSimulationResultSchema.parse({
    clocks,
    profiles,
    actionLogs,
    interactionResolutions,
    diagnostics: buildCharacterActionSimulationDiagnostics({
      chapter: input.chapter,
      sceneId: input.sceneId,
      sceneCharacterIds,
      actionLogs,
    }),
  });
}

function buildCharacterActionSimulationDiagnostics(input: {
  chapter: number;
  sceneId: string;
  sceneCharacterIds: string[];
  actionLogs: CharacterActionLog[];
}): CharacterActionSimulationDiagnostics {
  const actionCounts = new Map<string, number>();
  for (const log of input.actionLogs) {
    actionCounts.set(log.action.type, (actionCounts.get(log.action.type) ?? 0) + 1);
  }
  const repeatedActionTypeWarnings = Array.from(actionCounts.entries())
    .filter(([, count]) => input.actionLogs.length > 0 && count / input.actionLogs.length > 0.6)
    .map(([type, count]) => `${type} repeats ${count}/${input.actionLogs.length}`);
  const activeCharacters = new Set(input.actionLogs.map((log) => log.actorId));
  const inactiveCharacterWarnings = input.sceneCharacterIds
    .filter((characterId) => !activeCharacters.has(characterId))
    .map((characterId) => `${characterId} did not act in this scene`);
  const logsWithReaction = input.actionLogs.filter((log) =>
    log.actualEffect.targetReaction.trim().length > 0
  ).length;
  const memoryUpdateCount = input.actionLogs.reduce((sum, log) => sum + log.memoryUpdates.length, 0);

  return CharacterActionSimulationDiagnosticsSchema.parse({
    chapter: input.chapter,
    sceneId: input.sceneId,
    actionLogCount: input.actionLogs.length,
    reactionCoverage: input.actionLogs.length === 0 ? 1 : logsWithReaction / input.actionLogs.length,
    memoryUpdateRate: input.actionLogs.length === 0 ? 0 : memoryUpdateCount / input.actionLogs.length,
    repeatedActionTypeWarnings,
    inactiveCharacterWarnings,
    unresolvedPressureCount: input.actionLogs.filter((log) =>
      log.actualEffect.followUpActionSeed.trim().length > 0
    ).length,
  });
}

function eventIdForLog(chapter: number, sequence: number, log: CharacterActionLog): string {
  return `evt_world_ch${pad(chapter)}_b${pad(sequence, 2)}_agent_${log.actorId}_${pad(log.tick, 2)}`;
}

function eventStateChangesForLog(
  eventId: string,
  log: CharacterActionLog,
): NonNullable<SimulationEvent["stateChanges"]> {
  return log.actualEffect.stateDeltas.map((delta) => ({
    changeId: `${eventId}:${delta.deltaId}`,
    domain: delta.domain === "belief"
      ? "beliefs"
      : delta.domain === "memory"
        ? "memories"
        : delta.domain === "relationship"
          ? "character_state"
          : "world_model",
    operation: delta.operation === "increase" || delta.operation === "decrease"
      ? "update"
      : delta.operation,
    stateKey: `action-delta:${delta.domain}:${log.logId}`,
    summary: delta.summary,
    entityIds: delta.entityIds,
    afterValue: delta,
  }));
}

function eventOutcomesForLog(
  eventId: string,
  stateChanges: NonNullable<SimulationEvent["stateChanges"]>,
): NonNullable<SimulationEvent["outcomes"]> {
  return stateChanges.map((change) => ({
    outcomeId: `${change.changeId}:outcome`,
    type: change.domain === "beliefs"
      ? "belief_recorded"
      : change.domain === "memories"
        ? "memory_recorded"
        : change.domain === "character_state"
          ? "relationship_changed"
          : "character_state_changed",
    summary: change.summary,
    stateChangeIds: [change.changeId],
  }));
}

function leadsToForLog(log: CharacterActionLog): string {
  return log.actualEffect.stateDeltas.find((delta) => delta.domain === "relationship")?.summary
    ?? log.actualEffect.stateDeltas.find((delta) => delta.domain === "scene_pressure")?.summary
    ?? log.actualEffect.stateDeltas.at(-1)?.summary
    ?? log.intendedEffect;
}

export function compileActionLogsToSimulationEvents(input: CompileActionLogsToEventsInput): SimulationEvent[] {
  let previousEvent = input.previousEvent;
  const resolutionByActionLogId = new Map(
    input.interactionResolutions.flatMap((resolution) =>
      resolution.sourceActionLogIds.map((logId) => [logId, resolution] as const)
    ),
  );
  return input.actionLogs.map((log, index) => {
    const eventId = eventIdForLog(input.chapter, input.startBeatIndex + index + 1, log);
    const targetId = log.targetIds[0];
    const targetName = log.targetNames[0];
    const actorMind = input.brain.characterMinds[log.actorId];
    const decisionMode = decisionModeForAction(log.action.type);
    const interactionResolution = resolutionByActionLogId.get(log.logId);
    const gainedKnowledge = compact([
      ...log.beliefUpdates.map((belief) => belief.belief),
      log.actualEffect.followUpActionSeed,
    ]);
    const planTransition = {
      characterId: log.actorId,
      beforePlan: log.privateState.currentPlan,
      afterPlan: log.actualEffect.followUpActionSeed || log.privateState.currentPlan,
      reason: log.action.rationale,
      pressure: log.intendedEffect,
    };
    const knowledgeFlow = {
      usedKnowledge: compact([
        log.privateState.activeIntentionId,
        ...log.privateState.retrievedMemoryIds,
        log.privateState.surfaceGoal,
        log.privateState.hiddenGoal,
        ...log.privateState.knownFacts.slice(0, 3),
      ]),
      gainedKnowledge,
      ownerCharacterIds: compact([log.actorId, ...log.targetIds]),
      visibility: targetId ? "shared" : "private",
      blockedByForbiddenKnowledge: actorMind?.access.forbiddenKnowledge.filter((fact) =>
        log.action.intent.includes(fact)
      ) ?? [],
    };
    const actionEconomics = {
      cost: "상대에게 의도를 의심받을 수 있다",
      risk: targetName
        ? `${subject(targetName)} ${log.actorName}의 의도를 역으로 읽을 수 있다`
        : "관찰이 늦어져 다음 행동 기회를 놓칠 수 있다",
      benefit: log.intendedEffect,
      consequence: leadsToForLog(log),
      severity: log.action.type === "request_help" ? "medium" : "low",
    };
    const reflectionPass = {
      characterId: log.actorId,
      actionType: log.action.type,
      operatorStatus: log.action.operator.status,
      planStatus: log.planLifecycle.nextStatus,
      note: log.action.operator.status === "accepted"
        ? `Procedural success: ${log.action.type} can be reused when ${log.targetNames[0] ?? input.location} pressure recurs.`
        : `Reflection: ${log.action.type} produced ${log.action.operator.status}; raise fatigue and choose ${log.actualEffect.worldGameMaster.newAffordances.join(" or ")} next.`,
      fatigueDelta: log.action.operator.status === "accepted" ? -2 : 1,
    };
    const triggeredBy = previousEvent?.summary ?? log.observed[0] ?? log.action.rationale;
    const leadsTo = leadsToForLog(log);
    const stateChanges = eventStateChangesForLog(eventId, log);
    const outcomes = eventOutcomesForLog(eventId, stateChanges);
    const event: SimulationEvent = {
      id: eventId,
      chapter: input.chapter,
      episode: input.chapter,
      sequence: input.startBeatIndex + index + 1,
      sceneId: log.sceneId,
      type: "plot_action",
      actorId: log.actorId,
      targetId,
      location: input.location,
      summary: `${log.actorName}: ${log.action.intent}`,
      prerequisites: previousEvent
        ? [{
          prerequisiteId: `prior-event:${previousEvent.id}`,
          type: "event",
          description: previousEvent.summary,
          eventId: previousEvent.id,
          stateKey: `event:${previousEvent.id}`,
        }]
        : [{
          prerequisiteId: `${eventId}:actor-active`,
          type: "scene_state",
          description: `${log.actorName} is active at tick ${log.tick}.`,
          entityId: log.actorId,
          stateKey: `character:${log.actorId}`,
        }],
      involvedEntities: [
        {
          entityId: log.actorId,
          entityType: "character",
          role: "actor",
          label: log.actorName,
        },
        ...log.targetIds.map((id, targetIndex) => ({
          entityId: id,
          entityType: "character" as const,
          role: "target" as const,
          label: log.targetNames[targetIndex] ?? characterName(input.brain, id),
        })),
      ],
      stateChanges,
      outcomes,
      tags: [
        "world-model:first",
        "simulation-first",
        "renderer-source",
        "major-plot-action",
        "world-brain",
        "character-action",
        "agent-tick",
        "plan-transition",
        "knowledge-flow",
        "action-economics",
        `mind:${log.actorId}`,
        `decision:${decisionMode}`,
        `operator:${log.action.operator.id}`,
        `operator-category:${log.action.operator.category}`,
        `operator-status:${log.action.operator.status}`,
        `plan-status:${log.planLifecycle.nextStatus}`,
        ...input.threadIds.map((threadId) => `thread:${threadId}`),
      ],
      payload: {
        source: "character_action_simulation",
        subject: log.beliefUpdates[0]?.subject ?? log.actorName,
        predicate: "character_belief_update",
        object: log.beliefUpdates[0]?.belief ?? log.action.intent,
        canonicalFact: log.beliefUpdates[0]?.belief ?? log.action.intent,
        canonicalSummary: log.beliefUpdates[0]?.belief ?? log.action.intent,
        triggeredBy,
        leadsTo,
        visibility: targetId ? "shared" : "private",
        sceneCharacterIds: compact([log.actorId, ...log.targetIds]),
        decisionMode,
        characterActionLogId: log.logId,
        sourceActionLogIds: [log.logId],
        observed: log.observed,
        visibleBehavior: log.visibleBehavior,
        intendedEffect: log.intendedEffect,
        actualEffect: log.actualEffect,
        privateState: log.privateState,
        planLifecycle: log.planLifecycle,
        interactionResolution,
        speechDraft: interactionResolution?.speechDraft,
        targetInterpretations: interactionResolution?.targetInterpretations ?? [],
        emotionalShift: interactionResolution?.emotionalShift,
        powerShift: interactionResolution?.powerShift,
        relationshipShift: interactionResolution?.relationshipShift,
        writerHooks: interactionResolution?.writerHooks,
        actorMind: {
          characterId: log.actorId,
          storyRole: log.privateState.storyRole,
          agentRole: log.privateState.agentRole,
          roleMission: log.privateState.roleMission,
          surfaceGoal: log.privateState.surfaceGoal,
          hiddenGoal: log.privateState.hiddenGoal,
          activeObjective: log.privateState.activeObjective,
          decisionPriorities: log.privateState.decisionPriorities,
          autonomyRule: log.privateState.autonomyRule,
          fears: [log.privateState.activeFear],
          secrets: actorMind?.secrets ?? [],
          currentPlan: log.privateState.currentPlan,
          voiceRules: actorMind?.voiceRules ?? [],
        },
        planTransition,
        knowledgeFlow,
        actionEconomics,
        reflectionPass,
        trustDeltas: log.trustDeltas,
        rendererDirective:
          "Renderer must dramatize this action log as grounded behavior or dialogue without exposing hidden facts directly.",
      },
      cognition: {
        memoryUpdates: log.memoryUpdates.map((memory) => ({
          characterId: memory.characterId,
          kind: "direct_experience",
          summary: memory.summary,
          location: input.location,
          relatedCharacterIds: compact([log.actorId, ...log.targetIds]).filter((id) =>
            id !== memory.characterId
          ),
          tags: ["character-action-sim", `action-log:${log.logId}`],
        })),
        beliefUpdates: log.beliefUpdates.map((belief) => ({
          characterId: belief.characterId,
          kind: targetId ? "trust_assessment" : "self_concept",
          subject: belief.subject,
          belief: belief.belief,
          confidence: belief.confidence,
          cause: belief.cause,
          canonicalAlignment: "uncertain",
          relatedCharacterIds: log.targetIds,
          tags: ["character-action-sim", `action-log:${log.logId}`],
        })),
      },
    };
    previousEvent = event;
    return event;
  });
}
