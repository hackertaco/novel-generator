/**
 * Page Turner evaluator — measures how compelling the text is to keep reading.
 *
 * No LLM calls — pure deterministic computation.
 *
 * Dimensions:
 * - Unresolved threads: open story threads at chapter end
 * - Cliffhanger strength: how strong the chapter ending hook is
 * - Information velocity: new info per paragraph (optimal: moderate, accelerating)
 * - Micro-hooks: mid-chapter mini-hooks that keep reading momentum
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageTurnerResult {
  score: number; // 0-1
  unresolvedThreads: number; // open story threads at chapter end
  cliffhangerStrength: number; // 0-1, how strong the chapter ending hook is
  informationVelocity: number; // new info per paragraph (optimal: moderate)
  microHooks: number; // mid-chapter mini-hooks that keep reading momentum
  details: {
    threadTypes: string[];
    endingType: string; // "question" | "crisis" | "revelation" | "cliffhanger" | "flat"
    velocityProfile: number[]; // per-paragraph info velocity
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitParagraphs(text: string): string[] {
  return text.split("\n\n").filter((p) => p.trim().length > 0);
}

// ---------------------------------------------------------------------------
// 1. Unresolved Threads
// ---------------------------------------------------------------------------

/** Markers that open a conflict/mystery thread */
const THREAD_OPENERS: Array<{ pattern: RegExp; type: string }> = [
  // Adversative connectors implying unresolved tension
  { pattern: /하지만|그러나|그런데/, type: "adversative_tension" },
  // Character in danger
  { pattern: /위험|죽을|목숨|생사|살아남/, type: "danger" },
  // Secret / mystery unrevealed
  { pattern: /비밀|수수께끼|미스터리|숨기|감추|정체를|진실을/, type: "mystery" },
  // Threat or ominous foreshadowing
  { pattern: /경고|예언|징조|불길|느낌이|기운이/, type: "foreshadowing" },
  // Unanswered question
  { pattern: /왜\s|어째서|무엇이|누구|어디서|어떻게.*[?？]/, type: "question" },
  // Promise / oath / mission pending
  { pattern: /약속|맹세|반드시|꼭.*[겠을]/, type: "promise" },
  // Betrayal or deception in progress
  { pattern: /배신|속이|거짓|함정|계략/, type: "deception" },
];

/** Markers that resolve/close a thread */
const THREAD_CLOSERS = /해결|밝혀졌다|알게 되었다|끝났다|마무리|성공했다|해냈다|완료|드러났다|진실이.*밝혀/;

function countUnresolvedThreads(paragraphs: string[]): { count: number; types: string[] } {
  const threadTypes = new Set<string>();
  let openCount = 0;

  // Scan all paragraphs for opened threads
  for (const para of paragraphs) {
    for (const opener of THREAD_OPENERS) {
      if (opener.pattern.test(para)) {
        threadTypes.add(opener.type);
      }
    }
  }

  openCount = threadTypes.size;

  // Check if threads were closed (scan full text for closers)
  const fullText = paragraphs.join("\n");
  const closerMatches = fullText.match(THREAD_CLOSERS);
  if (closerMatches) {
    // Each closer reduces open threads (rough heuristic)
    openCount = Math.max(0, openCount - closerMatches.length);
  }

  return { count: openCount, types: [...threadTypes] };
}

function scoreUnresolvedThreads(count: number): number {
  // Optimal: 2-3 open threads
  if (count >= 2 && count <= 3) return 1.0;
  if (count === 1) return 0.7;
  if (count === 4) return 0.8;
  if (count === 0) return 0.3;
  // Too many threads (5+) = confusing
  return Math.max(0.3, 1.0 - (count - 3) * 0.15);
}

// ---------------------------------------------------------------------------
// 2. Cliffhanger Strength
// ---------------------------------------------------------------------------

