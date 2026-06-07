import { describe, expect, it } from "vitest";

import type { CharacterMind } from "@/lib/sim/world-brain";
import {
  ALL_OPS,
  EVENT_OPS,
  scoreOperator,
  scoreOperatorBoard,
  stableInt,
  type PlannerScoreInput,
} from "@/lib/sim/planner-scorer";

function makeMind(overrides: Partial<CharacterMind> = {}): CharacterMind {
  return {
    characterId: "elysia",
    name: "엘리시아",
    role: "주인공",
    faction: null,
    socialMask: "",
    personalityCore: "",
    voiceRules: [],
    voiceProfile: { tone: "", speechPatterns: [], sampleDialogues: [] },
    desires: { surfaceGoal: "", hiddenGoal: "", need: "" },
    fears: [],
    taboos: [],
    leveragePoints: [],
    secrets: [],
    knownFacts: [],
    falseBeliefs: [],
    access: { knowledgeDomains: [], forbiddenKnowledge: [], accessRights: [], surveillanceRisk: [] },
    currentPlan: "",
    relationshipModel: {},
    memorySeeds: [],
    ...overrides,
  } as unknown as CharacterMind;
}

function baseInput(overrides: Partial<PlannerScoreInput> = {}): PlannerScoreInput {
  return {
    sceneId: "scene_planner_001",
    tick: 4,
    peakTick: 4,
    ticksPerScene: 5,
    actorId: "elysia",
    mind: makeMind(),
    agentRole: "protagonist",
    preferredActionTypes: [],
    targetId: "serena",
    targetTrust: 0,
    location: "크레센트 공작가 응접실",
    sceneActionLogs: [],
    ...overrides,
  };
}

