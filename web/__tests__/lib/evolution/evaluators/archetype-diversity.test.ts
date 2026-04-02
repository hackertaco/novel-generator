import { describe, it, expect } from "vitest";
import {
  evaluateArchetypeDiversity,
  ABSTRACT_PERSONALITY_WORDS,
} from "@/lib/evolution/evaluators/archetype-diversity";
import type { NovelSeed } from "@/lib/schema/novel";

function makeSeed(overrides: Partial<{ characters: unknown[] }> = {}): NovelSeed {
  return {
    title: "테스트",
    logline: "테스트",
    total_chapters: 300,
    world: { name: "W", genre: "로맨스 판타지", sub_genre: "궁중", time_period: "중세", magic_system: null, key_locations: {}, factions: {}, rules: [] },
    characters: overrides.characters ?? [
      {
        id: "mc", name: "엘리제", role: "주인공", introduction_chapter: 1,
        voice: { tone: "당당한", speech_patterns: [], sample_dialogues: ["오해하지 마세요. 저, 당신 없으면 더 잘 살 수 있어요.", "여자가 뭘 할 수 있는지 똑똑히 보세요."], personality_core: "사이다형 — 당당하고 결단력 있는" },
        backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "ml", name: "리오넬", role: "상대역", introduction_chapter: 1,
        voice: { tone: "차갑고 위압적인", speech_patterns: [], sample_dialogues: ["짐의 명이다. 거역은 허락하지 않는다.", "살고 싶으면 조용히 있어."], personality_core: "폭군형 — 절대 권력자, 감정을 봉인한" },
        backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
      },
    ],
    story_threads: [],
    arcs: [],
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [],
    style: { max_paragraph_length: 3, dialogue_ratio: 0.6, sentence_style: "short", hook_ending: true, pov: "1인칭", tense: "과거형", formatting_rules: [] },
  } as NovelSeed;
}

describe("archetype-diversity evaluator", () => {
  it("gives high score when archetypes are present and contrasting", () => {
    const result = evaluateArchetypeDiversity(makeSeed());
    expect(result.archetype_presence.pass).toBe(true);
    expect(result.pair_contrast.pass).toBe(true);
    expect(result.overall_score).toBeGreaterThan(0.6);
  });

  it("penalizes missing archetype in personality_core", () => {
    const seed = makeSeed({
      characters: [
        {
          id: "mc", name: "여주", role: "주인공", introduction_chapter: 1,
          voice: { tone: "평범한", speech_patterns: [], sample_dialogues: ["안녕하세요."], personality_core: "평범하고 조용한 성격" },
          backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
        },
        {
          id: "ml", name: "남주", role: "상대역", introduction_chapter: 1,
          voice: { tone: "차가운", speech_patterns: [], sample_dialogues: ["그래."], personality_core: "차갑고 무뚝뚝한 성격" },
          backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
        },
      ],
    });
    const result = evaluateArchetypeDiversity(seed);
    expect(result.archetype_presence.pass).toBe(false);
    expect(result.archetype_presence.unmatched).toContain("여주");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("penalizes low pair contrast (same keywords)", () => {
    const seed = makeSeed({
      characters: [
        {
          id: "mc", name: "여주", role: "주인공", introduction_chapter: 1,
          voice: { tone: "차가운", speech_patterns: [], sample_dialogues: ["그래요.", "알겠어요."], personality_core: "사이다형 — 냉정하고 차가운 성격의 강한 여성" },
          backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
        },
        {
          id: "ml", name: "남주", role: "상대역", introduction_chapter: 1,
          voice: { tone: "차가운", speech_patterns: [], sample_dialogues: ["그래.", "알겠다."], personality_core: "폭군형 — 냉정하고 차가운 성격의 강한 남성" },
          backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
        },
      ],
    });
    const result = evaluateArchetypeDiversity(seed);
    expect(result.pair_contrast.shared_keywords.length).toBeGreaterThan(0);
    expect(result.pair_contrast.score).toBeLessThan(1.0);
  });

  it("penalizes abstract personality words", () => {
    const seed = makeSeed({
      characters: [
        {
          id: "mc", name: "여주", role: "주인공", introduction_chapter: 1,
          voice: { tone: "따뜻한", speech_patterns: [], sample_dialogues: ["네.", "그래요."], personality_core: "사이다형 — 따뜻하다 밝다 착하다 강하다" },
          backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
        },
        {
          id: "ml", name: "남주", role: "상대역", introduction_chapter: 1,
          voice: { tone: "차가운", speech_patterns: [], sample_dialogues: ["그래."], personality_core: "폭군형 — 냉정하다 차갑다 어둡다 나쁘다" },
          backstory: "", arc_summary: "", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
        },
      ],
    });
    const result = evaluateArchetypeDiversity(seed);
    expect(result.abstract_penalty.pass).toBe(false);
    expect(result.abstract_penalty.offending_characters.length).toBeGreaterThan(0);
  });

  it("has abstract personality words list", () => {
    expect(ABSTRACT_PERSONALITY_WORDS.length).toBeGreaterThan(10);
  });

  it("returns high score for empty characters (no data = no penalty)", () => {
    const seed = makeSeed({ characters: [] });
    const result = evaluateArchetypeDiversity(seed);
    // archetype_presence, pair_contrast, abstract_penalty all pass (no main chars)
    // dialogue_variety may not pass (0 endings) but overall should still be reasonable
    expect(result.archetype_presence.pass).toBe(true);
    expect(result.pair_contrast.pass).toBe(true);
    expect(result.abstract_penalty.pass).toBe(true);
  });
});
