import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCrossoverPrompt,
  crossoverSeeds,
  CROSSOVER_TEMPERATURE,
  CROSSOVER_TASK_ID,
  type CrossoverResult,
} from "@/lib/evolution/seed-crossover";
import type { SeedCandidate } from "@/lib/planning/seed-evolver";
import type { CandidateScore } from "@/lib/evolution/candidate-evaluator";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeMinimalSeed = (title: string) => ({
  title,
  logline: "테스트 로그라인",
  total_chapters: 300,
  world: {
    name: "테스트 세계",
    genre: "판타지",
    sub_genre: "회귀",
    time_period: "중세",
    magic_system: null,
    key_locations: {},
    factions: {},
    rules: [],
  },
  characters: [],
  story_threads: [],
  arcs: [],
  chapter_outlines: [],
  foreshadowing: [],
  style: {
    max_paragraph_length: 3,
    dialogue_ratio: 0.6,
    sentence_style: "short",
    hook_ending: true,
    pov: "1인칭",
    tense: "과거형",
    formatting_rules: [],
  },
});

const makeSeedCandidate = (
  title: string,
  temperature: 0.8,
  index: number,
): SeedCandidate => ({
  seed: makeMinimalSeed(title),
  temperature,
  index,
  usage: {
    prompt_tokens: 100,
    completion_tokens: 200,
    total_tokens: 300,
    cost_usd: 0.01,
  },
});

const makeCandidateScore = (overall: number, issues: string[] = []): CandidateScore => ({
  pacing_quality: overall,
  character_introduction: overall,
  foreshadowing_usage: overall,
  genre_alignment: overall,
  archetype_diversity: overall,
  overall_score: overall,
  issues,
});

const bestCandidate = makeSeedCandidate("최우수 후보", 0.8, 0);
const secondBestCandidate = makeSeedCandidate("차선 후보", 0.8, 1);
const bestScore = makeCandidateScore(0.9, ["1화 key_points 3개 (최대 1개 권장)"]);
const secondScore = makeCandidateScore(0.75);

// ---------------------------------------------------------------------------
// buildCrossoverPrompt
// ---------------------------------------------------------------------------

describe("buildCrossoverPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("includes the best candidate's overall score", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("0.900");
  });

  it("includes the second-best candidate's overall score", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("0.750");
  });

  it("includes the best candidate's title in JSON block", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("최우수 후보");
  });

  it("includes the second-best candidate's title in JSON block", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("차선 후보");
  });

  it("includes issues from the best candidate's score", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("1화 key_points 3개 (최대 1개 권장)");
  });

  it("omits the issue section header when there are no issues", () => {
    const noIssueScore = makeCandidateScore(1.0, []);
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      noIssueScore,
      secondBestCandidate,
      noIssueScore,
    );
    // The Markdown section "## 개선이 필요한 항목" should be absent when no issues
    expect(prompt).not.toContain("## 개선이 필요한 항목");
  });

  it("includes the issue section header when there are issues", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("## 개선이 필요한 항목");
  });

  it("contains pacing quality guidance", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("tension_level");
  });

  it("contains character introduction guidance", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("1화 최대 2명");
  });

  it("contains foreshadowing guidance", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("복선");
  });

  it("contains YAML output instruction", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("YAML");
  });

  it("includes all four sub-scores for the best candidate", () => {
    const prompt = buildCrossoverPrompt(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
    );
    expect(prompt).toContain("페이싱 품질");
    expect(prompt).toContain("캐릭터 등장");
    expect(prompt).toContain("복선 활용");
    expect(prompt).toContain("장르 정합");
  });
});

// ---------------------------------------------------------------------------
// crossoverSeeds
// ---------------------------------------------------------------------------

describe("crossoverSeeds", () => {
  let mockCallStructured: ReturnType<typeof vi.fn>;
  let mockAgent: { callStructured: ReturnType<typeof vi.fn> };

  const crossoverSeed = makeMinimalSeed("교배 결과 시드");
  const crossoverUsage = {
    prompt_tokens: 500,
    completion_tokens: 1000,
    total_tokens: 1500,
    cost_usd: 0.05,
  };

  beforeEach(() => {
    mockCallStructured = vi.fn().mockResolvedValue({
      data: crossoverSeed,
      usage: crossoverUsage,
    });
    mockAgent = { callStructured: mockCallStructured };
  });

  it("calls callStructured exactly once", async () => {
    await crossoverSeeds(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
      mockAgent as never,
    );
    expect(mockCallStructured).toHaveBeenCalledTimes(1);
  });

  it("uses CROSSOVER_TEMPERATURE for the LLM call", async () => {
    await crossoverSeeds(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
      mockAgent as never,
    );
    const options = mockCallStructured.mock.calls[0][0] as {
      temperature: number;
    };
    expect(options.temperature).toBe(CROSSOVER_TEMPERATURE);
  });

  it("uses CROSSOVER_TASK_ID for the LLM call", async () => {
    await crossoverSeeds(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
      mockAgent as never,
    );
    const options = mockCallStructured.mock.calls[0][0] as { taskId: string };
    expect(options.taskId).toBe(CROSSOVER_TASK_ID);
  });

  it("uses yaml format for the LLM call", async () => {
    await crossoverSeeds(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
      mockAgent as never,
    );
    const options = mockCallStructured.mock.calls[0][0] as { format: string };
    expect(options.format).toBe("yaml");
  });

  it("returns the seed produced by the LLM", async () => {
    const result: CrossoverResult = await crossoverSeeds(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
      mockAgent as never,
    );
    expect(result.seed.title).toBe("교배 결과 시드");
  });

  it("returns the usage from the LLM call", async () => {
    const result: CrossoverResult = await crossoverSeeds(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
      mockAgent as never,
    );
    expect(result.usage.prompt_tokens).toBe(crossoverUsage.prompt_tokens);
    expect(result.usage.completion_tokens).toBe(
      crossoverUsage.completion_tokens,
    );
    expect(result.usage.total_tokens).toBe(crossoverUsage.total_tokens);
    expect(result.usage.cost_usd).toBeCloseTo(crossoverUsage.cost_usd);
  });

  it("sends a prompt that contains both candidate titles", async () => {
    await crossoverSeeds(
      bestCandidate,
      bestScore,
      secondBestCandidate,
      secondScore,
      mockAgent as never,
    );
    const options = mockCallStructured.mock.calls[0][0] as { prompt: string };
    expect(options.prompt).toContain("최우수 후보");
    expect(options.prompt).toContain("차선 후보");
  });

  it("propagates errors thrown by callStructured", async () => {
    mockCallStructured.mockRejectedValueOnce(new Error("LLM 오류"));
    await expect(
      crossoverSeeds(
        bestCandidate,
        bestScore,
        secondBestCandidate,
        secondScore,
        mockAgent as never,
      ),
    ).rejects.toThrow("LLM 오류");
  });

  it("CROSSOVER_TEMPERATURE is 0.8", () => {
    expect(CROSSOVER_TEMPERATURE).toBe(0.8);
  });

  it("CROSSOVER_TASK_ID is 'seed-crossover'", () => {
    expect(CROSSOVER_TASK_ID).toBe("seed-crossover");
  });
});
