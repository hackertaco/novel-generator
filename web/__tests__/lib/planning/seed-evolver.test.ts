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
// Tests for SEED_TEMPERATURES
// ---------------------------------------------------------------------------
describe("SEED_TEMPERATURES", () => {
  it("exports exactly 1 temperature value", () => {
    expect(SEED_TEMPERATURES).toHaveLength(1);
  });

  it("single temperature is 0.8", () => {
    expect(SEED_TEMPERATURES[0]).toBe(0.8);
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

  it("calls callStructured exactly 1 time (one per temperature)", async () => {
    await generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never);
    expect(mockCallStructured).toHaveBeenCalledTimes(1);
  });

  it("calls with temperature 0.8", async () => {
    await generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never);

    const temperatures = mockCallStructured.mock.calls.map(
      (call: unknown[]) => (call[0] as { temperature: number }).temperature,
    );
    expect(temperatures).toEqual([0.8]);
  });

  it("returns exactly 1 candidate", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it("the candidate carries the correct temperature", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    const temps = result.candidates.map((c: SeedCandidate) => c.temperature);
    expect(temps).toEqual([0.8]);
  });

  it("the candidate has a 0-based index matching its position", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    result.candidates.forEach((c: SeedCandidate, i: number) => {
      expect(c.index).toBe(i);
    });
  });

  it("the candidate contains the seed returned by the LLM", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    expect(result.candidates[0].seed.title).toBe("후보 1");
  });

  it("aggregates usage across all calls", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    // Call 1: 100/200/300
    expect(result.usage.prompt_tokens).toBe(100);
    expect(result.usage.completion_tokens).toBe(200);
    expect(result.usage.total_tokens).toBe(300);
    expect(result.usage.cost_usd).toBeCloseTo(0.01);
  });

  it("the candidate's per-call usage is preserved", async () => {
    const result = await generateSeedCandidates(
      "테스트 인터뷰 결과",
      mockAgent as never,
    );

    expect(result.candidates[0].usage.prompt_tokens).toBe(100);
  });

  it("passes the interview result through the seed prompt to the LLM", async () => {
    const interviewResult = "장르: 판타지\n제목: 테스트 플롯";
    await generateSeedCandidates(interviewResult, mockAgent as never);

    // All calls should contain the interview result in their prompt
    for (const call of mockCallStructured.mock.calls as unknown[][]) {
      const options = call[0] as { prompt: string };
      expect(options.prompt).toContain(interviewResult);
    }
  });

  it("uses taskId 'seed-generation-candidate-1' for the call", async () => {
    await generateSeedCandidates("테스트 인터뷰 결과", mockAgent as never);

    const taskIds = mockCallStructured.mock.calls.map(
      (call: unknown[]) => (call[0] as { taskId: string }).taskId,
    );
    expect(taskIds).toEqual([
      "seed-generation-candidate-1",
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

  it("generates candidates via Promise.all (one call per temperature)", async () => {
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

    expect(callOrder).toEqual([1]);
    expect(result.candidates).toHaveLength(1);
  });
});
