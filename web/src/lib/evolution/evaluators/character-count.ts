/**
 * Character count evaluator for the arc evolution loop.
 *
 * Operates on NovelSeed characters (blueprint-level), NOT on written text.
 * Uses code-based rules only — zero LLM calls.
 *
 * Checks that the total number of distinct characters in the blueprint falls
 * within the appropriate range for the given genre and story length.
 *
 * Criteria:
 *   - count_in_range : total characters within [min_recommended, max_recommended]
 *
 * Range is determined by:
 *   1. Canonical genre (mapped from seed.world.genre / seed.world.sub_genre)
 *   2. Novel length tier (short / medium / long) derived from seed.total_chapters
 *
 * Score:
 *   - Within range            → 1.0
 *   - Below minimum by N      → max(0, 1.0 - N * BELOW_MIN_PENALTY)
 *   - Above maximum by N      → max(0, 1.0 - N * ABOVE_MAX_PENALTY)
 */

import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Penalty per character below the minimum recommended count */
export const BELOW_MIN_PENALTY = 0.2;

/** Penalty per character above the maximum recommended count */
export const ABOVE_MAX_PENALTY = 0.15;

/** Chapters threshold below which the novel is considered "short" */
export const SHORT_NOVEL_THRESHOLD = 50;

/** Chapters threshold above which the novel is considered "long" */
export const LONG_NOVEL_THRESHOLD = 150;

/** Max-scale factor applied to short novels */
export const SHORT_NOVEL_MAX_SCALE = 0.7;

/** Max-scale factor applied to long novels */
export const LONG_NOVEL_MAX_SCALE = 1.3;

// ---------------------------------------------------------------------------
// Genre character-count ranges (base, for medium-length novels)
// ---------------------------------------------------------------------------

export interface CharacterCountRange {
  min: number;
  max: number;
}

/**
 * Base character count ranges for medium-length novels (50–150 chapters).
 * Keyed by canonical genre name.
 *
 * Design rationale:
 *   - Romance genres focus on a small cast (ML + FL + 2–3 supporting)
 *   - Fantasy / action genres accommodate larger ensembles (party, guilds, factions)
 *   - 로맨스 빙의물 / 회귀 can have slightly more due to meta-narrative complexity
 */
export const GENRE_CHARACTER_RANGES: Record<string, CharacterCountRange> = {
  "로맨스 판타지": { min: 2, max: 8 },
  "현대 로맨스": { min: 2, max: 6 },
  "로맨스 빙의물": { min: 2, max: 8 },
  "정통 판타지": { min: 3, max: 12 },
  "현대 판타지": { min: 3, max: 10 },
  무협: { min: 3, max: 12 },
  회귀: { min: 2, max: 8 },
};

/** Fallback range used when the genre is not in the map */
export const DEFAULT_CHARACTER_RANGE: CharacterCountRange = { min: 2, max: 10 };

// ---------------------------------------------------------------------------
// Genre detection
// ---------------------------------------------------------------------------

/**
 * Map seed.world.genre + seed.world.sub_genre to a canonical genre key
 * used in GENRE_CHARACTER_RANGES.
 *
 * Priority order matches the genre-alignment evaluator to ensure consistency.
 */
export function detectGenreForCharacterCount(seed: NovelSeed): string {
  const combined =
    `${seed.world.genre} ${seed.world.sub_genre}`.toLowerCase();

  if (combined.includes("빙의") || combined.includes("환생"))
    return "로맨스 빙의물";
  if (combined.includes("로판") || combined.includes("로맨스 판타지"))
    return "로맨스 판타지";
  if (combined.includes("현대 로맨스") || combined.includes("현로"))
    return "현대 로맨스";
  if (combined.includes("로맨스")) return "현대 로맨스";
  if (combined.includes("정통 판타지")) return "정통 판타지";
  if (combined.includes("무협")) return "무협";
  if (combined.includes("회귀") || combined.includes("귀환")) return "회귀";
  if (combined.includes("현대 판타지") || combined.includes("헌터"))
    return "현대 판타지";
  if (combined.includes("판타지")) return "정통 판타지";
  return "현대 판타지"; // safe default
}

// ---------------------------------------------------------------------------
// Range calculation
// ---------------------------------------------------------------------------

/**
 * Compute the adjusted character count range for a given genre and
 * total chapter count.
 *
 * - Short novels (< SHORT_NOVEL_THRESHOLD): max is scaled down
 * - Long novels  (> LONG_NOVEL_THRESHOLD):  max is scaled up
 * - Medium novels: base range unchanged
 *
 * The minimum is never reduced below 2 (a story needs at least protagonist
 * and one other character).
 */
export function getAdjustedRange(
  genre: string,
  totalChapters: number,
): CharacterCountRange {
  const base = GENRE_CHARACTER_RANGES[genre] ?? DEFAULT_CHARACTER_RANGE;

  let maxScale = 1.0;
  if (totalChapters < SHORT_NOVEL_THRESHOLD) {
    maxScale = SHORT_NOVEL_MAX_SCALE;
  } else if (totalChapters > LONG_NOVEL_THRESHOLD) {
    maxScale = LONG_NOVEL_MAX_SCALE;
  }

  return {
    min: base.min,
    max: Math.max(base.min, Math.round(base.max * maxScale)),
  };
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface CharacterCountResult {
  /** Total number of characters in seed.characters */
  count: number;
  /** Minimum recommended characters for this genre + length */
  min_recommended: number;
  /** Maximum recommended characters for this genre + length */
  max_recommended: number;
  /** Canonical genre detected from the seed */
  detected_genre: string;
  /** Overall score in [0, 1] */
  overall_score: number;
  pass: boolean;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate whether the total character count in a NovelSeed's blueprint
 * falls within the appropriate range for its genre and length.
 *
 * @param seed - The NovelSeed to evaluate (uses seed.characters, seed.world,
 *               and seed.total_chapters).
 * @returns CharacterCountResult with score and issue descriptions.
 */
export function evaluateCharacterCount(seed: NovelSeed): CharacterCountResult {
  const count = seed.characters.length;
  const genre = detectGenreForCharacterCount(seed);
  const range = getAdjustedRange(genre, seed.total_chapters);

  const issues: string[] = [];
  let score: number;
  let pass: boolean;

  if (count < range.min) {
    const deficit = range.min - count;
    score = Math.max(0, 1.0 - deficit * BELOW_MIN_PENALTY);
    pass = false;
    issues.push(
      `캐릭터 수 ${count}명이 최소 권장(${range.min}명)보다 부족 — ` +
        `장르 "${genre}" 기준 최소 ${range.min}명 필요`,
    );
  } else if (count > range.max) {
    const excess = count - range.max;
    score = Math.max(0, 1.0 - excess * ABOVE_MAX_PENALTY);
    pass = false;
    issues.push(
      `캐릭터 수 ${count}명이 최대 권장(${range.max}명)을 초과 — ` +
        `장르 "${genre}" 기준 최대 ${range.max}명 권장`,
    );
  } else {
    score = 1.0;
    pass = true;
  }

  return {
    count,
    min_recommended: range.min,
    max_recommended: range.max,
    detected_genre: genre,
    overall_score: Math.round(score * 1000) / 1000,
    pass,
    issues,
  };
}
