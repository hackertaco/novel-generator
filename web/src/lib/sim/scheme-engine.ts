import type { Scheme } from "@/lib/schema/character";

/**
 * Scheme(음모) 엔진 — 술어 평가 + 단계 전이. 전부 순수/결정적.
 * spec: docs/superpowers/specs/2026-06-07-scheme-layer-design.md
 *
 * 핵심: 다화 책략에 lookahead가 필요 없다. 단계 구조가 장기 의도를 운반하고,
 * 단계 전환은 시간이 아니라 월드모델 "상태"가 정한다 (알람시계가 아니라 뇌관).
 */

/** 술어가 읽는 월드모델의 결정적 단면. 호출자가 구성한다. */
export interface SchemeWorldView {
  chapter: number;
  /** 해당 인물(from)이 음모 주체에게 갖는 신뢰 (brain trust + runtime delta). */
  trustOf: (from: string) => number;
  knowsFact: (secret: string, by: string) => boolean;
  eventOccurred: (query: { type: string; by?: string; target?: string }) => boolean;
  schemeStageIndexOf: (characterId: string) => number | undefined;
  exposureOf: (characterId: string) => number;
}

type PredicateNode = Record<string, unknown>;

/** 술어 평가. 미지 술어는 false (zod가 차단하지만 이중 안전망). */
export function evaluatePredicate(predicate: unknown, view: SchemeWorldView): boolean {
  if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) return false;
  const node = predicate as PredicateNode;

  if (Array.isArray(node.all)) return node.all.every((child) => evaluatePredicate(child, view));
  if (Array.isArray(node.any)) return node.any.some((child) => evaluatePredicate(child, view));
  if (node.not !== undefined) return !evaluatePredicate(node.not, view);

  if (node.trust_at_least && typeof node.trust_at_least === "object") {
    const q = node.trust_at_least as { from: string; value: number };
    return view.trustOf(q.from) >= q.value;
  }
  if (node.trust_below && typeof node.trust_below === "object") {
    const q = node.trust_below as { from: string; value: number };
    return view.trustOf(q.from) < q.value;
  }
  if (node.event_occurred && typeof node.event_occurred === "object") {
    return view.eventOccurred(node.event_occurred as { type: string; by?: string; target?: string });
  }
  if (node.secret_known_by && typeof node.secret_known_by === "object") {
    const q = node.secret_known_by as { secret: string; by: string };
    return view.knowsFact(q.secret, q.by);
  }
  if (typeof node.chapter_at_least === "number") {
    return view.chapter >= node.chapter_at_least;
  }
  if (node.scheme_stage_at && typeof node.scheme_stage_at === "object") {
    const q = node.scheme_stage_at as { of: string; stage_index_at_least: number };
    const index = view.schemeStageIndexOf(q.of);
    return index !== undefined && index >= q.stage_index_at_least;
  }
  if (typeof node.exposure_at_least === "number") {
    return view.exposureOf("self") >= node.exposure_at_least || view.exposureOf("") >= node.exposure_at_least;
  }
  return false;
}

export type SchemeHistoryKind =
  | "advanced"
  | "disrupted"
  | "exposed_accelerated"
  | "exposed_hidden"
  | "stalled"
  | "deadline"
  | "aborted"
  | "completed";

export interface SchemeRuntimeState {
  characterId: string;
  targetId: string;
  currentStageIndex: number;
  status: "active" | "stalled" | "exposed" | "completed" | "aborted";
  exposureGauge: number;
  chaptersWithoutProgress: number;
  history: Array<{ chapter: number; kind: SchemeHistoryKind; stageId: string }>;
}

export function initSchemeState(characterId: string, scheme: Scheme): SchemeRuntimeState {
  return {
    characterId,
    targetId: scheme.target,
    currentStageIndex: 0,
    status: "active",
    exposureGauge: 0,
    chaptersWithoutProgress: 0,
    history: [],
  };
}

/**
 * 챕터 종료 시 1회 호출되는 결정적 전이. 새 state를 반환한다.
 * 우선순위: 보편실패 > 들킴 > 시한 > 깨짐 > 졸업 > 교착.
 */
export function evaluateSchemeChapter(input: {
  state: SchemeRuntimeState;
  scheme: Scheme;
  view: SchemeWorldView;
  targetPresent: boolean;
}): SchemeRuntimeState {
  const { state, scheme, view, targetPresent } = input;
  if (state.status === "completed" || state.status === "aborted") return state;

  const stage = scheme.stages[state.currentStageIndex];
  if (!stage) return { ...state, status: "aborted" };
  const record = (next: Partial<SchemeRuntimeState>, kind: SchemeHistoryKind): SchemeRuntimeState => ({
    ...state,
    ...next,
    history: [...state.history, { chapter: view.chapter, kind, stageId: stage.id }],
  });

  // 1. 보편 실패: 대상 영구 퇴장 → 목표 불능.
  if (!targetPresent) return record({ status: "aborted" }, "aborted");

  // 2. 들킴: 게이지 임계 → if_exposed 분기.
  if (state.exposureGauge >= scheme.if_exposed.exposure_threshold && state.status !== "exposed") {
    if (scheme.if_exposed.response === "가속") {
      return record({
        currentStageIndex: scheme.stages.length - 1,
        status: "exposed",
        chaptersWithoutProgress: 0,
      }, "exposed_accelerated");
    }
    if (scheme.if_exposed.response === "잠적") {
      return record({
        currentStageIndex: Math.max(0, state.currentStageIndex - 1),
        status: "exposed",
        chaptersWithoutProgress: 0,
      }, "exposed_hidden");
    }
    return record({ status: "aborted" }, "aborted");
  }

  // 3. 시한.
  if (scheme.deadline && view.chapter > scheme.deadline.chapter) {
    if (scheme.deadline.on_miss === "가속") {
      return record({ currentStageIndex: scheme.stages.length - 1, chaptersWithoutProgress: 0 }, "deadline");
    }
    return record({ status: "aborted" }, "deadline");
  }

  // 4. 깨짐: 한 단계 후퇴 (첫 단계는 재시도). 단일 결정적 규칙.
  if (stage.disrupted_when && evaluatePredicate(stage.disrupted_when, view)) {
    return record({
      currentStageIndex: Math.max(0, state.currentStageIndex - 1),
      chaptersWithoutProgress: 0,
    }, "disrupted");
  }

  // 5. 졸업 / 최종 완료.
  const isFinal = state.currentStageIndex >= scheme.stages.length - 1;
  if (isFinal) {
    // 최종 단계: payoff 사건이 실제로 일어나면 완료.
    if (view.eventOccurred({ type: scheme.payoff.op, by: state.characterId })) {
      return record({ status: "completed" }, "completed");
    }
  } else if (stage.advance_when && evaluatePredicate(stage.advance_when, view)) {
    return record({
      currentStageIndex: state.currentStageIndex + 1,
      status: "active",
      chaptersWithoutProgress: 0,
    }, "advanced");
  }

  // 6. 교착: N화 무진전 → 잠적과 동일 처리 후 재개 (영원히 멈추는 음모 방지).
  const stalledChapters = state.chaptersWithoutProgress + 1;
  if (stage.stall_after_chapters && stalledChapters >= stage.stall_after_chapters) {
    return record({
      currentStageIndex: Math.max(0, state.currentStageIndex - 1),
      status: "active",
      chaptersWithoutProgress: 0,
    }, "stalled");
  }

  return { ...state, chaptersWithoutProgress: stalledChapters };
}
