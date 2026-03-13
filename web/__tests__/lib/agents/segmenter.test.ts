import { describe, it, expect } from "vitest";
import { segmentText, reassemble, type Segment } from "@/lib/agents/segmenter";

describe("segmentText", () => {
  it("splits on double newline", () => {
    const text = "첫 번째 문단입니다.\n\n두 번째 문단입니다.\n\n세 번째 문단입니다.";
    const segments = segmentText(text);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ id: 0, text: "첫 번째 문단입니다." });
    expect(segments[1]).toEqual({ id: 1, text: "두 번째 문단입니다." });
    expect(segments[2]).toEqual({ id: 2, text: "세 번째 문단입니다." });
  });

  it("filters empty segments", () => {
    const text = "문단 A\n\n\n\n문단 B";
    const segments = segmentText(text);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe("문단 A");
    expect(segments[1].text).toBe("문단 B");
  });

  it("handles single paragraph", () => {
    const text = "하나의 문단만 있다.";
    const segments = segmentText(text);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ id: 0, text: "하나의 문단만 있다." });
  });

  it("preserves internal newlines within paragraphs", () => {
    const text = '"안녕하세요."\n준혁이 말했다.\n\n다음 문단.';
    const segments = segmentText(text);
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('"안녕하세요."\n준혁이 말했다.');
  });
});

describe("reassemble", () => {
  it("joins segments with double newline", () => {
    const segments: Segment[] = [
      { id: 0, text: "A" },
      { id: 1, text: "B" },
      { id: 2, text: "C" },
    ];
    expect(reassemble(segments)).toBe("A\n\nB\n\nC");
  });

  it("roundtrips with segmentText", () => {
    const original = "문단 1\n\n문단 2\n\n문단 3";
    const segments = segmentText(original);
    expect(reassemble(segments)).toBe(original);
  });
});
