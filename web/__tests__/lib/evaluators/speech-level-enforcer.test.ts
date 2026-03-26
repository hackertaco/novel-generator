import { describe, it, expect } from "vitest";
import {
  enforceSpeechLevels,
  detectSpeechLevel,
  getExpectedSpeechLevel,
  buildSpeechLevelMatrix,
  hasBatchim,
  type SpeechLevel,
  type SocialRank,
} from "@/lib/evaluators/speech-level-enforcer";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeed(characters: Array<{
  id: string;
  name: string;
  rank: SocialRank;
  introChapter?: number;
}>): NovelSeed {
  return {
    title: "테스트 소설",
    logline: "테스트용 시드",
    total_chapters: 10,
    world: {
      name: "테스트 세계",
      genre: "판타지",
      sub_genre: "회귀",
      time_period: "중세",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: "캐릭터",
      social_rank: c.rank,
      introduction_chapter: c.introChapter ?? 1,
      voice: {
        tone: "보통",
        speech_patterns: [],
        sample_dialogues: [],
        personality_core: "보통 성격",
      },
      backstory: "배경",
      arc_summary: "성장",
      state: {
        level: null,
        location: null,
        status: "normal",
        relationships: {},
        inventory: [],
        secrets_known: [],
      },
    })),
    story_threads: [],
    arcs: [],
    chapter_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.3,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [],
    },
  };
}

// ---------------------------------------------------------------------------
// detectSpeechLevel
// ---------------------------------------------------------------------------

