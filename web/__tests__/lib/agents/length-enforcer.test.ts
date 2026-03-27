import { describe, it, expect } from "vitest";
import {
  enforceLength,
  computeSceneBudgets,
} from "@/lib/agents/length-enforcer";
import type { ChapterBlueprint } from "@/lib/schema/planning";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ChapterBlueprint with given scene estimated_chars */
function makeBlueprint(sceneChars: number[]): ChapterBlueprint {
  return {
    chapter_number: 1,
    title: "테스트",
    arc_id: "arc_1",
    one_liner: "테스트 챕터",
    role_in_arc: "rising_action",
    scenes: sceneChars.map((ec, i) => ({
      purpose: `테스트 씬 ${i} — 캐릭터가 행동을 취한다`,
      type: "action" as const,
      characters: [],
      estimated_chars: ec,
      emotional_tone: "neutral",
      must_reveal: [],
    })),
    dependencies: [],
    target_word_count: sceneChars.reduce((a, b) => a + b, 0),
    emotional_arc: "",
    key_points: [],
    characters_involved: [],
    tension_level: 5,
    foreshadowing_actions: [],
  };
}

// ---------------------------------------------------------------------------
// enforceLength
// ---------------------------------------------------------------------------

describe("enforceLength", () => {
  it("text within tolerance returns no change", () => {
    const target = 100;
    const tolerance = 0.2;
    // 80~120 chars is within tolerance
    const text = "가".repeat(100);
    const result = enforceLength(text, target, tolerance);
    expect(result.action).toBe("none");
    expect(result.text).toBe(text);
    expect(result.removedParagraphs).toBe(0);
  });

  it("text too short returns needs_expansion", () => {
    const target = 1000;
    const tolerance = 0.2;
    const text = "짧은 텍스트입니다.";
    const result = enforceLength(text, target, tolerance);
    expect(result.action).toBe("needs_expansion");
    expect(result.text).toBe(text);
    expect(result.removedParagraphs).toBe(0);
  });

  it("text too long trims low-density paragraphs", () => {
    // Build text that clearly exceeds target + tolerance
    // Target=100, tolerance=0.2 → maxChars=120
    const target = 100;
    const tolerance = 0.2;
    const paragraphs = [
      "이수련이 3시에 왕궁으로 갔다.",                   // ~15 chars, high density
      "그냥 바람이 불고 하늘이 맑고 풀이 자라고 새가 날고 물이 흐르고 해가 뜨고 달이 지고 별이 빛나고 숲이 울렸다.",  // ~50 chars, low density filler
      "또 아무 것도 없는 곳에서 바람만 불고 하늘만 맑고 구름만 흐르고 새만 울고 풀만 흔들리고 있었다.",  // ~45 chars, low density filler
      "김도현이 오후 5시 검술대회에서 승리했다.",           // ~20 chars, high density
    ];
    const text = paragraphs.join("\n\n");
    // Total length > 120 (each "\n\n" = 2 chars)

    const result = enforceLength(text, target, tolerance);
    expect(result.action).toBe("trimmed");
    expect(result.removedParagraphs).toBeGreaterThan(0);
    expect(result.text.length).toBeLessThanOrEqual(text.length);
  });

  it("single paragraph is handled gracefully (no crash, no trim)", () => {
    const target = 10;
    const tolerance = 0.2;
    const text = "이것은 하나의 긴 문단입니다. 매우 길어서 목표를 훨씬 초과합니다. 하지만 분리할 수 없으므로 그대로 반환됩니다.";
    const result = enforceLength(text, target, tolerance);
    // Single paragraph cannot be trimmed
    expect(result.action).toBe("none");
    expect(result.text).toBe(text);
    expect(result.removedParagraphs).toBe(0);
  });

  it("dialogue paragraphs (with quotes) are protected from trimming", () => {
    const target = 100;
    const tolerance = 0.2;
    // maxChars = 120. Make text > 120 where dialogue paragraphs exist.
    const paragraphs = [
      "\u201C안녕하세요, 레온 님. 오늘 날씨가 좋네요.\u201D",  // dialogue — protected
      "그냥 그렇게 흘러갔다. 바람이 불었다. 하늘은 맑았다. 구름도 보였다. 풀잎이 살랑거렸다.",  // filler — removable
      "또 별일 없었다. 조용히 지나갔다. 평범한 하루였다. 해가 떠올랐다. 해가 졌다.",  // filler — removable
    ];
    const text = paragraphs.join("\n\n");

    const result = enforceLength(text, target, tolerance);
    // The dialogue paragraph should still be present
    if (result.action === "trimmed") {
      expect(result.text).toContain("\u201C안녕하세요");
    }
  });

  it("keyword-protected paragraphs are not removed", () => {
    const target = 100;
    const tolerance = 0.2;
    const paragraphs = [
      "비밀의 열쇠를 발견했다. 그것은 고대의 유물이었다.",  // contains keyword "비밀"
      "그냥 그렇게 흘러갔다. 바람이 불었다. 하늘은 맑았다. 구름도 보였다. 풀잎이 살랑거렸다.",
      "또 별일 없었다. 조용히 지나갔다. 평범한 하루였다. 해가 떠올랐다. 해가 졌다.",
    ];
    const text = paragraphs.join("\n\n");

    const result = enforceLength(text, target, tolerance, ["비밀"]);
    if (result.action === "trimmed") {
      expect(result.text).toContain("비밀");
    }
  });

  it("empty text returns no change", () => {
    const result = enforceLength("", 1000, 0.2);
    expect(result.action).toBe("none");
    expect(result.text).toBe("");
    expect(result.removedParagraphs).toBe(0);
  });

  it("whitespace-only text returns no change", () => {
    const result = enforceLength("   \n\n   ", 1000, 0.2);
    expect(result.action).toBe("none");
    expect(result.removedParagraphs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSceneBudgets
// ---------------------------------------------------------------------------

describe("computeSceneBudgets", () => {
  it("distributes equally when scenes have equal estimated_chars", () => {
    const bp = makeBlueprint([1000, 1000, 1000]);
    const budgets = computeSceneBudgets(bp, 3000);

    expect(budgets).toHaveLength(3);
    for (const b of budgets) {
      // Each scene gets 1000 share => min=800, max=1200
      expect(b.min).toBe(800);
      expect(b.max).toBe(1200);
    }
  });

  it("distributes proportionally for different estimated_chars", () => {
    const bp = makeBlueprint([1000, 2000]);
    const budgets = computeSceneBudgets(bp, 3000);

    expect(budgets).toHaveLength(2);
    // Scene 0: share = (1000/3000)*3000 = 1000 => min=800, max=1200
    expect(budgets[0].min).toBe(800);
    expect(budgets[0].max).toBe(1200);
    // Scene 1: share = (2000/3000)*3000 = 2000 => min=1600, max=2400
    expect(budgets[1].min).toBe(1600);
    expect(budgets[1].max).toBe(2400);
  });

  it("handles single scene", () => {
    const bp = makeBlueprint([2000]);
    const budgets = computeSceneBudgets(bp, 3500);

    expect(budgets).toHaveLength(1);
    // share = 3500 => min=2800, max=4200
    expect(budgets[0].min).toBe(2800);
    expect(budgets[0].max).toBe(4200);
    expect(budgets[0].sceneIndex).toBe(0);
  });

  it("returns empty array for no scenes", () => {
    const bp = makeBlueprint([]);
    const budgets = computeSceneBudgets(bp, 3500);
    expect(budgets).toHaveLength(0);
  });

  it("applies 80%/120% clamping on budget", () => {
    const bp = makeBlueprint([500, 1500]);
    const budgets = computeSceneBudgets(bp, 4000);

    // Scene 0: share = (500/2000)*4000 = 1000
    expect(budgets[0].min).toBe(Math.round(1000 * 0.8)); // 800
    expect(budgets[0].max).toBe(Math.round(1000 * 1.2)); // 1200
    // Scene 1: share = (1500/2000)*4000 = 3000
    expect(budgets[1].min).toBe(Math.round(3000 * 0.8)); // 2400
    expect(budgets[1].max).toBe(Math.round(3000 * 1.2)); // 3600
  });

  it("uses default estimated_chars=1000 when scene has 0", () => {
    // Scenes with estimated_chars=0 will use fallback of 1000
    const bp: ChapterBlueprint = {
      chapter_number: 1,
      title: "테스트",
      arc_id: "arc_1",
      one_liner: "테스트",
      role_in_arc: "rising_action",
      scenes: [
        { purpose: "씬 A — 캐릭터가 행동을 취한다", type: "action", characters: [], estimated_chars: 0, emotional_tone: "neutral", must_reveal: [] },
        { purpose: "씬 B — 캐릭터가 대화를 한다다", type: "dialogue", characters: [], estimated_chars: 0, emotional_tone: "neutral", must_reveal: [] },
      ],
      dependencies: [],
      target_word_count: 2000,
      emotional_arc: "",
      key_points: [],
      characters_involved: [],
      tension_level: 5,
      foreshadowing_actions: [],
    };
    const budgets = computeSceneBudgets(bp, 2000);
    expect(budgets).toHaveLength(2);
    // Each scene defaults to 1000, total=2000, each share=1000
    expect(budgets[0].min).toBe(800);
    expect(budgets[0].max).toBe(1200);
  });
});
