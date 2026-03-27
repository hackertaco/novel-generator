/**
 * Consistency Gate — multiplier for the final deterministic score.
 *
 * Instead of treating consistency as just another scoring dimension,
 * this acts as a gate: if consistency is broken (POV switches, unnamed
 * scene starts, dead characters, etc.), the entire score is multiplied down.
 *
 * Formula:  overall = consistencyGate * weighted_sum(dimensions)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsistencyGateResult {
  /** 0-1 multiplier for the final score */
  score: number;
  /** Detected consistency issues */
  issues: ConsistencyIssue[];
}

export interface ConsistencyIssue {
  type:
    | "pov_inconsistency"
    | "unnamed_scene_start"
    | "character_existence"
    | "timeline_contradiction"
    | "location_discontinuity";
  severity: "critical" | "major" | "minor";
  description: string;
  /** Paragraph index where the issue was detected */
  position?: number;
}

// ---------------------------------------------------------------------------
// POV detection patterns
// ---------------------------------------------------------------------------

const FIRST_PERSON_MARKERS = /나는|내가|나의|내\s|나를|나에게/;
const THIRD_PERSON_PARTICLES = /[은는이가]/;

/**
 * Detect point-of-view from the first N paragraphs (excluding scene separators).
 * Returns 'first' if 1st-person markers dominate, 'third' otherwise.
 * Uses only the first 2 non-separator paragraphs to avoid being fooled by late POV switches.
 */
function detectPOV(
  paragraphs: string[],
  count = 2,
): "first" | "third" {
  const contentParas = paragraphs
    .filter((p) => !/^\s*(\*{3}|-{3})\s*$/.test(p))
    .slice(0, count);
  const sample = contentParas.join("\n");
  const firstCount = (sample.match(new RegExp(FIRST_PERSON_MARKERS.source, "g")) || []).length;
  // Heuristic: if 2+ first-person markers in early paragraphs, likely first-person
  return firstCount >= 2 ? "first" : "third";
}

// ---------------------------------------------------------------------------
// Check functions
// ---------------------------------------------------------------------------

