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
 *
 * References:
 * - engagement dimension inspired by Korean web novel analytics
 *   (카카오페이지/문피아 연독률 패턴, 고구마-사이다 밸런스)
 * - Ely et al. 2015: "Suspense and Surprise" (JPE) — tension/relief cycle
 * - Reagan et al. 2016: emotional arc shapes (EPJ Data Science)
 */

import type { NovelSeed } from "../schema/novel";
import type { ChapterBlueprint } from "../schema/planning";
import { computeNarrativeInformationScores, type NarrativeInformationScores } from "./narrative-information-scorer";
import { detectNarrativeLoop, measureDialogueInformation, analyzeSentimentArc } from "./mathematical-checks";
import { measureCuriosityGap } from "./curiosity-gap";
import { measureEmotionalImpact } from "./emotional-impact";
import { measureOriginality } from "./originality";
import { measurePageTurner } from "./page-turner";
import { measureReadabilityPacing } from "./readability-pacing";
import { evaluateConsistencyGate, type ConsistencyIssue } from "./consistency-gate";
import type { CharacterState } from "../memory/world-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeterministicScores {
  /** 문장 리듬 (0~1) */
  rhythm: number;
  /** 후킹 엔딩 (0~1) */
  hookEnding: number;
  /** 캐릭터 음성 일관성 (0~1) */
  characterVoice: number;
  /** 대사 비율 (0~1) */
  dialogueRatio: number;
  /** 분량 적정성 (0~1) */
  lengthScore: number;
  /** 반복 회피 (0~1) */
  antiRepetition: number;
  /** 감각 다양성 (0~1) */
  sensoryDiversity: number;
  /** 서사 전개 (0~1) — 정보밀도, 인과관계, 긴장 에스컬레이션 */
  narrative: number;
  /** 몰입감 (0~1) — 구체성, 장면 접지, 심리적 거리, 대화 모멘텀 */
  immersion: number;
  /** 정보이론 기반 서사 구조 (0~1) — 엔트로피, JSD, 아크 상관 */
  narrativeInformation: number;
  /** 독자 몰입도 (0~1) — 고구마-사이다, 1화 임팩트, 엔딩 감정 */
  engagement: number;
  /** 서사 루프 회피 (0~1) — 인접 문단 명사 중복 감지 */
  loopAvoidance: number;
  /** 대사 정보량 (0~1) — 의미 있는 대사 vs 빈 대사 비율 */
  dialogueQuality: number;
  /** 감정 아크 (0~1) — Hurst 지수 기반 감정 변동 패턴 */
  sentimentArc: number;
  /** 호기심 갭 (0~1) — 열린 질문/미스터리 관리 */
  curiosityGap: number;
  /** 감정 낙차 (0~1) — 클라이맥스 감정 강도, 카타르시스 */
  emotionalImpact: number;
  /** 독창성 (0~1) — 클리셰 회피, 어휘 다양성 */
  originality: number;
  /** 페이지터너 (0~1) — 절단신공, 미해결 스레드, 정보 속도 */
  pageTurner: number;
  /** 읽기 페이싱 (0~1) — 초점 안정성, 정보 간격, 인과 명시성 */
  readabilityPacing: number;
  /** 일관성 게이트 (0~1, 최종 점수 승수) */
  consistencyGate: number;
  /** 일관성 이슈 목록 */
  consistencyIssues: ConsistencyIssue[];
  /** 종합 (가중 평균 * consistencyGate) */
  overall: number;
  /** 상세 데이터 */
  details: Record<string, unknown>;
  /** 정보이론 상세 */
  informationTheory?: NarrativeInformationScores;
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
// 8. Narrative progression (서사 전개)
// ---------------------------------------------------------------------------

const CAUSAL_CONNECTORS = [
  "그래서", "때문에", "덕분에", "결국", "하지만", "그러나",
  "그런데", "그렇지만", "따라서", "그러자", "그러면서",
  "바람에", "탓에", "까닭에", "이유로",
];

const NEGATIVE_TENSION_WORDS = [
  "위험", "죽", "피", "배신", "분노", "공포", "두려",
  "비명", "칼", "검", "상처", "고통", "절망", "긴장",
  "추격", "함정", "적", "공격", "위기", "불안",
];