const QUESTION_MARKERS = /[?？]|란\s*말인가|이란\s*말인가|는\s*걸까|는\s*것인가|는\s*것일까|말인가/;
const CRISIS_MARKERS = /위험|죽|피가|비명|무너|쓰러|절체절명|목숨|생사/;
const REVELATION_MARKERS = /사실은|알게\s*되었다|정체가|밝혀졌다|들켰다|드러났다|진실은/;
const TWIST_MARKERS = /그때|갑자기|예상치|뜻밖에|순간|느닷없이|불현듯/;
const EMOTIONAL_PEAK_MARKERS = /눈물|울|심장|떨리|가슴이|전율|감동|분노|절망/;
const CALM_RESOLUTION_MARKERS = /그렇게|마무리|끝이|결국|그날은|돌아갔다|잠이\s*들었다|평화|고요히|편안/;

interface CliffhangerAnalysis {
  strength: number;
  endingType: string;
}

function analyzeCliffhanger(paragraphs: string[]): CliffhangerAnalysis {
  if (paragraphs.length === 0) return { strength: 0, endingType: "flat" };

  // Analyze last 3 paragraphs (or fewer if text is short)
  const lastParagraphs = paragraphs.slice(-3).join("\n");

  // Score each ending type and pick the strongest
  const scores: Array<{ type: string; score: number }> = [];

  if (REVELATION_MARKERS.test(lastParagraphs)) {
    scores.push({ type: "revelation", score: 1.0 });
  }
  if (CRISIS_MARKERS.test(lastParagraphs)) {
    scores.push({ type: "crisis", score: 0.9 });
  }
  if (TWIST_MARKERS.test(lastParagraphs)) {
    // Twist at the very end is a cliffhanger
    const lastPara = paragraphs[paragraphs.length - 1];
    if (TWIST_MARKERS.test(lastPara)) {
      scores.push({ type: "cliffhanger", score: 0.95 });
    } else {
      scores.push({ type: "cliffhanger", score: 0.8 });
    }
  }
  if (QUESTION_MARKERS.test(lastParagraphs)) {
    scores.push({ type: "question", score: 0.8 });
  }
  if (EMOTIONAL_PEAK_MARKERS.test(lastParagraphs)) {
    scores.push({ type: "emotional_peak", score: 0.7 });
  }
  if (CALM_RESOLUTION_MARKERS.test(lastParagraphs)) {
    scores.push({ type: "flat", score: 0.3 });
  }

  if (scores.length === 0) {
    return { strength: 0.4, endingType: "flat" };
  }

  // Pick the highest-scoring type
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // If calm resolution co-exists with a strong ending, dampen the strong ending slightly
  const hasCalm = scores.some((s) => s.type === "flat");
  const strength = hasCalm && best.type !== "flat"
    ? best.score * 0.85
    : best.score;

  return { strength: Math.min(1, strength), endingType: best.type };
}

// ---------------------------------------------------------------------------
// 3. Information Velocity
// ---------------------------------------------------------------------------

/** Proper noun pattern (Korean name + particle) */
const PROPER_NOUN_RE = /[가-힣]{2,4}[이가은는을를에의]/g;
/** New event markers */
const EVENT_MARKERS = /[었였했갔왔됐]다|시작했|일어났|발생했|나타났|사라졌|변했/g;
/** New fact / explanation */
const FACT_MARKERS = /이라는|라고\s*불리|라는\s*것|에\s*의하면|따르면|사실/g;

function computeInfoVelocity(paragraphs: string[]): { perParagraph: number[]; score: number } {
  if (paragraphs.length === 0) return { perParagraph: [], score: 0.5 };

  const velocities: number[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (words < 3) {
      velocities.push(0);
      continue;
    }

    const properNouns = (para.match(PROPER_NOUN_RE) || []).length;
    PROPER_NOUN_RE.lastIndex = 0;
    const events = (para.match(EVENT_MARKERS) || []).length;
    EVENT_MARKERS.lastIndex = 0;
    const facts = (para.match(FACT_MARKERS) || []).length;
    FACT_MARKERS.lastIndex = 0;

    const infoCount = properNouns + events + facts;
    // Normalize by paragraph length (info per 100 chars)
    const velocity = (infoCount / para.length) * 100;
    velocities.push(Math.round(velocity * 100) / 100);
  }

  // Score the velocity curve
  let score = 0.5;

  // Average velocity: optimal is moderate (1-5 per 100 chars)
  const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  if (avgVelocity >= 0.5 && avgVelocity <= 5) {
    score = 0.7;
  } else if (avgVelocity < 0.5) {
    score = 0.4; // too slow
  } else {
    score = 0.5; // too fast (info dump)
  }

  // Bonus: accelerating toward the end
  if (velocities.length >= 4) {
    const firstHalf = velocities.slice(0, Math.floor(velocities.length / 2));
    const secondHalf = velocities.slice(Math.floor(velocities.length / 2));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    if (avgSecond >= avgFirst) {
      score = Math.min(1, score + 0.2); // accelerating = good
    }
  }

  return { perParagraph: velocities, score: Math.min(1, score) };
}

