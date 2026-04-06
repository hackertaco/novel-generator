import type { RuleIssue, ChapterContext, PipelineAgent, LifecycleEvent } from "./pipeline";
import { enforceLength, DEFAULT_TARGET_CHARS, DEFAULT_TOLERANCE } from "./length-enforcer";
import { enforceSpeechLevels } from "../evaluators/speech-level-enforcer";
import { evaluateConsistencyGate } from "../evaluators/consistency-gate";
import { computeDeterministicScores } from "../evaluators/deterministic-scorer";
import { detectCrossChapterInfoRepeat } from "./repetition-detector";

// ---------------------------------------------------------------------------
// Sanitize — remove LLM meta markers from generated text
// ---------------------------------------------------------------------------

export function sanitize(text: string): string {
  let result = text;

  // --- Meta-text patterns: LLM meta-instructions that leak into novel text ---
  const META_PATTERNS = [
    /수정할\s*장면.*?보내주시면[^.]*\./gs,
    /원문\s*씬을.*?드리겠습니다[^.]*\./gs,
    /대사\s*비율.*?반영한[^.]*\./gs,
    /분량\s*보강[^.]*\./gs,
    /어미\s*반복\s*완화[^.]*\./gs,
    /^\s*[-•]\s*(대사|분량|어미|수정|보정|원문).*$/gm,
  ];
  for (const pattern of META_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // Remove lines like "--- 수정 대상 ---", "--- 수정 지시 ---", "--- 문맥 ---", etc.
  result = result.replace(/^-{2,}\s*(수정|편집|문맥|수정\s*대상|수정\s*지시).*-{2,}$/gm, "");

  // Remove lines starting with "수정:" or "수정 :"
  result = result.replace(/^수정\s*:\s*.*/gm, "");

  // Remove editor note bracket lines like "[편집자 노트: ...]"
  result = result.replace(/^\[편집[^\]]*\]$/gm, "");

  // Remove LLM meta commentary that leaks into novel text
  result = result.replace(/^.*(수정본|정리했습니다|교정[된하]|다듬[었어]|윤문[했된]|아래는.*본문).{0,30}$/gm, "");

  // Remove scene meta markers from bridge stitching and LLM output
  // Covers: "## 씬 1 끝부분", "# 씬 2", "### 씬 3 시작", bare "씬 2", "수정된 씬 3"
  result = result.replace(/^#{0,6}\s*(수정된\s*)?씬\s*\d+.*$/gm, "");

  // Remove bracket/paren scene markers: "[씬 1]", "(씬 2)", "[씬 3 시작]" etc.
  result = result.replace(/^[\[(]\s*씬\s*\d+[^\])]*/gm, "").replace(/^[\])]\s*$/gm, "");
  result = result.replace(/[\[(]씬\s*\d+[^\])]*[\])]/g, "");

  // Remove any markdown header line with Korean text (header leak into novel text)
  // e.g. "# 장면 전환", "## 다음 날 아침", "### 에필로그"
  result = result.replace(/^#{1,6}\s+[가-힣].*$/gm, "");

  // Convert scene transition separators to plain scene break markers
  // e.g. "--- 씬 전환 ---", "--- 장면 전환 ---", "--- 씬 1 끝 ---"
  result = result.replace(/^-{2,}\s*.*?(씬|장면)\s*(전환|끝|시작|\d+).*?-{2,}$/gm, "***");

  // Remove LLM format acknowledgments and meta markers
  result = result.replace(/^(출력은|결과물은|아래는|다음은).*?(형식|포맷|요청).*$/gm, "");
  result = result.replace(/^\[(원문|계속|이어서|다음|원본)\]$/gm, "");

  // Remove editorial headers: "## 교정 결과", "### 수정 사항" etc.
  result = result.replace(/^#{1,3}\s*(교정|수정|편집|윤문|개선).*$/gm, "");

  // Collapse multiple blank lines left behind by removals
  result = result.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
}

// ---------------------------------------------------------------------------
// DeduplicateScenes — remove scene-level duplication via n-gram similarity
// ---------------------------------------------------------------------------

/**
 * Compute character bigram set from a string (for Jaccard similarity).
 */
function charBigrams(text: string): Set<string> {
  const normalized = text.replace(/\s+/g, " ").trim();
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

/**
 * Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Remove scene-level duplication.
 *
 * 1. Split text by scene break markers (`***`).
 * 2. For each pair of scenes, compute Jaccard similarity of character bigrams.
 *    If two scenes have >60% overlap, drop the later one.
 * 3. Within a single scene longer than 3000 chars, check if the two halves
 *    are similar (>50% overlap). If so, keep only the first half.
 */
/**
 * Extract Korean proper nouns from text. Returns a set of unique entities.
 */
function extractNamedEntities(text: string): Set<string> {
  const entities = new Set<string>();
  const pattern = /([가-힣]{2,5})(?:[은는이가을를의에서로와과도만]|\s)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    entities.add(match[1]);
  }
  return entities;
}

/**
 * Compute overlap of named entities between two text segments.
 * High overlap (>0.7) suggests the same characters/places appear in both.
 */
function namedEntityOverlap(a: string, b: string): number {
  const entA = extractNamedEntities(a);
  const entB = extractNamedEntities(b);
  if (entA.size === 0 || entB.size === 0) return 0;
  let intersection = 0;
  for (const e of entA) {
    if (entB.has(e)) intersection++;
  }
  return intersection / Math.min(entA.size, entB.size);
}

/**
 * Detect "scene restart" — a paragraph that re-introduces the same location+time
 * as an earlier paragraph, signaling the LLM rewrote the same scene.
 * Returns the index of the restart paragraph, or -1.
 */
function detectSceneRestart(paragraphs: string[]): number {
  // Extract location keywords from the first 3 paragraphs (the scene opening)
  const openingText = paragraphs.slice(0, 3).join(" ");
  const PLACE_SUFFIXES = "대성당|성당|연회장|집무실|궁전|궁|저택|광장|복도|서재|홀|방|온실|제단|통로|침실|서고|회랑";
  const locationWords = openingText.match(new RegExp(`(?:[가-힣]+\\s*)?(?:${PLACE_SUFFIXES})`, "g")) || [];
  if (locationWords.length === 0) return -1;

  // A scene restart must:
  // 1. Paragraph STARTS with a known location (in first 30 chars)
  // 2. Contains a time marker (정오, 밤, 아침, 새벽, 저녁, 당일, 직전 etc.)
  // 3. Is at least 40% into the text
  // 4. The paragraph is long (>60 chars) — scene openings describe multiple things
  const TIME_WORDS = /정오|밤|아침|새벽|저녁|당일|직전|직후|한낮|황혼|자정|해가|달이|날이/;
  for (let i = Math.max(4, Math.floor(paragraphs.length * 0.4)); i < paragraphs.length; i++) {
    const para = paragraphs[i];
    if (para.length < 60) continue;
    // Location must appear in the first 30 characters (scene opening, not mid-mention)
    const paraStart = para.slice(0, 30);
    const hasLocationAtStart = locationWords.some(loc => paraStart.includes(loc));
    const hasTimeWord = TIME_WORDS.test(para);
    if (hasLocationAtStart && hasTimeWord) {
      return i;
    }
  }
  return -1;
}

export function deduplicateScenes(text: string): string {
  // Step 0: Detect scene restart within continuous text (no *** break)
  const paragraphs = text.split("\n\n").map(p => p.trim()).filter(p => p.length > 0);
  const restartIdx = detectSceneRestart(paragraphs);
  if (restartIdx > 0) {
    // Keep only paragraphs before the restart
    text = paragraphs.slice(0, restartIdx).join("\n\n");
  }

  // Split on scene break markers (*** possibly surrounded by whitespace)
  const sceneBreakPattern = /\n\s*\*{3,}\s*\n/;
  const scenes = text.split(sceneBreakPattern).map(s => s.trim()).filter(s => s.length > 0);

  if (scenes.length === 0) return text;

  // Step 1: Remove duplicate scenes (compare each pair, keep the first)
  const kept: string[] = [];
  const keptBigrams: Set<string>[] = [];

  for (const scene of scenes) {
    const bg = charBigrams(scene);
    let isDuplicate = false;
    for (const prevBg of keptBigrams) {
      if (jaccardSimilarity(bg, prevBg) > 0.6) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      kept.push(scene);
      keptBigrams.push(bg);
    }
  }

  // Step 2: Within each remaining scene, check for internal duplication
  // Uses both bigram similarity AND named entity overlap for semantic dedup
  const result: string[] = [];
  for (const scene of kept) {
    if (scene.length > 3000) {
      // Split roughly in half at a paragraph boundary near the midpoint
      const mid = Math.floor(scene.length / 2);
      let splitIdx = scene.lastIndexOf("\n\n", mid + 200);
      if (splitIdx < mid - 200 || splitIdx < 0) {
        splitIdx = scene.indexOf("\n\n", mid - 200);
      }
      if (splitIdx > 0 && splitIdx < scene.length - 100) {
        const firstHalf = scene.slice(0, splitIdx).trim();
        const secondHalf = scene.slice(splitIdx).trim();
        const bigramSim = jaccardSimilarity(charBigrams(firstHalf), charBigrams(secondHalf));
        const entitySim = namedEntityOverlap(firstHalf, secondHalf);
        // Either high bigram similarity OR high entity overlap with moderate bigrams
        if (bigramSim > 0.5 || (entitySim > 0.7 && bigramSim > 0.2)) {
          result.push(firstHalf);
          continue;
        }
      }
    }
    result.push(scene);
  }

  return result.join("\n\n***\n\n");
}

// ---------------------------------------------------------------------------
// DeduplicateParagraphs — remove repeat paragraphs (exact or near-match)
// ---------------------------------------------------------------------------

export function deduplicateParagraphs(text: string): string {
  const paragraphs = text.split("\n\n").map((p) => p.trim()).filter((p) => p.length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const para of paragraphs) {
    // Use first 50 characters as the fingerprint
    const fingerprint = para.slice(0, 50);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(para);
    }
  }

  return unique.join("\n\n");
}

