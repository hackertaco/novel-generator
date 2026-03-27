/**
 * Readability Pacing evaluator — measures three critical readability dimensions.
 *
 * No LLM calls — pure computation.
 *
 * AI novels often score high on surface metrics but feel hard to read because of:
 * 1. Camera whiplash: focus shifts every paragraph
 * 2. Information overload: events pile up without breathing room
 * 3. Missing causality: atmospheric descriptions without explaining WHY
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReadabilityPacingResult {
  score: number; // 0-1 overall
  focusStability: number; // 0-1
  informationSpacing: number; // 0-1
  causalExplicitness: number; // 0-1
  details: {
    focusShiftsPerParagraph: number;
    eventToReactionRatio: number;
    causalToDescriptiveRatio: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitParagraphs(text: string): string[] {
  return text.split("\n\n").filter((p) => p.trim().length > 0);
}

// ---------------------------------------------------------------------------
// 1. Focus Stability (초점 안정성) — 40% weight
// ---------------------------------------------------------------------------

/**
 * Korean pronouns that refer back to a previously named subject.
 * Maps pronoun to a tag so we can group them.
 */
const PRONOUN_GROUPS: Record<string, string> = {
  "그는": "__he__",
  "그가": "__he__",
  "그의": "__he__",
  "그에게": "__he__",
  "그녀는": "__she__",
  "그녀가": "__she__",
  "그녀의": "__she__",
  "그녀에게": "__she__",
};

/** Extract the main subject/focus of a paragraph from its opening. */
function extractFocus(paragraph: string): string | null {
  const trimmed = paragraph.trim();

  // Skip dialogue-only paragraphs
  if (/^[""「]/.test(trimmed)) return null;

  // Check for pronoun at paragraph start
  for (const [pronoun, tag] of Object.entries(PRONOUN_GROUPS)) {
    if (trimmed.startsWith(pronoun)) return tag;
  }

  // Look for topic/subject particles near the start (first ~40 chars)
  const head = trimmed.slice(0, 60);

  // Pattern: name + topic/subject particle (은/는/이/가)
  const subjectMatch = head.match(/^([가-힣]{1,6}(?:은|는|이|가))/);
  if (subjectMatch) {
    // Strip particle to get the base name
    const full = subjectMatch[1];
    const base = full.replace(/[은는이가]$/, "");
    return base;
  }

  // Pattern: name appearing at sentence start without particle
  const nameMatch = head.match(/^([가-힣]{2,4})[을를에의과와]/);
  if (nameMatch) {
    return nameMatch[1];
  }

  return null;
}

/** Check if two focus strings refer to the same entity. */
function isSameFocus(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  if (a === b) return true;

  // Pronoun and name can match — but we can't resolve without context,
  // so treat pronouns as maintaining focus (same pronoun = same focus)
  // Different pronouns switching (__he__ -> __she__) = focus shift
  return false;
}

