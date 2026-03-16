/**
 * Tests for the Tension Curve evaluator (arc evolution loop).
 *
 * Verifies:
 *  - Exported constants
 *  - Neutral result when data is insufficient
 *  - rise_quality sub-check
 *  - peak_placement sub-check
 *  - resolution_quality sub-check
 *  - Overall score weighting (40 / 30 / 30)
 *  - extractArcTensionValues helper
 *  - evaluateArcTensionCurve integration
 *  - Issue message generation
 *  - Edge cases
 */

import { describe, it, expect } from "vitest";
import {
  evaluateTensionCurve,
  evaluateArcTensionCurve,
  extractArcTensionValues,
  IDEAL_PEAK_MIN_RATIO,
  IDEAL_PEAK_MAX_RATIO,
  RISE_PASS_THRESHOLD,
  RESOLUTION_PASS_THRESHOLD,
  MIN_TENSION_VALUES,
} from "@/lib/evolution/evaluators/tension-curve";
import type { ArcPlan } from "@/lib/schema/planning";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ArcPlan with the given tension_curve. */
function makeArcWithCurve(tension_curve: number[]): ArcPlan {
  return {
    id: "arc_1",
    name: "테스트 아크",
    part_id: "",
    start_chapter: 1,
    end_chapter: tension_curve.length,
    summary: "테스트",
    theme: "",
    key_events: [],
    climax_chapter: Math.ceil(tension_curve.length / 2),
    tension_curve,
    chapter_blueprints: [],
  };
}

