import type { GenreConventionFallback } from "@/lib/sim";

export interface MustUnderstandCoverageReport {
  covered: string[];
  missing: string[];
}

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

function isItemCovered(text: string, item: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (normalized.includes(item.trim())) return true;
  const tokens = extractCoreTokens(item);
  if (tokens.length === 0) return normalized.includes(item.trim());
  return tokens.every((token) => isTokenInText(normalized, token));
}

export function verifyMustUnderstandCoverage(
  text: string,
  items: ReadonlyArray<string>,
): MustUnderstandCoverageReport {
  const covered: string[] = [];
  const missing: string[] = [];

  for (const item of items) {
    if (isItemCovered(text, item)) {
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
): MustUnderstandFallbackResult {
  const applied: MustUnderstandFallbackInput[] = [];
  const skipped: MustUnderstandFallbackInput[] = [];
  let currentText = text;

  for (const fallback of fallbacks) {
    if (isItemCovered(currentText, fallback.item)) {
      skipped.push(fallback);
      continue;
    }
    if (isItemCovered(currentText, fallback.line)) {
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
  const coverage = verifyMustUnderstandCoverage(input.text, input.mustUnderstand);
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
  );

  const finalCoverage = verifyMustUnderstandCoverage(text, input.mustUnderstand);
  return {
    text,
    coverage: finalCoverage,
    applied,
    residualMissing: finalCoverage.missing,
  };
}
