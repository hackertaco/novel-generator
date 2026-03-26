/**
 * Mathematical / research-backed deterministic checks.
 *
 * No LLM calls — pure computation. Each function returns a score 0~1
 * and optionally issues to feed into the quality loop.
 *
 * References:
 * - Bizzoni 2021 (NLP4DH): Hurst exponent & reader preference
 * - Toubia 2021 (PNAS): Semantic speed / information density
 * - Reagan 2016 (EPJ Data Science): Emotional arc shapes
 * - Ely 2015 (JPE): Suspense vs Surprise theory
 */

import { EMOTION_LEXICON } from "./korean-emotion-lexicon";

// ---------------------------------------------------------------------------
// 1. Information Density — 고유명사, 숫자, 시간 표현 비율
// ---------------------------------------------------------------------------

/** Regex for Korean proper-noun-like patterns (name + particle) */
const PROPER_NOUN_PATTERN = /[가-힣]{2,}[이가은는을를에의과와]/g;
/** Numbers (Arabic + Korean) */
const NUMBER_PATTERN = /\d+|[일이삼사오육칠팔구십백천만억]/g;
/** Time expressions */
const TIME_PATTERN = /오전|오후|정오|새벽|아침|저녁|밤|낮|\d+시|\d+분|\d+초|전날|다음날|사흘|닷새|이틀|하루/g;
/** Causal / explanatory connectors (Tell markers) */
const TELL_MARKERS = /때문|덕분|결국|즉|다시 말해|라는 뜻|뜻이었다|셈이다|셈이었다|의미했다|이유는|원인은|결과적으로/g;

export interface InformationDensityResult {
  score: number;
  paragraphDensities: number[];
  lowInfoParagraphs: number[];
  tellMarkerCount: number;
}

export function measureInformationDensity(text: string): InformationDensityResult {
  const paragraphs = text.split("\n\n").filter((p) => p.trim().length > 0);
  const densities: number[] = [];
  const lowInfo: number[] = [];
  let tellCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const words = para.split(/\s+/).length;

    const properNouns = (para.match(PROPER_NOUN_PATTERN) || []).length;
    PROPER_NOUN_PATTERN.lastIndex = 0;
    const numbers = (para.match(NUMBER_PATTERN) || []).length;
    NUMBER_PATTERN.lastIndex = 0;
    const timeExprs = (para.match(TIME_PATTERN) || []).length;
    TIME_PATTERN.lastIndex = 0;
    const tells = (para.match(TELL_MARKERS) || []).length;
    TELL_MARKERS.lastIndex = 0;
    tellCount += tells;

    const markers = properNouns + numbers + timeExprs + tells;
    const density = words > 0 ? markers / words : 0;
    densities.push(density);

    const isDialogue = /[""\u201C]/.test(para);
    if (!isDialogue && density < 0.02 && words > 15) {
      lowInfo.push(i);
    }
  }

  const goodParagraphs = densities.filter((d) => d >= 0.02).length;
  const score = paragraphs.length > 0 ? goodParagraphs / paragraphs.length : 1;

  return { score: Math.min(1, score), paragraphDensities: densities, lowInfoParagraphs: lowInfo, tellMarkerCount: tellCount };
}

// ---------------------------------------------------------------------------
// 2. Noun Overlap Loop Detection — 연속 문단 명사 중복률
// ---------------------------------------------------------------------------

export interface LoopDetectionResult {
  score: number;
  loopPairs: Array<{ paraA: number; paraB: number; overlap: number }>;
}

function extractNouns(text: string): Set<string> {
  const matches = text.match(/[가-힣]{2,}/g) || [];
  const stopWords = new Set(["있었다", "없었다", "그리고", "하지만", "그래서", "때문에", "그녀는", "그녀의", "그에게"]);
  return new Set(matches.filter((m) => m.length >= 2 && !stopWords.has(m)));
}

export function detectNarrativeLoop(text: string): LoopDetectionResult {
  const paragraphs = text.split("\n\n").filter((p) => p.trim().length > 10);
  const loopPairs: LoopDetectionResult["loopPairs"] = [];

  for (let i = 0; i < paragraphs.length - 2; i++) {
    const nounsA = extractNouns(paragraphs[i]);
    if (nounsA.size < 3) continue;

    for (let j = i + 2; j < Math.min(i + 6, paragraphs.length); j++) {
      const nounsB = extractNouns(paragraphs[j]);
      if (nounsB.size < 3) continue;

      const intersection = [...nounsA].filter((n) => nounsB.has(n));
      const overlap = intersection.length / Math.min(nounsA.size, nounsB.size);

      if (overlap >= 0.7) {
        loopPairs.push({ paraA: i, paraB: j, overlap: Math.round(overlap * 100) / 100 });
      }
    }
  }

  const loopPenalty = Math.min(1, loopPairs.length * 0.2);
  return { score: Math.max(0, 1 - loopPenalty), loopPairs };
}

// ---------------------------------------------------------------------------
// 3. Dialogue Information Density — 대사 내 구체적 정보 비율
// ---------------------------------------------------------------------------

export interface DialogueInfoResult {
  score: number;
  totalLines: number;
  informativeLines: number;
  emptyLines: number;
}

