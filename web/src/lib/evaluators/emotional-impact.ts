/**
 * Emotional Impact evaluator — measures emotional intensity changes
 * and catharsis patterns (buildup -> peak -> release).
 *
 * No LLM calls — pure computation using the Korean emotion lexicon.
 *
 * References:
 * - Reagan 2016 (EPJ Data Science): Emotional arc shapes
 * - 고구마-사이다 밸런스 theory from Korean web novels
 */

import { EMOTION_LEXICON } from "./korean-emotion-lexicon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmotionalImpactResult {
  score: number; // 0-1
  peakIntensity: number; // max emotional intensity (0-1)
  emotionalDrop: number; // peak - baseline before peak
  empathyDensity: number; // empathy markers per 1000 chars
  catharsisComplete: boolean; // buildup -> peak -> release detected
  details: {
    peakPosition: number; // where in text (0-1 ratio)
    baselineBeforePeak: number;
    releaseAfterPeak: number;
    empathyMarkers: string[];
  };
}

// ---------------------------------------------------------------------------
// Empathy marker patterns (Korean)
// ---------------------------------------------------------------------------

const EMPATHY_MARKERS_PHYSICAL = [
  "가슴이", "눈물", "떨리", "숨이", "심장이", "목이 메", "손이 떨",
];

const EMPATHY_MARKERS_INNER = [
  "생각했다", "느꼈다", "마음이", "속으로", "하고 싶었다",
];

const EMPATHY_MARKERS_SENSORY = [
  "차가운", "따뜻한", "뜨거운", "부드러운", "거친",
];

