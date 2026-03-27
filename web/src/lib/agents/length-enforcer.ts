/**
 * Deterministic length enforcer for the novel generation pipeline.
 *
 * Enforces chapter length WITHOUT cutting text mid-sentence.
 * Uses information density to decide what to trim.
 * Zero LLM calls — pure computation.
 */

import { measureInformationDensity } from "@/lib/evaluators/mathematical-checks";
import type { ChapterBlueprint } from "@/lib/schema/planning";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_TARGET_CHARS = 3500;
export const DEFAULT_TOLERANCE = 0.2;

// ---------------------------------------------------------------------------
// enforceLength
// ---------------------------------------------------------------------------

export interface EnforceLengthResult {
  text: string;
  action: "none" | "trimmed" | "scene_truncated" | "needs_expansion";
  removedParagraphs: number;
}

/**
 * Enforce chapter length by trimming low-density paragraphs.
 *
 * Algorithm (TOO LONG):
 * 1. Parse into paragraphs
 * 2. Score each paragraph using information density
 * 3. NEVER remove paragraphs containing mustRevealKeywords
 * 4. NEVER remove dialogue paragraphs (contain quotation marks)
 * 5. Remove lowest-density non-dialogue paragraphs first
 * 6. Stop when within tolerance
 *
 * For TOO SHORT: returns action "needs_expansion" (requires LLM).
 */
export function enforceLength(
  text: string,
  targetChars: number = DEFAULT_TARGET_CHARS,
  tolerance: number = DEFAULT_TOLERANCE,
  mustRevealKeywords?: string[],
): EnforceLengthResult {
  // Edge case: empty or very short text
  if (!text || text.trim().length === 0) {
    return { text: text || "", action: "none", removedParagraphs: 0 };
  }

  const maxChars = targetChars * (1 + tolerance);
  const minChars = targetChars * (1 - tolerance);

  // Already within tolerance
  if (text.length >= minChars && text.length <= maxChars) {
    return { text, action: "none", removedParagraphs: 0 };
  }

  // Too short — needs LLM expansion, we cannot fix deterministically
  if (text.length < minChars) {
    return { text, action: "needs_expansion", removedParagraphs: 0 };
  }

  // --- TOO LONG ---

  // First, try to cut at the last scene break (*** or ---) within maxChars
  const lastStarBreak = text.lastIndexOf('\n***\n', maxChars);
  const lastDashBreak = text.lastIndexOf('\n---\n', maxChars);
  const lastBreak = Math.max(lastStarBreak, lastDashBreak);
  if (lastBreak > minChars) {
    // Scene-break truncation keeps complete scenes
    return { text: text.slice(0, lastBreak).trim(), action: 'scene_truncated' as const, removedParagraphs: 0 };
  }

  // Fall through to paragraph-level trimming

  const paragraphs = text.split("\n\n").map((p) => p.trim()).filter((p) => p.length > 0);

  // If only 1 paragraph, we cannot trim without cutting mid-sentence
  if (paragraphs.length <= 1) {
    return { text, action: "none", removedParagraphs: 0 };
  }

  // Get density scores from measureInformationDensity
  const densityResult = measureInformationDensity(text);
  const { paragraphDensities } = densityResult;

  // Build scored paragraph list with removability flags
  const DIALOGUE_PATTERN = /["""\u201C\u201D]/;
  const keywords = mustRevealKeywords ?? [];

  interface ScoredParagraph {
    index: number;
    text: string;
    density: number;
    removable: boolean;
  }

  const scored: ScoredParagraph[] = paragraphs.map((para, i) => {
    const isDialogue = DIALOGUE_PATTERN.test(para);
    const containsKeyword = keywords.length > 0 && keywords.some((kw) => para.includes(kw));
    const removable = !isDialogue && !containsKeyword;

    return {
      index: i,
      text: para,
      density: paragraphDensities[i] ?? 0,
      removable,
    };
  });

  // Sort removable paragraphs by density ascending (lowest first to remove)
  const removableSorted = scored
    .filter((s) => s.removable)
    .sort((a, b) => a.density - b.density);

  // Track which paragraph indices to remove
  const toRemove = new Set<number>();
  let currentLength = text.length;

  for (const candidate of removableSorted) {
    if (currentLength <= maxChars) break;

    // Calculate how much removing this paragraph saves
    // (paragraph text + the "\n\n" separator)
    const savings = candidate.text.length + 2; // "\n\n" separator
    toRemove.add(candidate.index);
    currentLength -= savings;
  }

  if (toRemove.size === 0) {
    return { text, action: "none", removedParagraphs: 0 };
  }

  // Rebuild text without removed paragraphs
  const remaining = scored
    .filter((s) => !toRemove.has(s.index))
    .map((s) => s.text);

  const result = remaining.join("\n\n");

  return {
    text: result,
    action: "trimmed",
    removedParagraphs: toRemove.size,
  };
}

// ---------------------------------------------------------------------------
// computeSceneBudgets
// ---------------------------------------------------------------------------

export interface SceneBudget {
  sceneIndex: number;
  min: number;
  max: number;
}

/**
 * Distribute chapter target character count across scenes proportionally
 * to each scene's estimated_chars. Each scene gets min=80%, max=120% of
 * its proportional share.
 */
export function computeSceneBudgets(
  blueprint: ChapterBlueprint,
  chapterTargetChars: number = DEFAULT_TARGET_CHARS,
): SceneBudget[] {
  const scenes = blueprint.scenes;

  // Edge case: no scenes
  if (!scenes || scenes.length === 0) {
    return [];
  }

  const totalEstimated = scenes.reduce((sum, s) => sum + (s.estimated_chars || 1000), 0);

  // Edge case: totalEstimated is 0 (distribute evenly)
  if (totalEstimated === 0) {
    const evenShare = chapterTargetChars / scenes.length;
    return scenes.map((_, i) => ({
      sceneIndex: i,
      min: Math.round(evenShare * 0.8),
      max: Math.round(evenShare * 1.2),
    }));
  }

  return scenes.map((scene, i) => {
    const estimated = scene.estimated_chars || 1000;
    const share = (estimated / totalEstimated) * chapterTargetChars;
    return {
      sceneIndex: i,
      min: Math.round(share * 0.8),
      max: Math.round(share * 1.2),
    };
  });
}
