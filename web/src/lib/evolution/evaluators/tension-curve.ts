/**
 * Tension Curve evaluator for the arc evolution loop.
 *
 * Analyzes a time-series of tension values (e.g., per-chapter tension levels
 * from ChapterBlueprint.tension_level or ArcPlan.tension_curve) and scores
 * how well they conform to the narrative rise→peak→resolution pattern.
 *
 * Criteria:
 *   - rise_quality        : Tension generally increases before the peak  (40%)
 *   - peak_placement      : Peak is positioned 50–80 % through the arc   (30%)
 *   - resolution_quality  : Tension drops after the peak                 (30%)
 *
 * All scoring is code-based (no LLM calls).
 */

import type { ArcPlan } from "@/lib/schema/planning";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Normalised position at which the peak may start (inclusive) */
export const IDEAL_PEAK_MIN_RATIO = 0.5;

/** Normalised position at which the peak may end (inclusive) */
export const IDEAL_PEAK_MAX_RATIO = 0.8;

/** Minimum fraction of pre-peak steps that must be increasing to pass */
export const RISE_PASS_THRESHOLD = 0.5;

/** Minimum fraction of post-peak steps that must be decreasing to pass */
export const RESOLUTION_PASS_THRESHOLD = 0.5;

/**
 * Minimum number of tension values required for a meaningful analysis.
 * Fewer than this returns a neutral pass (no penalty).
 */
export const MIN_TENSION_VALUES = 3;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface RiseQualityDetail {
  /** Number of consecutive-pair steps that are strictly increasing before the peak */
  increasing_steps: number;
  /** Total consecutive-pair steps in the pre-peak segment (= peakIndex) */
  total_pre_peak_steps: number;
  /** 0-1 sub-score: increasing_steps / total_pre_peak_steps */
  score: number;
  pass: boolean;
}

export interface PeakPlacementDetail {
  /** Zero-based index of the peak (first occurrence of the maximum value) */
  peak_index: number;
  /** The maximum tension value */
  peak_value: number;
  /** Normalised position: peak_index / (n − 1) */
  peak_ratio: number;
  /** Always IDEAL_PEAK_MIN_RATIO */
  ideal_min: number;
  /** Always IDEAL_PEAK_MAX_RATIO */
  ideal_max: number;
  /** 0-1 sub-score based on distance from the ideal range */
  score: number;
  pass: boolean;
}

export interface ResolutionQualityDetail {
  /** The maximum tension value at the peak */
  peak_value: number;
  /** The last tension value in the series */
  final_value: number;
  /** Number of consecutive-pair steps that are strictly decreasing after the peak */
  decreasing_steps: number;
  /** Total consecutive-pair steps in the post-peak segment */
  total_post_peak_steps: number;
  /** 0-1 sub-score: decreasing_steps / total_post_peak_steps */
  score: number;
  pass: boolean;
}