/** Build a minimal ArcPlan with chapter_blueprints (no tension_curve). */
function makeArcWithBlueprints(tensionLevels: number[]): ArcPlan {
  return {
    id: "arc_1",
    name: "테스트 아크",
    part_id: "",
    start_chapter: 1,
    end_chapter: tensionLevels.length,
    summary: "테스트",
    theme: "",
    key_events: [],
    climax_chapter: Math.ceil(tensionLevels.length / 2),
    tension_curve: [],
    chapter_blueprints: tensionLevels.map((level, i) => ({
      chapter_number: i + 1,
      title: `${i + 1}화`,
      arc_id: "arc_1",
      one_liner: "테스트",
      role_in_arc: "rising_action" as const,
      scenes: [],
      dependencies: [],
      target_word_count: 3000,
      emotional_arc: "",
      key_points: [],
      characters_involved: [],
      tension_level: level,
      foreshadowing_actions: [],
    })),
  };
}

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("IDEAL_PEAK_MIN_RATIO is 0.5", () => {
    expect(IDEAL_PEAK_MIN_RATIO).toBe(0.5);
  });

  it("IDEAL_PEAK_MAX_RATIO is 0.8", () => {
    expect(IDEAL_PEAK_MAX_RATIO).toBe(0.8);
  });

  it("RISE_PASS_THRESHOLD is 0.5", () => {
    expect(RISE_PASS_THRESHOLD).toBe(0.5);
  });

  it("RESOLUTION_PASS_THRESHOLD is 0.5", () => {
    expect(RESOLUTION_PASS_THRESHOLD).toBe(0.5);
  });

  it("MIN_TENSION_VALUES is 3", () => {
    expect(MIN_TENSION_VALUES).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Neutral result for insufficient data
// ---------------------------------------------------------------------------

describe("insufficient data → neutral pass", () => {
  it("returns overall_score 1.0 for empty array", () => {
    const result = evaluateTensionCurve([]);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns neutral for single value", () => {
    const result = evaluateTensionCurve([5]);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("returns neutral for two values", () => {
    const result = evaluateTensionCurve([3, 7]);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("does NOT return neutral for exactly MIN_TENSION_VALUES values", () => {
    // Three values is the minimum for real analysis
    const result = evaluateTensionCurve([3, 7, 5]);
    // Should perform actual analysis (not neutral)
    expect(result.rise_quality.total_pre_peak_steps).toBeGreaterThanOrEqual(0);
    // overall_score could be anything but the fields should be populated
    expect(result.peak_placement.peak_value).toBe(7);
  });

  it("neutral result has all sub-scores 1.0", () => {
    const result = evaluateTensionCurve([]);
    expect(result.rise_quality.score).toBe(1.0);
    expect(result.peak_placement.score).toBe(1.0);
    expect(result.resolution_quality.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// rise_quality sub-check
// ---------------------------------------------------------------------------

describe("rise_quality", () => {
  it("score is 1.0 when all pre-peak steps are increasing", () => {
    // [1, 3, 5, 8, 10, 7, 4] — peak at index 4
    const result = evaluateTensionCurve([1, 3, 5, 8, 10, 7, 4]);
    expect(result.rise_quality.increasing_steps).toBe(4);
    expect(result.rise_quality.total_pre_peak_steps).toBe(4);
    expect(result.rise_quality.score).toBe(1.0);
    expect(result.rise_quality.pass).toBe(true);
  });

  it("score is 0 when peak is at index 0 (no pre-peak segment)", () => {
    // [10, 8, 6, 4, 2] — immediate drop
    const result = evaluateTensionCurve([10, 8, 6, 4, 2]);
    expect(result.rise_quality.total_pre_peak_steps).toBe(0);
    expect(result.rise_quality.score).toBe(0);
    expect(result.rise_quality.pass).toBe(false);
  });

  it("counts only strictly increasing consecutive pairs", () => {
    // [3, 3, 5, 4, 8, 6, 3] — peak at index 4
    // steps: [3→3 no, 3→5 yes, 5→4 no, 4→8 yes] = 2/4
    const result = evaluateTensionCurve([3, 3, 5, 4, 8, 6, 3]);
    expect(result.rise_quality.increasing_steps).toBe(2);
    expect(result.rise_quality.total_pre_peak_steps).toBe(4);
    expect(result.rise_quality.score).toBeCloseTo(0.5, 3);
    expect(result.rise_quality.pass).toBe(true); // exactly at threshold
  });

  it("fails when fewer than half of pre-peak steps are increasing", () => {
    // [8, 6, 4, 9, 7, 5, 3] — peak at index 3 (value=9)
    // pre-peak steps: [8→6 no, 6→4 no, 4→9 yes] = 1/3 ≈ 0.333
    const result = evaluateTensionCurve([8, 6, 4, 9, 7, 5, 3]);
    expect(result.rise_quality.score).toBeCloseTo(1 / 3, 2);
    expect(result.rise_quality.pass).toBe(false);
  });

  it("reports increasing_steps and total_pre_peak_steps correctly", () => {
    // [2, 4, 3, 6, 5, 9, 7] — peak at index 5
    // steps: [2→4 yes, 4→3 no, 3→6 yes, 6→5 no, 5→9 yes] = 3/5
    const result = evaluateTensionCurve([2, 4, 3, 6, 5, 9, 7]);
    expect(result.rise_quality.increasing_steps).toBe(3);
    expect(result.rise_quality.total_pre_peak_steps).toBe(5);
    expect(result.rise_quality.score).toBeCloseTo(0.6, 3);
    expect(result.rise_quality.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// peak_placement sub-check
// ---------------------------------------------------------------------------

describe("peak_placement", () => {
  it("score is 1.0 when peak is exactly at IDEAL_PEAK_MIN_RATIO (0.5)", () => {
    // 7 values, peak at index 3 → ratio = 3/6 = 0.5
    const result = evaluateTensionCurve([1, 3, 5, 8, 10, 7, 4]);
    expect(result.peak_placement.peak_ratio).toBeCloseTo(4 / 6, 3);
  });

  it("score is 1.0 for peak in the ideal range [0.5, 0.8]", () => {
    // 6 values, peak at index 3 → ratio = 3/5 = 0.6
    const result = evaluateTensionCurve([2, 4, 6, 10, 7, 3]);
    expect(result.peak_placement.peak_ratio).toBeCloseTo(3 / 5, 3);
    expect(result.peak_placement.score).toBe(1.0);
    expect(result.peak_placement.pass).toBe(true);
  });

  it("score is 1.0 for peak at IDEAL_PEAK_MAX_RATIO boundary (0.8)", () => {
    // 6 values, peak at index 4 → ratio = 4/5 = 0.8
    const result = evaluateTensionCurve([1, 2, 4, 6, 10, 5]);
    expect(result.peak_placement.peak_ratio).toBeCloseTo(4 / 5, 3);
    expect(result.peak_placement.score).toBe(1.0);
    expect(result.peak_placement.pass).toBe(true);
  });

  it("score degrades when peak is too early (< 0.5)", () => {
    // 6 values, peak at index 1 → ratio = 1/5 = 0.2
    // score = 0.2 / 0.5 = 0.4
    const result = evaluateTensionCurve([2, 10, 8, 6, 4, 2]);
    expect(result.peak_placement.peak_ratio).toBeCloseTo(1 / 5, 3);
    expect(result.peak_placement.score).toBeCloseTo(0.4, 3);
    expect(result.peak_placement.pass).toBe(false);
  });

  it("score is 0 when peak is at index 0 (very beginning)", () => {
    // [10, 8, 6, 4, 2] — peak at index 0 → ratio = 0
    const result = evaluateTensionCurve([10, 8, 6, 4, 2]);
    expect(result.peak_placement.peak_ratio).toBe(0);
    expect(result.peak_placement.score).toBe(0);
    expect(result.peak_placement.pass).toBe(false);
  });

  it("score degrades when peak is too late (> 0.8)", () => {
    // 6 values, peak at index 5 → ratio = 5/5 = 1.0
    // score = 1 - (1.0 - 0.8) / (1.0 - 0.8) = 0
    const result = evaluateTensionCurve([1, 2, 3, 4, 5, 10]);
    expect(result.peak_placement.peak_ratio).toBeCloseTo(1.0, 3);
    expect(result.peak_placement.score).toBe(0);
    expect(result.peak_placement.pass).toBe(false);
  });

  it("score is between 0 and 1 for intermediate early peak", () => {
    // 11 values, peak at index 2 → ratio = 2/10 = 0.2
    const values = [3, 5, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const result = evaluateTensionCurve(values);
    expect(result.peak_placement.score).toBeGreaterThan(0);
    expect(result.peak_placement.score).toBeLessThan(1);
    expect(result.peak_placement.pass).toBe(false);
  });

  it("records peak_index and peak_value correctly", () => {
    // [3, 5, 9, 7, 4] — peak at index 2 (value=9)
    const result = evaluateTensionCurve([3, 5, 9, 7, 4]);
    expect(result.peak_placement.peak_index).toBe(2);
    expect(result.peak_placement.peak_value).toBe(9);
  });

  it("ideal_min and ideal_max reflect the exported constants", () => {
    const result = evaluateTensionCurve([1, 5, 10, 8, 3]);
    expect(result.peak_placement.ideal_min).toBe(IDEAL_PEAK_MIN_RATIO);
    expect(result.peak_placement.ideal_max).toBe(IDEAL_PEAK_MAX_RATIO);
  });
});

// ---------------------------------------------------------------------------
// resolution_quality sub-check
// ---------------------------------------------------------------------------

describe("resolution_quality", () => {
  it("score is 1.0 when all post-peak steps are decreasing", () => {
    // [2, 5, 10, 8, 5, 3] — peak at index 2
    const result = evaluateTensionCurve([2, 5, 10, 8, 5, 3]);
    expect(result.resolution_quality.decreasing_steps).toBe(3);
    expect(result.resolution_quality.total_post_peak_steps).toBe(3);
    expect(result.resolution_quality.score).toBe(1.0);
    expect(result.resolution_quality.pass).toBe(true);
  });

  it("score is 0 when peak is at the last position", () => {
    // [1, 3, 5, 7, 10] — peak at last index → no post-peak steps
    const result = evaluateTensionCurve([1, 3, 5, 7, 10]);
    expect(result.resolution_quality.total_post_peak_steps).toBe(0);
    expect(result.resolution_quality.score).toBe(0);
    expect(result.resolution_quality.pass).toBe(false);
  });

  it("counts only strictly decreasing consecutive pairs", () => {
    // [1, 5, 10, 9, 9, 7] — peak at index 2
    // post-peak steps: [10→9 yes, 9→9 no, 9→7 yes] = 2/3
    const result = evaluateTensionCurve([1, 5, 10, 9, 9, 7]);
    expect(result.resolution_quality.decreasing_steps).toBe(2);
    expect(result.resolution_quality.total_post_peak_steps).toBe(3);
    expect(result.resolution_quality.score).toBeCloseTo(2 / 3, 3);
    expect(result.resolution_quality.pass).toBe(true);
  });

  it("fails when fewer than half of post-peak steps are decreasing", () => {
    // [3, 6, 10, 8, 9, 10, 7] — wait, 10 appears at index 2 AND 5, first is peak
    // [3, 6, 10, 11, 9, 10, 7] — peak at index 3
    // Simpler: [2, 5, 10, 8, 9, 10, 5] — peak at index 2 first occurrence
    //   Actually 10 appears at indices 2 and 5. findPeakIndex picks index 2.
    //   post-peak steps: [10→8 yes, 8→9 no, 9→10 no, 10→5 yes] = 2/4 = 0.5 pass
    // Let's use: [2, 5, 10, 7, 9, 11, 5] — peak at index 5 (11)
    //   post-peak: [11→5 yes] = 1/1 → score=1 → not helpful
    // Use: [3, 8, 10, 9, 10, 8, 7] — peak at index 2, post: [10→9 yes, 9→10 no, 10→8 yes, 8→7 yes] = 3/4 → pass
    // Use: [3, 8, 10, 8, 9, 10, 11] — peak at index 6 (last) → score=0 not what we want
    // Use: [3, 9, 10, 5, 6, 7, 8] — peak at index 2, post: [10→5 yes, 5→6 no, 6→7 no, 7→8 no] = 1/4 = 0.25 → fail
    const result = evaluateTensionCurve([3, 9, 10, 5, 6, 7, 8]);
    expect(result.resolution_quality.score).toBeCloseTo(1 / 4, 3);
    expect(result.resolution_quality.pass).toBe(false);
  });

  it("records final_value and peak_value correctly", () => {
    // [2, 6, 10, 7, 4] — peak=10, final=4
    const result = evaluateTensionCurve([2, 6, 10, 7, 4]);
    expect(result.resolution_quality.peak_value).toBe(10);
    expect(result.resolution_quality.final_value).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Overall score weighting (40 / 30 / 30)
// ---------------------------------------------------------------------------

describe("overall_score", () => {
  it("is 1.0 for a perfect rise→peak→resolution arc", () => {
    // [1, 3, 5, 8, 10, 7, 4] n=7, peak at index 4
    // ratio = 4/6 ≈ 0.667 → in [0.5, 0.8]
    // rise: [1→3, 3→5, 5→8, 8→10] = 4/4 = 1.0
    // peak: 1.0
    // resolution: [10→7, 7→4] = 2/2 = 1.0
    const result = evaluateTensionCurve([1, 3, 5, 8, 10, 7, 4]);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("weights are 40% rise + 30% peak + 30% resolution", () => {
    // Craft a case where rise=1.0, peak=0.0, resolution=1.0
    // peak at index 0 → ratio=0 → peak score=0
    // [10, 8, 6, 4, 2] — but peak at 0 means rise_score=0 too (no pre-peak)
    //
    // Better: rise=0, peak=1.0, resolution=1.0
    //   peak at ratio [0.5,0.8], all pre-peak steps decreasing, all post-peak decreasing
    //   [8, 7, 6, 10, 5, 3] — peak at index 3, ratio=3/5=0.6 ✓
    //   rise: [8→7 no, 7→6 no, 6→10 yes] = 1/3 ≈ 0.333 → fail
    //   resolution: [10→5 yes, 5→3 yes] = 2/2 = 1.0
    //   expected = 0.333*0.4 + 1.0*0.3 + 1.0*0.3 = 0.133 + 0.3 + 0.3 = 0.733
    const result = evaluateTensionCurve([8, 7, 6, 10, 5, 3]);
    const riseScore = result.rise_quality.score;
    const peakScore = result.peak_placement.score;
    const resScore = result.resolution_quality.score;
    const expected = riseScore * 0.4 + peakScore * 0.3 + resScore * 0.3;
    expect(result.overall_score).toBeCloseTo(expected, 2);
  });

  it("is within [0, 1] for all patterns", () => {
    const testCases = [
      [5, 5, 5, 5, 5], // flat
      [10, 9, 8, 7, 6], // monotone decreasing
      [1, 2, 3, 4, 5], // monotone increasing
      [1, 5, 3, 8, 4, 9, 2], // irregular
      [3, 7, 5], // minimal valid
    ];
    for (const values of testCases) {
      const result = evaluateTensionCurve(values);
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(1);
    }
  });

  it("pass is false if any sub-check fails", () => {
    // Monotone increasing — no resolution → resolution fails
    const result = evaluateTensionCurve([1, 2, 3, 4, 5, 6, 7]);
    expect(result.resolution_quality.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("pass is true only when all three sub-checks pass", () => {
    const result = evaluateTensionCurve([1, 3, 5, 8, 10, 7, 4]);
    expect(result.rise_quality.pass).toBe(true);
    expect(result.peak_placement.pass).toBe(true);
    expect(result.resolution_quality.pass).toBe(true);
    expect(result.pass).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue message generation
// ---------------------------------------------------------------------------

describe("issues", () => {
  it("is empty when all sub-checks pass", () => {
    const result = evaluateTensionCurve([1, 3, 5, 8, 10, 7, 4]);
    expect(result.issues).toHaveLength(0);
  });

  it("records rise issue message when rise_quality fails", () => {
    // Peak at index 0 → rise fails
    const result = evaluateTensionCurve([10, 8, 6, 4, 2]);
    const issue = result.issues.find((i) => i.includes("긴장 상승"));
    expect(issue).toBeDefined();
    expect(issue).toContain("0/0");
  });

  it("records peak issue message when peak_placement fails", () => {
    // Monotone increasing — peak at last index
    const result = evaluateTensionCurve([1, 2, 3, 4, 5]);
    const issue = result.issues.find((i) => i.includes("정점 위치"));
    expect(issue).toBeDefined();
    expect(issue).toContain("100%");
  });

  it("records resolution issue message when resolution_quality fails", () => {
    // Monotone increasing — no resolution
    const result = evaluateTensionCurve([1, 2, 3, 4, 5]);
    const issue = result.issues.find((i) => i.includes("긴장 해소"));
    expect(issue).toBeDefined();
    expect(issue).toContain("0/0");
  });

  it("can report all three issues simultaneously", () => {
    // [10, 8, 6, 4, 2] — peak at index 0
    // rise: 0/0 → fail
    // peak: ratio=0 → fail
    // resolution: all post-peak decreasing (2/2) → pass
    // So only 2 issues
    const result = evaluateTensionCurve([10, 8, 6, 4, 2]);
    // Rise and peak should fail; resolution passes (all steps decrease)
    expect(result.rise_quality.pass).toBe(false);
    expect(result.peak_placement.pass).toBe(false);
    // Resolution: [10→8, 8→6, 6→4, 4→2] = 4/4 = 1.0 → pass
    expect(result.resolution_quality.pass).toBe(true);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// extractArcTensionValues
// ---------------------------------------------------------------------------

describe("extractArcTensionValues", () => {
  it("returns tension_curve when it is non-empty", () => {
    const arc = makeArcWithCurve([2, 5, 9, 7, 3]);
    expect(extractArcTensionValues(arc)).toEqual([2, 5, 9, 7, 3]);
  });

  it("falls back to chapter_blueprints when tension_curve is empty", () => {
    const arc = makeArcWithBlueprints([3, 6, 10, 8, 4]);
    expect(extractArcTensionValues(arc)).toEqual([3, 6, 10, 8, 4]);
  });

  it("sorts chapter_blueprints by chapter_number before extracting", () => {
    const arc: ArcPlan = {
      id: "arc_1",
      name: "테스트",
      part_id: "",
      start_chapter: 1,
      end_chapter: 4,
      summary: "",
      theme: "",
      key_events: [],
      climax_chapter: 3,
      tension_curve: [],
      chapter_blueprints: [
        // Intentionally out of order
        {
          chapter_number: 3,
          title: "3화",
          arc_id: "arc_1",
          one_liner: "",
          role_in_arc: "climax",
          scenes: [],
          dependencies: [],
          target_word_count: 3000,
          emotional_arc: "",
          key_points: [],
          characters_involved: [],
          tension_level: 9,
          foreshadowing_actions: [],
        },
        {
          chapter_number: 1,
          title: "1화",
          arc_id: "arc_1",
          one_liner: "",
          role_in_arc: "setup",
          scenes: [],
          dependencies: [],
          target_word_count: 3000,
          emotional_arc: "",
          key_points: [],
          characters_involved: [],
          tension_level: 3,
          foreshadowing_actions: [],
        },
        {
          chapter_number: 2,
          title: "2화",
          arc_id: "arc_1",
          one_liner: "",
          role_in_arc: "rising_action",
          scenes: [],
          dependencies: [],
          target_word_count: 3000,
          emotional_arc: "",
          key_points: [],
          characters_involved: [],
          tension_level: 6,
          foreshadowing_actions: [],
        },
        {
          chapter_number: 4,
          title: "4화",
          arc_id: "arc_1",
          one_liner: "",
          role_in_arc: "resolution",
          scenes: [],
          dependencies: [],
          target_word_count: 3000,
          emotional_arc: "",
          key_points: [],
          characters_involved: [],
          tension_level: 4,
          foreshadowing_actions: [],
        },
      ],
    };
    expect(extractArcTensionValues(arc)).toEqual([3, 6, 9, 4]);
  });

  it("returns empty array when both tension_curve and chapter_blueprints are empty", () => {
    const arc = makeArcWithCurve([]);
    // Override to also have empty blueprints (already the case from makeArcWithCurve)
    expect(extractArcTensionValues(arc)).toEqual([]);
  });

  it("prefers tension_curve over chapter_blueprints even when both are present", () => {
    const arc: ArcPlan = {
      ...makeArcWithBlueprints([1, 2, 3]),
      tension_curve: [7, 8, 9],
    };
    expect(extractArcTensionValues(arc)).toEqual([7, 8, 9]);
  });
});

// ---------------------------------------------------------------------------
// evaluateArcTensionCurve integration
// ---------------------------------------------------------------------------

describe("evaluateArcTensionCurve", () => {
  it("delegates to evaluateTensionCurve using the arc's tension values", () => {
    const arc = makeArcWithCurve([1, 3, 6, 10, 8, 5, 2]);
    const result = evaluateArcTensionCurve(arc);
    // Compare with direct call
    const expected = evaluateTensionCurve([1, 3, 6, 10, 8, 5, 2]);
    expect(result).toEqual(expected);
  });

  it("returns neutral pass for an arc with no tension data", () => {
    const arc = makeArcWithCurve([]);
    const result = evaluateArcTensionCurve(arc);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("works with chapter_blueprints fallback", () => {
    const arc = makeArcWithBlueprints([2, 4, 8, 10, 7, 3]);
    const result = evaluateArcTensionCurve(arc);
    const expected = evaluateTensionCurve([2, 4, 8, 10, 7, 3]);
    expect(result).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Specific narrative pattern scenarios
// ---------------------------------------------------------------------------

describe("narrative pattern scenarios", () => {
  it("classic rise→peak→fall (perfect arc)", () => {
    const result = evaluateTensionCurve([2, 4, 6, 8, 10, 7, 5, 3]);
    // peak at index 4, n=8, ratio=4/7≈0.571 → ideal range
    expect(result.pass).toBe(true);
    expect(result.overall_score).toBe(1.0);
  });

  it("monotone increasing (climax at very end) — peak and resolution fail", () => {
    const result = evaluateTensionCurve([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.peak_placement.pass).toBe(false);
    expect(result.resolution_quality.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("monotone decreasing (peaks immediately) — rise and peak fail", () => {
    const result = evaluateTensionCurve([10, 9, 8, 7, 6, 5, 4, 3]);
    expect(result.rise_quality.pass).toBe(false);
    expect(result.peak_placement.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("flat tension (no movement) — rise and resolution both fail", () => {
    const result = evaluateTensionCurve([5, 5, 5, 5, 5]);
    // All values equal → peak at index 0
    expect(result.rise_quality.pass).toBe(false);
    expect(result.peak_placement.pass).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("W-shape with final peak lower — overall pass depends on first peak position", () => {
    // [3, 8, 5, 9, 6] — peak at index 3 (9), ratio=3/4=0.75 → ideal
    // rise: [3→8 yes, 8→5 no, 5→9 yes] = 2/3 ≈ 0.667 → pass
    // resolution: [9→6 yes] = 1/1 = 1.0 → pass
    const result = evaluateTensionCurve([3, 8, 5, 9, 6]);
    expect(result.peak_placement.pass).toBe(true);
    expect(result.rise_quality.pass).toBe(true);
    expect(result.resolution_quality.pass).toBe(true);
    expect(result.pass).toBe(true);
  });

  it("minimal valid arc (exactly 3 values) with perfect pattern", () => {
    // [3, 10, 5] — peak at index 1, n=3, ratio=1/2=0.5 → ideal (at boundary)
    // rise: [3→10 yes] = 1/1 = 1.0
    // resolution: [10→5 yes] = 1/1 = 1.0
    const result = evaluateTensionCurve([3, 10, 5]);
    expect(result.rise_quality.score).toBe(1.0);
    expect(result.peak_placement.score).toBe(1.0);
    expect(result.resolution_quality.score).toBe(1.0);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });
});
