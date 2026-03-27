import { describe, it, expect } from "vitest";
import { measureReadabilityPacing } from "@/lib/evaluators/readability-pacing";

// ---------------------------------------------------------------------------
// Focus Stability
// ---------------------------------------------------------------------------

describe("Focus Stability", () => {
  it("same subject across paragraphs → high focus stability", () => {
    const text = [
      "윤세라는 조용히 문서를 읽었다. 봉인된 기록이었다.",
      "세라는 눈을 가늘게 떴다. 뭔가 이상했다.",
      "세라는 손끝으로 문장을 따라갔다. 핵심이 빠져 있었다.",
      "세라는 고개를 들었다. 창밖은 어두워지고 있었다.",
    ].join("\n\n");

    const result = measureReadabilityPacing(text);
    expect(result.focusStability).toBeGreaterThanOrEqual(0.7);
  });

  it("subject changes every paragraph → low focus stability (camera whiplash)", () => {
    const text = [
      "윤세라는 독을 확인했다. 치명적이었다.",
      "암살자는 지붕 위에서 기다렸다. 시간이 없었다.",
      "문서는 바닥에 흩어져 있었다. 피가 묻어 있었다.",
      "빈자리는 누군가의 부재를 알렸다. 의자만 남아 있었다.",
      "경비병은 문 앞에 서 있었다. 아무 일도 없었다는 듯.",
    ].join("\n\n");

    const result = measureReadabilityPacing(text);
    expect(result.focusStability).toBeLessThan(0.7);
  });

  it("pronoun continuity (그녀는) maintains focus", () => {
    const text = [
      "그녀는 천천히 걸었다. 발소리가 울렸다.",
      "그녀는 멈추어 섰다. 이상한 기운이 느껴졌다.",
      "그녀는 뒤를 돌아보았다. 아무도 없었다.",
    ].join("\n\n");

    const result = measureReadabilityPacing(text);
    expect(result.focusStability).toBeGreaterThanOrEqual(0.7);
  });
});

// ---------------------------------------------------------------------------
// Information Spacing
// ---------------------------------------------------------------------------

describe("Information Spacing", () => {
  it("event→reaction→event pattern → high score", () => {
    const text = [
      "문이 열렸다. 안에서 차가운 바람이 불어왔다.",
      "그는 숨을 삼켰다. 가슴이 조여왔다. 천천히 마음을 가라앉혔다.",
      "칼이 날아왔다. 벽에 꽂혔다. 먼지가 피어올랐다.",
      "그는 멍하니 칼을 바라보았다. 생각했다. 누가 던진 걸까.",
      "폭발이 터졌다. 건물이 흔들렸다.",
    ].join("\n\n");

    const result = measureReadabilityPacing(text);
    expect(result.informationSpacing).toBeGreaterThanOrEqual(0.6);
  });

  it("consecutive events without breathing room → low score", () => {
    const text = [
      "문이 열렸다. 적이 나타났다.",
      "칼이 날아왔다. 벽이 깨졌다.",
      "폭발이 터졌다. 지붕이 무너졌다.",
      "불이 번졌다. 연기가 피어올랐다.",
      "적이 달려왔다. 칼을 뽑았다.",
    ].join("\n\n");

    const result = measureReadabilityPacing(text);
    expect(result.informationSpacing).toBeLessThan(0.7);
  });
});

// ---------------------------------------------------------------------------
// Causal Explicitness
// ---------------------------------------------------------------------------

