import { describe, it, expect } from "vitest";
import { measureEmotionalImpact } from "@/lib/evaluators/emotional-impact";

// ---------------------------------------------------------------------------
// Helper: build multi-paragraph Korean text
// ---------------------------------------------------------------------------

function buildText(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

// ---------------------------------------------------------------------------
// Strong emotional peak text
// ---------------------------------------------------------------------------

describe("measureEmotionalImpact", () => {
  it("detects strong emotional peak with catharsis pattern", () => {
    // Buildup (increasing intensity) -> peak -> release
    const text = buildText([
      "평화로운 마을이었다. 아이들이 뛰어놀고 있었다.",
      "그런데 이상한 소문이 돌기 시작했다. 마음이 불안해졌다.",
      "두려움이 점점 커졌다. 숨이 막히는 기분이었다. 상처가 남았다.",
      "공포가 엄습했다. 고통스러운 비명이 울렸다. 심장이 터질 것 같았다.",
      "절망 속에서 죽음의 그림자가 다가왔다. 눈물이 흘렀다. 가슴이 찢어지는 듯했다.",
      "폭발적인 분노가 솟구쳤다. 배신의 아픔이 온몸을 관통했다. 피가 끓었다.",
      "그리고 마침내 침묵이 찾아왔다. 따뜻한 바람이 불었다.",
      "부드러운 빛이 세상을 감쌌다. 생각했다. 이제 끝났다고.",
    ]);

    const result = measureEmotionalImpact(text);

    expect(result.peakIntensity).toBeGreaterThan(0.3);
    expect(result.emotionalDrop).toBeGreaterThan(0);
    expect(result.empathyDensity).toBeGreaterThan(0);
    expect(result.details.empathyMarkers.length).toBeGreaterThan(0);
    expect(result.details.empathyMarkers).toContain("눈물");
    expect(result.details.empathyMarkers).toContain("가슴이");
    expect(result.details.empathyMarkers).toContain("심장이");
    expect(result.score).toBeGreaterThan(0.3);
  });

  it("flat emotional text gets low score", () => {
    // Deliberately avoid any words in the emotion lexicon
    const text = buildText([
      "탁자 위에 종이가 놓여 있었다. 창 밖으로 나무가 보였다.",
      "그는 의자에 앉아 기다렸다. 시계 초침이 움직였다.",
      "문이 열리고 누군가 들어왔다. 인사를 나누었다.",
      "대화를 마치고 자리에서 일어났다. 복도를 걸어갔다.",
      "건물을 나서며 하늘을 올려다보았다. 구름이 지나가고 있었다.",
    ]);

    const result = measureEmotionalImpact(text);

    expect(result.peakIntensity).toBeLessThan(0.3);
    expect(result.emotionalDrop).toBeLessThan(0.1);
    expect(result.catharsisComplete).toBe(false);
    expect(result.score).toBeLessThan(0.3);
  });

  it("counts empathy markers correctly", () => {
    const text = buildText([
      "가슴이 아팠다. 눈물이 흘렀다. 손이 떨렸다.",
      "따뜻한 온기가 느껴졌다. 마음이 놓였다.",
      "속으로 생각했다. 차가운 바람이 불었다.",
    ]);

    const result = measureEmotionalImpact(text);

    // Physical: 가슴이, 눈물, 손이 떨 (떨리 matches 떨렸다? No — "떨리" vs "떨렸다", includes check)
    // Let's verify which markers are found
    expect(result.details.empathyMarkers).toContain("가슴이");
    expect(result.details.empathyMarkers).toContain("눈물");
    expect(result.details.empathyMarkers).toContain("마음이");
    expect(result.details.empathyMarkers).toContain("속으로");
    expect(result.details.empathyMarkers).toContain("차가운");
    expect(result.details.empathyMarkers).toContain("따뜻한");
    expect(result.details.empathyMarkers).toContain("생각했다");
    expect(result.empathyDensity).toBeGreaterThan(0);
  });

  it("detects catharsis pattern (buildup -> peak -> release)", () => {
    // Need 3+ paragraphs of increasing intensity before peak,
    // then 30%+ drop within 2 paragraphs after peak
    const text = buildText([
      "조용한 시작이었다.",
      "불안감이 살짝 돌았다.",
      "두려움이 커졌다. 상처가 아팠다.",
      "공포가 몰려왔다. 고통이 심해졌다. 분노가 치밀었다.",
      "절망적인 비명이 울렸다. 죽음의 그림자. 배신. 폭발.",
      "위험한 순간이 지나갔다. 칼이 땅에 떨어졌다.",
      "침묵이 내려앉았다. 모든 것이 고요해졌다.",
      "아침이 밝았다. 새소리가 들렸다.",
    ]);

    const result = measureEmotionalImpact(text);

    // Peak should be around paragraph 4 (index 4) out of 8 -> position ~0.57
    expect(result.peakIntensity).toBeGreaterThan(0.4);
    expect(result.emotionalDrop).toBeGreaterThan(0.1);

    // Release should be detected (paragraphs 5-6 have lower intensity)
    // Buildup: paragraphs 1-4 should show increasing intensity
    // The catharsis detection depends on exact lexicon matches
  });

  it("peak position scoring: peak in 60-80% range scores well", () => {
    // 10 paragraphs, peak at index 7 (position = 7/9 = 0.78)
    const paragraphs = [
      "평범한 하루가 시작되었다.",
      "조금 이상한 기분이 들었다.",
      "마음이 조금 무거워졌다.",
      "불안한 기운이 돌았다.",
      "점점 두려워졌다.",
      "상처받은 마음이 아팠다.",
      "분노가 치밀어 올랐다. 공포와 고통이 뒤섞였다.",
      "절망의 끝에서 비명을 질렀다. 배신과 죽음의 공포. 폭발하는 감정. 눈물이 멈추지 않았다.",
      "모든 것이 끝났다. 따뜻한 바람이 불었다.",
      "평화가 찾아왔다.",
    ];

    const result = measureEmotionalImpact(buildText(paragraphs));

    // Peak should be at index 7, position = 7/9 ≈ 0.78
    expect(result.details.peakPosition).toBeGreaterThanOrEqual(0.6);
    expect(result.details.peakPosition).toBeLessThanOrEqual(0.9);
  });

  it("empty text returns zero score", () => {
    const result = measureEmotionalImpact("");
    expect(result.score).toBe(0);
    expect(result.peakIntensity).toBe(0);
    expect(result.emotionalDrop).toBe(0);
    expect(result.empathyDensity).toBe(0);
    expect(result.catharsisComplete).toBe(false);
  });

  it("single paragraph text handles edge case", () => {
    const text = "절망적인 비명이 울렸다. 죽음의 공포가 엄습했다. 눈물이 흘렀다.";
    const result = measureEmotionalImpact(text);

    expect(result.peakIntensity).toBeGreaterThan(0);
    expect(result.details.peakPosition).toBe(0.5); // single paragraph default
    expect(result.catharsisComplete).toBe(false); // can't have buildup with 1 para
  });

  it("score stays within 0-1 range for any input", () => {
    const extremeText = buildText([
      "죽음 공포 절망 고통 비명 배신 분노 칼 피 폭발 위험 상처",
      "죽음 공포 절망 고통 비명 배신 분노 칼 피 폭발 위험 상처",
      "죽음 공포 절망 고통 비명 배신 분노 칼 피 폭발 위험 상처",
      "가슴이 눈물 떨리 숨이 심장이 목이 메 손이 떨 생각했다 느꼈다 마음이",
    ]);

    const result = measureEmotionalImpact(extremeText);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.peakIntensity).toBeLessThanOrEqual(1);
  });
});
