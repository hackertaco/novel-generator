import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPlotContext, runPlotPipeline } from "@/lib/agents/plot-pipeline";

// Mock all three agents
vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: vi.fn(() => ({
    callStructured: vi.fn(),
  })),
}));

import { getAgent } from "@/lib/agents/llm-agent";

describe("createPlotContext", () => {
  it("initializes with correct genre", () => {
    const ctx = createPlotContext("로맨스 판타지");
    expect(ctx.genre).toBe("로맨스 판타지");
  });

  it("detects genre correctly", () => {
    const ctx = createPlotContext("로맨스 판타지");
    expect(ctx.detectedGenre).toBe("로맨스 판타지");
  });

  it("initializes with empty plots", () => {
    const ctx = createPlotContext("현대 판타지");
    expect(ctx.plots).toEqual([]);
  });

  it("initializes with zero usage", () => {
    const ctx = createPlotContext("현대 판타지");
    expect(ctx.usage).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost_usd: 0,
    });
  });
});

describe("runPlotPipeline", () => {
  const writerPlots = [
    { id: "A", title: "초안", logline: "초안 로그라인", hook: "초안 훅", arc_summary: ["1부"], key_twist: "초안 반전" },
  ];
  const criticPlots = [
    { id: "A", title: "개선", logline: "개선된 로그라인", hook: "개선된 훅", arc_summary: ["1부"], key_twist: "개선된 반전" },
  ];
  const polishedPlots = [
    { id: "A", title: "완성", logline: "자연스러운 로그라인", hook: "자연스러운 훅", arc_summary: ["1부"], key_twist: "자연스러운 반전" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs 3 agents sequentially and returns final plots", async () => {
    let callCount = 0;
    const mockCallStructured = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: writerPlots,
          usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, cost_usd: 0.01 },
        });
      } else if (callCount === 2) {
        return Promise.resolve({
          data: criticPlots,
          usage: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500, cost_usd: 0.02 },
        });
      } else {
        return Promise.resolve({
          data: polishedPlots,
          usage: { prompt_tokens: 150, completion_tokens: 250, total_tokens: 400, cost_usd: 0.015 },
        });
      }
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const result = await runPlotPipeline("현대 판타지");

    expect(mockCallStructured).toHaveBeenCalledTimes(3);
    expect(result.plots).toEqual(polishedPlots);
  });

  it("accumulates usage across all 3 agents", async () => {
    let callCount = 0;
    const mockCallStructured = vi.fn().mockImplementation(() => {
      callCount++;
      const base = callCount * 100;
      return Promise.resolve({
        data: polishedPlots,
        usage: { prompt_tokens: base, completion_tokens: base, total_tokens: base * 2, cost_usd: base * 0.0001 },
      });
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const result = await runPlotPipeline("현대 판타지");

    // 100 + 200 + 300 = 600
    expect(result.usage.prompt_tokens).toBe(600);
    expect(result.usage.completion_tokens).toBe(600);
    expect(result.usage.total_tokens).toBe(1200);
  });

  it("passes correct taskIds for each agent stage", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: polishedPlots,
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost_usd: 0.01 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    await runPlotPipeline("현대 판타지");

    const taskIds = mockCallStructured.mock.calls.map((c: unknown[]) => (c[0] as { taskId: string }).taskId);
    expect(taskIds).toEqual(["plot-generation", "plot-critic", "plot-polisher"]);
  });
});
