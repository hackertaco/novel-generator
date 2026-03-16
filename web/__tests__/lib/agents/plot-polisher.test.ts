import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPlotPolisherPrompt, PlotPolisher } from "@/lib/agents/plot-polisher";

// Mock the LLM agent
vi.mock("@/lib/agents/llm-agent", () => ({
  getAgent: vi.fn(() => ({
    callStructured: vi.fn(),
  })),
}));

import { getAgent } from "@/lib/agents/llm-agent";

describe("buildPlotPolisherPrompt", () => {
  const mockPlots = [
    { id: "A", title: "제목", logline: "로그라인", hook: "훅", arc_summary: ["1부"], key_twist: "반전" },
  ];

  it("includes genre and plot data", () => {
    const prompt = buildPlotPolisherPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("현대 판타지");
    expect(prompt).toContain("로그라인");
  });

  it("includes AI translation artifact rules", () => {
    const prompt = buildPlotPolisherPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("번역체 문장 금지");
    expect(prompt).toContain("~하게 된다");
    expect(prompt).toContain("진정한 ~을 찾아가는");
  });

  it("includes subject-predicate agreement rules", () => {
    const prompt = buildPlotPolisherPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("주술관계");
    expect(prompt).toContain("그녀는 황태자와의 사랑이 시험대에 오르게 된다");
  });

  it("includes Korean grammar check instructions", () => {
    const prompt = buildPlotPolisherPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("조사 오용");
    expect(prompt).toContain("번역체 어순 금지");
  });

  it("instructs NOT to change content/structure", () => {
    const prompt = buildPlotPolisherPrompt("현대 판타지", mockPlots);
    expect(prompt).toContain("내용/구조는 바꾸지 마세요");
  });

  it("does NOT include originality/genre-identity criteria", () => {
    const prompt = buildPlotPolisherPrompt("로맨스 판타지", mockPlots);
    expect(prompt).not.toContain("뻔함 감지");
    expect(prompt).not.toContain("장르 정체성");
    expect(prompt).not.toContain("개연성");
  });
});

describe("PlotPolisher", () => {
  const inputPlots = [
    { id: "A", title: "제목", logline: "나쁜 로그라인", hook: "훅", arc_summary: ["1부"], key_twist: "반전", male_archetype: "", female_archetype: "" },
  ];
  const polishedPlots = [
    { id: "A", title: "제목", logline: "더 자연스러운 로그라인", hook: "훅", arc_summary: ["1부"], key_twist: "반전", male_archetype: "", female_archetype: "" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls callStructured with polisher system prompt", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: polishedPlots,
      usage: { prompt_tokens: 150, completion_tokens: 250, total_tokens: 400, cost_usd: 0.015 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const polisher = new PlotPolisher();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: inputPlots,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };

    await polisher.run(ctx);

    const callArgs = mockCallStructured.mock.calls[0][0];
    expect(callArgs.system).toContain("한국어 문장 교정 전문가");
    expect(callArgs.temperature).toBe(0.3);
    expect(callArgs.taskId).toBe("plot-polisher");
  });

  it("replaces ctx.plots with polished result", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: polishedPlots,
      usage: { prompt_tokens: 150, completion_tokens: 250, total_tokens: 400, cost_usd: 0.015 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const polisher = new PlotPolisher();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: inputPlots,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };

    await polisher.run(ctx);
    expect(ctx.plots).toEqual(polishedPlots);
  });

  it("accumulates usage", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: polishedPlots,
      usage: { prompt_tokens: 150, completion_tokens: 250, total_tokens: 400, cost_usd: 0.015 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const polisher = new PlotPolisher();
    const ctx = {
      genre: "현대 판타지",
      detectedGenre: "현대 판타지",
      plots: inputPlots,
      usage: { prompt_tokens: 300, completion_tokens: 400, total_tokens: 700, cost_usd: 0.03 },
    };

    await polisher.run(ctx);
    expect(ctx.usage.prompt_tokens).toBe(450);
    expect(ctx.usage.total_tokens).toBe(1100);
  });

  it("has name 'plot-polisher'", () => {
    expect(new PlotPolisher().name).toBe("plot-polisher");
  });
});
