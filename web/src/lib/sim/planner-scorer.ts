import type { CharacterMind } from "./world-brain";
import type { AgentRole, CharacterActionType } from "./character-action-sim";

/**
 * Deterministic utility-scoring Planner (Phase 0 — 순수함수, 아직 미호출).
 *
 * 설계 출처: planner-upgrade-design 워크플로 (제안1 backbone + 적대 토론 graft).
 * 역할(Fei-Fei Li taxonomy): 이 모듈은 **Planner**다 — goal/observation 으로 action 을 고른다.
 * Simulator(state-authority) 와 Renderer(prose) 는 건드리지 않는다. utterance text 생성 금지 —
 * action(type/target) 만 결정한다.
 *
 * 결정성 불변식:
 *  - 모든 점수는 정수 도메인. 부동소수 미사용 (stableScore 대신 stableInt = hash % mod).
 *  - argmax 는 명시적 for-loop + ALL_OPS 고정 인덱스 tie-break. .sort() 미사용.
 *  - 입력은 전부 결정적으로 누적된 값(sceneActionLogs 등)만. 시계/난수 미사용.
 *
 * 사건(plot-level) 행동은 별도 주입 경로가 아니라 같은 점수판에서 경쟁한다.
 * goal 은 한국어 정규식 추론이 아니라 **시드 구조화 태그(eventDisposition)** 로 읽는다 — 그래야
 * "인물이 goal 을 보고 자발 선택" 이 진짜 emergence 이지 outline 주입의 리브랜딩이 아니다.
 */

// ── operator universe ───────────────────────────────────────────────────────
export const ALL_OPS: readonly CharacterActionType[] = [
  "observe",
  "probe_dialogue",
  "counter_probe",
  "deflect_dialogue",
  "request_help",
  "request_access",
  "maintain_mask",
  "withdraw",
  "confront",
  "sabotage",
  "take_physical",
  "awaken_magic",
];

export const EVENT_OPS: readonly CharacterActionType[] = [
  "confront",
  "sabotage",
  "take_physical",
  "awaken_magic",
];

/** 사건 op 의 분류 — affordance/eligibility 게이트와 일관. */
export type PlannerOpStatus = "accepted" | "blocked" | "partial" | "backfired";

/** 시드 intent_profile 에서 읽는 구조화 사건 성향 태그 (Phase 3 에서 시드 스키마와 연결). */
export type EventDisposition = CharacterActionType | "none";

/** sceneActionLogs 의 최소 투영 — 전체 CharacterActionLog 타입과 디커플. */
export interface PlannerLogView {
  actorId: string;
  targetIds: string[];
  actionType: CharacterActionType;
  status: PlannerOpStatus;
}

/**
 * 활성 음모 단계가 Planner 에 주는 컨텍스트.
 * - schemer 본인: stageTactics/payoffOp (전략은 시드, 전술은 점수판에서 즉흥)
 * - 음모를 아는 자(foreknowledge/단서): exploitOps — schemer 를 겨냥할 때 공략 가산
 */
export interface PlannerSchemeInput {
  stageTactics: CharacterActionType[];
  schemeTargetId?: string;
  atFinalStage: boolean;
  payoffOp?: CharacterActionType;
  exploitOps?: CharacterActionType[];
}

export interface PlannerScoreInput {
  sceneId: string;
  tick: number;
  peakTick: number;
  ticksPerScene: number;
  actorId: string;
  mind: CharacterMind;
  agentRole: AgentRole;
  preferredActionTypes: CharacterActionType[];
  targetId?: string;
  /** relationTrust(mind, targetId). 상류에서 결정적으로 산출해 전달. */
  targetTrust?: number;
  location: string;
  /** 현재 scene 의 직전 action 로그들 (시간순, 결정적 누적). */
  sceneActionLogs: PlannerLogView[];
  actionFatigueByType?: Record<string, number>;
  /** 시드 구조화 태그 — 이 인물이 어떤 사건 행동에 기우는가. */
  eventDisposition?: EventDisposition;
  /** outline-driven 신호. override 가 아니라 goal 가산 bias 로 강등. */
  plotBeatBias?: { action: CharacterActionType; weight: number };
  /** 활성 음모 컨텍스트. 있으면 eventDisposition 보다 우선한다 (단계 = 동적 성향). */
  scheme?: PlannerSchemeInput;
  /** 챕터간 carryover 압력 개수 (장편 호흡). */
  carryoverPressureCount?: number;
}

