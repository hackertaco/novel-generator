import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BLUEPRINT_TEMPERATURES,
  evolveBlueprintCandidates,
} from "@/lib/planning/blueprint-evolver";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ArcPlan } from "@/lib/schema/planning";

// Mock LLM agent
const mockCallStructured = vi.fn();
vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: () => ({ callStructured: mockCallStructured }),
}));

function makeSeed(): NovelSeed {
  return {
    title: "테스트",
    logline: "테스트 로그라인",
    total_chapters: 300,
    world: {
      name: "테스트 세계",
      genre: "로맨스 판타지",
      sub_genre: "궁중",
      time_period: "중세",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "mc",
        name: "주인공",
        role: "주인공",
        social_rank: "commoner" as const,
        introduction_chapter: 1,
        voice: { tone: "차분한", speech_patterns: [], sample_dialogues: [], personality_core: "강인한" },
        backstory: "",
        arc_summary: "",
        state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
      },
    ],
    arcs: [{ id: "arc_1", name: "시작", start_chapter: 1, end_chapter: 10, summary: "", key_events: ["만남"], climax_chapter: 8 }],
    chapter_outlines: [],
    story_threads: [],
    foreshadowing: [
      { id: "fs_1", name: "복선1", description: "테스트", importance: "critical", planted_at: 2, hints_at: [5], reveal_at: 8, status: "pending", hint_count: 1 },
    ],
    style: { max_paragraph_length: 3, dialogue_ratio: 0.6, sentence_style: "short", hook_ending: true, pov: "1인칭", tense: "과거형", formatting_rules: [] },
  } as NovelSeed;
}

function makeArc(): ArcPlan {
  return {
    id: "arc_1",
    name: "시작",
    part_id: "part_1",
    start_chapter: 1,
    end_chapter: 10,
    summary: "시작 아크",
    theme: "만남",
    key_events: ["만남", "갈등"],
    climax_chapter: 8,
    tension_curve: [2, 3, 3, 4, 5, 5, 6, 8, 9, 7],
    chapter_blueprints: [],
  };
}

function makeBlueprint(chapterNumber: number) {
  return {
    chapter_blueprints: [
      {
        chapter_number: chapterNumber,
        title: `${chapterNumber}화`,
        arc_id: "arc_1",
        one_liner: "테스트",
        role_in_arc: "setup",
        scenes: [],
        dependencies: [],
        target_word_count: 3000,
        emotional_arc: "평온",
        key_points: chapterNumber === 1 ? ["소개"] : ["전개1", "전개2"],
        characters_involved: ["mc"],
        tension_level: chapterNumber <= 3 ? 3 : 6,
        foreshadowing_actions: chapterNumber === 2 ? [{ id: "fs_1", action: "plant" }] : [],
      },
    ],
  };
}

const mockUsage = { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost_usd: 0.001 };

describe("blueprint-evolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses 3 different temperatures", () => {
    expect(BLUEPRINT_TEMPERATURES).toEqual([0.5, 0.7, 0.9]);
    expect(BLUEPRINT_TEMPERATURES).toHaveLength(3);
  });

  it("generates 3 candidates + 1 crossover = 4 LLM calls", async () => {
    // 3 generation calls + 1 crossover call
    mockCallStructured
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage })
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage })
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage })
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage });

    const result = await evolveBlueprintCandidates(makeSeed(), makeArc(), []);

    expect(mockCallStructured).toHaveBeenCalledTimes(4);
    expect(result.candidates).toHaveLength(3);
    expect(result.blueprints).toBeDefined();
  });

  it("passes different temperatures to each generation call", async () => {
    mockCallStructured
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage })
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage })
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage })
      .mockResolvedValueOnce({ data: makeBlueprint(1), usage: mockUsage });

    await evolveBlueprintCandidates(makeSeed(), makeArc(), []);

    const temps = mockCallStructured.mock.calls.slice(0, 3).map((c) => c[0].temperature);
    expect(temps).toEqual([0.5, 0.7, 0.9]);
  });

  it("aggregates token usage across all calls", async () => {
    mockCallStructured.mockResolvedValue({ data: makeBlueprint(1), usage: mockUsage });

    const result = await evolveBlueprintCandidates(makeSeed(), makeArc(), []);

    // 4 calls * 300 tokens each
    expect(result.usage.total_tokens).toBe(1200);
    expect(result.usage.cost_usd).toBeCloseTo(0.004);
  });

  it("returns backward-compatible response format", async () => {
    mockCallStructured.mockResolvedValue({ data: makeBlueprint(1), usage: mockUsage });

    const result = await evolveBlueprintCandidates(makeSeed(), makeArc(), []);

    expect(result).toHaveProperty("blueprints");
    expect(result).toHaveProperty("candidates");
    expect(result).toHaveProperty("usage");
    expect(Array.isArray(result.blueprints)).toBe(true);
  });
});
