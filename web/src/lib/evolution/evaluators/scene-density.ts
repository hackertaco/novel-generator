/**
 * Scene density evaluator for the arc evolution loop.
 *
 * Operates on NovelSeed chapter_outlines (blueprint-level).
 * Uses key_points count as a proxy for scenes per chapter.
 *
 * Criteria:
 *   Each chapter should have between MIN_SCENES_PER_CHAPTER and
 *   MAX_SCENES_PER_CHAPTER key_points (scenes):
 *   - too_few  (< MIN): chapter feels under-developed / empty
 *   - too_many (> MAX): chapter feels overpacked / rushed
 *
 * Score:
 *   proportion of chapters whose scene count is within the optimal range
 *   [MIN_SCENES_PER_CHAPTER, MAX_SCENES_PER_CHAPTER]
 *
 *   overall_score = in_range_chapters / total_chapters  ∈ [0, 1]
 *   pass          = all chapters are in range
 */

import type { NovelSeed } from "@/lib/schema/novel";

// --- Public constants (used in tests) ---

/** Minimum recommended scenes (key_points) per chapter */
export const MIN_SCENES_PER_CHAPTER = 2;

/** Maximum recommended scenes (key_points) per chapter */
export const MAX_SCENES_PER_CHAPTER = 5;

// --- Result types ---

export interface ChapterSceneDensity {
  chapter_number: number;
  /** Number of key_points treated as scene count */
  scene_count: number;
  in_range: boolean;
  /** null when in range */
  violation_type: "too_few" | "too_many" | null;
}

export interface SceneDensityResult {
  /** Proportion of chapters within the optimal scene-count range (0–1) */
  overall_score: number;
  pass: boolean;
  total_chapters: number;
  total_scenes: number;
  /** Average key_points count across all chapters */
  average_scenes_per_chapter: number;
  /** Number of chapters within the optimal range */
  in_range_count: number;
  /** Per-chapter breakdown */
  chapter_details: ChapterSceneDensity[];
  issues: string[];
}

// --- Main evaluator ---

/**
 * Evaluate the scene density of a NovelSeed's chapter outlines.
 *
 * Each chapter outline's key_points array is used as the scene count.
 *
 * @param seed - The NovelSeed to evaluate (uses seed.chapter_outlines).
 * @returns SceneDensityResult with per-chapter details and an overall score.
 */
export function evaluateSceneDensity(seed: NovelSeed): SceneDensityResult {
  const outlines = seed.chapter_outlines ?? [];

  // Edge case: no chapters → neutral pass (no data = no penalty)
  if (outlines.length === 0) {
    return {
      overall_score: 1.0,
      pass: true,
      total_chapters: 0,
      total_scenes: 0,
      average_scenes_per_chapter: 0,
      in_range_count: 0,
      chapter_details: [],
      issues: [],
    };
  }

  const chapterDetails: ChapterSceneDensity[] = outlines.map((outline) => {
    const sceneCount = outline.key_points?.length ?? 0;
    const inRange =
      sceneCount >= MIN_SCENES_PER_CHAPTER &&
      sceneCount <= MAX_SCENES_PER_CHAPTER;

    let violationType: "too_few" | "too_many" | null = null;
    if (sceneCount < MIN_SCENES_PER_CHAPTER) {
      violationType = "too_few";
    } else if (sceneCount > MAX_SCENES_PER_CHAPTER) {
      violationType = "too_many";
    }

    return {
      chapter_number: outline.chapter_number,
      scene_count: sceneCount,
      in_range: inRange,
      violation_type: violationType,
    };
  });

  const totalScenes = chapterDetails.reduce((sum, d) => sum + d.scene_count, 0);
  const inRangeCount = chapterDetails.filter((d) => d.in_range).length;
  const avgScenes = totalScenes / outlines.length;
  const score = inRangeCount / outlines.length;

  const issues: string[] = [];
  for (const detail of chapterDetails) {
    if (detail.violation_type === "too_few") {
      issues.push(
        `${detail.chapter_number}화 씬 ${detail.scene_count}개 (최소 ${MIN_SCENES_PER_CHAPTER}개 권장) — 씬 부족`,
      );
    } else if (detail.violation_type === "too_many") {
      issues.push(
        `${detail.chapter_number}화 씬 ${detail.scene_count}개 (최대 ${MAX_SCENES_PER_CHAPTER}개 권장) — 씬 과밀`,
      );
    }
  }

  return {
    overall_score: Math.round(score * 1000) / 1000,
    pass: inRangeCount === outlines.length,
    total_chapters: outlines.length,
    total_scenes: totalScenes,
    average_scenes_per_chapter: Math.round(avgScenes * 1000) / 1000,
    in_range_count: inRangeCount,
    chapter_details: chapterDetails,
    issues,
  };
}
