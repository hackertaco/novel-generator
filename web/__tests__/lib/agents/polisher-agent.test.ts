import { describe, it, expect } from "vitest";
import { buildPolisherPrompt } from "@/lib/agents/polisher-agent";
import type { CriticReport } from "@/lib/agents/pipeline";

describe("buildPolisherPrompt", () => {
  it("includes text and minor issues from last CriticReport", () => {
    const report: CriticReport = {
      overallScore: 0.8,
      dimensions: { narrative: 0.8, characterVoice: 0.8, rhythm: 0.7, hookEnding: 0.9, immersion: 0.8 },
      issues: [
        { startParagraph: 1, endParagraph: 1, category: "rhythm", description: "어미 반복", severity: "minor", suggestedFix: "어미 변경" },
        { startParagraph: 3, endParagraph: 3, category: "narrative", description: "큰 문제", severity: "major", suggestedFix: "수정" },
      ],
    };
    const prompt = buildPolisherPrompt("소설 본문", report, "현대 판타지");
    expect(prompt).toContain("소설 본문");
    expect(prompt).toContain("어미 반복"); // minor issue included
    expect(prompt).not.toContain("큰 문제"); // major issue excluded
  });

  it("works with no critique history", () => {
    const prompt = buildPolisherPrompt("본문", null, "로맨스");
    expect(prompt).toContain("본문");
  });
});
