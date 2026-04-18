/**
 * Consistency Gate — multiplier for the final deterministic score.
 *
 * Instead of treating consistency as just another scoring dimension,
 * this acts as a gate: if consistency is broken (POV switches, unnamed
 * scene starts, dead characters, etc.), the entire score is multiplied down.
 *
 * Formula:  overall = consistencyGate * weighted_sum(dimensions)
 */

import { measureComprehensibility } from "./comprehensibility";
import { NARRATIVE_RULES, getRulePenalty } from "../policy/narrative-rules";
import type { CharacterState } from "../memory/world-state";

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
    | "location_discontinuity"
    | "low_comprehensibility"
    | "rank_inconsistency"
    | "name_inconsistency"
    | "companion_discontinuity"
    | "title_inconsistency";
  severity: "critical" | "major" | "minor";
  description: string;
  /** Short machine-readable detail string for downstream consumers (critic, state-machine) */
  detail: string;
  /** Paragraph index where the issue was detected */
  position?: number;
}

// ---------------------------------------------------------------------------
// POV detection patterns
// ---------------------------------------------------------------------------

/**
 * First-person markers must be standalone — not part of a longer Korean word.
 * We use a negative lookbehind for Hangul so that e.g. "세레나는" does NOT match
 * (나는 is preceded by 레, a Hangul char) but "나는" at the start of a clause does.
 */
const FIRST_PERSON_MARKERS = /(?<![가-힣])(?:나는|내가|나의|내\s|나를|나에게)/;
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
          detail: `3인칭 텍스트에 1인칭 마커가 대사 밖에서 사용됨 (문단 ${i + 1})`,
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
            detail: `1인칭 서술인데 주인공 "${mcName}"을 3인칭으로 지칭 (문단 ${i + 1})`,
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
        detail: `선언된 시점 "${declaredPOV}" vs 감지된 시점 "${detectedFromText}"`,
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
            detail: `씬 전환 직후 문단에 등장인물 이름이 언급되지 않음 (문단 ${nextIdx + 1})`,
            position: nextIdx,
          });
        }
      }
    }
  }

  return issues;
}

/** Common Korean words that get falsely detected as character names in dialogue attribution */
const COMMON_WORD_EXCLUSION = new Set([
  "그리고", "하지만", "그러나", "그래서", "그런데", "그녀", "누군가", "아무도", "모두", "라고",
  "하나", "누군", "아무", "그것", "이것", "저것", "여기", "거기", "저기",
  "무엇", "어디", "언제", "우리", "너희", "자신", "서로", "다시", "함께",
  "사이", "마치", "처럼", "때문", "덕분", "대신", "동안", "이후", "이전",
]);