// ---------------------------------------------------------------------------
// FixEndingRepeat — deterministic ending variation (no LLM)
// ---------------------------------------------------------------------------

/**
 * Fix ending repeats by merging the 2nd sentence of a 3-run into the 3rd
 * using a connective ending (~었고, / ~였으며, / ~인 채).
 *
 * Example:
 *   "문은 닫혀 있었다. 정원사가 흙을 고르고 있었다. 그녀는 가까이 붙었다."
 * → "문은 닫혀 있었다. 정원사가 흙을 고르고 있었고, 그녀는 가까이 붙었다."
 */
export function fixEndingRepeat(text: string): string {
  const paragraphs = text.split("\n\n");
  let changed = false;

  const connectives: Record<string, string[]> = {
    "었다": ["었고,", "었으며,"],
    "였다": ["였고,", "였으며,"],
    "렸다": ["렸고,", "렸으며,"],
    "했다": ["했고,", "했으며,"],
    "니다": ["니다만,", "는데,"],
    "는다": ["는데,", "으며,"],
    "인다": ["인데,", "이며,"],
    "는지": ["는지,", "는지는 모르겠으나"],
    "왔다": ["왔고,", "왔으며,"],
    "갔다": ["갔고,", "갔으며,"],
    "졌다": ["졌고,", "졌으며,"],
    "났다": ["났고,", "났으며,"],
    "셨다": ["셨고,", "셨으며,"],
  };

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = paragraphs[pi]
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length < 3) continue;

    const fixed = [...sentences];
    let i = 0;
    while (i < fixed.length - 2) {
      const e1 = fixed[i].match(/(.{2})[.]\s*$/)?.[1];
      const e2 = fixed[i + 1].match(/(.{2})[.]\s*$/)?.[1];
      const e3 = fixed[i + 2].match(/(.{2})[.]\s*$/)?.[1];

      if (e1 && e1 === e2 && e2 === e3) {
        // Merge sentence i+1 into sentence i+2 using connective
        const options = connectives[e2] || [`${e2.slice(-1)}고,`];
        const replacement = options[0];
        // Replace "었다." at end of sentence i+1 with connective
        const merged = fixed[i + 1].replace(/(.{2})[.]\s*$/, replacement);
        // Lowercase first char of sentence i+2 (Korean doesn't have case, just merge)
        fixed[i + 1] = merged + " " + fixed[i + 2];
        fixed.splice(i + 2, 1);
        changed = true;
        i += 2; // skip past the merged sentence
      } else {
        i++;
      }
    }

    if (changed) {
      paragraphs[pi] = fixed.join(" ");
    }
  }

  return changed ? paragraphs.join("\n\n") : text;
}

