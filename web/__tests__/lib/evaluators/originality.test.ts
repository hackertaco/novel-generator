import { describe, it, expect } from "vitest";
import { measureOriginality } from "../../../src/lib/evaluators/originality";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CLICHE_HEAVY_TEXT = `
심장이 두근거렸다. 눈이 마주쳤다. 볼이 붉어졌다.
시간이 멈춘 것 같았다. 그의 눈동자가 흔들렸다.

숨이 멎을 것 같았다. 온몸이 얼어붙었다.
차가운 눈빛으로 그녀를 바라보았다. 따뜻한 미소를 지었다.

결심을 굳혔다. 주먹을 꽉 쥐었다. 입술을 깨물었다.
고개를 끄덕였다. 한숨을 내쉬었다. 미간을 찌푸렸다.

이를 악물었다. 살기가 느껴졌다. 강력한 기운이 느껴졌다.
생각보다 예상대로 역시 어쩔 수 없었다.

그때였다. 바로 그때. 그 순간.
가슴이 먹먹해졌다. 마음이 무거워졌다. 눈물이 흘렀다.
`.trim();

const FRESH_TEXT = `
소나기가 그친 뒤 정류장 벤치에는 빗물 웅덩이가 고여 있었다.
수현은 젖은 운동화를 툭 차며 아직 오지 않는 버스를 기다렸다.

전봇대 아래 떨어진 전단지 한 장이 바람에 떠올랐다가 내려앉았다.
낡은 카페 간판이 삐걱거리며 흔들리고 있었다.

"삼십분째 안 오는 거 아냐?" 옆 사람이 혼잣말처럼 중얼거렸다.
수현은 이어폰 한쪽을 빼고 시간을 확인했다. 4시 17분.

멀리서 엔진 소리가 희미하게 들려왔다.
도로 위 아지랑이 너머로 파란 버스의 윤곽이 나타났다.

수현은 가방 끈을 고쳐 잡고 일어섰다.
발밑의 물웅덩이에 하늘이 비치고 있었다.
`.trim();

