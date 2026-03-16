import { describe, it, expect } from "vitest";
import type { ChapterContext } from "@/lib/agents/pipeline";
import type { NovelSeed } from "@/lib/schema/novel";
import { accumulateUsage } from "@/lib/agents/pipeline";

describe("Pipeline types", () => {
  it("ChapterContext has all required fields", () => {
    const ctx: ChapterContext = {
      seed: {} as unknown as NovelSeed,
      chapterNumber: 1,
      previousSummaries: [],
      text: "test",
      snapshots: [],
      bestScore: 0,
      ruleIssues: [],
      critiqueHistory: [],
      totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };
    expect(ctx.text).toBe("test");
    expect(ctx.ruleIssues).toEqual([]);
  });

  it("accumulateUsage adds all fields", () => {
    const a = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost_usd: 0.01 };
    const b = { prompt_tokens: 5, completion_tokens: 15, total_tokens: 20, cost_usd: 0.005 };
    const result = accumulateUsage(a, b);
    expect(result.prompt_tokens).toBe(15);
    expect(result.total_tokens).toBe(50);
    expect(result.cost_usd).toBeCloseTo(0.015);
  });
});