describe("Causal Explicitness", () => {
  it("causal explanations present → high score", () => {
    const text = [
      "소리가 들렸다. 그래서 그는 몸을 숨겼다. 적의 발소리 때문에 긴장이 높아졌다.",
      "냄새가 났다. 피 냄새였다. 그는 깨달았다. 누군가 다쳤다는 뜻이었다.",
      "그림자가 움직였다. 그는 눈치챘다. 적이 오고 있었기 때문에 서둘러야 했다.",
    ].join("\n\n");

    const result = measureReadabilityPacing(text);
    expect(result.causalExplicitness).toBeGreaterThanOrEqual(0.7);
  });

  it("phenomenon-only descriptions without explanation → low score", () => {
    const text = [
      "소리가 울렸다. 바람이 불었다. 빛이 번쩍였다.",
      "냄새가 퍼졌다. 연기가 피어올랐다. 그림자가 길어졌다.",
      "시선이 느껴졌다. 기운이 흘렀다. 냉기가 스며들었다.",
      "소리가 다시 들렸다. 빛이 사라졌다. 안개가 짙어졌다.",
    ].join("\n\n");

    const result = measureReadabilityPacing(text);
    expect(result.causalExplicitness).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Overall Integration
// ---------------------------------------------------------------------------

describe("measureReadabilityPacing overall", () => {
  it("returns score between 0 and 1", () => {
    const text = "윤세라는 앞으로 걸었다.\n\n그녀는 문을 열었다.";
    const result = measureReadabilityPacing(text);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("well-paced text scores higher than poorly-paced text", () => {
    const wellPaced = [
      "윤세라는 문을 열었다. 안에서 차가운 공기가 흘러나왔다.",
      "세라는 숨을 삼켰다. 가슴이 조여왔다. 왜 이렇게 춥지? 생각했다.",
      "세라는 천천히 방 안으로 들어갔다. 바닥에 문서가 흩어져 있었다.",
      "세라는 깨달았다. 누군가 먼저 다녀간 것이다. 그래서 이렇게 어질러진 것이었다.",
    ].join("\n\n");

    const poorlyPaced = [
      "윤세라는 문을 열었다. 칼이 날아왔다.",
      "암살자는 지붕에서 뛰어내렸다. 폭발이 터졌다.",
      "소리가 울렸다. 빛이 번쩍였다. 냄새가 퍼졌다.",
      "경비병은 달려왔다. 문이 닫혔다. 연기가 피어올랐다.",
      "그림자가 움직였다. 시선이 느껴졌다. 기운이 흘렀다.",
    ].join("\n\n");

    const wellResult = measureReadabilityPacing(wellPaced);
    const poorResult = measureReadabilityPacing(poorlyPaced);
    expect(wellResult.score).toBeGreaterThan(poorResult.score);
  });

  it("handles empty text gracefully", () => {
    const result = measureReadabilityPacing("");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("handles single paragraph gracefully", () => {
    const result = measureReadabilityPacing("윤세라는 조용히 걸었다. 길은 어두웠다.");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("details contain expected fields", () => {
    const text = "윤세라는 앞으로 걸었다.\n\n그녀는 문을 열었다.\n\n그는 기다렸다.";
    const result = measureReadabilityPacing(text);
    expect(result.details).toHaveProperty("focusShiftsPerParagraph");
    expect(result.details).toHaveProperty("eventToReactionRatio");
    expect(result.details).toHaveProperty("causalToDescriptiveRatio");
    expect(result.details).toHaveProperty("missingSceneBreaks");
    expect(result.details).toHaveProperty("avgSentenceLength");
    expect(result.details).toHaveProperty("longSentenceRatio");
  });

  it("result includes sceneBreakScore and sentenceComplexityScore", () => {
    const text = "윤세라는 앞으로 걸었다.\n\n그녀는 문을 열었다.";
    const result = measureReadabilityPacing(text);
    expect(result).toHaveProperty("sceneBreakScore");
    expect(result).toHaveProperty("sentenceComplexityScore");
    expect(result.sceneBreakScore).toBeGreaterThanOrEqual(0);
    expect(result.sceneBreakScore).toBeLessThanOrEqual(1);
    expect(result.sentenceComplexityScore).toBeGreaterThanOrEqual(0);
    expect(result.sentenceComplexityScore).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Scene Break Detection
// ---------------------------------------------------------------------------

describe("Scene Break Detection", () => {
  it("scene with *** separator between location changes → high score", () => {
    const text = [
      "윤세라는 서재에서 문서를 읽었다. 뭔가 이상했다.",
      "",
      "***",
      "",
      "강민호는 광장에서 검을 뽑았다. 적이 다가왔다.",
    ].join("\n");

    const result = measureReadabilityPacing(text);
    expect(result.sceneBreakScore).toBeGreaterThanOrEqual(0.9);
  });

  it("location+character change without separator → lower score", () => {
    const text = [
      "윤세라는 서재에서 문서를 읽었다. 뭔가 이상했다.",
      "",
      "강민호는 광장에서 검을 뽑았다. 적이 다가왔다.",
    ].join("\n");

    const result = measureReadabilityPacing(text);
    expect(result.sceneBreakScore).toBeLessThan(1.0);
    expect(result.details.missingSceneBreaks).toBeGreaterThanOrEqual(1);
  });

  it("same characters and location → no penalty even without separator", () => {
    const text = [
      "윤세라는 서재에서 문서를 읽었다.",
      "",
      "세라는 서재 창문을 열었다. 바람이 불었다.",
    ].join("\n");

    const result = measureReadabilityPacing(text);
    expect(result.sceneBreakScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Sentence Complexity
// ---------------------------------------------------------------------------

describe("Sentence Complexity", () => {
  it("short simple sentences → high score", () => {
    const text = "검을 뽑았다. 적이 왔다. 바람이 불었다. 칼을 휘둘렀다. 피가 튀었다.";
    const result = measureReadabilityPacing(text);
    expect(result.sentenceComplexityScore).toBeGreaterThanOrEqual(0.7);
  });

  it("very long compound sentences → lower score", () => {
    const text = [
      "그는 오랜 시간 동안 생각에 잠겨 있었는데 그러는 동안에도 바깥에서는 끊임없이 소리가 들려왔고 그 소리는 점점 가까워지면서 마치 누군가가 다가오는 것처럼 느껴졌다.",
      "그녀는 긴 복도를 걸어가면서 하지만 뒤에서 누군가 따라오는 기척을 느꼈고 그런데 돌아보았을 때 아무도 없었기 때문에 더욱 불안해졌다.",
      "그는 문을 열었는데 안에서 차가운 바람이 불어왔고 그러면서도 이상하게 따뜻한 빛이 보였으며 그 빛은 점점 강해지면서 방 전체를 감싸기 시작했다.",
    ].join("\n\n");
    const result = measureReadabilityPacing(text);
    expect(result.sentenceComplexityScore).toBeLessThan(0.7);
  });

  it("avg sentence length in details is a number", () => {
    const text = "짧은 문장이다. 또 다른 문장이다.";
    const result = measureReadabilityPacing(text);
    expect(typeof result.details.avgSentenceLength).toBe("number");
    expect(typeof result.details.longSentenceRatio).toBe("number");
  });
});
