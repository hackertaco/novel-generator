/**
 * BlueprintEvaluator — aggregates all code-based evaluators for a NovelSeed
 * (L3 Blueprint) and returns a single EvaluationResult.
 *
 * Sub-evaluators (all code-based, zero LLM calls):
 *   1. pacing_quality        — 초반 페이싱 (1화 key_points, 1~3화 tension)
 *   2. character_introduction — 캐릭터 밀도 (1화 ≤2명, 화당 신규 ≤1명)
 *   3. foreshadowing_usage   — 복선 심기/회수 (아크당 ≥1 plant, ≥1 reveal)
 *   4. genre_alignment       — 장르 키워드 적합성 (coverage + purity)
 *
 * Score weights (equal distribution):
 *   pacing_quality          25%
 *   character_introduction  25%
 *   foreshadowing_usage     25%
 *   genre_alignment         25%
 */

import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterBlueprint } from "@/lib/schema/planning";
import { evaluatePacingQuality } from "@/lib/evolution/evaluators/pacing-quality";
import type { PacingQualityResult } from "@/lib/evolution/evaluators/pacing-quality";
import {
  evaluateCharacterDensity,
} from "@/lib/evaluators/character-density";
import type { CharacterDensityResult } from "@/lib/evaluators/character-density";
import { evaluateForeshadowingUsage } from "@/lib/evolution/evaluators/foreshadowing-usage";
import type { ForeshadowingUsageResult } from "@/lib/evolution/evaluators/foreshadowing-usage";
import { evaluateGenreAlignment } from "@/lib/evolution/evaluators/genre-alignment";
import type { GenreAlignmentResult } from "@/lib/evolution/evaluators/genre-alignment";
import { evaluateSceneSpecificity } from "@/lib/evolution/evaluators/scene-specificity";
import type { SceneSpecificityResult } from "@/lib/evolution/evaluators/scene-specificity";

// ---------------------------------------------------------------------------
// Score weight constants (exported for tests)
// ---------------------------------------------------------------------------

export const WEIGHT_PACING_QUALITY = 0.2;
export const WEIGHT_CHARACTER_INTRODUCTION = 0.2;
export const WEIGHT_FORESHADOWING_USAGE = 0.2;
export const WEIGHT_GENRE_ALIGNMENT = 0.2;
export const WEIGHT_SCENE_SPECIFICITY = 0.2;

// ---------------------------------------------------------------------------
// EvaluationResult schema
// ---------------------------------------------------------------------------

/**
 * Aggregated evaluation result for a single NovelSeed candidate.
 *
 * `total_score` is the weighted average of all four sub-scores in [0, 1].
 * `pass` is true only if all four sub-evaluators pass.
 */
export interface EvaluationResult {
  /**
   * Weighted overall score across all five dimensions.
   * Range: [0, 1], rounded to 3 decimal places.
   */
  total_score: number;

  /**
   * True only when all five sub-evaluators pass their criteria.
   */
  pass: boolean;

  /** Sub-scores by dimension */
  pacing_quality: PacingQualityResult;
  character_introduction: CharacterDensityResult;
  foreshadowing_usage: ForeshadowingUsageResult;
  genre_alignment: GenreAlignmentResult;
  scene_specificity: SceneSpecificityResult;

  /**
   * Aggregated issue strings from all sub-evaluators.
   * Empty array when all checks pass.
   */
  issues: string[];
}

// ---------------------------------------------------------------------------
// BlueprintEvaluator class
// ---------------------------------------------------------------------------

/**
 * Stateless evaluator that scores a NovelSeed (L3 Blueprint candidate) using
 * four code-based sub-evaluators.
 *
 * Usage:
 * ```ts
 * const evaluator = new BlueprintEvaluator();
 * const result = evaluator.evaluate(seed);
 * console.log(result.total_score); // 0-1
 * ```
 */
export class BlueprintEvaluator {
  /**
   * Evaluate a NovelSeed candidate and return an EvaluationResult.
   *
   * All four sub-evaluators run synchronously (no I/O, no LLM calls).
   *
   * @param seed - The NovelSeed to evaluate.
   * @returns EvaluationResult with sub-scores and aggregated issues.
   */
  evaluate(seed: NovelSeed, blueprints?: ChapterBlueprint[]): EvaluationResult {
    // 1. Pacing quality (from chapter_outlines)
    const pacingResult = evaluatePacingQuality(seed);

    // 2. Character introduction density (from seed.characters)
    const characterResult = evaluateCharacterDensity(seed.characters);

    // 3. Foreshadowing usage (from arcs + foreshadowing list)
    const foreshadowingResult = evaluateForeshadowingUsage(seed);

    // 4. Genre alignment (from world setting + arcs + chapter_outlines)
    const genreResult = evaluateGenreAlignment(seed);

    // 5. Scene specificity (from blueprints)
    const sceneResult = blueprints && blueprints.length > 0
      ? evaluateSceneSpecificity(blueprints)
      : { overall_score: 0.5, pass: true, issues: [], details: { avgPurposeLength: 0, shortPurposeCount: 0, genericPurposeCount: 0, totalScenes: 0 } };

    // --- Weighted total score ---
    const totalScore =
      pacingResult.overall_score * WEIGHT_PACING_QUALITY +
      characterResult.overall_score * WEIGHT_CHARACTER_INTRODUCTION +
      foreshadowingResult.overall_score * WEIGHT_FORESHADOWING_USAGE +
      genreResult.overall_score * WEIGHT_GENRE_ALIGNMENT +
      sceneResult.overall_score * WEIGHT_SCENE_SPECIFICITY;

    // --- Aggregate issues ---
    const issues: string[] = [
      ...pacingResult.issues,
      ...buildCharacterIssues(characterResult),
      ...foreshadowingResult.issues,
      ...genreResult.issues,
      ...sceneResult.issues,
    ];

    return {
      total_score: Math.round(totalScore * 1000) / 1000,
      pass:
        pacingResult.pass &&
        characterResult.ep1_character_count.pass &&
        characterResult.new_per_chapter.pass &&
        foreshadowingResult.pass &&
        genreResult.pass &&
        sceneResult.pass,
      pacing_quality: pacingResult,
      character_introduction: characterResult,
      foreshadowing_usage: foreshadowingResult,
      genre_alignment: genreResult,
      scene_specificity: sceneResult,
      issues,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert CharacterDensityResult violations into human-readable issue strings.
 * Mirrors the issue-formatting pattern used in other evaluators.
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
