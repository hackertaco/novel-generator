// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ConstraintChecker } from "@/lib/evaluators/constraint-checker";
import type { NovelSeed } from "@/lib/schema/novel";

function makeSeed(): NovelSeed {
  return {
    title: "성녀의 365일",
    logline: "성녀가 정해진 죽음을 거슬러 달아난다.",
    total_chapters: 12,
    world: {
      name: "루멘",
      genre: "로맨스 판타지",
      sub_genre: "궁정",
      time_period: "중세풍",
      magic_system: "성흔",
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "mc",
        name: "세라핀 에델",
        role: "protagonist",
        introduction_chapter: 1,
        voice: {
          tone: "차분함",
          speech_patterns: [],
          sample_dialogues: [],
          personality_core: "버틴다",
        },
        backstory: "",
        arc_summary: "",
        state: { level: null, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "ysolde",
        name: "이졸데",
        role: "servant",
        introduction_chapter: 2,
        voice: {
          tone: "조심스러움",
          speech_patterns: [],
          sample_dialogues: [],
          personality_core: "시중",
        },
        backstory: "",
        arc_summary: "",
        state: { level: null, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "benedict",
        name: "베네딕트 로사르",
        role: "priest",
        introduction_chapter: 3,
        voice: {
          tone: "권위적",
          speech_patterns: [],
          sample_dialogues: [],
          personality_core: "통제",
        },
        backstory: "",
        arc_summary: "",
        state: { level: null, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
      },
    ],
    chapter_outlines: [],
    extended_outlines: [],
    story_threads: [],
    arcs: [],
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
  } as unknown as NovelSeed;
}

describe("ConstraintChecker.validateCharacterAppearances", () => {
  it("treats blueprint short names as the same character and ignores passive name-drops", () => {
    const seed = makeSeed();
    const checker = new ConstraintChecker(seed);
    const text = [
      "세라핀 에델은 금지 구역인 성배실로 내려가고 있었다.",
      "신관장 베네딕트 로사르의 허락은 없었다.",
    ].join("\n");

    const violations = checker.validateCharacterAppearances(text, 1, seed, ["세라핀", "이졸데"]);

    expect(violations).toEqual([]);
  });

  it("still flags premature introductions when a future character acts on screen", () => {
    const seed = makeSeed();
    const checker = new ConstraintChecker(seed);
    const text = [
      "세라핀 에델이 문을 닫자 수행 시녀 이졸데가 급히 다가왔다.",
      "\"아가씨, 안색이 너무 안 좋으세요.\" 이졸데가 속삭였다.",
    ].join("\n");

    const violations = checker.validateCharacterAppearances(text, 1, seed, ["세라핀"]);

    expect(violations).toEqual([
      expect.objectContaining({ type: "missing_character", characterId: "ysolde" }),
      expect.objectContaining({ type: "premature_introduction", characterId: "ysolde" }),
    ]);
  });
});
