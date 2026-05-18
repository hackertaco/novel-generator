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
import {
  refreshForeshadowVerificationMetadata,
  type Foreshadowing,
} from "@/lib/schema/foreshadowing";

// --- Public constants (used in tests / sibling evaluators) ---

/** Minimum number of planted foreshadowings required per arc */
export const MIN_PLANTS_PER_ARC = 1;

/** Minimum number of revealed foreshadowings required per arc */
export const MIN_REVEALS_PER_ARC = 1;

/** Minimum resolved-thread ratio required by the foreshadow quality gate */
export const FORESHADOW_QUALITY_GATE_THRESHOLD = 0.9;

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
  /** Foreshadow payoff quality gate metrics for library/API consumers */
  quality_gate: ForeshadowQualityGateMetrics;
  /** Per-arc breakdown */
  arc_details: ArcForeshadowingDetail[];
  /** Per-thread verdicts used for failure accounting and reporting */
  thread_verdicts: ForeshadowThreadVerdict[];
  /** Structured verdict summary for reporting surfaces */
  verdict_summary: ForeshadowVerdictSummary;
  issues: string[];
}

export type ForeshadowThreadVerdictClassification =
  | "resolved"
  | "intentional_non_failure_closure"
  | "invalid_payoff_failure"
  | "unresolved_failure"
  | "non_terminal_failure";

export interface ForeshadowThreadVerdict {
  id: string;
  name: string;
  lifecycle: Foreshadowing["lifecycle"];
  classification: ForeshadowThreadVerdictClassification;
  counts_as_failure: boolean;
  abandonment_marker?: string;
  abandonment_reason?: string;
  message?: string;
}

export interface ForeshadowVerdictSummary {
  total_threads: number;
  resolved_threads: number;
  failure_threads: number;
  intentional_non_failure_closures: number;
  invalid_payoff_failures: number;
  unresolved_failures: number;
  non_terminal_failures: number;
}

export interface ForeshadowQualityGateMetrics {
  total_registered_items: number;
  fully_resolved_item_count: number;
  resolution_percentage: number;
  pass: boolean;
}

// --- Main evaluator ---

function parseEpisodeChapter(episodeId: string | undefined): number | null {
  if (!episodeId) return null;
  const match = /^ep_(\d+)$/.exec(episodeId);
  if (!match) return null;

  return Number.parseInt(match[1] || "0", 10);
}

function parseSceneTiming(
  sceneId: string | undefined,
): { chapter: number; scene: number } | null {
  if (!sceneId) return null;
  const match = /^scene_(\d+)_(\d+)$/.exec(sceneId);
  if (!match) return null;

  return {
    chapter: Number.parseInt(match[1] || "0", 10),
    scene: Number.parseInt(match[2] || "0", 10),
  };
}

function parseForeshadowRegistrationTiming(
  foreshadowingId: string,
): { chapter: number; scene: number } | null {
  const match = /^fs_auto_ch(\d+)_sc(\d+)_kp\d+$/.exec(foreshadowingId);
  if (!match) return null;

  return {
    chapter: Number.parseInt(match[1] || "0", 10),
    scene: Number.parseInt(match[2] || "0", 10),
  };
}

function compareOccurrenceTiming(
  left: { chapter: number; scene: number },
  right: { chapter: number; scene: number },
): number {
  if (left.chapter !== right.chapter) {
    return left.chapter - right.chapter;
  }

  return left.scene - right.scene;
}

function hasLaterStoredOriginThanKnownFirstPresentation(
  foreshadowing: Foreshadowing,
): boolean {
  const storedOriginTiming = parseSceneTiming(foreshadowing.origin?.scene_id);
  const firstPresentationTiming = parseForeshadowRegistrationTiming(foreshadowing.id);
  if (!storedOriginTiming || !firstPresentationTiming) {
    return false;
  }

  return compareOccurrenceTiming(storedOriginTiming, firstPresentationTiming) > 0;
}

