/**
 * Repetition Detector — detects self-repetition in generated text.
 *
 * LLM-generated fiction degrades in later portions by repeating
 * earlier content. This module catches:
 * 1. N-gram overlap between scenes
 * 2. Phrase-level repetition within a scene
 * 3. Structural repetition (same sentence patterns)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepetitionResult {
  passed: boolean;
  issues: RepetitionIssue[];
  metrics: {
    /** Inter-scene n-gram overlap ratio (0-1) */
    interSceneOverlap: number;
    /** Intra-scene repeated phrase count */
    repeatedPhraseCount: number;
    /** Structural repetition score (0-1) */
    structuralRepetition: number;
  };
}

export interface RepetitionIssue {
  type: "inter_scene_overlap" | "repeated_phrase" | "structural_repetition";
  message: string;
  severity: "warning" | "error";
}

// ---------------------------------------------------------------------------
// Common Korean particles / function words to exclude from phrase detection
// ---------------------------------------------------------------------------

const COMMON_PARTICLES = new Set([
  "그리고", "하지만", "그러나", "그래서", "때문에",
  "것이다", "있었다", "없었다", "했다는", "한다는",
  "이라는", "라고는", "에서는", "으로는", "부터는",
  "까지는", "에게는", "한테는", "로부터", "이지만",
]);

// ---------------------------------------------------------------------------
// extractNgrams
// ---------------------------------------------------------------------------

/**
 * Extract n-grams from Korean text.
 * Uses character-level n-grams (Korean morphology makes word-level unreliable).
 * Filters out whitespace-only grams.
 */
function extractNgrams(text: string, n: number = 5): Set<string> {
  // Strip all whitespace to get a dense character stream.
  // This makes the n-grams position-independent across formatting variations.
  const stripped = text.replace(/\s+/g, "");
  const grams = new Set<string>();

  for (let i = 0; i <= stripped.length - n; i++) {
    const gram = stripped.slice(i, i + n);
    // Skip grams that are purely punctuation
    if (!/^[.,!?;:""''「」『』…\-()[\]{}]+$/.test(gram)) {
      grams.add(gram);
    }
  }

  return grams;
}

// ---------------------------------------------------------------------------
// jaccardSimilarity
// ---------------------------------------------------------------------------

/**
 * Calculate Jaccard similarity between two n-gram sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  // Iterate the smaller set for performance
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of smaller) {
    if (larger.has(gram)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// findRepeatedPhrases
// ---------------------------------------------------------------------------

/**
 * Detect repeated phrases (substrings of `minLength`+ chars appearing `minCount`+ times).
 * Excludes common Korean particles and very short content.
 */
function findRepeatedPhrases(
  text: string,
  minLength: number = 6,
  minCount: number = 3,
): string[] {
  const stripped = text.replace(/\s+/g, "");
  if (stripped.length < minLength) return [];

  const freq = new Map<string, number>();

  for (let i = 0; i <= stripped.length - minLength; i++) {
    const phrase = stripped.slice(i, i + minLength);
    // Skip pure punctuation
    if (/^[.,!?;:""''「」『』…\-()[\]{}]+$/.test(phrase)) continue;
    freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
  }

  const repeated: string[] = [];
  for (const [phrase, count] of freq) {
    if (count >= minCount && !COMMON_PARTICLES.has(phrase)) {
      repeated.push(phrase);
    }
  }

  // Deduplicate overlapping phrases: if phrase A is a substring of phrase B
  // and both are repeated, keep only B (the longer context).
  // Since all phrases are the same length here, we just return unique ones.
  // For a more advanced version we could vary window sizes, but fixed-length
  // is sufficient for detection.
  return repeated;
}

// ---------------------------------------------------------------------------
// detectStructuralRepetition
// ---------------------------------------------------------------------------

/**
 * Detect structural repetition: consecutive sentences starting with the same pattern.
 * e.g., "그녀는 ~했다. 그녀는 ~했다. 그녀는 ~했다."
 *
 * Returns the ratio of sentences that are part of a 3+ consecutive same-prefix run.
 */
function detectStructuralRepetition(text: string): number {
  // Split into sentences on Korean/general sentence-ending punctuation
  const sentences = text
    .split(/[.!?。]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length < 3) return 0;

  const prefixLen = 4; // first 4 characters as "pattern"
  let repeatedCount = 0;
  let runLength = 1;

  for (let i = 1; i < sentences.length; i++) {
    const prevPrefix = sentences[i - 1].slice(0, prefixLen);
    const currPrefix = sentences[i].slice(0, prefixLen);

    if (prevPrefix === currPrefix && prevPrefix.length === prefixLen) {
      runLength++;
    } else {
      // End of a run — if it was 3+, mark those sentences as repeated
      if (runLength >= 3) {
        repeatedCount += runLength;
      }
      runLength = 1;
    }
  }
  // Handle the final run
  if (runLength >= 3) {
    repeatedCount += runLength;
  }

  return repeatedCount / sentences.length;
}

// ---------------------------------------------------------------------------
// splitSentences (helper)
// ---------------------------------------------------------------------------

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?。]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// detectIntraSceneRepetition
// ---------------------------------------------------------------------------

