/**
 * Curiosity Gap evaluator — measures how well text creates and manages
 * reader curiosity through questions, mystery markers, foreshadowing,
 * and resolution patterns.
 *
 * No LLM calls — pure deterministic computation.
 *
 * References:
 * - Loewenstein 1994: "The Psychology of Curiosity" — information gap theory
 * - Ely et al. 2015: "Suspense and Surprise" (JPE)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CuriosityGapDetail {
  position: number;
  type: string;
  resolved: boolean;
}

export interface CuriosityGapResult {
  /** Overall curiosity gap score (0-1) */
  score: number;
  /** Currently unresolved questions */
  openQuestions: number;
  /** Questions that were opened and later resolved */
  resolvedQuestions: number;
  /** Open questions per 1000 characters */
  gapDensity: number;
  /** Individual gap details */
  details: CuriosityGapDetail[];
}

// ---------------------------------------------------------------------------
// Question opener patterns (Korean)
// ---------------------------------------------------------------------------

interface GapPattern {
  type: string;
  regex: RegExp;
}

const GAP_PATTERNS: GapPattern[] = [
  // Direct questions: narration-level questions only (not dialogue)
  // Excludes lines starting with " (dialogue) — dialogue questions are
  // conversational, not reader-facing curiosity gaps.
  { type: "direct_question", regex: /^(?!\s*[""])([^.!?\n]*\?)/gm },
  // Mystery markers
  { type: "mystery", regex: /사실은|아무도 몰랐다|비밀이|숨기고|감추고|정체/g },
  // Incomplete information: sentences ending with "..." or "—" (narration only)
  { type: "incomplete", regex: /(?<!["""])[가-힣][.]{3}|(?<!["""])[가-힣]…/gm },
  // Foreshadowing
  { type: "foreshadowing", regex: /그때는 몰랐다|나중에야|후회할 줄|알 리 없었다/g },
  // Unfinished actions
  { type: "unfinished_action", regex: /하려던 참에|말하려는 순간|말이 끊겼다/g },
];

// ---------------------------------------------------------------------------
// Resolution detection patterns
// ---------------------------------------------------------------------------

const RESOLUTION_PATTERN = /그 이유는|알고 보니|밝혀졌다|드러났다/g;
// "사실" used as a resolution marker (start of sentence or after period)
const RESOLUTION_SASHIL = /(?:^|[.!?]\s*)사실[,\s]/gm;

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Split text into paragraphs for proximity-based resolution matching.
 */
function splitParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}

/**
 * Find all curiosity gap openers in the text and determine which are resolved.
 */
export function measureCuriosityGap(text: string): CuriosityGapResult {
  if (!text || text.trim().length === 0) {
    return { score: 0.3, openQuestions: 0, resolvedQuestions: 0, gapDensity: 0, details: [] };
  }

  const paragraphs = splitParagraphs(text);
  const details: CuriosityGapDetail[] = [];

  // Collect all gap openers with their positions
  for (const pattern of GAP_PATTERNS) {
    // Reset regex state
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      details.push({
        position: match.index,
        type: pattern.type,
        resolved: false,
      });
    }
  }

  // Sort by position
  details.sort((a, b) => a.position - b.position);

  // Deduplicate: if two gaps are within 20 chars of each other, keep only one
  const deduped: CuriosityGapDetail[] = [];
  for (const d of details) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(d.position - last.position) > 20) {
      deduped.push(d);
    }
  }
  details.length = 0;
  details.push(...deduped);

  // Find resolution markers
  const resolutionPositions: number[] = [];

  RESOLUTION_PATTERN.lastIndex = 0;
  let resMatch: RegExpExecArray | null;
  while ((resMatch = RESOLUTION_PATTERN.exec(text)) !== null) {
    resolutionPositions.push(resMatch.index);
  }

  RESOLUTION_SASHIL.lastIndex = 0;
  while ((resMatch = RESOLUTION_SASHIL.exec(text)) !== null) {
    resolutionPositions.push(resMatch.index);
  }

  resolutionPositions.sort((a, b) => a - b);

  // Determine paragraph boundaries for proximity matching
  const paraBoundaries: { start: number; end: number }[] = [];
  let offset = 0;
  for (const para of paragraphs) {
    const idx = text.indexOf(para, offset);
    if (idx >= 0) {
      paraBoundaries.push({ start: idx, end: idx + para.length });
      offset = idx + para.length;
    }
  }

  // For each gap opener, check if resolved within 5-10 paragraphs
  for (const detail of details) {
    // Find which paragraph the opener is in
    const openerParaIdx = paraBoundaries.findIndex(
      (b) => detail.position >= b.start && detail.position < b.end,
    );
    if (openerParaIdx < 0) continue;

    // Resolution window: next 5-10 paragraphs
    const windowStart = openerParaIdx + 1;
    const windowEnd = Math.min(openerParaIdx + 10, paraBoundaries.length - 1);

    if (windowStart >= paraBoundaries.length) continue;

    const windowStartPos = paraBoundaries[windowStart]?.start ?? 0;
    const windowEndPos = paraBoundaries[windowEnd]?.end ?? text.length;

    // Check if any resolution marker falls within this window
    const hasResolution = resolutionPositions.some(
      (pos) => pos >= windowStartPos && pos <= windowEndPos,
    );

    if (hasResolution) {
      detail.resolved = true;
    }
  }

  // Calculate metrics
  const openQuestions = details.filter((d) => !d.resolved).length;
  const resolvedQuestions = details.filter((d) => d.resolved).length;
  const gapDensity = text.length > 0 ? (openQuestions / text.length) * 1000 : 0;

  // Scoring
  let score: number;

  if (details.length === 0) {
    score = 0.4; // no hooks at all — slightly boring but not terrible
  } else if (openQuestions === 0) {
    // All resolved — decent but no lingering tension
    score = 0.5;
  } else if (openQuestions === 1) {
    score = 0.7;
  } else if (openQuestions >= 2 && openQuestions <= 5) {
    score = 1.0; // sweet spot — enough threads to keep reading
  } else if (openQuestions >= 6 && openQuestions <= 8) {
    score = 0.7; // getting crowded but manageable
  } else {
    score = 0.5; // 9+ = confusing but not a dealbreaker
  }

  // Bonus for resolved questions: +0.1 per resolution, capped at +0.3
  const resolutionBonus = Math.min(resolvedQuestions * 0.1, 0.3);
  score = Math.min(1.0, score + resolutionBonus);

  return {
    score: Math.round(score * 100) / 100,
    openQuestions,
    resolvedQuestions,
    gapDensity: Math.round(gapDensity * 100) / 100,
    details,
  };
}
