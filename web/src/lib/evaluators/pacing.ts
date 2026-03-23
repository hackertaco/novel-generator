/**
 * Pacing evaluator — quantitative checks for chapter length and narrative speed.
 *
 * Each sub-metric produces a 0-1 score and a pass/fail boolean.
 * overall_score is a weighted average:
 *   length 30% + scene_density 25% + description_ratio 20%
 *   + dialogue_pacing 15% + time_jumps 10%
 */

export interface PacingResult {
  length: {
    char_count: number;
    target_min: number;
    target_max: number;
    score: number;
    pass: boolean;
  };
  scene_density: {
    scene_count: number;
    chars_per_scene: number;
    score: number;
    pass: boolean;
  };
  description_ratio: {
    descriptive_sentences: number;
    total_sentences: number;
    ratio: number;
    score: number;
    pass: boolean;
  };
  dialogue_pacing: {
    max_consecutive_dialogue_lines: number;
    score: number;
    pass: boolean;
  };
  time_jumps: {
    count: number;
    markers: string[];
    score: number;
    pass: boolean;
  };
  overall_score: number;
}

const TARGET_MIN = 3000;
const TARGET_MAX = 7000;
const OPTIMAL_CHARS_PER_SCENE_MIN = 1500;
const OPTIMAL_CHARS_PER_SCENE_MAX = 2500;
const DESCRIPTION_TARGET_MIN = 0.25;
const DESCRIPTION_TARGET_MAX = 0.50;
const MAX_CONSECUTIVE_DIALOGUE = 5;
const MAX_TIME_JUMPS = 2;

export function evaluatePacing(content: string, chapterNumber?: number): PacingResult {
  const lengthResult = checkLength(content);
  const sceneResult = checkSceneDensity(content);
  const descResult = checkDescriptionRatio(content);
  const dialogueResult = checkDialoguePacing(content);
  const timeResult = checkTimeJumps(content);

  let overall =
    lengthResult.score * 0.30 +
    sceneResult.score * 0.25 +
    descResult.score * 0.20 +
    dialogueResult.score * 0.15 +
    timeResult.score * 0.10;

  // Early chapter penalty: stricter pacing enforcement for ch1-5
  if (chapterNumber !== undefined && chapterNumber <= 5) {
    const earlyPenalty = checkEarlyChapterPacing(content, chapterNumber);
    // Apply penalty: reduce overall score
    overall = overall * earlyPenalty.multiplier;
  }

  return {
    length: lengthResult,
    scene_density: sceneResult,
    description_ratio: descResult,
    dialogue_pacing: dialogueResult,
    time_jumps: timeResult,
    overall_score: overall,
  };
}

/** Early chapter pacing gate — penalizes rushed ch1-5 content */
interface EarlyPacingCheck {
  multiplier: number; // 0-1, applied to overall score
  issues: string[];
}

// Patterns that indicate "finale-like" writing in early chapters
export const POWER_UP_PATTERNS = [
  /각성/g, /변신/g, /진화/g, /레벨\s*업/g, /스킬\s*(획득|습득)/g,
  /능력을?\s*(얻|깨달|발현)/g, /폭발적/g, /압도적/g,
];

export const CLIMAX_PATTERNS = [
  /최종/g, /결전/g, /결말/g, /운명/g, /진실을?\s*알/g,
  /모든\s*것이/g, /세계가/g, /멸망/g,
];