export function measureDialogueInformation(text: string): DialogueInfoResult {
  const dialoguePattern = /[""\u201C]([^""\u201D]+)[""\u201D]/g;
  const dialogues: string[] = [];
  let match;

  while ((match = dialoguePattern.exec(text)) !== null) {
    if (match[1].length > 5) dialogues.push(match[1]);
  }

  if (dialogues.length === 0) {
    return { score: 1, totalLines: 0, informativeLines: 0, emptyLines: 0 };
  }

  let informative = 0;
  let empty = 0;

  for (const d of dialogues) {
    const pn = PROPER_NOUN_PATTERN.test(d); PROPER_NOUN_PATTERN.lastIndex = 0;
    const num = NUMBER_PATTERN.test(d); NUMBER_PATTERN.lastIndex = 0;
    const time = TIME_PATTERN.test(d); TIME_PATTERN.lastIndex = 0;
    const hasAction = /[가-힣]+[했갔봤왔줬찾]/.test(d);

    if (pn || num || time || hasAction) {
      informative++;
    } else {
      empty++;
    }
  }

  const ratio = dialogues.length > 0 ? informative / dialogues.length : 1;
  return { score: Math.min(1, ratio / 0.4), totalLines: dialogues.length, informativeLines: informative, emptyLines: empty };
}

// ---------------------------------------------------------------------------
// 4. Sentiment Arc + Hurst Exponent (Bizzoni 2021)
// ---------------------------------------------------------------------------

export function buildSentimentTimeSeries(text: string): number[] {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);

  return sentences.map((sentence) => {
    let totalValence = 0;
    let matchCount = 0;

    for (const [keyword, entry] of Object.entries(EMOTION_LEXICON)) {
      if (sentence.includes(keyword)) {
        totalValence += entry.valence;
        matchCount++;
      }
    }

    return matchCount > 0 ? totalValence / matchCount : 0;
  });
}

/**
 * Detrended Fluctuation Analysis (DFA) → Hurst exponent.
 * Optimal H for engaging fiction: 0.55~0.65 (Bizzoni 2021)
 */
export function computeHurstExponent(timeSeries: number[]): number | null {
  const N = timeSeries.length;
  if (N < 20) return null;

  const mean = timeSeries.reduce((s, v) => s + v, 0) / N;
  const profile: number[] = [];
  let cumSum = 0;
  for (const v of timeSeries) {
    cumSum += v - mean;
    profile.push(cumSum);
  }

  const minWindow = 4;
  const maxWindow = Math.floor(N / 4);
  const logN: number[] = [];
  const logF: number[] = [];

  for (let n = minWindow; n <= maxWindow; n = Math.ceil(n * 1.5)) {
    const numWindows = Math.floor(N / n);
    if (numWindows < 2) continue;

    let totalVariance = 0;
    for (let w = 0; w < numWindows; w++) {
      const start = w * n;
      const windowData = profile.slice(start, start + n);

      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += i; sumY += windowData[i]; sumXY += i * windowData[i]; sumX2 += i * i;
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      let residual = 0;
      for (let i = 0; i < n; i++) {
        residual += (windowData[i] - (slope * i + intercept)) ** 2;
      }
      totalVariance += residual / n;
    }

    const F = Math.sqrt(totalVariance / numWindows);
    if (F > 0) {
      logN.push(Math.log(n));
      logF.push(Math.log(F));
    }
  }

  if (logN.length < 3) return null;

  const k = logN.length;
  let sX = 0, sY = 0, sXY = 0, sX2 = 0;
  for (let i = 0; i < k; i++) {
    sX += logN[i]; sY += logF[i]; sXY += logN[i] * logF[i]; sX2 += logN[i] * logN[i];
  }
  return Math.round(((k * sXY - sX * sY) / (k * sX2 - sX * sX)) * 1000) / 1000;
}

export interface SentimentArcResult {
  hurstExponent: number | null;
  hurstScore: number;
  sentimentSeries: number[];
  emotionalRange: number;
}

export function analyzeSentimentArc(text: string): SentimentArcResult {
  const series = buildSentimentTimeSeries(text);
  const H = computeHurstExponent(series);

  let hurstScore = 0.5;
  if (H !== null) {
    if (H >= 0.50 && H <= 0.70) hurstScore = 1.0;
    else if (H >= 0.35 && H <= 0.85) {
      const dist = H < 0.50 ? 0.50 - H : H - 0.70;
      hurstScore = Math.max(0.4, 1.0 - dist * 3);
    } else hurstScore = 0.3;
  }

  const minV = series.length > 0 ? Math.min(...series) : 0;
  const maxV = series.length > 0 ? Math.max(...series) : 0;

  return { hurstExponent: H, hurstScore, sentimentSeries: series, emotionalRange: maxV - minV };
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export interface MathematicalCheckResults {
  informationDensity: InformationDensityResult;
  loopDetection: LoopDetectionResult;
  dialogueInfo: DialogueInfoResult;
  sentimentArc: SentimentArcResult;
  overallScore: number;
}

export function runMathematicalChecks(text: string): MathematicalCheckResults {
  const informationDensity = measureInformationDensity(text);
  const loopDetection = detectNarrativeLoop(text);
  const dialogueInfo = measureDialogueInformation(text);
  const sentimentArc = analyzeSentimentArc(text);

  const overallScore =
    informationDensity.score * 0.3 +
    loopDetection.score * 0.25 +
    dialogueInfo.score * 0.25 +
    sentimentArc.hurstScore * 0.2;

  return { informationDensity, loopDetection, dialogueInfo, sentimentArc, overallScore: Math.round(overallScore * 100) / 100 };
}
