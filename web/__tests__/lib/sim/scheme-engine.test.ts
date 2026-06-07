import { describe, expect, it } from "vitest";

import type { Scheme } from "@/lib/schema/character";
import {
  evaluatePredicate,
  evaluateSchemeChapter,
  initSchemeState,
  type SchemeWorldView,
} from "@/lib/sim/scheme-engine";

function view(over: Partial<SchemeWorldView> = {}): SchemeWorldView {
  return {
    chapter: 3,
    trustOf: () => 0,
    knowsFact: () => false,
    eventOccurred: () => false,
    schemeStageIndexOf: () => undefined,
    exposureOf: () => 0,
    ...over,
  };
}

const SCHEME: Scheme = {
  objective: "약혼 파탄",
  motive: "황태자비 자리",
  target: "elysia",
  stakes: { on_success: "내정", on_failure: "몰락", collateral: [] },
  cover_story: "다정한 동생",
  stages: [
    {
      id: "신뢰_쌓기",
      goal: "곁에 머문다",
      tactics: ["request_help", "maintain_mask"],
      advance_when: { trust_at_least: { from: "elysia", value: 2 } },
      disrupted_when: { secret_known_by: { secret: "명단 조작", by: "elysia" } },
      stall_after_chapters: 3,
    },
    {
      id: "증거_심기",
      goal: "물증 확보",
      tactics: ["take_physical", "sabotage"],
      advance_when: { event_occurred: { type: "take_physical", by: "serena" } },
    },
    { id: "배신", goal: "공개 폭로", tactics: ["confront"], advance_when: null },
  ],
  payoff: { op: "confront", description: "공개 폭로" },
  if_exposed: { response: "가속", exposure_threshold: 2 },
  deadline: { chapter: 10, on_miss: "포기" },
  accomplices: [],
} as Scheme;

describe("scheme predicate evaluator", () => {
  it("evaluates each predicate against the world view", () => {
    expect(evaluatePredicate({ trust_at_least: { from: "e", value: 2 } }, view({ trustOf: (f) => (f === "e" ? 2 : 0) }))).toBe(true);
    expect(evaluatePredicate({ trust_at_least: { from: "e", value: 2 } }, view({ trustOf: () => 1 }))).toBe(false);
    expect(evaluatePredicate({ trust_below: { from: "e", value: 0 } }, view({ trustOf: () => -1 }))).toBe(true);
    expect(evaluatePredicate({ chapter_at_least: 4 }, view())).toBe(false);
    expect(evaluatePredicate({ chapter_at_least: 3 }, view())).toBe(true);
    expect(evaluatePredicate(
      { secret_known_by: { secret: "명단", by: "elysia" } },
      view({ knowsFact: (s, by) => s === "명단" && by === "elysia" }),
    )).toBe(true);
    expect(evaluatePredicate(
      { event_occurred: { type: "take_physical", by: "serena" } },
      view({ eventOccurred: (q) => q.type === "take_physical" && q.by === "serena" }),
    )).toBe(true);
    expect(evaluatePredicate(
      { scheme_stage_at: { of: "serena", stage_index_at_least: 1 } },
      view({ schemeStageIndexOf: () => 1 }),
    )).toBe(true);
    expect(evaluatePredicate({ exposure_at_least: 2 }, view({ exposureOf: () => 3 }))).toBe(true);
    // 미지 술어 → false (zod가 차단하지만 이중 안전망)
    expect(evaluatePredicate({ mood_is: "ripe" }, view())).toBe(false);
  });

  it("evaluates all/any/not composites", () => {
    const v = view({ trustOf: () => 2 });
    expect(evaluatePredicate({ all: [{ trust_at_least: { from: "e", value: 2 } }, { chapter_at_least: 3 }] }, v)).toBe(true);
    expect(evaluatePredicate({ all: [{ trust_at_least: { from: "e", value: 2 } }, { chapter_at_least: 99 }] }, v)).toBe(false);
    expect(evaluatePredicate({ any: [{ chapter_at_least: 99 }, { trust_at_least: { from: "e", value: 2 } }] }, v)).toBe(true);
    expect(evaluatePredicate({ not: { chapter_at_least: 99 } }, v)).toBe(true);
  });
});