export function checkEarlyChapterPacing(content: string, chapterNumber: number): EarlyPacingCheck {
  const issues: string[] = [];
  let penalty = 0;

  // 1. Count unique character names (Korean names: 2-4 chars)
  const namePattern = /[가-힣]{2,4}(?=이|가|은|는|을|를|의|에게|한테|와|과|도|만)/g;
  const nameMatches = content.match(namePattern) || [];
  const uniqueNames = new Set(nameMatches);
  const maxNames = chapterNumber === 1 ? 2 : chapterNumber <= 3 ? 3 : 4;
  if (uniqueNames.size > maxNames) {
    issues.push(`캐릭터 ${uniqueNames.size}명 등장 (초반 ${chapterNumber}화 기준 ${maxNames}명 이하 권장)`);
    penalty += 0.15;
  }

  // 2. Scene break count
  const sceneBreaks = (content.match(/\n\s*(\*\s*\*\s*\*|---+|===+)\s*\n/g) || []).length;
  // Also count implicit scene breaks (double newlines with location/time changes)
  const implicitBreaks = (content.match(/\n\n\n/g) || []).length;
  const totalBreaks = sceneBreaks + implicitBreaks;
  const maxBreaks = chapterNumber === 1 ? 0 : 1;
  if (totalBreaks > maxBreaks) {
    issues.push(`장면 전환 ${totalBreaks}회 (${chapterNumber}화 기준 ${maxBreaks}회 이하 권장)`);
    penalty += 0.15;
  }

  // 3. Power-up / ability acquisition in early chapters
  if (chapterNumber <= 2) {
    let powerUpCount = 0;
    for (const pattern of POWER_UP_PATTERNS) {
      powerUpCount += (content.match(pattern) || []).length;
    }
    if (powerUpCount >= 2) {
      issues.push(`능력 각성/획득 표현 ${powerUpCount}회 (1-2화에서 과도)`);
      penalty += 0.2;
    }
  }

  // 4. Climax-level language in early chapters
  if (chapterNumber <= 3) {
    let climaxCount = 0;
    for (const pattern of CLIMAX_PATTERNS) {
      climaxCount += (content.match(pattern) || []).length;
    }
    if (climaxCount >= 3) {
      issues.push(`클라이맥스급 표현 ${climaxCount}회 (초반에 과도한 긴장감)`);
      penalty += 0.15;
    }
  }

  // 5. Time jumps should be zero in ch1
  if (chapterNumber === 1) {
    const timeJumps = checkTimeJumps(content);
    if (timeJumps.count > 0) {
      issues.push(`1화에 시간 점프 ${timeJumps.count}회`);
      penalty += 0.1;
    }
  }

  const multiplier = Math.max(0.5, 1.0 - penalty);
  return { multiplier, issues };
}

/** 1. Length check — linear ramp from 0 at 0 chars to 1.0 at TARGET_MIN */
function checkLength(content: string) {
  const charCount = content.length;
  let score: number;

  if (charCount < TARGET_MIN) {
    score = charCount / TARGET_MIN; // 0 → 1 linear ramp
  } else if (charCount <= TARGET_MAX) {
    score = 1.0; // sweet spot
  } else {
    // gentle penalty above max (0.02 per 100 chars over)
    score = Math.max(0.5, 1.0 - (charCount - TARGET_MAX) / 5000);
  }

  return {
    char_count: charCount,
    target_min: TARGET_MIN,
    target_max: TARGET_MAX,
    score,
    pass: charCount >= TARGET_MIN,
  };
}

/**
 * 2. Scene density — detect scene breaks and compute avg chars per scene.
 * Scene breaks: blank line + "***" or "---" or "* * *", or
 * two+ consecutive blank lines suggesting a scene transition.
 */
function checkSceneDensity(content: string) {
  const sceneBreakPattern = /\n\s*(\*\s*\*\s*\*|---+|===+)\s*\n/g;
  const breakCount = (content.match(sceneBreakPattern) || []).length;
  const sceneCount = breakCount + 1; // n breaks = n+1 scenes
  const charsPerScene = content.length / sceneCount;

  let score: number;
  if (charsPerScene < OPTIMAL_CHARS_PER_SCENE_MIN) {
    // too many scenes for the length — feels rushed
    score = charsPerScene / OPTIMAL_CHARS_PER_SCENE_MIN;
  } else if (charsPerScene <= OPTIMAL_CHARS_PER_SCENE_MAX) {
    score = 1.0;
  } else {
    // one giant scene — slight penalty but not as bad
    score = Math.max(0.7, 1.0 - (charsPerScene - OPTIMAL_CHARS_PER_SCENE_MAX) / 5000);
  }

  return {
    scene_count: sceneCount,
    chars_per_scene: Math.round(charsPerScene),
    score,
    pass: charsPerScene >= OPTIMAL_CHARS_PER_SCENE_MIN,
  };
}