const REPETITIVE_OPENING_TEXT = `
그는 칼을 들었다. 적의 기운이 느껴졌다.

그는 앞으로 나아갔다. 바닥에 피가 흥건했다.

그는 눈을 감았다. 과거의 기억이 떠올랐다.

그는 다시 눈을 떴다. 결심을 굳혔다.

그는 검을 휘둘렀다. 적이 쓰러졌다.
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("measureOriginality", () => {
  describe("cliche detection", () => {
    it("should detect many cliches in cliche-heavy text", () => {
      const result = measureOriginality(CLICHE_HEAVY_TEXT);
      expect(result.clicheCount).toBeGreaterThanOrEqual(15);
      expect(result.clichesFound.length).toBeGreaterThanOrEqual(10);
      expect(result.clicheDensity).toBeGreaterThan(0);
    });

    it("should detect few or no cliches in fresh text", () => {
      const result = measureOriginality(FRESH_TEXT);
      expect(result.clicheCount).toBeLessThanOrEqual(2);
      expect(result.clicheDensity).toBeLessThan(1);
    });

    it("should return specific cliche strings that were found", () => {
      const result = measureOriginality(CLICHE_HEAVY_TEXT);
      expect(result.clichesFound).toContain("심장이 두근거렸다");
      expect(result.clichesFound).toContain("눈이 마주쳤다");
      expect(result.clichesFound).toContain("차가운 눈빛");
    });

    it("should count multiple occurrences of the same cliche", () => {
      const repeated = "심장이 두근거렸다. 심장이 두근거렸다. 심장이 두근거렸다.";
      const result = measureOriginality(repeated);
      expect(result.clicheCount).toBe(3);
      expect(result.clichesFound).toContain("심장이 두근거렸다");
    });
  });

  describe("Type-Token Ratio (TTR)", () => {
    it("should compute TTR for normal text", () => {
      const result = measureOriginality(FRESH_TEXT);
      expect(result.typeTokenRatio).toBeGreaterThan(0);
      expect(result.typeTokenRatio).toBeLessThanOrEqual(1);
    });

    it("should give higher TTR for diverse vocabulary", () => {
      const diverse = "사과 배 포도 딸기 수박 참외 바나나 키위 망고 체리 자두 살구 귤 오렌지 레몬";
      const repetitive = "사과 사과 사과 사과 사과 사과 사과 사과 사과 사과 사과 사과 사과 사과 사과";
      const diverseResult = measureOriginality(diverse);
      const repetitiveResult = measureOriginality(repetitive);
      expect(diverseResult.typeTokenRatio).toBeGreaterThan(repetitiveResult.typeTokenRatio);
    });

    it("should have TTR in reasonable range for Korean text", () => {
      const result = measureOriginality(FRESH_TEXT);
      // Korean text with particles split should be in 0.3-0.9 range
      expect(result.typeTokenRatio).toBeGreaterThanOrEqual(0.3);
      expect(result.typeTokenRatio).toBeLessThanOrEqual(0.95);
    });
  });

  describe("opening entropy", () => {
    it("should give low entropy for repetitive openings", () => {
      const result = measureOriginality(REPETITIVE_OPENING_TEXT);
      // All paragraphs start with "그는" -> low entropy
      expect(result.openingEntropy).toBeLessThan(1.5);
    });

    it("should give higher entropy for diverse openings", () => {
      const result = measureOriginality(FRESH_TEXT);
      const repetitiveResult = measureOriginality(REPETITIVE_OPENING_TEXT);
      expect(result.openingEntropy).toBeGreaterThan(repetitiveResult.openingEntropy);
    });
  });

  describe("overall scoring", () => {
    it("should give lower score to cliche-heavy text", () => {
      const clicheResult = measureOriginality(CLICHE_HEAVY_TEXT);
      const freshResult = measureOriginality(FRESH_TEXT);
      expect(freshResult.score).toBeGreaterThan(clicheResult.score);
    });

    it("should give lower score to repetitive openings", () => {
      const repetitiveResult = measureOriginality(REPETITIVE_OPENING_TEXT);
      const freshResult = measureOriginality(FRESH_TEXT);
      expect(freshResult.score).toBeGreaterThan(repetitiveResult.score);
    });

    it("should return score between 0 and 1", () => {
      for (const text of [CLICHE_HEAVY_TEXT, FRESH_TEXT, REPETITIVE_OPENING_TEXT]) {
        const result = measureOriginality(text);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it("should give fresh text a score above 0.5", () => {
      const result = measureOriginality(FRESH_TEXT);
      expect(result.score).toBeGreaterThan(0.5);
    });

    it("should give cliche-heavy text a score below 0.5", () => {
      const result = measureOriginality(CLICHE_HEAVY_TEXT);
      expect(result.score).toBeLessThan(0.5);
    });
  });

  describe("edge cases", () => {
    it("should handle empty text", () => {
      const result = measureOriginality("");
      expect(result.score).toBe(0);
      expect(result.clicheCount).toBe(0);
      expect(result.typeTokenRatio).toBe(0);
      expect(result.openingEntropy).toBe(0);
      expect(result.clichesFound).toEqual([]);
    });

    it("should handle whitespace-only text", () => {
      const result = measureOriginality("   \n\n   ");
      expect(result.score).toBe(0);
    });

    it("should handle single paragraph text", () => {
      const result = measureOriginality("단일 문단으로 구성된 짧은 텍스트입니다.");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it("should handle very short text", () => {
      const result = measureOriginality("안녕");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("result structure", () => {
    it("should return all required fields", () => {
      const result = measureOriginality(FRESH_TEXT);
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("clicheCount");
      expect(result).toHaveProperty("clicheDensity");
      expect(result).toHaveProperty("typeTokenRatio");
      expect(result).toHaveProperty("openingEntropy");
      expect(result).toHaveProperty("clichesFound");
      expect(Array.isArray(result.clichesFound)).toBe(true);
    });

    it("should return rounded values", () => {
      const result = measureOriginality(FRESH_TEXT);
      // All numeric values should have at most 3 decimal places
      const checkDecimals = (n: number) => {
        const str = n.toString();
        const parts = str.split(".");
        if (parts.length > 1) {
          expect(parts[1].length).toBeLessThanOrEqual(3);
        }
      };
      checkDecimals(result.score);
      checkDecimals(result.clicheDensity);
      checkDecimals(result.typeTokenRatio);
      checkDecimals(result.openingEntropy);
    });
  });
});
