/**
 * Sentiment Arc Validator
 *
 * Validates that generated text matches the intended emotional trajectory.
 * Uses code-based heuristics (keyword density, punctuation, sentence structure)
 * to estimate arousal/valence and compare against expected ranges derived
 * from the SceneSpec `emotional_tone` string.
 */

// ---------------------------------------------------------------------------
// Tone → expected arousal / valence mapping
// ---------------------------------------------------------------------------

const TONE_MAP: Record<
  string,
  { arousal: [number, number]; valence: [number, number] }
> = {
  neutral: { arousal: [2, 5], valence: [-1, 1] },
  긴장: { arousal: [6, 9], valence: [-3, 0] },
  불안: { arousal: [5, 8], valence: [-4, -1] },
  설렘: { arousal: [5, 8], valence: [2, 5] },
  슬픔: { arousal: [2, 5], valence: [-5, -2] },
  분노: { arousal: [7, 10], valence: [-5, -2] },
  공포: { arousal: [7, 10], valence: [-5, -3] },
  희망: { arousal: [4, 7], valence: [1, 4] },
  충격: { arousal: [8, 10], valence: [-3, 3] },
  감동: { arousal: [5, 8], valence: [3, 5] },
  코믹: { arousal: [4, 7], valence: [2, 5] },
  우울: { arousal: [1, 4], valence: [-4, -1] },
  평화: { arousal: [1, 3], valence: [1, 3] },
};

// ---------------------------------------------------------------------------
// Korean emotion keyword lists
// ---------------------------------------------------------------------------

const HIGH_AROUSAL_KEYWORDS = [
  "심장",
  "뛰",
  "떨리",
  "소리쳤",
  "달려",
  "급히",
  "순간",
  "폭발",
  "비명",
  "돌진",
  "숨이 막",
  "와락",
  "벌떡",
  "놀라",
];

const LOW_AROUSAL_KEYWORDS = [
  "조용히",
  "천천히",
  "고요",
  "잔잔",
  "평온",
  "나른",
  "졸음",
  "한숨",
];

const POSITIVE_VALENCE_KEYWORDS = [
  "미소",
  "웃음",
  "기쁨",
  "행복",
  "따뜻",
  "환한",
  "설레",
  "감사",
  "사랑",
];

const NEGATIVE_VALENCE_KEYWORDS = [
  "눈물",
  "고통",
  "절망",
  "분노",
  "증오",
  "슬픔",
  "두려",
  "공포",
  "어둠",
  "비통",
];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SentimentScore {
  /** 1-10 scale: calm → excited */
  arousal: number;
  /** -5 to +5 scale: negative → positive */
  valence: number;
}

export interface SentimentValidationResult {
  passed: boolean;
  expectedArousal: [number, number];
  expectedValence: [number, number];
  actualArousal: number;
  actualValence: number;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function countKeywords(text: string, keywords: readonly string[]): number {
  let count = 0;
  for (const kw of keywords) {
    let idx = 0;
    while (true) {
      idx = text.indexOf(kw, idx);
      if (idx === -1) break;
      count++;
      idx += kw.length;
    }
  }
  return count;
}

/** Split into sentences on Korean sentence-ending punctuation. */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?。]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Core estimation functions
// ---------------------------------------------------------------------------

/**
 * Estimate arousal from text using keyword density, sentence length,
 * exclamation marks, and dialogue density.
 *
 * @returns 1-10 (calm to excited)
 */
export function estimateArousal(text: string): number {
  if (text.length === 0) return 5;

  const sentences = splitSentences(text);
  const sentenceCount = Math.max(sentences.length, 1);

  // --- keyword signal ---
  const highHits = countKeywords(text, HIGH_AROUSAL_KEYWORDS);
  const lowHits = countKeywords(text, LOW_AROUSAL_KEYWORDS);
  // normalise per 500 chars to make density comparable across lengths
  const norm = 500 / Math.max(text.length, 1);
  const keywordSignal = (highHits - lowHits) * norm; // positive = high arousal

  // --- sentence length signal (shorter → higher arousal) ---
  const avgLen =
    sentences.reduce((sum, s) => sum + s.length, 0) / sentenceCount;
  // Korean sentences averaging <20 chars are quite short / punchy
  const lenSignal = avgLen < 20 ? 2 : avgLen < 40 ? 1 : avgLen < 60 ? 0 : -1;

  // --- exclamation density ---
  const exclamations = (text.match(/!/g) ?? []).length;
  const exclSignal = Math.min(exclamations * norm, 3);

  // --- dialogue density (quoted speech tends to raise arousal) ---
  const dialogueChars = (text.match(/[""][^""]*[""]/g) ?? []).join("").length;
  const dialogueRatio = dialogueChars / Math.max(text.length, 1);
  const dialogueSignal = dialogueRatio > 0.4 ? 1.5 : dialogueRatio > 0.2 ? 0.5 : 0;

  // Combine: baseline 5 + signals
  const raw = 5 + keywordSignal * 1.2 + lenSignal + exclSignal + dialogueSignal;

  return clamp(Math.round(raw * 10) / 10, 1, 10);
}

/**
 * Estimate valence from text using positive/negative keyword balance.
 *
 * @returns -5 to +5 (negative to positive)
 */
