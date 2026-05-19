import { describe, expect, it } from "vitest";
import {
  applyDeterministicFallback,
  enforceMustUnderstandCoverage,
  verifyMustUnderstandCoverage,
} from "@/lib/rendering";
import type { GenreConventionFallback } from "@/lib/sim";

describe("verifyMustUnderstandCoverage", () => {
  it("returns empty missing when text contains every item verbatim", () => {
    const report = verifyMustUnderstandCoverage(
      "엘리시아는 회귀자다. 전생에 약혼식 직후 독살당했다.",
      ["엘리시아는 회귀자다", "전생에 약혼식 직후 독살당했다"],
    );
    expect(report.missing).toEqual([]);
    expect(report.covered).toHaveLength(2);
  });

  it("covers items via core tokens when phrasing differs", () => {
    const report = verifyMustUnderstandCoverage(
      "엘리시아는 손끝의 통증으로 자신이 회귀했음을 깨달았다.",
      ["엘리시아는 회귀자다"],
    );
    expect(report.missing).toEqual([]);
    expect(report.covered).toEqual(["엘리시아는 회귀자다"]);
  });

  it("reports missing when core tokens are not present", () => {
    const report = verifyMustUnderstandCoverage(
      "응접실은 너무 조용했다.",
      ["엘리시아는 회귀자다", "전생에 약혼식 직후 독살당했다"],
    );
    expect(report.missing).toEqual([
      "엘리시아는 회귀자다",
      "전생에 약혼식 직후 독살당했다",
    ]);
  });

  it("handles empty items list", () => {
    const report = verifyMustUnderstandCoverage("아무 본문", []);
    expect(report).toEqual({ covered: [], missing: [] });
  });
});

describe("applyDeterministicFallback", () => {
  it("inserts the fallback line right after the first sentence", () => {
    const result = applyDeterministicFallback(
      "응접실의 아침은 조용했다. 은잔이 차갑게 놓여 있었다.",
      [
        {
          item: "엘리시아는 회귀자다",
          line: "엘리시아는 자신이 회귀했음을 깨달았다.",
        },
      ],
    );
    expect(result.applied).toHaveLength(1);
    expect(result.text).toContain("응접실의 아침은 조용했다. 엘리시아는 자신이 회귀했음을 깨달았다.");
  });

  it("skips when the text already covers the item", () => {
    const result = applyDeterministicFallback(
      "엘리시아는 자신이 회귀했음을 깨달았다.",
      [
        {
          item: "엘리시아는 회귀자다",
          line: "엘리시아는 자신이 회귀했음을 깨달았다.",
        },
      ],
    );
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.text).toBe("엘리시아는 자신이 회귀했음을 깨달았다.");
  });

  it("inserts at the start when there is no sentence boundary", () => {
    const result = applyDeterministicFallback(
      "은잔이 떨어졌다",
      [
        {
          item: "엘리시아는 회귀자다",
          line: "엘리시아는 회귀했다.",
        },
      ],
    );
    expect(result.applied).toHaveLength(1);
    expect(result.text.startsWith("엘리시아는 회귀했다.")).toBe(true);
  });
});

describe("enforceMustUnderstandCoverage", () => {
  const fallbacks: GenreConventionFallback[] = [
    {
      item: "엘리시아는 회귀자다",
      line: "엘리시아는 자신이 회귀했음을 깨달았다.",
      kind: "realization",
      characterId: "hero",
    },
    {
      item: "전생에 약혼식 직후 독살당했다",
      line: "엘리시아는 전생에 약혼식 직후 독살당했다는 사실을 다시 마주했다.",
      kind: "flashback",
      characterId: "hero",
    },
  ];

  it("returns the original text untouched when all items are covered", () => {
    const text =
      "엘리시아는 손끝의 통증으로 자신이 회귀했음을 깨달았다. 전생의 약혼식 직후 독살당했던 자신을 다시 떠올렸다.";
    const result = enforceMustUnderstandCoverage({
      text,
      mustUnderstand: fallbacks.map((f) => f.item),
      fallbacks,
    });
    expect(result.applied).toEqual([]);
    expect(result.residualMissing).toEqual([]);
    expect(result.text).toBe(text);
  });

  it("inserts only the fallbacks for missing items", () => {
    const text =
      "엘리시아는 자신이 회귀했음을 깨달았다. 은잔은 어제와 같은 자리에 놓여 있었다.";
    const result = enforceMustUnderstandCoverage({
      text,
      mustUnderstand: fallbacks.map((f) => f.item),
      fallbacks,
    });
    expect(result.applied.map((entry) => entry.item)).toEqual([
      "전생에 약혼식 직후 독살당했다",
    ]);
    expect(result.residualMissing).toEqual([]);
    expect(result.text).toContain("엘리시아는 전생에 약혼식 직후 독살당했다는 사실을 다시 마주했다.");
  });

  it("inserts every missing fallback and ends with empty residualMissing", () => {
    const result = enforceMustUnderstandCoverage({
      text: "응접실은 너무 조용했다. 은잔만 차갑게 남아 있었다.",
      mustUnderstand: fallbacks.map((f) => f.item),
      fallbacks,
    });
    expect(result.applied).toHaveLength(2);
    expect(result.residualMissing).toEqual([]);
  });
});
