// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  parseCriticResponse,
  computeOverallScore,
  buildCriticPrompt,
} from "@/lib/agents/critic-agent";
import type { RuleIssue } from "@/lib/agents/pipeline";
import type { NovelSeed } from "@/lib/schema/novel";

describe("parseCriticResponse", () => {
  it("parses valid JSON response into CriticReport", () => {
    const json = JSON.stringify({
      dimensions: {
        narrative: 0.8,
        characterVoice: 0.7,
        rhythm: 0.6,
        hookEnding: 0.9,
        immersion: 0.5,
      },
      issues: [
        {
          startParagraph: 2,
          endParagraph: 3,
          category: "characterVoice",
          description: "말투 불일치",
          severity: "major",
          suggestedFix: "반말로 수정",
        },
      ],
    });
    const report = parseCriticResponse(json);
    expect(report).not.toBeNull();
    expect(report!.dimensions.narrative).toBe(0.8);
    expect(report!.issues).toHaveLength(1);
    expect(report!.overallScore).toBeCloseTo(
      0.8 * 0.25 + 0.7 * 0.25 + 0.6 * 0.2 + 0.9 * 0.15 + 0.5 * 0.15
    );
  });

  it("returns null for invalid JSON", () => {
    expect(parseCriticResponse("not json at all")).toBeNull();
  });

  it("handles JSON wrapped in markdown code block", () => {
    const json =
      '```json\n{"dimensions":{"narrative":0.5,"characterVoice":0.5,"rhythm":0.5,"hookEnding":0.5,"immersion":0.5},"issues":[]}\n```';
    const report = parseCriticResponse(json);
    expect(report).not.toBeNull();
    expect(report!.overallScore).toBeCloseTo(0.5);
  });

  it("filters out-of-bounds paragraph indices", () => {
    const json = JSON.stringify({
      dimensions: {
        narrative: 0.8,
        characterVoice: 0.7,
        rhythm: 0.6,
        hookEnding: 0.9,
        immersion: 0.5,
      },
      issues: [
        {
          startParagraph: 99,
          endParagraph: 100,
          category: "narrative",
          description: "test",
          severity: "major",
          suggestedFix: "test",
        },
      ],
    });
    const report = parseCriticResponse(json, 10);
    expect(report!.issues).toHaveLength(0);
  });
});

describe("computeOverallScore", () => {
  it("applies correct weights", () => {
    const dims = {
      narrative: 1.0,
      characterVoice: 1.0,
      rhythm: 1.0,
      hookEnding: 1.0,
      immersion: 1.0,
    };
    expect(computeOverallScore(dims)).toBeCloseTo(1.0);
  });

  it("computes weighted average correctly", () => {
    const dims = {
      narrative: 0.8,
      characterVoice: 0.6,
      rhythm: 0.4,
      hookEnding: 1.0,
      immersion: 0.0,
    };
    const expected =
      0.8 * 0.25 + 0.6 * 0.25 + 0.4 * 0.2 + 1.0 * 0.15 + 0.0 * 0.15;
    expect(computeOverallScore(dims)).toBeCloseTo(expected);
  });

  it("handles missing dimensions gracefully (defaults to 0)", () => {
    const dims = { narrative: 0.8 };
    const result = computeOverallScore(dims);
    expect(result).toBeCloseTo(0.8 * 0.25);
  });
});

describe("buildCriticPrompt", () => {
  it("includes text in prompt", () => {
    const prompt = buildCriticPrompt(
      "소설 본문 텍스트",
      [],
      { world: { genre: "현대 판타지" } } as unknown as NovelSeed
    );
    expect(prompt).toContain("소설 본문 텍스트");
  });

  it("includes rule issues as hints when present", () => {
    const ruleIssues: RuleIssue[] = [
      { type: "ending_repeat", position: 3, detail: "~였다 3연속" },
    ];
    const prompt = buildCriticPrompt("본문", ruleIssues, {
      world: { genre: "로맨스" },
    } as unknown as NovelSeed);
    expect(prompt).toContain("~였다 3연속");
  });

  it("includes genre info", () => {
    const prompt = buildCriticPrompt("본문", [], {
      world: { genre: "무협" },
    } as unknown as NovelSeed);
    expect(prompt).toContain("무협");
  });
});
