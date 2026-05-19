import { describe, expect, it } from "vitest";
import {
  buildGenreConventionEvents,
  buildGenreConventionPlans,
  collectChapterGenreConventionCoverage,
  createSimulationState,
  listAudienceKnowledge,
  listCharacterBeliefs,
  listCharacterMemories,
  SimulationEventLedger,
} from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";

function makeRegressionSeed(): NovelSeed {
  return {
    title: "악녀는 두 번 죽지 않는다",
    logline: "독살당한 공녀가 1년 전으로 회귀하여 음모를 막는다.",
    total_chapters: 30,
    world: {
      name: "제국",
      genre: "로맨스 판타지",
      sub_genre: "회귀",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: { 공작가: "주인공 가문" },
      factions: { 황실: "황궁 권력" },
      rules: [],
    },
    characters: [
      {
        id: "hero",
        name: "엘리시아",
        role: "주인공",
        social_rank: "noble",
        introduction_chapter: 1,
        voice: {
          tone: "차분함",
          speech_patterns: [],
          sample_dialogues: ["..."],
          personality_core: "냉정",
        },
        backstory: "회귀자",
        arc_summary: "복수를 결심한다",
        genre_origin: {
          kind: "regression",
          past_life_summary: "약혼식 다음 날 은잔의 독으로 죽었다",
          trigger: "독배를 마시고 눈을 뜨니 1년 전 약혼식 아침이었다",
          awareness_chapter: 1,
          must_understand: [
            "엘리시아는 회귀자다",
            "전생에 약혼식 직후 독살당했다",
          ],
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

describe("GenreConvention deterministic hooks", () => {
  it("seeds past_life memory at chapter 0 during canonical bootstrap", () => {
    const seed = makeRegressionSeed();
    const state = createSimulationState(seed);

    const heroMemories = listCharacterMemories(state.memories, "hero");
    const pastLifeMemory = heroMemories.find((memory) =>
      memory.tags.includes("past_life"),
    );
    expect(pastLifeMemory).toBeDefined();
    expect(pastLifeMemory?.summary).toBe(
      "약혼식 다음 날 은잔의 독으로 죽었다",
    );
    expect(pastLifeMemory?.chapter).toBe(0);
  });

  it("emits time_jump + recollection_surfaced + realization for chapter 1", () => {
    const seed = makeRegressionSeed();
    const state = createSimulationState(seed);

    const events = buildGenreConventionEvents({
      state,
      seed,
      chapter: 1,
      nextSequence: 2,
    });

    expect(events.map((event) => event.type)).toEqual([
      "time_jump",
      "recollection_surfaced",
      "realization",
    ]);
    expect(events.every((event) => event.tags.includes("genre-convention"))).toBe(
      true,
    );
    const recollection = events.find(
      (event) => event.type === "recollection_surfaced",
    );
    expect(recollection?.payload?.memoryId).toBeDefined();
  });

  it("returns no events on chapters after awareness_chapter", () => {
    const seed = makeRegressionSeed();
    const state = createSimulationState(seed);

    expect(
      buildGenreConventionEvents({ state, seed, chapter: 2, nextSequence: 2 }),
    ).toEqual([]);
    expect(
      buildGenreConventionEvents({ state, seed, chapter: 5, nextSequence: 2 }),
    ).toEqual([]);
  });

  it("returns no events when no character has a genre_origin", () => {
    const seed = makeRegressionSeed();
    seed.characters[0] = {
      ...seed.characters[0],
      genre_origin: undefined,
    };
    const state = createSimulationState(seed);

    expect(
      buildGenreConventionEvents({ state, seed, chapter: 1, nextSequence: 2 }),
    ).toEqual([]);
  });

  it("exposes must_understand items in the resulting plans", () => {
    const seed = makeRegressionSeed();
    const state = createSimulationState(seed);
    const plans = buildGenreConventionPlans({
      state,
      seed,
      chapter: 1,
      nextSequence: 2,
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].mustUnderstand).toEqual([
      "엘리시아는 회귀자다",
      "전생에 약혼식 직후 독살당했다",
    ]);
  });

  it("collectChapterGenreConventionCoverage returns must_understand and matching fallback lines", () => {
    const seed = makeRegressionSeed();
    const coverage = collectChapterGenreConventionCoverage(seed, 1);

    expect(coverage.mustUnderstand).toEqual([
      "엘리시아는 회귀자다",
      "전생에 약혼식 직후 독살당했다",
    ]);
    expect(coverage.fallbacks).toHaveLength(2);
    const realization = coverage.fallbacks.find((entry) => entry.kind === "realization");
    expect(realization?.item).toBe("엘리시아는 회귀자다");
    expect(realization?.line.length).toBeGreaterThan(0);
    const flashback = coverage.fallbacks.find((entry) => entry.kind === "flashback");
    expect(flashback?.item).toBe("전생에 약혼식 직후 독살당했다");
  });

  it("collectChapterGenreConventionCoverage is empty for chapters after awareness_chapter", () => {
    const seed = makeRegressionSeed();
    const coverage = collectChapterGenreConventionCoverage(seed, 3);
    expect(coverage.mustUnderstand).toEqual([]);
    expect(coverage.fallbacks).toEqual([]);
  });

  it("ledger application turns deterministic events into audience knowledge + deduction belief", () => {
    const seed = makeRegressionSeed();
    const ledger = new SimulationEventLedger();
    let state = createSimulationState(seed);
    const events = buildGenreConventionEvents({
      state,
      seed,
      chapter: 1,
      nextSequence: 2,
    });
    for (const event of events) {
      state = ledger.applyEvent(state, event);
    }

    const audienceSummaries = listAudienceKnowledge(state.audienceKnowledge).map(
      (record) => record.summary,
    );
    expect(audienceSummaries).toContain(
      "약혼식 다음 날 은잔의 독으로 죽었다",
    );
    expect(
      audienceSummaries.some((summary) => summary.startsWith("엘리시아는 회귀했다 —")),
    ).toBe(true);
    expect(state.chapterCursor).toBeGreaterThanOrEqual(1);

    const heroBeliefs = listCharacterBeliefs(state.beliefs, "hero");
    expect(
      heroBeliefs.some((belief) => belief.kind === "deduction" && belief.subject === "회귀 자각"),
    ).toBe(true);

    const pastLifeMemory = listCharacterMemories(state.memories, "hero").find(
      (memory) => memory.tags.includes("past_life"),
    );
    expect(pastLifeMemory?.recalledAtChapters).toContain(1);
  });
});