function scoreNarrative(
  text: string,
  seed: NovelSeed,
): { score: number; details: Record<string, unknown> } {
  const paragraphs = text.split("\n\n").filter((p) => p.trim().length > 0);
  if (paragraphs.length < 3) return { score: 0.5, details: { reason: "문단 수 부족" } };

  // a) Information density curve — new named entities per paragraph
  const knownNames = seed.characters.map((c) => c.name);
  const knownLocations = Object.keys(seed.world.key_locations || {});
  const allEntities = [...knownNames, ...knownLocations];

  const entityDensity: number[] = [];
  const seenEntities = new Set<string>();
  for (const para of paragraphs) {
    let newEntities = 0;
    for (const entity of allEntities) {
      if (para.includes(entity) && !seenEntities.has(entity)) {
        seenEntities.add(entity);
        newEntities++;
      }
    }
    entityDensity.push(newEntities);
  }

  // Optimal: 1-2 new entities in first 30%, then tapering off
  const firstThird = entityDensity.slice(0, Math.ceil(paragraphs.length / 3));
  const avgFirstThird = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const entityScore = avgFirstThird > 0 && avgFirstThird <= 3 ? 1 : avgFirstThird === 0 ? 0.3 : 0.5;

  // b) Causal connectors — story events are linked, not just listed
  const causalCount = CAUSAL_CONNECTORS.reduce(
    (count, word) => count + (text.match(new RegExp(word, "g"))?.length || 0),
    0,
  );
  const causalDensity = causalCount / paragraphs.length;
  // Optimal: 0.5-2 causal connectors per paragraph
  const causalScore = causalDensity >= 0.3 && causalDensity <= 2.5 ? 1 :
    causalDensity < 0.3 ? causalDensity / 0.3 : 0.7;

  // c) Tension escalation — negative/tense words should increase toward the end
  const halfPoint = Math.floor(paragraphs.length / 2);
  const firstHalf = paragraphs.slice(0, halfPoint).join(" ");
  const secondHalf = paragraphs.slice(halfPoint).join(" ");

  const tensionFirst = NEGATIVE_TENSION_WORDS.reduce(
    (count, word) => count + (firstHalf.match(new RegExp(word, "g"))?.length || 0), 0,
  );
  const tensionSecond = NEGATIVE_TENSION_WORDS.reduce(
    (count, word) => count + (secondHalf.match(new RegExp(word, "g"))?.length || 0), 0,
  );

  // Second half should have equal or more tension
  const escalationScore = tensionSecond >= tensionFirst ? 1 :
    tensionSecond >= tensionFirst * 0.7 ? 0.7 : 0.4;

  const score = entityScore * 0.3 + causalScore * 0.4 + escalationScore * 0.3;

  return {
    score: Math.min(score, 1),
    details: {
      entityDensity: entityDensity.slice(0, 5),
      causalDensity: Math.round(causalDensity * 100) / 100,
      tensionFirst,
      tensionSecond,
      escalation: tensionSecond >= tensionFirst,
    },
  };
}

// ---------------------------------------------------------------------------
// 9. Immersion (몰입감)
// ---------------------------------------------------------------------------

const CONCRETE_NOUNS = /[칼검문손돌벽불촛바닥천장창문지붕탁자의자잔컵접시그릇책종이옷신발장갑모자열쇠반지목걸이]/g;
const ABSTRACT_NOUNS = /[상황감정생각마음기분느낌의미이유목적결과사실진실비밀]/g;
const SENSORY_VERBS = /[보았|봤|바라봤|훑었|살폈|들었|들렸|울렸|느꼈|닿았|스쳤|맡았|냄새|향|맛]/g;
const THOUGHT_MARKERS = /[생각했|알았|깨달았|이해했|짐작했|느꼈다|판단했]/g;

