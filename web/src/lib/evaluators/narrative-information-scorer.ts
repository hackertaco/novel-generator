/**
 * Narrative Information Scorer — information-theoretic evaluation of narrative quality.
 *
 * Based on:
 * - Narrative Information Theory (arXiv:2411.12907) — entropy, JSD, pivots
 * - Syuzhet / Reagan et al. — sentiment arc shapes, Fourier analysis
 * - Fabula Entropy Indexing (arXiv:2104.07472) — coherence via entropy
 *
 * All deterministic. Zero LLM calls. Measures structural quality, not taste.
 */

import type { ChapterBlueprint } from "../schema/planning";

// ---------------------------------------------------------------------------
// Korean emotion lexicon — web-novel tuned
// ---------------------------------------------------------------------------

/**
 * Emotion categories with Korean keywords.
 * Each word maps to a valence (-1 to +1) and an arousal (0 to 1).
 *
 * Valence: negative(-) ↔ positive(+)
 * Arousal:  calm(0) ↔ intense(1)
 */
interface EmotionEntry {
  valence: number;
  arousal: number;
}

const EMOTION_LEXICON: Record<string, EmotionEntry> = {
  // --- 공포/위기 (valence: -, arousal: high) ---
  "위험": { valence: -0.8, arousal: 0.9 },
  "죽": { valence: -1.0, arousal: 1.0 },
  "피": { valence: -0.7, arousal: 0.8 },
  "비명": { valence: -0.9, arousal: 1.0 },
  "공포": { valence: -0.9, arousal: 0.9 },
  "두려": { valence: -0.8, arousal: 0.8 },
  "절망": { valence: -1.0, arousal: 0.7 },
  "고통": { valence: -0.9, arousal: 0.8 },
  "상처": { valence: -0.7, arousal: 0.6 },
  "칼": { valence: -0.6, arousal: 0.8 },
  "검": { valence: -0.5, arousal: 0.7 },
  "함정": { valence: -0.7, arousal: 0.8 },
  "추격": { valence: -0.6, arousal: 0.9 },
  "폭발": { valence: -0.7, arousal: 1.0 },
  "불안": { valence: -0.6, arousal: 0.7 },

  // --- 분노/갈등 (valence: -, arousal: high) ---
  "배신": { valence: -0.9, arousal: 0.9 },
  "분노": { valence: -0.8, arousal: 0.9 },
  "적": { valence: -0.5, arousal: 0.7 },
  "공격": { valence: -0.7, arousal: 0.9 },
  "복수": { valence: -0.6, arousal: 0.8 },
  "증오": { valence: -0.9, arousal: 0.8 },
  "저주": { valence: -0.8, arousal: 0.7 },
  "위협": { valence: -0.7, arousal: 0.8 },
  "갈등": { valence: -0.5, arousal: 0.6 },

  // --- 슬픔/상실 (valence: -, arousal: low) ---
  "슬픔": { valence: -0.8, arousal: 0.3 },
  "눈물": { valence: -0.6, arousal: 0.4 },
  "울": { valence: -0.6, arousal: 0.4 },
  "이별": { valence: -0.7, arousal: 0.3 },
  "외로": { valence: -0.6, arousal: 0.2 },
  "쓸쓸": { valence: -0.5, arousal: 0.2 },
  "그리": { valence: -0.4, arousal: 0.3 },
  "후회": { valence: -0.6, arousal: 0.4 },
  "한숨": { valence: -0.4, arousal: 0.2 },

  // --- 긴장/서스펜스 (valence: neutral-neg, arousal: medium-high) ---
  "긴장": { valence: -0.3, arousal: 0.7 },
  "조심": { valence: -0.2, arousal: 0.5 },
  "경계": { valence: -0.3, arousal: 0.6 },
  "의심": { valence: -0.4, arousal: 0.5 },
  "비밀": { valence: -0.2, arousal: 0.6 },
  "정체": { valence: -0.3, arousal: 0.6 },
  "숨기": { valence: -0.3, arousal: 0.5 },
  "감시": { valence: -0.4, arousal: 0.6 },
  "수상": { valence: -0.3, arousal: 0.5 },
  "속삭": { valence: -0.1, arousal: 0.4 },

  // --- 놀라움/반전 (valence: neutral, arousal: high) ---
  "놀라": { valence: 0.0, arousal: 0.8 },
  "충격": { valence: -0.3, arousal: 0.9 },
  "진실": { valence: 0.0, arousal: 0.7 },
  "사실은": { valence: 0.0, arousal: 0.7 },
  "알게": { valence: 0.1, arousal: 0.6 },
  "깨달": { valence: 0.2, arousal: 0.6 },
  "정말": { valence: 0.0, arousal: 0.5 },
  "설마": { valence: -0.2, arousal: 0.7 },

  // --- 희망/결의 (valence: +, arousal: medium) ---
  "결의": { valence: 0.5, arousal: 0.7 },
  "각오": { valence: 0.4, arousal: 0.6 },
  "다짐": { valence: 0.4, arousal: 0.5 },
  "희망": { valence: 0.7, arousal: 0.5 },
  "용기": { valence: 0.6, arousal: 0.6 },
  "믿": { valence: 0.5, arousal: 0.4 },
  "약속": { valence: 0.5, arousal: 0.4 },
  "지키": { valence: 0.4, arousal: 0.5 },

  // --- 안도/평화 (valence: +, arousal: low) ---
  "안도": { valence: 0.6, arousal: 0.2 },
  "평화": { valence: 0.7, arousal: 0.1 },
  "고요": { valence: 0.3, arousal: 0.1 },
  "편안": { valence: 0.6, arousal: 0.1 },
  "따뜻": { valence: 0.6, arousal: 0.2 },
  "미소": { valence: 0.5, arousal: 0.3 },
  "웃": { valence: 0.5, arousal: 0.4 },

  // --- 설렘/기대 (valence: +, arousal: medium-high) ---
  "설레": { valence: 0.7, arousal: 0.7 },
  "기대": { valence: 0.5, arousal: 0.6 },
  "흥분": { valence: 0.4, arousal: 0.8 },
  "두근": { valence: 0.5, arousal: 0.7 },

  // --- 감탄/경이 (valence: +, arousal: medium) ---
  "아름다": { valence: 0.7, arousal: 0.4 },
  "찬란": { valence: 0.7, arousal: 0.5 },
  "장엄": { valence: 0.5, arousal: 0.6 },
  "놀랍": { valence: 0.3, arousal: 0.6 },
  "경이": { valence: 0.6, arousal: 0.5 },

  // --- 간접 긴장/위기 (행동/감각으로 표현된 감정) ---
  "떨": { valence: -0.4, arousal: 0.6 },
  "멈": { valence: -0.2, arousal: 0.5 },
  "숨": { valence: -0.3, arousal: 0.5 },
  "움찔": { valence: -0.3, arousal: 0.6 },
  "얼어": { valence: -0.4, arousal: 0.5 },
  "굳": { valence: -0.3, arousal: 0.5 },
  "깨물": { valence: -0.3, arousal: 0.5 },
  "삼키": { valence: -0.2, arousal: 0.4 },
  "움켜": { valence: -0.3, arousal: 0.6 },
  "날카로": { valence: -0.4, arousal: 0.7 },
  "서늘": { valence: -0.4, arousal: 0.5 },
  "차가": { valence: -0.3, arousal: 0.4 },
  "싸늘": { valence: -0.5, arousal: 0.4 },
  "흔들": { valence: -0.3, arousal: 0.5 },
  "뒤틀": { valence: -0.5, arousal: 0.6 },
  "조여": { valence: -0.4, arousal: 0.6 },

  // --- 간접 안정/친밀 ---
  "끄덕": { valence: 0.2, arousal: 0.2 },
  "고개를": { valence: 0.0, arousal: 0.2 },
  "가만히": { valence: 0.1, arousal: 0.1 },
  "조용히": { valence: 0.1, arousal: 0.1 },
  "천천히": { valence: 0.1, arousal: 0.1 },
  "부드럽": { valence: 0.4, arousal: 0.2 },
  "살며시": { valence: 0.3, arousal: 0.2 },
  "나지막": { valence: 0.0, arousal: 0.3 },

  // --- 물리적 환경/분위기 ---
  "어둠": { valence: -0.3, arousal: 0.4 },
  "어두": { valence: -0.3, arousal: 0.4 },
  "그림자": { valence: -0.2, arousal: 0.4 },
  "횃불": { valence: -0.1, arousal: 0.3 },
  "냄새": { valence: -0.2, arousal: 0.3 },
  "소리": { valence: 0.0, arousal: 0.4 },
  "빛": { valence: 0.2, arousal: 0.3 },
  "바람": { valence: 0.0, arousal: 0.3 },
  "축축": { valence: -0.2, arousal: 0.2 },
  "녹": { valence: -0.2, arousal: 0.2 },
  "먼지": { valence: -0.1, arousal: 0.1 },

  // --- 대사 톤 마커 ---
  "낮은 목소리": { valence: -0.2, arousal: 0.5 },
  "속삭이": { valence: -0.1, arousal: 0.4 },
  "외치": { valence: -0.3, arousal: 0.9 },
  "소리치": { valence: -0.3, arousal: 0.9 },
  "중얼": { valence: -0.1, arousal: 0.2 },
  "읊": { valence: 0.1, arousal: 0.2 },
  "내뱉": { valence: -0.4, arousal: 0.7 },
  "경고": { valence: -0.5, arousal: 0.7 },

  // --- 시선/관찰 (관찰자 시점의 긴장) ---
  "눈빛": { valence: -0.1, arousal: 0.5 },
  "시선": { valence: -0.1, arousal: 0.4 },
  "응시": { valence: -0.2, arousal: 0.5 },
  "노려": { valence: -0.5, arousal: 0.7 },
  "훑": { valence: -0.2, arousal: 0.4 },
  "흘깃": { valence: -0.1, arousal: 0.3 },
  "바라보": { valence: 0.0, arousal: 0.3 },
  "지켜보": { valence: -0.1, arousal: 0.4 },

  // --- 동작/전투 ---
  "뽑": { valence: -0.3, arousal: 0.7 },
  "찔": { valence: -0.7, arousal: 0.9 },
  "베": { valence: -0.6, arousal: 0.8 },
  "막": { valence: -0.2, arousal: 0.6 },
  "피하": { valence: -0.3, arousal: 0.7 },
  "쓰러": { valence: -0.6, arousal: 0.7 },
  "무릎을 꿇": { valence: -0.5, arousal: 0.5 },
  "달려": { valence: -0.1, arousal: 0.7 },
  "쫓": { valence: -0.4, arousal: 0.8 },
  "도망": { valence: -0.5, arousal: 0.8 },
};

