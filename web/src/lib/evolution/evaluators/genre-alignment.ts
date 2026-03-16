/**
 * Genre alignment evaluator for the arc evolution loop.
 *
 * Operates on NovelSeed data (blueprint-level), NOT on written text.
 * Uses code-based keyword matching only — zero LLM calls.
 *
 * Sub-checks:
 *   keyword_coverage : Genre-required keywords found in seed content  (70%)
 *   genre_purity     : Absence of genre-conflicting keywords           (30%)
 *
 * Supported genres (mapped from seed.world.genre / seed.world.sub_genre):
 *   로맨스 판타지 | 현대 로맨스 | 로맨스 빙의물
 *   정통 판타지   | 현대 판타지 | 무협 | 회귀
 */

import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Minimum keyword_coverage score required to pass the check */
export const GENRE_PASS_THRESHOLD = 0.3;

/** Penalty applied to genre_purity per forbidden keyword found */
export const FORBIDDEN_KEYWORD_PENALTY = 0.25;

// ---------------------------------------------------------------------------
// Keyword maps
// ---------------------------------------------------------------------------

/**
 * Genre-required keywords — terms strongly associated with each genre.
 * A higher match ratio → higher keyword_coverage score.
 */
export const GENRE_REQUIRED_KEYWORDS: Record<string, readonly string[]> = {
  "로맨스 판타지": [
    "황제",
    "귀족",
    "공작",
    "왕국",
    "제국",
    "마법",
    "황비",
    "기사",
    "영애",
    "황실",
    "궁중",
    "로맨스",
  ],
  "현대 로맨스": [
    "재벌",
    "의사",
    "연예인",
    "회사",
    "직장",
    "대표",
    "병원",
    "아파트",
    "계약",
    "현대",
  ],
  "로맨스 빙의물": [
    "빙의",
    "환생",
    "원작",
    "악녀",
    "소설",
    "전생",
    "운명",
    "죽음",
    "각성",
  ],
  "정통 판타지": [
    "마법",
    "던전",
    "레벨",
    "스킬",
    "파티",
    "마탑",
    "용사",
    "마법사",
    "몬스터",
    "이세계",
  ],
  "현대 판타지": [
    "헌터",
    "각성",
    "게이트",
    "던전",
    "시스템",
    "S급",
    "F급",
    "등급",
    "협회",
    "현대",
  ],
  무협: [
    "무공",
    "강호",
    "문파",
    "내공",
    "검술",
    "사부",
    "무림",
    "검기",
    "정파",
    "협",
  ],
  회귀: ["회귀", "전생", "배신", "복수", "과거", "미래", "돌아"],
};

/**
 * Genre-forbidden keywords — terms that indicate the content belongs to
 * a *different* genre.  Each match reduces the genre_purity score.
 *
 * Genres that naturally overlap (e.g., 빙의물, 회귀) have empty forbidden
 * lists to avoid false positives.
 */