function scoreImmersion(text: string): { score: number; details: Record<string, unknown> } {
  const paragraphs = text.split("\n\n").filter((p) => p.trim().length > 0);
  if (paragraphs.length < 3) return { score: 0.5, details: {} };

  // a) Concreteness ratio
  const concreteCount = (text.match(CONCRETE_NOUNS) || []).length;
  const abstractCount = (text.match(ABSTRACT_NOUNS) || []).length;
  const total = concreteCount + abstractCount;
  const concreteRatio = total > 0 ? concreteCount / total : 0.5;
  // Optimal: 70%+ concrete
  const concretenessScore = concreteRatio >= 0.6 ? 1 : concreteRatio >= 0.4 ? 0.7 : 0.4;

  // b) Scene grounding — first 2 sentences of each scene-break have physical setting?
  let groundedScenes = 0;
  let totalScenes = 0;
  for (const para of paragraphs) {
    if (para.length > 100) { // likely a scene start
      totalScenes++;
      const firstTwoSentences = para.split(/[.!?]/g).slice(0, 2).join("");
      const hasSetting = SENSORY_VERBS.test(firstTwoSentences) ||
        /장소|방|복도|거리|숲|성|궁|관|실|문|길|바닥/g.test(firstTwoSentences);
      if (hasSetting) groundedScenes++;
    }
  }
  const groundingScore = totalScenes > 0 ? groundedScenes / totalScenes : 0.5;

  // c) Psychic distance — sensory verbs + internal thoughts
  const sensoryCount = (text.match(SENSORY_VERBS) || []).length;
  const thoughtCount = (text.match(THOUGHT_MARKERS) || []).length;
  const psychicDensity = (sensoryCount + thoughtCount) / paragraphs.length;
  // Optimal: 1-3 per paragraph
  const psychicScore = psychicDensity >= 0.5 && psychicDensity <= 4 ? 1 :
    psychicDensity < 0.5 ? psychicDensity * 2 : 0.7;

  // d) Dialogue momentum — narration sentences between dialogue lines
  const lines = text.split("\n").filter((l) => l.trim());
  const isDialogue = lines.map((l) => /^[""「]/.test(l.trim()) || /[""」]\s*$/.test(l.trim()));
  let totalGaps = 0;
  let gapCount = 0;
  let currentGap = 0;
  for (let i = 0; i < isDialogue.length; i++) {
    if (isDialogue[i]) {
      if (currentGap > 0) {
        totalGaps += currentGap;
        gapCount++;
      }
      currentGap = 0;
    } else {
      currentGap++;
    }
  }
  const avgGap = gapCount > 0 ? totalGaps / gapCount : 3;
  // Optimal: 1-3 narration lines between dialogues
  const momentumScore = avgGap >= 1 && avgGap <= 3 ? 1 :
    avgGap < 1 ? 0.7 : avgGap <= 5 ? 0.6 : 0.3;

  const score = concretenessScore * 0.25 + groundingScore * 0.25 +
    psychicScore * 0.25 + momentumScore * 0.25;

  return {
    score: Math.min(score, 1),
    details: {
      concreteRatio: Math.round(concreteRatio * 100) + "%",
      groundedScenes: `${groundedScenes}/${totalScenes}`,
      psychicDensity: Math.round(psychicDensity * 100) / 100,
      avgDialogueGap: Math.round(avgGap * 10) / 10,
    },
  };
}

// ---------------------------------------------------------------------------
// 11. Engagement score (고구마-사이다 + 1화 임팩트 + 엔딩 감정)
// ---------------------------------------------------------------------------

const GOGUMA_KEYWORDS = [
  "모욕", "무시", "실패", "패배", "굴욕", "배신", "위협", "절망", "좌절",
  "조롱", "비웃", "무능", "쫓겨", "빼앗", "잃", "죽", "벌", "처형",
  "감옥", "추방", "버림", "거절", "체념",
];
const CIDER_KEYWORDS = [
  "성공", "승리", "인정", "칭찬", "보상", "반전", "각성", "해결", "극복",
  "복수", "통쾌", "감탄", "놀라", "두려워", "무릎", "항복", "사과",
  "존경", "기쁨", "웃", "미소", "감동", "환호", "축하",
];
const WORLDBUILD_PATTERNS = [
  /^.{0,10}(제국|대륙|왕국|세계)[력은의에서]/,
  /^.{0,10}\d{2,4}년/,
  /^이\s*(곳|세계|대륙|왕국)은/,
  /^(먼\s*옛날|오래\s*전|태초에)/,
];

