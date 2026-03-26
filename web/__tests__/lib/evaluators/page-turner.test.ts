import { describe, it, expect } from "vitest";
import { measurePageTurner, type PageTurnerResult } from "../../../src/lib/evaluators/page-turner";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Strong cliffhanger: crisis + twist at the end, multiple open threads */
const STRONG_CLIFFHANGER = `
서진은 복도를 걸으며 그날의 사건을 떠올렸다. 누군가가 비밀을 숨기고 있다는 확신이 들었다.

하지만 증거는 어디에도 없었다. 도대체 누가 그런 짓을 한 것일까?

그녀는 서재의 문을 열었다. 방 안에는 아무도 없었지만, 책상 위에 낯선 편지가 놓여 있었다.

편지를 읽는 순간, 심장이 멎는 것 같았다. 그것은 10년 전 사라진 아버지의 필체였다.

"이건..." 서진의 손이 떨렸다. 아버지는 살아 있었던 것인가?

그때, 뒤에서 문이 닫히는 소리가 들렸다. 어둠 속에서 누군가의 목소리가 울렸다.

"그 편지를 내려놔." 차가운 목소리. 서진은 위험을 직감했다.

갑자기 불이 꺼졌다. 비명 소리와 함께 바닥이 무너지기 시작했다.
`.trim();

/** Flat ending: everything resolved, calm, no hooks */
const FLAT_ENDING = `
민수는 집으로 돌아갔다. 오늘 하루도 무사히 지나갔다.

저녁을 먹고 텔레비전을 봤다. 특별한 일은 없었다.

그렇게 하루가 마무리되었다. 평화로운 밤이었다.

민수는 이불을 덮고 잠이 들었다. 내일도 좋은 하루가 되길 바라며.
`.trim();

/** Text with many micro-hooks but weak ending */
const MICRO_HOOKS_TEXT = `
연우는 길을 걷고 있었다. 평범한 하루가 될 줄 알았다.

그 순간— 하늘에서 빛이 쏟아졌다. 연우는 눈을 가렸다.

빛이 사라지자 주변이 완전히 달라져 있었다. 하지만 그것은 시작에 불과했다.

도대체 무슨 일이 벌어진 걸까. 연우는 주변을 둘러보았다.

저 멀리서 누군가 다가오고 있었다. 그림자가 점점 커졌다.

과연 그는 적일까, 아군일까. 연우는 긴장한 채 기다렸다.

설마 이곳이 그 전설 속의... 아직 모르고 있었다. 이곳의 진정한 의미를.

다가온 인물이 말했다. "반갑다, 연우." 어떻게 자신의 이름을 아는 걸까.

그제서야 연우는 상황을 받아들였다. 그렇게 새로운 일상이 시작되었다.
`.trim();

/** High information density / info dump text */
const INFO_DUMP_TEXT = `
대한제국은 1897년에 건국되었다. 초대 황제 고종이 즉위했다. 수도는 한양이었다.

경복궁은 조선 시대에 건축되었다. 광화문은 경복궁의 정문이었다. 근정전에서 조회를 열었다.

1905년 을사조약이 체결되었다. 이토 히로부미가 주도했다. 외교권이 박탈되었다.

1910년 한일병합조약으로 대한제국은 멸망했다. 조선총독부가 설치되었다. 식민지배가 시작되었다.
`.trim();