export interface TensionCurveResult {
  /** Weighted overall score 0-1 */
  overall_score: number;
  pass: boolean;
  rise_quality: RiseQualityDetail;
  peak_placement: PeakPlacementDetail;
  resolution_quality: ResolutionQualityDetail;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Extract ordered tension values from an ArcPlan.
 *
 * Prefers `arc.tension_curve` (explicitly provided) and falls back to
 * deriving values from `arc.chapter_blueprints[].tension_level` sorted by
 * chapter_number.
 */
export function extractArcTensionValues(arc: ArcPlan): number[] {
  if (arc.tension_curve && arc.tension_curve.length > 0) {
    return arc.tension_curve;
  }
  const sorted = [...arc.chapter_blueprints].sort(
    (a, b) => a.chapter_number - b.chapter_number,
  );
  return sorted.map((ch) => ch.tension_level);
}

/**
 * Evaluate how well a sequence of tension values conforms to the
 * rise → peak → resolution narrative arc pattern.
 *
 * @param tensionValues - Ordered tension values (1-10 scale recommended).
 *   When fewer than MIN_TENSION_VALUES are supplied the function returns a
 *   neutral pass (overall_score = 1.0) so that arcs without enough data are
 *   not penalised.
 * @returns TensionCurveResult with sub-scores and Korean issue strings.
 */
export function evaluateTensionCurve(
  tensionValues: number[],
): TensionCurveResult {
  if (tensionValues.length < MIN_TENSION_VALUES) {
    return buildNeutralResult();
  }

  const peakIndex = findPeakIndex(tensionValues);

  const riseResult = checkRiseQuality(tensionValues, peakIndex);
  const peakResult = checkPeakPlacement(tensionValues, peakIndex);
  const resolutionResult = checkResolutionQuality(tensionValues, peakIndex);

  const overallScore =
    riseResult.score * 0.4 +
    peakResult.score * 0.3 +
    resolutionResult.score * 0.3;

  const issues: string[] = [];

  if (!riseResult.pass) {
    issues.push(
      `긴장 상승 불충분: ${riseResult.increasing_steps}/${riseResult.total_pre_peak_steps} 단계 상승` +
        ` (최소 ${Math.round(RISE_PASS_THRESHOLD * 100)}% 필요)`,
    );
  }

  if (!peakResult.pass) {
    const pos = Math.round(peakResult.peak_ratio * 100);
    issues.push(
      `정점 위치 부적절: 전체의 ${pos}% 지점` +
        ` (이상적 위치: ${IDEAL_PEAK_MIN_RATIO * 100}~${IDEAL_PEAK_MAX_RATIO * 100}%)`,
    );
  }

  if (!resolutionResult.pass) {
    issues.push(
      `긴장 해소 불충분: ${resolutionResult.decreasing_steps}/${resolutionResult.total_post_peak_steps} 단계 하강` +
        ` (최소 ${Math.round(RESOLUTION_PASS_THRESHOLD * 100)}% 필요)`,
    );
  }

  return {
    overall_score: Math.round(overallScore * 1000) / 1000,
    pass: riseResult.pass && peakResult.pass && resolutionResult.pass,
    rise_quality: riseResult,
    peak_placement: peakResult,
    resolution_quality: resolutionResult,
    issues,
  };
}

/**
 * Convenience wrapper: evaluate the tension curve for a whole arc.
 *
 * Delegates to `extractArcTensionValues` then `evaluateTensionCurve`.
 */
export function evaluateArcTensionCurve(arc: ArcPlan): TensionCurveResult {
  return evaluateTensionCurve(extractArcTensionValues(arc));
}

// ---------------------------------------------------------------------------
// Sub-checks
// ---------------------------------------------------------------------------

/**
 * Return the index of the first occurrence of the maximum value.
 */
function findPeakIndex(values: number[]): number {
  let maxIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[maxIdx]) {
      maxIdx = i;
    }
  }
  return maxIdx;
}

/**
 * Score how well tension rises in the segment leading up to (and including)
 * the peak.
 *
 * If the peak is at index 0 there is no pre-peak segment, so no rising is
 * possible → score = 0, pass = false.
 */
function checkRiseQuality(
  values: number[],
  peakIndex: number,
): RiseQualityDetail {
  const totalSteps = peakIndex; // number of consecutive pairs before peak

  if (totalSteps === 0) {
    return {
      increasing_steps: 0,
      total_pre_peak_steps: 0,
      score: 0,
      pass: false,
    };
  }

  let increasing = 0;
  for (let i = 0; i < peakIndex; i++) {
    if (values[i + 1] > values[i]) {
      increasing++;
    }
  }

  const score = increasing / totalSteps;

  return {
    increasing_steps: increasing,
    total_pre_peak_steps: totalSteps,
    score: Math.round(score * 1000) / 1000,
    pass: score >= RISE_PASS_THRESHOLD,
  };
}

