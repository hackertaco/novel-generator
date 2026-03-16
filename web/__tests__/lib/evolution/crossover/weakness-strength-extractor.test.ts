/**
 * Tests for the WeaknessStrengthExtractor (arc evolution crossover step).
 *
 * Verifies:
 *  - Constants: WEAKNESS_THRESHOLD, STRENGTH_THRESHOLD, ALL_DIMENSIONS
 *  - Weakness extraction: 1st-place dimensions with score < WEAKNESS_THRESHOLD
 *  - Strength extraction: 2nd-place dimensions with score >= STRENGTH_THRESHOLD
 *  - Threshold boundary conditions (exact boundary values)
 *  - Sorting: weaknesses ascending, strengths descending
 *  - Issue propagation per dimension (including character_introduction derivation)
 *  - Empty arrays when no weaknesses / no strengths
 *  - Multiple weaknesses and strengths at once
 */

import { describe, it, expect } from "vitest";
import {
  extractWeaknessesAndStrengths,
  WEAKNESS_THRESHOLD,
  STRENGTH_THRESHOLD,
  ALL_DIMENSIONS,
  type EvalDimension,
  type WeaknessStrengthResult,
} from "@/lib/evolution/crossover/weakness-strength-extractor";
import type { EvaluationResult } from "@/lib/evolution/blueprint-evaluator";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal EvaluationResult with controllable per-dimension scores.
 * Issues are populated only when a dimension has a non-perfect score.
 */