const LEXICON_KEYS = Object.keys(EMOTION_LEXICON);

// ---------------------------------------------------------------------------
// Core math utilities
// ---------------------------------------------------------------------------

/** Shannon entropy of a probability distribution */
function shannonEntropy(distribution: number[]): number {
  const sum = distribution.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  let entropy = 0;
  for (const p of distribution) {
    const prob = p / sum;
    if (prob > 0) {
      entropy -= prob * Math.log2(prob);
    }
  }
  return entropy;
}

/** Jensen-Shannon Divergence between two distributions (0~1) */
function jensenShannonDivergence(p: number[], q: number[]): number {
  const len = Math.max(p.length, q.length);
  const pNorm: number[] = [];
  const qNorm: number[] = [];

  let pSum = 0;
  let qSum = 0;
  for (let i = 0; i < len; i++) {
    pNorm.push(p[i] || 0);
    qNorm.push(q[i] || 0);
    pSum += pNorm[i];
    qSum += qNorm[i];
  }

  // Normalize to probability distributions
  if (pSum === 0 || qSum === 0) return 0;
  for (let i = 0; i < len; i++) {
    pNorm[i] /= pSum;
    qNorm[i] /= qSum;
  }

  // M = (P + Q) / 2
  const m = pNorm.map((pi, i) => (pi + qNorm[i]) / 2);

  // JSD = 0.5 * KL(P||M) + 0.5 * KL(Q||M)
  let jsd = 0;
  for (let i = 0; i < len; i++) {
    if (pNorm[i] > 0 && m[i] > 0) {
      jsd += 0.5 * pNorm[i] * Math.log2(pNorm[i] / m[i]);
    }
    if (qNorm[i] > 0 && m[i] > 0) {
      jsd += 0.5 * qNorm[i] * Math.log2(qNorm[i] / m[i]);
    }
  }

  return Math.max(0, Math.min(jsd, 1));
}

