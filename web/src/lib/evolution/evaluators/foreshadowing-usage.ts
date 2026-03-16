/**
 * Foreshadowing usage evaluator for the arc evolution loop.
 *
 * Operates on NovelSeed arcs + foreshadowing list (blueprint-level).
 *
 * Criteria (per arc):
 *   - plant_coverage : 아크 챕터 범위 내에 planted_at이 걸리는 복선이 ≥ 1개
 *   - reveal_coverage: 아크 챕터 범위 내에 reveal_at이 걸리는 복선이 ≥ 1개
 *
 * Score weights:
 *   plant_coverage   50%
 *   reveal_coverage  50%
 */

import type { NovelSeed, PlotArc } from "@/lib/schema/novel";
import type { Foreshadowing } from "@/lib/schema/foreshadowing";

// --- Public constants (used in tests / sibling evaluators) ---

/** Minimum number of planted foreshadowings required per arc */
export const MIN_PLANTS_PER_ARC = 1;

/** Minimum number of revealed foreshadowings required per arc */
export const MIN_REVEALS_PER_ARC = 1;

// --- Result types ---

export interface ArcForeshadowingDetail {
  arc_id: string;
  arc_name: string;
  start_chapter: number;
  end_chapter: number;
  /** IDs of foreshadowings planted within this arc's chapter range */
  planted_ids: string[];
  /** IDs of foreshadowings revealed within this arc's chapter range */
  revealed_ids: string[];
  has_plant: boolean;
  has_reveal: boolean;
}

export interface PlantCoverageDetail {
  /** Arcs that have at least 1 planted foreshadowing */
  covered_arcs: string[];
  /** Arcs that are missing a planted foreshadowing */
  missing_arcs: string[];
  /** 0-1 sub-score: covered / total arcs */
  score: number;
  pass: boolean;
}

export interface RevealCoverageDetail {
  /** Arcs that have at least 1 revealed foreshadowing */
  covered_arcs: string[];
  /** Arcs that are missing a revealed foreshadowing */
  missing_arcs: string[];
  /** 0-1 sub-score: covered / total arcs */
  score: number;
  pass: boolean;
}

export interface ForeshadowingUsageResult {
  /** Weighted overall score 0-1 */
  overall_score: number;
  pass: boolean;
  plant_coverage: PlantCoverageDetail;
  reveal_coverage: RevealCoverageDetail;
  /** Per-arc breakdown */
  arc_details: ArcForeshadowingDetail[];
  issues: string[];
}

// --- Main evaluator ---

/**
 * Evaluate the foreshadowing usage of a NovelSeed's arcs.
 *
 * Each arc must contain at least one planted AND one revealed foreshadowing
 * within its chapter range [start_chapter, end_chapter].
 *
 * @param seed - The NovelSeed to evaluate.
 * @returns ForeshadowingUsageResult with sub-scores and issue descriptions.
 */
export function evaluateForeshadowingUsage(
  seed: NovelSeed,
): ForeshadowingUsageResult {
  const arcs = seed.arcs ?? [];
  const foreshadowings = seed.foreshadowing ?? [];

  // Edge case: no arcs → no data to evaluate → neutral pass
  if (arcs.length === 0) {
    return {
      overall_score: 1.0,
      pass: true,
      plant_coverage: {
        covered_arcs: [],
        missing_arcs: [],
        score: 1.0,
        pass: true,
      },
      reveal_coverage: {
        covered_arcs: [],
        missing_arcs: [],
        score: 1.0,
        pass: true,
      },
      arc_details: [],
      issues: [],
    };
  }

  const arcDetails = arcs.map((arc) =>
    buildArcDetail(arc, foreshadowings),
  );

  const plantResult = buildPlantCoverage(arcDetails);
  const revealResult = buildRevealCoverage(arcDetails);

  const overallScore = plantResult.score * 0.5 + revealResult.score * 0.5;

  const issues: string[] = [];
  for (const arcId of plantResult.missing_arcs) {
    const detail = arcDetails.find((d) => d.arc_id === arcId);
    const label = detail ? `${detail.arc_name}(${arcId})` : arcId;
    issues.push(
      `아크 ${label}: 복선 심기(plant) 없음 — 아크당 최소 ${MIN_PLANTS_PER_ARC}개 복선 심기 필요`,
    );
  }
  for (const arcId of revealResult.missing_arcs) {
    const detail = arcDetails.find((d) => d.arc_id === arcId);
    const label = detail ? `${detail.arc_name}(${arcId})` : arcId;
    issues.push(
      `아크 ${label}: 복선 회수(reveal) 없음 — 아크당 최소 ${MIN_REVEALS_PER_ARC}개 복선 회수 필요`,
    );
  }

  return {
    overall_score: Math.round(overallScore * 1000) / 1000,
    pass: plantResult.pass && revealResult.pass,
    plant_coverage: plantResult,
    reveal_coverage: revealResult,
    arc_details: arcDetails,
    issues,
  };
}

// --- Helpers ---

/**
 * Build foreshadowing detail for a single arc.
 */
function buildArcDetail(
  arc: PlotArc,
  foreshadowings: Foreshadowing[],
): ArcForeshadowingDetail {
  const { start_chapter, end_chapter } = arc;

  const plantedInArc = foreshadowings.filter(
    (fs) => fs.planted_at >= start_chapter && fs.planted_at <= end_chapter,
  );
  const revealedInArc = foreshadowings.filter(
    (fs) =>
      fs.reveal_at !== null &&
      fs.reveal_at >= start_chapter &&
      fs.reveal_at <= end_chapter,
  );

  return {
    arc_id: arc.id,
    arc_name: arc.name,
    start_chapter,
    end_chapter,
    planted_ids: plantedInArc.map((fs) => fs.id),
    revealed_ids: revealedInArc.map((fs) => fs.id),
    has_plant: plantedInArc.length >= MIN_PLANTS_PER_ARC,
    has_reveal: revealedInArc.length >= MIN_REVEALS_PER_ARC,
  };
}

/**
 * Compute plant coverage: fraction of arcs with ≥ 1 planted foreshadowing.
 */
function buildPlantCoverage(
  arcDetails: ArcForeshadowingDetail[],
): PlantCoverageDetail {
  const covered = arcDetails.filter((d) => d.has_plant).map((d) => d.arc_id);
  const missing = arcDetails.filter((d) => !d.has_plant).map((d) => d.arc_id);
  const score = arcDetails.length > 0 ? covered.length / arcDetails.length : 1.0;

  return {
    covered_arcs: covered,
    missing_arcs: missing,
    score: Math.round(score * 1000) / 1000,
    pass: missing.length === 0,
  };
}

/**
 * Compute reveal coverage: fraction of arcs with ≥ 1 revealed foreshadowing.
 */
function buildRevealCoverage(
  arcDetails: ArcForeshadowingDetail[],
): RevealCoverageDetail {
  const covered = arcDetails.filter((d) => d.has_reveal).map((d) => d.arc_id);
  const missing = arcDetails.filter((d) => !d.has_reveal).map((d) => d.arc_id);
  const score = arcDetails.length > 0 ? covered.length / arcDetails.length : 1.0;

  return {
    covered_arcs: covered,
    missing_arcs: missing,
    score: Math.round(score * 1000) / 1000,
    pass: missing.length === 0,
  };
}
