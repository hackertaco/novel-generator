import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateSeedCandidates,
  SEED_TEMPERATURES,
  type SeedCandidate,
} from "@/lib/planning/seed-evolver";

// ---------------------------------------------------------------------------
// Minimal NovelSeed fixture
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

const makeUsage = (n: number) => ({
  prompt_tokens: n * 100,
  completion_tokens: n * 200,
  total_tokens: n * 300,
  cost_usd: n * 0.01,
});

// ---------------------------------------------------------------------------
// Mock LLMAgent
// ---------------------------------------------------------------------------
describe("SEED_TEMPERATURES", () => {
  it("exports exactly 3 temperature values", () => {
    expect(SEED_TEMPERATURES).toHaveLength(3);
  });

  it("first temperature is 0.7 (conservative)", () => {
    expect(SEED_TEMPERATURES[0]).toBe(0.7);
  });

  it("second temperature is 0.9 (balanced)", () => {
    expect(SEED_TEMPERATURES[1]).toBe(0.9);
  });

  it("third temperature is 1.1 (creative)", () => {
    expect(SEED_TEMPERATURES[2]).toBe(1.1);
  });

  it("temperatures are strictly increasing", () => {
    for (let i = 1; i < SEED_TEMPERATURES.length; i++) {
      expect(SEED_TEMPERATURES[i]).toBeGreaterThan(SEED_TEMPERATURES[i - 1]);
    }
  });
});

describe("generateSeedCandidates", () => {
  let mockCallStructured: ReturnType<typeof vi.fn>;
  let mockAgent: { callStructured: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    let callCount = 0;
    mockCallStructured = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: makeMinimalSeed(`후보 ${callCount}`),
        usage: makeUsage(callCount),
      });
    });
    mockAgent = { callStructured: mockCallStructured };
  });

  it("calls callStructured exactly 3 times (one per temperature)", async () => {
    await generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never);
    expect(mockCallStructured).toHaveBeenCalledTimes(3);
  });

  it("calls each temperature in order: 0.7, 0.9, 1.1", async () => {
    await generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never);

    const temperatures = mockCallStructured.mock.calls.map(
      (call: unknown[]) => (call[0] as { temperature: number }).temperature,
    );
    expect(temperatures).toEqual([0.7, 0.9, 1.1]);
  });

  it("returns exactly 3 candidates", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );
    expect(result.candidates).toHaveLength(3);
  });

  it("each candidate carries the correct temperature", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    const temps = result.candidates.map((c: SeedCandidate) => c.temperature);
    expect(temps).toEqual([0.7, 0.9, 1.1]);
  });

  it("each candidate has a 0-based index matching its position", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    result.candidates.forEach((c: SeedCandidate, i: number) => {
      expect(c.index).toBe(i);
    });
  });

  it("each candidate contains the seed returned by the LLM", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    expect(result.candidates[0].seed.title).toBe("후보 1");
    expect(result.candidates[1].seed.title).toBe("후보 2");
    expect(result.candidates[2].seed.title).toBe("후보 3");
  });

  it("aggregates usage across all 3 calls", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    // Call 1: 100/200/300, Call 2: 200/400/600, Call 3: 300/600/900
    expect(result.usage.prompt_tokens).toBe(100 + 200 + 300);
    expect(result.usage.completion_tokens).toBe(200 + 400 + 600);
    expect(result.usage.total_tokens).toBe(300 + 600 + 900);
    expect(result.usage.cost_usd).toBeCloseTo(0.01 + 0.02 + 0.03);
  });

  it("each candidate's per-call usage is preserved", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    expect(result.candidates[0].usage.prompt_tokens).toBe(100);
    expect(result.candidates[1].usage.prompt_tokens).toBe(200);
    expect(result.candidates[2].usage.prompt_tokens).toBe(300);
  });

  it("passes the interview result through the seed prompt to the LLM", async () => {
    const interviewResult = "장르: 판타지\n제목: 테스트 플롯";
    await generateSeedCandidates(interviewResult, mockAgent as never);

    // All 3 calls should contain the interview result in their prompt
    for (const call of mockCallStructured.mock.calls as unknown[][]) {
      const options = call[0] as { prompt: string };
      expect(options.prompt).toContain(interviewResult);
    }
  });

  it("uses taskId 'seed-generation-candidate-N' for each call", async () => {
    await generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never);

    const taskIds = mockCallStructured.mock.calls.map(
      (call: unknown[]) => (call[0] as { taskId: string }).taskId,
    );
    expect(taskIds).toEqual([
      "seed-generation-candidate-1",
      "seed-generation-candidate-2",
      "seed-generation-candidate-3",
    ]);
  });

  it("uses yaml format for all calls", async () => {
    await generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never);

    for (const call of mockCallStructured.mock.calls as unknown[][]) {
      expect((call[0] as { format: string }).format).toBe("yaml");
    }
  });

  it("propagates errors from callStructured", async () => {
    mockCallStructured.mockRejectedValueOnce(new Error("LLM 호출 실패"));

    await expect(
      generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never),
    ).rejects.toThrow("LLM 호출 실패");
  });

  it("generates candidates sequentially (calls are ordered)", async () => {
    const callOrder: number[] = [];
    let callCount = 0;

    mockCallStructured.mockImplementation(async () => {
      const n = ++callCount;
      callOrder.push(n);
      return {
        data: makeMinimalSeed(`후보 ${n}`),
        usage: makeUsage(n),
      };
    });

    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    expect(callOrder).toEqual([1, 2, 3]);
    expect(result.candidates).toHaveLength(3);
  });
});