export interface OperatorScore {
  op: CharacterActionType;
  eligible: boolean;
  goal: number;
  relation: number;
  affordance: number;
  pacing: number;
  noise: number;
  total: number;
}

export interface PlannerDecision {
  actionType: CharacterActionType;
  eligibleOps: CharacterActionType[];
  scoreBreakdown: OperatorScore[];
  escalated: boolean;
}

// ── 가중치 테이블 (한곳에 모음 — 튜닝/디버그 용이) ────────────────────────────
const W = {
  goalPreferred: 500,
  goalEventAffinity: 900,
  goalPlotBiasDefault: 600,
  schemeTactic: 700,
  schemePayoff: 900,
  schemeExploit: 500,
  schemeTargetBias: 200,
  relTrustHostileMul: 400,
  relRequestHelpMul: 300,
  relSecretGuard: 300,
  escBackfired: 300,
  escBlocked: 200,
  escPartial: 100,
  escCarryoverMul: 150,
  escCap: 900,
  threatMul: 150,
  affordanceAccess: 200,
  pacingActorUsed: -550,
  pacingGlobalShare: -400,
  pacingRepeatedPrev: -500,
  pacingFatigueMul: -150,
  pacingEventDistanceMul: -350,
  pacingEventPeakBonus: 250,
  pacingEventCooldown: -300,
  noiseMod: 80,
} as const;

const INELIGIBLE = -1_000_000_000;
const MAGIC_CONTEXT_PATTERN = /회귀|시간|마법|속성|봉인|기억/;
const SABOTAGE_ROLES: ReadonlySet<AgentRole> = new Set(["villain", "antagonist", "rival"]);

/** 부동소수를 거치지 않는 정수 해시 (stableScore 와 달리 나눗셈 없음). */
export function stableInt(value: string, mod: number): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return mod > 0 ? hash % mod : 0;
}

function isRestrictedLocationLocal(location: string): boolean {
  return /봉인|금지|비밀|서고|기록|황실|황궁|밀약|문서|금고/.test(location);
}

function requiresTarget(op: CharacterActionType): boolean {
  // actionOperatorForAction 의 requiresTarget 과 동일하게 유지.
  return op !== "observe"
    && op !== "maintain_mask"
    && op !== "withdraw"
    && op !== "take_physical"
    && op !== "awaken_magic";
}

function hasMagicContext(mind: CharacterMind): boolean {
  return [...mind.secrets, ...mind.knownFacts, ...mind.memorySeeds]
    .some((value) => MAGIC_CONTEXT_PATTERN.test(value));
}

/**
 * Hard-gate eligibility. resolveWorldGameMaster 의 hard-fail 과 같은 규칙을 표현한다.
 * (Phase 3+ 에서는 GM 과 이 함수를 단일 공유 함수로 추출해 복제를 제거할 것 — E1 seam.)
 */
export function isOperatorEligible(input: PlannerScoreInput, op: CharacterActionType): boolean {
  const { mind, targetId, location, agentRole } = input;
  const trust = input.targetTrust ?? 0;

  if (requiresTarget(op) && !targetId) return false;
  if (op === "request_access" && isRestrictedLocationLocal(location) && mind.access.accessRights.length === 0) {
    return false;
  }
  if (op === "awaken_magic" && !hasMagicContext(mind)) return false;
  if (op === "confront" && mind.leveragePoints.length === 0 && trust >= 0) return false;
  if (op === "sabotage" && !SABOTAGE_ROLES.has(agentRole)) return false;
  if (op === "take_physical" && mind.access.accessRights.length === 0) return false;

  // scene 당 사건 op 1건 hard cap (D2) — 이미 사건이 발화했으면 추가 사건 불가.
  if (EVENT_OPS.includes(op) && countSceneEvents(input.sceneActionLogs) >= 1) return false;

  return true;
}

