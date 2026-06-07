import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { selectEpisodeWindows } from "@/lib/rendering/episode-selector";
import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
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
        : typeof value.plant_chapter === "number"
          ? value.plant_chapter
          : 1;
      const revealAt = typeof value.reveal_at === "number"
        ? value.reveal_at
        : typeof value.reveal_chapter === "number"
          ? value.reveal_chapter
          : null;
      return {
        ...value,
        name: value.name ?? value.id,
        canonical_target: value.canonical_target ?? value.description,
        planted_at: plantedAt,
        hints_at: value.hints_at ?? value.hint_chapters ?? [],
        reveal_at: revealAt,
      };
    })
    : [];
  return {
    ...seed,
    story_threads: seed.story_threads ?? [],
    extended_outlines: seed.extended_outlines ?? [],
    foreshadowing,
  };
}

function loadFixtureSeed(): NovelSeed {
  const raw = readFileSync(
    join(process.cwd(), "seeds/test-romance-fantasy.json"),
    "utf8",
  );
  return NovelSeedSchema.parse(normalizeLegacySeedInput(JSON.parse(raw)));
}

describe("episode selector", () => {
  it("selects episode windows from the world timeline without treating chapter as the model boundary", { timeout: 30_000 }, () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 5,
      characterActionsPerChapter: 4,
    });
    const plan = selectEpisodeWindows({
      result,
      targetEpisodeCount: 3,
      selectionMode: "highest_impact",
    });

    expect(plan.mode).toBe("episode_selection");
    expect(plan.selectedEpisodeCount).toBe(3);
    expect(plan.sourceSceneCount).toBe(5);
    expect(plan.windows.map((window) => window.episodeNumber)).toEqual([1, 2, 3]);
    expect(plan.windows.every((window) => window.sourceSceneIds.length > 0)).toBe(true);
    expect(plan.windows.every((window) => window.sourceActionLogIds.length > 0)).toBe(true);
    expect(plan.windows.every((window) => window.sourceStateDeltaIds.length >= 3)).toBe(true);
    expect(plan.windows.every((window) => window.sourcePlanLifecycleIds.length > 0)).toBe(true);
    expect(plan.windows.every((window) => window.sourceDirectorPressureIds.length > 0)).toBe(true);
    expect(plan.windows.every((window) => window.selectionReasons.length > 0)).toBe(true);
    expect(plan.windows.some((window) =>
      window.selectionReasons.includes("concrete state delta가 충분해 소설화 근거가 있음")
    )).toBe(true);
    expect(plan.windows.every((window) => window.editorialIntent.includes("episode"))).toBe(true);
    expect(plan.diagnostics.coveredActionLogRatio).toBeGreaterThan(0);
    expect(plan.diagnostics.averageStateDeltaCountPerEpisode).toBeGreaterThan(3);
    expect(plan.diagnostics.averagePlanLifecycleCountPerEpisode).toBeGreaterThan(0);
    expect(plan.diagnostics.maxSelectionScore).toBeGreaterThanOrEqual(plan.diagnostics.minSelectionScore);
  });

  it("can group adjacent timeline scenes into fewer episode windows", { timeout: 30_000 }, () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 5,
      characterActionsPerChapter: 4,
    });
    const plan = selectEpisodeWindows({
      result,
      targetEpisodeCount: 2,
      selectionMode: "timeline_order",
      maxScenesPerEpisode: 3,
    });

    expect(plan.selectedEpisodeCount).toBe(2);
    expect(plan.windows.some((window) => window.sourceSceneIds.length > 1)).toBe(true);
    expect(plan.windows.flatMap((window) => window.sourceSceneIds)).toHaveLength(5);
    expect(plan.diagnostics.averageSceneCountPerEpisode).toBeGreaterThan(1);
    expect(plan.diagnostics.averageActionLogCountPerEpisode).toBeGreaterThan(8);
    expect(plan.diagnostics.coveredActionLogRatio).toBe(1);
  });

  it("can deliberately select lower-impact connector windows", { timeout: 30_000 }, () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 8,
      characterActionsPerChapter: 4,
    });
    const high = selectEpisodeWindows({
      result,
      targetEpisodeCount: 3,
      selectionMode: "highest_impact",
      maxScenesPerEpisode: 1,
    });
    const low = selectEpisodeWindows({
      result,
      targetEpisodeCount: 3,
      selectionMode: "lowest_impact",
      maxScenesPerEpisode: 1,
    });

    expect(low.selectionMode).toBe("lowest_impact");
    expect(low.selectedEpisodeCount).toBe(3);
    expect(low.windows.every((window) => window.sourceActionLogIds.length > 0)).toBe(true);
    expect(low.diagnostics.averageSelectionScore).toBeLessThanOrEqual(high.diagnostics.averageSelectionScore);
    expect(new Set(low.windows.map((window) => window.timelineIndex)).size).toBe(low.windows.length);
  });
});
