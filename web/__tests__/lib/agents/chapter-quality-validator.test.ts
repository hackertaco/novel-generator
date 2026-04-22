// @vitest-environment node
import { describe, expect, it } from "vitest";

import { detectChapterQualityIssues } from "@/lib/agents/chapter-quality-validator";

describe("detectChapterQualityIssues", () => {
  it("detects repeated reveal/decision payloads in a chapter", () => {
    const text = [
      "365일. 남은 시간은 일 년뿐이었다.",
      "황궁으로 가면 끝이었다. 수도를 떠나 크레바스로 도망쳐야 했다.",
      "세라핀은 더는 제 목숨을 제국의 장작으로 쓰지 않겠다고 결심했다.",
      "",
      "기도실로 돌아온 세라핀은 다시 365일을 떠올렸다.",
      "오늘 밤 떠나야 했다. 크레바스로 가는 계획을 적고 혼자 사라질 생각이었다.",
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
      "레온은 기도문 뒷면의 계산표를 봤다.",
      "숫자와 메모가 몇 줄 적혀 있었다.",
      "그는 곧바로 죽으러 가는 거잖아, 라고 단정했다.",
    ].join("\n\n");

    const issues = detectChapterQualityIssues(text);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "overfast_deduction", severity: "warning" }),
      ]),
    );
  });

  it("does not flag a chapter that progresses after the reveal", () => {
    const text = [
      "365일. 남은 시간은 일 년뿐이었다.",
      "세라핀은 숨을 고르고 회색 망토를 꺼냈다.",
      "그녀는 성문 경비가 느슨한 시간을 계산해 출발 순서를 적었다.",
      "복도 끝에서 종이 울리자, 그녀는 곧바로 종이를 숨기고 문으로 향했다.",
    ].join("\n\n");

    const issues = detectChapterQualityIssues(text);
    expect(issues).toEqual([]);
  });
});
