/**
 * speech-level-enforcer.ts
 *
 * Deterministic Korean speech level (화계) enforcer.
 * Zero LLM calls — pure regex-based detection and correction.
 *
 * Korean speech levels are determined by sentence-final endings (종결어미).
 * Characters' social_rank dictates which speech level they must use toward each other.
 */

import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterBlueprint } from "@/lib/schema/planning";
import type { Character } from "@/lib/schema/character";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SocialRank =
  | "royal"
  | "noble"
  | "gentry"
  | "commoner"
  | "servant"
  | "slave"
  | "outcast";

/**
 * Korean speech levels ordered from most formal to most casual.
 * - hapsyo (합쇼체): ~습니다, ~습니까, ~옵니다
 * - haeyo  (해요체): ~요, ~세요
 * - hae    (해체):   ~어, ~야, ~지
 * - haera  (해라체): ~라, ~냐, ~거라, ~다
 */
export type SpeechLevel = "hapsyo" | "haeyo" | "hae" | "haera";

export interface SpeechViolation {
  /** Index of the dialogue in the text (character offset of opening quote) */
  position: number;
  /** Full dialogue text including quotes */
  dialogueText: string;
  /** Speaker character name */
  speaker: string;
  /** Listener character name */
  listener: string;
  /** Speech level expected based on rank relationship */
  expectedLevel: SpeechLevel;
  /** Speech level actually detected */
  detectedLevel: SpeechLevel;
}

// ---------------------------------------------------------------------------
// Rank ordering (lower index = higher status)
// ---------------------------------------------------------------------------

const RANK_ORDER: SocialRank[] = [
  "royal",
  "noble",
  "gentry",
  "commoner",
  "servant",
  "slave",
  "outcast",
];

function rankIndex(rank: SocialRank): number {
  const idx = RANK_ORDER.indexOf(rank);
  return idx >= 0 ? idx : 3; // default to commoner
}

// ---------------------------------------------------------------------------
// 1. buildSpeechLevelMatrix
// ---------------------------------------------------------------------------

/**
 * Build a matrix that returns the expected speech level for speaker->listener
 * based on their social ranks.
 *
 * Rules:
 * - servant/slave/outcast -> royal: hapsyo (most formal)
 * - lower rank -> higher rank (gap >= 2): hapsyo
 * - lower rank -> higher rank (gap == 1): haeyo
 * - same rank: haeyo (default polite)
 * - higher rank -> lower rank (gap == 1): hae
 * - higher rank -> lower rank (gap >= 2): haera
 * - royal -> anyone lower: haera
 */
export function buildSpeechLevelMatrix(): Map<string, SpeechLevel> {
  const matrix = new Map<string, SpeechLevel>();

  for (const speaker of RANK_ORDER) {
    for (const listener of RANK_ORDER) {
      const sIdx = rankIndex(speaker);
      const lIdx = rankIndex(listener);
      const key = `${speaker}->${listener}`;

      if (sIdx === lIdx) {
        // Same rank: default polite
        matrix.set(key, "haeyo");
      } else if (sIdx > lIdx) {
        // Speaker is lower rank -> must be polite/formal
        // Servant/slave/outcast to royal: most formal
        if (listener === "royal" && sIdx >= rankIndex("servant")) {
          matrix.set(key, "hapsyo");
        } else if (sIdx - lIdx >= 2) {
          matrix.set(key, "hapsyo");
        } else {
          matrix.set(key, "haeyo");
        }
      } else {
        // Speaker is higher rank -> can be casual
        if (speaker === "royal") {
          matrix.set(key, "haera");
        } else if (lIdx - sIdx >= 2) {
          matrix.set(key, "haera");
        } else {
          matrix.set(key, "hae");
        }
      }
    }
  }

  return matrix;
}

// Singleton matrix
let _matrix: Map<string, SpeechLevel> | null = null;
function getMatrix(): Map<string, SpeechLevel> {
  if (!_matrix) _matrix = buildSpeechLevelMatrix();
  return _matrix;
}

/**
 * Get expected speech level for a speaker->listener pair.
 */
export function getExpectedSpeechLevel(
  speakerRank: SocialRank,
  listenerRank: SocialRank,
): SpeechLevel {
  const key = `${speakerRank}->${listenerRank}`;
  return getMatrix().get(key) ?? "haeyo";
}

// ---------------------------------------------------------------------------
// 2. Speech level detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect the speech level of a dialogue line from its sentence-final endings.
 * Returns null if no clear ending pattern is detected.
 *
 * We check the last meaningful ending in the dialogue.
 * Conservative: prefer false negatives over false positives.
 */