function hasMatchingEarlierFirstPresentation(
  foreshadowing: Foreshadowing,
): boolean {
  if (foreshadowing.reveal_at === null) return true;
  if (!foreshadowing.origin?.episode_id || !foreshadowing.origin.scene_id) {
    return false;
  }

  const originChapter = parseEpisodeChapter(foreshadowing.origin.episode_id);
  if (originChapter === null) return false;
  if (hasLaterStoredOriginThanKnownFirstPresentation(foreshadowing)) {
    return false;
  }

  return (
    originChapter === foreshadowing.planted_at
    && foreshadowing.planted_at < foreshadowing.reveal_at
  );
}

function hasExplicitTerminalStateTracking(
  foreshadowing: Foreshadowing,
): boolean {
  return [
    "resolution",
    "lifecycle",
    "abandonment_marker",
    "abandonment_reason",
  ].some((field) => Object.prototype.hasOwnProperty.call(foreshadowing, field));
}

function buildUnmatchedPayoffIssue(
  foreshadowing: Foreshadowing,
): string | null {
  if (foreshadowing.reveal_at === null || hasMatchingEarlierFirstPresentation(foreshadowing)) {
    return null;
  }

  const storedOriginTiming = parseSceneTiming(foreshadowing.origin?.scene_id);
  const firstPresentationTiming = parseForeshadowRegistrationTiming(foreshadowing.id);

  if (
    storedOriginTiming
    && firstPresentationTiming
    && compareOccurrenceTiming(storedOriginTiming, firstPresentationTiming) > 0
  ) {
    return `복선 ${foreshadowing.name}(${foreshadowing.id}): payoff origin resolves to later occurrence ${foreshadowing.origin?.scene_id} even though an earlier qualifying first presentation exists at scene_${String(firstPresentationTiming.chapter).padStart(3, "0")}_${String(firstPresentationTiming.scene).padStart(2, "0")}.`;
  }

  return `복선 ${foreshadowing.name}(${foreshadowing.id}): payoff record has no matching earlier first-presentation registration in tracking data.`;
}

function buildOpenThreadIssue(
  normalized: Foreshadowing,
  hasExplicitTracking: boolean,
): string | null {
  const remainsOpenAtEvaluationEnd =
    normalized.reveal_at === null
    || (hasExplicitTracking && normalized.lifecycle !== "resolved");

  if (!remainsOpenAtEvaluationEnd) {
    return null;
  }

  if (normalized.reveal_at === null) {
    return `복선 ${normalized.name}(${normalized.id}): thread remains unresolved at evaluation end and has no recorded intentional-abandonment marker.`;
  }

  return `복선 ${normalized.name}(${normalized.id}): later story state never reaches a terminal resolved/intentionally_abandoned status, so the thread is treated as unresolved.`;
}

export function classifyForeshadowThreadVerdicts(
  foreshadowings: Foreshadowing[],
): ForeshadowThreadVerdict[] {
  return foreshadowings.map((foreshadowing) => {
    const normalized = refreshForeshadowVerificationMetadata({ ...foreshadowing });

    if (normalized.lifecycle === "intentionally_abandoned") {
      return {
        id: normalized.id,
        name: normalized.name,
        lifecycle: normalized.lifecycle,
        classification: "intentional_non_failure_closure",
        counts_as_failure: false,
        abandonment_marker: normalized.abandonment_marker,
        abandonment_reason: normalized.abandonment_reason,
      };
    }

    const unmatchedPayoffIssue = buildUnmatchedPayoffIssue(foreshadowing);
    if (unmatchedPayoffIssue) {
      return {
        id: normalized.id,
        name: normalized.name,
        lifecycle: normalized.lifecycle,
        classification: "invalid_payoff_failure",
        counts_as_failure: true,
        abandonment_marker: normalized.abandonment_marker,
        abandonment_reason: normalized.abandonment_reason,
        message: unmatchedPayoffIssue,
      };
    }

    const openThreadIssue = buildOpenThreadIssue(
      normalized,
      hasExplicitTerminalStateTracking(foreshadowing),
    );
    if (openThreadIssue) {
      return {
        id: normalized.id,
        name: normalized.name,
        lifecycle: normalized.lifecycle,
        classification:
          normalized.reveal_at === null
            ? "unresolved_failure"
            : "non_terminal_failure",
        counts_as_failure: true,
        abandonment_marker: normalized.abandonment_marker,
        abandonment_reason: normalized.abandonment_reason,
        message: openThreadIssue,
      };
    }

    return {
      id: normalized.id,
      name: normalized.name,
      lifecycle: normalized.lifecycle,
      classification: "resolved",
      counts_as_failure: false,
      abandonment_marker: normalized.abandonment_marker,
      abandonment_reason: normalized.abandonment_reason,
    };
  });
}

