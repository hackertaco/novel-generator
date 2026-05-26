import { describe, expect, it } from "vitest";
import {
  buildOpeningSetupContext,
  formatOpeningSetupContextForPrompt,
} from "@/lib/rendering/opening-setup";
import type { NovelSeed } from "@/lib/schema/novel";

function makeSeed(): NovelSeed {
  return {
    title: "악녀는 두 번 죽지 않는다",
    logline: "독살당한 공작 영애가 3년 전으로 회귀해, 자신을 죽인 약혼자와 이복언니를 상대로 복수극을 펼친다",
    total_chapters: 30,
    world: {
      name: "제국",
      genre: "로맨스 판타지",
      sub_genre: "회귀",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: { 공작가: "주인공 가문" },
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "hero",
        name: "엘리시아",
        role: "주인공",
        social_rank: "noble",
        introduction_chapter: 1,
        public_title: "크레센트 공작 영애",
        house: "크레센트 공작가",
        voice: {
          tone: "차분함",
          speech_patterns: [],
          sample_dialogues: ["..."],
          personality_core: "냉정",
        },
        backstory: "회귀자",
        arc_summary: "복수를 결심한다",
        relationship_facts: [
          {
            target: "serena",
            kinship: "younger_sibling",
            service: "none",
            romance_role: "none",
            public_face: "warm",
            private_truth: "hostile",
            trust_level: -2,
            forbidden_register: [],
            preferred_patterns: [],
          },
          {
            target: "rael",
            kinship: "none",
            service: "none",
            romance_role: "primary",
            public_face: "formal",
            private_truth: "suspicious",
            trust_level: -2,
            forbidden_register: [],
            preferred_patterns: [],
          },
        ],
        genre_origin: {
          kind: "regression",
          past_life_summary: "약혼식 다음 날 독살당했다",
          trigger: "회귀했다",
          awareness_chapter: 1,
          must_understand: ["엘리시아 크레센트는 회귀자다"],
        },
        internal_arc: {
          want: "복수",
          need: "신뢰",
          misbelief: "혼자 해야 한다",
        },
        state: {
          level: null,
          location: "공작가",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "serena",
        name: "세레나",
        role: "악역",
        social_rank: "noble",
        introduction_chapter: 1,
        public_title: "크레센트가 차녀",
        house: "크레센트 공작가",
        voice: { tone: "여린", speech_patterns: [], sample_dialogues: ["..."], personality_core: "이중성" },
        backstory: "이복동생",
        arc_summary: "...",
        state: {
          level: null,
          location: "공작가",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "rael",
        name: "라엘",
        role: "남주인공/적",
        social_rank: "royal",
        introduction_chapter: 2,
        public_title: "황태자 전하",
        voice: { tone: "차분", speech_patterns: [], sample_dialogues: ["..."], personality_core: "야망" },
        backstory: "황태자",
        arc_summary: "...",
        state: {
          level: null,
          location: "황궁",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
    ],
    arcs: [],
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "3인칭",
      tense: "과거형",
      formatting_rules: [],
    },
    story_threads: [],
  };
}

describe("buildOpeningSetupContext", () => {
  it("returns undefined for chapters other than 1", () => {
    const seed = makeSeed();
    const result = buildOpeningSetupContext({
      seed,
      chapter: 2,
      participantIds: ["hero", "serena"],
    });
    expect(result).toBeUndefined();
  });

  it("collects protagonist + participants introduced in chapter 1 with derived relations", () => {
    const seed = makeSeed();
    const result = buildOpeningSetupContext({
      seed,
      chapter: 1,
      participantIds: ["hero", "serena"],
      sceneLocation: "크레센트 공작가 응접실",
      sceneTitle: "두 번째 아침",
      sceneAtmosphere: "겉으로는 평온하지만 속으로는 탐색",
    });
    expect(result).toBeDefined();
    expect(result!.protagonist.shortLabel).toContain("엘리시아");
    expect(result!.protagonist.shortLabel).toContain("크레센트 공작 영애");
    expect(result!.introducedCharacters.map((c) => c.name)).toEqual(["세레나"]);
    expect(result!.introducedCharacters[0].relationToProtagonist).toContain("동생");
    expect(result!.scenePremise).toContain("응접실");
    expect(result!.scenePremise).toContain("두 번째 아침");
    expect(result!.centralTension.length).toBeGreaterThan(0);
  });

  it("includes characters whose introduction_chapter equals 1 even if not yet a participant", () => {
    const seed = makeSeed();
    const result = buildOpeningSetupContext({
      seed,
      chapter: 1,
      participantIds: ["hero"],
    });
    expect(result?.introducedCharacters.map((c) => c.name)).toContain("세레나");
    expect(result?.introducedCharacters.map((c) => c.name)).not.toContain("라엘");
  });

  it("formatOpeningSetupContextForPrompt yields a labelled section", () => {
    const context = buildOpeningSetupContext({
      seed: makeSeed(),
      chapter: 1,
      participantIds: ["hero", "serena"],
      sceneLocation: "응접실",
    });
    const text = formatOpeningSetupContextForPrompt(context);
    expect(text).toContain("# 이번 화 독자 진입");
    expect(text).toContain("엘리시아");
    expect(text).toContain("세레나");
    expect(text).toContain("핵심 갈등:");
  });

  it("formatOpeningSetupContextForPrompt returns empty string when context is undefined", () => {
    expect(formatOpeningSetupContextForPrompt(undefined)).toBe("");
  });
});