export function detectSpeechLevel(dialogue: string): SpeechLevel | null {
  // Clean up: remove trailing whitespace, quotes, punctuation noise
  const cleaned = dialogue.replace(/[\s""\u201D\u300D\u300F\u300E\u300C.!?\u2026~]+$/g, "").trim();
  if (cleaned.length < 2) return null;

  // Split into sentences within the dialogue and check the last one with a clear ending
  const sentences = dialogue.split(/[.!?\u2026]+/).filter((s) => s.trim().length > 0);

  // Check from the last sentence backwards for a clear speech level marker
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sent = sentences[i].replace(/[\s""\u201D\u300D\u300F\u300E\u300C]+$/g, "").trim();
    if (sent.length < 2) continue;

    const level = detectSentenceLevel(sent);
    if (level) return level;
  }

  // Also check the full dialogue as a single unit
  return detectSentenceLevel(cleaned);
}

function detectSentenceLevel(sent: string): SpeechLevel | null {
  // hapsyo: ~습니다, ~습니까, ~옵니다, ~옵니까
  if (/(?:\uC2B5\uB2C8\uB2E4|\uC2B5\uB2C8\uAE4C|\uC635\uB2C8\uB2E4|\uC635\uB2C8\uAE4C)/.test(sent)) {
    return "hapsyo";
  }

  // haeyo: ends with ~요
  if (/\uC694\s*$/.test(sent)) {
    return "haeyo";
  }

  // haera: ~거라, ~너라, ~으라, ~느냐, ~도다, ~리라
  if (/(?:\uAC70\uB77C|\uB108\uB77C|\uC73C\uB77C|\uB290\uB0D0|\uB3C4\uB2E4|\uB9AC\uB77C)\s*$/.test(sent)) {
    return "haera";
  }
  // ~는다, ~ㄴ다 at end (declarative haera)
  if (/[\uB294\uC740]\uB2E4\s*$/.test(sent)) {
    return "haera";
  }
  // ~냐 at end (interrogative haera) — but only if preceded by a Korean char
  if (/[\uAC00-\uD7A3]\uB0D0\s*$/.test(sent)) {
    return "haera";
  }

  // hae: ~어, ~야, ~지, ~래, ~걸
  if (/[\uC5B4\uC57C\uC9C0\uB798\uAC78]\s*$/.test(sent)) {
    // Extra guard: make sure the char before is Korean (not punctuation or space)
    const match = sent.match(/([\uAC00-\uD7A3])[\uC5B4\uC57C\uC9C0\uB798\uAC78]\s*$/);
    if (match) return "hae";
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3. detectSpeechViolations
// ---------------------------------------------------------------------------

/**
 * Extract dialogue lines and their approximate positions from text.
 * Supports both \u201C\u201D and "" style Korean quotation marks.
 */
interface DialogueExtract {
  /** Character offset of opening quote in the original text */
  position: number;
  /** Text inside the quotes */
  innerText: string;
  /** Full match including quotes */
  fullMatch: string;
}

function extractDialogues(text: string): DialogueExtract[] {
  const results: DialogueExtract[] = [];
  // Match text inside Korean quotes or Western quotes
  const regex = /["\u201C\u300C]([^"\u201D\u300D]*?)["\u201D\u300D]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    results.push({
      position: match.index,
      innerText: match[1],
      fullMatch: match[0],
    });
  }

  return results;
}

/**
 * Find a character name within `range` characters before the dialogue position.
 * Returns the closest character name found.
 */
function findSpeaker(
  text: string,
  dialoguePosition: number,
  characterNames: string[],
  range: number = 100,
): string | null {
  const start = Math.max(0, dialoguePosition - range);
  const before = text.slice(start, dialoguePosition);

  // Find all character name occurrences and pick the closest one
  let bestName: string | null = null;
  let bestIdx = -1;

  for (const name of characterNames) {
    const idx = before.lastIndexOf(name);
    if (idx >= 0 && idx > bestIdx) {
      bestIdx = idx;
      bestName = name;
    }
  }

  return bestName;
}

/**
 * Find the listener for a dialogue. Strategy:
 * 1. If the blueprint scene has exactly 2 characters, the other one is the listener.
 * 2. Otherwise, find the next named character after the dialogue (within 200 chars).
 * 3. Find the closest named character in the surrounding context that is not the speaker.
 */
