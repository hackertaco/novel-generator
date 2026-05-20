import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { selectEpisodeWindows } from "@/lib/rendering";
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
  return NovelSeedSchema.parse(normalizeLegacySeedInput(JSON.parse(readFileSync(
    join(process.cwd(), "seeds/test-romance-fantasy.json"),
    "utf8",
  ))));
}

function runWorld(fast: boolean) {
  return runWorldModelFirstSimulation(loadFixtureSeed(), {
    startChapter: 1,
    endChapter: 8,
    maxBeatsPerChapter: 3,
    characterActionsPerChapter: 4,
    characterSimulationMode: "agent_ticks",
    skipRenderedChapters: fast,
    fastLedgerValidation: fast,
    fastEventApplication: fast,
    disableGenreConvention: true,
  });
}

describe("world runner fast path", () => {
  it("keeps timeline source logs and episode selection equivalent to the full projection path", { timeout: 30_000 }, () => {
    const full = runWorld(false);
    const fast = runWorld(true);

    expect(fast.chapters).toHaveLength(0);
    expect(full.chapters.length).toBeGreaterThan(0);
    expect(fast.report.generatedChapterCount).toBe(fast.sceneLogs.length);
    expect(fast.report.validation.passed).toBe(true);

    expect(fast.state.eventLog.map((event) => event.id)).toEqual(
      full.state.eventLog.map((event) => event.id),
    );
    expect(fast.sceneLogs.map((scene) => scene.sceneId)).toEqual(
      full.sceneLogs.map((scene) => scene.sceneId),
    );
    expect(fast.actionLogs.map((log) => log.logId)).toEqual(
      full.actionLogs.map((log) => log.logId),
    );
    expect(fast.interactionResolutions.map((item) => item.resolutionId)).toEqual(
      full.interactionResolutions.map((item) => item.resolutionId),
    );

    expect(fast.actionLogs.map((log) => log.visibleBehavior)).toEqual(
      full.actionLogs.map((log) => log.visibleBehavior),
    );
    expect(fast.actionLogs.map((log) => log.actualEffect.followUpActionSeed)).toEqual(
      full.actionLogs.map((log) => log.actualEffect.followUpActionSeed),
    );

    const fullSelection = selectEpisodeWindows({
      result: full,
      targetEpisodeCount: 3,
      selectionMode: "highest_impact",
      maxScenesPerEpisode: 1,
    });
    const fastSelection = selectEpisodeWindows({
      result: fast,
      targetEpisodeCount: 3,
      selectionMode: "highest_impact",
      maxScenesPerEpisode: 1,
    });

    expect(fastSelection.windows.map((window) => window.sourceSceneIds)).toEqual(
      fullSelection.windows.map((window) => window.sourceSceneIds),
    );
    expect(fastSelection.windows.map((window) => window.sourceActionLogIds)).toEqual(
      fullSelection.windows.map((window) => window.sourceActionLogIds),
    );
    expect(fastSelection.diagnostics.coveredActionLogRatio).toBe(
      fullSelection.diagnostics.coveredActionLogRatio,
    );
  });
});
