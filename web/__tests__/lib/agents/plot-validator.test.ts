import { describe, it, expect } from "vitest";
import { validatePlots, buildRepairPrompt } from "@/lib/agents/plot-validator";
import type { PlotOption } from "@/lib/schema/plot";

function makePlot(overrides: Partial<PlotOption> = {}): PlotOption {
  return {
    id: "A",
    title: "테스트 제목",
    logline: "시녀 은서가 황후의 비밀 장부를 손에 넣고 반격에 나선다. 궁중 정치의 판이 뒤집힌다.",
    hook: "은서의 반격이 시작된다",
    arc_summary: [
      "1부: 독배 - 황비 이수련이 측비 연화에게 독살당한 뒤 5년 전으로 회귀한다. 자신을 죽인 측비가 아직 궁에 들어오기 전, 이수련은 동궁전의 기밀 장부를 먼저 손에 넣는다.",
      "2부: 거미줄 - 이수련이 측비의 후원자인 좌상 가문의 비리를 파헤치며 궁중 세력을 재편한다. 황제 위현은 달라진 이수련에게 처음으로 관심을 보이기 시작한다.",
      "3부: 역린 - 좌상 가문이 반격에 나서고 이수련은 최후의 선택을 해야 한다. 황제의 편에 서면 가문을 잃고, 가문의 편에 서면 사랑을 잃는다.",
    ],
    key_twist: "이수련이 죽인 줄 알았던 측비가 사실 그녀의 이복자매였다",
    male_archetype: "집착광공형",
    female_archetype: "사이다형",
    ...overrides,
  };
}