function checkPOVConsistency(
  paragraphs: string[],
  characters: Array<{ name: string; [key: string]: unknown }>,
  declaredPOV?: "first" | "third",
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  if (paragraphs.length < 2) return issues;

  const detectedPOV = declaredPOV || detectPOV(paragraphs);

  // Check each paragraph for POV violations
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    // Skip scene separators
    if (/^\s*(\*{3}|-{3})\s*$/.test(para)) continue;

    const hasFirst = FIRST_PERSON_MARKERS.test(para);

    if (detectedPOV === "third" && hasFirst) {
      // Check if first-person markers are inside dialogue quotes — that's fine
      const withoutDialogue = para.replace(/["\u201C][^"\u201D]*["\u201D]/g, "");
      if (FIRST_PERSON_MARKERS.test(withoutDialogue)) {
        issues.push({
          type: "pov_inconsistency",
          severity: "critical",
          description: `3인칭 시점에서 1인칭 서술 발견 (문단 ${i + 1}): "${para.slice(0, 40)}..."`,
          position: i,
        });
      }
    }

    if (detectedPOV === "first") {
      // In first-person, narration should not describe the protagonist in third person
      const withoutDialogue = para.replace(/["\u201C][^"\u201D]*["\u201D]/g, "");
      if (
        withoutDialogue.length > 30 &&
        !FIRST_PERSON_MARKERS.test(withoutDialogue) &&
        characters.length > 0
      ) {
        const mcName = characters[0].name;
        const mcPattern = new RegExp(`${mcName}${THIRD_PERSON_PARTICLES.source}`);
        if (mcPattern.test(withoutDialogue)) {
          issues.push({
            type: "pov_inconsistency",
            severity: "critical",
            description: `1인칭 시점에서 주인공을 3인칭으로 서술 (문단 ${i + 1}): "${para.slice(0, 40)}..."`,
            position: i,
          });
        }
      }
    }
  }

  // Also validate against declared POV from blueprint
  if (declaredPOV) {
    const detectedFromText = detectPOV(paragraphs);
    if (detectedFromText !== declaredPOV) {
      issues.push({
        type: "pov_inconsistency",
        severity: "critical",
        description: `블루프린트 시점(${declaredPOV})과 실제 텍스트 시점(${detectedFromText}) 불일치`,
        position: 0,
      });
    }
  }

  return issues;
}

function checkUnnamedSceneStart(
  paragraphs: string[],
  characters: Array<{ name: string; [key: string]: unknown }>,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const characterNames = characters.map((c) => c.name);

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    // Check for scene separators
    if (/^(\*{3}|-{3})$/.test(para)) {
      // Find the next non-empty paragraph
      let nextIdx = i + 1;
      while (nextIdx < paragraphs.length && paragraphs[nextIdx].trim() === "") {
        nextIdx++;
      }
      if (nextIdx < paragraphs.length) {
        const nextPara = paragraphs[nextIdx];
        const hasCharacterName = characterNames.some((name) => nextPara.includes(name));
        if (!hasCharacterName) {
          issues.push({
            type: "unnamed_scene_start",
            severity: "major",
            description: `씬 전환 후(문단 ${nextIdx + 1}) 등장인물 이름 없음: "${nextPara.slice(0, 40)}..."`,
            position: nextIdx,
          });
        }
      }
    }
  }

  return issues;
}

function checkCharacterExistence(
  text: string,
  characters: Array<{ name: string; [key: string]: unknown }>,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const characterNames = new Set(characters.map((c) => c.name));

  // Extract dialogue speakers by looking for NAME + particle patterns before quotes or
  // "라고 말했다/물었다" patterns after quotes.
  // Strategy 1: NAME[이가은는] "..." or NAME[이가은는] 말했다
  const beforeQuotePattern = /([가-힣]{2,})[이가은는]\s*["\u201C]/g;
  // Strategy 2: "..." + 라고 + speech verb — look back for the speaker name
  const afterQuotePattern = /["\u201D][^.]*?([가-힣]{2,})[이가은는]\s*(?:라고\s*)?(?:말했|물었|외쳤|속삭였|중얼거렸|소리쳤|대답했)/g;
  // Strategy 3: NAME[이가은는] + speech verb (no quotes)
  const directSpeechPattern = /([가-힣]{2,})[이가은는]\s+(?:말했|물었|외쳤|속삭였|중얼거렸|소리쳤|대답했|웃으며)/g;

  let match;
  const unknownSpeakers = new Set<string>();
  const patterns = [beforeQuotePattern, afterQuotePattern, directSpeechPattern];

  for (const pattern of patterns) {
    while ((match = pattern.exec(text)) !== null) {
      const speaker = match[1];
      // Skip common non-name words and short/long words
      if (speaker.length < 2 || speaker.length > 5) continue;
      if (/^(그리고|하지만|그러나|그래서|그런데|그녀|누군가|아무도|모두|라고)$/.test(speaker)) continue;

      if (!characterNames.has(speaker)) {
        unknownSpeakers.add(speaker);
      }
    }
  }

  for (const speaker of unknownSpeakers) {
    issues.push({
      type: "character_existence",
      severity: "minor",
      description: `시드에 없는 인물이 대사: "${speaker}"`,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

// "다음 날" must come first so it is checked before "아침"/"밤" in the same paragraph
const TIME_MARKERS: Array<{ pattern: RegExp; order: number; label: string }> = [
  { pattern: /다음\s*날/, order: 100, label: "다음 날" },
  { pattern: /새벽/, order: 0, label: "새벽" },
  { pattern: /아침/, order: 1, label: "아침" },
  { pattern: /오전/, order: 2, label: "오전" },
  { pattern: /낮/, order: 3, label: "낮" },
  { pattern: /오후/, order: 4, label: "오후" },
  { pattern: /저녁/, order: 5, label: "저녁" },
  { pattern: /밤/, order: 6, label: "밤" },
];

function checkTimelineContradiction(paragraphs: string[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  let lastTimeOrder = -1;
  let lastTimeLabel = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();

    // Scene break resets timeline tracking
    if (/^(\*{3}|-{3})$/.test(para)) {
      lastTimeOrder = -1;
      lastTimeLabel = "";
      continue;
    }

    for (const marker of TIME_MARKERS) {
      if (marker.pattern.test(para)) {
        if (marker.order === 100) {
          // "다음 날" resets
          lastTimeOrder = -1;
          lastTimeLabel = "다음 날";
          break;
        }
        if (lastTimeOrder >= 0 && marker.order < lastTimeOrder) {
          issues.push({
            type: "timeline_contradiction",
            severity: "major",
            description: `시간 역행 (문단 ${i + 1}): "${lastTimeLabel}" → "${marker.label}" (씬 전환 없이)`,
            position: i,
          });
        }
        lastTimeOrder = marker.order;
        lastTimeLabel = marker.label;
        break; // Only track first time marker per paragraph
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Location tracking
// ---------------------------------------------------------------------------

const MOVEMENT_VERBS = /향했|걸어갔|이동했|달려갔|뛰어갔|차를\s*타|올라갔|내려갔|건너갔|나갔|들어갔|들어섰|도착했|떠났|출발했/;

function checkLocationDiscontinuity(paragraphs: string[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  let lastLocation: string | null = null;
  let lastLocationParagraph = -1;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();

    // Scene break resets location
    if (/^(\*{3}|-{3})$/.test(para)) {
      lastLocation = null;
      continue;
    }

    // Try to extract location from paragraphs
    // Match specific location nouns followed by 에/에서
    const locMatch = para.match(/(사무실|병원|학교|거리|골목|마을|도시|옥상|지하|복도|바다|[가-힣]{1,3}(?:실|방|관|장|원|궁|전|당|문|터|숲|산|강|집))에(?:서)?/);
    if (locMatch) {
      const currentLocation = locMatch[1];
      if (lastLocation && currentLocation !== lastLocation) {
        // Check if there was a movement verb between the two locations
        const betweenText = paragraphs
          .slice(lastLocationParagraph, i + 1)
          .join("\n");
        if (!MOVEMENT_VERBS.test(betweenText)) {
          issues.push({
            type: "location_discontinuity",
            severity: "minor",
            description: `장소 불연속 (문단 ${i + 1}): "${lastLocation}" → "${currentLocation}" (이동 묘사 없음)`,
            position: i,
          });
        }
      }
      lastLocation = currentLocation;
      lastLocationParagraph = i;
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

const SEVERITY_PENALTIES: Record<ConsistencyIssue["severity"], number> = {
  critical: 0.3,
  major: 0.15,
  minor: 0.05,
};

export function evaluateConsistencyGate(
  text: string,
  characters: Array<{ name: string; [key: string]: unknown }>,
  pov?: "first" | "third",
): ConsistencyGateResult {
  const paragraphs = text.split("\n\n").map((p) => p.trim()).filter((p) => p.length > 0);

  const issues: ConsistencyIssue[] = [
    ...checkPOVConsistency(paragraphs, characters, pov),
    ...checkUnnamedSceneStart(paragraphs, characters),
    ...checkCharacterExistence(text, characters),
    ...checkTimelineContradiction(paragraphs),
    ...checkLocationDiscontinuity(paragraphs),
  ];

  let gate = 1.0;
  for (const issue of issues) {
    gate -= SEVERITY_PENALTIES[issue.severity];
  }
  // Floor at 0.3 so score is never zero
  gate = Math.max(0.3, gate);

  return {
    score: gate,
    issues,
  };
}