function checkCharacterExistence(
  text: string,
  characters: Array<{ name: string; [key: string]: unknown }>,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const characterFullNames = new Set(characters.map((c) => c.name));

  // Build a set of first names and name variants for partial matching
  // e.g. "세레나 에버딘" -> also match "세레나"
  // e.g. "윤세아" -> also match "세아" (Korean given name suffix)
  const characterFirstNames = new Set<string>();
  for (const c of characters) {
    const parts = c.name.split(/\s+/);
    if (parts[0].length >= 2) {
      characterFirstNames.add(parts[0]);
    }
    // For Korean single-word names (3+ chars, no space), add last 2 chars as nickname
    // e.g. "윤세아" → "세아", "강현우" → "현우"
    const fullName = c.name.replace(/\s+/g, "");
    if (parts.length === 1 && fullName.length >= 3) {
      characterFirstNames.add(fullName.slice(-2));
    }
  }

  /** Check if a speaker matches any known character (full name or first name) */
  function isKnownCharacter(speaker: string): boolean {
    if (characterFullNames.has(speaker)) return true;
    if (characterFirstNames.has(speaker)) return true;
    return false;
  }

  // Extract dialogue speakers by looking for NAME + particle patterns before quotes or
  // "라고 말했다/물었다" patterns after quotes.
  // Strategy 1: NAME[이가은는] "..." or NAME[이가은는] 말했다
  const beforeQuotePattern = /([가-힣]{2,})[이가은는]\s*["\u201C]/g;
  // Strategy 2: "..." + 라고 + speech verb -- look back for the speaker name
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
      if (COMMON_WORD_EXCLUSION.has(speaker)) continue;

      if (!isKnownCharacter(speaker)) {
        unknownSpeakers.add(speaker);
      }
    }
  }

  for (const speaker of unknownSpeakers) {
    issues.push({
      type: "character_existence",
      severity: "minor",
      description: `시드에 없는 인물이 대사: "${speaker}"`,
      detail: `"${speaker}"이(가) 시드 캐릭터 목록에 없음`,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

/**
 * Indoor lighting words — when these appear alongside light-related words
 * (빛, 밝은, 빛나 etc.), it indicates artificial light rather than daylight.
 */
const INDOOR_LIGHTING = /촛불|샹들리에|등불|횃불|램프|전등|벽난로|화롯불|랜턴|조명|불빛|가로등|촛대/;

/**
 * Ambiguous light words that could mean daylight OR artificial light.
 * These only count as "낮" evidence when NO indoor-lighting context is present.
 */
const AMBIGUOUS_LIGHT_WORDS = /빛|밝은|밝아|빛나|빛이|환한|환하게/;

/**
 * Strong time-of-day markers — full phrases that reliably indicate time.
 * We require stronger evidence (phrase-level, not single word fragments)
 * to reduce false positives from words like "아침" appearing inside
 * compound words or casual mentions.
 */
const TIME_MARKERS: Array<{ pattern: RegExp; order: number; label: string }> = [
  // "다음 날" must come first — it resets the timeline
  { pattern: /다음\s*날/, order: 100, label: "다음 날" },
  // Strong phrase-level patterns: require surrounding context or sentence-boundary
  { pattern: /새벽[이에녘]|새벽\s*(?:빛|녘|무렵|시간)/, order: 0, label: "새벽" },
  { pattern: /아침[이에]\s|아침\s*(?:해|빛|햇살|일찍|식사|밥)|아침이\s*(?:밝|되|오|왔)/, order: 1, label: "아침" },
  { pattern: /오전[이에]\s|오전\s*(?:중|내내|시간)/, order: 2, label: "오전" },
  { pattern: /한낮[이에]|대낮[이에]|낮[이에]\s*(?:되|밝)/, order: 3, label: "낮" },
  { pattern: /오후[가에]\s|오후\s*(?:되|늦|시간|내내|햇살)/, order: 4, label: "오후" },
  { pattern: /저녁[이에]\s|저녁\s*(?:되|무렵|노을|식사|밥|때)|저녁이\s*되/, order: 5, label: "저녁" },
  { pattern: /밤[이에]\s|밤이\s*(?:깊|되|오|찾|내리)|밤\s*(?:하늘|늦|깊|사이)|한밤|깊은\s*밤/, order: 6, label: "밤" },
];

/**
 * Check whether a paragraph contains a reliable time marker.
 * Returns the matched marker or null.
 *
 * Ambiguous light words (빛, 밝은 …) are suppressed when indoor-lighting
 * context (촛불, 횃불 …) is present in the same paragraph, preventing
 * false "낮" detection in candlelit nighttime scenes.
 */
function detectTimeMarker(
  para: string,
): { order: number; label: string } | null {
  for (const marker of TIME_MARKERS) {
    if (marker.pattern.test(para)) {
      return marker;
    }
  }

  // Fallback: check if ambiguous light words imply "낮" —
  // but ONLY when there is no indoor-lighting context.
  if (AMBIGUOUS_LIGHT_WORDS.test(para) && !INDOOR_LIGHTING.test(para)) {
    // Even then, only treat as daytime if accompanied by outdoor cues
    if (/햇살|햇빛|태양|하늘/.test(para)) {
      return { order: 3, label: "낮" };
    }
  }

  return null;
}

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

    const detected = detectTimeMarker(para);
    if (detected) {
      if (detected.order === 100) {
        // "다음 날" resets
        lastTimeOrder = -1;
        lastTimeLabel = "다음 날";
        continue;
      }
      if (lastTimeOrder >= 0 && detected.order < lastTimeOrder) {
        issues.push({
          type: "timeline_contradiction",
          severity: "major",
          description: `시간 역행 (문단 ${i + 1}): "${lastTimeLabel}" → "${detected.label}" (씬 전환 없이)`,
          detail: `시간이 "${lastTimeLabel}"에서 "${detected.label}"로 역행 (문단 ${i + 1})`,
          position: i,
        });
      }
      lastTimeOrder = detected.order;
      lastTimeLabel = detected.label;
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
            detail: `"${lastLocation}"에서 "${currentLocation}"로 이동 묘사 없이 장소 변경 (문단 ${i + 1})`,
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
// Companion continuity (인물 동선)
// ---------------------------------------------------------------------------

/**
 * Check if characters who were together at the end of the previous chapter
 * are still together at the start of this chapter (or their separation is described).
 *
 * Also checks for characters appearing from a different location without travel description.
 */
function checkCompanionContinuity(
  text: string,
  paragraphs: string[],
  characters: Array<{ name: string; [key: string]: unknown }>,
  previousCharacterStates?: CharacterState[],
): ConsistencyIssue[] {
  if (!previousCharacterStates || previousCharacterStates.length === 0) return [];

  const issues: ConsistencyIssue[] = [];
  const charNames = new Set(characters.map((c) => c.name));

  // Build companion groups from previous chapter end
  // A "group" = characters at the same location
  const locationGroups = new Map<string, Set<string>>();
  for (const cs of previousCharacterStates) {
    if (!charNames.has(cs.name)) continue;
    const loc = cs.location || "불명";
    if (!locationGroups.has(loc)) locationGroups.set(loc, new Set());
    locationGroups.get(loc)!.add(cs.name);
    // Also add companions
    if (cs.companions) {
      for (const comp of cs.companions) {
        if (charNames.has(comp)) {
          locationGroups.get(loc)!.add(comp);
        }
      }
    }
  }

  // Only check groups with 2+ characters (solo characters can appear anywhere)
  const companionGroups = [...locationGroups.entries()]
    .filter(([, members]) => members.size >= 2);

  if (companionGroups.length === 0) return issues;

  // Analyze first ~40% of the text (early scenes) for character appearances
  const earlyText = paragraphs.slice(0, Math.max(3, Math.ceil(paragraphs.length * 0.4))).join("\n");

  for (const [location, members] of companionGroups) {
    const memberList = [...members];
    const appearing = memberList.filter((name) => earlyText.includes(name));
    const missing = memberList.filter((name) => !earlyText.includes(name));

    // If some members of a group appear but others don't — potential discontinuity
    if (appearing.length > 0 && missing.length > 0) {
      // Check if there's a separation description (떠나, 헤어지, 보내, 남기 등)
      const separationVerbs = /떠났|헤어졌|보냈|남기고|남겨|작별|이별|혼자|따로|분리|갈라/;
      const hasSeparation = separationVerbs.test(earlyText);

      if (!hasSeparation) {
        issues.push({
          type: "companion_discontinuity",
          severity: "major",
          description: `이전 화 종료 시 ${location}에서 함께 있던 [${memberList.join(", ")}] 중 [${missing.join(", ")}]이(가) 분리 묘사 없이 사라짐`,
          detail: `동행 그룹 [${memberList.join("+")}] 중 [${missing.join("+")}] 미등장 (분리 묘사 없음)`,
        });
      }
    }
  }

  // Check for characters appearing from a different location without travel
  for (const cs of previousCharacterStates) {
    if (!charNames.has(cs.name) || !cs.location) continue;
    // If this character appears in the early text but was at a different location
    if (!earlyText.includes(cs.name)) continue;

    // Check if any companion group at a DIFFERENT location contains a character
    // who appears in the same early scene — that would mean teleportation
    for (const [otherLoc, otherMembers] of locationGroups) {
      if (otherLoc === cs.location) continue;
      if (!otherMembers.has(cs.name)) continue; // not in this group
      // Character was NOT at this location but appears with members from it
      // This is covered by the group check above, skip
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Character rank consistency
// ---------------------------------------------------------------------------

const RANK_TITLES: Record<string, string[]> = {
  royal: ["황제", "황후", "황태자", "황녀", "왕", "왕비", "왕자", "공주"],
  noble: ["공작", "후작", "백작", "자작", "남작", "귀족", "영주", "영애", "공녀"],
  gentry: ["사대부", "기사", "기사단장", "향사"],
  commoner: ["평민", "상인", "농부"],
  servant: ["시녀", "하녀", "시종", "하인"],
  slave: ["노예", "종"],
  outcast: ["추방자", "유랑자"],
};

/** Invert RANK_TITLES so we can look up which rank group a title belongs to. */
const TITLE_TO_RANK: Map<string, string> = new Map();
for (const [rank, titles] of Object.entries(RANK_TITLES)) {
  for (const title of titles) {
    TITLE_TO_RANK.set(title, rank);
  }
}

function checkRankConsistency(
  text: string,
  characters: Array<{ name: string; social_rank?: string; [key: string]: unknown }>,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const character of characters) {
    const rank = character.social_rank;
    if (!rank) continue;
    // "commoner" is the default — skip rank checks as seed generation
    // often defaults to commoner even for titled characters
    if (rank === "commoner") continue;

    // For each title word from OTHER rank groups, check if it appears right before the character name
    for (const [title, titleRank] of TITLE_TO_RANK) {
      if (titleRank === rank) continue; // same rank group — fine

      // Match "title + optional space + character name"
      const pattern = new RegExp(`${title}\\s*${character.name}`);
      if (pattern.test(text)) {
        issues.push({
          type: "rank_inconsistency",
          severity: "critical",
          description: `캐릭터 "${character.name}"의 신분은 "${rank}"이지만 텍스트에서 "${title} ${character.name}"으로 표기됨 (${titleRank} 칭호 사용)`,
          detail: `"${character.name}" 신분 "${rank}" ≠ 사용된 칭호 "${title}" (${titleRank})`,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Title consistency check (칭호 일관성)
// ---------------------------------------------------------------------------

/**
 * Mapping from social_rank to the set of CORRECT title words for that rank.
 * Any title from another rank group found near a character name in narration
 * is flagged as a title inconsistency.
 */
const RANK_CORRECT_TITLES: Record<string, Set<string>> = {
  royal: new Set(["황제", "황후", "황태자", "황녀", "왕", "왕비", "왕자", "공주", "폐하", "전하", "마마"]),
  noble: new Set(["공작", "후작", "백작", "자작", "남작", "귀족", "영주", "영애", "공녀"]),
  gentry: new Set(["사대부", "기사", "기사단장", "향사"]),
  commoner: new Set(["평민", "상인", "농부"]),
  servant: new Set(["시녀", "하녀", "시종", "하인"]),
  slave: new Set(["노예", "종"]),
  outcast: new Set(["추방자", "유랑자"]),
};

/**
 * All title words across all ranks — used to quickly check if a word is a title.
 */
const ALL_TITLE_WORDS: Set<string> = new Set();
for (const titles of Object.values(RANK_CORRECT_TITLES)) {
  for (const t of titles) ALL_TITLE_WORDS.add(t);
}

/**
 * Strip dialogue from text so we only check narration.
 * Handles both straight quotes ("...") and smart quotes (\u201C...\u201D).
 */
function stripDialogue(text: string): string {
  return text
    .replace(/\u201C[^\u201D]*\u201D/g, "")  // smart quotes
    .replace(/"[^"]*"/g, "");                   // straight quotes
}

/**
 * Check that title words near a character's name in narration match
 * that character's social_rank from the seed.
 *
 * For each character with a social_rank:
 *   1. Find every occurrence of the character's name in narration (dialogue stripped)
 *   2. Look at the ±30 character window around the name
 *   3. If a title word from a DIFFERENT rank appears in that window, flag it
 */
function checkTitleConsistency(
  text: string,
  characters: Array<{ name: string; social_rank?: string; [key: string]: unknown }>,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const narration = stripDialogue(text);

  for (const character of characters) {
    const rank = character.social_rank;
    if (!rank) continue;
    // commoner is the default — skip, same reasoning as checkRankConsistency
    if (rank === "commoner") continue;

    const correctTitles = RANK_CORRECT_TITLES[rank];
    if (!correctTitles) continue;

    // Find all occurrences of the character name in narration
    const namePattern = new RegExp(character.name, "g");
    let nameMatch;
    const flaggedTitles = new Set<string>();

    while ((nameMatch = namePattern.exec(narration)) !== null) {
      const nameStart = nameMatch.index;
      const nameEnd = nameStart + character.name.length;

      // Extract ±30 char window around the name
      const windowStart = Math.max(0, nameStart - 30);
      const windowEnd = Math.min(narration.length, nameEnd + 30);
      const window = narration.slice(windowStart, windowEnd);

      // Check every known title word against this window
      for (const title of ALL_TITLE_WORDS) {
        if (correctTitles.has(title)) continue; // correct title for this rank — skip
        if (!window.includes(title)) continue;

        // Found a wrong-rank title near this character's name
        flaggedTitles.add(title);
      }
    }

    for (const wrongTitle of flaggedTitles) {
      const wrongRank = TITLE_TO_RANK.get(wrongTitle) || "unknown";
      issues.push({
        type: "title_inconsistency",
        severity: "critical",
        description: `캐릭터 "${character.name}"(${rank})의 나레이션에서 "${wrongTitle}" 칭호 사용됨 (${wrongRank} 칭호). 올바른 칭호: [${[...correctTitles].join(", ")}]`,
        detail: `"${character.name}" 신분 "${rank}" — 나레이션에서 잘못된 칭호 "${wrongTitle}"(${wrongRank}) 사용`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Name/surname consistency check
// ---------------------------------------------------------------------------

/** Common Korean particles/postpositions that follow names — NOT surnames */
const COMMON_PARTICLES = /^(은|는|이|가|을|를|에게|의|과|와|도|만|까지|부터|에|서|로|께|한테|께서|에게서|한테서|으로)$/;

/** Particles that attach directly to the end of a name (no space) */
const ATTACHED_PARTICLES = [
  "에게서", "한테서", "께서",  // longest particles first to match greedily
  "에게", "한테", "부터", "까지", "으로",
  "가", "를", "을", "이", "은", "는", "의", "에", "로", "와", "과", "도", "께",
];

/**
 * Korean honorifics/titles that follow a first name — NOT surnames.
 * e.g. "세레나 영애", "루시안 전하가"
 */
const KOREAN_HONORIFICS = new Set([
  "영애", "공녀", "전하", "폐하", "공작", "공자", "백작", "후작", "남작",
  "시녀", "기사", "님", "씨", "양", "군", "경", "선배", "후배", "교수",
  "대장", "장군", "대감", "나리", "마마", "아가씨", "도련님",
  // Common words that follow first names but are NOT surnames
  "자신", "혼자", "쪽으로", "쪽에", "쪽을", "앞에", "뒤에", "옆에",
  "역시", "만이", "조차", "마저", "뿐이", "때문", "덕분", "탓에",
  // Body parts (commonly written as "이름 + 신체부위")
  "눈이", "눈을", "눈에", "눈빛", "눈썹", "입이", "입을", "입술",
  "손이", "손을", "손에", "손끝", "손등", "손가락", "손바닥",
  "얼굴", "머리", "이마", "목이", "목을", "어깨", "등이", "등을",
  "발이", "발을", "무릎", "허리", "가슴", "턱이", "턱을", "볼이",
  "팔이", "팔을", "고개", "몸이", "몸을", "목소리",
  // Common nouns/verbs after names
  "앞에서", "뒤에서", "옆에서", "위에", "아래", "근처", "주변",
  "말이", "말을", "대답", "표정", "시선", "모습", "행동", "태도",
]);

/**
 * Korean titles that may be used as if they were a first name (e.g. "황후 폐하께서").
 * When a character's firstName is actually one of these titles, skip name consistency
 * checks since "황후 + X" is a title reference, not a name inconsistency.
 */
const KOREAN_TITLE_WORDS = new Set([
  "황후", "황제", "황태자", "황녀", "왕", "왕비", "왕자", "공주",
  "공작", "후작", "백작", "자작", "남작", "귀족", "영주",
]);

function checkNameConsistency(
  text: string,
  characters: Array<{ name: string; [key: string]: unknown }>,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const character of characters) {
    const fullName = character.name;
    const nameParts = fullName.split(/\s+/);
    if (nameParts.length < 2) continue; // Skip single-name characters

    const firstName = nameParts[0];
    const knownSurname = nameParts.slice(1).join(" ");

    // If the firstName is a Korean title word (황후, 황제, etc.), skip entirely.
    // "황후 폐하께서" is a title reference, not a name inconsistency.
    if (KOREAN_TITLE_WORDS.has(firstName)) continue;

    // Find all instances of firstName + space + word in text
    const pattern = new RegExp(`${firstName}\\s+([가-힣]{2,})`, "g");
    let match;
    const wrongSurnames = new Set<string>();

    while ((match = pattern.exec(text)) !== null) {
      const followingWord = match[1];

      // Strip attached particles from the end of followingWord for comparison.
      // e.g. "에버딘을" -> base "에버딘", suffix "을"
      // e.g. "에버딘께서" -> base "에버딘", suffix "께서"
      let strippedWord = followingWord;
      for (const particle of ATTACHED_PARTICLES) {
        if (followingWord.endsWith(particle) && followingWord.length > particle.length) {
          strippedWord = followingWord.slice(0, -particle.length);
          break;
        }
      }

      // Skip if the stripped word matches the known surname
      if (knownSurname === strippedWord || knownSurname.includes(strippedWord)) continue;

      // Skip if the word is the known surname with an attached Korean particle (legacy check)
      if (followingWord.startsWith(knownSurname)) {
        const suffix = followingWord.slice(knownSurname.length);
        if (suffix.length === 0 || ATTACHED_PARTICLES.includes(suffix)) continue;
      }

      // Skip if followingWord (or its stripped form) is a Korean honorific
      // e.g. "세레나 영애", "루시안 전하가" (전하 + 가)
      if (KOREAN_HONORIFICS.has(followingWord) || KOREAN_HONORIFICS.has(strippedWord)) continue;

      // Skip common particles/postpositions
      if (COMMON_PARTICLES.test(followingWord)) continue;

      // Skip common non-surname words (verbs, common nouns)
      if (/[었했했된된는]$/.test(followingWord)) continue;

      // Only flag as name inconsistency if the stripped word looks like a plausible
      // alternate surname — must be 2-3 syllables AND contain no common Korean noun
      // suffixes that indicate it's a regular word, not a name.
      const COMMON_NOUN_INDICATORS = /[과와도에서로의를은는이가만까지부터처럼마다]$/;
      if (strippedWord.length >= 2 && strippedWord.length <= 3 && !COMMON_NOUN_INDICATORS.test(strippedWord)) {
        wrongSurnames.add(followingWord);
      }
    }

    for (const wrongSurname of wrongSurnames) {
      issues.push({
        type: "name_inconsistency" as ConsistencyIssue["type"],
        severity: "major",
        description: `캐릭터 "${fullName}"의 이름 뒤에 다른 성씨 "${wrongSurname}" 발견 ("${firstName} ${wrongSurname}"). seed에 정의된 풀네임은 "${fullName}"입니다.`,
        detail: `"${firstName} ${wrongSurname}" 발견 — 시드 정의 이름은 "${fullName}"`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Per-check penalty mapping: each check type maps to its own rule's penalty
// from NARRATIVE_RULES, instead of coupling severity levels to arbitrary rules.
// ---------------------------------------------------------------------------

const ISSUE_TYPE_PENALTY: Record<ConsistencyIssue["type"], number> = {
  pov_inconsistency: getRulePenalty("povConsistency"),         // 0.3
  rank_inconsistency: getRulePenalty("rankConsistency"),       // 0.3
  title_inconsistency: getRulePenalty("titleConsistency"),     // 0.25
  name_inconsistency: getRulePenalty("nameConsistency"),       // 0.15
  unnamed_scene_start: getRulePenalty("cameraScanPattern"),    // 0.05 (default)
  character_existence: getRulePenalty("nameConsistency"),      // 0.15
  timeline_contradiction: 0.1,                                 // no direct rule
  location_discontinuity: 0.05,                                // minor
  companion_discontinuity: 0.15,                               // major: 동행 그룹 분리 묘사 없음
  low_comprehensibility: getRulePenalty("comprehensibility"),   // 0.1
};

export function evaluateConsistencyGate(
  text: string,
  characters: Array<{ name: string; [key: string]: unknown }>,
  pov?: "first" | "third",
  previousCharacterStates?: CharacterState[],
): ConsistencyGateResult {
  const paragraphs = text.split("\n\n").map((p) => p.trim()).filter((p) => p.length > 0);

  const issues: ConsistencyIssue[] = [
    ...checkPOVConsistency(paragraphs, characters, pov),
    ...checkUnnamedSceneStart(paragraphs, characters),
    ...checkCharacterExistence(text, characters),
    ...checkTimelineContradiction(paragraphs),
    ...checkLocationDiscontinuity(paragraphs),
    ...checkCompanionContinuity(text, paragraphs, characters, previousCharacterStates),
    ...checkRankConsistency(text, characters),
    ...checkTitleConsistency(text, characters),
    ...checkNameConsistency(text, characters),
  ];

  // Comprehensibility check
  const comprehensibility = measureComprehensibility(text, characters);
  if (comprehensibility.score < 0.35) {
    issues.push({
      type: "low_comprehensibility",
      severity: "major",
      description: `독해 명확성 낮음 (점수: ${comprehensibility.score.toFixed(2)}): 주어 생략 ${comprehensibility.details.subjectOmissionStreaks}회, ROUGH_SHIFT ${comprehensibility.details.roughShiftCount}회, 불명확 대명사 ${comprehensibility.details.unresolvedPronouns + comprehensibility.details.ambiguousPronouns}개`,
      detail: `독해 점수 ${comprehensibility.score.toFixed(2)} (임계값 0.35 미만)`,
    });
  }

  // Each issue contributes its own rule-specific penalty (not severity-based)
  // Apply penalty per issue TYPE (not per instance) to avoid false-positive cascades.
  // e.g., 4 name_inconsistency issues from the same character = one penalty, not 4x.
  const seenTypes = new Set<string>();
  let gate = 1.0;
  for (const issue of issues) {
    if (!seenTypes.has(issue.type)) {
      seenTypes.add(issue.type);
      gate -= ISSUE_TYPE_PENALTY[issue.type];
    }
  }
  // Floor at 0.5 so consistency issues dampen but don't destroy the score
  gate = Math.max(0.5, gate);

  return {
    score: gate,
    issues,
  };
}
