/**
 * Comprehensibility checker — measures how well a reader can follow
 * WHO is doing WHAT in Korean narrative text.
 *
 * Based on computational narratology research:
 * - Entity Grid: Barzilay & Lapata 2008
 * - Centering Theory: Grosz, Joshi & Weinstein 1995
 *
 * Four sub-dimensions:
 * 1. Entity Grid coherence (30%) — character role transition patterns
 * 2. Centering coherence (30%) — ROUGH_SHIFT ratio
 * 3. Subject omission tracking (20%) — consecutive omission streaks
 * 4. Anaphora resolution possibility (20%) — pronoun clarity
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComprehensibilityResult {
  score: number; // 0-1
  entityCoherence: number; // Entity Grid coherence
  centeringCoherence: number; // Centering Theory ROUGH_SHIFT ratio
  subjectOmissionScore: number; // Subject omission tracking
  anaphoraClarity: number; // Pronoun resolution possibility
  details: {
    roughShiftCount: number;
    subjectOmissionStreaks: number; // 3+ consecutive omissions
    unresolvedPronouns: number;
    ambiguousPronouns: number;
  };
}

export type EntityRole = "S" | "O" | "X" | "-"; // Subject, Object, Other mention, Absent

export type CenteringTransition =
  | "CONTINUE"
  | "RETAIN"
  | "SMOOTH_SHIFT"
  | "ROUGH_SHIFT";

// ---------------------------------------------------------------------------
// Korean particle detection
// ---------------------------------------------------------------------------

/** Korean salience order by particle (lower = more salient) */
const SALIENCE: Record<string, number> = {
  은: 1,
  는: 1,
  이: 2,
  가: 2,
  을: 3,
  를: 3,
  에게: 4,
  한테: 4,
};

// Pronouns we track for anaphora resolution
const PRONOUNS = [
  { pattern: /그녀는/, text: "그녀는", gender: "female" },
  { pattern: /그녀가/, text: "그녀가", gender: "female" },
  { pattern: /그녀를/, text: "그녀를", gender: "female" },
  { pattern: /그녀의/, text: "그녀의", gender: "female" },
  { pattern: /그녀에게/, text: "그녀에게", gender: "female" },
  { pattern: /그는/, text: "그는", gender: "male" },
  { pattern: /그가/, text: "그가", gender: "male" },
  { pattern: /그를/, text: "그를", gender: "male" },
  { pattern: /그의/, text: "그의", gender: "male" },
  { pattern: /그에게/, text: "그에게", gender: "male" },
];

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------

/**
 * Split Korean text into sentences.
 * Handles common endings: 다. 다! 다? 요. 요! 요? etc.
 */