export function summarizeForeshadowThreadVerdicts(
  threadVerdicts: ForeshadowThreadVerdict[],
): ForeshadowVerdictSummary {
  return threadVerdicts.reduce<ForeshadowVerdictSummary>(
    (summary, verdict) => {
      summary.total_threads += 1;

      switch (verdict.classification) {
        case "resolved":
          summary.resolved_threads += 1;
          break;
        case "intentional_non_failure_closure":
          summary.intentional_non_failure_closures += 1;
          break;
        case "invalid_payoff_failure":
          summary.failure_threads += 1;
          summary.invalid_payoff_failures += 1;
          break;
        case "unresolved_failure":
          summary.failure_threads += 1;
          summary.unresolved_failures += 1;
          break;
        case "non_terminal_failure":
          summary.failure_threads += 1;
          summary.non_terminal_failures += 1;
          break;
      }

      return summary;
    },
    {
      total_threads: 0,
      resolved_threads: 0,
      failure_threads: 0,
      intentional_non_failure_closures: 0,
      invalid_payoff_failures: 0,
      unresolved_failures: 0,
      non_terminal_failures: 0,
    },
  );
}

export function buildForeshadowQualityGateMetrics(
  verdictSummary: ForeshadowVerdictSummary,
): ForeshadowQualityGateMetrics {
  const resolutionPercentage = verdictSummary.total_threads === 0
    ? 100
    : (verdictSummary.resolved_threads / verdictSummary.total_threads) * 100;

  return {
    total_registered_items: verdictSummary.total_threads,
    fully_resolved_item_count: verdictSummary.resolved_threads,
    resolution_percentage: Math.round(resolutionPercentage * 100) / 100,
    pass: resolutionPercentage >= FORESHADOW_QUALITY_GATE_THRESHOLD * 100,
  };
}

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
  const threadVerdicts = classifyForeshadowThreadVerdicts(foreshadowings);
  const verdictSummary = summarizeForeshadowThreadVerdicts(threadVerdicts);
  const qualityGate = buildForeshadowQualityGateMetrics(verdictSummary);
  const threadIssues = threadVerdicts.flatMap((verdict) =>
    verdict.message ? [verdict.message] : [],
  );

  // Edge case: no arcs → no data to evaluate → neutral pass
  if (arcs.length === 0) {
    return {
      overall_score: 1.0,
      pass: verdictSummary.failure_threads === 0,
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
      quality_gate: qualityGate,
      arc_details: [],
      thread_verdicts: threadVerdicts,
      verdict_summary: verdictSummary,
      issues: threadIssues,
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
  issues.push(...threadIssues);

  return {
    overall_score: Math.round(overallScore * 1000) / 1000,
    pass:
      plantResult.pass
      && revealResult.pass
      && verdictSummary.failure_threads === 0,
    plant_coverage: plantResult,
    reveal_coverage: revealResult,
    quality_gate: qualityGate,
    arc_details: arcDetails,
    thread_verdicts: threadVerdicts,
    verdict_summary: verdictSummary,
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
      hasMatchingEarlierFirstPresentation(fs) &&
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
