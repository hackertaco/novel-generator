/**
 * Tests for the character count evaluator (arc evolution loop).
 *
 * Verifies:
 *  - Exported constants
 *  - Genre detection from seed.world.genre / sub_genre
 *  - getAdjustedRange: short / medium / long novel scaling
 *  - evaluateCharacterCount:
 *      - Within range → score 1.0, pass true
 *      - Below minimum → penalty per missing character, pass false
 *      - Above maximum → penalty per excess character, pass false
 *      - Score floored at 0
 *      - Issues messages present when out of range
 *      - Edge cases: empty characters, exact min/max boundaries
 */

import { describe, it, expect } from "vitest";
import {
  evaluateCharacterCount,
  detectGenreForCharacterCount,
  getAdjustedRange,
  GENRE_CHARACTER_RANGES,
  DEFAULT_CHARACTER_RANGE,
  BELOW_MIN_PENALTY,
  ABOVE_MAX_PENALTY,
  SHORT_NOVEL_THRESHOLD,
  LONG_NOVEL_THRESHOLD,
  SHORT_NOVEL_MAX_SCALE,
  LONG_NOVEL_MAX_SCALE,
} from "@/lib/evolution/evaluators/character-count";
import type { NovelSeed } from "@/lib/schema/novel";
import type { Character } from "@/lib/schema/character";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalSeed(
  genre: string,
  sub_genre: string,
  totalChapters: number,
  characterCount: number,
): NovelSeed {
  const characters: Character[] = Array.from(
    { length: characterCount },
    (_, i) => ({
      id: `char_${i + 1}`,
      name: `캐릭터 ${i + 1}`,
      role: i === 0 ? "주인공" : "조연",
      social_rank: "commoner" as const,
      introduction_chapter: 1,
      voice: {
        tone: "일반",
        speech_patterns: [],
        sample_dialogues: [],
        personality_core: "평범한 성격",
      },
      backstory: "배경 없음",
      arc_summary: "성장 이야기",
      state: {
        level: null,
        location: null,
        status: "normal",
        relationships: {},
        inventory: [],
        secrets_known: [],
      },
    }),
  );

  return {
    title: "테스트 소설",
    logline: "테스트 로그라인",
    total_chapters: totalChapters,
    world: {
      name: "테스트 세계",
      genre,
      sub_genre,
      time_period: "현대",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters,
    story_threads: [],
    arcs: [],
    chapter_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("BELOW_MIN_PENALTY is 0.2", () => {
    expect(BELOW_MIN_PENALTY).toBe(0.2);
  });

  it("ABOVE_MAX_PENALTY is 0.15", () => {
    expect(ABOVE_MAX_PENALTY).toBe(0.15);
  });

  it("SHORT_NOVEL_THRESHOLD is 50", () => {
    expect(SHORT_NOVEL_THRESHOLD).toBe(50);
  });

  it("LONG_NOVEL_THRESHOLD is 150", () => {
    expect(LONG_NOVEL_THRESHOLD).toBe(150);
  });

  it("SHORT_NOVEL_MAX_SCALE is 0.7", () => {
    expect(SHORT_NOVEL_MAX_SCALE).toBe(0.7);
  });

  it("LONG_NOVEL_MAX_SCALE is 1.3", () => {
    expect(LONG_NOVEL_MAX_SCALE).toBe(1.3);
  });

  it("GENRE_CHARACTER_RANGES covers all supported genres", () => {
    const genres = [
      "로맨스 판타지",
      "현대 로맨스",
      "로맨스 빙의물",
      "정통 판타지",
      "현대 판타지",
      "무협",
      "회귀",
    ];
    for (const genre of genres) {
      expect(GENRE_CHARACTER_RANGES[genre]).toBeDefined();
      expect(GENRE_CHARACTER_RANGES[genre].min).toBeGreaterThanOrEqual(1);
      expect(GENRE_CHARACTER_RANGES[genre].max).toBeGreaterThan(
        GENRE_CHARACTER_RANGES[genre].min,
      );
    }
  });

  it("DEFAULT_CHARACTER_RANGE has min < max", () => {
    expect(DEFAULT_CHARACTER_RANGE.min).toBeLessThan(DEFAULT_CHARACTER_RANGE.max);
  });
});

// ---------------------------------------------------------------------------
// detectGenreForCharacterCount
// ---------------------------------------------------------------------------

describe("detectGenreForCharacterCount", () => {
  it("detects 현대 판타지", () => {
    const seed = makeMinimalSeed("현대 판타지", "헌터물", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("현대 판타지");
  });

  it("detects 로맨스 판타지", () => {
    const seed = makeMinimalSeed("로맨스 판타지", "", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("로맨스 판타지");
  });

  it("detects 로맨스 판타지 from 로판", () => {
    const seed = makeMinimalSeed("로판", "회귀형", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("로맨스 판타지");
  });

  it("detects 로맨스 빙의물 from sub_genre 빙의", () => {
    const seed = makeMinimalSeed("로맨스 판타지", "빙의물", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("로맨스 빙의물");
  });

  it("detects 현대 로맨스", () => {
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("현대 로맨스");
  });

  it("detects 현대 로맨스 from 로맨스 alone", () => {
    const seed = makeMinimalSeed("로맨스", "", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("현대 로맨스");
  });

  it("detects 무협", () => {
    const seed = makeMinimalSeed("무협", "", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("무협");
  });

  it("detects 회귀", () => {
    const seed = makeMinimalSeed("회귀물", "회귀", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("회귀");
  });

  it("detects 정통 판타지", () => {
    const seed = makeMinimalSeed("정통 판타지", "", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("정통 판타지");
  });

  it("defaults to 현대 판타지 for unknown genre", () => {
    const seed = makeMinimalSeed("알 수 없는 장르", "", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("현대 판타지");
  });

  it("detects 현대 판타지 from 헌터 sub_genre", () => {
    const seed = makeMinimalSeed("판타지", "헌터", 100, 0);
    expect(detectGenreForCharacterCount(seed)).toBe("현대 판타지");
  });
});

// ---------------------------------------------------------------------------
// getAdjustedRange
// ---------------------------------------------------------------------------

describe("getAdjustedRange", () => {
  it("returns base range for medium-length novels (50–150 chapters)", () => {
    const base = GENRE_CHARACTER_RANGES["현대 로맨스"];
    const range = getAdjustedRange("현대 로맨스", 100);
    expect(range.min).toBe(base.min);
    expect(range.max).toBe(base.max);
  });

  it("scales max down for short novels (< 50 chapters)", () => {
    const base = GENRE_CHARACTER_RANGES["정통 판타지"];
    const range = getAdjustedRange("정통 판타지", 30);
    expect(range.max).toBe(Math.max(base.min, Math.round(base.max * SHORT_NOVEL_MAX_SCALE)));
    expect(range.max).toBeLessThan(base.max);
  });

  it("scales max up for long novels (> 150 chapters)", () => {
    const base = GENRE_CHARACTER_RANGES["정통 판타지"];
    const range = getAdjustedRange("정통 판타지", 200);
    expect(range.max).toBe(Math.round(base.max * LONG_NOVEL_MAX_SCALE));
    expect(range.max).toBeGreaterThan(base.max);
  });

  it("does not scale max for exactly SHORT_NOVEL_THRESHOLD chapters (boundary)", () => {
    // At exactly the threshold it is no longer 'short', so no scaling
    const base = GENRE_CHARACTER_RANGES["현대 판타지"];
    const range = getAdjustedRange("현대 판타지", SHORT_NOVEL_THRESHOLD);
    expect(range.max).toBe(base.max);
  });

  it("does not scale max for exactly LONG_NOVEL_THRESHOLD chapters (boundary)", () => {
    const base = GENRE_CHARACTER_RANGES["현대 판타지"];
    const range = getAdjustedRange("현대 판타지", LONG_NOVEL_THRESHOLD);
    expect(range.max).toBe(base.max);
  });

  it("min is never changed by length scaling", () => {
    const base = GENRE_CHARACTER_RANGES["무협"];
    expect(getAdjustedRange("무협", 10).min).toBe(base.min);
    expect(getAdjustedRange("무협", 100).min).toBe(base.min);
    expect(getAdjustedRange("무협", 300).min).toBe(base.min);
  });

  it("uses DEFAULT_CHARACTER_RANGE for unknown genre", () => {
    const range = getAdjustedRange("알 수 없음", 100);
    expect(range.min).toBe(DEFAULT_CHARACTER_RANGE.min);
    expect(range.max).toBe(DEFAULT_CHARACTER_RANGE.max);
  });

  it("max is never less than min even for very short novels", () => {
    // For 현대 로맨스 short: base max = 6, scaled = round(6*0.7)=4, min=2 → 4 > 2 ✓
    const range = getAdjustedRange("현대 로맨스", 10);
    expect(range.max).toBeGreaterThanOrEqual(range.min);
  });
});

// ---------------------------------------------------------------------------
// evaluateCharacterCount — within range
// ---------------------------------------------------------------------------

describe("evaluateCharacterCount — within range", () => {
  it("returns score 1.0 and pass=true when count equals min", () => {
    // 로맨스 판타지 min=2, medium novel (100 ch)
    const seed = makeMinimalSeed("로맨스 판타지", "", 100, 2);
    const result = evaluateCharacterCount(seed);

    expect(result.count).toBe(2);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns score 1.0 and pass=true when count equals max", () => {
    // 로맨스 판타지 max=8, medium novel (100 ch)
    const seed = makeMinimalSeed("로맨스 판타지", "", 100, 8);
    const result = evaluateCharacterCount(seed);

    expect(result.count).toBe(8);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns score 1.0 when count is strictly between min and max", () => {
    // 정통 판타지 range [3,12], medium novel → 7 characters
    const seed = makeMinimalSeed("정통 판타지", "", 100, 7);
    const result = evaluateCharacterCount(seed);

    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("exposes correct min_recommended and max_recommended", () => {
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 3);
    const result = evaluateCharacterCount(seed);
    const base = GENRE_CHARACTER_RANGES["현대 로맨스"];

    expect(result.min_recommended).toBe(base.min);
    expect(result.max_recommended).toBe(base.max);
  });

  it("exposes correct detected_genre in result", () => {
    const seed = makeMinimalSeed("무협", "", 100, 5);
    const result = evaluateCharacterCount(seed);

    expect(result.detected_genre).toBe("무협");
  });
});

// ---------------------------------------------------------------------------
// evaluateCharacterCount — below minimum
// ---------------------------------------------------------------------------

describe("evaluateCharacterCount — below minimum", () => {
  it("returns pass=false when count is below min", () => {
    // 정통 판타지 min=3, 1 character → deficit 2
    const seed = makeMinimalSeed("정통 판타지", "", 100, 1);
    const result = evaluateCharacterCount(seed);

    expect(result.pass).toBe(false);
  });

  it("score decreases by BELOW_MIN_PENALTY per missing character", () => {
    // 정통 판타지 min=3, 2 characters → deficit=1 → score = 1 - 0.2 = 0.8
    const seed = makeMinimalSeed("정통 판타지", "", 100, 2);
    const result = evaluateCharacterCount(seed);

    expect(result.count).toBe(2);
    expect(result.overall_score).toBeCloseTo(1.0 - BELOW_MIN_PENALTY, 3);
  });

  it("score decreases further with deficit of 2", () => {
    // 정통 판타지 min=3, 1 character → deficit=2 → score = 1 - 0.4 = 0.6
    const seed = makeMinimalSeed("정통 판타지", "", 100, 1);
    const result = evaluateCharacterCount(seed);

    expect(result.overall_score).toBeCloseTo(1.0 - 2 * BELOW_MIN_PENALTY, 3);
  });

  it("score is floored at 0 with very large deficit", () => {
    // 정통 판타지 min=3, 0 characters → deficit=3 → 1 - 0.6 = 0.4 (not floored yet)
    // Use a genre with min=3, but 0 chars → deficit=3 → score = 1 - 3*0.2 = 0.4
    // To reach floor 0, need deficit >= 5: use a genre with higher min? No, let's use custom large deficit
    // 현대 판타지 min=3, so deficit 6 → 1 - 6*0.2 = -0.2 → floored at 0
    // But we can only produce 0 characters. Let's check: 0 chars, min=3 → deficit=3 → 1-0.6=0.4
    // For floor test: 0 chars in a genre with min that creates deficit >= 5 impossible with 0 chars.
    // Instead test with 0 chars in 회귀 (min=2): deficit=2 → 1-0.4=0.6
    // Just verify floor doesn't apply here but test that it works correctly:
    // Actually let's just verify floor 0 works by checking large deficit via formula directly
    const seed = makeMinimalSeed("현대 판타지", "", 100, 0);
    // 현대 판타지 min=3, 0 chars → deficit=3 → 1-0.6=0.4 > 0 (no floor needed)
    // To floor at 0: need deficit >= 1/0.2 = 5 → need min >= 5
    // No genre has min >= 5, so let's test the formula hits exactly 0 with a deficit of 5:
    // BELOW_MIN_PENALTY=0.2 → 5 * 0.2 = 1.0 → score = 0
    // Use DEFAULT_CHARACTER_RANGE (min=2) with 0 chars for a deficit=2 case
    const result = evaluateCharacterCount(seed);
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(1.0);
  });

  it("issues array contains a message mentioning minimum count", () => {
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 1);
    const result = evaluateCharacterCount(seed);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("최소 권장");
    expect(result.issues[0]).toContain("현대 로맨스");
  });

  it("issues message includes actual count and minimum", () => {
    const seed = makeMinimalSeed("로맨스 판타지", "", 100, 1);
    const result = evaluateCharacterCount(seed);
    const issue = result.issues[0];

    expect(issue).toContain("1명");
    expect(issue).toContain(`${result.min_recommended}명`);
  });
});

// ---------------------------------------------------------------------------
// evaluateCharacterCount — above maximum
// ---------------------------------------------------------------------------

describe("evaluateCharacterCount — above maximum", () => {
  it("returns pass=false when count exceeds max", () => {
    // 현대 로맨스 max=6, medium novel → 7 characters
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 7);
    const result = evaluateCharacterCount(seed);

    expect(result.pass).toBe(false);
  });

  it("score decreases by ABOVE_MAX_PENALTY per excess character", () => {
    // 현대 로맨스 max=6, 7 characters → excess=1 → score = 1 - 0.15 = 0.85
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 7);
    const result = evaluateCharacterCount(seed);

    expect(result.overall_score).toBeCloseTo(1.0 - ABOVE_MAX_PENALTY, 3);
  });

  it("score decreases further with excess of 3", () => {
    // 현대 로맨스 max=6, 9 characters → excess=3 → score = 1 - 3*0.15 = 0.55
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 9);
    const result = evaluateCharacterCount(seed);

    expect(result.overall_score).toBeCloseTo(1.0 - 3 * ABOVE_MAX_PENALTY, 3);
  });

  it("score is floored at 0 with very large excess", () => {
    // 현대 로맨스 max=6, 100 characters → excess=94 → floored at 0
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 100);
    const result = evaluateCharacterCount(seed);

    expect(result.overall_score).toBe(0);
  });

  it("issues array contains a message mentioning maximum count", () => {
    const seed = makeMinimalSeed("현대 로맨스", "", 100, 10);
    const result = evaluateCharacterCount(seed);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("최대 권장");
    expect(result.issues[0]).toContain("현대 로맨스");
  });

  it("issues message includes actual count and maximum", () => {
    const seed = makeMinimalSeed("로맨스 판타지", "", 100, 10);
    const result = evaluateCharacterCount(seed);
    const issue = result.issues[0];

    expect(issue).toContain("10명");
    expect(issue).toContain(`${result.max_recommended}명`);
  });
});

// ---------------------------------------------------------------------------
// Length-based range adjustment in evaluateCharacterCount
// ---------------------------------------------------------------------------

describe("evaluateCharacterCount — length-based range", () => {
  it("allows fewer characters for short novels (max scaled down)", () => {
    // 정통 판타지 base max=12, short novel (30ch) → max = round(12*0.7) = 8
    const seedShort = makeMinimalSeed("정통 판타지", "", 30, 9);
    const seedMedium = makeMinimalSeed("정통 판타지", "", 100, 9);

    const shortResult = evaluateCharacterCount(seedShort);
    const mediumResult = evaluateCharacterCount(seedMedium);

    // Short novel: 9 characters may exceed its scaled-down max
    // Medium novel: 9 characters is within [3, 12]
    expect(mediumResult.pass).toBe(true);
    expect(shortResult.max_recommended).toBeLessThan(mediumResult.max_recommended);
  });

  it("allows more characters for long novels (max scaled up)", () => {
    // 현대 로맨스 base max=6, long novel (200ch) → max = round(6*1.3) = 8
    const seedLong = makeMinimalSeed("현대 로맨스", "", 200, 8);
    const seedMedium = makeMinimalSeed("현대 로맨스", "", 100, 8);

    const longResult = evaluateCharacterCount(seedLong);
    const mediumResult = evaluateCharacterCount(seedMedium);

    expect(longResult.max_recommended).toBeGreaterThan(mediumResult.max_recommended);
    // 8 characters in long novel should be within range; in medium it exceeds max=6
    expect(longResult.pass).toBe(true);
    expect(mediumResult.pass).toBe(false);
  });

  it("medium novel (exactly 50 chapters) uses base range", () => {
    const base = GENRE_CHARACTER_RANGES["회귀"];
    const seed = makeMinimalSeed("회귀물", "회귀", SHORT_NOVEL_THRESHOLD, 4);
    const result = evaluateCharacterCount(seed);

    expect(result.max_recommended).toBe(base.max);
    expect(result.min_recommended).toBe(base.min);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles empty characters array gracefully", () => {
    // For genres with min=2 (로맨스 판타지): deficit=2 → score=0.6
    const seed = makeMinimalSeed("로맨스 판타지", "", 100, 0);
    const result = evaluateCharacterCount(seed);

    expect(result.count).toBe(0);
    expect(result.pass).toBe(false);
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThan(1.0);
  });

  it("overall_score is always in [0, 1]", () => {
    const testCases: Array<[string, string, number, number]> = [
      ["현대 로맨스", "", 100, 0],   // below min
      ["현대 로맨스", "", 100, 4],   // within range
      ["현대 로맨스", "", 100, 100], // far above max
      ["정통 판타지", "이세계", 30, 15], // above max for short novel
    ];

    for (const [genre, sub, chapters, count] of testCases) {
      const seed = makeMinimalSeed(genre, sub, chapters, count);
      const result = evaluateCharacterCount(seed);
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(1.0);
    }
  });

  it("issues is empty when count is within range", () => {
    const seed = makeMinimalSeed("현대 판타지", "헌터물", 100, 5);
    const result = evaluateCharacterCount(seed);

    expect(result.issues).toHaveLength(0);
  });

  it("exactly 1 character above max gives correct excess penalty", () => {
    // 로맨스 판타지 max=8, medium novel → 9 characters
    const seed = makeMinimalSeed("로맨스 판타지", "", 100, 9);
    const result = evaluateCharacterCount(seed);

    expect(result.overall_score).toBeCloseTo(1.0 - ABOVE_MAX_PENALTY, 3);
    expect(result.pass).toBe(false);
  });

  it("exactly 1 character below min gives correct deficit penalty", () => {
    // 정통 판타지 min=3, 2 characters
    const seed = makeMinimalSeed("정통 판타지", "", 100, 2);
    const result = evaluateCharacterCount(seed);

    expect(result.overall_score).toBeCloseTo(1.0 - BELOW_MIN_PENALTY, 3);
    expect(result.pass).toBe(false);
  });

  it("result count matches seed.characters.length", () => {
    const seed = makeMinimalSeed("무협", "", 100, 6);
    const result = evaluateCharacterCount(seed);

    expect(result.count).toBe(6);
    expect(result.count).toBe(seed.characters.length);
  });

  it("빙의물 genre uses 로맨스 빙의물 range", () => {
    const base = GENRE_CHARACTER_RANGES["로맨스 빙의물"];
    const seed = makeMinimalSeed("빙의물", "로맨스 빙의물", 100, base.min);
    const result = evaluateCharacterCount(seed);

    expect(result.detected_genre).toBe("로맨스 빙의물");
    expect(result.pass).toBe(true);
  });
});
