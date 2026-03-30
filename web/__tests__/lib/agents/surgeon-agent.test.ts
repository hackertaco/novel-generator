import { describe, it, expect } from "vitest";
import { buildSurgeonPrompt, applyPatch } from "@/lib/agents/surgeon-agent";

describe("buildSurgeonPrompt", () => {
  it("includes target text and surrounding context", () => {
    const prompt = buildSurgeonPrompt(
      "대상 문단 텍스트", "이전 문단", "다음 문단",
      "캐릭터 말투 불일치", "반말로 수정해주세요"
    );
    expect(prompt).toContain("대상 문단 텍스트");
    expect(prompt).toContain("이전 문단");
    expect(prompt).toContain("다음 문단");
    expect(prompt).toContain("캐릭터 말투 불일치");
    expect(prompt).toContain("반말로 수정해주세요");
  });

  it("does not contain --- marker syntax", () => {
    const prompt = buildSurgeonPrompt("대상", "이전", "다음", "이유", "방향");
    expect(prompt).not.toMatch(/^---/m);
  });

  it("handles null prev/next context", () => {
    const prompt = buildSurgeonPrompt("대상 텍스트", null, null, "이유", "방향");
    expect(prompt).toContain("대상 텍스트");
    expect(prompt).not.toContain("null");
    expect(prompt).toContain("이유");
  });

  it("handles only prev null", () => {
    const prompt = buildSurgeonPrompt("대상", null, "다음", "이유", "방향");
    expect(prompt).not.toContain("null");
    expect(prompt).toContain("다음");
  });
});

describe("applyPatch", () => {
  it("replaces target range and reassembles", () => {
    const text = "문단0\n\n문단1\n\n문단2\n\n문단3";
    const result = applyPatch(text, 1, 2, "수정된 문단1\n\n수정된 문단2");
    expect(result).toContain("문단0");
    expect(result).toContain("수정된 문단1");
    expect(result).toContain("수정된 문단2");
    expect(result).toContain("문단3");
    expect(result).not.toContain("\n문단1\n");
  });

  it("replaces single paragraph", () => {
    const text = "문단0\n\n문단1\n\n문단2";
    const result = applyPatch(text, 1, 1, "새 문단1");
    expect(result).toBe("문단0\n\n새 문단1\n\n문단2");
  });

  it("ignores patch if patched text is less than 50% of original range", () => {
    const text = "문단0\n\n아주 긴 문단 내용이 여기에 있습니다. 충분히 길어야 합니다.";
    const result = applyPatch(text, 1, 1, "짧");
    expect(result).toContain("아주 긴 문단");
  });

  it("ignores empty patch", () => {
    const text = "문단0\n\n문단1";
    const result = applyPatch(text, 1, 1, "");
    expect(result).toContain("문단1");
  });

  it("handles out-of-bounds start paragraph", () => {
    const text = "문단0\n\n문단1";
    const result = applyPatch(text, 5, 5, "새 텍스트");
    expect(result).toBe(text);
  });
});
