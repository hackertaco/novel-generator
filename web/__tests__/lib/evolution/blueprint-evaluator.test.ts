/**
 * Tests for BlueprintEvaluator and EvaluationResult schema.
 *
 * Verifies:
 *  - BlueprintEvaluator class is instantiable
 *  - evaluate() returns an EvaluationResult with the correct shape
 *  - total_score = weighted average of four sub-scores
 *  - pass = true only when all four sub-checks pass
 *  - issues aggregates from all four evaluators
 *  - weight constants are exported and correct
 *  - edge cases: empty seed, fully-passing seed, fully-failing seed
 */

import { describe, it, expect } from "vitest";
import {
  BlueprintEvaluator,
  WEIGHT_PACING_QUALITY,
  WEIGHT_CHARACTER_INTRODUCTION,
  WEIGHT_FORESHADOWING_USAGE,
  WEIGHT_GENRE_ALIGNMENT,
  WEIGHT_SCENE_SPECIFICITY,
} from "@/lib/evolution/blueprint-evaluator";
import type { EvaluationResult } from "@/lib/evolution/blueprint-evaluator";
import type { NovelSeed } from "@/lib/schema/novel";
import type { Character } from "@/lib/schema/character";

// suppress unused-import lint for type-only imports
void (undefined as unknown as EvaluationResult);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal Character satisfying the full Character schema */
function makeChar(
  id: string,
  name: string,
  role: string,
  introduction_chapter: number,
): Character {
  return {
    id,
    name,
    role,
    social_rank: "commoner",
    introduction_chapter,
    voice: {
      tone: "보통",
      speech_patterns: [],
      sample_dialogues: [],
      personality_core: "보통",
    },
    backstory: "",
    arc_summary: "",
    state: {
      level: null,
      location: null,
      status: "normal",
      relationships: {},
      inventory: [],
      secrets_known: [],
    },
  };
}

