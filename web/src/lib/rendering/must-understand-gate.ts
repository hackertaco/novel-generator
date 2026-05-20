import type { GenreConventionFallback } from "@/lib/sim";

export interface MustUnderstandCoverageReport {
  covered: string[];
  missing: string[];
}

export interface MustUnderstandCoverageOptions {
  /**
   * Strong identifier tokens (e.g. character names) — if any of these
   * appear anywhere in the text, the item is considered cover-eligible
   * via a partial match path. Korean prose drops the subject after
   * introducing it, so requiring every occurrence is too strict.
   */
  identifierTokens?: ReadonlyArray<string>;
  /**
   * Minimum ratio of non-identifier tokens that must match for an item
   * to be considered covered. Defaults to 0.6.
   */
  matchRatio?: number;
}

const DEFAULT_MATCH_RATIO = 0.5;

export interface MustUnderstandFallbackInput {
  item: string;
  line: string;
}

export interface MustUnderstandFallbackResult {
  text: string;
  applied: MustUnderstandFallbackInput[];
  skipped: MustUnderstandFallbackInput[];
}

const TRAILING_PARTICLES = /[은는이가을를의에로와과도까지부터마저조차야아요]\s*$/;
const INTERNAL_PARTICLE_BREAK = /[은는이가을를의에로와과도]\s+/g;
const PUNCTUATION_BREAK = /[—:·\-\\/()\[\]『』「」"',.!?…]/g;

function extractCoreTokens(item: string): string[] {
  const cleaned = item
    .replace(INTERNAL_PARTICLE_BREAK, " ")
    .replace(PUNCTUATION_BREAK, " ");
  return cleaned
    .split(/\s+/)
    .map((token) => token.replace(TRAILING_PARTICLES, ""))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function isTokenInText(text: string, token: string): boolean {
  if (text.includes(token)) return true;
  if (token.length >= 3) {
    const prefix = token.slice(0, 2);
    if (text.includes(prefix)) return true;
  }
  return false;
}

function isIdentifierTokenInText(
  text: string,
  token: string,
  identifierSet: ReadonlySet<string>,
): boolean {
  if (!identifierSet.has(token)) return false;
  return text.includes(token);
}

function isItemCovered(
  text: string,
  item: string,
  options: MustUnderstandCoverageOptions = {},
): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized.includes(item.trim())) return true;
  const tokens = extractCoreTokens(item);
  if (tokens.length === 0) return normalized.includes(item.trim());

  const identifierSet = new Set(options.identifierTokens ?? []);
  const ratio = options.matchRatio ?? DEFAULT_MATCH_RATIO;

  const nonIdentifierTokens: string[] = [];
  let anyIdentifierPresent = false;
  let identifierTokenCount = 0;
  for (const token of tokens) {
    if (identifierSet.has(token)) {
      identifierTokenCount += 1;
      if (isIdentifierTokenInText(normalized, token, identifierSet)) {
        anyIdentifierPresent = true;
      }
    } else {
      nonIdentifierTokens.push(token);
    }
  }

  // If the item has identifier tokens but none appear anywhere in the
  // chapter prose, the chapter never names the subject — treat as missing.
  if (identifierTokenCount > 0 && !anyIdentifierPresent) {
    return false;
  }

  if (nonIdentifierTokens.length === 0) {
    // All tokens are identifiers; presence of any single mention is enough.
    return anyIdentifierPresent;
  }

  const matched = nonIdentifierTokens.filter((token) =>
    isTokenInText(normalized, token),
  ).length;
  const required = Math.max(1, Math.ceil(nonIdentifierTokens.length * ratio));
  return matched >= required;
}

export function verifyMustUnderstandCoverage(
  text: string,
  items: ReadonlyArray<string>,
  options: MustUnderstandCoverageOptions = {},
): MustUnderstandCoverageReport {
  const covered: string[] = [];
  const missing: string[] = [];

  for (const item of items) {
    if (isItemCovered(text, item, options)) {
      covered.push(item);
    } else {
      missing.push(item);
    }
  }

  return { covered, missing };
}

function insertAfterFirstSentence(text: string, line: string): string {
  const trimmedLine = line.trim();
  if (!trimmedLine) return text;
  const stripped = text.replace(/^\s+/, "");
  const offset = text.length - stripped.length;

  const sentenceMatch = stripped.match(/^([^\n.!?…]+[.!?…])(\s|\n|$)/);
  if (sentenceMatch) {
    const insertAt = offset + sentenceMatch[1].length;
    const before = text.slice(0, insertAt);
    const after = text.slice(insertAt);
    return `${before} ${trimmedLine}${after}`;
  }

  return `${trimmedLine}\n\n${text}`;
}

export function applyDeterministicFallback(
  text: string,
  fallbacks: ReadonlyArray<MustUnderstandFallbackInput>,
  options: MustUnderstandCoverageOptions = {},
): MustUnderstandFallbackResult {
  const applied: MustUnderstandFallbackInput[] = [];
  const skipped: MustUnderstandFallbackInput[] = [];
  let currentText = text;

  for (const fallback of fallbacks) {
    if (isItemCovered(currentText, fallback.item, options)) {
      skipped.push(fallback);
      continue;
    }
    if (isItemCovered(currentText, fallback.line, options)) {
      skipped.push(fallback);
      continue;
    }
    currentText = insertAfterFirstSentence(currentText, fallback.line);
    applied.push(fallback);
  }

  return { text: currentText, applied, skipped };
}

export interface EnforceMustUnderstandInput {
  text: string;
  mustUnderstand: ReadonlyArray<string>;
  fallbacks: ReadonlyArray<GenreConventionFallback>;
  identifierTokens?: ReadonlyArray<string>;
  matchRatio?: number;
}

export interface EnforceMustUnderstandResult {
  text: string;
  coverage: MustUnderstandCoverageReport;
  applied: MustUnderstandFallbackInput[];
  residualMissing: string[];
}

export function enforceMustUnderstandCoverage(
  input: EnforceMustUnderstandInput,
): EnforceMustUnderstandResult {
  const options: MustUnderstandCoverageOptions = {
    identifierTokens: input.identifierTokens,
    matchRatio: input.matchRatio,
  };
  const coverage = verifyMustUnderstandCoverage(input.text, input.mustUnderstand, options);
  if (coverage.missing.length === 0) {
    return {
      text: input.text,
      coverage,
      applied: [],
      residualMissing: [],
    };
  }

  const fallbacksForMissing = input.fallbacks.filter((fallback) =>
    coverage.missing.includes(fallback.item),
  );
  const { text, applied } = applyDeterministicFallback(
    input.text,
    fallbacksForMissing.map((fallback) => ({
      item: fallback.item,
      line: fallback.line,
    })),
    options,
  );

  const finalCoverage = verifyMustUnderstandCoverage(text, input.mustUnderstand, options);
  return {
    text,
    coverage: finalCoverage,
    applied,
    residualMissing: finalCoverage.missing,
  };
}
