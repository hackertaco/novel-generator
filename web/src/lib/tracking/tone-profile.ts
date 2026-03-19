/**
 * Arc-level tone profile system.
 *
 * Derives per-arc tone expectations from the NovelSeed and provides
 * code-based (no LLM) tone compliance checking using Korean keyword matching.
 */

import type { NovelSeed, PlotArc } from "../schema/novel";
import { getArcForChapter } from "../schema/novel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToneType =
  | "dark_tension"
  | "mystery"
  | "romantic"
  | "lighthearted"
  | "action"
  | "melancholy"
  | "comedic"
  | "epic"
  | "intimate"
  | "suspense"
  | "horror"
  | "slice_of_life";

export interface ArcToneProfile {
  arcId: string;
  primary: ToneType;
  secondary: ToneType[];
  forbidden: ToneType[];
  transition_note: string;
  intensity_curve: number[];
}

export interface ToneChapterInfo {
  profile: ArcToneProfile;
  intensity: number;
  isTransition: boolean;
  transitionGuidance?: string;
}

export interface ToneComplianceResult {
  compliant: boolean;
  detected_tone: ToneType;
  issues: string[];
}

// ---------------------------------------------------------------------------
// Korean keyword dictionaries for code-based tone detection
// ---------------------------------------------------------------------------

const TONE_KEYWORDS: Record<ToneType, string[]> = {
  dark_tension: [
    "긴장", "공포", "위협", "살기", "어둠", "피", "두려움", "절망",
    "비명", "죽음", "고통", "저주", "암흑", "파멸", "위기",
  ],
  mystery: [
    "비밀", "수수께끼", "단서", "의문", "추리", "진실", "숨겨진",
    "흔적", "증거", "미스터리", "의심", "수상한", "정체", "조사",
  ],
  romantic: [
    "심장", "설렘", "손끝", "눈동자", "미소", "달빛", "사랑",
    "애틋", "따뜻", "가슴", "고백", "그리움", "향기", "포옹", "입술",
  ],
  lighthearted: [
    "즐거운", "기분", "밝은", "미소", "행복", "상쾌", "활기",
    "평화", "여유", "느긋", "편안", "산뜻", "경쾌",
  ],
  action: [
    "검", "타격", "폭발", "회피", "공격", "방어", "전투", "격돌",
    "파괴", "돌진", "일격", "칼날", "마력", "기술", "충격파", "참격",
  ],
  melancholy: [
    "슬픔", "눈물", "외로움", "고독", "쓸쓸", "아픔", "상실",
    "후회", "그리움", "허무", "쓸쓸한", "이별", "잃어버린",
  ],
  comedic: [
    "웃음", "황당", "멍하니", "어이없", "터지", "장난", "농담",
    "헛웃음", "뿜", "코미디", "유머", "개그", "바보",
  ],
  epic: [
    "영웅", "전설", "각성", "운명", "세계", "대륙", "왕", "용",
    "신", "제국", "대전쟁", "선언", "압도적", "위대한", "초월",
  ],
  intimate: [
    "속삭임", "조용히", "단둘이", "품", "체온", "내밀한", "비밀",
    "고백", "눈빛", "손을 잡", "가까이",
  ],
  suspense: [
    "긴장", "숨", "멈추", "갑자기", "뒤돌아", "시선", "기척",
    "소름", "예감", "불안", "뭔가", "이상한",
  ],
  horror: [
    "괴물", "비명", "공포", "피", "소름", "유령", "저주", "악몽",
    "어둠", "시체", "그림자", "악령", "두려움",
  ],
  slice_of_life: [
    "일상", "아침", "밥", "학교", "산책", "카페", "친구", "수업",
    "점심", "저녁", "집", "동네", "평범한", "하루",
  ],
};

// ---------------------------------------------------------------------------
// Genre → tone palette mapping
// ---------------------------------------------------------------------------

interface TonePalette {
  primary: ToneType;
  secondary: ToneType[];
  forbidden: ToneType[];
}

