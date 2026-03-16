/**
 * Archetype diversity evaluator for the evolution loop.
 *
 * Code-based checks (zero LLM calls):
 *   1. archetype_presence — personality_core에 아키타입 라벨이 명시되어 있는가
 *   2. pair_contrast    — 남주/여주의 성격이 충분히 대비되는가
 *   3. dialogue_variety — 캐릭터 간 대사 톤이 차별화되어 있는가
 *   4. abstract_penalty — "차갑다", "따뜻하다" 같은 추상 표현이 과도하지 않은가
 *
 * Score weights:
 *   archetype_presence  40%
 *   pair_contrast       25%
 *   dialogue_variety    20%
 *   abstract_penalty    15%
 */

import type { NovelSeed } from "@/lib/schema/novel";
import {
  MALE_LEAD_ARCHETYPES,
  FEMALE_LEAD_ARCHETYPES,
} from "@/lib/archetypes/character-archetypes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MALE_ARCHETYPE_LABELS = MALE_LEAD_ARCHETYPES.map((a) => a.label);
const FEMALE_ARCHETYPE_LABELS = FEMALE_LEAD_ARCHETYPES.map((a) => a.label);
const ALL_ARCHETYPE_LABELS = [...MALE_ARCHETYPE_LABELS, ...FEMALE_ARCHETYPE_LABELS];

/** Also match short forms like 집착광공, 다정남, 폭군 */
const MALE_ARCHETYPE_NAMES = MALE_LEAD_ARCHETYPES.map((a) => a.name);
const FEMALE_ARCHETYPE_NAMES = FEMALE_LEAD_ARCHETYPES.map((a) => a.name);
const ALL_ARCHETYPE_KEYWORDS = [
  ...ALL_ARCHETYPE_LABELS,
  ...MALE_ARCHETYPE_NAMES,
  ...FEMALE_ARCHETYPE_NAMES,
];

/** Abstract personality words that indicate vague characterization */
export const ABSTRACT_PERSONALITY_WORDS = [
  "차가운", "차갑다", "냉정한", "냉정하다",
  "따뜻한", "따뜻하다", "다정한", "다정하다",
  "강한", "강하다", "약한", "약하다",
  "착한", "착하다", "나쁜", "나쁘다",
  "밝은", "밝다", "어두운", "어둡다",
  "조용한", "조용하다", "활발한", "활발하다",
];

/** Max allowed ratio of abstract words in personality_core (0~1) */
export const MAX_ABSTRACT_RATIO = 0.5;