/**
 * Score whether the peak falls in the ideal range (IDEAL_PEAK_MIN_RATIO to
 * IDEAL_PEAK_MAX_RATIO).
 *
 * The score degrades linearly to 0 when the peak is at the very start (0)
 * or very end (1) of the arc.
 */
function checkPeakPlacement(
  values: number[],
  peakIndex: number,
): PeakPlacementDetail {
  const n = values.length;
  const peakValue = values[peakIndex];
  // For a single-element array (should not happen due to MIN_TENSION_VALUES
  // guard, but be safe) treat ratio as 0.
  const peakRatio = n <= 1 ? 0 : peakIndex / (n - 1);

  let score: number;
  if (
    peakRatio >= IDEAL_PEAK_MIN_RATIO &&
    peakRatio <= IDEAL_PEAK_MAX_RATIO
  ) {
    score = 1.0;
  } else if (peakRatio < IDEAL_PEAK_MIN_RATIO) {
    // Linearly degrades from 1.0 at IDEAL_PEAK_MIN_RATIO to 0 at ratio = 0
    score = peakRatio / IDEAL_PEAK_MIN_RATIO;
  } else {
    // peakRatio > IDEAL_PEAK_MAX_RATIO
    // Linearly degrades from 1.0 at IDEAL_PEAK_MAX_RATIO to 0 at ratio = 1
    score =
      1.0 -
      (peakRatio - IDEAL_PEAK_MAX_RATIO) / (1.0 - IDEAL_PEAK_MAX_RATIO);
  }

  return {
    peak_index: peakIndex,
    peak_value: peakValue,
    peak_ratio: Math.round(peakRatio * 1000) / 1000,
    ideal_min: IDEAL_PEAK_MIN_RATIO,
    ideal_max: IDEAL_PEAK_MAX_RATIO,
    score: Math.round(Math.max(0, score) * 1000) / 1000,
    pass: peakRatio >= IDEAL_PEAK_MIN_RATIO && peakRatio <= IDEAL_PEAK_MAX_RATIO,
  };
}

/**
 * Score how well tension falls after the peak (resolution / falling action).
 *
 * If the peak is at the very last position there are no post-peak steps,
 * making resolution impossible → score = 0, pass = false.
 */
function checkResolutionQuality(
  values: number[],
  peakIndex: number,
): ResolutionQualityDetail {
  const totalSteps = values.length - 1 - peakIndex; // steps after peak

  if (totalSteps === 0) {
    return {
      peak_value: values[peakIndex],
      final_value: values[values.length - 1],
      decreasing_steps: 0,
      total_post_peak_steps: 0,
      score: 0,
      pass: false,
    };
  }

  let decreasing = 0;
  for (let i = peakIndex; i < values.length - 1; i++) {
    if (values[i + 1] < values[i]) {
      decreasing++;
    }
  }

  const score = decreasing / totalSteps;

  return {
    peak_value: values[peakIndex],
    final_value: values[values.length - 1],
    decreasing_steps: decreasing,
    total_post_peak_steps: totalSteps,
    score: Math.round(score * 1000) / 1000,
    pass: score >= RESOLUTION_PASS_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Neutral result (insufficient data)
// ---------------------------------------------------------------------------

function buildNeutralResult(): TensionCurveResult {
  return {
    overall_score: 1.0,
    pass: true,
    rise_quality: {
      increasing_steps: 0,
      total_pre_peak_steps: 0,
      score: 1.0,
      pass: true,
    },
    peak_placement: {
      peak_index: 0,
      peak_value: 0,
      peak_ratio: 0,
      ideal_min: IDEAL_PEAK_MIN_RATIO,
      ideal_max: IDEAL_PEAK_MAX_RATIO,
      score: 1.0,
      pass: true,
    },
    resolution_quality: {
      peak_value: 0,
      final_value: 0,
      decreasing_steps: 0,
      total_post_peak_steps: 0,
      score: 1.0,
      pass: true,
    },
    issues: [],
  };
}
