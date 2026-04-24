// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildChapterQualityRepairPrompt,
  detectChapterQualityIssues,
} from "@/lib/agents/chapter-quality-validator";

describe("detectChapterQualityIssues", () => {
  it("detects repeated reveal/decision payloads in a chapter", () => {
    const text = [
      "봉투 안에는 48시간이라는 숫자와 마지막 출항 시각이 적혀 있었다.",
      "민우는 새벽 배를 타기 위해 창고 열쇠와 장부를 챙길 계획을 세웠다.",
      "지금 숨을 짐과 버릴 짐을 나누지 않으면 빠져나갈 수 없다고 결심했다.",
      "",
      "작업대로 돌아온 민우는 봉투의 48시간 문구를 다시 되뇌었다.",
      "그는 새벽 배 시간표와 숨길 짐 목록을 다시 적으며 떠날 계획을 되풀이했다.",
    ].join("\n\n");

    const issues = detectChapterQualityIssues(text);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "repeated_reveal_payload", severity: "error" }),
      ]),
    );
  });

  it("detects over-fast deduction from thin evidence", () => {
    const text = [
      "수진은 장부 사이에 끼워 둔 메모와 숫자 기록을 봤다.",
      "창고 이름과 시각이 몇 줄 적혀 있었을 뿐이었다.",
      "그녀는 그걸 보고 범인을 이미 정답처럼 확신했다.",
    ].join("\n\n");

    const issues = detectChapterQualityIssues(text);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "overfast_deduction", severity: "warning" }),
      ]),
    );
  });

  it("detects duplicate beat restart from generic overlap and restart cues", () => {
    const text = [
      "경비대는 창고 문을 두드리며 장부와 열쇠를 내놓으라고 몰아붙였다.",
      "민우는 책상 밑으로 장부를 밀어 넣고 출구 쪽으로 몸을 틀었다.",
      "수진은 경비대장의 시선을 막으며 몇 초만 더 버티라고 속삭였다.",
      "",
      "그리고 다시 창고 문이 요란하게 울렸다.",
      "경비대는 장부와 열쇠를 내놓으라고 몰아붙였고, 민우는 책상 밑으로 장부를 밀어 넣었다.",
      "수진은 경비대장의 시선을 막으며 몇 초만 더 버티라고 말했다.",
    ].join("\n\n");

    const issues = detectChapterQualityIssues(text);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "duplicate_beat_restart", severity: "error" }),
      ]),
    );
  });

  it("does not flag a chapter that progresses after the reveal", () => {
    const text = [
      "봉투 안에는 48시간이라는 숫자와 마지막 출항 시각이 적혀 있었다.",
      "민우는 숨을 고르고 열쇠 꾸러미를 챙겼다.",
      "그는 경비 교대 시간을 계산해 출발 순서를 적어 내려갔다.",
      "복도 끝에서 발소리가 들리자 봉투를 난로에 밀어 넣고 뒷문으로 향했다.",
    ].join("\n\n");

    const issues = detectChapterQualityIssues(text);
    expect(issues).toEqual([]);
  });

  it("detects duplicate beat restarts when the same confrontation opens again", () => {
    const text = [
      "세라핀은 대신전 정문 앞에서 황궁 칙서를 움켜쥐었다.",
      "베네딕트와 레온이 그녀를 에워싸자 공기까지 멎는 듯했다.",
      "세라핀은 정문을 등지고 물러서며 황궁으로 돌아가라는 압박을 버텼다.",
      "",
      "그리고 다시 정문 앞, 세라핀은 대신전 계단 아래에서 황궁 칙서를 들었다.",
      "베네딕트가 먼저 다가오고 레온도 뒤따르며 같은 대치를 반복했다.",
      "정문 앞의 긴장은 처음부터 다시 열린 듯했고 세라핀은 또 물러섰다.",
    ].join("\n\n");

    const issues = detectChapterQualityIssues(text);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "duplicate_beat_restart", severity: "error" }),
      ]),
    );
  });

  it("includes detector-specific repair guidance in the rewrite prompt", () => {
    const text = "세라핀은 같은 결심을 반복했고 장면도 다시 열린 듯했다.";
    const issues = [
      { type: "repeated_reveal_payload", severity: "error", message: "반복" },
      { type: "duplicate_beat_restart", severity: "error", message: "재시작" },
    ] as const;

    const prompt = buildChapterQualityRepairPrompt(text, [...issues]);

    expect(prompt).toContain("### 같은 reveal/결심 반복 제거");
    expect(prompt).toContain("### 중복 beat restart 제거");
    expect(prompt).toContain("새 캐릭터나 새 설정을 추가하지 마세요.");
    expect(prompt).toContain(text);
  });
});
