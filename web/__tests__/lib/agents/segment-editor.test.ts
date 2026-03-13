import { describe, it, expect } from "vitest";
import { buildSegmentEditPrompt } from "@/lib/agents/segment-editor";
import type { Segment } from "@/lib/agents/segmenter";

describe("buildSegmentEditPrompt", () => {
  const target: Segment = { id: 2, text: "준혁은 길을 걸었다. 아무 생각이 없었다." };
  const prev: Segment = { id: 1, text: "학교 종이 울렸다." };
  const next: Segment = { id: 3, text: "편의점에 도착했다." };

  it("includes target segment marked for editing", () => {
    const prompt = buildSegmentEditPrompt(target, ["묘사 부족"], prev, next, "현대 판타지");
    expect(prompt).toContain("수정 대상");
    expect(prompt).toContain("준혁은 길을 걸었다");
  });

  it("includes prev/next as read-only context", () => {
    const prompt = buildSegmentEditPrompt(target, ["묘사 부족"], prev, next, "현대 판타지");
    expect(prompt).toContain("읽기 전용");
    expect(prompt).toContain("학교 종이 울렸다");
    expect(prompt).toContain("편의점에 도착했다");
  });

  it("includes issues in edit instructions", () => {
    const prompt = buildSegmentEditPrompt(target, ["묘사 부족", "대사 추가 필요"], prev, next, "현대 판타지");
    expect(prompt).toContain("묘사 부족");
    expect(prompt).toContain("대사 추가 필요");
  });

  it("handles null prev/next segments", () => {
    const prompt = buildSegmentEditPrompt(target, ["후킹 엔딩 부족"], null, null, "현대 판타지");
    expect(prompt).toContain("수정 대상");
    expect(prompt).not.toContain("undefined");
  });

  it("includes character voice context when provided", () => {
    const prompt = buildSegmentEditPrompt(
      target, ["말투 불일치"], prev, next, "현대 판타지",
      { characterVoice: [{ name: "이준혁", speechPatterns: ["~거든", "뭐..."] }] },
    );
    expect(prompt).toContain("이준혁");
    expect(prompt).toContain("~거든");
  });
});