function makeEvalResult(scores: {
  pacing_quality?: number;
  character_introduction?: number;
  foreshadowing_usage?: number;
  genre_alignment?: number;
}): EvaluationResult {
  const pq = scores.pacing_quality ?? 1.0;
  const ci = scores.character_introduction ?? 1.0;
  const fu = scores.foreshadowing_usage ?? 1.0;
  const ga = scores.genre_alignment ?? 1.0;

  const totalScore = (pq + ci + fu + ga) / 4;

  return {
    total_score: Math.round(totalScore * 1000) / 1000,
    pass: pq >= 1.0 && ci >= 1.0 && fu >= 1.0 && ga >= 1.0,

    pacing_quality: {
      overall_score: pq,
      pass: pq >= 1.0,
      ch1_key_points: { count: 0, max_allowed: 1, score: pq, pass: pq >= 1.0 },
      early_tension: {
        checked_chapters: [],
        violations: [],
        score: pq,
        pass: pq >= 1.0,
      },
      issues: pq < 1.0 ? [`페이싱 문제: score=${pq}`] : [],
    },

    character_introduction: {
      overall_score: ci,
      ep1_character_count: {
        count: ci < 1.0 ? 3 : 1,
        limit: 2,
        score: ci < 1.0 ? 0.7 : 1.0,
        pass: ci >= 1.0,
      },
      new_per_chapter: {
        violations:
          ci < 0.7
            ? [{ chapter: 3, new_count: 2, limit: 1 }]
            : [],
        total_chapters_checked: 2,
        score: ci < 0.7 ? 0.5 : 1.0,
        pass: ci >= 1.0,
      },
    },

    foreshadowing_usage: {
      overall_score: fu,
      pass: fu >= 1.0,
      plant_coverage: {
        covered_arcs: [],
        missing_arcs: fu < 1.0 ? ["arc_1"] : [],
        score: fu,
        pass: fu >= 1.0,
      },
      reveal_coverage: {
        covered_arcs: [],
        missing_arcs: [],
        score: 1.0,
        pass: true,
      },
      arc_details: [],
      issues: fu < 1.0 ? [`복선 문제: score=${fu}`] : [],
    },

    genre_alignment: {
      overall_score: ga,
      pass: ga >= 1.0,
      keyword_coverage: {
        detected_genre: "현대 판타지",
        total_required: 10,
        matched: Math.round(ga * 10),
        matched_keywords: [],
        score: ga,
        pass: ga >= 0.3,
      },
      genre_purity: {
        found_forbidden: [],
        score: 1.0,
        pass: true,
      },
      issues: ga < 1.0 ? [`장르 문제: score=${ga}`] : [],
    },

    issues: [
      ...(pq < 1.0 ? [`페이싱 문제: score=${pq}`] : []),
      ...(fu < 1.0 ? [`복선 문제: score=${fu}`] : []),
      ...(ga < 1.0 ? [`장르 문제: score=${ga}`] : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("WEAKNESS_THRESHOLD is 0.6", () => {
    expect(WEAKNESS_THRESHOLD).toBe(0.6);
  });

  it("STRENGTH_THRESHOLD is 0.7", () => {
    expect(STRENGTH_THRESHOLD).toBe(0.7);
  });

  it("ALL_DIMENSIONS contains exactly the four evaluation dimensions", () => {
    const expected: EvalDimension[] = [
      "pacing_quality",
      "character_introduction",
      "foreshadowing_usage",
      "genre_alignment",
    ];
    expect([...ALL_DIMENSIONS]).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Weakness extraction (1st-place candidate)
// ---------------------------------------------------------------------------

describe("weakness extraction", () => {
  it("returns empty weaknesses when all 1st-place scores are above threshold", () => {
    const first = makeEvalResult({
      pacing_quality: 0.8,
      character_introduction: 0.9,
      foreshadowing_usage: 0.7,
      genre_alignment: 1.0,
    });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    expect(weaknesses).toHaveLength(0);
  });

  it("identifies a single weak dimension", () => {
    const first = makeEvalResult({ pacing_quality: 0.4 });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    expect(weaknesses).toHaveLength(1);
    expect(weaknesses[0].dimension).toBe("pacing_quality");
    expect(weaknesses[0].score).toBe(0.4);
  });

  it("identifies multiple weak dimensions", () => {
    const first = makeEvalResult({
      pacing_quality: 0.3,
      character_introduction: 0.5,
      foreshadowing_usage: 0.9, // not weak
      genre_alignment: 0.1,
    });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    const dims = weaknesses.map((w) => w.dimension);
    expect(dims).toContain("pacing_quality");
    expect(dims).toContain("character_introduction");
    expect(dims).toContain("genre_alignment");
    expect(dims).not.toContain("foreshadowing_usage");
    expect(weaknesses).toHaveLength(3);
  });

  it("treats exact WEAKNESS_THRESHOLD (0.6) as NOT a weakness", () => {
    const first = makeEvalResult({ pacing_quality: WEAKNESS_THRESHOLD });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    expect(weaknesses.map((w) => w.dimension)).not.toContain("pacing_quality");
  });

  it("treats score just below WEAKNESS_THRESHOLD as a weakness", () => {
    const first = makeEvalResult({ pacing_quality: WEAKNESS_THRESHOLD - 0.001 });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    expect(weaknesses.map((w) => w.dimension)).toContain("pacing_quality");
  });

  it("sorts weaknesses ascending by score (worst first)", () => {
    const first = makeEvalResult({
      pacing_quality: 0.5,
      character_introduction: 0.2,
      foreshadowing_usage: 0.1,
      genre_alignment: 0.4,
    });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    const scores = weaknesses.map((w) => w.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it("includes dimension-specific issues in weaknesses (pacing_quality)", () => {
    const first = makeEvalResult({ pacing_quality: 0.4 });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    const pqWeakness = weaknesses.find((w) => w.dimension === "pacing_quality");
    expect(pqWeakness).toBeDefined();
    expect(pqWeakness!.issues.length).toBeGreaterThan(0);
    expect(pqWeakness!.issues[0]).toContain("페이싱 문제");
  });

  it("derives issues for character_introduction from violation arrays", () => {
    // ci score < 0.7 triggers a new_per_chapter violation in makeEvalResult
    const first = makeEvalResult({ character_introduction: 0.5 });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    const ciWeakness = weaknesses.find(
      (w) => w.dimension === "character_introduction",
    );
    expect(ciWeakness).toBeDefined();
    // Should have derived issues from violations
    expect(ciWeakness!.issues.length).toBeGreaterThan(0);
    expect(ciWeakness!.issues.some((s) => s.includes("캐릭터"))).toBe(true);
  });

  it("includes issues for foreshadowing_usage weakness", () => {
    const first = makeEvalResult({ foreshadowing_usage: 0.3 });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    const fuWeakness = weaknesses.find(
      (w) => w.dimension === "foreshadowing_usage",
    );
    expect(fuWeakness).toBeDefined();
    expect(fuWeakness!.issues.length).toBeGreaterThan(0);
    expect(fuWeakness!.issues[0]).toContain("복선 문제");
  });

  it("includes issues for genre_alignment weakness", () => {
    const first = makeEvalResult({ genre_alignment: 0.2 });
    const second = makeEvalResult({});

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    const gaWeakness = weaknesses.find((w) => w.dimension === "genre_alignment");
    expect(gaWeakness).toBeDefined();
    expect(gaWeakness!.issues.length).toBeGreaterThan(0);
    expect(gaWeakness!.issues[0]).toContain("장르 문제");
  });
});

// ---------------------------------------------------------------------------
// Strength extraction (2nd-place candidate)
// ---------------------------------------------------------------------------

describe("strength extraction", () => {
  it("returns empty strengths when all 2nd-place scores are below threshold", () => {
    const first = makeEvalResult({});
    const second = makeEvalResult({
      pacing_quality: 0.5,
      character_introduction: 0.4,
      foreshadowing_usage: 0.6,
      genre_alignment: 0.65,
    });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    expect(strengths).toHaveLength(0);
  });

  it("identifies a single strong dimension", () => {
    const first = makeEvalResult({});
    // Explicitly set other dimensions below 0.7 so only pacing_quality qualifies
    const second = makeEvalResult({
      pacing_quality: 0.9,
      character_introduction: 0.6,
      foreshadowing_usage: 0.5,
      genre_alignment: 0.65,
    });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    expect(strengths).toHaveLength(1);
    expect(strengths[0].dimension).toBe("pacing_quality");
    expect(strengths[0].score).toBe(0.9);
  });

  it("identifies multiple strong dimensions", () => {
    const first = makeEvalResult({});
    const second = makeEvalResult({
      pacing_quality: 0.8,
      character_introduction: 0.5, // not strong
      foreshadowing_usage: 0.95,
      genre_alignment: 1.0,
    });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    const dims = strengths.map((s) => s.dimension);
    expect(dims).toContain("pacing_quality");
    expect(dims).toContain("foreshadowing_usage");
    expect(dims).toContain("genre_alignment");
    expect(dims).not.toContain("character_introduction");
    expect(strengths).toHaveLength(3);
  });

  it("treats exact STRENGTH_THRESHOLD (0.7) as a strength", () => {
    const first = makeEvalResult({});
    const second = makeEvalResult({ pacing_quality: STRENGTH_THRESHOLD });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    expect(strengths.map((s) => s.dimension)).toContain("pacing_quality");
  });

  it("treats score just below STRENGTH_THRESHOLD as NOT a strength", () => {
    const first = makeEvalResult({});
    const second = makeEvalResult({
      pacing_quality: STRENGTH_THRESHOLD - 0.001,
    });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    expect(strengths.map((s) => s.dimension)).not.toContain("pacing_quality");
  });

  it("sorts strengths descending by score (best first)", () => {
    const first = makeEvalResult({});
    const second = makeEvalResult({
      pacing_quality: 0.8,
      character_introduction: 1.0,
      foreshadowing_usage: 0.75,
      genre_alignment: 0.9,
    });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    const scores = strengths.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("includes issues in strengths (empty for high-scoring dimensions)", () => {
    // A strength with score=1.0 has no issues
    const first = makeEvalResult({});
    const second = makeEvalResult({ pacing_quality: 1.0 });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    const pqStrength = strengths.find((s) => s.dimension === "pacing_quality");
    expect(pqStrength).toBeDefined();
    expect(pqStrength!.issues).toHaveLength(0);
  });

  it("uses 2nd-place scores for strengths, not 1st-place", () => {
    // 1st has low pacing, 2nd has high pacing
    const first = makeEvalResult({ pacing_quality: 0.3 });
    const second = makeEvalResult({ pacing_quality: 0.9 });

    const { strengths, weaknesses } = extractWeaknessesAndStrengths(first, second);

    // Weakness from 1st
    expect(weaknesses.map((w) => w.dimension)).toContain("pacing_quality");
    expect(weaknesses.find((w) => w.dimension === "pacing_quality")!.score).toBe(0.3);

    // Strength from 2nd
    expect(strengths.map((s) => s.dimension)).toContain("pacing_quality");
    expect(strengths.find((s) => s.dimension === "pacing_quality")!.score).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// Combined scenarios
// ---------------------------------------------------------------------------

describe("combined weakness + strength extraction", () => {
  it("typical crossover scenario: 1st has pacing weakness, 2nd has pacing strength", () => {
    const first = makeEvalResult({
      pacing_quality: 0.4, // weak
      character_introduction: 0.9,
      foreshadowing_usage: 0.8,
      genre_alignment: 0.95,
    });
    const second = makeEvalResult({
      pacing_quality: 0.85, // strong
      character_introduction: 0.6,
      foreshadowing_usage: 0.7,
      genre_alignment: 0.5,
    });

    const result = extractWeaknessesAndStrengths(first, second);

    // 1st weak: pacing only
    expect(result.weaknesses).toHaveLength(1);
    expect(result.weaknesses[0].dimension).toBe("pacing_quality");

    // 2nd strong: pacing + foreshadowing
    const strongDims = result.strengths.map((s) => s.dimension);
    expect(strongDims).toContain("pacing_quality");
    expect(strongDims).toContain("foreshadowing_usage");
    // genre_alignment 0.5 < 0.7 → not strong
    expect(strongDims).not.toContain("genre_alignment");
  });

  it("all dimensions perfect: no weaknesses, all four dimensions as strengths", () => {
    const first = makeEvalResult({
      pacing_quality: 1.0,
      character_introduction: 1.0,
      foreshadowing_usage: 1.0,
      genre_alignment: 1.0,
    });
    const second = makeEvalResult({
      pacing_quality: 1.0,
      character_introduction: 1.0,
      foreshadowing_usage: 1.0,
      genre_alignment: 1.0,
    });

    const { weaknesses, strengths } = extractWeaknessesAndStrengths(first, second);

    expect(weaknesses).toHaveLength(0);
    expect(strengths).toHaveLength(4);
  });

  it("all dimensions failing: all four weaknesses, no strengths", () => {
    const first = makeEvalResult({
      pacing_quality: 0.1,
      character_introduction: 0.2,
      foreshadowing_usage: 0.3,
      genre_alignment: 0.0,
    });
    const second = makeEvalResult({
      pacing_quality: 0.1,
      character_introduction: 0.2,
      foreshadowing_usage: 0.3,
      genre_alignment: 0.0,
    });

    const { weaknesses, strengths } = extractWeaknessesAndStrengths(first, second);

    expect(weaknesses).toHaveLength(4);
    expect(strengths).toHaveLength(0);
  });

  it("weaknesses are scored from 1st, strengths are scored from 2nd independently", () => {
    // 2nd is weaker overall but has different strong/weak dimensions
    const first = makeEvalResult({
      pacing_quality: 0.2, // weak
      character_introduction: 0.4, // weak
      foreshadowing_usage: 0.9,
      genre_alignment: 0.8,
    });
    const second = makeEvalResult({
      pacing_quality: 0.95, // strong
      character_introduction: 0.85, // strong
      foreshadowing_usage: 0.4, // not strong
      genre_alignment: 0.3, // not strong
    });

    const { weaknesses, strengths } = extractWeaknessesAndStrengths(first, second);

    // Weaknesses from 1st
    const weakDims = weaknesses.map((w) => w.dimension);
    expect(weakDims).toContain("pacing_quality");
    expect(weakDims).toContain("character_introduction");
    expect(weakDims).not.toContain("foreshadowing_usage");
    expect(weakDims).not.toContain("genre_alignment");

    // Strengths from 2nd
    const strongDims = strengths.map((s) => s.dimension);
    expect(strongDims).toContain("pacing_quality");
    expect(strongDims).toContain("character_introduction");
    expect(strongDims).not.toContain("foreshadowing_usage");
    expect(strongDims).not.toContain("genre_alignment");
  });

  it("weakness scores reflect 1st-place values, not 2nd-place", () => {
    const first = makeEvalResult({ pacing_quality: 0.3, foreshadowing_usage: 0.5 });
    const second = makeEvalResult({ pacing_quality: 0.1, foreshadowing_usage: 0.2 });

    const { weaknesses } = extractWeaknessesAndStrengths(first, second);

    const pqWeak = weaknesses.find((w) => w.dimension === "pacing_quality");
    const fuWeak = weaknesses.find((w) => w.dimension === "foreshadowing_usage");

    expect(pqWeak!.score).toBe(0.3); // from 1st, not 0.1
    expect(fuWeak!.score).toBe(0.5); // from 1st, not 0.2
  });

  it("strength scores reflect 2nd-place values, not 1st-place", () => {
    const first = makeEvalResult({ genre_alignment: 1.0 });
    const second = makeEvalResult({ genre_alignment: 0.75 });

    const { strengths } = extractWeaknessesAndStrengths(first, second);

    const gaStrength = strengths.find((s) => s.dimension === "genre_alignment");
    expect(gaStrength!.score).toBe(0.75); // from 2nd, not 1.0
  });
});

// ---------------------------------------------------------------------------
// Return type shape
// ---------------------------------------------------------------------------

describe("return type", () => {
  it("returns an object with weaknesses and strengths arrays", () => {
    const first = makeEvalResult({});
    const second = makeEvalResult({});

    const result: WeaknessStrengthResult = extractWeaknessesAndStrengths(
      first,
      second,
    );

    expect(result).toHaveProperty("weaknesses");
    expect(result).toHaveProperty("strengths");
    expect(Array.isArray(result.weaknesses)).toBe(true);
    expect(Array.isArray(result.strengths)).toBe(true);
  });

  it("each DimensionScore has dimension, score, and issues fields", () => {
    const first = makeEvalResult({ pacing_quality: 0.3 });
    const second = makeEvalResult({ genre_alignment: 0.9 });

    const { weaknesses, strengths } = extractWeaknessesAndStrengths(
      first,
      second,
    );

    const weakness = weaknesses[0];
    expect(weakness).toHaveProperty("dimension");
    expect(weakness).toHaveProperty("score");
    expect(weakness).toHaveProperty("issues");
    expect(typeof weakness.dimension).toBe("string");
    expect(typeof weakness.score).toBe("number");
    expect(Array.isArray(weakness.issues)).toBe(true);

    const strength = strengths[0];
    expect(strength).toHaveProperty("dimension");
    expect(strength).toHaveProperty("score");
    expect(strength).toHaveProperty("issues");
  });
});
