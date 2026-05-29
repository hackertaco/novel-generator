import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveChapterMicroBeats } from "@/lib/sim/chapter-outline-derivation";
import { buildWorldBrainFromSeed } from "@/lib/sim";
import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";

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

function loadSeed(): NovelSeed {
  const raw = readFileSync(
    join(process.cwd(), "seeds/test-romance-fantasy.json"),
    "utf8",
  );
  return NovelSeedSchema.parse(normalizeLegacySeedInput(JSON.parse(raw)));
}

describe("deriveChapterMicroBeats", () => {
  it("derives concrete chapter-1 beats from arc / foreshadow / plan / genre_origin", () => {
    const seed = loadSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const beats = deriveChapterMicroBeats({
      seed,
      brain,
      chapter: 1,
      characterIds: ["elysia", "serena", "marian"],
    });

    expect(beats.length).toBeGreaterThan(0);
    const sources = new Set(beats.map((b) => b.source));
    // 회귀 자각 (genre_origin) 포함.
    expect(sources.has("genre_origin")).toBe(true);
    // 1화 plant 복선 (시간 마법) 포함.
    expect(sources.has("foreshadow_plant")).toBe(true);
    // arc 시작화 key_event 포함.
    expect(sources.has("arc_key_event")).toBe(true);
    // 적어도 하나의 character plan.
    expect(sources.has("character_plan")).toBe(true);
  });

  it("includes the time-magic foreshadow plant text for chapter 1", () => {
    const seed = loadSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const beats = deriveChapterMicroBeats({
      seed,
      brain,
      chapter: 1,
      characterIds: ["elysia"],
    });
    const plant = beats.find((b) => b.source === "foreshadow_plant");
    expect(plant?.beat).toContain("시계");
  });

  it("omits genre_origin beats on chapters past awareness_chapter", () => {
    const seed = loadSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const beats = deriveChapterMicroBeats({
      seed,
      brain,
      chapter: 5,
      characterIds: ["elysia", "serena"],
    });
    expect(beats.some((b) => b.source === "genre_origin")).toBe(false);
  });

  it("returns no character_plan beats for ids absent from the brain", () => {
    const seed = loadSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const beats = deriveChapterMicroBeats({
      seed,
      brain,
      chapter: 1,
      characterIds: ["nonexistent_character"],
    });
    expect(beats.some((b) => b.source === "character_plan")).toBe(false);
  });
});