export function splitSentences(text: string): string[] {
  // Remove dialogue for cleaner analysis — we focus on narration
  const cleaned = text.replace(/["\u201C][^"\u201D]*["\u201D]/g, "");
  // Split on sentence-ending punctuation
  const raw = cleaned.split(/(?<=[.!?])\s+/);
  return raw.map((s) => s.trim()).filter((s) => s.length > 2);
}

// ---------------------------------------------------------------------------
// 1. Entity Grid
// ---------------------------------------------------------------------------

/**
 * Detect a character's grammatical role in a sentence.
 */
export function detectRole(sentence: string, charName: string): EntityRole {
  if (!sentence.includes(charName)) return "-";

  const subjectPattern = new RegExp(
    `${escapeRegex(charName)}(은|는|이|가|께서)`,
  );
  if (subjectPattern.test(sentence)) return "S";

  const objectPattern = new RegExp(
    `${escapeRegex(charName)}(을|를|에게|한테)`,
  );
  if (objectPattern.test(sentence)) return "O";

  return "X";
}

/**
 * Build the entity grid: rows = sentences, columns = characters.
 */
export function buildEntityGrid(
  sentences: string[],
  characters: Array<{ name: string }>,
): EntityRole[][] {
  return sentences.map((sentence) =>
    characters.map((char) => detectRole(sentence, char.name)),
  );
}

/**
 * Compute entity grid coherence score.
 * Good transitions: S→S, S→O, O→S, O→O (entity stays active)
 * Bad transitions: -→S (appears from nowhere as subject), S→- (suddenly disappears)
 */
export function computeEntityCoherence(grid: EntityRole[][]): number {
  if (grid.length < 2) return 1.0;

  const numChars = grid[0]?.length ?? 0;
  if (numChars === 0) return 1.0;

  let goodTransitions = 0;
  let totalTransitions = 0;

  for (let col = 0; col < numChars; col++) {
    for (let row = 0; row < grid.length - 1; row++) {
      const current = grid[row][col];
      const next = grid[row + 1][col];

      // Only count transitions where at least one is not absent
      if (current === "-" && next === "-") continue;

      totalTransitions++;

      // Good: entity stays active (S→S, S→O, O→S, O→O, X→S, S→X)
      if (current !== "-" && next !== "-") {
        goodTransitions++;
      }
      // Bad: -→S (sudden subject appearance) or S→- (sudden disappearance)
      // These are already not counted as good
    }
  }

  if (totalTransitions === 0) return 1.0;
  return goodTransitions / totalTransitions;
}

// ---------------------------------------------------------------------------
// 2. Centering Theory
// ---------------------------------------------------------------------------

/**
 * Find the preferred center (Cp) of a sentence — the most salient entity.
 */
export function findPreferredCenter(
  sentence: string,
  characters: Array<{ name: string }>,
): string | null {
  let bestChar: string | null = null;
  let bestSalience = Infinity;

  for (const char of characters) {
    // Check each particle
    for (const [particle, salience] of Object.entries(SALIENCE)) {
      const pattern = new RegExp(`${escapeRegex(char.name)}${particle}`);
      if (pattern.test(sentence) && salience < bestSalience) {
        bestSalience = salience;
        bestChar = char.name;
      }
    }
  }

  return bestChar;
}

/**
 * Find the backward-looking center (Cb) — the highest-ranked entity
 * from the previous sentence's preferred centers that appears in this sentence.
 */
export function findBackwardCenter(
  sentence: string,
  prevCenters: string[],
): string | null {
  for (const center of prevCenters) {
    if (sentence.includes(center)) return center;
  }
  return null;
}

/**
 * Get all entities mentioned in a sentence, ranked by salience.
 */
function getRankedEntities(
  sentence: string,
  characters: Array<{ name: string }>,
): string[] {
  const entities: Array<{ name: string; salience: number }> = [];

  for (const char of characters) {
    let bestSalience = Infinity;
    for (const [particle, salience] of Object.entries(SALIENCE)) {
      const pattern = new RegExp(`${escapeRegex(char.name)}${particle}`);
      if (pattern.test(sentence) && salience < bestSalience) {
        bestSalience = salience;
      }
    }
    // Also check plain mention
    if (bestSalience === Infinity && sentence.includes(char.name)) {
      bestSalience = 5; // low salience for bare mention
    }
    if (bestSalience < Infinity) {
      entities.push({ name: char.name, salience: bestSalience });
    }
  }

  entities.sort((a, b) => a.salience - b.salience);
  return entities.map((e) => e.name);
}

/**
 * Classify the centering transition between two sentences.
 */
export function classifyCenteringTransition(
  cb: string | null,
  cp: string | null,
  prevCp: string | null,
): CenteringTransition {
  if (!cb || !cp || !prevCp) return "ROUGH_SHIFT";

  if (cb === cp && cp === prevCp) return "CONTINUE";
  if (cb === prevCp && cp !== prevCp) return "RETAIN";
  if (cb !== prevCp && cb === cp) return "SMOOTH_SHIFT";
  return "ROUGH_SHIFT";
}

/**
 * Compute centering coherence score.
 */
export function computeCenteringCoherence(
  sentences: string[],
  characters: Array<{ name: string }>,
): { score: number; roughShiftCount: number } {
  if (sentences.length < 2) return { score: 1.0, roughShiftCount: 0 };

  let roughShiftCount = 0;
  let totalTransitions = 0;

  let prevCp = findPreferredCenter(sentences[0], characters);
  let prevRanked = getRankedEntities(sentences[0], characters);

  for (let i = 1; i < sentences.length; i++) {
    const cp = findPreferredCenter(sentences[i], characters);
    const cb = findBackwardCenter(sentences[i], prevRanked);

    const transition = classifyCenteringTransition(cb, cp, prevCp);
    totalTransitions++;

    if (transition === "ROUGH_SHIFT") {
      roughShiftCount++;
    }

    prevCp = cp;
    prevRanked = getRankedEntities(sentences[i], characters);
  }

  if (totalTransitions === 0) return { score: 1.0, roughShiftCount: 0 };

  return {
    score: 1 - roughShiftCount / totalTransitions,
    roughShiftCount,
  };
}

// ---------------------------------------------------------------------------
// 3. Subject Omission Tracking
// ---------------------------------------------------------------------------

/**
 * Check if a sentence has an explicit subject.
 * A sentence has an explicit subject if it contains a character name
 * OR any noun followed by a subject particle.
 */
export function hasExplicitSubject(
  sentence: string,
  characterNames: string[],
): boolean {
  // Check for character names with subject particles
  for (const name of characterNames) {
    const subjectPattern = new RegExp(
      `${escapeRegex(name)}(은|는|이|가|께서)`,
    );
    if (subjectPattern.test(sentence)) return true;
  }

  // Check for any Korean noun + subject particle (general pattern)
  // Match 2+ character Korean word followed by subject particle
  if (/[가-힣]{2,}(은|는|이|가|께서)/.test(sentence)) return true;

  return false;
}

/**
 * Compute subject omission score.
 * Penalizes streaks of 3+ consecutive sentences without explicit subjects.
 */
export function computeSubjectOmissionScore(
  sentences: string[],
  characterNames: string[],
): { score: number; streakCount: number } {
  if (sentences.length === 0) return { score: 1.0, streakCount: 0 };

  let currentStreak = 0;
  let streakCount = 0; // Number of 3+ streaks
  let totalPenalty = 0;

  for (const sentence of sentences) {
    if (!hasExplicitSubject(sentence, characterNames)) {
      currentStreak++;
    } else {
      if (currentStreak >= 3) {
        streakCount++;
        // Penalty grows with streak length
        totalPenalty += (currentStreak - 2) * 0.1;
      }
      currentStreak = 0;
    }
  }

  // Don't forget a trailing streak
  if (currentStreak >= 3) {
    streakCount++;
    totalPenalty += (currentStreak - 2) * 0.1;
  }

  return {
    score: Math.max(0, 1 - totalPenalty),
    streakCount,
  };
}

// ---------------------------------------------------------------------------
// 4. Anaphora Resolution
// ---------------------------------------------------------------------------

/**
 * Compute anaphora clarity score.
 * For each pronoun, look back up to 5 sentences for a candidate character.
 */
export function computeAnaphoraClarity(
  sentences: string[],
  characters: Array<{ name: string; gender?: string; [key: string]: unknown }>,
): { score: number; unresolvedPronouns: number; ambiguousPronouns: number } {
  let totalPronouns = 0;
  let unresolvedPronouns = 0;
  let ambiguousPronouns = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    for (const pronoun of PRONOUNS) {
      if (!pronoun.pattern.test(sentence)) continue;
      totalPronouns++;

      // Look back up to 5 sentences for candidate characters
      const lookbackStart = Math.max(0, i - 5);
      const lookbackText = sentences.slice(lookbackStart, i).join(" ");

      // Find candidate characters mentioned in the lookback window
      const candidates = characters.filter((char) => {
        // Must be mentioned in lookback window
        if (!lookbackText.includes(char.name)) return false;
        // If gender info available, filter by gender match
        if (
          char.gender &&
          pronoun.gender === "female" &&
          char.gender !== "female"
        )
          return false;
        if (char.gender && pronoun.gender === "male" && char.gender !== "male")
          return false;
        return true;
      });

      if (candidates.length === 0) {
        unresolvedPronouns++;
      } else if (candidates.length >= 2) {
        ambiguousPronouns++;
      }
      // 1 candidate = clear, no penalty
    }
  }

  if (totalPronouns === 0) return { score: 1.0, unresolvedPronouns: 0, ambiguousPronouns: 0 };

  const unresolvedRatio = unresolvedPronouns / totalPronouns;
  const ambiguousRatio = ambiguousPronouns / totalPronouns;

  return {
    score: Math.max(0, 1 - unresolvedRatio - 0.5 * ambiguousRatio),
    unresolvedPronouns,
    ambiguousPronouns,
  };
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

export function measureComprehensibility(
  text: string,
  characters: Array<{ name: string; gender?: string; [key: string]: unknown }>,
): ComprehensibilityResult {
  const sentences = splitSentences(text);
  const characterNames = characters.map((c) => c.name);

  // 1. Entity Grid coherence (30%)
  const grid = buildEntityGrid(sentences, characters);
  const entityCoherence = computeEntityCoherence(grid);

  // 2. Centering coherence (30%)
  const centering = computeCenteringCoherence(sentences, characters);

  // 3. Subject omission tracking (20%)
  const subjectOmission = computeSubjectOmissionScore(
    sentences,
    characterNames,
  );

  // 4. Anaphora resolution possibility (20%)
  const anaphora = computeAnaphoraClarity(sentences, characters);

  // Detect dialogue density — dialogue-heavy text naturally has speaker alternation
  // which creates ROUGH_SHIFT transitions that are NOT real comprehensibility issues
  const dialogueLines = text.split("\n").filter(
    (l) => /["\u201C\u201D""」「]/.test(l),
  ).length;
  const totalLines = text.split("\n").filter((l) => l.trim().length > 0).length;
  const dialogueRatio = totalLines > 0 ? dialogueLines / totalLines : 0;
  const isDialogueHeavy = dialogueRatio > 0.25;

  // Adjust weights: dialogue-heavy text gets lower centering/entity weight
  // because speaker alternation ≠ narrative incoherence, and short dialogue
  // lines structurally produce low entity grid scores (name absent from quotes)
  const centeringWeight = isDialogueHeavy ? 0.10 : 0.3;
  const entityWeight = isDialogueHeavy ? 0.10 : 0.3;
  const subjectWeight = isDialogueHeavy ? 0.40 : 0.2;
  const anaphoraWeight = isDialogueHeavy ? 0.40 : 0.2;

  // Overall weighted score
  const score =
    entityCoherence * entityWeight +
    centering.score * centeringWeight +
    subjectOmission.score * subjectWeight +
    anaphora.score * anaphoraWeight;

  return {
    score,
    entityCoherence,
    centeringCoherence: centering.score,
    subjectOmissionScore: subjectOmission.score,
    anaphoraClarity: anaphora.score,
    details: {
      roughShiftCount: centering.roughShiftCount,
      subjectOmissionStreaks: subjectOmission.streakCount,
      unresolvedPronouns: anaphora.unresolvedPronouns,
      ambiguousPronouns: anaphora.ambiguousPronouns,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