// ---------------------------------------------------------------------------
// 4. Micro-hooks
// ---------------------------------------------------------------------------

const MICRO_HOOK_PATTERNS = [
  // Dash / em-dash cut-offs
  /\u2014$|—$/m,
  // "But that was only the beginning"
  /시작에\s*불과했다|시작일\s*뿐이었다/,
  // "At that moment—"
  /그\s*순간[—\u2014,]|바로\s*그때/,
  // Tension at paragraph break
  /하지만\s*그것[은을]|문제는|다만/,
  // Ellipsis tension
  /[…]{1,}$|\.{3,}$/m,
  // Short exclamatory paragraph (dramatic pause)
  // Will check separately via paragraph length
  // Foreshadowing within chapter
  /아직\s*모르고\s*있었다|알\s*리\s*없었다|나중에야|그것이.*줄은/,
  // Sudden interruption
  /소리가\s*들렸다|문이.*열렸다|누군가|그림자가/,
  // Internal question
  /도대체|과연|설마/,
];

function countMicroHooks(paragraphs: string[]): number {
  let hooks = 0;

  // Don't count hooks in the last 2 paragraphs (those are cliffhanger territory)
  const midParagraphs = paragraphs.slice(0, Math.max(1, paragraphs.length - 2));

  for (const para of midParagraphs) {
    for (const pattern of MICRO_HOOK_PATTERNS) {
      if (pattern.test(para)) {
        hooks++;
        break; // count max 1 hook per paragraph
      }
    }

    // Short dramatic paragraphs (< 20 chars) mid-chapter
    if (para.trim().length > 0 && para.trim().length < 20 && /[!?…—]/.test(para)) {
      hooks++;
    }
  }

  return hooks;
}

function scoreMicroHooks(count: number): number {
  // Optimal: 3-5 micro-hooks per chapter
  if (count >= 3 && count <= 5) return 1.0;
  if (count === 2) return 0.8;
  if (count === 6) return 0.9;
  if (count === 1) return 0.6;
  if (count === 0) return 0.3;
  // Too many (7+) = exhausting
  return Math.max(0.4, 1.0 - (count - 5) * 0.1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function measurePageTurner(text: string): PageTurnerResult {
  const paragraphs = splitParagraphs(text);

  // 1. Unresolved threads
  const threads = countUnresolvedThreads(paragraphs);
  const threadScore = scoreUnresolvedThreads(threads.count);

  // 2. Cliffhanger
  const cliffhanger = analyzeCliffhanger(paragraphs);

  // 3. Information velocity
  const velocity = computeInfoVelocity(paragraphs);

  // 4. Micro-hooks
  const microHookCount = countMicroHooks(paragraphs);
  const microHookScore = scoreMicroHooks(microHookCount);

  // Weighted score
  const score =
    cliffhanger.strength * 0.35 +
    threadScore * 0.25 +
    velocity.score * 0.25 +
    microHookScore * 0.15;

  return {
    score: Math.round(Math.min(1, Math.max(0, score)) * 100) / 100,
    unresolvedThreads: threads.count,
    cliffhangerStrength: Math.round(cliffhanger.strength * 100) / 100,
    informationVelocity: Math.round((velocity.perParagraph.reduce((a, b) => a + b, 0) / Math.max(1, velocity.perParagraph.length)) * 100) / 100,
    microHooks: microHookCount,
    details: {
      threadTypes: threads.types,
      endingType: cliffhanger.endingType,
      velocityProfile: velocity.perParagraph,
    },
  };
}