const ALL_EMPATHY_MARKERS = [
  ...EMPATHY_MARKERS_PHYSICAL,
  ...EMPATHY_MARKERS_INNER,
  ...EMPATHY_MARKERS_SENSORY,
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute emotional intensity for a paragraph using the emotion lexicon.
 * Returns absolute valence (0-1) — we care about intensity, not direction.
 */
function computeParagraphIntensity(paragraph: string): number {
  let totalIntensity = 0;
  let matchCount = 0;

  for (const [keyword, entry] of Object.entries(EMOTION_LEXICON)) {
    if (paragraph.includes(keyword)) {
      // Use both absolute valence and arousal for intensity
      totalIntensity += (Math.abs(entry.valence) + entry.arousal) / 2;
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;

  // Average intensity, capped at 1
  return Math.min(1, totalIntensity / matchCount);
}

/**
 * Find all empathy markers in the text. Returns the list of found markers.
 */
function findEmpathyMarkers(text: string): string[] {
  const found: string[] = [];
  for (const marker of ALL_EMPATHY_MARKERS) {
    if (text.includes(marker)) {
      found.push(marker);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function measureEmotionalImpact(text: string): EmotionalImpactResult {
  const paragraphs = text.split("\n\n").filter((p) => p.trim().length > 0);

  // Edge case: very short or empty text
  if (paragraphs.length === 0) {
    return {
      score: 0,
      peakIntensity: 0,
      emotionalDrop: 0,
      empathyDensity: 0,
      catharsisComplete: false,
      details: {
        peakPosition: 0,
        baselineBeforePeak: 0,
        releaseAfterPeak: 0,
        empathyMarkers: [],
      },
    };
  }

  // --- 1. Per-paragraph emotional intensity ---
  const intensities = paragraphs.map(computeParagraphIntensity);

  // --- 2. Find peak ---
  let peakIndex = 0;
  let peakIntensity = 0;
  for (let i = 0; i < intensities.length; i++) {
    if (intensities[i] > peakIntensity) {
      peakIntensity = intensities[i];
      peakIndex = i;
    }
  }

  const peakPosition = paragraphs.length > 1
    ? peakIndex / (paragraphs.length - 1)
    : 0.5;

  // --- 3. Emotional drop (낙차) ---
  // Average of up to 3 paragraphs before peak
  const beforeStart = Math.max(0, peakIndex - 3);
  const beforeParagraphs = intensities.slice(beforeStart, peakIndex);
  const baselineBeforePeak = beforeParagraphs.length > 0
    ? beforeParagraphs.reduce((a, b) => a + b, 0) / beforeParagraphs.length
    : 0;
  const emotionalDrop = Math.max(0, peakIntensity - baselineBeforePeak);

  // --- 4. Empathy markers ---
  const empathyMarkers = findEmpathyMarkers(text);
  const empathyDensity = text.length > 0
    ? (empathyMarkers.length / text.length) * 1000
    : 0;

  // --- 5. Catharsis detection (buildup -> peak -> release) ---

  // Buildup: 3+ paragraphs of increasing intensity before peak
  let hasBuildup = false;
  if (peakIndex >= 3) {
    let increasing = 0;
    for (let i = peakIndex - 1; i >= 1 && i >= peakIndex - 5; i--) {
      if (intensities[i] > intensities[i - 1]) {
        increasing++;
      } else {
        break;
      }
    }
    hasBuildup = increasing >= 3;
  }

  // Release: intensity drops by 30%+ within 2 paragraphs after peak
  let hasRelease = false;
  let releaseAfterPeak = peakIntensity; // default: no release
  if (peakIndex < intensities.length - 1) {
    const afterEnd = Math.min(intensities.length, peakIndex + 3);
    const afterParagraphs = intensities.slice(peakIndex + 1, afterEnd);
    if (afterParagraphs.length > 0) {
      const minAfter = Math.min(...afterParagraphs);
      releaseAfterPeak = minAfter;
      // 30% drop from peak
      if (peakIntensity > 0 && (peakIntensity - minAfter) / peakIntensity >= 0.3) {
        hasRelease = true;
      }
    }
  }

  const catharsisComplete = hasBuildup && hasRelease;

  // --- 6. Scoring ---

  // emotionalDrop weight: 40% (optimal >= 0.3)
  const dropScore = Math.min(emotionalDrop / 0.3, 1);

  // empathyDensity weight: 30% (optimal: 3-8 markers per 1000 chars)
  let empathyScore: number;
  if (empathyDensity >= 3 && empathyDensity <= 8) {
    empathyScore = 1;
  } else if (empathyDensity < 3) {
    empathyScore = empathyDensity / 3;
  } else {
    // > 8: slight penalty for overuse
    empathyScore = Math.max(0.5, 1 - (empathyDensity - 8) / 16);
  }

  // catharsisComplete: 20% bonus
  const catharsisScore = catharsisComplete ? 1 : 0;

  // peakPosition: 10% (peak at 60-80% = optimal)
  let positionScore: number;
  if (peakPosition >= 0.6 && peakPosition <= 0.8) {
    positionScore = 1;
  } else if (peakPosition >= 0.4 && peakPosition < 0.6) {
    positionScore = 0.6;
  } else if (peakPosition > 0.8 && peakPosition <= 0.9) {
    positionScore = 0.7;
  } else {
    // Too early or too late
    positionScore = 0.3;
  }

  const score = Math.min(
    1,
    dropScore * 0.4 +
    empathyScore * 0.3 +
    catharsisScore * 0.2 +
    positionScore * 0.1,
  );

  return {
    score: Math.round(score * 1000) / 1000,
    peakIntensity: Math.round(peakIntensity * 1000) / 1000,
    emotionalDrop: Math.round(emotionalDrop * 1000) / 1000,
    empathyDensity: Math.round(empathyDensity * 1000) / 1000,
    catharsisComplete,
    details: {
      peakPosition: Math.round(peakPosition * 1000) / 1000,
      baselineBeforePeak: Math.round(baselineBeforePeak * 1000) / 1000,
      releaseAfterPeak: Math.round(releaseAfterPeak * 1000) / 1000,
      empathyMarkers,
    },
  };
}