const GENRE_TONE_MAP: Record<string, TonePalette> = {
  판타지: {
    primary: "epic",
    secondary: ["action", "mystery", "dark_tension"],
    forbidden: ["slice_of_life"],
  },
  현대판타지: {
    primary: "action",
    secondary: ["mystery", "suspense", "comedic"],
    forbidden: [],
  },
  무협: {
    primary: "action",
    secondary: ["epic", "dark_tension", "melancholy"],
    forbidden: ["slice_of_life", "comedic"],
  },
  로맨스: {
    primary: "romantic",
    secondary: ["intimate", "lighthearted", "melancholy"],
    forbidden: ["horror", "action"],
  },
  로맨스판타지: {
    primary: "romantic",
    secondary: ["epic", "mystery", "lighthearted"],
    forbidden: ["horror"],
  },
  현대: {
    primary: "slice_of_life",
    secondary: ["romantic", "comedic", "melancholy"],
    forbidden: ["epic"],
  },
  스릴러: {
    primary: "suspense",
    secondary: ["dark_tension", "mystery", "horror"],
    forbidden: ["comedic", "lighthearted"],
  },
  호러: {
    primary: "horror",
    secondary: ["dark_tension", "suspense", "mystery"],
    forbidden: ["comedic", "lighthearted", "romantic"],
  },
  SF: {
    primary: "mystery",
    secondary: ["epic", "suspense", "action"],
    forbidden: [],
  },
};

const SUB_GENRE_TONE_HINTS: Record<string, ToneType> = {
  회귀: "mystery",
  빙의: "mystery",
  헌터: "action",
  아카데미: "lighthearted",
  궁중: "suspense",
  집착: "dark_tension",
  달달: "romantic",
  성장: "epic",
  복수: "dark_tension",
  사이다: "action",
  힐링: "lighthearted",
  던전: "action",
};

// ---------------------------------------------------------------------------
// Arc position → tone bias
// ---------------------------------------------------------------------------

function arcPositionBias(
  arcIndex: number,
  totalArcs: number,
): { boost: ToneType[]; suppress: ToneType[] } {
  const ratio = totalArcs <= 1 ? 0.5 : arcIndex / (totalArcs - 1);

  if (ratio <= 0.25) {
    // Early arcs: setup / mystery
    return {
      boost: ["mystery", "lighthearted", "slice_of_life"],
      suppress: ["epic", "action"],
    };
  } else if (ratio <= 0.6) {
    // Middle arcs: rising tension
    return {
      boost: ["dark_tension", "suspense", "romantic"],
      suppress: ["lighthearted"],
    };
  } else if (ratio <= 0.85) {
    // Climax arcs
    return {
      boost: ["action", "epic", "dark_tension"],
      suppress: ["slice_of_life", "lighthearted"],
    };
  } else {
    // Resolution arcs
    return {
      boost: ["melancholy", "intimate", "lighthearted"],
      suppress: ["horror"],
    };
  }
}

// ---------------------------------------------------------------------------
// Summary → primary tone heuristic
// ---------------------------------------------------------------------------

