// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  extractSummaryFromLLM,
  extractSummaryRuleBased,
} from "@/lib/evaluators/summary";

describe("extractSummaryFromLLM", () => {
  it("creates summary from valid LLM data", () => {
    const llmData = {
      plot_summary: "현우가 전투에서 승리했다.",
      emotional_beat: "통쾌",
      cliffhanger: "새로운 적이 나타났다",
      events: [
        {
          type: "battle",
          participants: ["mc"],
          description: "첫 번째 전투",
          outcome: "승리",
          consequences: { 경험치: "100" },
        },
      ],
      character_changes: [
        {
          character_id: "mc",
          changes: { level: "1 → 2" },
        },
      ],
      foreshadowing_touched: [
        {
          foreshadowing_id: "fs_1",
          action: "hint",
          context: "반지가 빛났다",
        },
      ],
    };

    const result = extractSummaryFromLLM(1, "1화 제목", "본문 내용", llmData);

    expect(result.chapter_number).toBe(1);
    expect(result.title).toBe("1화 제목");
    expect(result.plot_summary).toBe("현우가 전투에서 승리했다.");
    expect(result.emotional_beat).toBe("통쾌");
    expect(result.cliffhanger).toBe("새로운 적이 나타났다");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe("battle");
    expect(result.events[0].participants).toEqual(["mc"]);
    expect(result.events[0].outcome).toBe("승리");
    expect(result.character_changes).toHaveLength(1);
    expect(result.character_changes[0].character_id).toBe("mc");
    expect(result.foreshadowing_touched).toHaveLength(1);
    expect(result.foreshadowing_touched[0].foreshadowing_id).toBe("fs_1");
    expect(result.word_count).toBe("본문 내용".length);
    expect(result.style_score).toBeNull();
  });

  it("handles missing/empty fields gracefully", () => {
    const llmData = {};

    const result = extractSummaryFromLLM(
      2,
      "2화 제목",
      "본문",
      llmData,
    );

    expect(result.chapter_number).toBe(2);
    expect(result.title).toBe("2화 제목");
    expect(result.plot_summary).toBe("");
    expect(result.emotional_beat).toBe("");
    expect(result.cliffhanger).toBeNull();
    expect(result.events).toHaveLength(0);
    expect(result.character_changes).toHaveLength(0);
    expect(result.foreshadowing_touched).toHaveLength(0);
  });
});

describe("extractSummaryRuleBased", () => {
  it("detects battle keywords", () => {
    const content = `현우가 검을 들고 전투를 시작했다. 강력한 공격이 이어졌다.`;
    const result = extractSummaryRuleBased(1, "1화", content);

    const battleEvent = result.events.find((e) => e.type === "battle");
    expect(battleEvent).toBeDefined();
    expect(battleEvent!.description).toBe("Detected battle event");
  });

  it("detects dialogue keywords", () => {
    const content = `"너는 누구냐?" 현우가 물었다. 상대는 대답했다.`;
    const result = extractSummaryRuleBased(1, "1화", content);

    const dialogueEvent = result.events.find((e) => e.type === "dialogue");
    expect(dialogueEvent).toBeDefined();
    expect(dialogueEvent!.description).toBe("Detected dialogue event");
  });

  it("extracts cliffhanger from last paragraph", () => {
    const content = `첫 번째 문단이다.\n\n두 번째 문단이다.\n\n마지막에 무언가 나타났다`;
    const result = extractSummaryRuleBased(1, "1화", content);

    expect(result.cliffhanger).toBe("마지막에 무언가 나타났다");
  });

  it("generates plot summary from first 2 sentences", () => {
    // Sentences must be >10 chars to pass the length filter in extractSummaryRuleBased.
    // Need >4 sentences so the middle ones are excluded from the summary.
    const content = `현우가 천천히 눈을 떴다. 주위는 완전히 낯선 방이었다. 세 번째 문장은 요약에 포함되지 않아야 합니다. 네 번째 문장도 포함되지 않아야 합니다. 다섯 번째 문장은 마지막이다.`;
    const result = extractSummaryRuleBased(1, "1화", content);

    expect(result.plot_summary).toContain("현우가 천천히 눈을 떴다");
    expect(result.plot_summary).toContain("주위는 완전히 낯선 방이었다");
    // Middle sentences should not be in the summary
    expect(result.plot_summary).not.toContain("세 번째 문장은 요약에 포함되지 않아야 합니다");
  });
});
