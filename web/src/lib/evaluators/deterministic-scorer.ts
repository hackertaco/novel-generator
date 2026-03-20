/**
 * Deterministic scorer — replaces LLM-based evaluation with code.
 *
 * Computes quality scores using statistical analysis, pattern matching,
 * and linguistic rules. Zero LLM calls, instant, reproducible.
 *
 * Can score 3 of 5 CriticAgent dimensions deterministically:
 * - rhythm (문장 리듬) → sentence length distribution + ending diversity
 * - hookEnding (후킹 엔딩) → last paragraph pattern analysis
 * - characterVoice (음성 일관성) → speech pattern matching
 *
 * The remaining 2 (narrative, immersion) still need LLM judgment.
 */

import type { NovelSeed } from "../schema/novel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeterministicScores {
  /** 문장 리듬 (0~1) — sentence length variety + ending diversity */
  rhythm: number;
  /** 후킹 엔딩 (0~1) — does the last paragraph create curiosity? */
  hookEnding: number;
  /** 캐릭터 음성 일관성 (0~1) — do characters speak as defined? */
  characterVoice: number;
  /** 대사 비율 (0~1) — dialogue percentage */
  dialogueRatio: number;
  /** 분량 적정성 (0~1) — within target range? */
  lengthScore: number;
  /** 반복 회피 (0~1) — avoids repetitive patterns? */
  antiRepetition: number;
  /** 감각 다양성 (0~1) — uses multiple senses? */
  sensoryDiversity: number;
  /** 종합 (가중 평균) */
  overall: number;
  /** 상세 데이터 */
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sentence analysis
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?。]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function getEndings(sentences: string[]): string[] {
  return sentences.map((s) => s.slice(-2));
}

// ---------------------------------------------------------------------------
// 1. Rhythm score
// ---------------------------------------------------------------------------

function scoreRhythm(text: string): { score: number; details: Record<string, unknown> } {
  const sentences = splitSentences(text);
  if (sentences.length < 5) return { score: 0.5, details: { reason: "문장 수 부족" } };

  // a) Sentence length variety (coefficient of variation)
  const lengths = sentences.map((s) => s.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  const cv = Math.sqrt(variance) / mean; // 0~1+, higher = more varied
  const lengthVariety = Math.min(cv / 0.6, 1); // normalize: cv=0.6 → perfect

  // b) Ending diversity — unique endings / total endings
  const endings = getEndings(sentences);
  const uniqueEndings = new Set(endings).size;
  const endingDiversity = Math.min(uniqueEndings / Math.max(endings.length * 0.5, 1), 1);

  // c) No 3+ consecutive same endings
  let maxConsecutive = 1;
  let current = 1;
  for (let i = 1; i < endings.length; i++) {
    if (endings[i] === endings[i - 1]) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 1;
    }
  }
  const noConsecutive = maxConsecutive <= 2 ? 1 : maxConsecutive <= 3 ? 0.5 : 0;

  // d) Short-long rhythm — alternation between short (<15) and long (>30) sentences
  let alternations = 0;
  for (let i = 1; i < lengths.length; i++) {
    const prev = lengths[i - 1] < 15 ? "short" : lengths[i - 1] > 30 ? "long" : "mid";
    const curr = lengths[i] < 15 ? "short" : lengths[i] > 30 ? "long" : "mid";
    if (prev !== curr) alternations++;
  }
  const rhythmAlternation = Math.min(alternations / (lengths.length * 0.4), 1);

  const score = lengthVariety * 0.3 + endingDiversity * 0.3 + noConsecutive * 0.2 + rhythmAlternation * 0.2;

  return {
    score: Math.min(score, 1),
    details: { lengthVariety, endingDiversity, maxConsecutive, rhythmAlternation, avgLength: Math.round(mean) },
  };
}

// ---------------------------------------------------------------------------
// 2. Hook ending score
// ---------------------------------------------------------------------------

const HOOK_PATTERNS = [
  // Question/mystery
  /[?？]/,
  // Ellipsis (trailing tension)
  /[…·]{2,}|\.{3,}/,
  // New character/entity introduction
  /누군가|어떤\s*[사람목소리]|처음\s*[보듣]/,
  // Danger/crisis keywords
  /위험|죽|피|검|칼|비명|폭발|추격|함정/,
  // Revelation
  /사실은|진실|비밀|정체|알게/,
  // Sound effects (sudden events)
  /[쾅쿵탕팡]/,
  // Unfinished action
  /순간|그때|직전|—$/,
];

