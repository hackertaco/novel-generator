/**
 * Unit tests for the scene density evaluator.
 *
 * Verifies:
 *   - MIN_SCENES_PER_CHAPTER / MAX_SCENES_PER_CHAPTER constants
 *   - Per-chapter violation detection (too_few / too_many)
 *   - Score = in_range_chapters / total_chapters
 *   - overall_score, pass, aggregate stats
 *   - Edge cases (empty outlines, exact boundary values)
 */

import { describe, it, expect } from "vitest";
import {
  evaluateSceneDensity,
  MIN_SCENES_PER_CHAPTER,
  MAX_SCENES_PER_CHAPTER,
} from "@/lib/evolution/evaluators/scene-density";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal NovelSeed with the given per-chapter key_point counts.
 * Each element of `sceneCountsPerChapter` becomes one ChapterOutline.
 * chapter_number is 1-based by default.
 */
function makeSeed(
  sceneCountsPerChapter: number[],
  chapterNumbers?: number[],
): NovelSeed {
  return {
    title: "테스트 소설",
    logline: "테스트용 로그라인",
    total_chapters: sceneCountsPerChapter.length,
    world: {
      name: "테스트 세계",
      genre: "현대 판타지",
      sub_genre: "헌터물",
      time_period: "현대",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    story_threads: [],
    arcs: [],
    chapter_outlines: sceneCountsPerChapter.map((count, idx) => ({
      chapter_number: chapterNumbers?.[idx] ?? idx + 1,
      title: `${idx + 1}화`,
      arc_id: "arc_1",
      one_liner: "테스트 요약",
      advances_thread: [],
      key_points: Array.from({ length: count }, (_, i) => `씬_${i + 1}`),
      characters_involved: [],
      tension_level: 5,
    })),
    extended_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("MIN_SCENES_PER_CHAPTER is 2", () => {
    expect(MIN_SCENES_PER_CHAPTER).toBe(2);
  });

  it("MAX_SCENES_PER_CHAPTER is 5", () => {
    expect(MAX_SCENES_PER_CHAPTER).toBe(5);
  });

  it("MIN < MAX", () => {
    expect(MIN_SCENES_PER_CHAPTER).toBeLessThan(MAX_SCENES_PER_CHAPTER);
  });
});

// ---------------------------------------------------------------------------
// Per-chapter detection
// ---------------------------------------------------------------------------

describe("per-chapter scene density", () => {
  it("marks chapter in_range when scene count equals MIN boundary (2)", () => {
    const seed = makeSeed([2]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].in_range).toBe(true);
    expect(result.chapter_details[0].violation_type).toBeNull();
  });

  it("marks chapter in_range when scene count equals MAX boundary (5)", () => {
    const seed = makeSeed([5]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].in_range).toBe(true);
    expect(result.chapter_details[0].violation_type).toBeNull();
  });

  it("marks chapter in_range for scene count 3 (mid-range)", () => {
    const seed = makeSeed([3]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].in_range).toBe(true);
  });

  it("detects too_few when chapter has 0 scenes", () => {
    const seed = makeSeed([0]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].in_range).toBe(false);
    expect(result.chapter_details[0].violation_type).toBe("too_few");
    expect(result.chapter_details[0].scene_count).toBe(0);
  });

  it("detects too_few when chapter has 1 scene (below MIN)", () => {
    const seed = makeSeed([1]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].violation_type).toBe("too_few");
    expect(result.chapter_details[0].in_range).toBe(false);
  });

  it("detects too_many when chapter has 6 scenes (above MAX)", () => {
    const seed = makeSeed([6]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].in_range).toBe(false);
    expect(result.chapter_details[0].violation_type).toBe("too_many");
    expect(result.chapter_details[0].scene_count).toBe(6);
  });

  it("detects too_many when chapter has 10 scenes", () => {
    const seed = makeSeed([10]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].violation_type).toBe("too_many");
  });

  it("records correct chapter_number in chapter_details", () => {
    const seed = makeSeed([3, 1, 7], [1, 2, 3]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].chapter_number).toBe(1);
    expect(result.chapter_details[1].chapter_number).toBe(2);
    expect(result.chapter_details[2].chapter_number).toBe(3);
  });

  it("produces one detail entry per chapter outline", () => {
    const seed = makeSeed([2, 3, 4, 5]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

describe("score calculation", () => {
  it("returns 1.0 when all chapters are in range", () => {
    const seed = makeSeed([2, 3, 4, 5]);
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.in_range_count).toBe(4);
  });

  it("returns 0.0 when no chapters are in range", () => {
    const seed = makeSeed([0, 1, 6, 8]);
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(0.0);
    expect(result.pass).toBe(false);
    expect(result.in_range_count).toBe(0);
  });

  it("returns 0.5 when half the chapters are in range", () => {
    // 2 in range, 2 out of range
    const seed = makeSeed([3, 5, 0, 7]);
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(0.5);
    expect(result.in_range_count).toBe(2);
  });

  it("score = in_range_count / total_chapters", () => {
    // 3 chapters: 2 in range, 1 violation
    const seed = makeSeed([2, 4, 1]);
    const result = evaluateSceneDensity(seed);

    const expected = 2 / 3;
    expect(result.overall_score).toBeCloseTo(expected, 3);
  });

  it("score is within [0, 1] for any input", () => {
    const scenarios = [
      makeSeed([]),
      makeSeed([0]),
      makeSeed([5]),
      makeSeed([10]),
      makeSeed([2, 3, 4, 5, 6]),
    ];
    for (const seed of scenarios) {
      const result = evaluateSceneDensity(seed);
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// pass condition
// ---------------------------------------------------------------------------

describe("pass condition", () => {
  it("passes when all chapters are in range", () => {
    const seed = makeSeed([2, 3, 5]);
    const result = evaluateSceneDensity(seed);

    expect(result.pass).toBe(true);
  });

  it("fails when even one chapter is out of range", () => {
    const seed = makeSeed([3, 3, 1]); // last chapter has too_few
    const result = evaluateSceneDensity(seed);

    expect(result.pass).toBe(false);
  });

  it("fails when a chapter is too_many", () => {
    const seed = makeSeed([3, 6]); // second chapter too_many
    const result = evaluateSceneDensity(seed);

    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Aggregate stats
// ---------------------------------------------------------------------------

describe("aggregate statistics", () => {
  it("total_chapters equals number of outlines", () => {
    const seed = makeSeed([2, 3, 4]);
    const result = evaluateSceneDensity(seed);

    expect(result.total_chapters).toBe(3);
  });

  it("total_scenes is the sum of all key_points counts", () => {
    const seed = makeSeed([2, 3, 4]);
    const result = evaluateSceneDensity(seed);

    expect(result.total_scenes).toBe(9);
  });

  it("average_scenes_per_chapter is total_scenes / total_chapters", () => {
    const seed = makeSeed([2, 4, 6]);
    const result = evaluateSceneDensity(seed);

    // total = 12, chapters = 3 → avg = 4.0
    expect(result.average_scenes_per_chapter).toBeCloseTo(4.0, 3);
  });

  it("in_range_count reflects correctly with mixed chapters", () => {
    // chapters: 1 (too_few), 2 (in), 3 (in), 7 (too_many)
    const seed = makeSeed([1, 2, 3, 7]);
    const result = evaluateSceneDensity(seed);

    expect(result.in_range_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Issues list
// ---------------------------------------------------------------------------

describe("issues list", () => {
  it("emits no issues when all chapters are in range", () => {
    const seed = makeSeed([2, 3, 4, 5]);
    const result = evaluateSceneDensity(seed);

    expect(result.issues).toHaveLength(0);
  });

  it("emits one issue for a too_few chapter", () => {
    const seed = makeSeed([1]);
    const result = evaluateSceneDensity(seed);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("씬 부족");
    expect(result.issues[0]).toContain("1개");
  });

  it("emits one issue for a too_many chapter", () => {
    const seed = makeSeed([8]);
    const result = evaluateSceneDensity(seed);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("씬 과밀");
    expect(result.issues[0]).toContain("8개");
  });

  it("emits separate issues for too_few and too_many chapters", () => {
    const seed = makeSeed([3, 0, 5, 9]); // ch1 ok, ch2 too_few, ch3 ok, ch4 too_many
    const result = evaluateSceneDensity(seed);

    expect(result.issues).toHaveLength(2);
    const fewIssue = result.issues.find((i) => i.includes("씬 부족"));
    const manyIssue = result.issues.find((i) => i.includes("씬 과밀"));
    expect(fewIssue).toBeDefined();
    expect(manyIssue).toBeDefined();
  });

  it("includes chapter number in the issue text", () => {
    const seed = makeSeed([0, 0, 0], [5, 10, 15]);
    const result = evaluateSceneDensity(seed);

    expect(result.issues.find((i) => i.startsWith("5화"))).toBeDefined();
    expect(result.issues.find((i) => i.startsWith("10화"))).toBeDefined();
    expect(result.issues.find((i) => i.startsWith("15화"))).toBeDefined();
  });

  it("includes MIN and MAX info in issue text", () => {
    const seedFew = makeSeed([0]);
    const seedMany = makeSeed([10]);

    const fewResult = evaluateSceneDensity(seedFew);
    const manyResult = evaluateSceneDensity(seedMany);

    expect(fewResult.issues[0]).toContain(String(MIN_SCENES_PER_CHAPTER));
    expect(manyResult.issues[0]).toContain(String(MAX_SCENES_PER_CHAPTER));
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles empty chapter_outlines gracefully", () => {
    const seed = makeSeed([]);
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.total_chapters).toBe(0);
    expect(result.total_scenes).toBe(0);
    expect(result.in_range_count).toBe(0);
    expect(result.chapter_details).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });

  it("returns average_scenes_per_chapter = 0 for empty outlines", () => {
    const seed = makeSeed([]);
    const result = evaluateSceneDensity(seed);

    expect(result.average_scenes_per_chapter).toBe(0);
  });

  it("handles a single chapter with MIN scenes", () => {
    const seed = makeSeed([MIN_SCENES_PER_CHAPTER]);
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.chapter_details[0].in_range).toBe(true);
  });

  it("handles a single chapter with MAX scenes", () => {
    const seed = makeSeed([MAX_SCENES_PER_CHAPTER]);
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.chapter_details[0].in_range).toBe(true);
  });

  it("handles many chapters all perfectly in range", () => {
    const seed = makeSeed(Array(20).fill(3));
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.in_range_count).toBe(20);
  });

  it("handles many chapters all out of range", () => {
    const seed = makeSeed(Array(10).fill(0));
    const result = evaluateSceneDensity(seed);

    expect(result.overall_score).toBe(0.0);
    expect(result.pass).toBe(false);
  });

  it("chapter with MIN-1=1 scene is flagged too_few (not in range)", () => {
    const count = MIN_SCENES_PER_CHAPTER - 1;
    const seed = makeSeed([count]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].in_range).toBe(false);
    expect(result.chapter_details[0].violation_type).toBe("too_few");
  });

  it("chapter with MAX+1=6 scenes is flagged too_many (not in range)", () => {
    const count = MAX_SCENES_PER_CHAPTER + 1;
    const seed = makeSeed([count]);
    const result = evaluateSceneDensity(seed);

    expect(result.chapter_details[0].in_range).toBe(false);
    expect(result.chapter_details[0].violation_type).toBe("too_many");
  });
});
