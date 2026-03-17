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
  // Minimal mock plots (will fail validation → triggers repair call)
  const writerPlots = [
    { id: "A", title: "초안", logline: "초안 로그라인", hook: "초안 훅", arc_summary: ["1부"], key_twist: "초안 반전", male_archetype: "", female_archetype: "" },
  ];
  const criticPlots = [
    { id: "A", title: "개선", logline: "개선된 로그라인", hook: "개선된 훅", arc_summary: ["1부"], key_twist: "개선된 반전", male_archetype: "", female_archetype: "" },
  ];
  const polishedPlots = [
    { id: "A", title: "완성", logline: "자연스러운 로그라인", hook: "자연스러운 훅", arc_summary: ["1부"], key_twist: "자연스러운 반전", male_archetype: "", female_archetype: "" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs 3 agents + 1 repair call when validation fails", async () => {
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

    // 3 pipeline agents + up to 3 repair calls (since mock plots fail validation)
    expect(mockCallStructured.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(result.plots).toBeDefined();
  });

  it("accumulates usage across all agents including repair", async () => {
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

    // 3 pipeline + up to 3 repairs — usage accumulates
    expect(result.usage.prompt_tokens).toBeGreaterThanOrEqual(600);
    expect(result.usage.total_tokens).toBeGreaterThanOrEqual(1200);
  });

  it("passes correct taskIds for each agent stage", async () => {
    const mockCallStructured = vi.fn().mockResolvedValue({
      data: polishedPlots,
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost_usd: 0.01 },
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    await runPlotPipeline("현대 판타지");

    const taskIds = mockCallStructured.mock.calls.map((c: unknown[]) => (c[0] as { taskId: string }).taskId);
    // 3 pipeline agents + repair calls (numbered)
    expect(taskIds.slice(0, 3)).toEqual(["plot-generation", "plot-debate", "plot-polisher"]);
    expect(taskIds.length).toBeGreaterThanOrEqual(4);
    expect(taskIds[3]).toMatch(/^plot-repair-/);
  });

  it("skips repair when plots pass validation", async () => {
    // Create plots that pass all validation checks
    const validPlots = [
      {
        id: "A", title: "궁중암투",
        logline: "시녀 은서가 황후의 비밀 장부를 손에 넣고 반격에 나선다. 궁중 정치의 판이 뒤집힌다.",
        hook: "은서의 반격이 시작된다",
        arc_summary: [
          "1부: 독배 - 황비 이수련이 측비 연화에게 독살당한 뒤 5년 전으로 회귀한다.",
          "2부: 거미줄 - 이수련이 좌상 가문의 비리를 파헤치며 궁중 세력을 재편한다.",
          "3부: 역린 - 좌상 가문이 반격에 나서고 이수련은 최후의 선택에 직면한다.",
        ],
        key_twist: "이수련의 기밀 장부에서 측비의 진짜 정체가 드러난다",
        male_archetype: "", female_archetype: "",
      },
    ];
    let callCount = 0;
    const mockCallStructured = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        data: validPlots,
        usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200, cost_usd: 0.01 },
      });
    });
    (getAgent as ReturnType<typeof vi.fn>).mockReturnValue({ callStructured: mockCallStructured });

    const result = await runPlotPipeline("현대 판타지");

    // Only 3 pipeline calls, no repair needed
    expect(mockCallStructured).toHaveBeenCalledTimes(3);
    expect(result.validationIssues).toBeUndefined();
  });
});