export function estimateValence(text: string): number {
  if (text.length === 0) return 0;

  const posHits = countKeywords(text, POSITIVE_VALENCE_KEYWORDS);
  const negHits = countKeywords(text, NEGATIVE_VALENCE_KEYWORDS);
  const total = posHits + negHits;

  if (total === 0) return 0;

  // balance from -1 (all negative) to +1 (all positive)
  const balance = (posHits - negHits) / total;

  // scale to -5..+5, weighted by density so sparse signals don't overreact
  const norm = 500 / Math.max(text.length, 1);
  const density = Math.min(total * norm, 10); // cap influence
  const raw = balance * Math.min(density, 5);

  return clamp(Math.round(raw * 10) / 10, -5, 5);
}

// ---------------------------------------------------------------------------
// Fuzzy tone lookup
// ---------------------------------------------------------------------------

function lookupTone(
  emotionalTone: string,
): { arousal: [number, number]; valence: [number, number] } | null {
  // Exact match first
  if (TONE_MAP[emotionalTone]) return TONE_MAP[emotionalTone];

  // Fuzzy: check if tone string contains any known key
  for (const key of Object.keys(TONE_MAP)) {
    if (emotionalTone.includes(key)) return TONE_MAP[key];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/**
 * Validate that a scene's emotional content matches its intended tone.
 *
 * If the tone is unrecognised the validator passes by default — we only
 * flag mismatches when we have a clear expectation.
 */
export function validateSentiment(
  text: string,
  emotionalTone: string,
): SentimentValidationResult {
  const mapping = lookupTone(emotionalTone);

  const actualArousal = estimateArousal(text);
  const actualValence = estimateValence(text);

  // Unknown tone → pass with neutral ranges
  if (!mapping) {
    return {
      passed: true,
      expectedArousal: [1, 10],
      expectedValence: [-5, 5],
      actualArousal,
      actualValence,
      issues: [],
    };
  }

  const issues: string[] = [];
  const { arousal: [aLow, aHigh], valence: [vLow, vHigh] } = mapping;

  if (actualArousal < aLow) {
    issues.push(
      `arousal 너무 낮음: ${actualArousal} (기대 범위 ${aLow}-${aHigh}, 톤 "${emotionalTone}")`,
    );
  } else if (actualArousal > aHigh) {
    issues.push(
      `arousal 너무 높음: ${actualArousal} (기대 범위 ${aLow}-${aHigh}, 톤 "${emotionalTone}")`,
    );
  }

  if (actualValence < vLow) {
    issues.push(
      `valence 너무 낮음: ${actualValence} (기대 범위 ${vLow}-${vHigh}, 톤 "${emotionalTone}")`,
    );
  } else if (actualValence > vHigh) {
    issues.push(
      `valence 너무 높음: ${actualValence} (기대 범위 ${vLow}-${vHigh}, 톤 "${emotionalTone}")`,
    );
  }

  return {
    passed: issues.length === 0,
    expectedArousal: [aLow, aHigh],
    expectedValence: [vLow, vHigh],
    actualArousal,
    actualValence,
    issues,
  };
}

/**
 * Validate the sentiment arc across multiple scenes.
 *
 * Checks:
 * 1. Each individual scene matches its tone.
 * 2. No 3+ consecutive scenes with arousal within 1 point of each other
 *    (flatness check — prevents monotonous energy across an act).
 */
export function validateSentimentArc(
  sceneTexts: string[],
  sceneTones: string[],
): { passed: boolean; issues: string[] } {
  if (sceneTexts.length !== sceneTones.length) {
    return {
      passed: false,
      issues: ["sceneTexts와 sceneTones 배열 길이가 다릅니다"],
    };
  }

  const issues: string[] = [];

  // --- per-scene validation ---
  const arousalValues: number[] = [];

  for (let i = 0; i < sceneTexts.length; i++) {
    const result = validateSentiment(sceneTexts[i], sceneTones[i]);
    arousalValues.push(result.actualArousal);

    if (!result.passed) {
      for (const issue of result.issues) {
        issues.push(`씬 ${i + 1}: ${issue}`);
      }
    }
  }

  // --- flatness check: 3+ consecutive scenes within 1 point arousal ---
  if (arousalValues.length >= 3) {
    let flatStart = 0;

    for (let i = 1; i < arousalValues.length; i++) {
      const isFlat = Math.abs(arousalValues[i] - arousalValues[i - 1]) <= 1;

      if (!isFlat) {
        const runLength = i - flatStart;
        if (runLength >= 3) {
          issues.push(
            `씬 ${flatStart + 1}-${i}: arousal이 ${runLength}개 연속 씬에서 평탄 (${arousalValues
              .slice(flatStart, i)
              .join(" → ")}). 긴장감 변화가 필요합니다.`,
          );
        }
        flatStart = i;
      }
    }

    // check trailing run
    const runLength = arousalValues.length - flatStart;
    if (runLength >= 3) {
      issues.push(
        `씬 ${flatStart + 1}-${arousalValues.length}: arousal이 ${runLength}개 연속 씬에서 평탄 (${arousalValues
          .slice(flatStart)
          .join(" → ")}). 긴장감 변화가 필요합니다.`,
      );
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
