// @vitest-environment node
import { describe, expect, it } from "vitest";

import { applyFutureCharacterDebate } from "@/lib/agents/future-character-debate";
import type { FutureCharacterDebateResult } from "@/lib/agents/future-character-debate";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterBlueprint } from "@/lib/schema/planning";

function makeSeed(): NovelSeed {
  return {
    title: "성녀의 365일",
    logline: "성녀가 죽음을 거슬러 달아난다.",
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
        voice: { tone: "차분함", speech_patterns: [], sample_dialogues: [], personality_core: "버틴다" },
        backstory: "",
        arc_summary: "",
        state: { level: null, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "benedict",
        name: "베네딕트 로사르",
        role: "priest",
        introduction_chapter: 3,
        voice: { tone: "권위적", speech_patterns: [], sample_dialogues: [], personality_core: "통제" },
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

function makeBlueprint(): ChapterBlueprint {
  return {
    chapter_number: 1,
    title: "1화",
    arc_id: "arc_1",
    one_liner: "세라핀이 금역으로 향한다.",
    role_in_arc: "setup",
    scenes: [
      {
        purpose: "세라핀이 성배실 진입을 결심하고 금역 앞까지 도달한다.",
        type: "discovery",
        characters: ["mc"],
        estimated_chars: 1500,
        emotional_tone: "긴장",
        must_reveal: [],
      },
      {
        purpose: "세라핀이 성배에서 자신의 남은 시간을 확인한다.",
        type: "revelation",
        characters: ["mc"],
        estimated_chars: 1500,
        emotional_tone: "충격",
        must_reveal: [],
      },
    ],
    dependencies: [],
    target_word_count: 3000,
    emotional_arc: "긴장→충격",
    key_points: [],
    characters_involved: ["mc"],
    tension_level: 7,
    foreshadowing_actions: [],
  } as unknown as ChapterBlueprint;
}

function makeVerdict(overrides: Partial<FutureCharacterDebateResult> = {}): FutureCharacterDebateResult {
  return {
    decisionId: "future-character:1:benedict",
    decision: "revise_seed_and_blueprint",
    rationale: "베네딕트의 직접 제지가 있어야 세라핀의 위험 감각이 설득된다.",
    guidance: "1씬에서 베네딕트가 직접 제지하는 장면을 포함하라.",
    characterId: "benedict",
    targetSceneIndexes: [0],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    ...overrides,
  };
}

describe("applyFutureCharacterDebate", () => {
  it("updates both seed intro and blueprint membership when seed+blueprint revision is approved", () => {
    const seed = makeSeed();
    const blueprint = makeBlueprint();

    const result = applyFutureCharacterDebate({
      seed,
      blueprint,
      verdict: makeVerdict(),
      chapterNumber: 1,
    });

    expect(result.applied).toBe(true);
    expect(seed.characters.find((character) => character.id === "benedict")?.introduction_chapter).toBe(1);
    expect(blueprint.characters_involved).toContain("benedict");
    expect(blueprint.scenes[0]?.characters).toContain("benedict");
  });

  it("can revise only the blueprint without changing the seed schedule", () => {
    const seed = makeSeed();
    const blueprint = makeBlueprint();

    const result = applyFutureCharacterDebate({
      seed,
      blueprint,
      verdict: makeVerdict({ decision: "revise_blueprint", targetSceneIndexes: [1] }),
      chapterNumber: 1,
    });

    expect(result.applied).toBe(true);
    expect(seed.characters.find((character) => character.id === "benedict")?.introduction_chapter).toBe(3);
    expect(blueprint.scenes[1]?.characters).toContain("benedict");
  });

  it("does nothing when debate keeps the original restriction", () => {
    const seed = makeSeed();
    const blueprint = makeBlueprint();

    const result = applyFutureCharacterDebate({
      seed,
      blueprint,
      verdict: makeVerdict({ decision: "keep_original" }),
      chapterNumber: 1,
    });

    expect(result.applied).toBe(false);
    expect(seed.characters.find((character) => character.id === "benedict")?.introduction_chapter).toBe(3);
    expect(blueprint.characters_involved).not.toContain("benedict");
  });
});