function makeMinimalSeed(): NovelSeed {
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
    chapter_outlines: [],
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

/**
 * A "well-formed" seed that satisfies all four evaluators.
 *
 *  - pacing_quality        : ch1 key_points ≤1, tension ≤4 for ch1-3
 *  - character_introduction: ch1 ≤2 chars, subsequent ≤1 per chapter
 *  - foreshadowing_usage   : each arc has ≥1 plant + ≥1 reveal
 *  - genre_alignment       : genre keywords present
 */
function makePassingSeed(): NovelSeed {
  const seed = makeMinimalSeed();

  // Genre keywords for 현대 판타지
  seed.world.key_locations = { "헌터 협회": "S급 헌터들의 본거지" };
  seed.logline = "헌터 강현이 S급 게이트에서 각성하고 던전에 도전한다";

  // Characters: 1화에 2명, 2화에 1명 (within limits)
  seed.characters = [
    makeChar("c1", "강현", "protagonist", 1),
    makeChar("c2", "조력자", "supporting", 1),
    makeChar("c3", "라이벌", "antagonist", 2),
  ];

  // Single arc
  seed.arcs = [
    {
      id: "arc_1",
      name: "각성편",
      start_chapter: 1,
      end_chapter: 10,
      summary: "헌터 각성 이야기, 시스템 등급 확인, 협회 등록",
      key_events: ["각성", "등급 확인", "첫 던전"],
      climax_chapter: 9,
    },
  ];

  // Foreshadowing: planted and revealed within arc_1 chapter range (1-10)
  seed.foreshadowing = [
    {
      id: "fs_1",
      name: "수상한 유물",
      description: "주인공이 발견한 수상한 유물",
      importance: "normal",
      planted_at: 2,
      hints_at: [5],
      reveal_at: 8,
      status: "pending",
      hint_count: 0,
    },
  ];

  // Chapter outlines: ch1-3 with tension ≤4
  seed.chapter_outlines = [
    {
      chapter_number: 1,
      title: "1화",
      arc_id: "arc_1",
      one_liner: "강현이 각성한다",
      advances_thread: [],
      key_points: ["각성"],
      characters_involved: ["c1", "c2"],
      tension_level: 2,
    },
    {
      chapter_number: 2,
      title: "2화",
      arc_id: "arc_1",
      one_liner: "등급 확인",
      advances_thread: [],
      key_points: [],
      characters_involved: ["c1"],
      tension_level: 3,
    },
    {
      chapter_number: 3,
      title: "3화",
      arc_id: "arc_1",
      one_liner: "협회 등록",
      advances_thread: [],
      key_points: [],
      characters_involved: ["c1"],
      tension_level: 4,
    },
  ];

  return seed;
}

/**
 * A "poorly-formed" seed that violates all four evaluators.
 *
 *  - pacing_quality        : ch1 has many key_points; ch1-3 tension > 4
 *  - character_introduction: ch1 has 5 characters (> 2); ch2 has 3 (> 1)
 *  - foreshadowing_usage   : arc has no foreshadowing at all
 *  - genre_alignment       : no genre-relevant keywords in content
 */
function makeFailingSeed(): NovelSeed {
  const seed = makeMinimalSeed();

  // No genre keywords in content
  seed.logline = "아무 관련 없는 평범한 이야기";

  // Characters: 1화에 5명 (violates ≤2), 2화에 3명 (violates ≤1)
  seed.characters = [
    makeChar("c1", "A", "protagonist", 1),
    makeChar("c2", "B", "supporting", 1),
    makeChar("c3", "C", "supporting", 1),
    makeChar("c4", "D", "supporting", 1),
    makeChar("c5", "E", "supporting", 1),
    makeChar("c6", "F", "supporting", 2),
    makeChar("c7", "G", "supporting", 2),
    makeChar("c8", "H", "supporting", 2),
  ];

  // Arc with no foreshadowing → foreshadowing_usage fails
  seed.arcs = [
    {
      id: "arc_1",
      name: "실패편",
      start_chapter: 1,
      end_chapter: 10,
      summary: "아무것도 일어나지 않는 이야기",
      key_events: [],
      climax_chapter: 9,
    },
  ];

  seed.foreshadowing = [];

  // Chapter outlines: ch1 with excessive key_points, ch1-3 tension > 4
  seed.chapter_outlines = [
    {
      chapter_number: 1,
      title: "1화",
      arc_id: "arc_1",
      one_liner: "모든 것이 시작된다",
      advances_thread: [],
      key_points: ["사건1", "사건2", "사건3", "사건4"],
      characters_involved: ["c1"],
      tension_level: 8,
    },
    {
      chapter_number: 2,
      title: "2화",
      arc_id: "arc_1",
      one_liner: "긴장이 고조된다",
      advances_thread: [],
      key_points: [],
      characters_involved: [],
      tension_level: 9,
    },
    {
      chapter_number: 3,
      title: "3화",
      arc_id: "arc_1",
      one_liner: "절정에 달한다",
      advances_thread: [],
      key_points: [],
      characters_involved: [],
      tension_level: 10,
    },
  ];

  return seed;
}

// ---------------------------------------------------------------------------
// Weight constants
// ---------------------------------------------------------------------------

describe("weight constants", () => {
  it("WEIGHT_PACING_QUALITY is 0.25", () => {
    expect(WEIGHT_PACING_QUALITY).toBe(0.2);
  });

  it("WEIGHT_CHARACTER_INTRODUCTION is 0.25", () => {
    expect(WEIGHT_CHARACTER_INTRODUCTION).toBe(0.2);
  });

  it("WEIGHT_FORESHADOWING_USAGE is 0.25", () => {
    expect(WEIGHT_FORESHADOWING_USAGE).toBe(0.2);
  });

  it("WEIGHT_GENRE_ALIGNMENT is 0.25", () => {
    expect(WEIGHT_GENRE_ALIGNMENT).toBe(0.2);
  });

  it("WEIGHT_SCENE_SPECIFICITY is 0.2", () => {
    expect(WEIGHT_SCENE_SPECIFICITY).toBe(0.2);
  });

  it("weights sum to 1.0", () => {
    const sum =
      WEIGHT_PACING_QUALITY +
      WEIGHT_CHARACTER_INTRODUCTION +
      WEIGHT_FORESHADOWING_USAGE +
      WEIGHT_GENRE_ALIGNMENT +
      WEIGHT_SCENE_SPECIFICITY;
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// BlueprintEvaluator class
// ---------------------------------------------------------------------------

describe("BlueprintEvaluator class", () => {
  it("can be instantiated without arguments", () => {
    const evaluator = new BlueprintEvaluator();
    expect(evaluator).toBeInstanceOf(BlueprintEvaluator);
  });

  it("has an evaluate() method", () => {
    const evaluator = new BlueprintEvaluator();
    expect(typeof evaluator.evaluate).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// EvaluationResult shape
// ---------------------------------------------------------------------------

describe("EvaluationResult shape", () => {
  it("returns total_score (number, 0-1)", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    expect(typeof result.total_score).toBe("number");
    expect(result.total_score).toBeGreaterThanOrEqual(0);
    expect(result.total_score).toBeLessThanOrEqual(1);
  });

  it("returns pass (boolean)", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    expect(typeof result.pass).toBe("boolean");
  });

  it("returns pacing_quality sub-result with expected fields", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    expect(result.pacing_quality).toBeDefined();
    expect(typeof result.pacing_quality.overall_score).toBe("number");
    expect(result.pacing_quality.ch1_key_points).toBeDefined();
    expect(result.pacing_quality.early_tension).toBeDefined();
    expect(typeof result.pacing_quality.pass).toBe("boolean");
  });

  it("returns character_introduction sub-result with expected fields", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    expect(result.character_introduction).toBeDefined();
    expect(typeof result.character_introduction.overall_score).toBe("number");
    expect(result.character_introduction.ep1_character_count).toBeDefined();
    expect(result.character_introduction.new_per_chapter).toBeDefined();
  });

  it("returns foreshadowing_usage sub-result with expected fields", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    expect(result.foreshadowing_usage).toBeDefined();
    expect(typeof result.foreshadowing_usage.overall_score).toBe("number");
    expect(result.foreshadowing_usage.plant_coverage).toBeDefined();
    expect(result.foreshadowing_usage.reveal_coverage).toBeDefined();
    expect(typeof result.foreshadowing_usage.pass).toBe("boolean");
  });

  it("returns genre_alignment sub-result with expected fields", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    expect(result.genre_alignment).toBeDefined();
    expect(typeof result.genre_alignment.overall_score).toBe("number");
    expect(result.genre_alignment.keyword_coverage).toBeDefined();
    expect(result.genre_alignment.genre_purity).toBeDefined();
    expect(typeof result.genre_alignment.pass).toBe("boolean");
  });

  it("returns issues as an array of strings", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    expect(Array.isArray(result.issues)).toBe(true);
    for (const issue of result.issues) {
      expect(typeof issue).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// total_score calculation
// ---------------------------------------------------------------------------

describe("total_score calculation", () => {
  it("equals weighted sum of the five sub-scores", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    const result = evaluator.evaluate(seed);

    const expectedScore =
      result.pacing_quality.overall_score * WEIGHT_PACING_QUALITY +
      result.character_introduction.overall_score * WEIGHT_CHARACTER_INTRODUCTION +
      result.foreshadowing_usage.overall_score * WEIGHT_FORESHADOWING_USAGE +
      result.genre_alignment.overall_score * WEIGHT_GENRE_ALIGNMENT +
      result.scene_specificity.overall_score * WEIGHT_SCENE_SPECIFICITY;

    expect(result.total_score).toBeCloseTo(expectedScore, 3);
  });

  it("is rounded to 3 decimal places", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeMinimalSeed());
    const rounded = Math.round(result.total_score * 1000) / 1000;
    expect(result.total_score).toBe(rounded);
  });

  it("is higher for a passing seed than for a failing seed", () => {
    const evaluator = new BlueprintEvaluator();
    const passingResult = evaluator.evaluate(makePassingSeed());
    const failingResult = evaluator.evaluate(makeFailingSeed());
    expect(passingResult.total_score).toBeGreaterThan(failingResult.total_score);
  });

  it("is within [0, 1] for all seed types", () => {
    const evaluator = new BlueprintEvaluator();
    const seeds = [makeMinimalSeed(), makePassingSeed(), makeFailingSeed()];
    for (const seed of seeds) {
      const result = evaluator.evaluate(seed);
      expect(result.total_score).toBeGreaterThanOrEqual(0);
      expect(result.total_score).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// pass flag
// ---------------------------------------------------------------------------

describe("pass flag", () => {
  it("is false when pacing_quality fails (ch1 key_points > 1)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.chapter_outlines = [
      {
        chapter_number: 1,
        title: "1화",
        arc_id: "arc_1",
        one_liner: "시작",
        advances_thread: [],
        key_points: ["p1", "p2", "p3"],
        characters_involved: [],
        tension_level: 3,
      },
    ];
    const result = evaluator.evaluate(seed);
    expect(result.pacing_quality.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("is false when pacing_quality fails (early tension > 4)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.chapter_outlines = [
      {
        chapter_number: 1,
        title: "1화",
        arc_id: "arc_1",
        one_liner: "시작",
        advances_thread: [],
        key_points: [],
        characters_involved: [],
        tension_level: 9,
      },
    ];
    const result = evaluator.evaluate(seed);
    expect(result.pacing_quality.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("is false when character_introduction fails (ep1 > 2 characters)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.characters = [
      makeChar("c1", "A", "protagonist", 1),
      makeChar("c2", "B", "supporting", 1),
      makeChar("c3", "C", "supporting", 1),
    ];
    const result = evaluator.evaluate(seed);
    expect(result.character_introduction.ep1_character_count.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("is false when character_introduction fails (> 1 new char per chapter)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.characters = [
      makeChar("c1", "A", "protagonist", 1),
      makeChar("c2", "B", "supporting", 2),
      makeChar("c3", "C", "supporting", 2),
    ];
    const result = evaluator.evaluate(seed);
    expect(result.character_introduction.new_per_chapter.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("is false when foreshadowing_usage fails (arc missing plant/reveal)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.arcs = [
      {
        id: "arc_1",
        name: "아크1",
        start_chapter: 1,
        end_chapter: 10,
        summary: "...",
        key_events: [],
        climax_chapter: 9,
      },
    ];
    seed.foreshadowing = [];
    const result = evaluator.evaluate(seed);
    expect(result.foreshadowing_usage.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("is false for the failing seed (all four sub-checks fail)", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeFailingSeed());
    expect(result.pass).toBe(false);
  });

  it("pacing_quality pass is true for minimal seed (no outlines = neutral)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    const result = evaluator.evaluate(seed);
    expect(result.pacing_quality.pass).toBe(true);
  });

  it("character_introduction pass is true for minimal seed (no characters)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    const result = evaluator.evaluate(seed);
    expect(result.character_introduction.ep1_character_count.pass).toBe(true);
    expect(result.character_introduction.new_per_chapter.pass).toBe(true);
  });

  it("foreshadowing_usage pass is true for minimal seed (no arcs = neutral)", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    const result = evaluator.evaluate(seed);
    expect(result.foreshadowing_usage.pass).toBe(true);
  });

  it("is false when a second arc has no foreshadowing coverage", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makePassingSeed();
    // Add a second arc outside the foreshadowing range
    seed.arcs.push({
      id: "arc_2",
      name: "2아크",
      start_chapter: 11,
      end_chapter: 20,
      summary: "두번째 아크",
      key_events: [],
      climax_chapter: 19,
    });
    // foreshadowing only covers arc_1 (ch1-10)
    const result = evaluator.evaluate(seed);
    expect(result.foreshadowing_usage.pass).toBe(false);
    expect(result.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// issues aggregation
// ---------------------------------------------------------------------------

describe("issues aggregation", () => {
  it("includes pacing issue when ch1 key_points are excessive", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.chapter_outlines = [
      {
        chapter_number: 1,
        title: "1화",
        arc_id: "arc_1",
        one_liner: "시작",
        advances_thread: [],
        key_points: ["p1", "p2", "p3"],
        characters_involved: [],
        tension_level: 3,
      },
    ];
    const result = evaluator.evaluate(seed);
    const pacingIssue = result.issues.find((i) => i.includes("key_points"));
    expect(pacingIssue).toBeDefined();
  });

  it("includes character issue when ep1 has too many characters", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.characters = [
      makeChar("c1", "A", "protagonist", 1),
      makeChar("c2", "B", "supporting", 1),
      makeChar("c3", "C", "supporting", 1),
    ];
    const result = evaluator.evaluate(seed);
    const charIssue = result.issues.find(
      (i) => i.includes("캐릭터") && i.includes("1화"),
    );
    expect(charIssue).toBeDefined();
  });

  it("includes per-chapter character issue when > 1 new char in a chapter", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.characters = [
      makeChar("c1", "A", "protagonist", 2),
      makeChar("c2", "B", "supporting", 2),
    ];
    const result = evaluator.evaluate(seed);
    const charIssue = result.issues.find(
      (i) => i.includes("캐릭터 등장 과밀"),
    );
    expect(charIssue).toBeDefined();
  });

  it("includes foreshadowing issue when arc has no plant", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.arcs = [
      {
        id: "arc_1",
        name: "아크1",
        start_chapter: 1,
        end_chapter: 10,
        summary: "...",
        key_events: [],
        climax_chapter: 9,
      },
    ];
    seed.foreshadowing = [];
    const result = evaluator.evaluate(seed);
    const fsIssue = result.issues.find((i) => i.includes("복선"));
    expect(fsIssue).toBeDefined();
  });

  it("aggregates issues from multiple failing evaluators", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeFailingSeed());
    // Failing seed violates pacing, character density, and foreshadowing
    expect(result.issues.length).toBeGreaterThan(1);
  });

  it("all issue strings are non-empty", () => {
    const evaluator = new BlueprintEvaluator();
    const result = evaluator.evaluate(makeFailingSeed());
    for (const issue of result.issues) {
      expect(issue.trim().length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles completely empty seed without throwing", () => {
    const evaluator = new BlueprintEvaluator();
    expect(() => evaluator.evaluate(makeMinimalSeed())).not.toThrow();
  });

  it("handles seed with null magic_system without throwing", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makeMinimalSeed();
    seed.world.magic_system = null;
    expect(() => evaluator.evaluate(seed)).not.toThrow();
  });

  it("is deterministic: same seed always produces identical results", () => {
    const evaluator = new BlueprintEvaluator();
    const seed = makePassingSeed();
    const r1 = evaluator.evaluate(seed);
    const r2 = evaluator.evaluate(seed);
    expect(r1.total_score).toBe(r2.total_score);
    expect(r1.pass).toBe(r2.pass);
    expect(r1.issues).toEqual(r2.issues);
  });

  it("two separate evaluator instances produce identical results", () => {
    const e1 = new BlueprintEvaluator();
    const e2 = new BlueprintEvaluator();
    const seed = makePassingSeed();
    expect(e1.evaluate(seed).total_score).toBe(e2.evaluate(seed).total_score);
  });

  it("total_score is within [0, 1] for any well-formed seed", () => {
    const evaluator = new BlueprintEvaluator();
    const seeds = [makeMinimalSeed(), makePassingSeed(), makeFailingSeed()];
    for (const seed of seeds) {
      const result = evaluator.evaluate(seed);
      expect(result.total_score).toBeGreaterThanOrEqual(0);
      expect(result.total_score).toBeLessThanOrEqual(1);
    }
  });
});
