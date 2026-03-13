// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  NovelSeedSchema,
  StyleGuideSchema,
  getCharacter,
  getArcForChapter,
  getForeshadowingActions,
  type NovelSeed,
} from "@/lib/schema/novel";

function createTestSeed() {
  return {
    title: "테스트 소설",
    logline: "테스트용 로그라인",
    total_chapters: 100,
    world: {
      name: "테스트 세계",
      genre: "현대 판타지",
      sub_genre: "회귀",
      time_period: "현대",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: ["규칙 1"],
    },
    characters: [
      {
        id: "mc",
        name: "강현우",
        role: "주인공",
        introduction_chapter: 1,
        voice: {
          tone: "냉소적",
          speech_patterns: ["~하지", "...그래서?"],
          sample_dialogues: ["테스트 대사 1", "테스트 대사 2"],
          personality_core: "냉소적 성격",
        },
        backstory: "배경 이야기",
        arc_summary: "성장 아크",
        state: {
          level: 1,
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
        },
      },
    ],
    arcs: [
      {
        id: "arc_1",
        name: "1부",
        start_chapter: 1,
        end_chapter: 50,
        summary: "아크 요약",
        key_events: ["이벤트 1"],
        climax_chapter: 48,
      },
    ],
    chapter_outlines: [
      {
        chapter_number: 1,
        title: "1화",
        arc_id: "arc_1",
        one_liner: "첫 화",
        key_points: ["포인트 1"],
        characters_involved: ["mc"],
        tension_level: 7,
      },
    ],
    foreshadowing: [
      {
        id: "fs_1",
        name: "복선 1",
        description: "테스트 복선",
        importance: "critical",
        planted_at: 5,
        hints_at: [15, 30],
        reveal_at: 48,
        status: "pending",
        hint_count: 0,
      },
    ],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: ["문단은 3문장 이하로"],
    },
  };
}

describe("NovelSeedSchema", () => {
  it("parses a minimal valid seed", () => {
    const data = createTestSeed();
    const result = NovelSeedSchema.parse(data);

    expect(result.title).toBe("테스트 소설");
    expect(result.logline).toBe("테스트용 로그라인");
    expect(result.total_chapters).toBe(100);
    expect(result.world.name).toBe("테스트 세계");
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].id).toBe("mc");
    expect(result.arcs).toHaveLength(1);
    expect(result.chapter_outlines).toHaveLength(1);
    expect(result.foreshadowing).toHaveLength(1);
    expect(result.style.pov).toBe("1인칭");
  });
});

describe("StyleGuideSchema", () => {
  it("has correct Korean defaults", () => {
    const result = StyleGuideSchema.parse({});

    expect(result.max_paragraph_length).toBe(3);
    expect(result.dialogue_ratio).toBe(0.6);
    expect(result.sentence_style).toBe("short");
    expect(result.hook_ending).toBe(true);
    expect(result.pov).toBe("1인칭");
    expect(result.tense).toBe("과거형");
    expect(result.formatting_rules).toEqual([
      "문단은 3문장 이하로",
      "대사 후 긴 지문 금지",
      "클리셰 표현 사용 가능 (장르 특성)",
      "매 회차 끝은 궁금증 유발",
    ]);
  });
});

describe("getCharacter", () => {
  it("finds character by id", () => {
    const seed = NovelSeedSchema.parse(createTestSeed());
    const character = getCharacter(seed, "mc");

    expect(character).toBeDefined();
    expect(character!.name).toBe("강현우");
    expect(character!.role).toBe("주인공");
  });

  it("returns undefined for unknown id", () => {
    const seed = NovelSeedSchema.parse(createTestSeed());
    const character = getCharacter(seed, "unknown_id");

    expect(character).toBeUndefined();
  });
});

describe("getArcForChapter", () => {
  it("finds correct arc", () => {
    const seed = NovelSeedSchema.parse(createTestSeed());

    const arc = getArcForChapter(seed, 25);

    expect(arc).toBeDefined();
    expect(arc!.id).toBe("arc_1");
    expect(arc!.name).toBe("1부");
  });

  it("returns undefined for out-of-range chapter", () => {
    const seed = NovelSeedSchema.parse(createTestSeed());

    const arc = getArcForChapter(seed, 99);

    expect(arc).toBeUndefined();
  });
});

describe("getForeshadowingActions", () => {
  it("returns correct actions for a chapter", () => {
    const seed = NovelSeedSchema.parse(createTestSeed());

    // Chapter 5 is planted_at for fs_1, and status is "pending" -> should get "plant"
    const actions = getForeshadowingActions(seed, 5);

    expect(actions).toHaveLength(1);
    expect(actions[0].foreshadowing.id).toBe("fs_1");
    expect(actions[0].action).toBe("plant");
  });

  it("returns empty array when no actions match", () => {
    const seed = NovelSeedSchema.parse(createTestSeed());

    // Chapter 20 has no foreshadowing actions
    const actions = getForeshadowingActions(seed, 20);

    expect(actions).toHaveLength(0);
  });
});
