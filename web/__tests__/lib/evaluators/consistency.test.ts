// @vitest-environment node
import { describe, it, expect } from "vitest";
import { evaluateConsistency } from "@/lib/evaluators/consistency";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";

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
  characters: [
    {
      id: "mc",
      name: "강현우",
      role: "주인공",
      social_rank: "commoner" as const,
      introduction_chapter: 1,
      voice: {
        tone: "냉소적",
        speech_patterns: ["~하지", "...그래서?"],
        sample_dialogues: ["대사"],
        personality_core: "냉소적",
      },
      backstory: "배경",
      arc_summary: "성장",
      state: {
        level: 1,
        status: "normal",
        location: null,
        relationships: {},
        inventory: [],
        secrets_known: [],
      },
    },
  ],
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
  chapter_outlines: [],
  foreshadowing: [
    {
      id: "fs_ring",
      name: "검은 반지",
      description: "반지의 비밀",
      importance: "critical",
      planted_at: 5,
      hints_at: [15],
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
    formatting_rules: [],
  },
};

describe("evaluateConsistency", () => {
  describe("checkCharacterVoice", () => {
    it("detects speech pattern matches", () => {
      // Content where the character speaks with their expected pattern
      const content = `강현우가 "별 거 아니야~하지" 라고 말했다.`;
      const result = evaluateConsistency(testSeed, 1, content);

      // The pattern "~하지" is present so no issues should be flagged
      expect(result.character_voice.score).toBe(1.0);
      expect(result.character_voice.pass).toBe(true);
    });
  });

  describe("checkForeshadowing", () => {
    it("detects when foreshadowing keyword is present in content", () => {
      // Chapter 5 is planted_at for fs_ring, status is "pending" so shouldAct returns "plant"
      // The keyword "검은" or "반지" from name "검은 반지" should be found
      const content = `현우는 검은 반지를 발견했다. 이상한 기운이 느껴졌다.`;
      const result = evaluateConsistency(testSeed, 5, content);

      expect(result.foreshadowing.required.length).toBeGreaterThan(0);
      expect(result.foreshadowing.required[0].found).toBe(true);
      expect(result.foreshadowing.missing.length).toBe(0);
      expect(result.foreshadowing.pass).toBe(true);
    });

    it("detects missing foreshadowing", () => {
      // Chapter 5 requires planting "검은 반지" but the content has no relevant keywords
      const content = `현우는 학교에 갔다. 점심을 먹었다.`;
      const result = evaluateConsistency(testSeed, 5, content);

      expect(result.foreshadowing.required.length).toBeGreaterThan(0);
      expect(result.foreshadowing.missing.length).toBeGreaterThan(0);
      expect(result.foreshadowing.missing[0].id).toBe("fs_ring");
      expect(result.foreshadowing.pass).toBe(false);
    });
  });

  describe("checkContinuity", () => {
    it("first chapter always passes", () => {
      const content = `이야기가 시작된다.`;
      const result = evaluateConsistency(testSeed, 1, content);

      expect(result.continuity.previous_chapter).toBe(0);
      expect(result.continuity.issues.length).toBe(0);
      expect(result.continuity.score).toBe(1.0);
      expect(result.continuity.pass).toBe(true);
    });

    it("detects unaddressed cliffhanger", () => {
      const previousSummary: ChapterSummary = {
        chapter_number: 4,
        title: "4화",
        events: [],
        character_changes: [],
        foreshadowing_touched: [],
        plot_summary: "요약",
        emotional_beat: "긴장",
        cliffhanger: "검은 그림자가 다가온다",
        ending_scene_state: null,
        word_count: 1000,
        style_score: null,
      };
      // Content that does not mention the cliffhanger words at all in first 500 chars
      const content = `현우는 아침에 일어났다. 밥을 먹고 학교에 갔다. 수업을 들었다.`;
      const result = evaluateConsistency(testSeed, 5, content, previousSummary);

      expect(result.continuity.issues.length).toBeGreaterThan(0);
      expect(result.continuity.issues[0].type).toBe(
        "cliffhanger_not_addressed",
      );
      expect(result.continuity.pass).toBe(false);
    });
  });
});