// ---------------------------------------------------------------------------
// FixSentenceStartRepeat — replace repeated name with pronoun
// ---------------------------------------------------------------------------

/**
 * When 3+ consecutive sentences start with the same name,
 * replace the 2nd sentence's name with a pronoun (그/그녀).
 */
export function fixSentenceStartRepeat(
  text: string,
  characterGenders?: Map<string, string>,
): string {
  const paragraphs = text.split("\n\n");
  let changed = false;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = paragraphs[pi]
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length < 3) continue;

    const fixed = [...sentences];
    let i = 0;
    while (i < fixed.length - 2) {
      const s1 = fixed[i].trimStart().slice(0, 3);
      const s2 = fixed[i + 1].trimStart().slice(0, 3);
      const s3 = fixed[i + 2].trimStart().slice(0, 3);

      if (s1.length >= 2 && s1 === s2 && s2 === s3) {
        const nameMatch = fixed[i + 1].match(/^([가-힣]{2,}[이가은는의]?\s?)/);
        if (nameMatch) {
          const name = nameMatch[1].replace(/[이가은는의]\s?$/, "");
          const gender = characterGenders?.get(name);
          const pronoun = gender === "female" ? "그녀는" : "그는";
          fixed[i + 1] = fixed[i + 1].replace(nameMatch[1], pronoun + " ");
          changed = true;
        }
        i += 3;
      } else {
        i++;
      }
    }

    if (changed) {
      paragraphs[pi] = fixed.join(" ");
    }
  }

  return changed ? paragraphs.join("\n\n") : text;
}

