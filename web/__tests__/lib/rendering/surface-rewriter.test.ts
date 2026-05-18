import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildSurfaceRewritePrompt,
  renderObservableFallback,
} from "@/lib/rendering/surface-rewriter";
import { validateNarrativeProse } from "@/lib/rendering/narrative-prose-validator";
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

describe("surface rewriter", () => {
  it("builds a repair prompt with failed excerpts and observable-source logs", () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 1,
      characterActionsPerChapter: 2,
    });
    const sceneLog = result.sceneLogs[0]!;
    const actionLogs = result.actionLogs.filter((log) => log.chapter === sceneLog.chapter);
    const prompt = buildSurfaceRewritePrompt({
      text: "엘리시아는 그 속내를 읽으려 애썼고 압박을 느꼈다.",
      sceneLog,
      actionLogs,
    });

    expect(prompt).toContain("실패 판정");
    expect(prompt).toContain("반드시 보존할 로그 순서");
    expect(prompt).toContain("카메라에 보이는 표면");
    expect(prompt).toContain(actionLogs[0]!.visibleBehavior);
  });

  it("can render an observable fallback that passes narrative prose validation", () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 1,
      characterActionsPerChapter: 4,
    });
    const sceneLog = result.sceneLogs[0]!;
    const actionLogs = result.actionLogs.filter((log) => log.chapter === sceneLog.chapter);
    const text = renderObservableFallback({
      text: "엘리시아는 그 속내를 읽으려 애썼고 압박을 느꼈다.",
      sceneLog,
      actionLogs,
    });
    const validation = validateNarrativeProse({ text });

    expect(text).toContain(sceneLog.title);
    expect(text).toContain(actionLogs[0]!.actorName);
    expect(validation.violationCount).toBe(0);
  });
});
