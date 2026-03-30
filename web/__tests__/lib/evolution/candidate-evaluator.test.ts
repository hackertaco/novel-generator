import { describe, it, expect } from "vitest";
import {
  evaluateCandidate,
  EVALUATOR_WEIGHTS,
  EVALUATOR_WEIGHT,
} from "@/lib/evolution/candidate-evaluator";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeMinimalSeed = (): NovelSeed => ({
  title: "테스트 소설",
  logline: "테스트 로그라인",
  total_chapters: 100,
  world: {
    name: "테스트 세계",
    genre: "회귀",
    sub_genre: "회귀",
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
});

// ---------------------------------------------------------------------------
// EVALUATOR_WEIGHTS constants
// ---------------------------------------------------------------------------

describe("EVALUATOR_WEIGHTS", () => {
  it("exports EVALUATOR_WEIGHT as 0.2", () => {
    expect(EVALUATOR_WEIGHT).toBe(0.2);
  });

  it("all five weights sum to 1.0", () => {
    const sum =
      EVALUATOR_WEIGHTS.pacing_quality +
      EVALUATOR_WEIGHTS.character_introduction +
      EVALUATOR_WEIGHTS.foreshadowing_usage +
      EVALUATOR_WEIGHTS.genre_alignment +
      EVALUATOR_WEIGHTS.archetype_diversity;
    expect(sum).toBeCloseTo(1.0);
  });

  it("each weight is 0.2", () => {
    expect(EVALUATOR_WEIGHTS.pacing_quality).toBe(0.2);
    expect(EVALUATOR_WEIGHTS.character_introduction).toBe(0.2);
    expect(EVALUATOR_WEIGHTS.foreshadowing_usage).toBe(0.2);
    expect(EVALUATOR_WEIGHTS.genre_alignment).toBe(0.2);
    expect(EVALUATOR_WEIGHTS.archetype_diversity).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// evaluateCandidate
// ---------------------------------------------------------------------------

describe("evaluateCandidate", () => {
  it("returns all four dimension scores", () => {
    const seed = makeMinimalSeed();
    const result = evaluateCandidate(seed);
    expect(typeof result.pacing_quality).toBe("number");
    expect(typeof result.character_introduction).toBe("number");
    expect(typeof result.foreshadowing_usage).toBe("number");
    expect(typeof result.genre_alignment).toBe("number");
  });

  it("returns an overall_score field", () => {
    const seed = makeMinimalSeed();
    const result = evaluateCandidate(seed);
    expect(typeof result.overall_score).toBe("number");
  });

  it("overall_score is in range [0, 1]", () => {
    const seed = makeMinimalSeed();
    const result = evaluateCandidate(seed);
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(1);
  });

  it("returns an issues array", () => {
    const seed = makeMinimalSeed();
    const result = evaluateCandidate(seed);
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it("empty seed with no arcs/chapters passes foreshadowing and pacing checks (neutral)", () => {
    const seed = makeMinimalSeed();
    const result = evaluateCandidate(seed);
    // No arcs → foreshadowing neutral (1.0)
    expect(result.foreshadowing_usage).toBe(1.0);
    // No chapter_outlines → pacing neutral (1.0)
    expect(result.pacing_quality).toBe(1.0);
    // No characters → character density perfect (1.0)
    expect(result.character_introduction).toBe(1.0);
  });

  it("overall_score equals weighted sum of sub-scores", () => {
    const seed = makeMinimalSeed();
    const result = evaluateCandidate(seed);
    const expected =
      result.pacing_quality * 0.2 +
      result.character_introduction * 0.2 +
      result.foreshadowing_usage * 0.2 +
      result.genre_alignment * 0.2 +
      result.archetype_diversity * 0.2;
    expect(result.overall_score).toBeCloseTo(expected, 3);
  });

  it("collects pacing issues when chapter 1 has too many key_points", () => {
    const seed = makeMinimalSeed();
    seed.chapter_outlines = [
      {
        chapter_number: 1,
        title: "1화",
        arc_id: "arc_1",
        one_liner: "시작",
        advances_thread: [],
        key_points: ["포인트1", "포인트2", "포인트3"],
        characters_involved: [],
        tension_level: 3,
      },
    ];
    const result = evaluateCandidate(seed);
    expect(result.issues.some((i) => i.includes("key_points"))).toBe(true);
  });

  it("collects pacing issues when early chapters have high tension", () => {
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
        tension_level: 8, // above EARLY_CHAPTER_MAX_TENSION=4
      },
    ];
    const result = evaluateCandidate(seed);
    expect(result.issues.some((i) => i.includes("tension"))).toBe(true);
  });

  it("collects foreshadowing issues when arcs lack planted foreshadowing", () => {
    const seed = makeMinimalSeed();
    seed.arcs = [
      {
        id: "arc_1",
        name: "1부",
        start_chapter: 1,
        end_chapter: 10,
        summary: "아크 요약",
        key_events: [],
        climax_chapter: 9,
      },
    ];
    // No foreshadowing planted in arc 1
    seed.foreshadowing = [];
    const result = evaluateCandidate(seed);
    expect(
      result.issues.some((i) => i.includes("plant") || i.includes("복선 심기")),
    ).toBe(true);
  });

  it("produces deterministic results for the same input", () => {
    const seed = makeMinimalSeed();
    const result1 = evaluateCandidate(seed);
    const result2 = evaluateCandidate(seed);
    expect(result1.overall_score).toBe(result2.overall_score);
  });

  it("a seed with violations scores lower than a perfect seed", () => {
    const perfectSeed = makeMinimalSeed();
    const violatingSeed = makeMinimalSeed();
    violatingSeed.chapter_outlines = [
      {
        chapter_number: 1,
        title: "1화",
        arc_id: "arc_1",
        one_liner: "시작",
        advances_thread: [],
        key_points: ["A", "B", "C", "D", "E"], // many violations
        characters_involved: [],
        tension_level: 9, // high tension violation
      },
    ];
    const perfectResult = evaluateCandidate(perfectSeed);
    const violatingResult = evaluateCandidate(violatingSeed);
    expect(perfectResult.overall_score).toBeGreaterThan(
      violatingResult.overall_score,
    );
  });
});
