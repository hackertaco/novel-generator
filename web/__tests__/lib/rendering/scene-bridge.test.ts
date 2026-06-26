import { describe, expect, it } from "vitest";

import {
  buildSceneBridges,
  formatSceneBridgesForPrompt,
  type SceneBridge,
} from "@/lib/rendering/scene-bridge";

const scenes = [
  {
    sceneId: "scene_log_ch001_01",
    chapter: 1,
    location: "응접실",
    sceneOutcome: "세레나가 반지 케이스를 닫고 자리를 떴다.",
    sourceActionLogIds: ["log-a1", "log-a2"],
  },
  {
    sceneId: "scene_log_ch002_01",
    chapter: 2,
    location: "서재",
    sceneOutcome: "엘리시아가 명단을 손에 넣었다.",
    sourceActionLogIds: ["log-b1"],
  },
  {
    sceneId: "scene_log_ch003_01",
    chapter: 3,
    location: "서재",
    sceneOutcome: "라엘이 증인을 불러들였다.",
    sourceActionLogIds: [],
  },
];

const actionLogs = [
  { logId: "log-a1", chapter: 1, followUpActionSeed: "" },
  { logId: "log-a2", chapter: 1, followUpActionSeed: "반지 케이스의 행방을 확인해야 한다" },
  { logId: "log-b1", chapter: 2, followUpActionSeed: "" },
];

const events = [
  { id: "evt-b1", chapter: 2, sceneId: "scene_log_ch002_01", triggeredBy: "세레나가 반지 케이스를 닫았다" },
  { id: "evt-c1", chapter: 3, sceneId: "scene_log_ch003_01" },
];

const schemeTimeline = [
  { chapter: 1, characterId: "serena", stageId: "신뢰_쌓기" },
  { chapter: 3, characterId: "serena", stageId: "증거_심기" },
];

describe("scene bridge", () => {
  it("builds one bridge per adjacent scene pair", () => {
    const bridges = buildSceneBridges({ sceneLogs: scenes, actionLogs, events, schemeTimeline });
    expect(bridges).toHaveLength(2);
    const [first, second] = bridges as [SceneBridge, SceneBridge];

    expect(first.fromSceneId).toBe("scene_log_ch001_01");
    expect(first.toSceneId).toBe("scene_log_ch002_01");
    expect(first.timeGapChapters).toBe(1);
    expect(first.fromLocation).toBe("응접실");
    expect(first.toLocation).toBe("서재");
    expect(first.unresolvedPressure).toBe("반지 케이스의 행방을 확인해야 한다");
    expect(first.openingCause).toBe("세레나가 반지 케이스를 닫았다");
    expect(first.schemeStage).toBe("신뢰_쌓기");

    expect(second.unresolvedPressure).toBe("엘리시아가 명단을 손에 넣었다");
    expect(second.openingCause).toBe("");
    expect(second.schemeStage).toBe("증거_심기");
  });

  it("returns no bridges for single or empty scene lists", () => {
    expect(buildSceneBridges({ sceneLogs: [], actionLogs, events, schemeTimeline })).toEqual([]);
    expect(buildSceneBridges({ sceneLogs: [scenes[0]!], actionLogs, events, schemeTimeline })).toEqual([]);
  });

  it("formats bridges as prompt material", () => {
    const bridges = buildSceneBridges({ sceneLogs: scenes, actionLogs, events, schemeTimeline });
    const text = formatSceneBridgesForPrompt(bridges);
    expect(text).toContain("scene_log_ch001_01 → scene_log_ch002_01");
    expect(text).toContain("응접실 → 서재");
    expect(text).toContain("반지 케이스의 행방을 확인해야 한다");
    expect(text).toContain("시간단위 1");
    expect(text).toContain("신뢰_쌓기");
    expect(text).toContain("같은 장소(서재)");
  });
});
