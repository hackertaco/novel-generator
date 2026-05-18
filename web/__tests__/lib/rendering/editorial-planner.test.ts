import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildEditorialPlan } from "@/lib/rendering/editorial-planner";
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

describe("editorial planner", () => {
  it("assigns render weight, expansion mode, POV, and word budget to action logs", () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 1,
      characterActionsPerChapter: 4,
    });
    const sceneLog = result.sceneLogs[0]!;
    const actionLogs = result.actionLogs.filter((log) => log.chapter === sceneLog.chapter);
    const plan = buildEditorialPlan({ sceneLog, actionLogs });

    expect(plan.beatPlans).toHaveLength(actionLogs.length);
    expect(plan.totalSuggestedWordBudget).toBeGreaterThanOrEqual(600);
    expect(plan.primaryPovCharacterId).toBeTruthy();
    expect(plan.diagnostics.maxWeight).toBeGreaterThanOrEqual(plan.diagnostics.minWeight);
    expect(plan.beatPlans.every((beat) => beat.expansionReasons.length > 0)).toBe(true);
    expect(plan.beatPlans.every((beat) => beat.suggestedWordBudget > 0)).toBe(true);
    expect(plan.sceneSections.length).toBeGreaterThanOrEqual(3);
    expect(plan.sceneSections[0]?.role).toBe("setup");
    expect(plan.sceneSections.some((section) => section.role === "inflection")).toBe(true);
    expect(plan.sceneSections.every((section) => section.sourceActionLogIds.length > 0)).toBe(true);
    expect(plan.sceneSections.every((section) => section.renderInstruction.length > 0)).toBe(true);
    expect(plan.beatPlans.some((beat) => beat.renderMode === "expanded" || beat.renderMode === "spotlight"))
      .toBe(true);
    expect(new Set(plan.beatPlans.map((beat) => beat.renderMode)).size).toBeGreaterThan(1);
    expect(plan.diagnostics.modeCounts.spotlight).toBeLessThan(actionLogs.length);
  });
});
