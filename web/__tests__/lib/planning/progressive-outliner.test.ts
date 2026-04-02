import { describe, it, expect } from "vitest";
import { needsDetailedOutline } from "@/lib/planning/progressive-outliner";
import type { NovelSeed } from "@/lib/schema/novel";

function makeMinimalSeed(overrides: Partial<NovelSeed> = {}): NovelSeed {
  return {
    title: "테스트 소설",
    logline: "테스트 로그라인",
    total_chapters: 30,
    world: {
      name: "테스트 세계",
      genre: "판타지",
      sub_genre: "회귀",
      time_period: "중세",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    chapter_outlines: [],
    style_guide: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "3인칭",
      tense: "과거형",
      formatting_rules: [],
    },
    foreshadowing: [],
    extended_outlines: [],
    ...overrides,
  } as NovelSeed;
}

describe("needsDetailedOutline", () => {
  it("returns false for chapters 1-10", () => {
    const seed = makeMinimalSeed({
      extended_outlines: [{ chapter_number: 5, title: "5화", one_liner: "뭔가 일어남", reveals: [] }],
    });
    expect(needsDetailedOutline(seed, 5)).toBe(false);
    expect(needsDetailedOutline(seed, 10)).toBe(false);
  });

  it("returns true for chapter 11+ with extended outline but no detailed outline", () => {
    const seed = makeMinimalSeed({
      extended_outlines: [
        { chapter_number: 11, title: "11화", one_liner: "새로운 전개", reveals: [] },
      ],
      chapter_outlines: [],
    });
    expect(needsDetailedOutline(seed, 11)).toBe(true);
  });

  it("returns false when detailed outline already exists with key_points", () => {
    const seed = makeMinimalSeed({
      extended_outlines: [
        { chapter_number: 11, title: "11화", one_liner: "새로운 전개", reveals: [] },
      ],
      chapter_outlines: [
        {
          chapter_number: 11,
          title: "11화",
          arc_id: "arc1",
          one_liner: "새로운 전개",
          key_points: ["사건 A 발생"],
          characters_involved: [],
          tension_level: 5,
          advances_thread: [],
        },
      ],
    });
    expect(needsDetailedOutline(seed, 11)).toBe(false);
  });

  it("returns false when no extended outline exists", () => {
    const seed = makeMinimalSeed({
      extended_outlines: [],
      chapter_outlines: [],
    });
    expect(needsDetailedOutline(seed, 15)).toBe(false);
  });

  it("returns true when outline exists but has empty key_points", () => {
    const seed = makeMinimalSeed({
      extended_outlines: [
        { chapter_number: 12, title: "12화", one_liner: "전개", reveals: [] },
      ],
      chapter_outlines: [
        {
          chapter_number: 12,
          title: "12화",
          arc_id: "arc1",
          one_liner: "전개",
          key_points: [],
          characters_involved: [],
          tension_level: 5,
          advances_thread: [],
        },
      ],
    });
    expect(needsDetailedOutline(seed, 12)).toBe(true);
  });
});
