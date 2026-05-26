import { describe, expect, it } from "vitest";
import { verifyKoreanProseHygiene } from "@/lib/rendering/korean-prose-hygiene";

describe("verifyKoreanProseHygiene", () => {
  it("returns zero signals for clean prose", () => {
    const report = verifyKoreanProseHygiene(
      "엘리시아는 잔을 내려놓았다. 그녀는 세레나를 바라보았다.",
    );
    expect(report.failCount).toBe(0);
    expect(report.warnCount).toBe(0);
  });

  it("flags double passive as fail", () => {
    const report = verifyKoreanProseHygiene(
      "그 명단은 이미 닫혀버렸고, 다음 이름은 곧 정해지게 되어졌다.",
    );
    expect(report.failCount).toBeGreaterThanOrEqual(1);
    expect(report.counts.passive_overuse).toBeGreaterThanOrEqual(1);
  });

  it("flags noun chain as fail", () => {
    const report = verifyKoreanProseHygiene(
      "황태자의 약혼녀인 자신이 다시 눈을 뜬 곳이 이 방이라는 사실이 분명했다.",
    );
    expect(report.failCount).toBeGreaterThanOrEqual(1);
    expect(report.counts.noun_chain).toBeGreaterThanOrEqual(1);
  });

  it("flags stacked adverbials as warn", () => {
    const report = verifyKoreanProseHygiene(
      "그녀는 응접실에서 창가 쪽으로 천천히 발걸음을 옮기며 탁자 위로 시선을 던지고 문가에서 들려온 소리에 한 번 더 귀를 기울였다.",
    );
    expect(report.warnCount).toBeGreaterThanOrEqual(1);
    expect(report.counts.stacked_adverbials).toBeGreaterThanOrEqual(1);
  });

  it("flags abstract English metaphor as warn", () => {
    const report = verifyKoreanProseHygiene("이번 분기에 그 기능을 태운다.");
    expect(report.warnCount).toBeGreaterThanOrEqual(1);
    expect(report.counts.abstract_english_metaphor).toBeGreaterThanOrEqual(1);
  });

  it("attaches line numbers and excerpts to signals", () => {
    const report = verifyKoreanProseHygiene(
      "첫 줄은 평범했다.\n\n그러나 다음 단락에는 무엇이 정해지게 되어졌다고 적혀 있었다.",
    );
    expect(report.signals.length).toBeGreaterThan(0);
    const passive = report.signals.find((s) => s.kind === "passive_overuse");
    expect(passive?.lineNumber).toBeGreaterThan(1);
    expect(passive?.excerpt.length).toBeGreaterThan(0);
  });
});