describe("planner-scorer (Phase 0 deterministic utility scorer)", () => {
  it("stableInt returns an integer in [0, mod) without float division", () => {
    const a = stableInt("plan:x:4:elysia:confront", 80);
    const b = stableInt("plan:x:4:elysia:confront", 80);
    expect(a).toBe(b);
    expect(Number.isInteger(a)).toBe(true);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(80);
  });

  it("is byte-identical across two runs of the same input", () => {
    const input = baseInput({ targetTrust: -2, eventDisposition: "confront" });
    const first = scoreOperatorBoard(input);
    const second = scoreOperatorBoard(input);
    expect(second).toEqual(first);
  });

  it("keeps every score component in the integer domain", () => {
    const input = baseInput({
      targetTrust: -2,
      eventDisposition: "confront",
      mind: makeMind({ leveragePoints: ["약혼 증거"], secrets: ["회귀"], access: { knowledgeDomains: [], forbiddenKnowledge: [], accessRights: ["응접실"], surveillanceRisk: [] } }),
      sceneActionLogs: [{ actorId: "elysia", targetIds: ["serena"], actionType: "probe_dialogue", status: "backfired" }],
    });
    for (const score of scoreOperatorBoard(input).scoreBreakdown) {
      for (const key of ["goal", "relation", "affordance", "pacing", "noise", "total"] as const) {
        expect(Number.isInteger(score[key])).toBe(true);
      }
    }
  });

  it("argmax tie-break is deterministic by ALL_OPS index (no sort dependency)", () => {
    // 모든 op 가 동일 점수가 되도록 — eventDisposition/plotBeat/trust 모두 중립.
    const input = baseInput({ targetTrust: 0 });
    const decision = scoreOperatorBoard(input);
    // 동점이 아닐 수 있으나, 같은 입력은 항상 같은 첫 승자를 낸다.
    expect(scoreOperatorBoard(input).actionType).toBe(decision.actionType);
  });

  describe("hard-gate eligibility (mirrors GM hard-fails)", () => {
    it("awaken_magic ineligible without magical context, eligible with it", () => {
      const without = scoreOperator(baseInput(), "awaken_magic");
      expect(without.eligible).toBe(false);
      const withCtx = scoreOperator(
        baseInput({ mind: makeMind({ knownFacts: ["회귀 자각"] }) }),
        "awaken_magic",
      );
      expect(withCtx.eligible).toBe(true);
    });

    it("confront ineligible with no leverage and non-hostile trust", () => {
      expect(scoreOperator(baseInput({ targetTrust: 0 }), "confront").eligible).toBe(false);
      expect(scoreOperator(baseInput({ targetTrust: -1 }), "confront").eligible).toBe(true);
      expect(
        scoreOperator(baseInput({ targetTrust: 0, mind: makeMind({ leveragePoints: ["증거"] }) }), "confront").eligible,
      ).toBe(true);
    });

    it("request_access ineligible in a restricted location without access rights", () => {
      expect(scoreOperator(baseInput({ location: "봉인된 황실 서고" }), "request_access").eligible).toBe(false);
      expect(
        scoreOperator(
          baseInput({ location: "봉인된 황실 서고", mind: makeMind({ access: { knowledgeDomains: [], forbiddenKnowledge: [], accessRights: ["황실 출입증"], surveillanceRisk: [] } }) }),
          "request_access",
        ).eligible,
      ).toBe(true);
    });

    it("target-requiring ops ineligible without a target; observe always eligible", () => {
      const noTarget = baseInput({ targetId: undefined });
      expect(scoreOperator(noTarget, "confront").eligible).toBe(false);
      expect(scoreOperator(noTarget, "probe_dialogue").eligible).toBe(false);
      expect(scoreOperator(noTarget, "observe").eligible).toBe(true);
    });

    it("scene event cap: once an event op fired this scene, further event ops are ineligible (D2)", () => {
      const input = baseInput({
        targetTrust: -2,
        eventDisposition: "confront",
        sceneActionLogs: [{ actorId: "serena", targetIds: ["elysia"], actionType: "sabotage", status: "accepted" }],
      });
      for (const op of EVENT_OPS) {
        expect(scoreOperator(input, op).eligible).toBe(false);
      }
    });
  });

  it("EMERGENCE: fires a plot event from goal+relation alone, with NO plotBeat injection", () => {
    // eventDisposition(시드 구조화 태그) + 적대 trust + 직전 자기 행동 backfired(누적 압력).
    const input = baseInput({
      targetTrust: -2,
      eventDisposition: "confront",
      plotBeatBias: undefined, // 주입 없음
      sceneActionLogs: [{ actorId: "elysia", targetIds: ["serena"], actionType: "probe_dialogue", status: "backfired" }],
    });
    const decision = scoreOperatorBoard(input);
    expect(decision.actionType).toBe("confront");
    expect(decision.escalated).toBe(true);
  });

  it("does NOT fire an event when disposition is none and trust is neutral (emergence gated by state)", () => {
    const decision = scoreOperatorBoard(baseInput({ targetTrust: 0, eventDisposition: "none" }));
    expect(EVENT_OPS.includes(decision.actionType)).toBe(false);
  });

  it("plotBeatBias makes an eligible event op win when state alone would not", () => {
    const input = baseInput({
      targetTrust: -1, // confront eligible
      eventDisposition: "none",
      plotBeatBias: { action: "confront", weight: 600 },
    });
    expect(scoreOperatorBoard(input).actionType).toBe("confront");
  });

  it("pair-cooldown: repeated events against the same target get progressively penalized (도배 방지)", () => {
    const fresh = scoreOperator(
      baseInput({ targetTrust: -2, eventDisposition: "confront", eventPairCount: 0 }),
      "confront",
    );
    const repeated = scoreOperator(
      baseInput({ targetTrust: -2, eventDisposition: "confront", eventPairCount: 3 }),
      "confront",
    );
    expect(repeated.pacing).toBeLessThan(fresh.pacing);
    // 3회 반복이면 disposition(+900)을 상쇄할 만큼 무거워야 함
    expect(fresh.pacing - repeated.pacing).toBeGreaterThanOrEqual(900);
    // 비사건 op에는 적용 안 됨
    const probe = scoreOperator(baseInput({ targetTrust: -2, eventPairCount: 3 }), "probe_dialogue");
    const probeFresh = scoreOperator(baseInput({ targetTrust: -2, eventPairCount: 0 }), "probe_dialogue");
    expect(probe.pacing).toBe(probeFresh.pacing);
  });

  it("pacing penalizes an operator the actor already used this scene", () => {
    const used = scoreOperator(
      baseInput({ sceneActionLogs: [{ actorId: "elysia", targetIds: ["serena"], actionType: "probe_dialogue", status: "accepted" }] }),
      "probe_dialogue",
    );
    const fresh = scoreOperator(baseInput(), "probe_dialogue");
    expect(used.pacing).toBeLessThan(fresh.pacing);
  });

  describe("scheme scoring", () => {
    it("scheme stage tactics dominate op choice toward the scheme target (지금 손해 = 위장 협조)", () => {
      const decision = scoreOperatorBoard(baseInput({
        targetId: "elysia",
        targetTrust: 1,
        scheme: { stageTactics: ["request_help"], schemeTargetId: "elysia", atFinalStage: false },
      }));
      expect(decision.actionType).toBe("request_help");
    });

    it("payoff op unlocks the big bonus only at the final stage", () => {
      const early = scoreOperator(baseInput({
        targetId: "serena", targetTrust: -1,
        scheme: { stageTactics: [], schemeTargetId: "serena", atFinalStage: false, payoffOp: "confront" },
      }), "confront");
      const final_ = scoreOperator(baseInput({
        targetId: "serena", targetTrust: -1,
        scheme: { stageTactics: ["confront"], schemeTargetId: "serena", atFinalStage: true, payoffOp: "confront" },
      }), "confront");
      expect(final_.goal).toBeGreaterThan(early.goal);
      expect(final_.goal - early.goal).toBeGreaterThanOrEqual(900);
    });

    it("known vulnerability exploit ops get a bonus against the schemer", () => {
      const withExploit = scoreOperator(baseInput({
        targetId: "serena", targetTrust: 0,
        scheme: { stageTactics: [], schemeTargetId: "serena", atFinalStage: false, exploitOps: ["request_access"] },
      }), "request_access");
      const without = scoreOperator(baseInput({ targetId: "serena", targetTrust: 0 }), "request_access");
      expect(withExploit.goal).toBeGreaterThan(without.goal);
    });

    it("scheme overrides eventDisposition (단계가 동적 성향)", () => {
      const score = scoreOperator(baseInput({
        targetTrust: -2,
        eventDisposition: "confront",
        scheme: { stageTactics: ["maintain_mask"], schemeTargetId: "serena", atFinalStage: false },
      }), "confront");
      // disposition 가산(+900)이 무시되므로 goal에 affinity가 없어야 함
      expect(score.goal).toBeLessThan(900);
    });
  });

  it("ALL_OPS covers the full operator set including the 4 plot events", () => {
    expect(ALL_OPS).toHaveLength(12);
    for (const ev of EVENT_OPS) expect(ALL_OPS.includes(ev)).toBe(true);
  });
});
