import { describe, it, expect } from "vitest";
import { repairJson, parseJsonFromText } from "../../../src/lib/memory/fact-extractor";

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