/** Pearson correlation coefficient between two arrays */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function standardDeviation(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Emotion extraction from text
// ---------------------------------------------------------------------------

/** Emotion distribution buckets */
const EMOTION_CATEGORIES = [
  "fear_crisis",    // 공포/위기
  "anger_conflict", // 분노/갈등
  "sadness_loss",   // 슬픔/상실
  "tension",        // 긴장/서스펜스
  "surprise",       // 놀라움/반전
  "hope_resolve",   // 희망/결의
  "peace_relief",   // 안도/평화
  "excitement",     // 설렘/기대
] as const;

type EmotionCategory = (typeof EMOTION_CATEGORIES)[number];

function categorizeEmotion(entry: EmotionEntry): EmotionCategory {
  const { valence, arousal } = entry;
  if (valence <= -0.6 && arousal >= 0.7) return "fear_crisis";
  if (valence <= -0.4 && arousal >= 0.6 && valence > -0.6) return "anger_conflict";
  if (valence <= -0.3 && arousal < 0.5) return "sadness_loss";
  if (valence > -0.5 && valence <= 0.0 && arousal >= 0.4) return "tension";
  if (Math.abs(valence) < 0.3 && arousal >= 0.6) return "surprise";
  if (valence >= 0.3 && arousal >= 0.5) return "hope_resolve";
  if (valence >= 0.3 && arousal < 0.4) return "peace_relief";
  if (valence >= 0.4 && arousal >= 0.6) return "excitement";
  return "tension"; // default
}

/** Extract emotion distribution from a text segment */
function extractEmotionDistribution(text: string): number[] {
  const counts = new Array(EMOTION_CATEGORIES.length).fill(0);

  for (const keyword of LEXICON_KEYS) {
    const entry = EMOTION_LEXICON[keyword];
    let idx = 0;
    let occurrences = 0;
    while ((idx = text.indexOf(keyword, idx)) !== -1) {
      occurrences++;
      idx += keyword.length;
    }
    if (occurrences > 0) {
      const category = categorizeEmotion(entry);
      const catIndex = EMOTION_CATEGORIES.indexOf(category);
      if (catIndex >= 0) {
        counts[catIndex] += occurrences;
      }
    }
  }

  // Fallback: if no emotion keywords detected, infer from structural cues
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) {
    const hasDialogue = /[""「」]/.test(text);
    const hasQuestion = /[?？]/.test(text);
    const hasExclamation = /[!！]/.test(text);
    const hasEllipsis = /[…]|\.{3}/.test(text);
    const isShort = text.length < 50;

    // Weak fallback: punctuation cues (lower weight to avoid false positives)
    // These all map to the SAME category so JSD stays low between fallback paragraphs
    if (hasQuestion || hasExclamation || hasEllipsis || hasDialogue || isShort) {
      counts[3] += 1; // always tension — same category prevents fake JSD spikes
    } else {
      counts[6] += 1; // peace/relief for pure narration
    }
  }

  return counts;
}

