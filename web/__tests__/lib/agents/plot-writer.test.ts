import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCreativeSeeds, isRomanceGenre, pickRandom, PlotWriter } from "@/lib/agents/plot-writer";

// Mock the LLM agent
vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: vi.fn(() => ({
    callStructured: vi.fn(),
  })),
}));

import { getAgent } from "@/lib/agents/llm-agent";

describe("isRomanceGenre", () => {
  it("returns true for 로맨스 판타지", () => {
    expect(isRomanceGenre("로맨스 판타지")).toBe(true);
  });

  it("returns true for 로판", () => {
    expect(isRomanceGenre("로판")).toBe(true);
  });

  it("returns true for 빙의물", () => {
    expect(isRomanceGenre("로맨스 빙의물")).toBe(true);
  });

  it("returns false for 현대 판타지", () => {
    expect(isRomanceGenre("현대 판타지")).toBe(false);
  });

  it("returns false for 무협", () => {
    expect(isRomanceGenre("무협")).toBe(false);
  });
});

describe("pickRandom", () => {
  it("returns the requested number of items", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = pickRandom(arr, 3);
    expect(result).toHaveLength(3);
  });

  it("returns all items if count >= length", () => {
    const arr = [1, 2, 3];
    const result = pickRandom(arr, 5);
    expect(result).toHaveLength(3);
  });

  it("does not mutate the original array", () => {
    const arr = [1, 2, 3, 4, 5];
    const copy = [...arr];
    pickRandom(arr, 3);
    expect(arr).toEqual(copy);
  });
});

describe("buildCreativeSeeds", () => {
  it("includes genre name", () => {
    const result = buildCreativeSeeds("현대 판타지");
    expect(result).toContain("장르: 현대 판타지");
  });

  it("includes 3 plot sections (A, B, C)", () => {
    const result = buildCreativeSeeds("로맨스 판타지");
    // Premise-based format uses "플롯 A의 출발점" or "플롯 A"
    expect(result).toContain("플롯 A");
    expect(result).toContain("플롯 B");
    expect(result).toContain("플롯 C");
  });

  it("includes premise or structural info", () => {
    const result = buildCreativeSeeds("현대 판타지");
    // Should contain either premise template info or structural constraints
    const hasPremise = result.includes("전제:") || result.includes("재미 포인트:");
    const hasStructure = result.includes("구조적 특징:");
    expect(hasPremise || hasStructure).toBe(true);
  });

  it("uses romance-specific pools for romance genres", () => {
    // Run many times and check at least one romance-specific term appears
    let foundRomanceTerm = false;
    const romanceTerms = ["영애", "황비", "악녀", "공작", "시녀", "기사단장", "공주", "성녀", "혼약", "빙의"];
    for (let i = 0; i < 20; i++) {
      const result = buildCreativeSeeds("로맨스 판타지");
      if (romanceTerms.some(term => result.includes(term))) {
        foundRomanceTerm = true;
        break;
      }
    }
    expect(foundRomanceTerm).toBe(true);
  });
});

describe("PlotWriter", () => {
  const mockPlots = [
    {
      id: "A",
      title: "테스트",
      logline: "테스트 로그라인",
      hook: "테스트 훅",
      arc_summary: ["1부", "2부", "3부"],
      key_twist: "반전",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls callStructured with genre prompt and correct system message", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: mockPlots,
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost_usd: 0.01 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const writer = new PlotWriter();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };

    await writer.run(ctx);

    expect(mockCallStructured).toHaveBeenCalledTimes(1);
    const callArgs = mockCallStructured.mock.calls[0][0];
    expect(callArgs.system).toContain("카카오페이지 웹소설 전문 기획자");
    expect(callArgs.temperature).toBe(0.9);
    expect(callArgs.taskId).toBe("plot-generation");
    expect(callArgs.format).toBe("json");
  });

  it("populates ctx.plots with LLM result", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: mockPlots,
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost_usd: 0.01 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const writer = new PlotWriter();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };

    const result = await writer.run(ctx);
    expect(result.plots).toEqual(mockPlots);
  });

  it("accumulates usage tokens", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: mockPlots,
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost_usd: 0.01 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const writer = new PlotWriter();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: [],
      usage: { prompt_tokens: 50, completion_tokens: 50, total_tokens: 100, cost_usd: 0.005 },
    };

    await writer.run(ctx);
    expect(ctx.usage.prompt_tokens).toBe(150);
    expect(ctx.usage.completion_tokens).toBe(250);
    expect(ctx.usage.total_tokens).toBe(400);
    expect(ctx.usage.cost_usd).toBeCloseTo(0.015);
  });

  it("has name 'plot-writer'", () => {
    const writer = new PlotWriter();
    expect(writer.name).toBe("plot-writer");
  });
});
