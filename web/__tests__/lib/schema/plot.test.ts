// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PlotOptionSchema } from "@/lib/schema/plot";

describe("PlotOptionSchema", () => {
  it("parses valid plot option", () => {
    const data = {
      id: "plot_1",
      title: "회귀자의 복수",
      logline: "죽음에서 돌아온 주인공이 복수를 시작한다",
      hook: "눈을 떴더니, 10년 전이었다.",
      arc_summary: ["귀환편", "복수편", "진실편"],
      key_twist: "복수 대상이 사실 아군이었다",
    };

    const result = PlotOptionSchema.parse(data);

    expect(result.id).toBe("plot_1");
    expect(result.title).toBe("회귀자의 복수");
    expect(result.logline).toBe("죽음에서 돌아온 주인공이 복수를 시작한다");
    expect(result.hook).toBe("눈을 떴더니, 10년 전이었다.");
    expect(result.arc_summary).toEqual(["귀환편", "복수편", "진실편"]);
    expect(result.key_twist).toBe("복수 대상이 사실 아군이었다");
  });

  it("rejects missing required fields", () => {
    const data = {
      id: "plot_1",
      title: "회귀자의 복수",
      // missing logline, hook, arc_summary, key_twist
    };

    expect(() => PlotOptionSchema.parse(data)).toThrow();
  });
});
