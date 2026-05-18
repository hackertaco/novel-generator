import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildWorldLogEditorialMap, formatWorldLogEditorialMapMarkdown } from "@/lib/rendering/world-log-editorial-map";
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

describe("world log editorial map", () => {
  it("classifies world-log scenes into narrative treatments with source coverage", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 30,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const map = buildWorldLogEditorialMap({
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
    });
    const treatmentTotal = Object.values(map.treatmentCounts).reduce((sum, count) => sum + count, 0);
    const longArcThreads = new Set(map.chapters.flatMap((chapter) => chapter.longArcThreadIds));
    const incidentThreads = new Set(map.chapters.flatMap((chapter) => chapter.incidentThreadIds));

    expect(map.sceneCount).toBe(result.sceneLogs.length);
    expect(map.actionLogCount).toBe(result.actionLogs.length);
    expect(treatmentTotal).toBe(map.sceneCount);
    expect(map.chapters).toHaveLength(30);
    expect(map.chapters.every((chapter) => chapter.sourceActionLogIds.length > 0)).toBe(true);
    expect(map.chapters.every((chapter) => chapter.keyActionLogIds.length > 0)).toBe(true);
    expect(map.chapters.every((chapter) => chapter.reasons.length > 0)).toBe(true);
    expect(map.diagnostics.fullOrExpandedRatio).toBeGreaterThan(0);
    expect(longArcThreads.size).toBeGreaterThanOrEqual(1);
    expect(incidentThreads.size).toBeGreaterThanOrEqual(2);
    expect(new Set(map.chapters.map((chapter) => chapter.narrativeTreatment)).size)
      .toBeGreaterThanOrEqual(2);
  });

  it("formats an editor-readable markdown map", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 3,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const map = buildWorldLogEditorialMap({
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
    });
    const markdown = formatWorldLogEditorialMapMarkdown(map);

    expect(markdown).toContain("# World Log Editorial Map");
    expect(markdown).toContain("treatment:");
    expect(markdown).toContain("key logs:");
    expect(markdown).toContain("reasons:");
  });
});
