import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGenreIdentityRule, buildPlotCriticPrompt, PlotCritic } from "@/lib/agents/plot-critic";

// Mock the LLM agent
vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: vi.fn(() => ({
    callStructured: vi.fn(),
  })),
}));

import { getAgent } from "@/lib/agents/llm-agent";

describe("buildGenreIdentityRule", () => {
  it("returns romance-specific rules for romance genres", () => {
    const rule = buildGenreIdentityRule("로맨스 판타지");
    expect(rule).toContain("장르 정체성");
    expect(rule).toContain("로맨스/감정선이 플롯의 중심");
    expect(rule).toContain("로맨스 판타지");
  });

  it("returns empty string for non-romance genres", () => {
    expect(buildGenreIdentityRule("현대 판타지")).toBe("");
    expect(buildGenreIdentityRule("무협")).toBe("");
  });
});

describe("buildPlotCriticPrompt", () => {
  const mockPlots = [
    { id: "A", title: "제목", logline: "로그라인", hook: "훅", arc_summary: ["1부"], key_twist: "반전" },
  ];

  it("includes genre and plot data", () => {
    const prompt = buildPlotCriticPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("현대 판타지");
    expect(prompt).toContain("로그라인");
  });

  it("includes originality check criteria", () => {
    const prompt = buildPlotCriticPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("뻔함 감지");
    expect(prompt).toContain("숨겨진 강자");
  });

  it("includes logline appeal criteria", () => {
    const prompt = buildPlotCriticPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("로그라인 매력도");
    expect(prompt).toContain("1화 클릭하겠는가");
  });

  it("includes plausibility criteria", () => {
    const prompt = buildPlotCriticPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("개연성");
  });

  it("includes genre identity rule for romance", () => {
    const prompt = buildPlotCriticPrompt("로맨스 판타지", mockPlots);
    expect(prompt).toContain("장르 정체성");
    expect(prompt).toContain("로맨스/감정선이 플롯의 중심");
  });

  it("does NOT include genre identity rule for non-romance", () => {
    const prompt = buildPlotCriticPrompt("현대 판타지", mockPlots);
    expect(prompt).not.toContain("장르 정체성");
  });

  it("does NOT include language/grammar correction criteria", () => {
    const prompt = buildPlotCriticPrompt("현대 판타지", mockPlots);
    expect(prompt).not.toContain("번역체");
    expect(prompt).not.toContain("주술관계");
  });
});

describe("PlotCritic", () => {
  const mockPlots = [
    { id: "A", title: "제목", logline: "로그라인", hook: "훅", arc_summary: ["1부"], key_twist: "반전", male_archetype: "", female_archetype: "" },
  ];
  const improvedPlots = [
    { id: "A", title: "개선됨", logline: "더 좋은 로그라인", hook: "더 좋은 훅", arc_summary: ["1부"], key_twist: "더 좋은 반전", male_archetype: "", female_archetype: "" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls callStructured with critic system prompt", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: improvedPlots,
      usage: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500, cost_usd: 0.02 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const critic = new PlotCritic();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: mockPlots,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };

    await critic.run(ctx);

    const callArgs = mockCallStructured.mock.calls[0][0];
    expect(callArgs.system).toContain("편집장");
    expect(callArgs.temperature).toBe(0.7);
    expect(callArgs.taskId).toBe("plot-critic");
  });

  it("replaces ctx.plots with critic result", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: improvedPlots,
      usage: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500, cost_usd: 0.02 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const critic = new PlotCritic();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: mockPlots,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };

    await critic.run(ctx);
    expect(ctx.plots).toEqual(improvedPlots);
  });

  it("accumulates usage", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: improvedPlots,
      usage: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500, cost_usd: 0.02 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const critic = new PlotCritic();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: mockPlots,
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost_usd: 0.01 },
    };

    await critic.run(ctx);
    expect(ctx.usage.prompt_tokens).toBe(300);
    expect(ctx.usage.total_tokens).toBe(700);
  });

  it("has name 'plot-critic'", () => {
    expect(new PlotCritic().name).toBe("plot-critic");
  });
});
