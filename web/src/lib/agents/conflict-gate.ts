/**
 * Conflict Resolution Gate
 *
 * Prevents LLM-generated stories from resolving conflicts prematurely.
 * LLMs "sanitize real-world conflicts" and "downplay narrative tension
 * in favour of nostalgia and reconciliation" (arXiv 2603.13545).
 *
 * Rules:
 * - Chapters 1-3: conflicts must NOT be resolved (setup phase)
 * - Early chapters (1-30% of total): at most partial resolution allowed
 * - Climax chapters: resolution expected
 * - Between climaxes: new tensions must be introduced
 */

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Patterns that indicate conflict resolution */
const RESOLUTION_PATTERNS_KO = [
  // Direct resolution
  "화해했다", "화해를", "용서했다", "용서를", "이해했다", "이해하게",
  "받아들였다", "받아들이기로",
  "해결되었다", "해결했다", "해결이",
  "풀렸다", "풀어졌다", "풀리게",
  "모든 것이 괜찮", "다 괜찮", "괜찮아졌다",
  "평화가 찾아", "평화로", "안정을 되찾",
  // Happy ending phrases
  "행복하게", "행복한 미소",
  "마침내 안심", "안도의 한숨",
  "모든 것이 제자리", "제자리로 돌아",
  // Reconciliation
  "다시 하나가", "마음을 열었다", "서로를 안았다",
  "오해가 풀", "오해를 풀", "진심이 통했다",
  // Premature closure
  "그렇게 끝이", "사건은 일단락", "마무리되었다",
  "결론이 났다", "결론을 내렸다",
];