/** Extract sentiment valence (-1 to +1) from text */
function extractSentimentValence(text: string): number {
  let totalValence = 0;
  let totalHits = 0;

  for (const keyword of LEXICON_KEYS) {
    const entry = EMOTION_LEXICON[keyword];
    let idx = 0;
    while ((idx = text.indexOf(keyword, idx)) !== -1) {
      totalValence += entry.valence;
      totalHits++;
      idx += keyword.length;
    }
  }

  return totalHits === 0 ? 0 : totalValence / totalHits;
}

/** Extract arousal (intensity) from text */
function extractArousal(text: string): number {
  let totalArousal = 0;
  let totalHits = 0;

  for (const keyword of LEXICON_KEYS) {
    const entry = EMOTION_LEXICON[keyword];
    let idx = 0;
    while ((idx = text.indexOf(keyword, idx)) !== -1) {
      totalArousal += entry.arousal;
      totalHits++;
      idx += keyword.length;
    }
  }

  return totalHits === 0 ? 0.5 : totalArousal / totalHits;
}

// ---------------------------------------------------------------------------
// Segment text into paragraphs for time-series analysis
// ---------------------------------------------------------------------------

function segmentIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

export interface NarrativeInformationScores {
  /** Entropy dynamism — std dev of scene-level entropy (0~1) */
  entropyDynamism: number;
  /** JSD pivot realization — are intended tension jumps realized? (0~1) */
  pivotRealization: number;
  /** Sentiment-tension correlation — does text follow blueprint? (0~1) */
  arcCorrelation: number;
  /** Stagnation penalty — consecutive low-JSD segments (0~1, 1=no stagnation) */
  antiStagnation: number;
  /** Overall weighted score (0~1) */
  overall: number;
  /** Detailed analysis data */
  details: {
    paragraphEntropies: number[];
    paragraphJSDs: number[];
    sentimentCurve: number[];
    intendedTension: number[];
    stagnationSegments: number[][];
    pivotAnalysis: Array<{
      paragraphIndex: number;
      intendedJump: number;
      actualJSD: number;
      realized: boolean;
    }>;
  };
}

