/**
 * Scene Specificity Evaluator
 *
 * Checks that blueprint scene purposes are concrete enough
 * to guide the scene writer effectively.
 *
 * Evaluates:
 * - Purpose length (short = vague)
 * - Presence of character names or actions (not just topics)
 * - Absence of generic filler phrases
 */

import type { ChapterBlueprint } from "@/lib/schema/planning";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface SceneSpecificityResult {
  overall_score: number; // 0-1
  pass: boolean;
  issues: string[];
  details: {
    avgPurposeLength: number;
    shortPurposeCount: number;
    genericPurposeCount: number;
    totalScenes: number;
  };
}

// ---------------------------------------------------------------------------
// Generic purpose patterns (too vague to guide writing)
// ---------------------------------------------------------------------------

const GENERIC_PURPOSE_PATTERNS = [
  /^동료와의\s/,        // "동료와의 전략 논의" — who? what strategy?
  /^주인공이\s.*느낀다$/,  // "주인공이 위기를 느낀다" — how?
  /^주인공이\s.*깨닫는다$/, // "주인공이 진실을 깨닫는다" — what truth?
  /클리프행어/,          // "클리프행어 - ..." — describe the actual event
  /예상치 못한.*등장/,    // "예상치 못한 존재의 등장" — who appears?
  /전략\s*논의/,         // "전략 논의" — what's decided?
  /결심을\s*굳히/,       // "결심을 굳힌다" — what decision?
  /위기에\s*처한/,       // "위기에 처한다" — what crisis?
  /비밀을\s*알게/,       // "비밀을 알게 된다" — what secret?
  /갈등이\s*시작/,       // "갈등이 시작된다" — what conflict?
  /관계가\s*변/,         // "관계가 변한다" — how?
  /^.*의\s*등장$/,       // "XXX의 등장" — and then what?
  /^.*과의\s*대화$/,     // "XXX과의 대화" — about what?
  /^.*과의\s*만남$/,     // "XXX과의 만남" — and what happens?
];

const MIN_PURPOSE_LENGTH = 20; // Characters; below this is certainly too vague
const GOOD_PURPOSE_LENGTH = 40; // Ideal minimum for a concrete purpose

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate scene specificity across all blueprints.
 */
export function evaluateSceneSpecificity(
  blueprints: ChapterBlueprint[],
): SceneSpecificityResult {
  const issues: string[] = [];
  let totalScenes = 0;
  let shortPurposeCount = 0;
  let genericPurposeCount = 0;
  let totalPurposeLength = 0;

  for (const bp of blueprints) {
    for (const scene of bp.scenes) {
      totalScenes++;
      const purposeLen = scene.purpose.length;
      totalPurposeLength += purposeLen;

      // Too short
      if (purposeLen < MIN_PURPOSE_LENGTH) {
        shortPurposeCount++;
        issues.push(
          `${bp.chapter_number}화 씬 "${scene.purpose.slice(0, 20)}..." — purpose가 너무 짧음 (${purposeLen}자). "누가 무엇을 하고 어떤 변화가 생기는지" 구체적으로 쓰세요.`,
        );
      }

      // Generic pattern match
      const isGeneric = GENERIC_PURPOSE_PATTERNS.some((p) => p.test(scene.purpose));
      if (isGeneric) {
        genericPurposeCount++;
        issues.push(
          `${bp.chapter_number}화 씬 "${scene.purpose.slice(0, 30)}..." — 모호한 purpose. 구체적 인물명, 대사 내용, 사건 결과를 포함하세요.`,
        );
      }
    }
  }

  if (totalScenes === 0) {
    return {
      overall_score: 0.5,
      pass: true,
      issues: [],
      details: { avgPurposeLength: 0, shortPurposeCount: 0, genericPurposeCount: 0, totalScenes: 0 },
    };
  }

  const avgPurposeLength = totalPurposeLength / totalScenes;

  // Scoring
  // Length score: 0 at MIN_PURPOSE_LENGTH, 1 at GOOD_PURPOSE_LENGTH+
  const lengthScore = Math.min(1, Math.max(0, (avgPurposeLength - MIN_PURPOSE_LENGTH) / (GOOD_PURPOSE_LENGTH - MIN_PURPOSE_LENGTH)));

  // Specificity score: penalize generic purposes
  const genericRatio = genericPurposeCount / totalScenes;
  const specificityScore = Math.max(0, 1 - genericRatio * 2); // 50% generic → score 0

  // Short purpose penalty
  const shortRatio = shortPurposeCount / totalScenes;
  const shortPenalty = Math.max(0, 1 - shortRatio * 3); // 33% short → score 0

  const overall_score = Math.round(
    (lengthScore * 0.3 + specificityScore * 0.4 + shortPenalty * 0.3) * 1000,
  ) / 1000;

  const pass = overall_score >= 0.5 && shortPurposeCount <= totalScenes * 0.3;

  return {
    overall_score,
    pass,
    issues,
    details: { avgPurposeLength: Math.round(avgPurposeLength), shortPurposeCount, genericPurposeCount, totalScenes },
  };
}
