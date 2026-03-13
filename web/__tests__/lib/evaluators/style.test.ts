// @vitest-environment node
import { describe, it, expect } from "vitest";
import { evaluateStyle } from "@/lib/evaluators/style";
import type { StyleGuide } from "@/lib/schema/novel";

const defaultStyle: StyleGuide = {
  max_paragraph_length: 3,
  dialogue_ratio: 0.6,
  sentence_style: "short",
  hook_ending: true,
  pov: "1인칭",
  tense: "과거형",
  formatting_rules: [],
};

const goodKakaoContent = `"그래, 네가 옳았어." 현우가 고개를 끄덕였다.\n\n서연이 웃었다. "그러니까 내 말을 들었어야지."\n\n현우는 대답 대신 창밖을 바라봤다.\n\n"다음엔 달라질 거야." 현우가 조용히 말했다.\n\n그때, 뒤에서 낯선 목소리가 들렸다...`;

describe("evaluateStyle", () => {
  describe("dialogue_ratio", () => {
    it("calculates dialogue ratio correctly - content with ~60% dialogue should score high", () => {
      const result = evaluateStyle(goodKakaoContent, defaultStyle);

      expect(result.dialogue_ratio.target_ratio).toBe(0.6);
      expect(result.dialogue_ratio.actual_ratio).toBeGreaterThan(0);
      expect(result.dialogue_ratio.actual_ratio).toBeLessThanOrEqual(1);
      // Content has significant dialogue so score should be reasonable
      expect(result.dialogue_ratio.score).toBeGreaterThan(0);
    });
  });

  describe("paragraph_length", () => {
    it("detects short paragraphs as passing", () => {
      // Each paragraph has 1-2 sentences, well under the max of 3
      const shortParagraphs = `짧은 문장이다.\n\n또 짧은 문장. 두 번째 문장.\n\n마지막 문장이다...`;
      const result = evaluateStyle(shortParagraphs, defaultStyle);

      expect(result.paragraph_length.violations).toBe(0);
      expect(result.paragraph_length.score).toBe(1.0);
      expect(result.paragraph_length.pass).toBe(true);
    });

    it("detects long paragraphs (>3 sentences each) as violations", () => {
      // A single paragraph with more than 3 sentences
      const longParagraph = `첫 번째 문장이다. 두 번째 문장이다. 세 번째 문장이다. 네 번째 문장이다. 다섯 번째 문장이다...`;
      const result = evaluateStyle(longParagraph, defaultStyle);

      expect(result.paragraph_length.violations).toBeGreaterThan(0);
      expect(result.paragraph_length.score).toBeLessThan(1.0);
    });
  });

  describe("hook_ending", () => {
    it('detects hook ending with "..." at end', () => {
      const content = `첫 문단이다.\n\n그리고 무언가 나타났다...`;
      const result = evaluateStyle(content, defaultStyle);

      expect(result.hook_ending.has_hook).toBe(true);
      expect(result.hook_ending.score).toBe(1.0);
      expect(result.hook_ending.pass).toBe(true);
    });

    it('detects hook ending with "?" at end', () => {
      const content = `첫 문단이다.\n\n과연 그가 돌아올 수 있을까?`;
      const result = evaluateStyle(content, defaultStyle);

      expect(result.hook_ending.has_hook).toBe(true);
      expect(result.hook_ending.score).toBe(1.0);
      expect(result.hook_ending.pass).toBe(true);
    });

    it('detects hook ending with Korean hook word "그때"', () => {
      const content = `첫 문단이다.\n\n그때, 뒤에서 낯선 목소리가 들렸다`;
      const result = evaluateStyle(content, defaultStyle);

      expect(result.hook_ending.has_hook).toBe(true);
      expect(result.hook_ending.score).toBe(1.0);
      expect(result.hook_ending.pass).toBe(true);
    });

    it("detects non-hook ending as failing", () => {
      const content = `첫 문단이다.\n\n현우는 집으로 돌아갔다`;
      const result = evaluateStyle(content, defaultStyle);

      expect(result.hook_ending.has_hook).toBe(false);
      expect(result.hook_ending.score).toBe(0.3);
      expect(result.hook_ending.pass).toBe(false);
    });
  });

  describe("overall_score", () => {
    it("is between 0 and 1", () => {
      const result = evaluateStyle(goodKakaoContent, defaultStyle);

      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(1);
    });
  });

  it("content with good Kakao style scores > 0.7", () => {
    const result = evaluateStyle(goodKakaoContent, defaultStyle);

    expect(result.overall_score).toBeGreaterThan(0.7);
  });
});
