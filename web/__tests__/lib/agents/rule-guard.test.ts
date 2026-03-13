import { describe, it, expect } from "vitest";
import {
  sanitize,
  deduplicateParagraphs,
  detectEndingRepeat,
  detectSentenceStartRepeat,
} from "@/lib/agents/rule-guard";

describe("sanitize", () => {
  it("removes --- 수정 대상 --- markers", () => {
    const text = "좋은 문장.\n\n--- 수정 대상 ---\n다른 문장.";
    expect(sanitize(text)).not.toContain("수정 대상");
  });

  it("removes 수정: prefix lines", () => {
    const text = "정상 문장.\n수정: 이 부분을 고쳤습니다.\n다음 문장.";
    expect(sanitize(text)).not.toContain("수정:");
  });

  it("removes editor comment brackets", () => {
    const text = "본문.\n[편집자 노트: 여기를 수정함]\n이어서.";
    expect(sanitize(text)).not.toContain("편집자 노트");
  });

  it("removes --- 문맥 --- markers", () => {
    const text = "앞문단.\n--- 문맥 (읽기 전용, 수정하지 마세요) ---\n뒷문단.";
    expect(sanitize(text)).not.toContain("문맥");
  });

  it("preserves normal text", () => {
    const text = "정상적인 소설 본문입니다.";
    expect(sanitize(text)).toBe(text);
  });
});

describe("deduplicateParagraphs", () => {
  it("removes exact duplicate paragraphs", () => {
    const text = "첫 번째 문단.\n\n두 번째 문단.\n\n첫 번째 문단.";
    const result = deduplicateParagraphs(text);
    expect(result.split("\n\n")).toHaveLength(2);
  });

  it("removes near-duplicate paragraphs sharing 50-char prefix", () => {
    const prefix = "복도를 지나며 나는 마법사의 음모에 대한 첫 단서를 찾을 수 있을 것이라는 희망을 품었다.";
    const text = `${prefix} 첫 번째 버전.\n\n다른 문단.\n\n${prefix} 두 번째 버전.`;
    const result = deduplicateParagraphs(text);
    expect(result.split("\n\n")).toHaveLength(2);
  });

  it("keeps non-duplicate paragraphs intact", () => {
    const text = "문단 하나.\n\n문단 둘.\n\n문단 셋.";
    expect(deduplicateParagraphs(text).split("\n\n")).toHaveLength(3);
  });
});

describe("detectEndingRepeat", () => {
  it("detects 3 consecutive same endings", () => {
    const text = "그는 걸었다. 그녀는 웃었다. 바람이 불었다.";
    const issues = detectEndingRepeat(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("ending_repeat");
  });

  it("does not flag varied endings", () => {
    const text = "그는 걸었다. 바람이 분다. 꽃이 피었지.";
    expect(detectEndingRepeat(text)).toHaveLength(0);
  });
});

describe("detectSentenceStartRepeat", () => {
  it("detects 3 consecutive same starts", () => {
    const text = "그는 걸었다. 그는 멈췄다. 그는 돌아봤다.";
    const issues = detectSentenceStartRepeat(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("sentence_start_repeat");
  });

  it("does not flag varied starts", () => {
    const text = "그는 걸었다. 바람이 분다. 꽃이 피었다.";
    expect(detectSentenceStartRepeat(text)).toHaveLength(0);
  });
});
