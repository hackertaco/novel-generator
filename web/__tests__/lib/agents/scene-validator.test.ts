// @vitest-environment node
import { describe, expect, it } from "vitest";

import { validateScene } from "@/lib/agents/scene-validator";

describe("validateScene whitelist enforcement", () => {
  const whitelist = {
    allowedCharacters: ["세라핀 에델", "레온 발테르 크레바스"],
    forbiddenCharacters: [
      {
        name: "이졸데",
        variants: ["이졸데"],
      },
      {
        name: "베네딕트 로사르",
        variants: ["베네딕트 로사르", "베네딕트", "로사르"],
      },
    ],
  };

  it("passes when forbidden characters are only mentioned indirectly", () => {
    const text = [
      "세라핀 에델은 숨을 고르며 레온을 바라봤다.",
      "\"베네딕트가 알기 전에 떠나야 해요.\" 세라핀이 낮게 말했다.",
    ].join("\n");

    const result = validateScene(text, 120, "dialogue", whitelist);
    expect(result.issues.some((issue) => issue.type === "forbidden_character_presence")).toBe(false);
  });

  it("fails when a non-whitelisted seeded character directly appears or speaks", () => {
    const text = [
      "세라핀 에델이 고개를 돌리자 이졸데가 급히 달려왔다.",
      "\"아가씨, 지금 떠나시면 안 돼요.\" 이졸데가 숨을 몰아쉬며 말했다.",
    ].join("\n");

    const result = validateScene(text, 120, "dialogue", whitelist);
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "forbidden_character_presence", severity: "error" }),
      ]),
    );
  });
});