/** Patterns that indicate ongoing/escalating tension */
const TENSION_PATTERNS_KO = [
  // Unresolved conflict
  "하지만", "그러나", "아직", "아직도",
  "끝나지 않", "끝이 아니", "시작에 불과",
  "알 수 없", "모른 채", "감춘 채",
  // Questions/uncertainty
  "왜?", "어째서", "무엇이", "누가",
  "의문이", "의심이", "수상한",
  // Threats
  "위험", "위기", "함정", "음모", "배신",
  "비밀", "숨기", "거짓",
  // Escalation
  "더 큰", "더욱", "악화", "심화",
  "예상치 못한", "뜻밖의",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictGateResult {
  passed: boolean;
  issues: ConflictIssue[];
  metrics: {
    resolutionScore: number;   // 0-1 (0 = no resolution, 1 = fully resolved)
    tensionScore: number;      // 0-1 (0 = no tension, 1 = high tension)
    netTension: number;        // tension - resolution (positive = good for early chapters)
  };
}

export interface ConflictIssue {
  type: "premature_resolution" | "tension_drop" | "flat_tension";
  message: string;
  severity: "warning" | "error";
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

/**
 * Count how many times the given patterns appear in the text.
 * Each pattern is counted once per non-overlapping occurrence.
 */
function countPatternMatches(text: string, patterns: string[]): number {
  let total = 0;
  for (const pattern of patterns) {
    let startIdx = 0;
    while (true) {
      const idx = text.indexOf(pattern, startIdx);
      if (idx === -1) break;
      total++;
      startIdx = idx + pattern.length;
    }
  }
  return total;
}

/**
 * Normalize a raw match count into a 0-1 score.
 *
 * Uses a density-based approach: matches per 500 characters of text,
 * then clamp to [0, 1] with a sigmoid-like curve so that a handful
 * of matches in a short paragraph still registers meaningfully.
 */
function normalizeScore(matchCount: number, textLength: number): number {
  if (textLength === 0 || matchCount === 0) return 0;
  // Density: matches per 500 chars (roughly one paragraph of Korean)
  const density = (matchCount / textLength) * 500;
  // Soft clamp via tanh — density of ~3 matches/500chars → ~0.9
  return Math.tanh(density);
}

/**
 * Analyze how much conflict resolution vs tension exists in a scene.
 */
function analyzeConflictBalance(
  text: string,
): { resolutionScore: number; tensionScore: number } {
  const resolutionHits = countPatternMatches(text, RESOLUTION_PATTERNS_KO);
  const tensionHits = countPatternMatches(text, TENSION_PATTERNS_KO);

  return {
    resolutionScore: normalizeScore(resolutionHits, text.length),
    tensionScore: normalizeScore(tensionHits, text.length),
  };
}

// ---------------------------------------------------------------------------
// Main gate
// ---------------------------------------------------------------------------

/**
 * Validate that a scene doesn't resolve conflicts prematurely.
 *
 * @param text - The scene text
 * @param chapterNumber - Current chapter number (1-based)
 * @param totalChapters - Total planned chapters
 * @param roleInArc - The chapter's role in its arc (from ChapterBlueprint)
 * @param isLastScene - Whether this is the last scene in the chapter
 */
export function validateConflictGate(
  text: string,
  chapterNumber: number,
  totalChapters: number,
  roleInArc: string,
  isLastScene: boolean,
): ConflictGateResult {
  const { resolutionScore, tensionScore } = analyzeConflictBalance(text);
  const netTension = tensionScore - resolutionScore;
  const issues: ConflictIssue[] = [];

  const role = roleInArc.toLowerCase();
  const progressRatio = totalChapters > 0 ? chapterNumber / totalChapters : 0;

  // -----------------------------------------------------------------------
  // Rule 1 — Chapters 1-3 (absolute): hard no-resolution zone
  // -----------------------------------------------------------------------
  if (chapterNumber <= 3) {
    if (resolutionScore >= 0.3) {
      issues.push({
        type: "premature_resolution",
        message:
          `챕터 ${chapterNumber}은 도입부입니다. 갈등 해소 점수(${resolutionScore.toFixed(2)})가 ` +
          `허용 상한(0.30)을 초과합니다. 갈등을 유지하거나 심화하세요.`,
        severity: "error",
      });
    }
    if (netTension <= 0) {
      issues.push({
        type: "tension_drop",
        message:
          `챕터 ${chapterNumber} 도입부에서 긴장감이 해소되고 있습니다 ` +
          `(순긴장도: ${netTension.toFixed(2)}). 독자를 끌어당길 갈등이 필요합니다.`,
        severity: "error",
      });
    }
  }

  // -----------------------------------------------------------------------
  // Rule 2 — First 30% of total chapters: limited resolution only
  // -----------------------------------------------------------------------
  else if (progressRatio <= 0.3) {
    if (resolutionScore >= 0.5) {
      issues.push({
        type: "premature_resolution",
        message:
          `초반부(${(progressRatio * 100).toFixed(0)}% 진행) 챕터에서 해소 점수(${resolutionScore.toFixed(2)})가 ` +
          `허용 상한(0.50)을 초과합니다. 갈등을 더 끌고 가세요.`,
        severity: "error",
      });
    }
    if (netTension <= 0) {
      issues.push({
        type: "tension_drop",
        message:
          `초반부인데 긴장감이 부족합니다(순긴장도: ${netTension.toFixed(2)}). 긴장을 높이세요.`,
        severity: "warning",
      });
    }
  }

  // -----------------------------------------------------------------------
  // Rule 3 — "setup" or "rising_action" role: tension must dominate
  // -----------------------------------------------------------------------
  if (role === "setup" || role === "rising_action") {
    if (resolutionScore >= 0.4) {
      issues.push({
        type: "premature_resolution",
        message:
          `역할이 "${roleInArc}"인 챕터에서 해소 점수(${resolutionScore.toFixed(2)})가 ` +
          `허용 상한(0.40)을 초과합니다. 갈등을 유지하세요.`,
        severity: "error",
      });
    }
    if (tensionScore < resolutionScore) {
      issues.push({
        type: "flat_tension",
        message:
          `"${roleInArc}" 챕터에서는 긴장(${tensionScore.toFixed(2)})이 ` +
          `해소(${resolutionScore.toFixed(2)})보다 높아야 합니다.`,
        severity: "warning",
      });
    }
  }

  // -----------------------------------------------------------------------
  // Rule 4 — "climax" role: resolution is expected, no gate
  // -----------------------------------------------------------------------
  // (no additional checks — climax chapters may resolve)

  // -----------------------------------------------------------------------
  // Rule 5 — "resolution" role: full resolution allowed
  // -----------------------------------------------------------------------
  // (no additional checks)

  // -----------------------------------------------------------------------
  // Rule 6 — Last scene of non-climax/non-resolution chapter: needs a hook
  // -----------------------------------------------------------------------
  if (isLastScene && role !== "climax" && role !== "resolution") {
    if (netTension <= 0) {
      issues.push({
        type: "tension_drop",
        message:
          `챕터 마지막 씬인데 다음 챕터로 이어질 긴장이 없습니다 ` +
          `(순긴장도: ${netTension.toFixed(2)}). 클리프행어나 미해결 질문이 필요합니다.`,
        severity: "error",
      });
    }
  }

  // -----------------------------------------------------------------------
  // Build result
  // -----------------------------------------------------------------------
  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    passed: !hasErrors,
    issues,
    metrics: {
      resolutionScore,
      tensionScore,
      netTension,
    },
  };
}