function scoreHookEnding(text: string): { score: number; details: Record<string, unknown> } {
  const paragraphs = text.split("\n\n").filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return { score: 0, details: {} };

  const lastParagraph = paragraphs[paragraphs.length - 1];
  const lastTwoParagraphs = paragraphs.slice(-2).join("\n");

  let hookScore = 0;
  const matchedPatterns: string[] = [];

  for (const pattern of HOOK_PATTERNS) {
    if (pattern.test(lastTwoParagraphs)) {
      hookScore += 0.15;
      matchedPatterns.push(pattern.source.slice(0, 20));
    }
  }

  // Bonus: ends with dialogue (character voice as hook)
  if (lastParagraph.match(/[""」][\s]*$/)) {
    hookScore += 0.1;
    matchedPatterns.push("대사로 끝남");
  }

  // Bonus: very short last paragraph (dramatic pause)
  if (lastParagraph.length < 30) {
    hookScore += 0.1;
    matchedPatterns.push("짧은 마무리");
  }

  // Penalty: ends with resolution/summary language
  const ANTI_HOOK = /그렇게|마무리|끝이|결국|그날은|돌아갔다|잠이\s*들었다/;
  if (ANTI_HOOK.test(lastParagraph)) {
    hookScore -= 0.3;
    matchedPatterns.push("해소적 마무리 (-0.3)");
  }

  return {
    score: Math.max(0, Math.min(hookScore, 1)),
    details: { matchedPatterns, lastParagraphLength: lastParagraph.length },
  };
}

// ---------------------------------------------------------------------------
// 3. Character voice consistency
// ---------------------------------------------------------------------------

function scoreCharacterVoice(
  text: string,
  seed: NovelSeed,
  chapterNumber: number,
): { score: number; details: Record<string, unknown> } {
  const activeChars = seed.characters.filter((c) => c.introduction_chapter <= chapterNumber);
  if (activeChars.length === 0) return { score: 1, details: {} };

  // Extract all dialogue lines: "..." or "..."
  const dialogueLines = text.match(/[""「]([^""」]+)[""」]/g) || [];
  if (dialogueLines.length < 3) return { score: 0.7, details: { reason: "대사 수 부족" } };

  let totalChecks = 0;
  let passedChecks = 0;
  const charDetails: Record<string, { patterns_found: number; patterns_expected: number }> = {};

  for (const char of activeChars) {
    // Find dialogues attributed to this character (character name appears near the dialogue)
    const charDialogues = dialogueLines.filter((line) => {
      const idx = text.indexOf(line);
      if (idx < 0) return false;
      // Check 100 chars before and after for character name
      const context = text.slice(Math.max(0, idx - 100), idx + line.length + 100);
      return context.includes(char.name);
    });

    if (charDialogues.length === 0) continue;

    // Check if speech_patterns appear in the character's dialogues
    const patterns = char.voice.speech_patterns || [];
    let found = 0;
    for (const pattern of patterns) {
      if (charDialogues.some((d) => d.includes(pattern))) {
        found++;
      }
    }

    totalChecks += Math.max(patterns.length, 1);
    passedChecks += found;
    charDetails[char.name] = { patterns_found: found, patterns_expected: patterns.length };

    // Check formality consistency (존댓말 vs 반말)
    const isPolite = char.voice.tone.includes("존댓말") || char.voice.tone.includes("격식");
    const politeEndings = charDialogues.filter((d) =>
      d.match(/[습니다요세요시죠][\s""」]*$/)
    ).length;
    const casualEndings = charDialogues.filter((d) =>
      d.match(/[어야지래걸냐][\s""」]*$/)
    ).length;

    if (isPolite && casualEndings > politeEndings && charDialogues.length > 2) {
      // Polite character using casual speech
      totalChecks++;
      // Don't increment passedChecks
    } else {
      totalChecks++;
      passedChecks++;
    }
  }

  const score = totalChecks > 0 ? passedChecks / totalChecks : 0.7;
  return { score: Math.min(score, 1), details: charDetails };
}

// ---------------------------------------------------------------------------
// 4. Dialogue ratio
// ---------------------------------------------------------------------------

function scoreDialogueRatio(text: string): { score: number; ratio: number } {
  const dialogueMatches = text.match(/[""「][^""」]*[""」]/g) || [];
  const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
  const ratio = text.length > 0 ? dialogueChars / text.length : 0;

  // Optimal: 30-60%
  let score: number;
  if (ratio >= 0.3 && ratio <= 0.6) score = 1;
  else if (ratio >= 0.2 && ratio < 0.3) score = 0.7;
  else if (ratio > 0.6 && ratio <= 0.7) score = 0.8;
  else score = 0.4;

  return { score, ratio };
}

// ---------------------------------------------------------------------------
// 5. Length score
// ---------------------------------------------------------------------------

function scoreLengthAdherence(text: string, min = 3000, max = 4000): { score: number; charCount: number } {
  const charCount = text.length;
  if (charCount >= min && charCount <= max) return { score: 1, charCount };
  if (charCount < min) return { score: Math.max(0, charCount / min), charCount };
  // Over max
  return { score: Math.max(0.3, 1 - (charCount - max) / max), charCount };
}

