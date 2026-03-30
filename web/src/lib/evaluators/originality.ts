/**
 * Originality evaluator — measures cliche avoidance and lexical freshness.
 *
 * No LLM calls — pure computation. Returns a score 0~1 combining:
 * - Cliche density (Korean web novel cliches)
 * - Banned expression penalty (top-20 worst offenders from prompt)
 * - Type-Token Ratio (lexical diversity)
 * - Opening entropy (paragraph start diversity)
 *
 * Cliche list is imported from narrative-rules.ts (single source of truth).
 */

import { KOREAN_CLICHES, NARRATIVE_RULES } from "../policy/narrative-rules";

const BANNED_EXPRESSIONS: readonly string[] = NARRATIVE_RULES.originality.bannedExpressions;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface OriginalityResult {
  /** Overall originality score 0-1 */
  score: number;
  /** Number of cliche instances found */
  clicheCount: number;
  /** Number of banned expression hits (top-20 worst, from prompt) */
  bannedCount: number;
  /** Cliches per 1000 characters */
  clicheDensity: number;
  /** Lexical diversity: unique tokens / total tokens */
  typeTokenRatio: number;
  /** Shannon entropy of paragraph opening words */
  openingEntropy: number;
  /** List of cliches actually found in the text */
  clichesFound: string[];
  /** Subset of clichesFound that are banned expressions (prompt-level ban) */
  bannedFound: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split Korean text into token-like units.
 * Splits on whitespace and further breaks common particles from stems.
 */
function tokenize(text: string): string[] {
  // Split on whitespace first
  const rawTokens = text.split(/\s+/).filter((t) => t.length > 0);

  const tokens: string[] = [];
  // Common Korean particles/endings to split off
  const particlePattern = /^(.{2,}?)(은|는|이|가|을|를|에|의|로|으로|에서|에게|한테|와|과|도|만|까지|부터|처럼|같이|보다|마저|조차|라도)$/;

  for (const raw of rawTokens) {
    const match = raw.match(particlePattern);
    if (match) {
      tokens.push(match[1]);
      tokens.push(match[2]);
    } else {
      tokens.push(raw);
    }
  }

  return tokens;
}

/**
 * Calculate Shannon entropy for a distribution of values.
 */
function shannonEntropy(values: string[]): number {
  if (values.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) || 0) + 1);
  }

  const total = values.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function measureOriginality(text: string): OriginalityResult {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      clicheCount: 0,
      bannedCount: 0,
      clicheDensity: 0,
      typeTokenRatio: 0,
      openingEntropy: 0,
      clichesFound: [],
      bannedFound: [],
    };
  }

  // --- 1. Cliche detection ---
  const clichesFound: string[] = [];
  const bannedFound: string[] = [];
  let clicheCount = 0;
  let bannedCount = 0;

  const bannedSet = new Set(BANNED_EXPRESSIONS);

  for (const cliche of KOREAN_CLICHES) {
    const regex = new RegExp(cliche.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = text.match(regex);
    if (matches) {
      clicheCount += matches.length;
      clichesFound.push(cliche);
      if (bannedSet.has(cliche)) {
        bannedCount += matches.length;
        bannedFound.push(cliche);
      }
    }
  }

  const clicheDensity = text.length > 0 ? (clicheCount / text.length) * 1000 : 0;
  // clicheAvoidance: 1.0 - min(clicheDensity * 5, 1.0)
  const clicheAvoidance = 1.0 - Math.min(clicheDensity * 5, 1.0);

  // --- 2. Type-Token Ratio ---
  const tokens = tokenize(text);
  const uniqueTokens = new Set(tokens);
  const typeTokenRatio = tokens.length > 0 ? uniqueTokens.size / tokens.length : 0;
  // Normalize TTR: 0.3 -> 0, 0.7 -> 1, linear in between
  const ttrNormalized = Math.max(0, Math.min(1, (typeTokenRatio - 0.3) / 0.4));

  // --- 3. Opening entropy ---
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const openingWords: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    // Get the first "word" — first whitespace-delimited token
    const firstWord = trimmed.split(/\s+/)[0];
    if (firstWord) {
      openingWords.push(firstWord);
    }
  }

  const openingEntropy = shannonEntropy(openingWords);
  // Normalize: max reasonable entropy for Korean paragraphs ~3.5 bits
  // With 10+ paragraphs all different, entropy ~ log2(10) ~ 3.32
  const maxEntropy = openingWords.length > 1 ? Math.log2(openingWords.length) : 1;
  const entropyNormalized = maxEntropy > 0 ? Math.min(1, openingEntropy / maxEntropy) : 0;

  // --- Combine scores ---
  // When cliche density is extreme, apply additional penalty multiplier
  const clichePenaltyMultiplier = clicheDensity > 10 ? Math.max(0.3, 1.0 - (clicheDensity - 10) / 100) : 1.0;

  // Extra penalty for banned expressions (top-20 worst offenders)
  // Each banned hit costs 0.03 — these are explicitly forbidden in the prompt
  const bannedPenalty = Math.min(0.3, bannedCount * 0.03);

  const score =
    (clicheAvoidance * 0.4 +
    ttrNormalized * 0.35 +
    entropyNormalized * 0.25) * clichePenaltyMultiplier - bannedPenalty;

  return {
    score: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000,
    clicheCount,
    bannedCount,
    clicheDensity: Math.round(clicheDensity * 1000) / 1000,
    typeTokenRatio: Math.round(typeTokenRatio * 1000) / 1000,
    openingEntropy: Math.round(openingEntropy * 1000) / 1000,
    clichesFound,
    bannedFound,
  };
}