function detectToneFromSummary(summary: string): ToneType | null {
  let best: ToneType | null = null;
  let bestCount = 0;

  for (const [tone, keywords] of Object.entries(TONE_KEYWORDS) as [ToneType, string[]][]) {
    let count = 0;
    for (const kw of keywords) {
      if (summary.includes(kw)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = tone;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// ToneManager
// ---------------------------------------------------------------------------

export class ToneManager {
  private profiles: Map<string, ArcToneProfile>;

  constructor() {
    this.profiles = new Map();
  }

  // -----------------------------------------------------------------------
  // Factory: derive tone profiles from a NovelSeed
  // -----------------------------------------------------------------------

  static fromSeed(seed: NovelSeed): ToneManager {
    const manager = new ToneManager();
    const palette = lookupPalette(seed.world.genre, seed.world.sub_genre);
    const totalArcs = seed.arcs.length;

    for (let i = 0; i < seed.arcs.length; i++) {
      const arc = seed.arcs[i];
      const bias = arcPositionBias(i, totalArcs);

      // Determine primary tone for this arc
      const summaryTone = detectToneFromSummary(arc.summary);
      const primary: ToneType =
        summaryTone && !palette.forbidden.includes(summaryTone)
          ? summaryTone
          : palette.primary;

      // Secondary: merge palette secondary + bias boosts, minus forbidden
      const secondarySet = new Set<ToneType>([
        ...palette.secondary,
        ...bias.boost,
      ]);
      secondarySet.delete(primary);
      for (const f of palette.forbidden) secondarySet.delete(f);
      const secondary = [...secondarySet];

      // Forbidden: palette forbidden + bias suppress (unless it is the primary)
      const forbiddenSet = new Set<ToneType>([
        ...palette.forbidden,
        ...bias.suppress,
      ]);
      forbiddenSet.delete(primary);
      for (const s of secondary) forbiddenSet.delete(s);
      const forbidden = [...forbiddenSet];

      // Intensity curve: derive from arc.tension_curve or generate default
      const chaptersInArc = arc.end_chapter - arc.start_chapter + 1;
      const intensity_curve = deriveIntensityCurve(arc, chaptersInArc);

      // Transition note
      const nextArc = seed.arcs[i + 1];
      const transition_note = nextArc
        ? `${arc.name} → ${nextArc.name}: 톤 전환 준비. 다음 아크의 분위기를 서서히 암시할 것.`
        : `${arc.name}: 최종 아크. 결말을 향해 톤을 수렴시킬 것.`;

      manager.profiles.set(arc.id, {
        arcId: arc.id,
        primary,
        secondary,
        forbidden,
        transition_note,
        intensity_curve,
      });
    }

    return manager;
  }

  // -----------------------------------------------------------------------
  // Get tone info for a specific chapter
  // -----------------------------------------------------------------------

  getToneForChapter(chapterNumber: number, seed: NovelSeed): ToneChapterInfo | null {
    const arc = getArcForChapter(seed, chapterNumber);
    if (!arc) return null;

    const profile = this.profiles.get(arc.id);
    if (!profile) return null;

    const chapIndex = chapterNumber - arc.start_chapter;
    const intensity = interpolateIntensity(profile.intensity_curve, chapIndex);

    // Transition detection: within 1 chapter of arc boundary
    const isNearEnd = chapterNumber >= arc.end_chapter - 1;
    const isNearStart = chapterNumber <= arc.start_chapter;
    const isTransition = isNearEnd || isNearStart;

    let transitionGuidance: string | undefined;
    if (isNearEnd) {
      transitionGuidance = profile.transition_note;
    } else if (isNearStart && chapterNumber > 1) {
      // Starting a new arc — reference previous arc's transition note
      const prevArc = seed.arcs.find((a) => a.end_chapter === arc.start_chapter - 1);
      if (prevArc) {
        const prevProfile = this.profiles.get(prevArc.id);
        if (prevProfile) {
          transitionGuidance = `이전 아크(${prevArc.name})에서 전환됨. 새로운 톤(${profile.primary})을 점진적으로 확립할 것.`;
        }
      }
    }

    return {
      profile,
      intensity,
      isTransition,
      transitionGuidance,
    };
  }

  // -----------------------------------------------------------------------
  // Code-based tone compliance check (NO LLM)
  // -----------------------------------------------------------------------

  checkToneCompliance(
    chapterText: string,
    expectedProfile: ArcToneProfile,
  ): ToneComplianceResult {
    // Score each tone by keyword matches in the chapter text
    const scores: Record<ToneType, number> = {} as Record<ToneType, number>;

    for (const [tone, keywords] of Object.entries(TONE_KEYWORDS) as [ToneType, string[]][]) {
      let count = 0;
      for (const kw of keywords) {
        // Count occurrences
        let idx = 0;
        while (true) {
          const found = chapterText.indexOf(kw, idx);
          if (found === -1) break;
          count++;
          idx = found + kw.length;
        }
      }
      scores[tone] = count;
    }

    // Detected tone = highest scoring
    let detected_tone: ToneType = expectedProfile.primary;
    let maxScore = 0;
    for (const [tone, score] of Object.entries(scores) as [ToneType, number][]) {
      if (score > maxScore) {
        maxScore = score;
        detected_tone = tone;
      }
    }

    // Check compliance
    const issues: string[] = [];

    const allowedTones = new Set<ToneType>([
      expectedProfile.primary,
      ...expectedProfile.secondary,
    ]);

    if (!allowedTones.has(detected_tone)) {
      issues.push(
        `감지된 톤(${detected_tone})이 이 아크의 허용 톤에 포함되지 않습니다. ` +
        `허용 톤: ${expectedProfile.primary}, ${expectedProfile.secondary.join(", ")}`,
      );
    }

    // Check for forbidden tone keywords
    for (const forbidden of expectedProfile.forbidden) {
      if (scores[forbidden] > 3) {
        issues.push(
          `금지 톤(${forbidden})의 키워드가 ${scores[forbidden]}회 감지되었습니다. 해당 톤의 표현을 줄여주세요.`,
        );
      }
    }

    // Check if primary tone is represented
    const primaryScore = scores[expectedProfile.primary] ?? 0;
    if (maxScore > 0 && primaryScore < maxScore * 0.3) {
      issues.push(
        `주요 톤(${expectedProfile.primary})의 키워드가 부족합니다. ` +
        `(${primaryScore}회 vs 최대 ${maxScore}회). 주요 톤을 더 강화해주세요.`,
      );
    }

    return {
      compliant: issues.length === 0,
      detected_tone,
      issues,
    };
  }

  // -----------------------------------------------------------------------
  // Format tone guidance as prompt text (Korean)
  // -----------------------------------------------------------------------

  formatToneGuidance(chapterNumber: number, seed: NovelSeed): string {
    const info = this.getToneForChapter(chapterNumber, seed);
    if (!info) return "";

    const { profile, intensity, isTransition, transitionGuidance } = info;

    const lines: string[] = [
      `## 톤 가이드 (${chapterNumber}화)`,
      "",
      `- 주요 톤: ${profile.primary}`,
      `- 보조 톤: ${profile.secondary.join(", ") || "없음"}`,
      `- 금지 톤: ${profile.forbidden.join(", ") || "없음"}`,
      `- 강도: ${intensity}/10`,
    ];

    if (isTransition && transitionGuidance) {
      lines.push("");
      lines.push(`### 톤 전환 안내`);
      lines.push(transitionGuidance);
    }

    lines.push("");
    lines.push(buildToneInstruction(profile.primary, intensity));

    return lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  toJSON(): object {
    const profiles: Record<string, ArcToneProfile> = {};
    for (const [key, value] of this.profiles) {
      profiles[key] = value;
    }
    return { profiles };
  }

  static fromJSON(data: unknown): ToneManager {
    const manager = new ToneManager();
    const obj = data as { profiles: Record<string, ArcToneProfile> };
    if (obj.profiles) {
      for (const [key, value] of Object.entries(obj.profiles)) {
        manager.profiles.set(key, value);
      }
    }
    return manager;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function lookupPalette(genre: string, subGenre: string): TonePalette {
  // Try exact match first, then partial match
  let palette = GENRE_TONE_MAP[genre];
  if (!palette) {
    for (const [key, val] of Object.entries(GENRE_TONE_MAP)) {
      if (genre.includes(key) || key.includes(genre)) {
        palette = val;
        break;
      }
    }
  }

  // Default palette if nothing matches
  if (!palette) {
    palette = {
      primary: "epic",
      secondary: ["action", "mystery", "romantic"],
      forbidden: [],
    };
  }

  // Apply sub-genre hint
  const subHint = SUB_GENRE_TONE_HINTS[subGenre];
  if (subHint && !palette.secondary.includes(subHint) && subHint !== palette.primary) {
    palette = { ...palette, secondary: [subHint, ...palette.secondary] };
  }

  return palette;
}

function deriveIntensityCurve(arc: PlotArc, chaptersInArc: number): number[] {
  // If arc already has a tension_curve, use it
  if (arc.tension_curve && arc.tension_curve.length > 0) {
    // Resample to match chaptersInArc if needed
    if (arc.tension_curve.length === chaptersInArc) {
      return [...arc.tension_curve];
    }
    // Interpolate
    const result: number[] = [];
    for (let i = 0; i < chaptersInArc; i++) {
      const t = chaptersInArc <= 1 ? 0 : i / (chaptersInArc - 1);
      const srcIdx = t * (arc.tension_curve.length - 1);
      const lo = Math.floor(srcIdx);
      const hi = Math.min(lo + 1, arc.tension_curve.length - 1);
      const frac = srcIdx - lo;
      result.push(Math.round(arc.tension_curve[lo] * (1 - frac) + arc.tension_curve[hi] * frac));
    }
    return result;
  }

  // Generate default curve: ramp up to climax, then slight dip
  const climaxLocal = arc.climax_chapter - arc.start_chapter;
  const result: number[] = [];
  for (let i = 0; i < chaptersInArc; i++) {
    if (i <= climaxLocal) {
      // Rising
      const t = climaxLocal === 0 ? 1 : i / climaxLocal;
      result.push(Math.round(3 + t * 7)); // 3 → 10
    } else {
      // Falling from climax
      const remaining = chaptersInArc - 1 - climaxLocal;
      const t = remaining === 0 ? 1 : (i - climaxLocal) / remaining;
      result.push(Math.round(10 - t * 4)); // 10 → 6
    }
  }
  return result;
}

function interpolateIntensity(curve: number[], chapIndex: number): number {
  if (curve.length === 0) return 5;
  if (chapIndex <= 0) return curve[0];
  if (chapIndex >= curve.length - 1) return curve[curve.length - 1];

  const lo = Math.floor(chapIndex);
  const hi = lo + 1;
  const frac = chapIndex - lo;
  return Math.round(curve[lo] * (1 - frac) + curve[hi] * frac);
}

function buildToneInstruction(primary: ToneType, intensity: number): string {
  const toneDescriptions: Record<ToneType, string> = {
    dark_tension: "어둡고 긴장감 넘치는 분위기를 유지하세요. 위협과 불안을 독자에게 전달하세요.",
    mystery: "미스터리한 분위기를 조성하세요. 단서를 흘리되, 답을 쉽게 주지 마세요.",
    romantic: "로맨틱한 감정선을 섬세하게 묘사하세요. 감정의 떨림을 표현하세요.",
    lighthearted: "가볍고 밝은 분위기로 작성하세요. 독자가 편안하게 읽을 수 있도록.",
    action: "역동적이고 빠른 전개를 유지하세요. 전투/행동 묘사에 집중하세요.",
    melancholy: "쓸쓸하고 감성적인 분위기를 유지하세요. 내면의 감정을 깊이 묘사하세요.",
    comedic: "유머러스한 톤을 유지하세요. 상황 코미디와 캐릭터 반응으로 웃음을 유도하세요.",
    epic: "웅장하고 서사적인 분위기를 만드세요. 세계관의 규모를 느끼게 하세요.",
    intimate: "내밀하고 조용한 분위기를 유지하세요. 캐릭터 간의 깊은 교감을 묘사하세요.",
    suspense: "서스펜스를 유지하세요. 긴장감을 끊지 말고 독자를 조이세요.",
    horror: "공포감을 조성하세요. 불쾌한 이질감과 두려움을 묘사하세요.",
    slice_of_life: "일상적이고 따뜻한 분위기를 유지하세요. 소소한 순간을 풍부하게 묘사하세요.",
  };

  const desc = toneDescriptions[primary] ?? "";
  const intensityGuide =
    intensity >= 8
      ? "이 장면은 강도가 높습니다. 톤을 최대로 끌어올리세요."
      : intensity >= 5
        ? "적절한 강도로 톤을 유지하세요."
        : "톤의 강도를 낮추고, 잔잔하게 유지하세요.";

  return `**톤 지시:** ${desc}\n**강도 지시:** ${intensityGuide}`;
}
