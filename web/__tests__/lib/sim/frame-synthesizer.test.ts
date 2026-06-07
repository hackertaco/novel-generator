import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import { buildWorldBrainFromSeed } from "@/lib/sim/world-brain";
import { initSchemeState, type SchemeRuntimeState } from "@/lib/sim/scheme-engine";
import { synthesizeChapterFrame, type SynthesizedFrame } from "@/lib/sim/frame-synthesizer";

function normalize(input: Record<string, unknown>): unknown {
  const foreshadowing = (Array.isArray(input.foreshadowing) ? input.foreshadowing : []).map((item) => {
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
  });
  return { ...input, story_threads: input.story_threads ?? [], extended_outlines: input.extended_outlines ?? [], foreshadowing };
}

function loadSeed(): NovelSeed {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "seeds/test-romance-fantasy-scheme.json"), "utf8"));
  return NovelSeedSchema.parse(normalize(raw));
}

describe("frame synthesizer (역전 모드 상황판)", () => {
  const seed = loadSeed();
  const brain = buildWorldBrainFromSeed(seed);
  const serenaScheme = brain.characterMinds.serena!.scheme!;

  function statesAtStage(index: number): Map<string, SchemeRuntimeState> {
    const state = { ...initSchemeState("serena", serenaScheme), currentStageIndex: index };
    return new Map([["serena", state]]);
  }

  function frameAt(chapter: number, states: Map<string, SchemeRuntimeState>, seedOverride = seed): SynthesizedFrame {
    return synthesizeChapterFrame({ seed: seedOverride, brain, chapter, totalChapters: 24, schemeStates: states });
  }

  it("derives tension: payoff(release_satisfaction) 단계는 8+, 초기 단계보다 높다", () => {
    const early = frameAt(2, statesAtStage(0));
    const payoff = frameAt(2, statesAtStage(2));
    expect(payoff.tensionLevel).toBeGreaterThanOrEqual(8);
    expect(payoff.tensionLevel).toBeGreaterThan(early.tensionLevel);
    expect(early.tensionLevel).toBeGreaterThanOrEqual(1);
    expect(early.tensionLevel).toBeLessThanOrEqual(10);
  });

  it("adds +1 on foreshadow reveal chapters (동일 조건 비교)", () => {
    const revealChapter = seed.foreshadowing.find((f) => typeof f.reveal_at === "number")?.reveal_at;
    if (typeof revealChapter !== "number") return; // 시드에 reveal 없으면 skip
    const noForeshadowSeed = { ...seed, foreshadowing: [] } as NovelSeed;
    const withReveal = frameAt(revealChapter, statesAtStage(0));
    const without = frameAt(revealChapter, statesAtStage(0), noForeshadowSeed);
    expect(withReveal.tensionLevel).toBe(Math.min(10, without.tensionLevel + 1));
  });

  it("prioritizes scheme participants (주체/대상) in characterIds", () => {
    const frame = frameAt(2, statesAtStage(0));
    expect(frame.characterIds[0]).toBe("serena");
    expect(frame.characterIds).toContain("elysia");
  });

  it("has NO keyPoints field (구조적 보증 — 사건 내용을 줄 수 없음)", () => {
    const frame = frameAt(2, statesAtStage(0));
    expect("keyPoints" in frame).toBe(false);
    expect("keyPointCauses" in frame).toBe(false);
  });

  it("is deterministic", () => {
    expect(frameAt(5, statesAtStage(1))).toEqual(frameAt(5, statesAtStage(1)));
  });

  it("works without any scheme (fallback)", () => {
    const frame = frameAt(3, new Map());
    expect(frame.tensionLevel).toBeGreaterThanOrEqual(1);
    expect(frame.characterIds.length).toBeGreaterThan(0);
    expect(frame.oneLiner.length).toBeGreaterThan(0);
  });
});