function countSceneEvents(logs: PlannerLogView[]): number {
  let n = 0;
  for (const log of logs) if (EVENT_OPS.includes(log.actionType)) n += 1;
  return n;
}

function escalationPressure(input: PlannerScoreInput): number {
  let sum = 0;
  for (const log of input.sceneActionLogs) {
    if (log.actorId !== input.actorId) continue;
    if (log.status === "backfired") sum += W.escBackfired;
    else if (log.status === "blocked") sum += W.escBlocked;
    else if (log.status === "partial") sum += W.escPartial;
  }
  sum += (input.carryoverPressureCount ?? 0) * W.escCarryoverMul;
  return Math.min(W.escCap, sum); // D1: 단조누적 양의 피드백 상한.
}

/** 직전 틱들에서 self 가 피격(confront 수신/backfired)된 횟수 — cornered → awaken_magic. */
function threatLevel(input: PlannerScoreInput): number {
  let n = 0;
  for (const log of input.sceneActionLogs) {
    if (!log.targetIds.includes(input.actorId)) continue;
    if (log.actionType === "confront" || log.status === "backfired") n += 1;
  }
  return n;
}

/** self 가 이번 scene 에서 떠보기/직면/방해의 대상이 된 횟수 — 마스킹/회피의 반응 근거. */
function probedAtSelf(input: PlannerScoreInput): number {
  let n = 0;
  for (const log of input.sceneActionLogs) {
    if (!log.targetIds.includes(input.actorId)) continue;
    if (
      log.actionType === "probe_dialogue"
      || log.actionType === "counter_probe"
      || log.actionType === "confront"
      || log.actionType === "sabotage"
    ) n += 1;
  }
  return n;
}

function goalScore(input: PlannerScoreInput, op: CharacterActionType): number {
  let s = 0;
  if (input.preferredActionTypes.includes(op)) s += W.goalPreferred;
  if (input.scheme) {
    // 음모가 있으면 단계가 동적 성향 — eventDisposition 은 무시한다.
    const onSchemeTarget = input.targetId !== undefined && input.targetId === input.scheme.schemeTargetId;
    if (input.scheme.stageTactics.includes(op)) {
      s += W.schemeTactic;
      if (onSchemeTarget) s += W.schemeTargetBias;
    }
    if (input.scheme.atFinalStage && input.scheme.payoffOp === op && onSchemeTarget) {
      s += W.schemePayoff;
    }
    if (input.scheme.exploitOps?.includes(op) && onSchemeTarget) {
      s += W.schemeExploit;
    }
  } else if (EVENT_OPS.includes(op) && input.eventDisposition === op) {
    // goal 을 데이터로 읽는다 (정규식 추론 금지) — eventDisposition 이 이 op 를 가리키면 강한 가산.
    s += W.goalEventAffinity;
  }
  if (input.plotBeatBias && input.plotBeatBias.action === op) s += input.plotBeatBias.weight;
  return s;
}