function measureFocusStability(paragraphs: string[]): { score: number; shiftsPerParagraph: number } {
  if (paragraphs.length < 2) return { score: 1, shiftsPerParagraph: 0 };

  const focuses = paragraphs.map(extractFocus);
  let shifts = 0;
  let comparisons = 0;

  for (let i = 1; i < focuses.length; i++) {
    // Skip if either paragraph has no detectable focus (e.g., dialogue)
    if (focuses[i] === null || focuses[i - 1] === null) continue;
    comparisons++;
    if (!isSameFocus(focuses[i], focuses[i - 1])) {
      shifts++;
    }
  }

  if (comparisons === 0) return { score: 0.7, shiftsPerParagraph: 0 };

  const shiftsPerParagraph = shifts / comparisons;

  // Check for sustained focus runs (3+ consecutive same focus = bonus)
  let maxRun = 1;
  let currentRun = 1;
  for (let i = 1; i < focuses.length; i++) {
    if (focuses[i] !== null && isSameFocus(focuses[i], focuses[i - 1])) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  // Score: 60%+ consecutive pairs sharing focus = good
  const stabilityRatio = comparisons > 0 ? 1 - (shifts / comparisons) : 0.5;

  // Ideal: stabilityRatio >= 0.6
  let score: number;
  if (stabilityRatio >= 0.6) {
    score = 0.8 + (stabilityRatio - 0.6) * 0.5; // 0.8 ~ 1.0
  } else if (stabilityRatio >= 0.4) {
    score = 0.5 + (stabilityRatio - 0.4) * 1.5; // 0.5 ~ 0.8
  } else {
    score = stabilityRatio * 1.25; // 0 ~ 0.5
  }

  // Bonus for sustained runs of 3+
  if (maxRun >= 3) score = Math.min(1, score + 0.1);

  return { score: Math.max(0, Math.min(1, score)), shiftsPerParagraph: Math.round(shiftsPerParagraph * 100) / 100 };
}

// ---------------------------------------------------------------------------
// 2. Information Spacing (정보 간격) — 35% weight
// ---------------------------------------------------------------------------

/** Korean EVENT markers — action verbs, new information */
const EVENT_MARKERS = /열었다|터졌다|쏟았다|뽑았다|꺼냈다|던졌다|찔렀다|베었다|깨졌다|폭발|부딪|넘어|쓰러|달려|뛰어|잡았다|놓았다|끊었다|올렸다|내렸다|밀었다|당겼다|쳤다|때렸다|막았다|피했다|나타났다|사라졌다|들어왔다|나갔다|도착했다|떠났다/;

/** Korean REACTION markers — internal thought, emotion, processing */
const REACTION_MARKERS = /느꼈다|생각했다|깨달았다|알았다|이해했다|떠올렸다|숨을\s*삼|가슴이|심장이|온몸이|손이\s*떨|눈을\s*감|고개를\s*숙|한숨|멍하니|바라보|응시|침묵|조용히|가만히|천천히|잠시|순간\s*멈|멈추었다|멈췄다/;

/** Dialogue with new information counts as event */
const NEW_INFO_DIALOGUE = /[""「][^""」]*[가-힣]+[했갔봤왔줬찾][^""」]*[""」]/;

type ParagraphType = "EVENT" | "REACTION" | "NEUTRAL";

function classifyParagraph(paragraph: string): ParagraphType {
  const isDialogue = /^[""「]/.test(paragraph.trim());

  const eventCount = (paragraph.match(new RegExp(EVENT_MARKERS.source, "g")) || []).length;
  const reactionCount = (paragraph.match(new RegExp(REACTION_MARKERS.source, "g")) || []).length;

  // Dialogue with new info = event
  if (isDialogue && NEW_INFO_DIALOGUE.test(paragraph)) {
    return "EVENT";
  }

  if (eventCount > reactionCount && eventCount > 0) return "EVENT";
  if (reactionCount > eventCount && reactionCount > 0) return "REACTION";
  if (eventCount > 0 && reactionCount > 0) return "NEUTRAL";

  return "NEUTRAL";
}

function measureInformationSpacing(paragraphs: string[]): { score: number; eventToReactionRatio: number } {
  if (paragraphs.length < 3) return { score: 0.7, eventToReactionRatio: 1 };

  const types = paragraphs.map(classifyParagraph);

  let eventCount = 0;
  let reactionCount = 0;
  let consecutiveEvents = 0;
  let maxConsecutiveEvents = 0;
  let eventEventPairs = 0;
  let totalEventPairs = 0;

  for (let i = 0; i < types.length; i++) {
    if (types[i] === "EVENT") {
      eventCount++;
      consecutiveEvents++;
      maxConsecutiveEvents = Math.max(maxConsecutiveEvents, consecutiveEvents);
    } else {
      if (types[i] === "REACTION") reactionCount++;
      consecutiveEvents = 0;
    }

    // Check consecutive EVENT pairs
    if (i > 0 && types[i] === "EVENT" && types[i - 1] === "EVENT") {
      eventEventPairs++;
    }
    if (i > 0 && types[i] === "EVENT") {
      totalEventPairs++;
    }
  }

  const eventToReactionRatio = reactionCount > 0 ? eventCount / reactionCount : eventCount > 0 ? eventCount : 1;

  let score = 0.7; // baseline

  // Ideal: event-to-reaction ratio 1:1 to 2:1
  if (eventToReactionRatio >= 1 && eventToReactionRatio <= 2) {
    score = 1.0;
  } else if (eventToReactionRatio > 2 && eventToReactionRatio <= 3) {
    score = 0.7;
  } else if (eventToReactionRatio > 3) {
    score = 0.4;
  } else if (eventToReactionRatio < 1 && eventToReactionRatio >= 0.5) {
    score = 0.8; // slightly too many reactions, still OK
  } else {
    score = 0.6;
  }

  // Penalty for consecutive EVENT pairs
  if (totalEventPairs > 0) {
    const eventEventRatio = eventEventPairs / totalEventPairs;
    score -= eventEventRatio * 0.2;
  }

  // Heavy penalty for 3+ consecutive events
  if (maxConsecutiveEvents >= 3) {
    score -= (maxConsecutiveEvents - 2) * 0.15;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    eventToReactionRatio: Math.round(eventToReactionRatio * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// 3. Causal Explicitness (인과 명시성) — 25% weight
// ---------------------------------------------------------------------------

/** Phenomenon-only descriptions: pure sensory without explanation */
const PHENOMENON_MARKERS = /소리가|냄새가|시선이|그림자가|빛이|바람이|연기가|피가|물이|열기가|냉기가|기운이|안개가|먼지가/;

/** Causal/reasoning connectors */
const CAUSAL_MARKERS = /왜냐하면|때문에|그래서|라는\s*뜻|이라면|깨달았다|알았다|이해했다|눈치챘다|짐작했다|추측했다|판단했다/;

/** Protagonist reasoning markers */
const REASONING_MARKERS = /한\s*가지\s*확실한\s*건|그\s*말은|즉|다시\s*말해|결국|셈이|의미는|뜻은|이유는|원인은/;

function measureCausalExplicitness(paragraphs: string[]): { score: number; causalToDescriptiveRatio: number } {
  const fullText = paragraphs.join("\n\n");

  if (paragraphs.length < 2) return { score: 0.7, causalToDescriptiveRatio: 1 };

  const phenomenonCount = (fullText.match(new RegExp(PHENOMENON_MARKERS.source, "g")) || []).length;
  const causalCount = (fullText.match(new RegExp(CAUSAL_MARKERS.source, "g")) || []).length;
  const reasoningCount = (fullText.match(new RegExp(REASONING_MARKERS.source, "g")) || []).length;

  const totalCausal = causalCount + reasoningCount;
  const causalToDescriptiveRatio = phenomenonCount > 0 ? totalCausal / phenomenonCount : totalCausal > 0 ? 1 : 0.5;

  // Ideal: at least 1 causal explanation per 3 phenomenon descriptions
  // i.e., ratio >= 0.33
  let score: number;
  if (causalToDescriptiveRatio >= 0.5) {
    score = 1.0;
  } else if (causalToDescriptiveRatio >= 0.33) {
    score = 0.8 + (causalToDescriptiveRatio - 0.33) * 1.18; // 0.8 ~ 1.0
  } else if (causalToDescriptiveRatio >= 0.15) {
    score = 0.5 + (causalToDescriptiveRatio - 0.15) * 1.67; // 0.5 ~ 0.8
  } else {
    score = causalToDescriptiveRatio * 3.33; // 0 ~ 0.5
  }

  // If no phenomena at all, it's not a problem — give neutral score
  if (phenomenonCount === 0) {
    score = 0.7;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    causalToDescriptiveRatio: Math.round(causalToDescriptiveRatio * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function measureReadabilityPacing(text: string): ReadabilityPacingResult {
  const paragraphs = splitParagraphs(text);

  const focusResult = measureFocusStability(paragraphs);
  const spacingResult = measureInformationSpacing(paragraphs);
  const causalResult = measureCausalExplicitness(paragraphs);

  const overall =
    focusResult.score * 0.40 +
    spacingResult.score * 0.35 +
    causalResult.score * 0.25;

  return {
    score: Math.round(overall * 100) / 100,
    focusStability: Math.round(focusResult.score * 100) / 100,
    informationSpacing: Math.round(spacingResult.score * 100) / 100,
    causalExplicitness: Math.round(causalResult.score * 100) / 100,
    details: {
      focusShiftsPerParagraph: focusResult.shiftsPerParagraph,
      eventToReactionRatio: spacingResult.eventToReactionRatio,
      causalToDescriptiveRatio: causalResult.causalToDescriptiveRatio,
    },
  };
}