/** Text with good accelerating velocity curve */
const ACCELERATING_TEXT = `
마을은 고요했다. 사람들은 각자의 일상을 보내고 있었다.

서윤은 창밖을 바라보며 생각에 잠겼다. 오늘따라 바람이 차갑게 느껴졌다.

하지만 마을 밖 숲에서는 이상한 기운이 감돌고 있었다. 사냥꾼 준혁이 처음 발견했다.

준혁은 서윤에게 달려왔다. "큰일이다. 숲에서 이상한 생물이 나타났다." 서윤의 눈이 커졌다.

마을 사람들이 모여들었다. 촌장 김도현이 긴급 회의를 소집했다. 비밀 지하실의 고문서를 꺼냈다.

고문서에 따르면, 이 생물은 500년 전 봉인된 존재였다. 봉인이 풀린 것이다.

서윤은 결심했다. 비밀을 품은 채 숲으로 향했다. 그때, 갑자기 하늘이 붉게 물들었다.

"사실은 내가 봉인을 풀었다." 서윤 뒤에서 준혁의 목소리가 들렸다. 서윤은 돌아보았다. 준혁의 눈이 붉게 빛나고 있었다.
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("measurePageTurner", () => {
  describe("cliffhanger strength", () => {
    it("should give high cliffhanger score to crisis/revelation ending", () => {
      const result = measurePageTurner(STRONG_CLIFFHANGER);
      expect(result.cliffhangerStrength).toBeGreaterThanOrEqual(0.8);
      expect(["crisis", "revelation", "cliffhanger"]).toContain(result.details.endingType);
    });

    it("should give low cliffhanger score to flat/resolved ending", () => {
      const result = measurePageTurner(FLAT_ENDING);
      expect(result.cliffhangerStrength).toBeLessThanOrEqual(0.4);
      expect(result.details.endingType).toBe("flat");
    });
  });

  describe("unresolved threads", () => {
    it("should detect multiple unresolved threads in cliffhanger text", () => {
      const result = measurePageTurner(STRONG_CLIFFHANGER);
      expect(result.unresolvedThreads).toBeGreaterThanOrEqual(2);
      expect(result.details.threadTypes.length).toBeGreaterThanOrEqual(2);
    });

    it("should detect few or no threads in flat ending text", () => {
      const result = measurePageTurner(FLAT_ENDING);
      expect(result.unresolvedThreads).toBeLessThanOrEqual(1);
    });
  });

  describe("micro-hooks", () => {
    it("should detect multiple micro-hooks in text with many mid-chapter hooks", () => {
      const result = measurePageTurner(MICRO_HOOKS_TEXT);
      expect(result.microHooks).toBeGreaterThanOrEqual(3);
    });

    it("should detect few micro-hooks in flat text", () => {
      const result = measurePageTurner(FLAT_ENDING);
      expect(result.microHooks).toBeLessThanOrEqual(1);
    });
  });

  describe("information velocity", () => {
    it("should detect info dump as non-optimal velocity", () => {
      const result = measurePageTurner(INFO_DUMP_TEXT);
      // Info dump should have high velocity (possibly too high)
      expect(result.details.velocityProfile.length).toBeGreaterThan(0);
      // The velocity should be notably higher than moderate text
      expect(result.informationVelocity).toBeGreaterThan(0);
    });

    it("should produce a velocity profile with one entry per paragraph", () => {
      const result = measurePageTurner(ACCELERATING_TEXT);
      const paragraphCount = ACCELERATING_TEXT.split("\n\n").filter((p) => p.trim()).length;
      expect(result.details.velocityProfile.length).toBe(paragraphCount);
    });
  });

  describe("overall scoring", () => {
    it("should score strong cliffhanger text significantly higher than flat text", () => {
      const cliffResult = measurePageTurner(STRONG_CLIFFHANGER);
      const flatResult = measurePageTurner(FLAT_ENDING);
      expect(cliffResult.score).toBeGreaterThan(flatResult.score);
      expect(cliffResult.score - flatResult.score).toBeGreaterThanOrEqual(0.15);
    });

    it("should score accelerating text well", () => {
      const result = measurePageTurner(ACCELERATING_TEXT);
      expect(result.score).toBeGreaterThanOrEqual(0.6);
    });

    it("should return score in 0-1 range", () => {
      for (const text of [STRONG_CLIFFHANGER, FLAT_ENDING, MICRO_HOOKS_TEXT, INFO_DUMP_TEXT, ACCELERATING_TEXT]) {
        const result = measurePageTurner(text);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });

    it("should handle empty text gracefully", () => {
      const result = measurePageTurner("");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it("should handle single paragraph text", () => {
      const result = measurePageTurner("짧은 문장 하나뿐인 텍스트.");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe("result structure", () => {
    it("should return all required fields", () => {
      const result = measurePageTurner(STRONG_CLIFFHANGER);
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("unresolvedThreads");
      expect(result).toHaveProperty("cliffhangerStrength");
      expect(result).toHaveProperty("informationVelocity");
      expect(result).toHaveProperty("microHooks");
      expect(result).toHaveProperty("details");
      expect(result.details).toHaveProperty("threadTypes");
      expect(result.details).toHaveProperty("endingType");
      expect(result.details).toHaveProperty("velocityProfile");
      expect(Array.isArray(result.details.threadTypes)).toBe(true);
      expect(Array.isArray(result.details.velocityProfile)).toBe(true);
    });
  });
});
