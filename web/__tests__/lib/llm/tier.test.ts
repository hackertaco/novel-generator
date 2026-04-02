// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import type { NovelSeed } from "@/lib/schema/novel";

const testSeed: NovelSeed = {
  title: "테스트 소설",
  logline: "테스트",
  total_chapters: 100,
  world: {
    name: "세계",
    genre: "현대 판타지",
    sub_genre: "회귀",
    time_period: "현대",
    magic_system: null,
    key_locations: {},
    factions: {},
    rules: [],
  },
  characters: [],
  story_threads: [],
  arcs: [
    {
      id: "arc_1",
      name: "1부",
      start_chapter: 1,
      end_chapter: 50,
      summary: "요약",
      key_events: ["이벤트"],
      climax_chapter: 48,
    },
  ],
  chapter_outlines: [
    {
      chapter_number: 10,
      title: "고조",
      arc_id: "arc_1",
      one_liner: "긴장 고조",
      advances_thread: [],
      key_points: [],
      characters_involved: [],
      tension_level: 9,
    },
    {
      chapter_number: 20,
      title: "평범한 화",
      arc_id: "arc_1",
      one_liner: "일상",
      advances_thread: [],
      key_points: [],
      characters_involved: [],
      tension_level: 4,
    },
  ],
  extended_outlines: [],
  foreshadowing: [
    {
      id: "fs_1",
      name: "검은 반지",
      description: "반지의 비밀",
      importance: "critical",
      planted_at: 5,
      hints_at: [15],
      reveal_at: 48,
      status: "planted",
      hint_count: 1,
    },
  ],
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

describe("selectModelTier", () => {
  it('returns "high" for arc start chapter', () => {
    const tier = selectModelTier(testSeed, 1);
    expect(tier).toBe("high");
  });

  it('returns "high" for climax chapter', () => {
    const tier = selectModelTier(testSeed, 48);
    // Chapter 48 is both the climax and the foreshadowing reveal
    expect(tier).toBe("high");
  });

  it('returns "high" for foreshadowing reveal chapter', () => {
    // Chapter 48 has reveal_at and status is "planted"
    const tier = selectModelTier(testSeed, 48);
    expect(tier).toBe("high");
  });

  it('returns "high" for high tension chapter (>= 8)', () => {
    // Chapter 10 has tension_level 9
    const tier = selectModelTier(testSeed, 10);
    expect(tier).toBe("high");
  });

  it('returns "low" for normal chapter', () => {
    // Chapter 20 has tension_level 4 and is not an arc start/climax/reveal
    const tier = selectModelTier(testSeed, 20);
    expect(tier).toBe("low");
  });

  it('returns "low" when chapter is out of any arc', () => {
    const tier = selectModelTier(testSeed, 99);
    expect(tier).toBe("low");
  });
});

describe("getModelForTier", () => {
  it('returns high model for "high" tier', () => {
    const model = getModelForTier("high");
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);
  });

  it('returns low model for "low" tier', () => {
    const model = getModelForTier("low");
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);
  });

  it("uses env var overrides when set", () => {
    vi.stubEnv("NOVEL_MODEL_HIGH", "claude-opus-4");
    vi.stubEnv("NOVEL_MODEL", "claude-sonnet-4");

    expect(getModelForTier("high")).toBe("claude-opus-4");
    expect(getModelForTier("low")).toBe("claude-sonnet-4");

    vi.unstubAllEnvs();
  });
});
