/**
 * Character density evaluator — checks that characters are introduced gradually.
 *
 * Rules (code-based, no LLM):
 * - Episode 1: at most 2 characters (main character + 1 other)
 * - Each subsequent chapter: at most 1 new character introduced
 *
 * Scoring weights:
 *   ep1_character_count 40% + new_per_chapter 60%
 */

import type { Character } from "@/lib/schema/character";

export interface CharacterDensityResult {
  ep1_character_count: {
    /** Number of characters introduced in chapter 1 */
    count: number;
    /** Maximum allowed in chapter 1 */
    limit: number;
    /** 1.0 = within limit, decreases by 0.3 per extra character */
    score: number;
    pass: boolean;
  };
  new_per_chapter: {
    /** Chapters that exceed the new-character-per-chapter limit */
    violations: Array<{ chapter: number; new_count: number; limit: number }>;
    /** Total chapters checked (chapters 2+) */
    total_chapters_checked: number;
    /** 1.0 = no violations, scaled down by violation ratio */
    score: number;
    pass: boolean;
  };
  /** Weighted score: ep1(40%) + new_per_chapter(60%), range [0, 1] */
  overall_score: number;
}

export const EP1_MAX_CHARACTERS = 2;
export const MAX_NEW_PER_CHAPTER = 1;

/**
 * Evaluate character introduction density for a list of characters.
 *
 * @param characters - Array of Character objects with introduction_chapter set.
 *                     Characters without introduction_chapter default to chapter 1.
 */
export function evaluateCharacterDensity(
  characters: Pick<Character, "introduction_chapter">[],
): CharacterDensityResult {
  // Group characters by their introduction chapter
  const byChapter = new Map<number, number>();
  for (const char of characters) {
    const ch = char.introduction_chapter ?? 1;
    byChapter.set(ch, (byChapter.get(ch) ?? 0) + 1);
  }

  // --- 1. Episode 1 check ---
  const ep1Count = byChapter.get(1) ?? 0;
  // Score: full marks if within limit, -0.3 per extra character, floor 0
  const ep1Score =
    ep1Count <= EP1_MAX_CHARACTERS
      ? 1.0
      : Math.max(0, 1.0 - (ep1Count - EP1_MAX_CHARACTERS) * 0.3);
  const ep1Pass = ep1Count <= EP1_MAX_CHARACTERS;

  // --- 2. New-per-chapter check (chapters 2 and beyond) ---
  const laterChapters = [...byChapter.keys()].filter((ch) => ch > 1).sort((a, b) => a - b);
  const violations: Array<{ chapter: number; new_count: number; limit: number }> = [];

  for (const ch of laterChapters) {
    const count = byChapter.get(ch)!;
    if (count > MAX_NEW_PER_CHAPTER) {
      violations.push({ chapter: ch, new_count: count, limit: MAX_NEW_PER_CHAPTER });
    }
  }

  const totalChapters = laterChapters.length;
  // Penalty: deduct score proportional to violation ratio
  const violationRatio = totalChapters > 0 ? violations.length / totalChapters : 0;
  const newPerChapterScore = Math.max(0, 1.0 - violationRatio);
  const newPerChapterPass = violations.length === 0;

  // --- Weighted overall ---
  const overall = ep1Score * 0.4 + newPerChapterScore * 0.6;

  return {
    ep1_character_count: {
      count: ep1Count,
      limit: EP1_MAX_CHARACTERS,
      score: ep1Score,
      pass: ep1Pass,
    },
    new_per_chapter: {
      violations,
      total_chapters_checked: totalChapters,
      score: newPerChapterScore,
      pass: newPerChapterPass,
    },
    overall_score: overall,
  };
}