// ---------------------------------------------------------------------------
// DeduplicateSentences — remove repeated sentences within/across paragraphs
// ---------------------------------------------------------------------------

/**
 * Remove duplicate sentences that appear within the same chapter.
 * This catches bridge-stitching artifacts where the same sentence
 * appears twice in adjacent paragraphs or within the same paragraph.
 */
export function deduplicateSentences(text: string): string {
  const paragraphs = text.split("\n\n");
  const seenSentences = new Set<string>();
  const result: string[] = [];

  for (const para of paragraphs) {
    const sentences = para
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const uniqueSentences: string[] = [];
    for (const sent of sentences) {
      // Use first 30 chars as fingerprint (handles minor trailing differences)
      const fp = sent.slice(0, 30);
      if (fp.length >= 15 && seenSentences.has(fp)) {
        continue; // skip duplicate
      }
      seenSentences.add(fp);
      uniqueSentences.push(sent);
    }

    if (uniqueSentences.length > 0) {
      result.push(uniqueSentences.join(" "));
    }
  }

  return result.join("\n\n");
}

// ---------------------------------------------------------------------------
// Sentence splitting helper
// ---------------------------------------------------------------------------

/**
 * Split text into individual sentences.
 * Handles Korean sentence endings (다., 요., 지., 나., 까.) and standard punctuation.
 */