const WEIGHTS = {
  entropyDynamism: 0.20,
  pivotRealization: 0.35,
  arcCorrelation: 0.30,
  antiStagnation: 0.15,
};

/**
 * Compute information-theoretic narrative quality scores.
 *
 * @param text - The generated chapter text
 * @param blueprint - The chapter blueprint with tension_level and emotional_arc
 * @param tensionCurve - Optional: arc-level tension curve for multi-chapter context
 */
export function computeNarrativeInformationScores(
  text: string,
  blueprint?: ChapterBlueprint | null,
  tensionCurve?: number[],
): NarrativeInformationScores {
  const paragraphs = segmentIntoParagraphs(text);

  if (paragraphs.length < 3) {
    return {
      entropyDynamism: 0.5,
      pivotRealization: 0.5,
      arcCorrelation: 0.5,
      antiStagnation: 0.5,
      overall: 0.5,
      details: {
        paragraphEntropies: [],
        paragraphJSDs: [],
        sentimentCurve: [],
        intendedTension: [],
        stagnationSegments: [],
        pivotAnalysis: [],
      },
    };
  }

  // --- 1. Emotion distributions per paragraph ---
  const distributions = paragraphs.map(extractEmotionDistribution);
  const paragraphEntropies = distributions.map(shannonEntropy);

  // --- 2. Entropy Dynamism ---
  // High std dev = dynamic (good), low = monotonous (bad)
  const entropyStdDev = standardDeviation(paragraphEntropies);
  // Normalize: std dev of 0.5+ is excellent, 0 is terrible
  const entropyDynamism = Math.min(entropyStdDev / 0.5, 1);

  // --- 3. JSD between consecutive paragraphs ---
  const paragraphJSDs: number[] = [];
  for (let i = 1; i < distributions.length; i++) {
    paragraphJSDs.push(jensenShannonDivergence(distributions[i - 1], distributions[i]));
  }

  // --- 4. Stagnation detection ---
  // 3+ consecutive paragraphs with JSD < 0.05 = stagnation
  const STAGNATION_THRESHOLD = 0.05;
  const STAGNATION_LENGTH = 3;
  const stagnationSegments: number[][] = [];
  let stagnationStart = -1;

  for (let i = 0; i < paragraphJSDs.length; i++) {
    if (paragraphJSDs[i] < STAGNATION_THRESHOLD) {
      if (stagnationStart === -1) stagnationStart = i;
    } else {
      if (stagnationStart !== -1 && i - stagnationStart >= STAGNATION_LENGTH) {
        stagnationSegments.push([stagnationStart, i - 1]);
      }
      stagnationStart = -1;
    }
  }
  if (stagnationStart !== -1 && paragraphJSDs.length - stagnationStart >= STAGNATION_LENGTH) {
    stagnationSegments.push([stagnationStart, paragraphJSDs.length - 1]);
  }

  // antiStagnation: 1 if no stagnation, decreases with more stagnation
  const stagnantParagraphs = stagnationSegments.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  const antiStagnation = Math.max(0, 1 - stagnantParagraphs / Math.max(paragraphs.length, 1));

  // --- 5. Sentiment curve ---
  const sentimentCurve = paragraphs.map(extractSentimentValence);

  // --- 6. Arc correlation with blueprint tension ---
  let arcCorrelation = 0.5; // default if no blueprint
  let intendedTension: number[] = [];

  if (blueprint) {
    // Build intended tension curve from blueprint scenes
    const scenes = blueprint.key_points || [];
    const chapterTension = blueprint.tension_level ?? 5;

    if (scenes.length > 0) {
      // Distribute tension across paragraphs based on scene count
      // Assume tension rises toward the chapter's tension_level
      const numParagraphs = paragraphs.length;
      intendedTension = new Array(numParagraphs);

      // Simple tension model: start at 40% of target, rise to target, slight dip at end
      for (let i = 0; i < numParagraphs; i++) {
        const progress = i / (numParagraphs - 1);
        if (progress < 0.2) {
          // Opening: moderate tension
          intendedTension[i] = chapterTension * 0.4;
        } else if (progress < 0.8) {
          // Rising action: linear rise to peak
          const riseProgress = (progress - 0.2) / 0.6;
          intendedTension[i] = chapterTension * (0.4 + 0.6 * riseProgress);
        } else {
          // Closing: slight dip or maintain (hook ending)
          intendedTension[i] = chapterTension * 0.85;
        }
      }

      // Normalize both curves to 0-1 for correlation
      const maxTension = Math.max(...intendedTension, 1);
      const normalizedIntended = intendedTension.map((t) => t / maxTension);

      // Convert sentiment to arousal (tension proxy): more negative + high arousal = high tension
      const arousalCurve = paragraphs.map(extractArousal);
      const tensionProxy = sentimentCurve.map((v, i) => {
        // Tension = high arousal + negative valence
        return arousalCurve[i] * (1 - (v + 1) / 2);
      });

      // Normalize tension proxy to 0-1
      const maxProxy = Math.max(...tensionProxy, 0.001);
      const minProxy = Math.min(...tensionProxy);
      const range = maxProxy - minProxy || 1;
      const normalizedProxy = tensionProxy.map((t) => (t - minProxy) / range);

      const correlation = pearsonCorrelation(normalizedIntended, normalizedProxy);
      // Map correlation from [-1,1] to [0,1], where positive correlation is good
      arcCorrelation = (correlation + 1) / 2;
    }
  } else if (tensionCurve && tensionCurve.length > 0) {
    // Use arc-level tension curve if no blueprint
    intendedTension = tensionCurve;
  }

  // --- 7. Pivot realization ---
  let pivotRealization = 0.5;
  const pivotAnalysis: NarrativeInformationScores["details"]["pivotAnalysis"] = [];

  if (paragraphs.length >= 5) {
    // Identify intended pivots: paragraphs where tension should jump significantly
    // Use thirds: expect low→mid→high tension distribution
    const thirds = Math.floor(paragraphs.length / 3);

    // Check JSD at transition points (1/3 and 2/3 of the text)
    const transitionPoints = [thirds, thirds * 2].filter(
      (i) => i > 0 && i < paragraphJSDs.length,
    );

    if (transitionPoints.length > 0) {
      let realizedPivots = 0;

      for (const idx of transitionPoints) {
        // Look in a window around the transition point for the highest JSD
        const windowStart = Math.max(0, idx - 2);
        const windowEnd = Math.min(paragraphJSDs.length - 1, idx + 2);
        let maxJSD = 0;
        let maxIdx = idx;

        for (let i = windowStart; i <= windowEnd; i++) {
          if (paragraphJSDs[i] > maxJSD) {
            maxJSD = paragraphJSDs[i];
            maxIdx = i;
          }
        }

        const chapterTension = blueprint?.tension_level ?? 5;
        const intendedJump = chapterTension / 10; // higher tension = bigger expected JSD
        const realized = maxJSD >= 0.1; // minimum JSD threshold for a "real" pivot

        pivotAnalysis.push({
          paragraphIndex: maxIdx,
          intendedJump,
          actualJSD: Math.round(maxJSD * 1000) / 1000,
          realized,
        });

        if (realized) realizedPivots++;
      }

      pivotRealization = transitionPoints.length > 0
        ? realizedPivots / transitionPoints.length
        : 0.5;
    }
  }

  // --- Overall ---
  const overall =
    entropyDynamism * WEIGHTS.entropyDynamism +
    pivotRealization * WEIGHTS.pivotRealization +
    arcCorrelation * WEIGHTS.arcCorrelation +
    antiStagnation * WEIGHTS.antiStagnation;

  return {
    entropyDynamism: Math.round(entropyDynamism * 1000) / 1000,
    pivotRealization: Math.round(pivotRealization * 1000) / 1000,
    arcCorrelation: Math.round(arcCorrelation * 1000) / 1000,
    antiStagnation: Math.round(antiStagnation * 1000) / 1000,
    overall: Math.round(overall * 1000) / 1000,
    details: {
      paragraphEntropies: paragraphEntropies.map((e) => Math.round(e * 100) / 100),
      paragraphJSDs: paragraphJSDs.map((j) => Math.round(j * 1000) / 1000),
      sentimentCurve: sentimentCurve.map((s) => Math.round(s * 100) / 100),
      intendedTension: intendedTension.map((t) => Math.round(t * 100) / 100),
      stagnationSegments,
      pivotAnalysis,
    },
  };
}