export const GENRE_FORBIDDEN_KEYWORDS: Record<string, readonly string[]> = {
  "로맨스 판타지": ["헌터", "게이트", "각성자", "직장", "회사원"],
  "현대 로맨스": ["마법", "황제", "왕국", "제국", "무공", "강호", "던전", "헌터"],
  "로맨스 빙의물": [], // overlaps freely with other genres
  "정통 판타지": ["헌터", "게이트", "각성자", "무공", "강호", "직장"],
  "현대 판타지": ["황제", "왕국", "제국", "무공", "강호", "문파"],
  무협: ["헌터", "게이트", "마법", "스킬", "레벨업", "회사", "직장"],
  회귀: [], // overlaps freely with other genres
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface KeywordCoverageDetail {
  /** Detected canonical genre */
  detected_genre: string;
  /** Total required keywords for that genre */
  total_required: number;
  /** How many required keywords were found in the seed content */
  matched: number;
  /** Matched keyword strings */
  matched_keywords: string[];
  /** 0-1 sub-score (matched / total_required, capped at 1) */
  score: number;
  pass: boolean;
}

export interface GenrePurityDetail {
  /** Forbidden keywords actually found in the seed content */
  found_forbidden: string[];
  /** 0-1 sub-score (1 - found_forbidden.length * penalty) */
  score: number;
  pass: boolean;
}

export interface GenreAlignmentResult {
  /** Weighted overall score 0-1 */
  overall_score: number;
  pass: boolean;
  keyword_coverage: KeywordCoverageDetail;
  genre_purity: GenrePurityDetail;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate genre alignment of a NovelSeed using code-based keyword matching.
 *
 * @param seed - The NovelSeed to evaluate.
 * @returns GenreAlignmentResult with sub-scores and issue descriptions.
 */
export function evaluateGenreAlignment(seed: NovelSeed): GenreAlignmentResult {
  const detectedGenre = detectGenreFromSeed(seed);
  const seedText = extractSeedText(seed);

  const coverageResult = checkKeywordCoverage(seedText, detectedGenre);
  const purityResult = checkGenrePurity(seedText, detectedGenre);

  const overallScore =
    coverageResult.score * 0.7 + purityResult.score * 0.3;

  const issues: string[] = [];
  if (!coverageResult.pass) {
    issues.push(
      `장르 "${detectedGenre}" 키워드 ${coverageResult.matched}/${coverageResult.total_required}개만 발견 ` +
        `(최소 ${Math.ceil(coverageResult.total_required * GENRE_PASS_THRESHOLD)}개 필요) — 장르 특성 미흡`,
    );
  }
  for (const kw of purityResult.found_forbidden) {
    issues.push(`장르 "${detectedGenre}"에 부적절한 키워드 발견: "${kw}"`);
  }

  return {
    overall_score: Math.round(overallScore * 1000) / 1000,
    pass: coverageResult.pass && purityResult.pass,
    keyword_coverage: coverageResult,
    genre_purity: purityResult,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Genre detection
// ---------------------------------------------------------------------------

/**
 * Normalise seed.world.genre (and sub_genre) to a canonical genre key
 * used in the keyword maps.
 *
 * Priority is intentional: more specific genres (빙의물, 로판) are matched
 * before generic ones (판타지, 로맨스).
 */
export function detectGenreFromSeed(seed: NovelSeed): string {
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
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Compile all textual content from the seed into a single string for
 * keyword matching.
 */
function extractSeedText(seed: NovelSeed): string {
  const parts: string[] = [];

  parts.push(seed.title);
  parts.push(seed.logline);
  parts.push(seed.world.name);
  parts.push(seed.world.genre);
  parts.push(seed.world.sub_genre);
  parts.push(seed.world.time_period);
  if (seed.world.magic_system) parts.push(seed.world.magic_system);

  for (const [key, value] of Object.entries(seed.world.key_locations)) {
    parts.push(key, value);
  }
  for (const [key, value] of Object.entries(seed.world.factions)) {
    parts.push(key, value);
  }
  parts.push(...seed.world.rules);

  for (const arc of seed.arcs) {
    parts.push(arc.name, arc.summary);
    parts.push(...arc.key_events);
  }

  for (const ch of seed.chapter_outlines) {
    parts.push(ch.title, ch.one_liner);
    parts.push(...ch.key_points);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Sub-checks
// ---------------------------------------------------------------------------

/**
 * Check how many genre-required keywords appear in the compiled seed text.
 *
 * Score = matched / total_required, capped at 1.0.
 * Pass = score >= GENRE_PASS_THRESHOLD.
 *
 * If the genre is unknown / has no keyword list, returns pass=true score=1.0
 * (no data = no penalty).
 */
function checkKeywordCoverage(
  text: string,
  genre: string,
): KeywordCoverageDetail {
  const requiredKeywords = GENRE_REQUIRED_KEYWORDS[genre] ?? [];

  if (requiredKeywords.length === 0) {
    return {
      detected_genre: genre,
      total_required: 0,
      matched: 0,
      matched_keywords: [],
      score: 1.0,
      pass: true,
    };
  }

  const matchedKeywords: string[] = [];
  for (const kw of requiredKeywords) {
    if (text.includes(kw)) {
      matchedKeywords.push(kw);
    }
  }

  const matched = matchedKeywords.length;
  const total = requiredKeywords.length;
  const score = Math.min(1.0, matched / total);
  const pass = score >= GENRE_PASS_THRESHOLD;

  return {
    detected_genre: genre,
    total_required: total,
    matched,
    matched_keywords: matchedKeywords,
    score: Math.round(score * 1000) / 1000,
    pass,
  };
}

/**
 * Check that no genre-forbidden keywords appear in the compiled seed text.
 *
 * Score = max(0, 1.0 - found_forbidden.length * FORBIDDEN_KEYWORD_PENALTY).
 * Pass = no forbidden keywords found.
 */
function checkGenrePurity(text: string, genre: string): GenrePurityDetail {
  const forbiddenKeywords = GENRE_FORBIDDEN_KEYWORDS[genre] ?? [];

  const foundForbidden: string[] = [];
  for (const kw of forbiddenKeywords) {
    if (text.includes(kw)) {
      foundForbidden.push(kw);
    }
  }

  const score = Math.max(
    0,
    1.0 - foundForbidden.length * FORBIDDEN_KEYWORD_PENALTY,
  );

  return {
    found_forbidden: foundForbidden,
    score: Math.round(score * 1000) / 1000,
    pass: foundForbidden.length === 0,
  };
}
