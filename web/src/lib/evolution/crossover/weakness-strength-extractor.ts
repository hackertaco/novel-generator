/**
 * Weakness–Strength Extractor for the arc evolution crossover step.
 *
 * Given ranked EvaluationResult objects for the top-2 candidates, extracts:
 *   - weaknesses : dimensions where the 1st-place candidate scored LOW
 *                  (score < WEAKNESS_THRESHOLD)
 *   - strengths  : dimensions where the 2nd-place candidate scored HIGH
 *                  (score >= STRENGTH_THRESHOLD)
 *
 * This information is used to guide the crossover LLM prompt so that the
 * offspring inherits the best traits of both parents while correcting the
 * 1st-place candidate's deficiencies.
 */

import type { EvaluationResult } from "@/lib/evolution/blueprint-evaluator";
import type { CharacterDensityResult } from "@/lib/evaluators/character-density";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Score below this value is considered a weakness of the 1st-place candidate */
export const WEAKNESS_THRESHOLD = 0.6;

/** Score at or above this value is considered a strength of the 2nd-place candidate */
export const STRENGTH_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canonical identifiers for the four evaluation dimensions */
export type EvalDimension =
  | "pacing_quality"
  | "character_introduction"
  | "foreshadowing_usage"
  | "genre_alignment";

/** All four dimensions in a fixed order (used for iteration) */
export const ALL_DIMENSIONS: readonly EvalDimension[] = [
  "pacing_quality",
  "character_introduction",
  "foreshadowing_usage",
  "genre_alignment",
] as const;

/**
 * Normalised view of a single evaluation dimension:
 *   score  — the dimension's `overall_score` (0–1)
 *   issues — dimension-specific issue strings (empty when perfect)
 */
export interface DimensionScore {
  dimension: EvalDimension;
  score: number;
  issues: string[];
}

/**
 * Output of `extractWeaknessesAndStrengths`.
 *
 * weaknesses — dimensions where 1st-place scored below WEAKNESS_THRESHOLD,
 *              sorted ascending by score (worst first).
 * strengths  — dimensions where 2nd-place scored at/above STRENGTH_THRESHOLD,
 *              sorted descending by score (best first).
 */
export interface WeaknessStrengthResult {
  weaknesses: DimensionScore[];
  strengths: DimensionScore[];
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Extract weaknesses from the 1st-place candidate and strengths from the
 * 2nd-place candidate.
 *
 * @param first  - EvaluationResult of the highest-ranked candidate.
 * @param second - EvaluationResult of the second-ranked candidate.
 * @returns WeaknessStrengthResult with sorted weakness/strength arrays.
 */
export function extractWeaknessesAndStrengths(
  first: EvaluationResult,
  second: EvaluationResult,
): WeaknessStrengthResult {
  const weaknesses: DimensionScore[] = [];
  const strengths: DimensionScore[] = [];

  for (const dim of ALL_DIMENSIONS) {
    const firstDim = getDimensionScore(first, dim);
    const secondDim = getDimensionScore(second, dim);

    if (firstDim.score < WEAKNESS_THRESHOLD) {
      weaknesses.push(firstDim);
    }

    if (secondDim.score >= STRENGTH_THRESHOLD) {
      strengths.push(secondDim);
    }
  }

  // Weaknesses: worst first (ascending score)
  weaknesses.sort((a, b) => a.score - b.score);

  // Strengths: best first (descending score)
  strengths.sort((a, b) => b.score - a.score);

  return { weaknesses, strengths };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the normalised score and issues for a single dimension from an
 * EvaluationResult.
 *
 * `character_introduction` is special-cased because CharacterDensityResult
 * has no `issues` field — issues are derived from the violation arrays.
 */
function getDimensionScore(
  evalResult: EvaluationResult,
  dimension: EvalDimension,
): DimensionScore {
  switch (dimension) {
    case "pacing_quality":
      return {
        dimension,
        score: evalResult.pacing_quality.overall_score,
        issues: evalResult.pacing_quality.issues,
      };

    case "character_introduction":
      return {
        dimension,
        score: evalResult.character_introduction.overall_score,
        issues: buildCharacterIssues(evalResult.character_introduction),
      };

    case "foreshadowing_usage":
      return {
        dimension,
        score: evalResult.foreshadowing_usage.overall_score,
        issues: evalResult.foreshadowing_usage.issues,
      };

    case "genre_alignment":
      return {
        dimension,
        score: evalResult.genre_alignment.overall_score,
        issues: evalResult.genre_alignment.issues,
      };
  }
}

/**
 * Convert CharacterDensityResult sub-fields into human-readable issue strings.
 * Mirrors the helper in blueprint-evaluator.ts but is self-contained here.
 */
function buildCharacterIssues(result: CharacterDensityResult): string[] {
  const issues: string[] = [];

  if (!result.ep1_character_count.pass) {
    issues.push(
      `1화 캐릭터 ${result.ep1_character_count.count}명 (최대 ${result.ep1_character_count.limit}명 권장) — 초반 캐릭터 과밀`,
    );
  }

  for (const v of result.new_per_chapter.violations) {
    issues.push(
      `${v.chapter}화 신규 캐릭터 ${v.new_count}명 (화당 최대 ${v.limit}명 권장) — 캐릭터 등장 과밀`,
    );
  }

  return issues;
}