describe("validatePlots", () => {
  it("passes valid romance plots", () => {
    const plots = [
      makePlot({ id: "A", male_archetype: "집착광공형", female_archetype: "사이다형" }),
      makePlot({ id: "B", male_archetype: "폭군형", female_archetype: "햇살녀형",
        arc_summary: [
          "1부: 궁녀 하은이 폭군 황제의 시중을 들게 된다. 황제는 하은에게만 이상한 관대함을 보인다.",
          "2부: 하은이 궁중 암투에 휘말리며 황제의 과거 비밀을 알게 된다. 어린 시절 유일한 친구가 하은이었다.",
          "3부: 반란이 일어나고 하은은 황제를 버리고 도망칠 기회를 얻지만 돌아선다.",
        ],
      }),
      makePlot({ id: "C", male_archetype: "다정남형", female_archetype: "상처녀형",
        arc_summary: [
          "1부: 의사 서진이 자살 미수 환자 하윤을 담당한다. 하윤은 치료를 거부하며 서진을 밀어낸다.",
          "2부: 서진이 하윤의 과거를 파헤치고 가정폭력 피해 사실을 발견한다. 가해자가 병원 이사장이다.",
          "3부: 서진이 이사장과 맞서며 자신의 커리어를 걸고 하윤을 지킨다. 하윤이 처음으로 살고 싶다고 말한다.",
        ],
      }),
    ];
    const result = validatePlots(plots, true);
    expect(result.passed).toBe(true);
    expect(result.regenerationNeeded).toHaveLength(0);
  });

  it("auto-fixes archetype label aliases", () => {
    const plots = [
      makePlot({ id: "A", male_archetype: "집착광공", female_archetype: "사이다" }),
    ];
    const result = validatePlots(plots, true);
    expect(result.plots[0].male_archetype).toBe("집착광공형");
    expect(result.plots[0].female_archetype).toBe("사이다형");
    expect(result.autoFixCount).toBe(2);
  });

  it("flags invalid archetype labels that cannot be auto-fixed", () => {
    const plots = [
      makePlot({ id: "A", male_archetype: "비극적 영웅", female_archetype: "결단력 있는 전사" }),
    ];
    const result = validatePlots(plots, true);
    expect(result.passed).toBe(false);
    expect(result.regenerationNeeded.some((i) => i.field === "male_archetype")).toBe(true);
    expect(result.regenerationNeeded.some((i) => i.field === "female_archetype")).toBe(true);
  });

  it("flags short loglines", () => {
    const plots = [
      makePlot({ id: "A", logline: "짧은 로그라인" }),
    ];
    const result = validatePlots(plots, true);
    expect(result.regenerationNeeded.some((i) => i.field === "logline" && i.issue.includes("짧음"))).toBe(true);
  });

  it("flags vague expressions in logline", () => {
    const plots = [
      makePlot({ id: "A", logline: "주인공이 진정한 사랑을 찾아가는 여정을 시작하게 된다. 그녀의 운명에 맞서는 이야기." }),
    ];
    const result = validatePlots(plots, true);
    expect(result.regenerationNeeded.some((i) => i.field === "logline" && i.issue.includes("모호한"))).toBe(true);
  });

  it("flags vague expressions in arc_summary", () => {
    const plots = [
      makePlot({
        id: "A",
        arc_summary: [
          "1부: 시작 - 여주가 위기를 맞고 남주를 만나게 된다",
          "2부: 갈등 - 두 사람의 관계가 깊어지며 위기가 닥친다",
          "3부: 결말 - 진정한 사랑을 찾아가는 여정이 끝난다",
        ],
      }),
    ];
    const result = validatePlots(plots, true);
    const arcIssues = result.regenerationNeeded.filter((i) => i.field.startsWith("arc_summary"));
    expect(arcIssues.length).toBeGreaterThan(0);
  });

  it("flags short arc_summary parts", () => {
    const plots = [
      makePlot({
        id: "A",
        arc_summary: [
          "1부: 시작",
          "2부: 갈등과 위기",
          "3부: 결말",
        ],
      }),
    ];
    const result = validatePlots(plots, true);
    expect(result.regenerationNeeded.some((i) => i.issue.includes("짧음"))).toBe(true);
  });

  it("flags similar plots (high arc_summary similarity)", () => {
    const arcBase = [
      "1부: 독배 - 황비 이수련이 측비 연화에게 독살당한 뒤 회귀한다. 기밀 장부를 손에 넣는다.",
      "2부: 거미줄 - 이수련이 좌상 가문의 비리를 파헤치며 궁중 세력을 재편한다.",
      "3부: 역린 - 좌상 가문이 반격에 나서고 최후의 선택을 해야 한다.",
    ];
    const plots = [
      makePlot({ id: "A", arc_summary: arcBase }),
      makePlot({ id: "B", arc_summary: arcBase, male_archetype: "폭군형", female_archetype: "햇살녀형" }),
    ];
    const result = validatePlots(plots, true);
    expect(result.regenerationNeeded.some((i) => i.field === "diversity")).toBe(true);
  });

  it("flags same archetype combo across plots", () => {
    const plots = [
      makePlot({ id: "A", male_archetype: "집착광공형", female_archetype: "사이다형" }),
      makePlot({ id: "B", male_archetype: "집착광공형", female_archetype: "사이다형",
        arc_summary: [
          "1부: 완전히 다른 시작. 전혀 다른 배경에서 시작하는 이야기.",
          "2부: 완전히 다른 전개. 전혀 다른 갈등이 벌어진다.",
          "3부: 완전히 다른 결말. 전혀 다른 방식으로 끝난다.",
        ],
      }),
    ];
    const result = validatePlots(plots, true);
    expect(result.regenerationNeeded.some((i) => i.issue.includes("캐릭터 조합이 동일"))).toBe(true);
  });

  it("flags key_twist with banned patterns", () => {
    const plots = [
      makePlot({ id: "A", key_twist: "알고 보니 여주가 사실 공주였다" }),
    ];
    const result = validatePlots(plots, true);
    expect(result.regenerationNeeded.some((i) => i.field === "key_twist")).toBe(true);
  });

  it("skips archetype validation for non-romance genres", () => {
    const plots = [
      makePlot({ id: "A", male_archetype: "", female_archetype: "" }),
    ];
    const result = validatePlots(plots, false);
    expect(result.regenerationNeeded.every((i) => i.field !== "male_archetype")).toBe(true);
  });
});

describe("buildRepairPrompt", () => {
  it("generates a repair prompt with specific issues", () => {
    const plots = [
      makePlot({ id: "A", male_archetype: "비극적 영웅" }),
    ];
    const issues = [
      { plotId: "A", field: "male_archetype", issue: "유효하지 않은 남주 아키타입" },
    ];
    const prompt = buildRepairPrompt(plots, issues, true);
    expect(prompt).toContain("비극적 영웅");
    expect(prompt).toContain("유효한 남주 아키타입");
    expect(prompt).toContain("집착광공형");
  });
});
