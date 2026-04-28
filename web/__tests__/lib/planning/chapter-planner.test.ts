import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NovelSeed } from "@/lib/schema/novel";
import type { ArcPlan } from "@/lib/schema/planning";

const mockCallStructured = vi.fn();

vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: () => ({ callStructured: mockCallStructured }),
}));

import { generateChapterBlueprints } from "@/lib/planning/chapter-planner";

function makeSeed(): NovelSeed {
  return {
    title: "테스트",
    logline: "테스트 로그라인",
    total_chapters: 3,
    world: {
      name: "테스트 세계",
      genre: "fantasy",
      sub_genre: "romantasy",
      time_period: "중세풍",
      magic_system: "문양 마법",
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "elysia",
        name: "엘리시아 크레센트",
        role: "protagonist",
        description: "주인공",
        introduction_chapter: 1,
        traits: [],
        voice: { tone: "담담함", speech_patterns: [], sample_dialogues: [], personality_core: "냉정함" },
        backstory: "배경",
        arc_summary: "회귀 후 복수 결심",
        state: { level: 1, status: "긴장", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "serena",
        name: "세레나 크레센트",
        role: "supporting",
        description: "조력자",
        introduction_chapter: 1,
        traits: [],
        voice: { tone: "차분함", speech_patterns: [], sample_dialogues: [], personality_core: "숨은 의도" },
        backstory: "배경",
        arc_summary: "가족 내 갈등",
        state: { level: 1, status: "침착", relationships: {}, inventory: [], secrets_known: [] },
      },
      {
        id: "marian",
        name: "마리안",
        role: "supporting",
        description: "시녀",
        introduction_chapter: 1,
        traits: [],
        voice: { tone: "조심스러움", speech_patterns: [], sample_dialogues: [], personality_core: "충성심" },
        backstory: "배경",
        arc_summary: "주인공 보조",
        state: { level: 1, status: "불안", relationships: {}, inventory: [], secrets_known: [] },
      },
    ],
    story_threads: [],
    arcs: [],
    foreshadowing: [],
    chapter_outlines: [
      {
        chapter_number: 1,
        title: "첫 화",
        arc_id: "arc_1",
        one_liner: "엘리시아가 회귀를 확인한다",
        key_points: ["회귀를 확인한다"],
        characters_involved: ["elysia", "serena", "marian"],
        tension_level: 5,
      },
    ],
    extended_outlines: [],
    style: {
      tone: "긴장감 있는 판타지",
      prose_guidelines: [],
      banned: [],
    },
  } as unknown as NovelSeed;
}

function makeArc(): ArcPlan {
  return {
    id: "arc_1",
    name: "첫 아크",
    part_id: "part_1",
    start_chapter: 1,
    end_chapter: 3,
    summary: "아크 요약",
    theme: "회귀",
    key_events: ["회귀 확인"],
    climax_chapter: 3,
    tension_curve: [4, 5, 6],
    chapter_blueprints: [],
  } as ArcPlan;
}

beforeEach(() => {
  mockCallStructured.mockReset();
});

describe("generateChapterBlueprints", () => {
  it("preserves outline characters_involved even when the model drops them", async () => {
    mockCallStructured.mockResolvedValue({
      data: {
        chapter_blueprints: [
          {
            chapter_number: 1,
            title: "죽음의 맛으로 깨어나다",
            arc_id: "arc_1",
            one_liner: "엘리시아가 회귀를 확인한다",
            role_in_arc: "setup",
            scenes: [
              {
                purpose: "엘리시아 크레센트가 침실에서 달력을 확인한다",
                type: "hook",
                characters: ["elysia", "marian"],
                estimated_chars: 1800,
                emotional_tone: "충격",
                must_reveal: ["회귀 자각"],
              },
            ],
            dependencies: [],
            emotional_arc: "충격 → 결심",
            key_points: ["회귀 자각"],
            characters_involved: ["elysia", "marian"],
            tension_level: 4,
            foreshadowing_actions: [],
            target_word_count: 2000,
          },
        ],
      },
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    });

    const result = await generateChapterBlueprints(makeSeed(), makeArc(), [], undefined, null, 1);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.characters_involved).toEqual(["elysia", "marian", "serena"]);
  });
});
