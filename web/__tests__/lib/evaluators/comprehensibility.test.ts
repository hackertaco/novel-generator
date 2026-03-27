import { describe, it, expect } from "vitest";
import {
  measureComprehensibility,
  detectRole,
  splitSentences,
  buildEntityGrid,
  computeEntityCoherence,
  computeCenteringCoherence,
  computeSubjectOmissionScore,
  computeAnaphoraClarity,
  hasExplicitSubject,
  findPreferredCenter,
  classifyCenteringTransition,
  type EntityRole,
} from "../../../src/lib/evaluators/comprehensibility";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const chars = [
  { name: "수아", gender: "female" },
  { name: "민준", gender: "male" },
];

const charsNoGender = [{ name: "수아" }, { name: "민준" }];

// ---------------------------------------------------------------------------
// splitSentences
// ---------------------------------------------------------------------------

describe("splitSentences", () => {
  it("splits Korean text on sentence-ending punctuation", () => {
    const text = "수아는 달려갔다. 민준이 검을 뽑았다. 바람이 불었다.";
    const sentences = splitSentences(text);
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toContain("수아");
    expect(sentences[1]).toContain("민준");
  });

  it("removes dialogue before splitting", () => {
    const text = '수아는 말했다. "잘 가." 민준이 고개를 끄덕였다.';
    const sentences = splitSentences(text);
    // Dialogue removed, so "잘 가." is stripped
    expect(sentences.some((s) => s.includes("잘 가"))).toBe(false);
  });

  it("filters out very short fragments", () => {
    const text = "수아는 갔다. 아. 민준이 왔다.";
    const sentences = splitSentences(text);
    // "아." is 2 chars, should be filtered
    expect(sentences.every((s) => s.length > 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectRole
// ---------------------------------------------------------------------------

describe("detectRole", () => {
  it("detects subject role with 은/는", () => {
    expect(detectRole("수아는 달려갔다.", "수아")).toBe("S");
    expect(detectRole("민준은 검을 뽑았다.", "민준")).toBe("S");
  });

  it("detects subject role with 이/가", () => {
    expect(detectRole("수아가 외쳤다.", "수아")).toBe("S");
    expect(detectRole("민준이 웃었다.", "민준")).toBe("S");
  });

  it("detects object role with 을/를", () => {
    expect(detectRole("수아를 바라봤다.", "수아")).toBe("O");
    expect(detectRole("민준을 불렀다.", "민준")).toBe("O");
  });

  it("detects object role with 에게/한테", () => {
    expect(detectRole("수아에게 말했다.", "수아")).toBe("O");
    expect(detectRole("민준한테 던졌다.", "민준")).toBe("O");
  });

  it("detects other mention (X) when no particle", () => {
    expect(detectRole("수아 옆에 앉았다.", "수아")).toBe("X");
  });

  it("returns absent (-) when character not mentioned", () => {
    expect(detectRole("바람이 불었다.", "수아")).toBe("-");
  });
});

// ---------------------------------------------------------------------------
// Entity Grid
// ---------------------------------------------------------------------------

describe("Entity Grid", () => {
  it("builds correct grid for simple sentences", () => {
    const sentences = [
      "수아는 달려갔다.",
      "수아가 검을 뽑았다.",
      "민준이 나타났다.",
    ];
    const grid = buildEntityGrid(sentences, chars);
    expect(grid).toHaveLength(3);
    // 수아: S, S, -
    expect(grid[0][0]).toBe("S");
    expect(grid[1][0]).toBe("S");
    expect(grid[2][0]).toBe("-");
    // 민준: -, -, S
    expect(grid[0][1]).toBe("-");
    expect(grid[1][1]).toBe("-");
    expect(grid[2][1]).toBe("S");
  });

  it("computes high coherence for consistent subject focus", () => {
    // 수아 stays as subject throughout
    const grid: EntityRole[][] = [
      ["S", "-"],
      ["S", "-"],
      ["S", "O"],
      ["S", "O"],
    ];
    const score = computeEntityCoherence(grid);
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("computes low coherence for fragmented entity grid", () => {
    // Characters appear and disappear randomly
    const grid: EntityRole[][] = [
      ["S", "-"],
      ["-", "S"],
      ["S", "-"],
      ["-", "S"],
      ["S", "-"],
    ];
    const score = computeEntityCoherence(grid);
    // Every transition is bad (S→- or -→S)
    expect(score).toBe(0);
  });

  it("returns 1.0 for single sentence", () => {
    const grid: EntityRole[][] = [["S", "O"]];
    expect(computeEntityCoherence(grid)).toBe(1.0);
  });

  it("returns 1.0 for no characters", () => {
    const grid: EntityRole[][] = [];
    expect(computeEntityCoherence(grid)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Centering Theory
// ---------------------------------------------------------------------------

describe("Centering Theory", () => {
  it("findPreferredCenter picks most salient entity", () => {
    // 은/는 has salience 1 (highest)
    expect(findPreferredCenter("수아는 민준을 바라봤다.", chars)).toBe("수아");
    // 이/가 has salience 2
    expect(findPreferredCenter("민준이 수아를 불렀다.", chars)).toBe("민준");
  });

  it("classifies CONTINUE transition", () => {
    expect(classifyCenteringTransition("수아", "수아", "수아")).toBe("CONTINUE");
  });

  it("classifies RETAIN transition", () => {
    expect(classifyCenteringTransition("수아", "민준", "수아")).toBe("RETAIN");
  });

  it("classifies SMOOTH_SHIFT transition", () => {
    expect(classifyCenteringTransition("민준", "민준", "수아")).toBe(
      "SMOOTH_SHIFT",
    );
  });

  it("classifies ROUGH_SHIFT transition", () => {
    expect(classifyCenteringTransition("민준", "수아", "수아")).toBe(
      "ROUGH_SHIFT",
    );
  });

  it("treats null centers as ROUGH_SHIFT", () => {
    expect(classifyCenteringTransition(null, "수아", "수아")).toBe(
      "ROUGH_SHIFT",
    );
    expect(classifyCenteringTransition("수아", null, "수아")).toBe(
      "ROUGH_SHIFT",
    );
  });

  it("computes high centering coherence for focused text", () => {
    const sentences = [
      "수아는 길을 걸었다.",
      "수아는 하늘을 올려다봤다.",
      "수아는 미소를 지었다.",
    ];
    const result = computeCenteringCoherence(sentences, chars);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.roughShiftCount).toBeLessThanOrEqual(1);
  });

  it("computes low centering coherence for scattered focus", () => {
    const sentences = [
      "수아는 길을 걸었다.",
      "갑자기 비가 내렸다.", // no character = rough shift
      "민준이 우산을 폈다.",
      "구름이 낮게 깔렸다.", // no character
      "수아가 뛰어갔다.",
    ];
    const result = computeCenteringCoherence(sentences, chars);
    expect(result.roughShiftCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Subject Omission Tracking
// ---------------------------------------------------------------------------

describe("Subject Omission Tracking", () => {
  it("hasExplicitSubject detects character + particle", () => {
    expect(hasExplicitSubject("수아는 달려갔다.", ["수아", "민준"])).toBe(true);
    expect(hasExplicitSubject("민준이 외쳤다.", ["수아", "민준"])).toBe(true);
  });

  it("hasExplicitSubject detects general noun + particle", () => {
    expect(hasExplicitSubject("바람이 불었다.", [])).toBe(true);
    expect(hasExplicitSubject("사람들은 모여들었다.", [])).toBe(true);
  });

  it("hasExplicitSubject returns false for no subject", () => {
    // Pure verb phrase, no subject marker
    expect(hasExplicitSubject("달려갔다.", [])).toBe(false);
    expect(hasExplicitSubject("검을 뽑았다.", [])).toBe(false);
  });

  it("gives high score when subjects are explicit", () => {
    const sentences = [
      "수아는 달려갔다.",
      "수아가 검을 뽑았다.",
      "민준은 뒤를 돌아봤다.",
      "수아는 공격했다.",
    ];
    const result = computeSubjectOmissionScore(sentences, ["수아", "민준"]);
    expect(result.score).toBe(1.0);
    expect(result.streakCount).toBe(0);
  });

  it("penalizes streaks of 3+ omissions", () => {
    const sentences = [
      "수아는 달려갔다.", // has subject
      "검을 뽑았다.", // no subject
      "돌아봤다.", // no subject
      "한숨을 쉬었다.", // no subject → streak of 3
      "민준은 나타났다.", // has subject
    ];
    const result = computeSubjectOmissionScore(sentences, ["수아", "민준"]);
    expect(result.streakCount).toBe(1);
    expect(result.score).toBeLessThan(1.0);
  });

  it("does not penalize short omission streaks (1-2)", () => {
    const sentences = [
      "수아는 달려갔다.", // has subject
      "검을 뽑았다.", // no subject
      "돌아봤다.", // no subject → streak of 2, OK
      "민준은 나타났다.", // has subject
    ];
    const result = computeSubjectOmissionScore(sentences, ["수아", "민준"]);
    expect(result.streakCount).toBe(0);
    expect(result.score).toBe(1.0);
  });

  it("detects trailing omission streak", () => {
    const sentences = [
      "수아는 달려갔다.",
      "뛰어올랐다.",
      "소리를 질렀다.",
      "검을 휘둘렀다.",
    ];
    const result = computeSubjectOmissionScore(sentences, ["수아", "민준"]);
    expect(result.streakCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Anaphora Resolution
// ---------------------------------------------------------------------------

describe("Anaphora Resolution", () => {
  it("resolves pronoun with single candidate (clear)", () => {
    const sentences = [
      "수아는 길을 걸었다.",
      "민준이 나타났다.",
      "그녀는 미소를 지었다.", // 그녀 → only female = 수아
    ];
    const result = computeAnaphoraClarity(sentences, chars);
    expect(result.unresolvedPronouns).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it("detects unresolved pronoun (no candidate in lookback)", () => {
    const sentences = [
      "바람이 불었다.",
      "구름이 흘렀다.",
      "그녀는 미소를 지었다.", // no female character mentioned in lookback
    ];
    const result = computeAnaphoraClarity(sentences, chars);
    expect(result.unresolvedPronouns).toBe(1);
    expect(result.score).toBeLessThan(1.0);
  });

  it("detects ambiguous pronoun (multiple candidates)", () => {
    const sentences = [
      "수아는 길을 걸었다.",
      "민준이 나타났다.",
      "그는 웃었다.", // 그 = male, 민준 is only male → should be clear
    ];
    const result = computeAnaphoraClarity(sentences, chars);
    // Only one male character, so should resolve clearly
    expect(result.ambiguousPronouns).toBe(0);
  });

  it("detects ambiguity with multiple same-gender characters", () => {
    const multiMale = [
      { name: "민준", gender: "male" as const },
      { name: "지호", gender: "male" as const },
    ];
    const sentences = [
      "민준이 길을 걸었다.",
      "지호가 나타났다.",
      "그는 웃었다.", // 그 = male, both 민준 and 지호 are male → ambiguous
    ];
    const result = computeAnaphoraClarity(sentences, multiMale);
    expect(result.ambiguousPronouns).toBe(1);
  });

  it("returns perfect score when no pronouns used", () => {
    const sentences = [
      "수아는 길을 걸었다.",
      "민준이 나타났다.",
      "수아가 웃었다.",
    ];
    const result = computeAnaphoraClarity(sentences, chars);
    expect(result.score).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Integration: measureComprehensibility
// ---------------------------------------------------------------------------

describe("measureComprehensibility", () => {
  it("gives high score for clear, focused text", () => {
    const text = [
      "수아는 숲 속을 걸었다.",
      "수아는 나뭇가지를 꺾었다.",
      "수아가 하늘을 올려다봤다.",
      "수아는 깊은 숨을 내쉬었다.",
      "민준이 뒤에서 나타났다.",
      "민준은 수아에게 손을 흔들었다.",
    ].join(" ");

    const result = measureComprehensibility(text, chars);
    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(result.entityCoherence).toBeGreaterThanOrEqual(0.5);
  });

  it("gives low score for confusing text", () => {
    const text = [
      "수아는 달려갔다.",
      "검을 뽑았다.",
      "돌아봤다.",
      "한숨을 쉬었다.",
      "그녀는 소리쳤다.",
      "민준이 갑자기 나타났다.",
      "그는 웃었다.",
      "뛰어올랐다.",
      "쓰러졌다.",
      "눈을 감았다.",
    ].join(" ");

    const charsNoGender = [{ name: "수아" }, { name: "민준" }];
    const result = measureComprehensibility(text, charsNoGender);
    // Subject omissions + scattered entity grid should lower the score
    expect(result.details.subjectOmissionStreaks).toBeGreaterThanOrEqual(1);
  });

  it("returns all sub-scores between 0 and 1", () => {
    const text = "수아는 걸었다. 민준이 나타났다. 수아가 놀랐다.";
    const result = measureComprehensibility(text, chars);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.entityCoherence).toBeGreaterThanOrEqual(0);
    expect(result.entityCoherence).toBeLessThanOrEqual(1);
    expect(result.centeringCoherence).toBeGreaterThanOrEqual(0);
    expect(result.centeringCoherence).toBeLessThanOrEqual(1);
    expect(result.subjectOmissionScore).toBeGreaterThanOrEqual(0);
    expect(result.subjectOmissionScore).toBeLessThanOrEqual(1);
    expect(result.anaphoraClarity).toBeGreaterThanOrEqual(0);
    expect(result.anaphoraClarity).toBeLessThanOrEqual(1);
  });

  it("handles empty text gracefully", () => {
    const result = measureComprehensibility("", chars);
    expect(result.score).toBe(1.0);
  });

  it("handles empty character list gracefully", () => {
    const text = "누군가 달려갔다. 바람이 불었다.";
    const result = measureComprehensibility(text, []);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