// ---------------------------------------------------------------------------
// 6. Anti-repetition
// ---------------------------------------------------------------------------

function scoreAntiRepetition(text: string): { score: number; details: Record<string, unknown> } {
  const sentences = splitSentences(text);
  if (sentences.length < 5) return { score: 0.7, details: {} };

  // a) Subject repetition — same first word in 3+ consecutive sentences
  const firstWords = sentences.map((s) => s.split(/\s/)[0]);
  let maxSubjectRepeat = 1;
  let currentRepeat = 1;
  for (let i = 1; i < firstWords.length; i++) {
    if (firstWords[i] === firstWords[i - 1]) {
      currentRepeat++;
      maxSubjectRepeat = Math.max(maxSubjectRepeat, currentRepeat);
    } else {
      currentRepeat = 1;
    }
  }
  const subjectScore = maxSubjectRepeat <= 2 ? 1 : maxSubjectRepeat <= 3 ? 0.6 : 0.2;

  // b) Phrase repetition — same 4-gram appears 3+ times
  const words = text.split(/\s+/);
  const fourGrams = new Map<string, number>();
  for (let i = 0; i <= words.length - 4; i++) {
    const gram = words.slice(i, i + 4).join(" ");
    fourGrams.set(gram, (fourGrams.get(gram) || 0) + 1);
  }
  const maxRepeat = Math.max(...fourGrams.values(), 0);
  const phraseScore = maxRepeat <= 2 ? 1 : maxRepeat <= 4 ? 0.6 : 0.2;

  return {
    score: subjectScore * 0.5 + phraseScore * 0.5,
    details: { maxSubjectRepeat, maxPhraseRepeat: maxRepeat },
  };
}

// ---------------------------------------------------------------------------
// 7. Sensory diversity
// ---------------------------------------------------------------------------

const SENSORY_PATTERNS: Record<string, RegExp[]> = {
  visual: [/빛|어둠|그림자|색|빨|파|노|검|흰|반짝|번뜩|흐릿/],
  auditory: [/소리|울|들|속삭|외|비명|고요|침묵|쾅|딸|울림/],
  tactile: [/차가|뜨거|축축|매끈|거친|딱딱|부드|떨|스치|닿/],
  olfactory: [/냄새|향|악취|기름|피|꽃|연기|쇠/],
  gustatory: [/맛|쓴|단|짠|시|씹|삼키|마시/],
};

function scoreSensoryDiversity(text: string): { score: number; senses: string[] } {
  const foundSenses: string[] = [];
  for (const [sense, patterns] of Object.entries(SENSORY_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) {
      foundSenses.push(sense);
    }
  }
  // At least 3 senses = perfect
  const score = Math.min(foundSenses.length / 3, 1);
  return { score, senses: foundSenses };
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

const WEIGHTS = {
  rhythm: 0.20,
  hookEnding: 0.15,
  characterVoice: 0.20,
  dialogueRatio: 0.15,
  lengthScore: 0.05,
  antiRepetition: 0.15,
  sensoryDiversity: 0.10,
};

export function computeDeterministicScores(
  text: string,
  seed: NovelSeed,
  chapterNumber: number,
  lengthRange?: { min: number; max: number },
): DeterministicScores {
  const rhythmResult = scoreRhythm(text);
  const hookResult = scoreHookEnding(text);
  const voiceResult = scoreCharacterVoice(text, seed, chapterNumber);
  const dialogueResult = scoreDialogueRatio(text);
  const lengthResult = scoreLengthAdherence(text, lengthRange?.min, lengthRange?.max);
  const repetitionResult = scoreAntiRepetition(text);
  const sensoryResult = scoreSensoryDiversity(text);

  const scores = {
    rhythm: rhythmResult.score,
    hookEnding: hookResult.score,
    characterVoice: voiceResult.score,
    dialogueRatio: dialogueResult.score,
    lengthScore: lengthResult.score,
    antiRepetition: repetitionResult.score,
    sensoryDiversity: sensoryResult.score,
  };

  const overall =
    scores.rhythm * WEIGHTS.rhythm +
    scores.hookEnding * WEIGHTS.hookEnding +
    scores.characterVoice * WEIGHTS.characterVoice +
    scores.dialogueRatio * WEIGHTS.dialogueRatio +
    scores.lengthScore * WEIGHTS.lengthScore +
    scores.antiRepetition * WEIGHTS.antiRepetition +
    scores.sensoryDiversity * WEIGHTS.sensoryDiversity;

  return {
    ...scores,
    overall,
    details: {
      rhythm: rhythmResult.details,
      hookEnding: hookResult.details,
      characterVoice: voiceResult.details,
      dialogue: { ratio: dialogueResult.ratio },
      length: { charCount: lengthResult.charCount },
      repetition: repetitionResult.details,
      sensory: { senses: sensoryResult.senses },
    },
  };
}
