/**
 * Candidate evaluator — aggregates five code-based sub-evaluators into a
 * single composite score for ranking NovelSeed candidates.
 *
 * Sub-evaluators (code-based, zero LLM calls):
 *   pacing_quality         — ch1 key_points ≤1, early tension ≤4
 *   character_introduction — ep1 ≤2 chars, each later chapter ≤1 new char
 *   foreshadowing_usage    — each arc has ≥1 planted + ≥1 revealed
 *   genre_alignment        — required keywords present, forbidden absent
 *   archetype_diversity    — archetype presence, pair contrast, dialogue variety
 *
 * Weights:
 *   pacing_quality         20%
 *   character_introduction 20%
 *   foreshadowing_usage    20%
 *   genre_alignment        20%
 *   archetype_diversity    20%
 */

import type { NovelSeed } from "@/lib/schema/novel";
import { evaluatePacingQuality } from "./evaluators/pacing-quality";
import { evaluateForeshadowingUsage } from "./evaluators/foreshadowing-usage";
import { evaluateGenreAlignment } from "./evaluators/genre-alignment";
import { evaluateCharacterDensity } from "@/lib/evaluators/character-density";
import { evaluateArchetypeDiversity } from "./evaluators/archetype-diversity";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Equal weight applied to each sub-evaluator */
export const EVALUATOR_WEIGHT = 0.2;

export const EVALUATOR_WEIGHTS = {
  pacing_quality: EVALUATOR_WEIGHT,
  character_introduction: EVALUATOR_WEIGHT,
  foreshadowing_usage: EVALUATOR_WEIGHT,
  genre_alignment: EVALUATOR_WEIGHT,
  archetype_diversity: EVALUATOR_WEIGHT,
} as const;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface CandidateScore {
  /** Score from pacing quality evaluator (0-1) */
  pacing_quality: number;
  /** Score from character density evaluator (0-1) */
  character_introduction: number;
  /** Score from foreshadowing usage evaluator (0-1) */
  foreshadowing_usage: number;
  /** Score from genre alignment evaluator (0-1) */
  genre_alignment: number;
  /** Score from archetype diversity evaluator (0-1) */
  archetype_diversity: number;
  /** Weighted aggregate score (0-1) */
  overall_score: number;
  /** Human-readable issues collected from all evaluators */
  issues: string[];
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Evaluate a NovelSeed candidate across all five quality dimensions.
 *
 * All sub-evaluators use code-based rules only — no LLM calls are made.
 *
 * @param seed - The NovelSeed to evaluate.
 * @returns CandidateScore with per-dimension scores and an aggregated overall score.
 */
export function evaluateCandidate(seed: NovelSeed): CandidateScore {
  const pacing = evaluatePacingQuality(seed);
  const foreshadowing = evaluateForeshadowingUsage(seed);
  const genre = evaluateGenreAlignment(seed);
  const character = evaluateCharacterDensity(seed.characters);
  const archetype = evaluateArchetypeDiversity(seed);

  const overall =
    pacing.overall_score * EVALUATOR_WEIGHTS.pacing_quality +
    character.overall_score * EVALUATOR_WEIGHTS.character_introduction +
    foreshadowing.overall_score * EVALUATOR_WEIGHTS.foreshadowing_usage +
    genre.overall_score * EVALUATOR_WEIGHTS.genre_alignment +
    archetype.overall_score * EVALUATOR_WEIGHTS.archetype_diversity;

  const issues = [
    ...pacing.issues,
    ...foreshadowing.issues,
    ...genre.issues,
    ...archetype.issues,
  ];

  return {
    pacing_quality: pacing.overall_score,
    character_introduction: character.overall_score,
    foreshadowing_usage: foreshadowing.overall_score,
    genre_alignment: genre.overall_score,
    archetype_diversity: archetype.overall_score,
    overall_score: Math.round(overall * 1000) / 1000,
    issues,
  };
}
