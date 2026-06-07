import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import type { Scheme } from "@/lib/schema/character";
import { buildWorldBrainFromSeed } from "@/lib/sim/world-brain";
import { runWorldModelFirstSimulation } from "@/lib/sim/world-runner";

function normalizeLegacySeedInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const seed = input as Record<string, unknown>;
  const foreshadowing = Array.isArray(seed.foreshadowing)
    ? seed.foreshadowing.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const value = { ...(item as Record<string, unknown>) };
      const plantedAt = typeof value.planted_at === "number"
        ? value.planted_at
        : typeof value.plant_chapter === "number" ? value.plant_chapter : 1;
      return {
        ...value,
        name: value.name ?? value.id,
        canonical_target: value.canonical_target ?? value.description,
        planted_at: plantedAt,
        hints_at: value.hints_at ?? value.hint_chapters ?? [],
        reveal_at: typeof value.reveal_at === "number"
          ? value.reveal_at
          : typeof value.reveal_chapter === "number" ? value.reveal_chapter : null,
        origin: value.origin ?? {
          episode_id: `ep_${String(plantedAt).padStart(3, "0")}`,
          scene_id: `scene_${String(plantedAt).padStart(3, "0")}_01`,
          source_span: { start_offset: 0, end_offset: 1, excerpt: String(value.description ?? value.id ?? "f") },
        },
      };
    })
    : [];
  return { ...seed, story_threads: seed.story_threads ?? [], extended_outlines: seed.extended_outlines ?? [], foreshadowing };
}

const SERENA_SCHEME: Scheme = {
  objective: "약혼을 파탄내고 엘리시아를 축출한다",
  motive: "황태자비 자리",
  target: "elysia",
  stakes: { on_success: "내정", on_failure: "몰락", collateral: [] },
  cover_story: "다정한 동생",
  stages: [
    {
      id: "신뢰_쌓기",
      goal: "다정한 동생으로 곁에 머문다",
      tactics: ["request_help", "maintain_mask"],
      advance_when: { chapter_at_least: 3 },
      vulnerability: { fact: "세레나의 명단 접근 기록", exploit_ops: ["request_access"] },
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
  if_exposed: { response: "가속", exposure_threshold: 3 },
  accomplices: [],
} as Scheme;

function loadSchemedSeed(): NovelSeed {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "seeds/test-romance-fantasy.json"), "utf8"));
  const normalized = normalizeLegacySeedInput(raw) as { characters: Array<Record<string, unknown>> };
  for (const character of normalized.characters) {
    if (character.id === "serena") {
      character.intent_profile = {
        ...(character.intent_profile as Record<string, unknown> ?? { surface_goal: "s", hidden_goal: "h", core_fear: "f" }),
        scheme: SERENA_SCHEME,
      };
    }
    if (character.id === "elysia") {
      character.intent_profile = {
        ...(character.intent_profile as Record<string, unknown> ?? { surface_goal: "s", hidden_goal: "h", core_fear: "f" }),
        foreknowledge: { source: "회귀", knows_schemes_of: ["serena"] },
      };
    }
  }
  return NovelSeedSchema.parse(normalized);
}

function loadPlainSeed(): NovelSeed {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "seeds/test-romance-fantasy.json"), "utf8"));
  return NovelSeedSchema.parse(normalizeLegacySeedInput(raw));
}

describe("scheme world-brain compile", () => {
  it("carries scheme onto the mind and injects foreknowledge into knownFacts", () => {
    const brain = buildWorldBrainFromSeed(loadSchemedSeed());
    expect(brain.characterMinds.serena?.scheme?.stages).toHaveLength(3);
    expect(brain.characterMinds.elysia?.foreknownSchemes).toEqual(["serena"]);
    expect(brain.characterMinds.elysia?.knownFacts.some((fact) => fact.includes("음모"))).toBe(true);
    // scheme 없는 인물은 영향 없음
    expect(brain.characterMinds.marian?.scheme).toBeUndefined();
  });
});

