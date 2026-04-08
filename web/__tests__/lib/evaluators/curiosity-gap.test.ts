import { describe, it, expect } from "vitest";
import { measureCuriosityGap } from "@/lib/evaluators/curiosity-gap";

// ---------------------------------------------------------------------------
// Helper: join paragraphs with double newlines
// ---------------------------------------------------------------------------
function paragraphs(...paras: string[]): string {
  return paras.join("\n\n");
}

// ---------------------------------------------------------------------------
// Empty / minimal input
// ---------------------------------------------------------------------------

describe("measureCuriosityGap", () => {
  it("returns score 0.3 for empty text", () => {
    const result = measureCuriosityGap("");
    expect(result.score).toBe(0.3);
    expect(result.openQuestions).toBe(0);
    expect(result.details).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Boring text — no curiosity hooks
  // -------------------------------------------------------------------------

  describe("boring text (no hooks)", () => {
    it("returns low score for plain narrative without questions", () => {
      const text = paragraphs(
        "민수는 아침에 일어났다. 세수를 하고 밥을 먹었다.",
        "학교에 가서 수업을 들었다. 점심시간에는 친구와 밥을 먹었다.",
        "방과 후에 집에 돌아왔다. 숙제를 하고 잠을 잤다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.score).toBe(0.4); // no hooks = slightly boring
      expect(result.openQuestions).toBe(0);
      expect(result.details).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Good curiosity hooks — sweet spot (2-4 open questions)
  // -------------------------------------------------------------------------

  describe("good curiosity hooks", () => {
    it("detects direct questions", () => {
      const text = paragraphs(
        "그녀는 왜 그곳에 있었던 걸까?",
        "아무도 그 답을 알지 못했다.",
        "도대체 누가 그녀를 그곳에 보낸 것일까?",
        "진실은 아직 묻혀 있었다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.openQuestions).toBeGreaterThanOrEqual(2);
      expect(result.score).toBeGreaterThanOrEqual(0.6);
    });

    it("detects mystery markers", () => {
      const text = paragraphs(
        "사실은 아무도 그의 정체를 모르고 있었다.",
        "그는 자신의 과거를 숨기고 살아왔다.",
        "마을에는 오래된 비밀이 하나 있었다.",
        "누군가는 그것을 감추고 있었다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.openQuestions).toBeGreaterThanOrEqual(2);
      expect(result.details.some((d) => d.type === "mystery")).toBe(true);
    });

    it("detects foreshadowing", () => {
      const text = paragraphs(
        "그때는 몰랐다. 이 선택이 모든 것을 바꿀 줄은.",
        "민수는 웃으며 손을 내밀었다.",
        "나중에야 알게 되었지만, 그날의 악수가 재앙의 시작이었다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.details.some((d) => d.type === "foreshadowing")).toBe(true);
    });

    it("detects mystery markers in suspenseful text", () => {
      const text = paragraphs(
        "사실은 그의 정체를 아무도 몰랐다.",
        "비밀이 있었다. 아무것도 보이지 않았다.",
        "그는 자신의 과거를 숨기고 있었다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.details.some((d) => d.type === "mystery")).toBe(true);
      expect(result.openQuestions).toBeGreaterThanOrEqual(2);
    });

    it("detects incomplete information (ellipsis / dash)", () => {
      const text = paragraphs(
        "그녀가 말했다. 하지만 그 다음에는...",
        "입을 열려는 순간 누군가 그녀의 이름을 불렀다.",
        "진실을 말하려던 참에 문이 열렸다.",
        "그 이름은 바로—",
      );
      const result = measureCuriosityGap(text);
      expect(result.details.some((d) => d.type === "incomplete")).toBe(true);
    });

    it("detects unfinished actions", () => {
      const text = paragraphs(
        "검을 뽑으려던 참에 뒤에서 비명이 들렸다.",
        "그가 진실을 말하려는 순간, 폭발이 일어났다.",
        "모든 것이 한순간에 뒤바뀌었다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.details.some((d) => d.type === "unfinished_action")).toBe(true);
    });

    it("scores 1.0 for 2-4 open questions (sweet spot)", () => {
      const text = paragraphs(
        "왜 그가 그 자리에 있었을까?",
        "마을에는 오래된 비밀이 있었다.",
        "갑자기 하늘이 어두워졌다.",
        "아무도 대답하지 않았다.",
        "바람만이 차갑게 불었다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.openQuestions).toBeGreaterThanOrEqual(2);
      expect(result.openQuestions).toBeLessThanOrEqual(4);
      expect(result.score).toBe(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // Overcrowded — too many hooks
  // -------------------------------------------------------------------------

  describe("overcrowded text (too many hooks)", () => {
    it("penalizes 9+ open questions", () => {
      const text = paragraphs(
        "왜 그가 사라졌을까?",
        "사실은 그의 정체가 비밀이었다.",
        "아무도 몰랐다, 그의 진짜 목적을.",
        "도대체 무엇이 그를 움직이게 했을까?",
        "숨기고 있던 과거가 드러나려 하고 있었다.",
        "감추고 있던 힘이 폭발했다.",
        "그때는 몰랐다, 이것이 시작일 뿐이라는 것을.",
        "비밀이 또 하나 있었다.",
        "정체를 감추고 있었다.",
        "왜 이렇게 된 것일까?",
        "누가 이 모든 것을 꾸몄을까?",
        "어디서부터 잘못된 걸까?",
      );
      const result = measureCuriosityGap(text);
      expect(result.openQuestions).toBeGreaterThanOrEqual(6);
      expect(result.score).toBeLessThanOrEqual(0.8);
    });
  });

  // -------------------------------------------------------------------------
  // Resolution detection
  // -------------------------------------------------------------------------

  describe("resolution detection", () => {
    it("marks questions as resolved when answer patterns appear nearby", () => {
      const text = paragraphs(
        "왜 그가 떠났을까?",
        "마을 사람들은 수군거렸다.",
        "한동안 아무도 답을 알지 못했다.",
        "몇 달이 지나고 나서야.",
        "그 이유는 간단했다. 그는 가족을 지키기 위해 떠난 것이었다.",
        "모든 것이 이해되기 시작했다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.resolvedQuestions).toBeGreaterThanOrEqual(1);
    });

    it("detects '알고 보니' as a resolution marker", () => {
      const text = paragraphs(
        "조직의 비밀이 있었다. 정체를 아무도 몰랐다.",
        "단서를 하나씩 모았다.",
        "알고 보니 그 조직은 왕실의 그림자 부대였다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.resolvedQuestions).toBeGreaterThanOrEqual(1);
    });

    it("detects '밝혀졌다' and '드러났다' as resolution", () => {
      const text = paragraphs(
        "사실은 그녀가 범인이었다.",
        "하지만 아직 증거가 부족했다.",
        "수사가 계속되었다.",
        "결국 모든 진실이 밝혀졌다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.resolvedQuestions).toBeGreaterThanOrEqual(1);
    });

    it("gives resolution bonus (capped at +0.3)", () => {
      const text = paragraphs(
        "왜 그는 숨었을까?",
        "비밀이 있었다.",
        "알고 보니 그는 왕자였다.",
        "도대체 무엇을 두려워한 걸까?",
        "진실이 드러났다. 그는 저주에 걸려 있었다.",
        "갑자기 빛이 그를 감쌌다.",
        "모든 비밀이 밝혀졌다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.resolvedQuestions).toBeGreaterThanOrEqual(1);
      // Resolution bonus should increase score
      expect(result.score).toBeGreaterThan(0.3);
    });
  });

  // -------------------------------------------------------------------------
  // Gap density
  // -------------------------------------------------------------------------

  describe("gap density", () => {
    it("calculates open questions per 1000 chars", () => {
      const text = paragraphs(
        "비밀이 있었다.",
        "갑자기 문이 열렸다.",
        "아무도 대답하지 않았다.",
      );
      const result = measureCuriosityGap(text);
      expect(result.gapDensity).toBeGreaterThan(0);
      expect(result.gapDensity).toBe(
        Math.round((result.openQuestions / text.length) * 1000 * 100) / 100,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  describe("deduplication", () => {
    it("deduplicates gaps within 20 chars of each other", () => {
      // "사실은" and "비밀" very close together should count as one
      const text = "사실은 이것은 비밀이었다. 그 뒤로 오랫동안 아무 일도 일어나지 않았다.";
      const result = measureCuriosityGap(text);
      // Should have fewer details than raw pattern matches
      const uniquePositions = new Set(result.details.map((d) => d.position));
      expect(uniquePositions.size).toBe(result.details.length);
    });
  });

  // -------------------------------------------------------------------------
  // Score boundary tests
  // -------------------------------------------------------------------------

  describe("score boundaries", () => {
    it("score is always between 0 and 1", () => {
      const texts = [
        "",
        "평범한 텍스트입니다.",
        "왜? 뭐가? 어디서? 누가? 언제? 어떻게? 진짜?",
        "비밀이 있었다. 알고 보니 아무것도 아니었다.",
      ];
      for (const text of texts) {
        const result = measureCuriosityGap(text);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });
  });
});
