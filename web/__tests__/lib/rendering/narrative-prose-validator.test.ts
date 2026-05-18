import { describe, expect, it } from "vitest";

import { validateNarrativeProse } from "@/lib/rendering/narrative-prose-validator";

describe("narrative prose validator", () => {
  it("catches explanation-style prose without enumerating every exact phrase", () => {
    const result = validateNarrativeProse({
      text: [
        "엘리시아는 그 말끝을 꿰뚫어보려 애썼다.",
        "그 순간 압박을 느꼈고, 어떤 선택을 해야 할지 고민해야 했다.",
        "세레나의 미소 뒤에는 무엇인가 숨겨져 있는 듯했다.",
      ].join(" "),
    });

    expect(result.violationCount).toBeGreaterThanOrEqual(3);
    expect(result.violations.map((violation) => violation.category)).toEqual(
      expect.arrayContaining(["cognition_tell", "hidden_state_tell", "interpretation_tell"]),
    );
    expect(result.violations.every((violation) => violation.excerpt.length > 0)).toBe(true);
  });

  it("catches internal source ids and forbidden fact leaks", () => {
    const result = validateNarrativeProse({
      text: "act_ch001_001 로그 뒤에서 엘리시아가 회귀자라는 사실이 드러났다.",
      forbiddenFacts: ["엘리시아가 회귀자라는 사실"],
    });

    expect(result.violations.map((violation) => violation.category)).toEqual(
      expect.arrayContaining(["internal_source_leak", "forbidden_fact_leak"]),
    );
  });
});