function findListener(
  text: string,
  dialoguePosition: number,
  dialogueLength: number,
  speaker: string,
  characterNames: string[],
  sceneCharacters?: string[],
): string | null {
  // Strategy 1: 2-person scene from blueprint
  if (sceneCharacters && sceneCharacters.length === 2) {
    const other = sceneCharacters.find((c) => c !== speaker);
    if (other) return other;
  }

  // Strategy 2: next named character after dialogue
  const afterStart = dialoguePosition + dialogueLength;
  const after = text.slice(afterStart, afterStart + 200);
  const otherNames = characterNames.filter((n) => n !== speaker);

  let bestName: string | null = null;
  let bestIdx = Infinity;

  for (const name of otherNames) {
    const idx = after.indexOf(name);
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      bestName = name;
    }
  }

  if (bestName) return bestName;

  // Strategy 3: look before the dialogue for a different character
  const beforeStart = Math.max(0, dialoguePosition - 200);
  const before = text.slice(beforeStart, dialoguePosition);

  bestIdx = -1;
  for (const name of otherNames) {
    const idx = before.lastIndexOf(name);
    if (idx >= 0 && idx > bestIdx) {
      bestIdx = idx;
      bestName = name;
    }
  }

  return bestName;
}

/**
 * Build a map from character name to their social_rank.
 */
function buildRankMap(characters: Character[]): Map<string, SocialRank> {
  const map = new Map<string, SocialRank>();
  for (const char of characters) {
    map.set(char.name, (char.social_rank as SocialRank) ?? "commoner");
    // Also map by id in case blueprint uses ids
    map.set(char.id, (char.social_rank as SocialRank) ?? "commoner");
  }
  return map;
}

/**
 * Get the list of scene character names for a given dialogue position,
 * based on the blueprint scene boundaries (estimated by proportional position).
 */
function getSceneCharacters(
  dialoguePosition: number,
  textLength: number,
  blueprint: ChapterBlueprint | undefined,
  _characterNames: string[],
): string[] | undefined {
  if (!blueprint?.scenes || blueprint.scenes.length === 0) return undefined;

  // Estimate which scene this dialogue belongs to by proportional position
  const ratio = dialoguePosition / textLength;
  const totalChars = blueprint.scenes.reduce((sum, s) => sum + (s.estimated_chars || 1000), 0);
  let cumulative = 0;

  for (const scene of blueprint.scenes) {
    cumulative += scene.estimated_chars || 1000;
    if (ratio <= cumulative / totalChars) {
      // Resolve scene character IDs to names
      if (scene.characters && scene.characters.length > 0) {
        return scene.characters;
      }
      break;
    }
  }

  return undefined;
}

/**
 * Detect speech level violations in the generated text.
 *
 * @param text - The generated chapter text
 * @param seed - The novel seed containing character definitions
 * @param chapterNumber - Current chapter number (for filtering active characters)
 * @param blueprint - Optional chapter blueprint for scene-level character info
 * @returns Array of speech level violations
 */