function splitSentences(text: string): string[] {
  // Split on whitespace that follows a sentence-ending punctuation character.
  // Korean sentences typically end with 다. 요. 지. 나. 까. or plain . ! ?
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences;
}

// ---------------------------------------------------------------------------
// DetectEndingRepeat
// ---------------------------------------------------------------------------

/**
 * Extract the 2-character ending suffix before the final punctuation mark.
 * e.g. "걸었다." → "었다", "웃었다!" → "었다"
 */
function extractEnding(sentence: string): string | null {
  // Match the two chars immediately before a terminal punctuation
  const match = sentence.match(/(.{2})[.!?]\s*$/);
  return match ? match[1] : null;
}

export function detectEndingRepeat(text: string): RuleIssue[] {
  const paragraphs = text.split("\n\n");
  const issues: RuleIssue[] = [];

  paragraphs.forEach((para, paraIndex) => {
    const sentences = splitSentences(para);
    if (sentences.length < 3) return;

    let runStart = 0;
    let runLength = 1;
    let currentEnding = extractEnding(sentences[0]);

    for (let i = 1; i < sentences.length; i++) {
      const ending = extractEnding(sentences[i]);
      if (ending !== null && ending === currentEnding) {
        runLength++;
        if (runLength >= 3) {
          // Only emit one issue per run (when we first hit 3)
          if (runLength === 3) {
            issues.push({
              type: "ending_repeat",
              position: paraIndex,
              detail: `문장 ${runStart + 1}~${i + 1}: 어미 "${currentEnding}" 반복`,
            });
          }
        }
      } else {
        runStart = i;
        runLength = 1;
        currentEnding = ending;
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// DetectSentenceStartRepeat
// ---------------------------------------------------------------------------

/**
 * Extract the first 2 characters of a trimmed sentence.
 * e.g. "그는 걸었다." → "그는"
 */
function extractStart(sentence: string): string {
  return sentence.trimStart().slice(0, 2);
}

export function detectSentenceStartRepeat(text: string): RuleIssue[] {
  const paragraphs = text.split("\n\n");
  const issues: RuleIssue[] = [];

  paragraphs.forEach((para, paraIndex) => {
    const sentences = splitSentences(para);
    if (sentences.length < 3) return;

    let runStart = 0;
    let runLength = 1;
    let currentStart = extractStart(sentences[0]);

    for (let i = 1; i < sentences.length; i++) {
      const start = extractStart(sentences[i]);
      if (start === currentStart) {
        runLength++;
        if (runLength >= 3) {
          if (runLength === 3) {
            issues.push({
              type: "sentence_start_repeat",
              position: paraIndex,
              detail: `문장 ${runStart + 1}~${i + 1}: 문장 시작 "${currentStart}" 반복`,
            });
          }
        }
      } else {
        runStart = i;
        runLength = 1;
        currentStart = start;
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// Short dialogue sequence detection
// ---------------------------------------------------------------------------

/**
 * Detect chains of short dialogue lines without meaningful narration between them.
 * "Short" = dialogue text (excluding quotes/punctuation) is 5 chars or fewer.
 * "Meaningful narration" = non-dialogue text of 6+ chars between two dialogues.
 * Chains of 3+ short dialogues trigger issues.
 */
export function detectShortDialogueSequence(text: string): RuleIssue[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const issues: RuleIssue[] = [];
  const dPattern = /[""\u201C]([^""\u201D]*?)[""\u201D]/g;

  let chainStart = -1;
  let chainCount = 0;
  let veryShortCount = 0;

  const flushChain = (endLine: number) => {
    if (chainCount >= 3) {
      const severity = chainCount >= 5 || veryShortCount / chainCount >= 0.75 ? "critical" : "warning";
      issues.push({
        type: "short_dialogue_sequence",
        position: chainStart,
        detail: `${chainStart + 1}~${endLine}행: 짧은 대사 ${chainCount}개가 서술 없이 연속됩니다. 대사 사이에 행동/감정 묘사를 추가하세요.`,
        severity,
      });
    }
    chainCount = 0;
    veryShortCount = 0;
    chainStart = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const dialogues: string[] = [];
    let match: RegExpExecArray | null;
    dPattern.lastIndex = 0;

    while ((match = dPattern.exec(line)) !== null) {
      dialogues.push(match[1]);
    }

    if (dialogues.length === 0) {
      // Pure narration — meaningful if 6+ chars
      const pureText = line.replace(/[""\u201C\u201D]/g, "").trim();
      if (pureText.length >= 6) flushChain(i);
      continue;
    }

    for (const d of dialogues) {
      const cleaned = d.replace(/[.!?…。\s]/g, "");
      if (cleaned.length <= 5) {
        if (chainStart === -1) chainStart = i;
        chainCount++;
        if (cleaned.length <= 2) veryShortCount++;
      } else {
        flushChain(i);
      }
    }

    // Check narration after dialogue in same line
    const afterDialogue = line.replace(dPattern, "").trim();
    if (afterDialogue.length >= 6 && chainCount > 0) {
      flushChain(i);
    }
  }

  flushChain(lines.length);
  return issues;
}

// ---------------------------------------------------------------------------
// TrimPostHookPadding — remove weak mood-summary paragraphs after a hook line
// ---------------------------------------------------------------------------

/** Keywords signaling crisis / revelation in a short hook line. */
const HOOK_CRISIS_KEYWORDS =
  /[죽독칼피비밀진실배신저주복수살인음모함정독약암살반역멸망파멸]/;

/** Mood / summary filler words that add no new information. */
const PADDING_WORDS = [
  "침묵",
  "고요",
  "정적",
  "조용",
  "남아 있었다",
  "그렇게",
  "길고 무거",
  "얼어붙",
  "숨을 죽",
  "무거운 침묵",
  "아무도 말",
  "아무 말",
  "그 말이",
  "여운",
  "잔향",
  "그 순간",
  "시간이 멈",
];

const PADDING_PATTERN = new RegExp(PADDING_WORDS.map(w => w.replace(/\s/g, "\\s*")).join("|"));

/**
 * Detect whether a paragraph qualifies as a "hook candidate" —
 * a strong cliffhanger line near the end of the chapter.
 */
function isHookCandidate(para: string): boolean {
  const trimmed = para.trim();

  // Ends with question mark
  if (trimmed.endsWith("?")) return true;

  // Ends with ellipsis
  if (/[.]{3}$|…$/.test(trimmed)) return true;

  // Short line (< 40 chars) with crisis/revelation keywords
  if (trimmed.length < 40 && HOOK_CRISIS_KEYWORDS.test(trimmed)) return true;

  // Dialogue with tension keywords — e.g. "누가 당신을 죽이려 했는지."
  const hasQuote = /[""\u201C\u201D]/.test(trimmed);
  if (hasQuote && HOOK_CRISIS_KEYWORDS.test(trimmed)) return true;

  return false;
}

/**
 * Detect whether a paragraph is "padding" — a mood summary that weakens
 * a preceding hook. Must be conservative: only clearly filler paragraphs.
 */
function isPaddingParagraph(para: string): boolean {
  const trimmed = para.trim();

  // Must not be empty
  if (trimmed.length === 0) return false;

  // If it contains dialogue, it might carry new information — keep it
  if (/[""\u201C\u201D]/.test(trimmed)) return false;

  // Must contain at least one padding word
  if (!PADDING_PATTERN.test(trimmed)) return false;

  // Must be relatively short (long paragraphs likely have real content)
  if (trimmed.length > 80) return false;

  return true;
}

/**
 * Scan the last 5 paragraphs for a hook candidate. If found and there
 * are trailing padding paragraphs after it, remove them.
 *
 * Conservative: only removes clearly padding paragraphs after a clear hook.
 */
export function trimPostHookPadding(text: string): string {
  const paragraphs = text.split("\n\n").map(p => p.trim()).filter(p => p.length > 0);

  if (paragraphs.length < 2) return text;

  // Scan last 5 paragraphs for a hook candidate that has trailing content.
  // We search forward from the window start so we find the hook that
  // maximizes the amount of trailing padding we can remove.
  const searchStart = Math.max(0, paragraphs.length - 5);
  let hookIndex = -1;

  for (let i = searchStart; i < paragraphs.length - 1; i++) {
    if (isHookCandidate(paragraphs[i])) {
      // Verify at least the immediate next paragraph is padding —
      // this avoids picking a "hook" whose trailing content is real.
      if (isPaddingParagraph(paragraphs[i + 1])) {
        hookIndex = i;
        // Keep scanning; a later hook is better if it also has trailing padding
      }
    }
  }

  // No hook found — return unchanged
  if (hookIndex === -1) return text;

  // No trailing paragraphs after hook — nothing to trim
  if (hookIndex >= paragraphs.length - 1) return text;

  // Check if ALL paragraphs after the hook are padding
  const trailing = paragraphs.slice(hookIndex + 1);
  const allPadding = trailing.every(p => isPaddingParagraph(p));

  if (!allPadding) return text;

  // Remove trailing padding paragraphs
  return paragraphs.slice(0, hookIndex + 1).join("\n\n");
}

// ---------------------------------------------------------------------------
// RuleGuardAgent — PipelineAgent implementation
// ---------------------------------------------------------------------------

export class RuleGuardAgent implements PipelineAgent {
  name = "rule-guard";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "rule_check" };

    ctx.text = sanitize(ctx.text);
    ctx.text = deduplicateScenes(ctx.text);
    ctx.text = deduplicateParagraphs(ctx.text);
    ctx.text = deduplicateSentences(ctx.text);
    ctx.text = fixEndingRepeat(ctx.text);

    // Trim mood-summary padding after a strong hook ending
    ctx.text = trimPostHookPadding(ctx.text);

    // Fix sentence start repetition (e.g., "세레인이... 세레인은... 세레인의..." → pronoun)
    const genderMap = new Map<string, string>();
    for (const c of ctx.seed.characters) {
      genderMap.set(c.name, c.gender || "male");
      // Also map first 2 chars of name for partial matching
      if (c.name.length >= 2) genderMap.set(c.name.slice(0, 2), c.gender || "male");
    }
    ctx.text = fixSentenceStartRepeat(ctx.text, genderMap);

    // Speech level enforcement — fix Korean 화계 violations based on social_rank
    const speechResult = enforceSpeechLevels(
      ctx.text,
      ctx.seed,
      ctx.chapterNumber,
      ctx.blueprint,
    );
    ctx.text = speechResult.text;

    // Length enforcement — trim low-density paragraphs if too long
    const mustRevealKeywords = ctx.blueprint?.scenes
      ?.flatMap((s) => s.must_reveal ?? [])
      .flatMap((fact) => fact.match(/[가-힣]{3,}/g) ?? []) ?? [];
    const lengthResult = enforceLength(
      ctx.text,
      DEFAULT_TARGET_CHARS,
      DEFAULT_TOLERANCE,
      mustRevealKeywords,
    );
    ctx.text = lengthResult.text;

    // POV consistency check
    const consistencyGateResult = evaluateConsistencyGate(
      ctx.text,
      ctx.seed.characters,
      ctx.blueprint?.pov,
      ctx.previousCharacterStates,
    );
    const povIssues: RuleIssue[] = consistencyGateResult.issues
      .filter((issue) => issue.type === "pov_inconsistency")
      .map((issue) => ({
        type: "pov_inconsistency" as const,
        position: issue.position ?? 0,
        detail: `[시점 불일치] ${issue.description}`,
        severity: issue.severity === "critical" ? "critical" as const : "warning" as const,
      }));

    const companionIssues: RuleIssue[] = consistencyGateResult.issues
      .filter((issue) => issue.type === "companion_discontinuity")
      .map((issue) => ({
        type: "companion_discontinuity" as const,
        position: issue.position ?? 0,
        detail: `[동선 불연속] ${issue.description}`,
        severity: "critical" as const,
      }));

    // Cross-chapter info repeat detection
    const infoRepeatIssues: RuleIssue[] = [];
    if (ctx.previousFacts && ctx.previousFacts.length > 0) {
      const infoRepeat = detectCrossChapterInfoRepeat(ctx.text, ctx.previousFacts);
      for (const detail of infoRepeat.details) {
        infoRepeatIssues.push({
          type: "info_repeat" as const,
          position: 0,
          detail: `[정보 반복] ${detail}`,
          severity: "warning" as const,
        });
      }
    }

    ctx.ruleIssues = [
      ...detectEndingRepeat(ctx.text),
      ...detectSentenceStartRepeat(ctx.text),
      ...detectShortDialogueSequence(ctx.text),
      ...detectMissingInformation(ctx.text, ctx.blueprint),
      ...speechResult.violations.map((v) => ({
        type: "speech_level_violation" as const,
        position: v.position,
        detail: `[화계 위반] ${v.speaker}->${v.listener}: "${v.dialogueText.slice(0, 30)}..." 감지=${v.detectedLevel}, 기대=${v.expectedLevel}`,
        severity: "warning" as const,
      })),
      ...povIssues,
      ...companionIssues,
      ...infoRepeatIssues,
    ];

    // Compute deterministic score so bestScore is always populated,
    // even in fast preset where QualityLoop/StateMachine are disabled.
    const detScores = computeDeterministicScores(ctx.text, ctx.seed, ctx.chapterNumber, undefined, ctx.blueprint, ctx.previousCharacterStates);
    ctx.bestScore = Math.max(ctx.bestScore, detScores.overall);
    ctx.snapshots.push({ text: ctx.text, score: detScores.overall, iteration: 0 });
  }
}

// ---------------------------------------------------------------------------
// DetectMissingInformation — check must_reveal facts against actual text
// ---------------------------------------------------------------------------

/**
 * Check if blueprint's must_reveal facts actually appear in the written text.
 * Uses keyword extraction from each fact and checks presence in text.
 */
function detectMissingInformation(
  text: string,
  blueprint?: { scenes: Array<{ must_reveal?: string[] }> },
): RuleIssue[] {
  if (!blueprint || !blueprint.scenes) return [];

  const issues: RuleIssue[] = [];
  const normalizedText = text.replace(/\s+/g, " ").toLowerCase();

  for (const scene of blueprint.scenes) {
    if (!scene.must_reveal) continue;
    for (const fact of scene.must_reveal) {
      // Extract meaningful keywords (3+ char Korean words) from the fact
      const keywords = fact.match(/[가-힣]{3,}/g) || [];
      if (keywords.length === 0) continue;

      // Check if at least half the keywords appear in text
      const found = keywords.filter((kw) => normalizedText.includes(kw.toLowerCase()));
      if (found.length < Math.ceil(keywords.length * 0.5)) {
        issues.push({
          type: "consistency" as const,
          position: 0,
          detail: `[정보 누락] 블루프린트에서 요구한 팩트가 본문에 없습니다: "${fact}" (키워드 ${found.length}/${keywords.length} 매칭)`,
          severity: "warning",
        });
      }
    }
  }

  return issues;
}