function scoreEngagement(
  text: string,
  genre: string,
  chapterNumber: number,
): { score: number; details: Record<string, unknown> } {
  const paragraphs = text.split("\n\n").filter((p) => p.trim());
  let score = 0.5; // baseline
  const details: Record<string, unknown> = {};

  // --- 1. 고구마-사이다 밸런스 ---
  const gogumaCount = GOGUMA_KEYWORDS.filter((kw) => text.includes(kw)).length;
  const ciderCount = CIDER_KEYWORDS.filter((kw) => text.includes(kw)).length;
  details.goguma = gogumaCount;
  details.cider = ciderCount;

  // 마지막 20% 텍스트의 감정 방향 (상승 감정으로 끝나야 함)
  const lastPortion = text.slice(-Math.floor(text.length * 0.2));
  const lastGoguma = GOGUMA_KEYWORDS.filter((kw) => lastPortion.includes(kw)).length;
  const lastCider = CIDER_KEYWORDS.filter((kw) => lastPortion.includes(kw)).length;
  const endingPositive = lastCider >= lastGoguma;
  details.endingPositive = endingPositive;

  if (endingPositive) {
    score += 0.15; // 상승 감정으로 끝남
  } else {
    score -= 0.15; // 하강 감정으로 끝남
  }

  // 장르별 밸런스 체크
  const isActionGenre = ["현대 판타지", "판타지", "무협", "게임"].some((g) => genre.includes(g));
  if (isActionGenre) {
    // 남성향: 같은 화 내에 사이다 필수
    if (ciderCount === 0 && gogumaCount > 0) score -= 0.15;
    if (ciderCount > 0) score += 0.1;
  } else {
    // 로판/로맨스: 밀당도 OK, 사이다 없어도 설렘이면 됨
    if (ciderCount === 0 && gogumaCount > 2) score -= 0.1;
  }

  // --- 2. 1화 첫 문장 임팩트 ---
  if (chapterNumber === 1 && paragraphs.length > 0) {
    const firstPara = paragraphs[0];
    const startsWithWorldbuild = WORLDBUILD_PATTERNS.some((p) => p.test(firstPara));
    const startsWithDialogue = /^[""\u201C]/.test(firstPara.trim());
    const startsWithAction = /^.{0,5}(었다|였다|했다|했다|렸다|쳤다|졌다)/.test(firstPara) ||
      /[!]/.test(firstPara.slice(0, 50));

    details.firstSentenceType = startsWithWorldbuild ? "worldbuild" : startsWithDialogue ? "dialogue" : startsWithAction ? "action" : "narration";

    if (startsWithWorldbuild) {
      score -= 0.2; // 세계관 설명으로 시작 = 큰 감점
    } else if (startsWithDialogue || startsWithAction) {
      score += 0.1; // 대화/액션으로 시작 = 가점
    }
  }

  // --- 3. 주인공 호구화 방지 ---
  // 마지막 문단에서 주인공이 수동적인지 체크
  const lastPara = paragraphs[paragraphs.length - 1] || "";
  const passiveEnding = /체념|포기|무력|아무것도.*할 수 없|어쩔 수 없/.test(lastPara);
  if (passiveEnding) {
    score -= 0.1;
    details.passiveEnding = true;
  }

  return { score: Math.max(0, Math.min(1, score)), details };
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

const WEIGHTS = {
  // --- 7 core dimensions (sum = 1.0) ---
  narrative: 0.15,           // 서사 진행
  characterVoice: 0.15,      // 캐릭터 일관성
  readabilityPacing: 0.15,   // 이해도/가독성
  engagement: 0.10,          // 갈등 텐션, 고구마-사이다
  dialogueQuality: 0.10,     // 대사
  pageTurner: 0.15,          // 절단신공
  originality: 0.15,         // 독창성
  // --- zeroed (still computed, available in details) ---
  rhythm: 0,
  hookEnding: 0,
  dialogueRatio: 0.05,
  lengthScore: 0,
  antiRepetition: 0,
  sensoryDiversity: 0,
  narrativeInformation: 0,
  immersion: 0,
  loopAvoidance: 0,
  sentimentArc: 0,
  curiosityGap: 0,
  emotionalImpact: 0,
};

export function computeDeterministicScores(
  text: string,
  seed: NovelSeed,
  chapterNumber: number,
  lengthRange?: { min: number; max: number },
  blueprint?: ChapterBlueprint | null,
  previousCharacterStates?: CharacterState[],
): DeterministicScores {
  const rhythmResult = scoreRhythm(text);
  const hookResult = scoreHookEnding(text);
  const voiceResult = scoreCharacterVoice(text, seed, chapterNumber);
  const dialogueResult = scoreDialogueRatio(text);
  const lengthResult = scoreLengthAdherence(text, lengthRange?.min, lengthRange?.max);
  const repetitionResult = scoreAntiRepetition(text);
  const sensoryResult = scoreSensoryDiversity(text);

  const narrativeResult = scoreNarrative(text, seed);
  const immersionResult = scoreImmersion(text);

  // Information-theoretic analysis
  const infoScores = computeNarrativeInformationScores(text, blueprint);

  // Engagement (goguma-cider balance, ch1 impact, ending emotion)
  const genre = seed.world?.genre || "";
  const engagementResult = scoreEngagement(text, genre, chapterNumber);

  // Mathematical checks (loop avoidance, dialogue quality, sentiment arc)
  let loopAvoidanceScore = 0.7;
  let dialogueQualityScore = 0.7;
  let sentimentArcScore = 0.5;
  try {
    const loopResult = detectNarrativeLoop(text);
    loopAvoidanceScore = loopResult.score;

    const dialogueInfoResult = measureDialogueInformation(text);
    dialogueQualityScore = dialogueInfoResult.score;

    const arcResult = analyzeSentimentArc(text);
    // Use the score computed by analyzeSentimentArc directly (no double penalty)
    sentimentArcScore = arcResult.hurstScore;
  } catch {
    // Non-blocking: use defaults on failure
  }

  // Fun/emotion/originality/page-turner (NEW — "재미있는 글" 측정)
  let curiosityGapScore = 0.5;
  let emotionalImpactScore = 0.5;
  let originalityScore = 0.5;
  let pageTurnerScore = 0.5;
  let readabilityPacingScore = 0.5;
  try {
    curiosityGapScore = measureCuriosityGap(text).score;
    emotionalImpactScore = measureEmotionalImpact(text).score;
    originalityScore = measureOriginality(text).score;
    pageTurnerScore = measurePageTurner(text).score;
    readabilityPacingScore = measureReadabilityPacing(text).score;
  } catch {
    // Non-blocking: use defaults on failure
  }

  const scores = {
    rhythm: rhythmResult.score,
    hookEnding: hookResult.score,
    characterVoice: voiceResult.score,
    dialogueRatio: dialogueResult.score,
    lengthScore: lengthResult.score,
    antiRepetition: repetitionResult.score,
    sensoryDiversity: sensoryResult.score,
    narrative: narrativeResult.score,
    immersion: immersionResult.score,
    narrativeInformation: infoScores.overall,
    engagement: engagementResult.score,
    loopAvoidance: loopAvoidanceScore,
    dialogueQuality: dialogueQualityScore,
    sentimentArc: sentimentArcScore,
    curiosityGap: curiosityGapScore,
    emotionalImpact: emotionalImpactScore,
    originality: originalityScore,
    pageTurner: pageTurnerScore,
    readabilityPacing: readabilityPacingScore,
  };

  const rawOverall = Object.entries(WEIGHTS).reduce(
    (sum, [key, weight]) => sum + (scores[key as keyof typeof scores] || 0) * weight,
    0,
  );

  // Consistency gate: multiplies the raw score down if consistency is broken
  const consistencyResult = evaluateConsistencyGate(
    text,
    seed.characters,
    blueprint?.pov,
    previousCharacterStates,
  );
  const overall = consistencyResult.score * rawOverall;

  return {
    ...scores,
    consistencyGate: consistencyResult.score,
    consistencyIssues: consistencyResult.issues,
    overall,
    details: {
      rhythm: rhythmResult.details,
      hookEnding: hookResult.details,
      characterVoice: voiceResult.details,
      dialogue: { ratio: dialogueResult.ratio },
      length: { charCount: lengthResult.charCount },
      repetition: repetitionResult.details,
      sensory: { senses: sensoryResult.senses },
      narrative: narrativeResult.details,
      immersion: immersionResult.details,
      engagement: engagementResult.details,
    },
    informationTheory: infoScores,
  };
}
