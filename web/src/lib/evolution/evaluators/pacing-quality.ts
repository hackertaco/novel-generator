/**
 * Pacing quality evaluator for the arc evolution loop.
 *
 * Operates on NovelSeed chapter_outlines (blueprint-level), NOT on written text.
 *
 * Criteria:
 *   - ch1_key_points : 1화의 key_points 개수 ≤ 1  (초반 정보 과잉 방지)
 *   - early_tension  : 1~3화의 tension_level ≤ 4  (점진적 긴장 상승)
 *
 * Score weights:
 *   ch1_key_points  40%
 *   early_tension   60%
 */

import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterOutline } from "@/lib/schema/novel";

// --- Public constants (used in tests / sibling evaluators) ---

/** Maximum key_points allowed for chapter 1 */
export const CH1_MAX_KEY_POINTS = 1;

/** Maximum tension_level allowed for chapters 1-3 */
export const EARLY_CHAPTER_MAX_TENSION = 4;

/** Chapters considered "early" for tension check */
export const EARLY_CHAPTER_RANGE = 3;

// --- Result types ---

export interface Ch1KeyPointsDetail {
  /** Actual number of key_points in chapter 1 */
  count: number;
  /** Maximum allowed (always CH1_MAX_KEY_POINTS) */
  max_allowed: number;
  /** 0-1 sub-score */
  score: number;
  pass: boolean;
}

export interface EarlyTensionViolation {
  chapter_number: number;
  tension_level: number;
  max_allowed: number;
}

export interface EarlyTensionDetail {
  /** Chapters 1-3 found in outlines */
  checked_chapters: number[];
  violations: EarlyTensionViolation[];
  /** 0-1 sub-score */
  score: number;
  pass: boolean;
}

export interface ActionRepeatViolation {
  chapter_a: number;
  chapter_b: number;
  shared_actions: string[];
}

export interface ActionRepeatDetail {
  violations: ActionRepeatViolation[];
  score: number;
  pass: boolean;
}

export interface PacingQualityResult {
  /** Weighted overall score 0-1 */
  overall_score: number;
  pass: boolean;
  ch1_key_points: Ch1KeyPointsDetail;
  early_tension: EarlyTensionDetail;
  action_repeat: ActionRepeatDetail;
  issues: string[];
}

// --- Main evaluator ---

/**
 * Evaluate the pacing quality of a NovelSeed's chapter outlines.
 *
 * @param seed - The NovelSeed to evaluate (uses seed.chapter_outlines).
 * @returns PacingQualityResult with sub-scores and issue descriptions.
 */
export function evaluatePacingQuality(seed: NovelSeed): PacingQualityResult {
  const outlines = seed.chapter_outlines ?? [];

  const ch1Result = checkCh1KeyPoints(outlines);
  const earlyTensionResult = checkEarlyTension(outlines);
  const actionRepeatResult = checkActionRepeat(outlines);

  const overallScore =
    ch1Result.score * 0.3 + earlyTensionResult.score * 0.4 + actionRepeatResult.score * 0.3;

  const issues: string[] = [];
  if (!ch1Result.pass) {
    issues.push(
      `1화 key_points ${ch1Result.count}개 (최대 ${CH1_MAX_KEY_POINTS}개 권장) — 초반 정보 과잉`,
    );
  }
  for (const v of earlyTensionResult.violations) {
    issues.push(
      `${v.chapter_number}화 tension ${v.tension_level} (1~3화 최대 ${EARLY_CHAPTER_MAX_TENSION} 권장) — 초반 긴장 과도`,
    );
  }
  for (const v of actionRepeatResult.violations) {
    issues.push(
      `${v.chapter_a}화→${v.chapter_b}화 행위 반복: ${v.shared_actions.join(", ")} — 연속 2화가 같은 행위`,
    );
  }

  return {
    overall_score: Math.round(overallScore * 1000) / 1000,
    pass: ch1Result.pass && earlyTensionResult.pass && actionRepeatResult.pass,
    ch1_key_points: ch1Result,
    early_tension: earlyTensionResult,
    action_repeat: actionRepeatResult,
    issues,
  };
}

// --- Sub-checks ---

/**
 * Check that chapter 1 has at most CH1_MAX_KEY_POINTS key_points.
 *
 * If chapter 1 is not found in the outlines, the check passes with a
 * neutral score of 1.0 (no data = no penalty).
 */
function checkCh1KeyPoints(outlines: ChapterOutline[]): Ch1KeyPointsDetail {
  const ch1 = outlines.find((o) => o.chapter_number === 1);

  if (!ch1) {
    return {
      count: 0,
      max_allowed: CH1_MAX_KEY_POINTS,
      score: 1.0,
      pass: true,
    };
  }

  const count = ch1.key_points?.length ?? 0;
  const pass = count <= CH1_MAX_KEY_POINTS;

  let score: number;
  if (count === 0) {
    score = 1.0; // No key_points = perfectly restrained opener
  } else if (count <= CH1_MAX_KEY_POINTS) {
    score = 1.0;
  } else {
    // Linear penalty: each excess key_point costs 0.3, floored at 0.1
    score = Math.max(0.1, 1.0 - (count - CH1_MAX_KEY_POINTS) * 0.3);
  }

  return {
    count,
    max_allowed: CH1_MAX_KEY_POINTS,
    score: Math.round(score * 1000) / 1000,
    pass,
  };
}

