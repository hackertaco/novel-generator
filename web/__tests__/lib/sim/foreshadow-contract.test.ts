import { describe, expect, it } from "vitest";
import {
  ForeshadowRegistrationContractSchema,
  qualifyForeshadowRegistration,
} from "@/lib/sim";

describe("ForeshadowRegistrationContractSchema", () => {
  it("accepts a scene event only when it introduces concrete payoff-bearing information", () => {
    const result = ForeshadowRegistrationContractSchema.parse({
      event_id: "evt-ledger-12",
      chapter: 12,
      scene_id: "scene-12-a",
      event_summary: "리아가 장부 봉인의 균열과 황실 문양의 방향을 발견한다.",
      introductions: [
        {
          subject: "봉인 장부",
          detail: "장부 봉인의 균열이 북회랑 지도에 새겨진 것과 같은 방향으로 갈라져 있다.",
          why_it_stands_out: "우연으로 보기 어려운 반복 패턴이라 장부와 북회랑 사건이 연결되었음을 암시한다.",
        },
      ],
      implied_question: "왜 장부 봉인의 균열 방향이 북회랑 지도 문양과 정확히 일치하는가?",
      deferred_payoff: {
        kind: "reveal",
        promise: "황실 회계 장부가 북회랑 밀수 루트 기록과 같은 제작자에게서 나왔다는 진실이 밝혀진다.",
        earliest_chapter: 28,
      },
      plausibility_basis: "같은 방향성과 제작 흔적은 장부와 지도의 출처가 공유된다는 합리적 추론 근거가 된다.",
      evidence: [
        "균열 방향이 지도 문양과 일치한다.",
        "리아가 봉인을 만졌을 때 오래된 청동 가루가 같은 냄새로 떨어진다.",
      ],
    });

    expect(result.deferred_payoff.kind).toBe("reveal");
    expect(result.introductions).toHaveLength(1);
  });
});

describe("qualifyForeshadowRegistration", () => {
  it("returns a qualified result for a valid registration contract", () => {
    const result = qualifyForeshadowRegistration({
      event_id: "evt-qualify-1",
      chapter: 7,
      event_summary: "세라가 부러진 인장 반지를 주워 든다.",
      introductions: [
        {
          subject: "부러진 인장 반지",
          detail: "반지 안쪽에는 황태자 친위대만 쓰는 역방향 월계 각인이 새겨져 있다.",
          why_it_stands_out: "평민 출신 도둑의 소지품에서는 나올 수 없는 표식이라 배후 세력을 의심하게 만든다.",
        },
      ],
      implied_question: "왜 평민 도둑이 황태자 친위대 각인이 찍힌 반지를 가지고 있었는가?",
      deferred_payoff: {
        kind: "identity",
        promise: "도둑이 단순 절도범이 아니라 친위대가 심은 전달책이었다는 정체가 드러난다.",
        earliest_chapter: 19,
      },
      plausibility_basis: "권력 집단 고유 각인은 후속 정체 공개나 배후 폭로의 합당한 단서가 된다.",
      evidence: ["반지 안쪽 역방향 월계 각인", "세라가 각인을 보고 즉시 얼굴빛을 바꾼다."],
    });

    expect(result.qualifies).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.contract?.event_id).toBe("evt-qualify-1");
  });

  it("rejects vague atmosphere that does not introduce concrete information", () => {
    const result = qualifyForeshadowRegistration({
      event_id: "evt-vague-1",
      chapter: 9,
      event_summary: "복도 분위기가 이상하다.",
      introductions: [
        {
          subject: "복도",
          detail: "뭔가 불길하다.",
          why_it_stands_out: "이상한 기분이 든다.",
        },
      ],
      implied_question: "무슨 일이 일어날까?",
      deferred_payoff: {
        kind: "threat",
        promise: "뭔가 큰일이 난다.",
        earliest_chapter: 14,
      },
      plausibility_basis: "수상하다.",
      evidence: ["분위기가 이상하다."],
    });

    expect(result.qualifies).toBe(false);
    expect(result.issues.some((issue) => issue.includes("introductions.0.detail"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("plausibility_basis"))).toBe(true);
  });

  it("rejects contracts whose payoff is not deferred beyond the source chapter", () => {
    const result = qualifyForeshadowRegistration({
      event_id: "evt-immediate-1",
      chapter: 15,
      event_summary: "문이 열리자 숨겨진 금고가 바로 드러난다.",
      introductions: [
        {
          subject: "벽장 문",
          detail: "문 뒤에 숨겨진 금고가 드러나며 곧바로 장부가 발견된다.",
          why_it_stands_out: "즉시 해답까지 제공되어 나중 payoff를 기다릴 여지가 없다.",
        },
      ],
      implied_question: "금고 안에는 무엇이 있을까?",
      deferred_payoff: {
        kind: "object",
        promise: "금고의 존재가 나중에 설명된다.",
        earliest_chapter: 15,
      },
      plausibility_basis: "문이 열리자 바로 정답이 나온다.",
      evidence: ["같은 장면에서 금고와 장부가 모두 확인된다."],
    });

    expect(result.qualifies).toBe(false);
    expect(result.issues).toContain(
      "deferred_payoff.earliest_chapter: Foreshadow payoff must occur after the source chapter.",
    );
  });
});