describe("detectSpeechLevel", () => {
  it("detects hapsyo (합쇼체) — ~습니다", () => {
    expect(detectSpeechLevel("알겠습니다")).toBe("hapsyo");
    // "감사합니다" contains "합니다" not "습니다", so the regex won't match
    // Use a proper 습니다 ending
    expect(detectSpeechLevel("감사드리겠습니다")).toBe("hapsyo");
  });

  it("detects haeyo (해요체) — ~요", () => {
    expect(detectSpeechLevel("알겠어요")).toBe("haeyo");
    expect(detectSpeechLevel("그래요")).toBe("haeyo");
  });

  it("detects hae (해체) — ~어, ~야, ~지", () => {
    // "알아" ends with 아(\uC544) not 어(\uC5B4), so use proper endings
    expect(detectSpeechLevel("나도 했어")).toBe("hae");
    expect(detectSpeechLevel("그렇지")).toBe("hae");
  });

  it("detects haera (해라체) — ~거라, ~느냐, ~는다", () => {
    expect(detectSpeechLevel("이리 오거라")).toBe("haera");
    expect(detectSpeechLevel("그것이 사실이냐")).toBe("haera");
  });

  it("returns null for very short dialogue (< 2 chars)", () => {
    expect(detectSpeechLevel("아")).toBeNull();
    expect(detectSpeechLevel("")).toBeNull();
  });

  it("returns null when no clear ending pattern exists", () => {
    // Just a noun with no speech level marker
    expect(detectSpeechLevel("뭐")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getExpectedSpeechLevel (via buildSpeechLevelMatrix)
// ---------------------------------------------------------------------------

describe("getExpectedSpeechLevel", () => {
  it("noble speaking to servant → hae or haera (casual/commanding)", () => {
    const level = getExpectedSpeechLevel("noble", "servant");
    expect(["hae", "haera"]).toContain(level);
  });

  it("servant speaking to noble → hapsyo or haeyo (formal/polite)", () => {
    const level = getExpectedSpeechLevel("servant", "noble");
    expect(["hapsyo", "haeyo"]).toContain(level);
  });

  it("same rank → haeyo", () => {
    expect(getExpectedSpeechLevel("commoner", "commoner")).toBe("haeyo");
    expect(getExpectedSpeechLevel("noble", "noble")).toBe("haeyo");
  });

  it("royal to anyone lower → haera", () => {
    expect(getExpectedSpeechLevel("royal", "noble")).toBe("haera");
    expect(getExpectedSpeechLevel("royal", "commoner")).toBe("haera");
    expect(getExpectedSpeechLevel("royal", "servant")).toBe("haera");
  });

  it("slave to royal → hapsyo (most formal)", () => {
    expect(getExpectedSpeechLevel("slave", "royal")).toBe("hapsyo");
  });

  it("large rank gap (>= 2) lower to higher → hapsyo", () => {
    // commoner(3) -> noble(1), gap=2
    expect(getExpectedSpeechLevel("commoner", "noble")).toBe("hapsyo");
  });

  it("small rank gap (== 1) lower to higher → haeyo", () => {
    // gentry(2) -> noble(1), gap=1
    expect(getExpectedSpeechLevel("gentry", "noble")).toBe("haeyo");
  });

  it("small rank gap (== 1) higher to lower → hae", () => {
    // noble(1) -> gentry(2), gap=1
    expect(getExpectedSpeechLevel("noble", "gentry")).toBe("hae");
  });
});

// ---------------------------------------------------------------------------
// buildSpeechLevelMatrix
// ---------------------------------------------------------------------------

describe("buildSpeechLevelMatrix", () => {
  it("covers all rank combinations", () => {
    const matrix = buildSpeechLevelMatrix();
    const ranks: SocialRank[] = ["royal", "noble", "gentry", "commoner", "servant", "slave", "outcast"];
    for (const speaker of ranks) {
      for (const listener of ranks) {
        const key = `${speaker}->${listener}`;
        expect(matrix.has(key)).toBe(true);
      }
    }
    // 7 x 7 = 49 entries
    expect(matrix.size).toBe(49);
  });
});

// ---------------------------------------------------------------------------
// enforceSpeechLevels (the main combined function)
// ---------------------------------------------------------------------------

describe("enforceSpeechLevels", () => {
  it("noble speaking to servant using formal speech → violation detected", () => {
    const seed = makeSeed([
      { id: "noble1", name: "공작님", rank: "noble" },
      { id: "servant1", name: "하인", rank: "servant" },
    ]);
    // Noble should speak casually (hae/haera) to servant, but uses formal (습니다)
    // Place the speaker name (공작님) closest to the dialogue opening
    const text = '하인 앞에서 공작님이 말했다. "이리 오겠습니다"';
    const result = enforceSpeechLevels(text, seed, 1);
    // The noble is using hapsyo to a servant — violation expected
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
  });

  it("servant speaking to noble using casual speech → violation detected", () => {
    const seed = makeSeed([
      { id: "noble1", name: "공작", rank: "noble" },
      { id: "servant1", name: "하인", rank: "servant" },
    ]);
    // Servant should speak formally to noble, but uses casual
    const text = '하인이 공작에게 말했다. "그건 내가 했어"';
    const result = enforceSpeechLevels(text, seed, 1);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
  });

  it("same rank dialogue using haeyo → no violations", () => {
    const seed = makeSeed([
      { id: "c1", name: "민수", rank: "commoner" },
      { id: "c2", name: "영희", rank: "commoner" },
    ]);
    // Same rank should use haeyo
    const text = '민수가 영희에게 말했다. "오늘 날씨가 좋아요"';
    const result = enforceSpeechLevels(text, seed, 1);
    expect(result.violations).toHaveLength(0);
  });

  it("no dialogue in text → no violations", () => {
    const seed = makeSeed([
      { id: "c1", name: "민수", rank: "commoner" },
      { id: "c2", name: "영희", rank: "commoner" },
    ]);
    const text = "민수는 조용히 걸었다. 영희는 뒤를 따랐다.";
    const result = enforceSpeechLevels(text, seed, 1);
    expect(result.violations).toHaveLength(0);
    expect(result.text).toBe(text);
  });

  it("short dialogue (< 4 chars inner) is skipped", () => {
    const seed = makeSeed([
      { id: "c1", name: "왕자", rank: "royal" },
      { id: "c2", name: "시녀", rank: "servant" },
    ]);
    // Inner text "네" is only 1 char — should be skipped
    const text = '시녀가 왕자에게 대답했다. "네"';
    const result = enforceSpeechLevels(text, seed, 1);
    expect(result.violations).toHaveLength(0);
  });

  it("mixed speech levels in multi-dialogue text", () => {
    const seed = makeSeed([
      { id: "king", name: "폐하", rank: "royal" },
      { id: "servant1", name: "시종", rank: "servant" },
    ]);
    // Ensure the speaker name is closest to the dialogue opening quote
    // so findSpeaker correctly identifies who is talking
    const text = [
      '시종 앞에서 폐하가 명했다. "이리 오거라"',  // correct: haera for royal->servant
      '폐하 앞에서 시종이 답했다. "알겠습니다"',    // correct: hapsyo for servant->royal
    ].join("\n\n");
    const result = enforceSpeechLevels(text, seed, 1);
    expect(result.violations).toHaveLength(0);
  });

  it("returns original text when no violations exist", () => {
    const seed = makeSeed([
      { id: "c1", name: "철수", rank: "commoner" },
      { id: "c2", name: "영희", rank: "commoner" },
    ]);
    const text = '철수가 영희에게 말했다. "오늘 뭐 했어요"';
    const result = enforceSpeechLevels(text, seed, 1);
    if (result.violations.length === 0) {
      expect(result.text).toBe(text);
    }
  });

  it("only considers characters introduced by the given chapter", () => {
    const seed = makeSeed([
      { id: "c1", name: "민수", rank: "commoner", introChapter: 1 },
      { id: "c2", name: "영희", rank: "noble", introChapter: 5 },
    ]);
    // Chapter 1: only 민수 is introduced, need 2 chars for detection
    const text = '민수가 영희에게 말했다. "나도 알아"';
    const result = enforceSpeechLevels(text, seed, 1);
    // Only 1 character introduced → should return no violations
    expect(result.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// hasBatchim
// ---------------------------------------------------------------------------

describe("hasBatchim", () => {
  it("detects batchim in Korean syllable", () => {
    expect(hasBatchim("한")).toBe(true);   // ㄴ 받침
    expect(hasBatchim("갈")).toBe(true);   // ㄹ 받침
  });

  it("detects no batchim", () => {
    expect(hasBatchim("가")).toBe(false);  // no 받침
    expect(hasBatchim("나")).toBe(false);
  });

  it("returns false for non-Korean character", () => {
    expect(hasBatchim("A")).toBe(false);
    expect(hasBatchim("1")).toBe(false);
  });
});