export function detectSpeechViolations(
  text: string,
  seed: NovelSeed,
  chapterNumber: number,
  blueprint?: ChapterBlueprint,
): SpeechViolation[] {
  const characters = seed.characters.filter(
    (c) => c.introduction_chapter <= chapterNumber,
  );
  if (characters.length < 2) return []; // Need at least 2 characters

  const rankMap = buildRankMap(characters);
  const characterNames = characters.map((c) => c.name);
  const dialogues = extractDialogues(text);
  const violations: SpeechViolation[] = [];

  for (const dlg of dialogues) {
    // Skip very short dialogues (interjections, etc.)
    if (dlg.innerText.trim().length < 4) continue;

    const speaker = findSpeaker(text, dlg.position, characterNames);
    if (!speaker) continue;

    const sceneChars = getSceneCharacters(
      dlg.position,
      text.length,
      blueprint,
      characterNames,
    );

    // Resolve scene character IDs to names for listener search
    const resolvedSceneChars = sceneChars?.map((id) => {
      const char = characters.find((c) => c.id === id);
      return char ? char.name : id;
    });

    const listener = findListener(
      text,
      dlg.position,
      dlg.fullMatch.length,
      speaker,
      characterNames,
      resolvedSceneChars,
    );
    if (!listener) continue;

    const speakerRank = rankMap.get(speaker) ?? "commoner";
    const listenerRank = rankMap.get(listener) ?? "commoner";

    const expectedLevel = getExpectedSpeechLevel(speakerRank, listenerRank);
    const detectedLevel = detectSpeechLevel(dlg.innerText);

    // Only flag if we confidently detected a speech level AND it does not match
    if (detectedLevel && detectedLevel !== expectedLevel) {
      // Allow haeyo as acceptable when hapsyo is expected (slightly less formal but not wrong)
      // This is a conservative choice to reduce false positives
      if (expectedLevel === "hapsyo" && detectedLevel === "haeyo") continue;

      violations.push({
        position: dlg.position,
        dialogueText: dlg.fullMatch,
        speaker,
        listener,
        expectedLevel,
        detectedLevel,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// 4. fixSpeechViolations
// ---------------------------------------------------------------------------

/**
 * Check if a Korean character has a final consonant (받침).
 */
export function hasBatchim(char: string): boolean {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * Conservative replacement maps for speech level correction.
 * Only modifies clear sentence-final endings inside quotation marks.
 */
const CASUAL_TO_POLITE: [RegExp, string][] = [
  [/했어([\s""\u201D.!?\u2026]*)$/, "했어요$1"],
  [/됐어([\s""\u201D.!?\u2026]*)$/, "됐어요$1"],
  [/왔어([\s""\u201D.!?\u2026]*)$/, "왔어요$1"],
  [/갔어([\s""\u201D.!?\u2026]*)$/, "갔어요$1"],
  [/봤어([\s""\u201D.!?\u2026]*)$/, "봤어요$1"],
  [/줬어([\s""\u201D.!?\u2026]*)$/, "줬어요$1"],
  [/겠어([\s""\u201D.!?\u2026]*)$/, "겠어요$1"],
  [/싶어([\s""\u201D.!?\u2026]*)$/, "싶어요$1"],
  [/있어([\s""\u201D.!?\u2026]*)$/, "있어요$1"],
  [/없어([\s""\u201D.!?\u2026]*)$/, "없어요$1"],
  [/알아([\s""\u201D.!?\u2026]*)$/, "알아요$1"],
  [/몰라([\s""\u201D.!?\u2026]*)$/, "몰라요$1"],
  [/뭐야([\s""\u201D.!?\u2026]*)$/, "뭐예요$1"],
  [/그래([\s""\u201D.!?\u2026]*)$/, "그래요$1"],
  [/아냐([\s""\u201D.!?\u2026]*)$/, "아니에요$1"],
  [/맞아([\s""\u201D.!?\u2026]*)$/, "맞아요$1"],
];

const CASUAL_TO_FORMAL: [RegExp, string][] = [
  [/했어([\s""\u201D.!?\u2026]*)$/, "했습니다$1"],
  [/됐어([\s""\u201D.!?\u2026]*)$/, "됐습니다$1"],
  [/왔어([\s""\u201D.!?\u2026]*)$/, "왔습니다$1"],
  [/갔어([\s""\u201D.!?\u2026]*)$/, "갔습니다$1"],
  [/봤어([\s""\u201D.!?\u2026]*)$/, "봤습니다$1"],
  [/줬어([\s""\u201D.!?\u2026]*)$/, "줬습니다$1"],
  [/겠어([\s""\u201D.!?\u2026]*)$/, "겠습니다$1"],
  [/있어([\s""\u201D.!?\u2026]*)$/, "있습니다$1"],
  [/없어([\s""\u201D.!?\u2026]*)$/, "없습니다$1"],
  [/알아([\s""\u201D.!?\u2026]*)$/, "압니다$1"],
  [/몰라([\s""\u201D.!?\u2026]*)$/, "모릅니다$1"],
  [/뭐야([\s""\u201D.!?\u2026]*)$/, "무엇입니까$1"],
  [/그래([\s""\u201D.!?\u2026]*)$/, "그렇습니다$1"],
];

const POLITE_TO_CASUAL: [RegExp, string][] = [
  [/했어요([\s""\u201D.!?\u2026]*)$/, "했어$1"],
  [/됐어요([\s""\u201D.!?\u2026]*)$/, "됐어$1"],
  [/왔어요([\s""\u201D.!?\u2026]*)$/, "왔어$1"],
  [/갔어요([\s""\u201D.!?\u2026]*)$/, "갔어$1"],
  [/봤어요([\s""\u201D.!?\u2026]*)$/, "봤어$1"],
  [/줬어요([\s""\u201D.!?\u2026]*)$/, "줬어$1"],
  [/겠어요([\s""\u201D.!?\u2026]*)$/, "겠어$1"],
  [/있어요([\s""\u201D.!?\u2026]*)$/, "있어$1"],
  [/없어요([\s""\u201D.!?\u2026]*)$/, "없어$1"],
  [/알아요([\s""\u201D.!?\u2026]*)$/, "알아$1"],
  [/몰라요([\s""\u201D.!?\u2026]*)$/, "몰라$1"],
  [/뭐예요([\s""\u201D.!?\u2026]*)$/, "뭐야$1"],
  [/그래요([\s""\u201D.!?\u2026]*)$/, "그래$1"],
  [/맞아요([\s""\u201D.!?\u2026]*)$/, "맞아$1"],
];

const FORMAL_TO_CASUAL: [RegExp, string][] = [
  [/했습니다([\s""\u201D.!?\u2026]*)$/, "했어$1"],
  [/됐습니다([\s""\u201D.!?\u2026]*)$/, "됐어$1"],
  [/왔습니다([\s""\u201D.!?\u2026]*)$/, "왔어$1"],
  [/갔습니다([\s""\u201D.!?\u2026]*)$/, "갔어$1"],
  [/있습니다([\s""\u201D.!?\u2026]*)$/, "있어$1"],
  [/없습니다([\s""\u201D.!?\u2026]*)$/, "없어$1"],
];

const POLITE_TO_FORMAL: [RegExp, string][] = [
  [/했어요([\s""\u201D.!?\u2026]*)$/, "했습니다$1"],
  [/됐어요([\s""\u201D.!?\u2026]*)$/, "됐습니다$1"],
  [/왔어요([\s""\u201D.!?\u2026]*)$/, "왔습니다$1"],
  [/갔어요([\s""\u201D.!?\u2026]*)$/, "갔습니다$1"],
  [/있어요([\s""\u201D.!?\u2026]*)$/, "있습니다$1"],
  [/없어요([\s""\u201D.!?\u2026]*)$/, "없습니다$1"],
];

function getReplacementMap(
  from: SpeechLevel,
  to: SpeechLevel,
): [RegExp, string][] {
  if (from === "hae" && to === "haeyo") return CASUAL_TO_POLITE;
  if (from === "hae" && to === "hapsyo") return CASUAL_TO_FORMAL;
  if (from === "haeyo" && to === "hae") return POLITE_TO_CASUAL;
  if (from === "haeyo" && to === "hapsyo") return POLITE_TO_FORMAL;
  if (from === "hapsyo" && to === "hae") return FORMAL_TO_CASUAL;
  if (from === "haera" && to === "haeyo") return CASUAL_TO_POLITE;
  if (from === "haera" && to === "hapsyo") return CASUAL_TO_FORMAL;
  return [];
}

/**
 * Fix speech level violations by modifying text inside quotation marks.
 * Conservative: only fixes clear ending patterns.
 *
 * @param text - The chapter text
 * @param violations - Detected violations from detectSpeechViolations
 * @returns The corrected text
 */
export function fixSpeechViolations(
  text: string,
  violations: SpeechViolation[],
): string {
  if (violations.length === 0) return text;

  // Sort violations by position descending so replacements do not shift offsets
  const sorted = [...violations].sort((a, b) => b.position - a.position);

  let result = text;

  for (const v of sorted) {
    const replacements = getReplacementMap(v.detectedLevel, v.expectedLevel);
    if (replacements.length === 0) continue;

    // Extract the dialogue portion at this position
    const quoteMatch = result.slice(v.position).match(/^["\u201C\u300C]([^"\u201D\u300D]*?)["\u201D\u300D]/);
    if (!quoteMatch) continue;

    const fullMatch = quoteMatch[0];
    const innerText = quoteMatch[1];
    const openQuote = fullMatch[0];
    const closeQuote = fullMatch[fullMatch.length - 1];

    // Split inner text into sentences and fix each ending
    const sentenceParts = innerText.split(/([.!?\u2026]+)/);
    let modified = false;

    for (let i = 0; i < sentenceParts.length; i += 2) {
      const part = sentenceParts[i];
      if (!part || part.trim().length < 2) continue;

      for (const [pattern, replacement] of replacements) {
        if (pattern.test(part)) {
          sentenceParts[i] = part.replace(pattern, replacement);
          modified = true;
          break; // Only apply one replacement per sentence
        }
      }
    }

    if (modified) {
      const newInner = sentenceParts.join("");
      const newDialogue = openQuote + newInner + closeQuote;
      result =
        result.slice(0, v.position) +
        newDialogue +
        result.slice(v.position + fullMatch.length);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 5. Convenience: enforceSpeechLevels (combined detect + fix)
// ---------------------------------------------------------------------------

/**
 * Detect and fix speech level violations in one pass.
 * Returns the corrected text and the list of violations found.
 */
export function enforceSpeechLevels(
  text: string,
  seed: NovelSeed,
  chapterNumber: number,
  blueprint?: ChapterBlueprint,
): { text: string; violations: SpeechViolation[] } {
  const violations = detectSpeechViolations(text, seed, chapterNumber, blueprint);
  const fixedText = fixSpeechViolations(text, violations);
  return { text: fixedText, violations };
}
