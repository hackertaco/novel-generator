/**
 * Tests for the pacing quality evaluator (arc evolution loop).
 *
 * Verifies:
 *  - 1화 key_points ≤ 1  →  ch1_key_points sub-score
 *  - 1~3화 tension ≤ 4   →  early_tension sub-score
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePacingQuality,
  CH1_MAX_KEY_POINTS,
  EARLY_CHAPTER_MAX_TENSION,
  EARLY_CHAPTER_RANGE,
} from "@/lib/evolution/evaluators/pacing-quality";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeed(chapterOverrides: Partial<{
  chapter_number: number;
  key_points: string[];
  tension_level: number;
}>[]): NovelSeed {
  return {
    title: "테스트 소설",
    logline: "테스트용 로그라인",
    total_chapters: 100,
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
    chapter_outlines: chapterOverrides.map((o) => ({
      chapter_number: o.chapter_number ?? 1,
      title: `${o.chapter_number ?? 1}화`,
      arc_id: "arc_1",
      one_liner: "테스트",
      advances_thread: [],
      key_points: o.key_points ?? [],
      characters_involved: [],
      tension_level: o.tension_level ?? 3,
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
  it("CH1_MAX_KEY_POINTS is 1", () => {
    expect(CH1_MAX_KEY_POINTS).toBe(1);
  });

  it("EARLY_CHAPTER_MAX_TENSION is 4", () => {
    expect(EARLY_CHAPTER_MAX_TENSION).toBe(4);
  });

  it("EARLY_CHAPTER_RANGE is 3", () => {
    expect(EARLY_CHAPTER_RANGE).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ch1_key_points sub-score
// ---------------------------------------------------------------------------

describe("ch1_key_points check", () => {
  it("passes when chapter 1 has 0 key_points", () => {
    const seed = makeSeed([{ chapter_number: 1, key_points: [] }]);
    const result = evaluatePacingQuality(seed);
    expect(result.ch1_key_points.pass).toBe(true);
    expect(result.ch1_key_points.score).toBe(1.0);
    expect(result.ch1_key_points.count).toBe(0);
  });

  it("passes when chapter 1 has exactly 1 key_point", () => {
    const seed = makeSeed([{ chapter_number: 1, key_points: ["주인공 등장"] }]);
    const result = evaluatePacingQuality(seed);
    expect(result.ch1_key_points.pass).toBe(true);
    expect(result.ch1_key_points.score).toBe(1.0);
    expect(result.ch1_key_points.count).toBe(1);
  });

  it("fails when chapter 1 has 2 key_points", () => {
    const seed = makeSeed([
      { chapter_number: 1, key_points: ["주인공 등장", "세계관 설명"] },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.ch1_key_points.pass).toBe(false);
    expect(result.ch1_key_points.count).toBe(2);
    expect(result.ch1_key_points.score).toBeLessThan(1.0);
  });

  it("fails when chapter 1 has 3 key_points and score decreases further", () => {
    const seed = makeSeed([
      {
        chapter_number: 1,
        key_points: ["주인공 등장", "세계관 설명", "사건 발생"],
      },
    ]);
    const result2 = evaluatePacingQuality(
      makeSeed([{ chapter_number: 1, key_points: ["a", "b"] }]),
    );
    const result3 = evaluatePacingQuality(seed);
    expect(result3.ch1_key_points.score).toBeLessThan(result2.ch1_key_points.score);
  });

  it("score is floored at 0.1 for extremely many key_points", () => {
    const manyPoints = Array.from({ length: 20 }, (_, i) => `key_${i}`);
    const seed = makeSeed([{ chapter_number: 1, key_points: manyPoints }]);
    const result = evaluatePacingQuality(seed);
    expect(result.ch1_key_points.score).toBeGreaterThanOrEqual(0.1);
  });

  it("passes (neutral) when chapter 1 is missing from outlines", () => {
    const seed = makeSeed([{ chapter_number: 4, key_points: [], tension_level: 3 }]);
    const result = evaluatePacingQuality(seed);
    expect(result.ch1_key_points.pass).toBe(true);
    expect(result.ch1_key_points.score).toBe(1.0);
    expect(result.ch1_key_points.count).toBe(0);
  });

  it("records violation issue text when chapter 1 exceeds limit", () => {
    const seed = makeSeed([{ chapter_number: 1, key_points: ["a", "b", "c"] }]);
    const result = evaluatePacingQuality(seed);
    const issue = result.issues.find((i) => i.includes("1화 key_points"));
    expect(issue).toBeDefined();
    expect(issue).toContain("3개");
  });
});

// ---------------------------------------------------------------------------
// early_tension sub-score
// ---------------------------------------------------------------------------

describe("early_tension check", () => {
  it("passes when all chapters 1-3 have tension ≤ 4", () => {
    const seed = makeSeed([
      { chapter_number: 1, tension_level: 2 },
      { chapter_number: 2, tension_level: 3 },
      { chapter_number: 3, tension_level: 4 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.early_tension.pass).toBe(true);
    expect(result.early_tension.score).toBe(1.0);
    expect(result.early_tension.violations).toHaveLength(0);
  });

  it("passes when tension is exactly 4", () => {
    const seed = makeSeed([{ chapter_number: 1, tension_level: 4 }]);
    const result = evaluatePacingQuality(seed);
    expect(result.early_tension.pass).toBe(true);
  });

  it("fails when chapter 1 has tension > 4", () => {
    const seed = makeSeed([{ chapter_number: 1, tension_level: 5 }]);
    const result = evaluatePacingQuality(seed);
    expect(result.early_tension.pass).toBe(false);
    expect(result.early_tension.violations).toHaveLength(1);
    expect(result.early_tension.violations[0].chapter_number).toBe(1);
    expect(result.early_tension.violations[0].tension_level).toBe(5);
  });

  it("fails when chapter 2 has tension = 7", () => {
    const seed = makeSeed([
      { chapter_number: 1, tension_level: 3 },
      { chapter_number: 2, tension_level: 7 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.early_tension.pass).toBe(false);
    expect(result.early_tension.violations[0].chapter_number).toBe(2);
  });

  it("fails when chapter 3 has tension > 4", () => {
    const seed = makeSeed([{ chapter_number: 3, tension_level: 6 }]);
    const result = evaluatePacingQuality(seed);
    expect(result.early_tension.pass).toBe(false);
  });

  it("chapter 4+ does NOT affect early_tension check", () => {
    const seed = makeSeed([
      { chapter_number: 4, tension_level: 9 },
      { chapter_number: 5, tension_level: 10 },
    ]);
    const result = evaluatePacingQuality(seed);
    // No early chapters in outlines → neutral pass
    expect(result.early_tension.pass).toBe(true);
    expect(result.early_tension.checked_chapters).toHaveLength(0);
  });

  it("score decreases proportionally with more violations", () => {
    const allPass = makeSeed([
      { chapter_number: 1, tension_level: 2 },
      { chapter_number: 2, tension_level: 3 },
      { chapter_number: 3, tension_level: 4 },
    ]);
    const oneViolation = makeSeed([
      { chapter_number: 1, tension_level: 5 },
      { chapter_number: 2, tension_level: 3 },
      { chapter_number: 3, tension_level: 4 },
    ]);
    const allViolations = makeSeed([
      { chapter_number: 1, tension_level: 8 },
      { chapter_number: 2, tension_level: 7 },
      { chapter_number: 3, tension_level: 6 },
    ]);

    const rAll = evaluatePacingQuality(allPass);
    const rOne = evaluatePacingQuality(oneViolation);
    const rNone = evaluatePacingQuality(allViolations);

    expect(rAll.early_tension.score).toBeGreaterThan(rOne.early_tension.score);
    expect(rOne.early_tension.score).toBeGreaterThan(rNone.early_tension.score);
    expect(rNone.early_tension.score).toBe(0);
  });

  it("lists all violated chapters in issues", () => {
    const seed = makeSeed([
      { chapter_number: 1, tension_level: 5 },
      { chapter_number: 2, tension_level: 6 },
      { chapter_number: 3, tension_level: 3 },
    ]);
    const result = evaluatePacingQuality(seed);
    const tensionIssues = result.issues.filter((i) => i.includes("tension"));
    expect(tensionIssues.length).toBe(2);
  });

  it("records checked_chapters correctly", () => {
    const seed = makeSeed([
      { chapter_number: 1, tension_level: 2 },
      { chapter_number: 3, tension_level: 4 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.early_tension.checked_chapters).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// Overall score calculation
// ---------------------------------------------------------------------------

describe("overall_score", () => {
  it("is 1.0 when both sub-checks pass perfectly", () => {
    const seed = makeSeed([
      { chapter_number: 1, key_points: ["주인공 등장"], tension_level: 2 },
      { chapter_number: 2, tension_level: 3 },
      { chapter_number: 3, tension_level: 4 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("is less than 1.0 when ch1 has too many key_points", () => {
    const seed = makeSeed([
      { chapter_number: 1, key_points: ["a", "b", "c"], tension_level: 3 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.overall_score).toBeLessThan(1.0);
    expect(result.pass).toBe(false);
  });

  it("is less than 1.0 when early tension is too high", () => {
    const seed = makeSeed([
      { chapter_number: 1, key_points: [], tension_level: 8 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.overall_score).toBeLessThan(1.0);
    expect(result.pass).toBe(false);
  });

  it("overall_score is weighted 40% ch1_kp + 60% early_tension", () => {
    // ch1_key_points score = 0.7  (2 key_points → 1 - 0.3 = 0.7)
    // early_tension score = 0.0   (all 3 early chapters over limit)
    const seed = makeSeed([
      { chapter_number: 1, key_points: ["a", "b"], tension_level: 9 },
      { chapter_number: 2, tension_level: 8 },
      { chapter_number: 3, tension_level: 7 },
    ]);
    const result = evaluatePacingQuality(seed);
    // ch1_key_points=0.7, early_tension=0.0, action_repeat=1.0 (no repeat)
    const expected = 0.7 * 0.3 + 0.0 * 0.4 + 1.0 * 0.3; // = 0.51
    expect(result.overall_score).toBeCloseTo(expected, 2);
  });

  it("returns 0.0 overall when both sub-checks fully fail", () => {
    const manyPoints = ["a", "b", "c", "d", "e", "f", "g"];
    const seed = makeSeed([
      { chapter_number: 1, key_points: manyPoints, tension_level: 10 },
      { chapter_number: 2, tension_level: 10 },
      { chapter_number: 3, tension_level: 10 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.overall_score).toBeLessThan(0.5);
    expect(result.pass).toBe(false);
  });

  it("overall_score is within [0, 1]", () => {
    const seeds = [
      makeSeed([]),
      makeSeed([{ chapter_number: 1, key_points: [], tension_level: 1 }]),
      makeSeed([{ chapter_number: 1, key_points: ["a", "b", "c", "d"], tension_level: 10 }]),
    ];
    for (const seed of seeds) {
      const result = evaluatePacingQuality(seed);
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles empty chapter_outlines gracefully", () => {
    const seed = makeSeed([]);
    const result = evaluatePacingQuality(seed);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("ignores chapters outside 1-3 for tension check", () => {
    const seed = makeSeed([
      { chapter_number: 1, key_points: [], tension_level: 3 },
      { chapter_number: 4, tension_level: 10 },
      { chapter_number: 10, tension_level: 10 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.early_tension.pass).toBe(true);
  });

  it("handles outlines with only chapter 2 and 3 (no chapter 1)", () => {
    const seed = makeSeed([
      { chapter_number: 2, tension_level: 3 },
      { chapter_number: 3, tension_level: 4 },
    ]);
    const result = evaluatePacingQuality(seed);
    expect(result.ch1_key_points.pass).toBe(true); // no ch1 = neutral
    expect(result.early_tension.pass).toBe(true);
    expect(result.overall_score).toBe(1.0);
  });
});