// ---------------------------------------------------------------------------
// Action repeat detection — consecutive chapters with same activity
// ---------------------------------------------------------------------------

/**
 * Action keywords grouped by category.
 * If two consecutive chapters share keywords from the same category,
 * it means they're doing the "same thing" twice.
 */
const ACTION_CATEGORIES: Record<string, string[]> = {
  준비: ["준비", "점검", "확인", "계획", "배치", "맞추", "외우", "정리", "검토", "대조"],
  조사: ["조사", "추적", "탐문", "수색", "탐색", "찾", "캐묻", "심문"],
  대면: ["만남", "대면", "마주", "재회", "방문", "찾아"],
  협상: ["협상", "거래", "교환", "조건", "제안", "계약", "흥정"],
  전투: ["전투", "싸움", "대결", "공격", "방어", "추격", "도주"],
  은닉: ["숨기", "은닉", "위장", "감추", "몰래"],
};

/**
 * Extract action category tags from a key_point's "what" text.
 */
function getActionTags(text: string): string[] {
  const tags: string[] = [];
  for (const [category, keywords] of Object.entries(ACTION_CATEGORIES)) {
    if (keywords.some((kw) => text.includes(kw))) {
      tags.push(category);
    }
  }
  return tags;
}

/**
 * Check that consecutive chapters don't repeat the same action category.
 * E.g., ch1="준비" and ch2="준비" → violation.
 */
function checkActionRepeat(outlines: ChapterOutline[]): ActionRepeatDetail {
  const sorted = [...outlines].sort((a, b) => a.chapter_number - b.chapter_number);
  const violations: ActionRepeatViolation[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const chA = sorted[i];
    const chB = sorted[i + 1];
    // Only check truly consecutive chapters
    if (chB.chapter_number !== chA.chapter_number + 1) continue;

    const tagsA = new Set<string>();
    const tagsB = new Set<string>();

    for (const kp of chA.key_points) {
      const text = typeof kp === "string" ? kp : kp.what;
      for (const tag of getActionTags(text)) tagsA.add(tag);
    }
    // Also check one_liner
    for (const tag of getActionTags(chA.one_liner)) tagsA.add(tag);

    for (const kp of chB.key_points) {
      const text = typeof kp === "string" ? kp : kp.what;
      for (const tag of getActionTags(text)) tagsB.add(tag);
    }
    for (const tag of getActionTags(chB.one_liner)) tagsB.add(tag);

    const shared = [...tagsA].filter((t) => tagsB.has(t));
    if (shared.length > 0) {
      violations.push({
        chapter_a: chA.chapter_number,
        chapter_b: chB.chapter_number,
        shared_actions: shared,
      });
    }
  }

  // Score: each violation costs 0.4, floored at 0.1
  const score = violations.length === 0
    ? 1.0
    : Math.max(0.1, 1.0 - violations.length * 0.4);

  return {
    violations,
    score: Math.round(score * 1000) / 1000,
    pass: violations.length === 0,
  };
}

/**
 * Check that chapters 1–EARLY_CHAPTER_RANGE have tension_level ≤ EARLY_CHAPTER_MAX_TENSION.
 *
 * Score = 1 - (violations / checked_chapters), floored at 0 if all violated.
 * If no early chapters are present in the outlines, returns pass=true score=1.0.
 */
function checkEarlyTension(outlines: ChapterOutline[]): EarlyTensionDetail {
  const earlyOutlines = outlines.filter(
    (o) => o.chapter_number >= 1 && o.chapter_number <= EARLY_CHAPTER_RANGE,
  );

  if (earlyOutlines.length === 0) {
    return {
      checked_chapters: [],
      violations: [],
      score: 1.0,
      pass: true,
    };
  }

  const violations: EarlyTensionViolation[] = [];
  for (const ch of earlyOutlines) {
    if (ch.tension_level > EARLY_CHAPTER_MAX_TENSION) {
      violations.push({
        chapter_number: ch.chapter_number,
        tension_level: ch.tension_level,
        max_allowed: EARLY_CHAPTER_MAX_TENSION,
      });
    }
  }

  const violationRatio = violations.length / earlyOutlines.length;
  const score = Math.max(0, 1.0 - violationRatio);

  return {
    checked_chapters: earlyOutlines.map((o) => o.chapter_number).sort((a, b) => a - b),
    violations,
    score: Math.round(score * 1000) / 1000,
    pass: violations.length === 0,
  };
}