describe("scheme runtime lifecycle (shadow — 행동 불변)", () => {
  it("records scheme stage transitions on the timeline without changing action selection", () => {
    // shadow 검증 목적이므로 planner 를 명시적으로 끈다 (Phase 3 부터 기본은 true).
    const schemed = runWorldModelFirstSimulation(loadSchemedSeed(), {
      startChapter: 1, endChapter: 6, characterActionsPerChapter: 4, plannerEnabled: false,
    });
    const plain = runWorldModelFirstSimulation(loadPlainSeed(), {
      startChapter: 1, endChapter: 6, characterActionsPerChapter: 4, plannerEnabled: false,
    });

    // timeline에 advanced 기록 (chapter_at_least:3 → 3챕터 평가 시 advance)
    expect(schemed.schemeTimeline.length).toBeGreaterThanOrEqual(1);
    expect(schemed.schemeTimeline.some((entry) => entry.kind === "advanced" && entry.characterId === "serena")).toBe(true);

    // shadow: plannerEnabled 미설정이므로 행동 type 시퀀스는 scheme 유무와 무관하게 동일
    expect(schemed.actionLogs.map((log) => log.action.type)).toEqual(plain.actionLogs.map((log) => log.action.type));

    // scheme 없는 시드는 timeline 빈 배열
    expect(plain.schemeTimeline).toEqual([]);
  }, 30_000);

  it("is deterministic — two schemed runs produce identical timelines", () => {
    const first = runWorldModelFirstSimulation(loadSchemedSeed(), { startChapter: 1, endChapter: 5, characterActionsPerChapter: 4 });
    const second = runWorldModelFirstSimulation(loadSchemedSeed(), { startChapter: 1, endChapter: 5, characterActionsPerChapter: 4 });
    expect(second.schemeTimeline).toEqual(first.schemeTimeline);
  }, 30_000);
});

describe("scheme transition event promotion (B2a)", () => {
  it("promotes scheme transitions to ledger-valid SimulationEvents with cut-point tags", () => {
    const result = runWorldModelFirstSimulation(loadSchemedSeed(), {
      startChapter: 1, endChapter: 4, characterActionsPerChapter: 4,
    });
    const transitions = (result.ledger.events ?? []).filter((event) =>
      event.tags?.includes("scheme-transition"),
    );
    expect(transitions.length).toBeGreaterThanOrEqual(1);
    expect(transitions[0]!.tags).toEqual(expect.arrayContaining(["cut-point-candidate"]));
    expect(transitions[0]!.actorId).toBe("serena");
    // 정식 장부 검증 통과 (순서/인과)
    expect(result.report.validation.passed).toBe(true);
  }, 60_000);
});

describe("scheme drives behavior when planner is enabled (다화 책략 실행)", () => {
  it("serena acts cooperative during 신뢰_쌓기, then escalates after stage advances", () => {
    const result = runWorldModelFirstSimulation(loadSchemedSeed(), {
      startChapter: 1, endChapter: 8, characterActionsPerChapter: 4, plannerEnabled: true,
    });

    const advancedAt = result.schemeTimeline.find((entry) =>
      entry.characterId === "serena" && entry.kind === "advanced" && entry.stageId === "신뢰_쌓기",
    );
    expect(advancedAt).toBeDefined();

    const serenaLogs = result.actionLogs.filter((log) => log.actorId === "serena");
    const before = serenaLogs.filter((log) => log.chapter <= (advancedAt?.chapter ?? 0));
    const after = serenaLogs.filter((log) => log.chapter > (advancedAt?.chapter ?? 0));

    // 신뢰_쌓기 동안: 위장 협조(전술 op)가 우세, 사건 op는 없음 — "지금 손해"
    const stageOneTactics = new Set(["request_help", "maintain_mask"]);
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((log) => stageOneTactics.has(log.action.type)).length / before.length)
      .toBeGreaterThanOrEqual(0.5);
    expect(before.some((log) => ["confront", "sabotage", "take_physical"].includes(log.action.type))).toBe(false);

    // 단계 전환 후: 은밀/회수 사건 op가 등장 — "늦은 회수"
    expect(after.some((log) => ["take_physical", "sabotage", "confront"].includes(log.action.type))).toBe(true);

    // 결정성
    const rerun = runWorldModelFirstSimulation(loadSchemedSeed(), {
      startChapter: 1, endChapter: 8, characterActionsPerChapter: 4, plannerEnabled: true,
    });
    expect(rerun.schemeTimeline).toEqual(result.schemeTimeline);
    expect(rerun.actionLogs.map((log) => log.action.type)).toEqual(result.actionLogs.map((log) => log.action.type));
  }, 60_000);
});
