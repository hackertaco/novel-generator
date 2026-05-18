import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildWorldLogEditorialMap,
  evaluateNovelOutputQA,
  polishEpisodeDraftProse,
  renderEpisodeDraftFromWorldLog,
  selectEpisodeWindows,
} from "@/lib/rendering";
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

describe("episode draft renderer", () => {
  it("renders a no-cost episode body from selected world logs", () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const episodeWindow = selectEpisodeWindows({
      result,
      targetEpisodeCount: 1,
      maxScenesPerEpisode: 3,
    }).windows[0]!;
    const worldLogEditorialMap = buildWorldLogEditorialMap({
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
    });
    const draft = renderEpisodeDraftFromWorldLog({
      episodeWindow,
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
      worldLogEditorialMap,
    });
    const polished = polishEpisodeDraftProse(draft.text);
    const qa = evaluateNovelOutputQA({
      text: polished.text,
      episodeWindow,
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
      worldLogEditorialMap,
    });

    expect(polished.text).toContain("# 1화.");
    expect(polished.text).toContain("“");
    expect(polished.text).toMatch(/공작 영애님|형님|내가 먼저|보죠/u);
    expect(polished.text).toMatch(/아가씨|언니/u);
    expect(polished.text).not.toContain("sourceActionLogId");
    expect(polished.text).not.toContain("act_ch");
    expect(polished.text).not.toContain("공개 답변");
    expect(polished.text).not.toMatch(/->|신뢰 축|state|delta|source/iu);
    expect(polished.report.internalMarkerCount).toBe(0);
    expect(polished.report.changedReplacementCount).toBeGreaterThan(0);
    expect(draft.report.sourceActionLogCoverage).toBe(1);
    expect(draft.report.renderedActionLogCount).toBe(episodeWindow.sourceActionLogIds.length);
    expect(draft.report.paragraphCount).toBeGreaterThan(episodeWindow.sourceActionLogIds.length);
    expect(qa.metrics.sourceCoverage.score).toBeGreaterThanOrEqual(0.8);
    expect(qa.metrics.metaLeakSafety.score).toBe(1);
    expect(qa.metrics.treatmentCompliance.score).toBeGreaterThanOrEqual(0.75);
  });

  it("hides generic source chapter titles and removes log-style obligation prose", () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 16,
      endChapter: 18,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const episodeWindow = selectEpisodeWindows({
      result,
      targetEpisodeCount: 1,
      maxScenesPerEpisode: 3,
    }).windows[0]!;
    const worldLogEditorialMap = buildWorldLogEditorialMap({
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
    });
    const draft = renderEpisodeDraftFromWorldLog({
      episodeWindow,
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
      worldLogEditorialMap,
    });
    const polished = polishEpisodeDraftProse(draft.text);

    expect(polished.text).toContain("# 1화.");
    expect(polished.text).not.toMatch(/^# 1화\. \d+화$/mu);
    expect(polished.text).not.toContain("해야 했다");
    expect(polished.text).not.toContain("공개 답변");
    expect(polished.text).not.toContain("회귀 후 상황을 파악");
    expect(polished.text).not.toContain("읽힌 습관을 다른 신호로 덮었다");
    expect(polished.text).not.toMatch(/시선을 둔다|길을 연다|말끝을 되받는다/u);
  });
});