/** Korean sentence-ending patterns for dialogue variety check */
const ENDING_PATTERNS = [
  /다[.!?]?$/,     // ~다
  /요[.!?]?$/,     // ~요
  /야[.!?]?$/,     // ~야
  /지[.!?]?$/,     // ~지
  /어[.!?]?$/,     // ~어
  /게[.!?]?$/,     // ~게
  /오[.!?]?$/,     // ~오 (사극)
  /라[.!?]?$/,     // ~라 (명령)
  /까[.!?]?$/,     // ~까
  /네[.!?]?$/,     // ~네
  /걸[.!?]?$/,     // ~걸
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ArchetypePresenceDetail {
  /** Characters with archetype keyword in personality_core */
  matched: string[];
  /** Characters without archetype keyword */
  unmatched: string[];
  score: number;
  pass: boolean;
}

export interface PairContrastDetail {
  /** Shared keywords between male lead and female lead personality_core */
  shared_keywords: string[];
  /** Number of distinct personality traits */
  male_lead_traits: string[];
  female_lead_traits: string[];
  score: number;
  pass: boolean;
}

export interface DialogueVarietyDetail {
  /** Number of distinct ending patterns found across all characters */
  distinct_endings: number;
  /** Total characters with dialogues */
  characters_with_dialogues: number;
  score: number;
  pass: boolean;
}

export interface AbstractPenaltyDetail {
  /** Characters with too many abstract words */
  offending_characters: Array<{ name: string; ratio: number }>;
  score: number;
  pass: boolean;
}

export interface ArchetypeDiversityResult {
  overall_score: number;
  pass: boolean;
  archetype_presence: ArchetypePresenceDetail;
  pair_contrast: PairContrastDetail;
  dialogue_variety: DialogueVarietyDetail;
  abstract_penalty: AbstractPenaltyDetail;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

export function evaluateArchetypeDiversity(
  seed: NovelSeed,
): ArchetypeDiversityResult {
  const characters = seed.characters ?? [];

  const presenceResult = checkArchetypePresence(characters);
  const contrastResult = checkPairContrast(characters);
  const varietyResult = checkDialogueVariety(characters);
  const abstractResult = checkAbstractPenalty(characters);

  const overall =
    presenceResult.score * 0.4 +
    contrastResult.score * 0.25 +
    varietyResult.score * 0.2 +
    abstractResult.score * 0.15;

  const issues: string[] = [];
  for (const name of presenceResult.unmatched) {
    issues.push(`캐릭터 "${name}": personality_core에 아키타입이 명시되지 않음`);
  }
  if (!contrastResult.pass) {
    issues.push(
      `남주/여주 성격 대비 부족 — 공유 키워드: ${contrastResult.shared_keywords.join(", ")}`,
    );
  }
  if (!varietyResult.pass) {
    issues.push(
      `캐릭터 대사 톤 차별화 부족 — 종결어미 패턴 ${varietyResult.distinct_endings}종 (3종 이상 권장)`,
    );
  }
  for (const off of abstractResult.offending_characters) {
    issues.push(
      `캐릭터 "${off.name}": 추상적 성격 표현 비율 ${(off.ratio * 100).toFixed(0)}% (50% 이하 권장)`,
    );
  }

  return {
    overall_score: Math.round(overall * 1000) / 1000,
    pass: presenceResult.pass && contrastResult.pass && varietyResult.pass && abstractResult.pass,
    archetype_presence: presenceResult,
    pair_contrast: contrastResult,
    dialogue_variety: varietyResult,
    abstract_penalty: abstractResult,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Sub-checks
// ---------------------------------------------------------------------------

interface CharacterLike {
  name: string;
  role: string;
  voice: {
    personality_core: string;
    sample_dialogues: string[];
    tone: string;
    speech_patterns: string[];
  };
}

function checkArchetypePresence(characters: CharacterLike[]): ArchetypePresenceDetail {
  const matched: string[] = [];
  const unmatched: string[] = [];

  // Only check main characters (주인공, 상대역)
  const mainChars = characters.filter((c) =>
    c.role === "주인공" || c.role === "상대역",
  );

  if (mainChars.length === 0) {
    return { matched: [], unmatched: [], score: 1.0, pass: true };
  }

  for (const char of mainChars) {
    const core = char.voice.personality_core;
    const hasArchetype = ALL_ARCHETYPE_KEYWORDS.some((kw) => core.includes(kw));
    if (hasArchetype) {
      matched.push(char.name);
    } else {
      unmatched.push(char.name);
    }
  }

  const score = mainChars.length > 0 ? matched.length / mainChars.length : 1.0;

  return {
    matched,
    unmatched,
    score: Math.round(score * 1000) / 1000,
    pass: unmatched.length === 0,
  };
}

function checkPairContrast(characters: CharacterLike[]): PairContrastDetail {
  const maleLead = characters.find((c) => c.role === "상대역");
  const femaleLead = characters.find((c) => c.role === "주인공");

  if (!maleLead || !femaleLead) {
    return {
      shared_keywords: [],
      male_lead_traits: [],
      female_lead_traits: [],
      score: 1.0,
      pass: true,
    };
  }

  const maleWords = extractKeywords(maleLead.voice.personality_core);
  const femaleWords = extractKeywords(femaleLead.voice.personality_core);

  const shared = maleWords.filter((w) => femaleWords.includes(w));
  // Penalty: more shared keywords = less contrast
  const sharedRatio = Math.max(maleWords.length, femaleWords.length) > 0
    ? shared.length / Math.max(maleWords.length, femaleWords.length)
    : 0;

  const score = Math.max(0, 1.0 - sharedRatio * 1.5);

  return {
    shared_keywords: shared,
    male_lead_traits: maleWords,
    female_lead_traits: femaleWords,
    score: Math.round(score * 1000) / 1000,
    pass: sharedRatio < 0.5,
  };
}

function checkDialogueVariety(characters: CharacterLike[]): DialogueVarietyDetail {
  const allEndings = new Set<number>();
  let charsWithDialogues = 0;

  for (const char of characters) {
    const dialogues = char.voice.sample_dialogues;
    if (dialogues.length === 0) continue;
    charsWithDialogues++;

    for (const d of dialogues) {
      const trimmed = d.trim();
      for (let i = 0; i < ENDING_PATTERNS.length; i++) {
        if (ENDING_PATTERNS[i].test(trimmed)) {
          allEndings.add(i);
          break;
        }
      }
    }
  }

  const distinctCount = allEndings.size;
  // Want at least 3 distinct ending patterns across all characters
  const score = Math.min(1.0, distinctCount / 3);

  return {
    distinct_endings: distinctCount,
    characters_with_dialogues: charsWithDialogues,
    score: Math.round(score * 1000) / 1000,
    pass: distinctCount >= 3,
  };
}

function checkAbstractPenalty(characters: CharacterLike[]): AbstractPenaltyDetail {
  const offending: Array<{ name: string; ratio: number }> = [];

  const mainChars = characters.filter((c) =>
    c.role === "주인공" || c.role === "상대역",
  );

  for (const char of mainChars) {
    const core = char.voice.personality_core;
    const words = core.split(/[\s,、·]+/).filter((w) => w.length > 0);
    if (words.length === 0) continue;

    const abstractCount = words.filter((w) =>
      ABSTRACT_PERSONALITY_WORDS.some((aw) => w.includes(aw)),
    ).length;

    const ratio = abstractCount / words.length;
    if (ratio > MAX_ABSTRACT_RATIO) {
      offending.push({ name: char.name, ratio });
    }
  }

  const score = offending.length === 0
    ? 1.0
    : Math.max(0, 1.0 - offending.length * 0.4);

  return {
    offending_characters: offending,
    score: Math.round(score * 1000) / 1000,
    pass: offending.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractKeywords(text: string): string[] {
  return text
    .split(/[\s,、·()（）]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
}