describe("scheme state transitions", () => {
  it("advances when advance_when holds", () => {
    const s0 = initSchemeState("serena", SCHEME);
    expect(s0.currentStageIndex).toBe(0);
    const s1 = evaluateSchemeChapter({
      state: s0, scheme: SCHEME, targetPresent: true,
      view: view({ trustOf: (f) => (f === "elysia" ? 2 : 0) }),
    });
    expect(s1.currentStageIndex).toBe(1);
    expect(s1.history.at(-1)?.kind).toBe("advanced");
    expect(s1.chaptersWithoutProgress).toBe(0);
  });

  it("completes when payoff event occurs at the final stage", () => {
    const atFinal = { ...initSchemeState("serena", SCHEME), currentStageIndex: 2 };
    const done = evaluateSchemeChapter({
      state: atFinal, scheme: SCHEME, targetPresent: true,
      view: view({ eventOccurred: (q) => q.type === "confront" && q.by === "serena" }),
    });
    expect(done.status).toBe("completed");
  });

  it("retreats one stage on disrupted_when (first stage retries)", () => {
    const atStage1 = { ...initSchemeState("serena", SCHEME), currentStageIndex: 1 };
    // 증거_심기엔 disrupted_when 없음 → 1단계의 깨짐은 0단계 조건으로 테스트
    const s = evaluateSchemeChapter({
      state: initSchemeState("serena", SCHEME), scheme: SCHEME, targetPresent: true,
      view: view({ knowsFact: (sec, by) => sec === "명단 조작" && by === "elysia" }),
    });
    expect(s.currentStageIndex).toBe(0); // 첫 단계는 재시도
    expect(s.history.at(-1)?.kind).toBe("disrupted");
    const s2 = evaluateSchemeChapter({
      state: { ...atStage1, currentStageIndex: 0 }, scheme: SCHEME, targetPresent: true,
      view: view({ knowsFact: (sec, by) => sec === "명단 조작" && by === "elysia" }),
    });
    expect(s2.currentStageIndex).toBe(0);
  });

  it("exposure threshold triggers 가속 → jumps to final stage", () => {
    const s0 = { ...initSchemeState("serena", SCHEME), exposureGauge: 2 };
    const s1 = evaluateSchemeChapter({ state: s0, scheme: SCHEME, targetPresent: true, view: view() });
    expect(s1.currentStageIndex).toBe(2);
    expect(s1.history.at(-1)?.kind).toBe("exposed_accelerated");
  });

  it("stalls after stall_after_chapters without progress → retreat-and-resume", () => {
    let state = initSchemeState("serena", SCHEME);
    for (let i = 0; i < 3; i += 1) {
      state = evaluateSchemeChapter({ state, scheme: SCHEME, targetPresent: true, view: view() });
    }
    expect(state.history.some((h) => h.kind === "stalled")).toBe(true);
    expect(state.status).toBe("active"); // 교착 처리 후 재개
  });

  it("universal failure: target gone → aborted", () => {
    const s = evaluateSchemeChapter({
      state: initSchemeState("serena", SCHEME), scheme: SCHEME, targetPresent: false, view: view(),
    });
    expect(s.status).toBe("aborted");
  });

  it("deadline miss → on_miss branch (포기)", () => {
    const s = evaluateSchemeChapter({
      state: initSchemeState("serena", SCHEME), scheme: SCHEME, targetPresent: true,
      view: view({ chapter: 11 }),
    });
    expect(s.status).toBe("aborted");
    expect(s.history.at(-1)?.kind).toBe("deadline");
  });

  it("is deterministic — same inputs give identical state twice", () => {
    const input = {
      state: initSchemeState("serena", SCHEME), scheme: SCHEME, targetPresent: true,
      view: view({ trustOf: () => 2 }),
    };
    expect(evaluateSchemeChapter(input)).toEqual(evaluateSchemeChapter(input));
  });
});
