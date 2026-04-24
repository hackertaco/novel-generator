import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NovelSeed } from "../../../src/lib/schema/novel";

const mockCall = vi.fn();

vi.mock("../../../src/lib/agents/llm-agent", () => ({
  getAgent: () => ({ call: mockCall }),
}));

import {
  extractChapterFacts,
  repairJson,
  parseJsonFromText,
} from "../../../src/lib/memory/fact-extractor";

function makeSeed(): NovelSeed {
  return {
    title: "테스트",
    logline: "테스트 로그라인",
    total_chapters: 10,
    world: {
      name: "테스트 세계",
      genre: "fantasy",
      sub_genre: "romantasy",
      time_period: "중세풍",
      magic_system: "문양 마법",
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "seraphine",
        name: "세라핀",
        role: "protagonist",
        description: "주인공",
        introduction_chapter: 1,
        traits: [],
        speech_style: { formality: "plain", quirk: "", vocabulary: [] },
        state: {
          status: "긴장",
          location: "회랑",
          relationships: {},
          secrets_known: [],
        },
      },
      {
        id: "leon",
        name: "레온",
        role: "supporting",
        description: "조력자",
        introduction_chapter: 1,
        traits: [],
        speech_style: { formality: "formal", quirk: "", vocabulary: [] },
        state: {
          status: "침착",
          location: "회랑",
          relationships: {},
          secrets_known: [],
        },
      },
    ],
    story_threads: [],
    arcs: [],
    foreshadowing: [],
    chapter_outlines: [],
    extended_outlines: [],
    style: {
      tone: "긴장감 있는 판타지",
      prose_guidelines: [],
      banned: [],
    },
  } as unknown as NovelSeed;
}

beforeEach(() => {
  mockCall.mockReset();
  vi.restoreAllMocks();
});

describe("repairJson", () => {
  it("removes trailing commas before } and ]", () => {
    const input = '{"a": 1, "b": [1, 2,], }';
    const result = JSON.parse(repairJson(input));
    expect(result).toEqual({ a: 1, b: [1, 2] });
  });

  it("converts single quotes to double quotes", () => {
    const input = "{'name': 'hello'}";
    const result = JSON.parse(repairJson(input));
    expect(result).toEqual({ name: "hello" });
  });

  it("handles nested trailing commas", () => {
    const input = '{"facts": [{"subject": "리에나", "action": "도착",},], }';
    const result = JSON.parse(repairJson(input));
    expect(result.facts[0].subject).toBe("리에나");
  });
});

describe("parseJsonFromText", () => {
  it("parses clean JSON", () => {
    const input = '{"chapter": 1, "facts": []}';
    expect(parseJsonFromText(input)).toEqual({ chapter: 1, facts: [] });
  });

  it("extracts JSON from markdown code block", () => {
    const input = `Here is the result:
\`\`\`json
{"chapter": 1, "summary": "테스트"}
\`\`\`
Done.`;
    const result = parseJsonFromText(input);
    expect(result).toEqual({ chapter: 1, summary: "테스트" });
  });

  it("extracts JSON from surrounding text", () => {
    const input = `분석 결과:
{"chapter": 2, "facts": [{"subject": "리에나", "action": "탈출", "object": "북궁", "chapter": 2}]}
이상입니다.`;
    const result = parseJsonFromText(input);
    expect(result!.chapter).toBe(2);
    expect((result!.facts as unknown[]).length).toBe(1);
  });

  it("handles trailing commas via repair", () => {
    const input = '{"chapter": 1, "facts": [{"subject": "A", "action": "B", "object": "C", "chapter": 1,},], "character_states": [], "summary": "test",}';
    const result = parseJsonFromText(input);
    expect(result).not.toBeNull();
    expect(result!.chapter).toBe(1);
  });

  it("handles single quotes via repair", () => {
    const input = "{'chapter': 1, 'facts': [], 'character_states': [], 'summary': 'test'}";
    const result = parseJsonFromText(input);
    expect(result).not.toBeNull();
    expect(result!.chapter).toBe(1);
  });

  it("handles code block with trailing commas", () => {
    const input = `\`\`\`json
{"chapter": 1, "facts": [], "summary": "test",}
\`\`\``;
    const result = parseJsonFromText(input);
    expect(result).not.toBeNull();
    expect(result!.chapter).toBe(1);
  });

  it("returns null for completely invalid input", () => {
    expect(parseJsonFromText("이건 JSON이 아닙니다")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseJsonFromText("")).toBeNull();
  });

  it("parses JSON with companions field", () => {
    const input = '{"chapter": 3, "facts": [], "character_states": [{"name": "리에나", "location": "왕궁", "physical": "건강", "emotional": "불안", "knows": [], "companions": ["테오"], "relationships": []}], "summary": "test"}';
    const result = parseJsonFromText(input);
    const states = result!.character_states as Array<Record<string, unknown>>;
    expect(states[0].companions).toEqual(["테오"]);
  });
});

describe("extractChapterFacts", () => {
  it("warns and falls back to summary-only extraction when JSON parsing fails", async () => {
    mockCall.mockResolvedValue({
      data: "분석 실패\nsummary: 파싱 안 됨",
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await extractChapterFacts(
      "세라핀은 문 앞에 섰다. 레온은 숨을 골랐다.",
      makeSeed(),
      4,
      [],
    );

    expect(warnSpy).toHaveBeenCalledWith("[fact-extractor] 4화 JSON 파싱 실패, 요약만 추출");
    expect(result).toEqual({
      chapter: 4,
      facts: [],
      character_states: [],
      summary: "4화",
    });
  });

  it("warns and returns a minimal fallback when the agent call throws", async () => {
    mockCall.mockRejectedValue(new Error("network timeout"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await extractChapterFacts(
      "세라핀은 회랑을 가로질렀다.",
      makeSeed(),
      5,
      [],
    );

    expect(warnSpy).toHaveBeenCalledWith("[fact-extractor] 5화 사실 추출 실패:", "network timeout");
    expect(result).toEqual({
      chapter: 5,
      facts: [],
      character_states: [],
      summary: "5화",
    });
  });
});