function relationScore(input: PlannerScoreInput, op: CharacterActionType): number {
  const trust = input.targetTrust ?? 0;
  const esc = escalationPressure(input);
  let s = 0;
  if ((op === "confront" || op === "probe_dialogue" || op === "counter_probe") && trust < 0) {
    s += (-trust) * W.relTrustHostileMul + esc;
  }
  if (op === "request_help" && trust > 0) s += trust * W.relRequestHelpMul;
  // 마스킹/회피는 반응적 방어 — 무조건이 아니라 self 가 지금 떠보기/직면을 당할 때만 보상.
  // (무조건 +300 이 maintain_mask 를 기본 attractor 로 만들던 과편향을 제거.)
  if ((op === "deflect_dialogue" || op === "maintain_mask") && input.mind.secrets.length > 0) {
    const underPressure = probedAtSelf(input);
    if (underPressure > 0) s += Math.min(W.relSecretGuard * underPressure, W.relSecretGuard * 2);
  }
  if (op === "sabotage" && trust < 0) s += (-trust) * W.relTrustHostileMul + esc;
  if (op === "awaken_magic") {
    const threat = threatLevel(input);
    if (threat >= 1) s += threat * W.threatMul;
  }
  return s;
}

function affordanceScore(input: PlannerScoreInput, op: CharacterActionType): number {
  // Phase 0: 좁게만 — accessRights 있고 request_access 면 소폭. (GM newAffordances 연결은 후속.)
  if (op === "request_access" && input.mind.access.accessRights.length > 0) return W.affordanceAccess;
  return 0;
}

function pacingScore(input: PlannerScoreInput, op: CharacterActionType): number {
  const logs = input.sceneActionLogs;
  const selfLogs = logs.filter((log) => log.actorId === input.actorId);
  let s = 0;
  if (selfLogs.some((log) => log.actionType === op)) s += W.pacingActorUsed;
  if (logs.length > 0) {
    const share = logs.filter((log) => log.actionType === op).length / logs.length;
    if (share > 0.45) s += W.pacingGlobalShare;
  }
  const lastSelf = selfLogs[selfLogs.length - 1];
  if (lastSelf && lastSelf.actionType === op) s += W.pacingRepeatedPrev;
  const fatigue = Math.min(input.actionFatigueByType?.[op] ?? 0, 4);
  s += fatigue * W.pacingFatigueMul;

  if (EVENT_OPS.includes(op)) {
    const distance = Math.abs(input.tick - input.peakTick);
    s += distance * W.pacingEventDistanceMul;
    if (input.tick >= input.peakTick) s += W.pacingEventPeakBonus;
    // 같은 사건 op 가 이미 이 scene 에서 나왔으면 쿨다운 (도배 방지).
    if (logs.some((log) => log.actionType === op)) s += W.pacingEventCooldown;
  }
  return s;
}

/** 한 operator 의 정수 점수 분해. */
export function scoreOperator(input: PlannerScoreInput, op: CharacterActionType): OperatorScore {
  const eligible = isOperatorEligible(input, op);
  const goal = goalScore(input, op);
  const relation = relationScore(input, op);
  const affordance = affordanceScore(input, op);
  const pacing = pacingScore(input, op);
  const noise = stableInt(`plan:${input.sceneId}:${input.tick}:${input.actorId}:${op}`, W.noiseMod);
  const total = eligible ? goal + relation + affordance + pacing + noise : INELIGIBLE;
  return { op, eligible, goal, relation, affordance, pacing, noise, total };
}

/**
 * 12-operator 점수판 argmax. 결정적: ALL_OPS 순서로 순회하며 strictly-greater 만 교체하므로
 * 동점이면 최저 인덱스가 이긴다 (.sort() 미사용). 전부 ineligible 이면 observe 폴백.
 */
export function scoreOperatorBoard(input: PlannerScoreInput): PlannerDecision {
  const scoreBreakdown: OperatorScore[] = [];
  let best: OperatorScore | undefined;
  for (const op of ALL_OPS) {
    const score = scoreOperator(input, op);
    scoreBreakdown.push(score);
    if (score.eligible && (best === undefined || score.total > best.total)) {
      best = score;
    }
  }
  const actionType = best?.op ?? "observe";
  return {
    actionType,
    eligibleOps: scoreBreakdown.filter((s) => s.eligible).map((s) => s.op),
    scoreBreakdown,
    escalated: EVENT_OPS.includes(actionType),
  };
}
