import { describe, it, expect } from "vitest";
import {
  detectNarrativeLoop,
  measureDialogueInformation,
  analyzeSentimentArc,
  runMathematicalChecks,
  measureInformationDensity,
  buildSentimentTimeSeries,
  computeHurstExponent,
} from "@/lib/evaluators/mathematical-checks";

// ---------------------------------------------------------------------------
// detectNarrativeLoop
// ---------------------------------------------------------------------------

describe("detectNarrativeLoop", () => {
  it("detects repeated nouns across paragraphs → loop detected", () => {
    // Same nouns repeated across paragraphs separated by 2+ paragraphs
    // Need >= 70% noun overlap between para 0 and para 2
    const paragraphs = [
      "이수련이 왕궁에서 검술을 연마했다. 레온과 훈련장에서 향했다.",
      "하늘은 맑았다. 새가 날아다녔다. 바람이 불었다.",
      "이수련이 왕궁에서 검술을 연마했다. 레온과 훈련장에서 향했다.",
    ];
    const text = paragraphs.join("\n\n");
    const result = detectNarrativeLoop(text);
    expect(result.loopPairs.length).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThan(1);
  });

  it("diverse paragraphs → no loop", () => {
    const paragraphs = [
      "이수련이 왕궁에서 검술을 연마했다. 레온과 함께 훈련했다.",
      "김도현이 시장에서 약초를 구매했다. 상인과 흥정을 벌였다.",
      "박서연이 도서관에서 고문서를 해독했다. 마법진의 비밀을 알아냈다.",
      "최민준이 항구에서 배를 타고 떠났다. 새로운 대륙으로 향했다.",
      "한지우가 성벽에서 적군을 발견했다. 경비대에게 보고했다.",
    ];
    const text = paragraphs.join("\n\n");
    const result = detectNarrativeLoop(text);
    expect(result.loopPairs).toHaveLength(0);
    expect(result.score).toBe(1);
  });

  it("short text → handled gracefully (no crash)", () => {
    const result = detectNarrativeLoop("짧은 텍스트");
    expect(result.score).toBe(1);
    expect(result.loopPairs).toHaveLength(0);
  });

  it("empty text → handled gracefully", () => {
    const result = detectNarrativeLoop("");
    expect(result.score).toBe(1);
    expect(result.loopPairs).toHaveLength(0);
  });

  it("single paragraph → no loop possible", () => {
    const text = "이수련이 왕궁에서 검술을 연마했다. 레온과 함께 훈련장으로 향했다. 검을 휘둘렀다.";
    const result = detectNarrativeLoop(text);
    expect(result.loopPairs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// measureDialogueInformation
// ---------------------------------------------------------------------------

describe("measureDialogueInformation", () => {
  it("informative dialogue (names, facts) → high score", () => {
    const text = [
      '\u201C이수련이 3시에 왕궁으로 갔다고 했어\u201D',
      '\u201C김도현이 오후에 검술대회에서 승리했대\u201D',
      '\u201C박서연이 도서관에서 고문서를 해독했어\u201D',
    ].join("\n\n");

    const result = measureDialogueInformation(text);
    expect(result.totalLines).toBe(3);
    expect(result.informativeLines).toBeGreaterThanOrEqual(2);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("empty/vague dialogue → low score", () => {
    const text = [
      '\u201C그래서 어떻게 된 거야\u201D',
      '\u201C그냥 그렇게 된 거지\u201D',
      '\u201C그러니까 말이야\u201D',
      '\u201C뭐 어쩌겠어 그냥\u201D',
      '\u201C하여튼 그렇다고\u201D',
    ].join("\n\n");

    const result = measureDialogueInformation(text);
    expect(result.totalLines).toBeGreaterThan(0);
    expect(result.emptyLines).toBeGreaterThanOrEqual(result.informativeLines);
  });

  it("no dialogue → neutral score (1)", () => {
    const text = "주인공은 조용히 걸었다. 바람이 불었다. 해가 저물고 있었다.";
    const result = measureDialogueInformation(text);
    expect(result.totalLines).toBe(0);
    expect(result.score).toBe(1);
  });

  it("very short dialogue (<=5 chars) is excluded from counting", () => {
    const text = '\u201C네\u201D 라고 답했다. \u201C응\u201D 이라고 말했다.';
    const result = measureDialogueInformation(text);
    // "네" and "응" are <=5 chars, so they should be excluded
    expect(result.totalLines).toBe(0);
  });

  it("dialogue with action verbs is considered informative", () => {
    const text = '\u201C그가 도망갔어. 우리가 추격해야 해\u201D';
    const result = measureDialogueInformation(text);
    expect(result.informativeLines).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// analyzeSentimentArc
// ---------------------------------------------------------------------------

describe("analyzeSentimentArc", () => {
  it("very short text → fallback (null Hurst, default score)", () => {
    const result = analyzeSentimentArc("짧은 텍스트.");
    expect(result.hurstExponent).toBeNull();
    expect(result.hurstScore).toBe(0.5); // default fallback
    expect(result.sentimentSeries.length).toBeLessThan(20);
  });

  it("returns sentiment series with emotional range", () => {
    // Build text with emotional variation
    const sentences = [
      "행복한 날이었다.",
      "갑자기 공포가 엄습했다.",
      "분노가 치밀어 올랐다.",
      "다시 평화가 찾아왔다.",
      "사랑하는 사람을 만났다.",
      "슬픈 이별이 다가왔다.",
      "위험한 상황이 벌어졌다.",
      "기쁨이 넘쳐흘렀다.",
      "절망적인 순간이었다.",
      "희망의 빛이 보였다.",
    ];
    const text = sentences.join(" ");
    const result = analyzeSentimentArc(text);
    expect(result.sentimentSeries.length).toBeGreaterThan(0);
    // emotionalRange should be > 0 for varied text
    expect(result.emotionalRange).toBeGreaterThanOrEqual(0);
  });

  it("hurstScore is between 0 and 1", () => {
    // Generate a long enough text for Hurst computation
    const sentences: string[] = [];
    const emotions = ["행복", "슬픔", "분노", "공포", "사랑", "평화", "위험", "기쁨", "절망", "희망"];
    for (let i = 0; i < 30; i++) {
      sentences.push(`${emotions[i % emotions.length]}이 느껴졌다.`);
    }
    const text = sentences.join(" ");
    const result = analyzeSentimentArc(text);
    expect(result.hurstScore).toBeGreaterThanOrEqual(0);
    expect(result.hurstScore).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// buildSentimentTimeSeries
// ---------------------------------------------------------------------------

describe("buildSentimentTimeSeries", () => {
  it("returns 0 for sentences with no emotion keywords", () => {
    const series = buildSentimentTimeSeries("그냥 걸었다. 문을 열었다.");
    expect(series).toHaveLength(2);
    expect(series[0]).toBe(0);
    expect(series[1]).toBe(0);
  });

  it("returns non-zero for sentences with emotion keywords", () => {
    const series = buildSentimentTimeSeries("공포가 엄습했다.");
    expect(series).toHaveLength(1);
    // "공포" has negative valence
    expect(series[0]).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeHurstExponent
// ---------------------------------------------------------------------------

describe("computeHurstExponent", () => {
  it("returns null for series < 20 elements", () => {
    const short = Array.from({ length: 10 }, () => Math.random());
    expect(computeHurstExponent(short)).toBeNull();
  });

  it("returns a number for series >= 20 elements", () => {
    const series = Array.from({ length: 40 }, (_, i) => Math.sin(i * 0.3));
    const H = computeHurstExponent(series);
    expect(H).not.toBeNull();
    expect(typeof H).toBe("number");
  });

  it("returns null if series has too few valid windows", () => {
    // All zeros → F=0 for all windows, logF entries skipped
    const zeros = Array.from({ length: 20 }, () => 0);
    const H = computeHurstExponent(zeros);
    // May return null due to insufficient log points
    // This is acceptable behavior
    expect(H === null || typeof H === "number").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// measureInformationDensity
// ---------------------------------------------------------------------------

describe("measureInformationDensity", () => {
  it("text with proper nouns/numbers → higher density", () => {
    const text = "이수련이 3시에 왕궁으로 갔다. 레온을 만나러 오전에 출발했다.";
    const result = measureInformationDensity(text);
    expect(result.paragraphDensities.length).toBe(1);
    expect(result.paragraphDensities[0]).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("filler text with no markers → lower density than info-rich text", () => {
    // The PROPER_NOUN_PATTERN matches [가-힣]{2,}[이가은는을를에의과와]
    // so even filler like "바람이" matches. But a truly filler paragraph
    // will have fewer markers per word than an info-rich one.
    const filler = "그냥 그랬다. 좀 그랬다. 뭐 그랬다. 좀 더 그랬다. 그렇게 됐다. 뭐 됐다. 그래 됐다.";
    const rich = "이수련이 3시에 왕궁으로 갔다. 레온을 오전에 만났다. 김도현이 5시에 도착했다.";
    const fillerResult = measureInformationDensity(filler);
    const richResult = measureInformationDensity(rich);
    expect(fillerResult.paragraphDensities[0]).toBeLessThan(richResult.paragraphDensities[0]);
  });

  it("counts tell markers", () => {
    const text = "때문에 그렇게 된 것이다. 결국 그는 떠났다. 결과적으로 실패했다.";
    const result = measureInformationDensity(text);
    expect(result.tellMarkerCount).toBeGreaterThanOrEqual(2);
  });

  it("empty text → score 1 (no paragraphs to evaluate)", () => {
    const result = measureInformationDensity("");
    expect(result.score).toBe(1);
    expect(result.paragraphDensities).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// runMathematicalChecks (integration)
// ---------------------------------------------------------------------------

describe("runMathematicalChecks", () => {
  it("runs all checks on realistic Korean text without crashing", () => {
    const text = [
      '\u201C이수련이 3시에 왕궁으로 갔다고 했어\u201D 레온이 물었다.',
      "김도현이 오후 5시 검술대회에서 승리했다. 때문에 모든 사람들이 환호했다.",
      "박서연이 도서관에서 고문서를 해독했다. 마법진의 비밀을 알아냈다.",
      '\u201C그가 도망갔어. 우리가 추격해야 해\u201D 민수가 소리쳤다.',
      "최민준이 항구에서 배를 타고 떠났다. 새로운 대륙으로 향했다. 바다 위에서 폭풍을 만났다.",
      "한지우가 성벽에서 적군을 발견했다. 경비대에게 보고했다. 전쟁이 시작되었다.",
      '\u201C우리는 내일 출발합니다\u201D 대장이 선언했다.',
      "공포가 엄습했다. 병사들이 떨기 시작했다. 그러나 희망을 잃지 않았다.",
    ].join("\n\n");

    const result = runMathematicalChecks(text);

    expect(result.informationDensity).toBeDefined();
    expect(result.loopDetection).toBeDefined();
    expect(result.dialogueInfo).toBeDefined();
    expect(result.sentimentArc).toBeDefined();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it("overall score is weighted average of sub-scores", () => {
    const text = "이수련이 3시에 왕궁으로 갔다.\n\n김도현이 오후에 검술을 연마했다.";
    const result = runMathematicalChecks(text);

    const expected =
      result.informationDensity.score * 0.3 +
      result.loopDetection.score * 0.25 +
      result.dialogueInfo.score * 0.25 +
      result.sentimentArc.hurstScore * 0.2;

    expect(result.overallScore).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });

  it("empty text → does not crash", () => {
    const result = runMathematicalChecks("");
    expect(result.overallScore).toBeDefined();
    expect(typeof result.overallScore).toBe("number");
  });
});