/**
 * Check a single scene for internal repetition.
 */
export function detectIntraSceneRepetition(text: string): RepetitionResult {
  const issues: RepetitionIssue[] = [];

  // 1. Find repeated phrases
  const repeatedPhrases = findRepeatedPhrases(text);
  const repeatedPhraseCount = repeatedPhrases.length;

  if (repeatedPhraseCount >= 5) {
    issues.push({
      type: "repeated_phrase",
      message: `동일 표현이 ${repeatedPhraseCount}회 반복됩니다: "${repeatedPhrases.slice(0, 3).join('", "')}"…`,
      severity: "error",
    });
  } else if (repeatedPhraseCount >= 3) {
    issues.push({
      type: "repeated_phrase",
      message: `동일 표현이 ${repeatedPhraseCount}회 반복됩니다: "${repeatedPhrases.slice(0, 3).join('", "')}"`,
      severity: "warning",
    });
  }

  // 2. Structural repetition
  const structuralScore = detectStructuralRepetition(text);

  if (structuralScore > 0.3) {
    issues.push({
      type: "structural_repetition",
      message: "문장 시작 패턴이 반복됩니다",
      severity: "error",
    });
  } else if (structuralScore > 0.15) {
    issues.push({
      type: "structural_repetition",
      message: "문장 시작 패턴이 다소 반복됩니다",
      severity: "warning",
    });
  }

  const hasError = issues.some((i) => i.severity === "error");

  return {
    passed: !hasError,
    issues,
    metrics: {
      interSceneOverlap: 0,
      repeatedPhraseCount,
      structuralRepetition: structuralScore,
    },
  };
}

// ---------------------------------------------------------------------------
// detectInterSceneRepetition
// ---------------------------------------------------------------------------

/**
 * Check repetition between the current scene and previous scenes.
 * This catches the "high-start, low-end" quality degradation pattern.
 */
export function detectInterSceneRepetition(
  currentScene: string,
  previousScenes: string[],
): RepetitionResult {
  const issues: RepetitionIssue[] = [];

  if (previousScenes.length === 0) {
    return {
      passed: true,
      issues: [],
      metrics: {
        interSceneOverlap: 0,
        repeatedPhraseCount: 0,
        structuralRepetition: 0,
      },
    };
  }

  const currentNgrams = extractNgrams(currentScene);

  // Compare against each previous scene and take the maximum overlap
  let maxOverlap = 0;
  for (const prev of previousScenes) {
    const prevNgrams = extractNgrams(prev);
    const overlap = jaccardSimilarity(currentNgrams, prevNgrams);
    if (overlap > maxOverlap) maxOverlap = overlap;
  }

  if (maxOverlap > 0.25) {
    issues.push({
      type: "inter_scene_overlap",
      message: `이전 씬과 ${Math.round(maxOverlap * 100)}% 이상 내용이 겹칩니다`,
      severity: "error",
    });
  } else if (maxOverlap > 0.15) {
    issues.push({
      type: "inter_scene_overlap",
      message: `이전 씬과 ${Math.round(maxOverlap * 100)}% 내용이 유사합니다`,
      severity: "warning",
    });
  }

  // Also run intra-scene checks on the current scene
  const intra = detectIntraSceneRepetition(currentScene);
  issues.push(...intra.issues);

  const hasError = issues.some((i) => i.severity === "error");

  return {
    passed: !hasError,
    issues,
    metrics: {
      interSceneOverlap: maxOverlap,
      repeatedPhraseCount: intra.metrics.repeatedPhraseCount,
      structuralRepetition: intra.metrics.structuralRepetition,
    },
  };
}

// ---------------------------------------------------------------------------
// detectChapterRepetition
// ---------------------------------------------------------------------------

/**
 * Full chapter repetition check.
 * Runs inter-scene comparison for every scene against all prior scenes,
 * and aggregates intra-scene results.
 */
export function detectChapterRepetition(sceneTexts: string[]): RepetitionResult {
  const issues: RepetitionIssue[] = [];
  let worstOverlap = 0;
  let totalRepeatedPhrases = 0;
  let worstStructural = 0;

  for (let i = 0; i < sceneTexts.length; i++) {
    const previousScenes = sceneTexts.slice(0, i);
    const result = detectInterSceneRepetition(sceneTexts[i], previousScenes);

    // Aggregate worst metrics
    if (result.metrics.interSceneOverlap > worstOverlap) {
      worstOverlap = result.metrics.interSceneOverlap;
    }
    totalRepeatedPhrases += result.metrics.repeatedPhraseCount;
    if (result.metrics.structuralRepetition > worstStructural) {
      worstStructural = result.metrics.structuralRepetition;
    }

    // Tag issues with scene index for context
    for (const issue of result.issues) {
      issues.push({
        ...issue,
        message: `[씬 ${i + 1}] ${issue.message}`,
      });
    }
  }

  const hasError = issues.some((i) => i.severity === "error");

  return {
    passed: !hasError,
    issues,
    metrics: {
      interSceneOverlap: worstOverlap,
      repeatedPhraseCount: totalRepeatedPhrases,
      structuralRepetition: worstStructural,
    },
  };
}