/**
 * 3. Description ratio — count sentences with sensory/emotional keywords.
 * Korean sensory words: 눈, 빛, 향, 냄새, 소리, 바람, 차가운, 따뜻한,
 * 느끼다, 보이다, 들리다, etc.
 */
export const DESCRIPTIVE_KEYWORDS = [
  // Visual
  "눈앞", "빛", "어둠", "그림자", "색", "흐릿",
  // Auditory
  "소리", "목소리", "울림", "속삭", "고요",
  // Olfactory/Tactile
  "향", "냄새", "차가", "따뜻", "축축", "부드러",
  // Kinesthetic
  "바람", "떨리", "흔들", "감싸",
  // Emotional state
  "가슴", "심장", "숨", "호흡", "긴장", "두근",
  "불안", "안도", "전율", "눈물",
  // Temporal/atmospheric
  "하늘", "구름", "비", "햇살", "달빛", "안개",
];

function checkDescriptionRatio(content: string) {
  const sentences = splitSentences(content);
  if (sentences.length === 0) {
    return { descriptive_sentences: 0, total_sentences: 0, ratio: 0, score: 0, pass: false };
  }

  let descriptiveCount = 0;
  for (const sent of sentences) {
    if (DESCRIPTIVE_KEYWORDS.some((kw) => sent.includes(kw))) {
      descriptiveCount++;
    }
  }

  const ratio = descriptiveCount / sentences.length;
  let score: number;

  if (ratio < DESCRIPTION_TARGET_MIN) {
    score = ratio / DESCRIPTION_TARGET_MIN; // 0 → 1 linear
  } else if (ratio <= DESCRIPTION_TARGET_MAX) {
    score = 1.0;
  } else {
    // too much description also slows things down
    score = Math.max(0.6, 1.0 - (ratio - DESCRIPTION_TARGET_MAX) / 0.5);
  }

  return {
    descriptive_sentences: descriptiveCount,
    total_sentences: sentences.length,
    ratio: Math.round(ratio * 100) / 100,
    score,
    pass: ratio >= DESCRIPTION_TARGET_MIN,
  };
}

/**
 * 4. Dialogue pacing — find the longest run of consecutive dialogue lines
 * without narration. A dialogue line starts with " or \u201C.
 */
function checkDialoguePacing(content: string) {
  const lines = content.split("\n").filter((l) => l.trim());
  let maxConsecutive = 0;
  let current = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^["\u201C\u300C]/.test(trimmed)) {
      current++;
      maxConsecutive = Math.max(maxConsecutive, current);
    } else {
      current = 0;
    }
  }

  let score: number;
  if (maxConsecutive <= MAX_CONSECUTIVE_DIALOGUE) {
    score = 1.0;
  } else {
    score = Math.max(0.3, 1.0 - (maxConsecutive - MAX_CONSECUTIVE_DIALOGUE) * 0.1);
  }

  return {
    max_consecutive_dialogue_lines: maxConsecutive,
    score,
    pass: maxConsecutive <= MAX_CONSECUTIVE_DIALOGUE,
  };
}

/**
 * 5. Time jumps — count explicit temporal transition markers.
 */
export const TIME_JUMP_PATTERNS = [
  /다음\s*날/g,
  /며칠\s*(후|뒤)/g,
  /몇\s*시간\s*(후|뒤)/g,
  /일주일\s*(후|뒤)/g,
  /한\s*달\s*(후|뒤)/g,
  /얼마\s*후/g,
  /그로부터/g,
  /시간이\s*(흐르|지나)/g,
  /\d+일\s*(후|뒤|째)/g,
  /이튿날/g,
  /다음\s*주/g,
];

function checkTimeJumps(content: string) {
  const markers: string[] = [];

  for (const pattern of TIME_JUMP_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      markers.push(...matches);
    }
  }

  const count = markers.length;
  let score: number;
  if (count <= MAX_TIME_JUMPS) {
    score = 1.0;
  } else {
    score = Math.max(0.3, 1.0 - (count - MAX_TIME_JUMPS) * 0.2);
  }

  return {
    count,
    markers: markers.slice(0, 5),
    score,
    pass: count <= MAX_TIME_JUMPS,
  };
}

/** Split Korean text into sentences. */
function splitSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?다요죠])\s+/)
    .filter((s) => s.trim().length > 5);
}
