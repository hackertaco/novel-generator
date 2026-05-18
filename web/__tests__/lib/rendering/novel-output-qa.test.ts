import { describe, expect, it } from "vitest";

import {
  evaluateNovelOutputCorpusQA,
  evaluateNovelOutputQA,
} from "@/lib/rendering/novel-output-qa";
import type { WorldEpisodeWindow } from "@/lib/rendering/episode-selector";
import type { WorldLogEditorialMap } from "@/lib/rendering/world-log-editorial-map";
import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";

function makeActionLog(
  logId: string,
  actorName: string,
  targetName: string,
  visibleBehavior: string,
): CharacterActionLog {
  return {
    logId,
    chapter: 1,
    sceneId: "scene_001",
    tick: Number(logId.split("_").at(-1) ?? 1),
    actorId: actorName,
    actorName,
    observed: [],
    privateState: {
      storyRole: "역할",
      agentRole: "ally",
      roleMission: "비공개 임무",
      currentPlan: "계획",
      surfaceGoal: "표면 목표",
      hiddenGoal: "숨은 목표",
      activeObjective: "목표",
      activeIntentionId: `intention:${actorName}:probe_dialogue:${targetName}:plan`,
      activeFear: "두려움",
      decisionPriorities: [],
      autonomyRule: "자율 규칙",
      knownFacts: [],
      retrievedMemoryIds: [`memory:${actorName}:relationship:${targetName}`],
      trustSnapshot: {},
    },
    action: {
      type: "probe_dialogue",
      operator: {
        id: "information:probe_dialogue",
        category: "information",
        preconditions: [`${targetName} is present`],
        expectedEffects: [`forces ${targetName} to answer or hide information`],
        cost: "의도를 읽힐 수 있다",
        risk: `${targetName}이 역으로 해석할 수 있다`,
        status: "accepted",
        statusReason: "fixture accepted",
      },
      intent: "묻는다",
      rationale: "확인한다",
      speechActHint: "probe",
    },
    planLifecycle: {
      planId: `${logId}:plan`,
      previousStatus: "active",
      nextStatus: "active",
      reason: "fixture plan remains active",
      activeIntention: "계획 -> 묻는다",
      linkedFollowUpActionSeed: `${targetName}이 ${actorName}에게 반응할 이유가 생긴다`,
    },
    targetIds: [targetName],
    targetNames: [targetName],
    visibleBehavior,
    intendedEffect: `${targetName}의 반응을 끌어낸다`,
    actualEffect: {
      targetReaction: `${targetName}은 바로 답하지 않고 ${actorName}을 바라본다`,
      followUpActionSeed: `${targetName}이 ${actorName}에게 반응할 이유가 생긴다`,
      scenePressureDelta: 1,
      stateDeltas: [
        {
          deltaId: `${logId}:memory`,
          domain: "memory",
          operation: "record",
          summary: `${actorName}이 ${visibleBehavior}를 기록한다`,
          entityIds: [actorName, targetName],
          cause: "묻는다",
        },
        {
          deltaId: `${logId}:belief`,
          domain: "belief",
          operation: "record",
          summary: `${actorName}의 ${targetName} 판단이 갱신된다`,
          entityIds: [actorName, targetName],
          cause: "반응",
        },
        {
          deltaId: `${logId}:plan`,
          domain: "plan",
          operation: "update",
          summary: `${targetName}의 다음 선택지가 좁혀진다`,
          entityIds: [actorName, targetName],
          cause: visibleBehavior,
        },
      ],
      worldGameMaster: {
        status: "accepted",
        reason: "fixture accepted",
        checkedPreconditions: [`${targetName} is present`],
        failedPreconditions: [],
        stateDeltaIds: [`${logId}:memory`, `${logId}:belief`, `${logId}:plan`],
        witnessCharacterIds: [],
        newAffordances: ["probe_dialogue"],
      },
    },
    memoryUpdates: [],
    beliefUpdates: [],
    trustDeltas: { [targetName]: -1 },
    sourceRailIds: [],
  };
}

const episodeWindow: WorldEpisodeWindow = {
  episodeNumber: 1,
  timelineIndex: 0,
  sourceSceneIds: ["scene_001"],
  sourceEventIds: ["evt_001"],
  sourceActionLogIds: ["act_001", "act_002", "act_003"],
  sourceStateDeltaIds: [
    "act_001:act_001:memory",
    "act_001:act_001:belief",
    "act_001:act_001:plan",
    "act_002:act_002:memory",
    "act_002:act_002:belief",
    "act_002:act_002:plan",
    "act_003:act_003:memory",
    "act_003:act_003:belief",
    "act_003:act_003:plan",
  ],
  sourcePlanLifecycleIds: ["act_001:plan", "act_002:plan", "act_003:plan"],
  sourceDirectorPressureIds: ["director_001"],
  startChapter: 1,
  endChapter: 1,
  primaryCharacterIds: ["엘리시아", "카이젠", "세레나"],
  selectionScore: 0.9,
  selectionReasons: ["테스트"],
  editorialIntent: "행동 로그를 소설화한다.",
};

const sceneLog: SceneLog = {
  sceneId: "scene_001",
  chapter: 1,
  title: "은잔의 응접실",
  scenePurpose: "relationship_probe",
  location: "크레센트 공작가",
  atmosphere: "낮은 정적",
  sensoryAnchors: ["은잔", "창빛"],
  sourceEventIds: ["evt_001"],
  sourceActionLogIds: ["act_001", "act_002", "act_003"],
  participantIds: ["엘리시아", "카이젠", "세레나"],
  participantNames: ["엘리시아", "카이젠", "세레나"],
  dialogueTurns: [],
  emotionalArc: {
    start: "정적",
    turn: "질문",
    end: "압력",
  },
  sceneOutcome: "다음 질문이 필요해진다.",
  rendererGuidance: [],
};

const actionLogs = [
  makeActionLog("act_001", "엘리시아", "카이젠", "엘리시아는 은잔을 내려놓으며 카이젠을 바라본다"),
  makeActionLog("act_002", "카이젠", "엘리시아", "카이젠은 웃음을 늦게 올리고 한 걸음 물러선다"),
  makeActionLog("act_003", "세레나", "엘리시아", "세레나는 손끝으로 찻잔 가장자리를 쓸며 미소를 고친다"),
];

const fullSceneEditorialMap: WorldLogEditorialMap = {
  mode: "world_log_editorial_map",
  sceneCount: 1,
  actionLogCount: 3,
  averageEditorialScore: 0.9,
  minEditorialScore: 0.9,
  maxEditorialScore: 0.9,
  treatmentCounts: {
    summary_bridge: 0,
    compressed_scene: 0,
    expanded_scene: 0,
    full_scene: 1,
  },
  chapters: [{
    sceneId: "scene_001",
    chapter: 1,
    title: "은잔의 응접실",
    scenePurpose: "relationship_probe",
    location: "크레센트 공작가",
    editorialScore: 0.9,
    narrativeTreatment: "full_scene",
    suggestedWordBudget: 900,
    primaryCharacterIds: ["엘리시아", "카이젠", "세레나"],
    sourceActionLogIds: ["act_001", "act_002", "act_003"],
    keyActionLogIds: ["act_001", "act_002"],
    longArcThreadIds: ["long-arc:test"],
    incidentThreadIds: ["incident:test"],
    reasons: ["독자가 직접 체감해야 하는 핵심 장면"],
  }],
  diagnostics: {
    fullOrExpandedRatio: 1,
    summaryBridgeRatio: 0,
    distinctLongArcCount: 1,
    distinctIncidentCount: 1,
    weakSceneCount: 0,
    notes: ["test"],
  },
};

describe("novel output QA", () => {
  it("scores a source-grounded episode without meta leaks", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "크레센트 공작가의 응접실에는 은잔과 창빛이 낮게 놓여 있었다.",
        "엘리시아는 은잔을 내려놓으며 카이젠을 바라보았다. \"다음 말은 신중히 고르세요.\"",
        "카이젠은 웃음을 늦게 올리고 한 걸음 물러섰다. 바로 답하지 않는 침묵이 두 사람 사이에 남았다.",
        "세레나는 손끝으로 찻잔 가장자리를 쓸며 미소를 고쳤다. \"언니가 걱정돼서 그래.\"",
        "엘리시아는 세레나를 지나 다시 카이젠을 보았다. 누군가 다시 물어야 하는 순간이었다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(report.score).toBeGreaterThanOrEqual(0.75);
    expect(report.metrics.metaLeakSafety.score).toBe(1);
    expect(report.metrics.sourceCoverage.score).toBeGreaterThanOrEqual(0.6);
    expect(report.metrics.sourceStateDeltaGrounding.score).toBe(1);
    expect(report.issues.some((issue) => issue.code === "meta_leak")).toBe(false);
  });

  it("treats natural short names as the same character for Korean prose matching", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "엘리시아는 은잔을 내려놓으며 카이젠을 바라보았다.",
        "카이젠은 웃음을 늦게 올리고 한 걸음 물러섰다.",
        "세레나는 손끝으로 찻잔 가장자리를 쓸며 미소를 고쳤다.",
      ].join("\n"),
      episodeWindow: {
        ...episodeWindow,
        sourceActionLogIds: ["act_001", "act_002", "act_003"],
      },
      sceneLogs: [sceneLog],
      actionLogs: [
        makeActionLog("act_001", "엘리시아 크레센트", "카이젠 아우레아", "엘리시아 크레센트는 은잔을 내려놓으며 카이젠 아우레아를 바라본다"),
        makeActionLog("act_002", "카이젠 아우레아", "엘리시아 크레센트", "카이젠 아우레아는 웃음을 늦게 올리고 한 걸음 물러선다"),
        makeActionLog("act_003", "세레나 크레센트", "엘리시아 크레센트", "세레나 크레센트는 손끝으로 찻잔 가장자리를 쓸며 미소를 고친다"),
      ],
    });

    expect(report.metrics.sourceCoverage.score).toBe(1);
    expect(report.metrics.characterAgency.score).toBeGreaterThanOrEqual(0.9);
  });

  it("warns when an episode has no source state delta backing", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "엘리시아는 은잔을 내려놓으며 카이젠을 바라보았다.",
        "카이젠은 웃음을 늦게 올리고 한 걸음 물러섰다.",
      ].join("\n"),
      episodeWindow: {
        ...episodeWindow,
        sourceStateDeltaIds: [],
      },
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(report.metrics.sourceStateDeltaGrounding.score).toBeLessThan(0.8);
    expect(report.issues.map((issue) => issue.code)).toContain("weak_source_state_delta_grounding");
  });

  it("checks whether full-scene editorial treatment receives enough prose space", () => {
    const tooShort = evaluateNovelOutputQA({
      text: [
        "엘리시아는 은잔을 내려놓으며 카이젠을 바라보았다.",
        "카이젠은 한 걸음 물러섰다. \"다음에 듣죠.\"",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
      worldLogEditorialMap: fullSceneEditorialMap,
    });
    const expanded = evaluateNovelOutputQA({
      text: [
        "크레센트 공작가의 응접실에는 은잔과 창빛이 낮게 놓여 있었다.",
        "엘리시아는 은잔을 내려놓으며 카이젠을 바라보았다. \"다음 말은 신중히 고르세요.\"",
        "카이젠은 웃음을 늦게 올리고 한 걸음 물러섰다. \"그 정도로 흔들릴 분은 아니시죠.\"",
        "세레나는 손끝으로 찻잔 가장자리를 쓸며 미소를 고쳤다. \"언니가 걱정돼서 그래.\"",
        "엘리시아는 세레나를 지나 다시 카이젠을 보았다. 문가의 그림자가 먼저 흔들렸다.",
        "카이젠은 장갑 끝을 접고 대답을 늦췄다. \"묻고 싶은 게 있으면 지금 하시죠.\"",
        "세레나는 잔을 내려놓지 않았다. 미소는 남았지만 손끝은 찻잔에서 떨어져 있었다.",
        "엘리시아는 창빛 아래로 서류를 밀었다. \"그럼 이 이름부터 확인하겠습니다.\"",
        "그 말 뒤에 카이젠은 문 쪽을 막았고, 세레나는 한 박자 늦게 숨을 삼켰다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
      worldLogEditorialMap: fullSceneEditorialMap,
    });

    expect(tooShort.metrics.treatmentCompliance.score).toBeLessThan(0.75);
    expect(tooShort.issues.map((issue) => issue.code)).toContain("weak_editorial_treatment_compliance");
    expect(expanded.metrics.treatmentCompliance.score).toBeGreaterThanOrEqual(0.75);
  });

  it("penalizes meta leaks, weak source coverage, and repeated surface phrases", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "act_ch001_001 sourceActionLogId scene_log_001.",
        "공기가 가라앉았다. 공기가 가라앉았다. 공기가 가라앉았다. 공기가 가라앉았다.",
        "어떤 사람이 무언가를 했다.",
      ].join("\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(report.verdict).toBe("fail");
    expect(report.metrics.metaLeakSafety.score).toBe(0);
    expect(report.metrics.sourceCoverage.score).toBeLessThan(0.5);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["meta_leak", "low_source_coverage"]),
    );
  });

  it("distinguishes report-style scene jumps from action-based scene bridges", () => {
    const reportStyle = evaluateNovelOutputQA({
      text: [
        "아무도 잔을 비우지 않았다.",
        "그 아침이 지나고, 황궁의 방에서는 같은 일이 반복되었다.",
        "장소만 바뀌었을 뿐 모두가 다시 서로를 보았다.",
        "그리고 마법탑에서는 다른 정적이 내려앉았다.",
      ].join("\n\n"),
      episodeWindow: {
        ...episodeWindow,
        sourceSceneIds: ["scene_001", "scene_002", "scene_003"],
      },
      sceneLogs: [
        sceneLog,
        { ...sceneLog, sceneId: "scene_002", location: "황궁", sensoryAnchors: ["향초"] },
        { ...sceneLog, sceneId: "scene_003", location: "마법탑", sensoryAnchors: ["돌벽"] },
      ],
      actionLogs,
    });
    const bridged = evaluateNovelOutputQA({
      text: [
        "엘리시아는 은잔을 내려놓으며 카이젠을 바라보았다.",
        "문이 열릴 때 차가운 향초 냄새가 먼저 스며들었다.",
        "카이젠은 길을 열고, 마리안은 뒤를 따랐다.",
        "계단을 오르는 발소리가 돌벽에 얇게 부딪혔다.",
        "안쪽으로 더 들어가자 세레나의 손끝이 찻잔 가장자리를 스쳤다.",
      ].join("\n\n"),
      episodeWindow: {
        ...episodeWindow,
        sourceSceneIds: ["scene_001", "scene_002", "scene_003"],
      },
      sceneLogs: [
        sceneLog,
        { ...sceneLog, sceneId: "scene_002", location: "황궁", sensoryAnchors: ["향초"] },
        { ...sceneLog, sceneId: "scene_003", location: "마법탑", sensoryAnchors: ["돌벽"] },
      ],
      actionLogs,
    });

    expect(reportStyle.metrics.sceneSeam.score).toBeLessThan(0.75);
    expect(bridged.metrics.sceneSeam.score).toBeGreaterThanOrEqual(0.75);
  });

  it("penalizes abstract genre-fiction filler and weak endings", () => {
    const abstract = evaluateNovelOutputQA({
      text: [
        "라벤더 별궁의 공기가 무겁게 가라앉았다.",
        "엘리시아는 카이젠의 의도를 파악하려 애썼고, 이 순간이 운명을 바꿀 선택의 순간임을 느꼈다.",
        "그녀의 마음속에서 불안과 결심이 뒤섞였다.",
        "숨은 의도를 가늠하려는 듯 생각에 잠겼고, 다음 행동을 결정해야 할 순간이 다가왔다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });
    const concrete = evaluateNovelOutputQA({
      text: [
        "크레센트 공작가의 응접실에는 은잔과 창빛이 낮게 놓여 있었다.",
        "엘리시아는 은잔을 내려놓으며 카이젠을 바라보았다. \"다음 말은 신중히 고르세요.\"",
        "카이젠은 웃음을 늦게 올리고 한 걸음 물러섰다. 대답 대신 장갑 낀 손으로 문 쪽을 가리켰다.",
        "세레나는 손끝으로 찻잔 가장자리를 쓸며 미소를 고쳤다. \"언니가 걱정돼서 그래.\"",
        "그러나 엘리시아는 고개를 저었다. 잔이 받침에 닿는 소리가 짧게 끊겼다.",
        "문이 열리자 복도의 발소리가 멈췄고, 카이젠은 먼저 길을 막았다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(abstract.metrics.novelness.score).toBeLessThan(0.5);
    expect(abstract.issues.map((issue) => issue.code)).toContain("low_novelness");
    expect(abstract.issues.find((issue) => issue.code === "low_novelness")?.evidence).toEqual(
      expect.arrayContaining(["의도를", "의도를 파악", "파악하려", "느꼈다", "결심", "숨은", "생각에 잠겼"]),
    );
    expect(concrete.metrics.novelness.score).toBeGreaterThan(abstract.metrics.novelness.score);
  });

  it("rejects pseudo-novel prose that only cycles silence, gaze, and next-move pressure", () => {
    const pseudoNovel = evaluateNovelOutputQA({
      text: [
        "라벤더 별궁의 공기는 차분하게 내려앉아 있었다. 라엘은 찻잔 가장자리를 느리게 쓸며 엘리시아를 향해 조용히 말을 꺼냈다. \"크레센트 영애, 이 일은 감정으로 밀어붙일 문제가 아닙니다.\" 그의 목소리는 부드러웠지만, 말끝에 남은 무게는 분명했다.",
        "마리안이 한 걸음 앞으로 다가오며 엘리시아에게 작은 부탁을 건넸다. 그녀의 태도는 조심스러웠지만, 엘리시아는 눈썹을 살짝 올리며 대답 대신 그 말을 되받았다. \"그 말은 여기서 멈추는 게 좋겠어요.\" 라벤더 별궁의 공기가 다시금 무겁게 가라앉았다.",
        "세레나는 흐트러진 표정을 빠르게 거두고 미소를 지었다. \"제가 뭘 할 수 있겠어요. 전 그저 곁에 있었을 뿐인데요.\" 침묵이 길게 이어졌고, 엘리시아는 세레나의 말끝을 곱씹으며 그녀를 응시했다.",
        "카이젠은 말없이 엘리시아를 살피고 있었다. 그의 시선은 그녀의 작은 움직임 하나하나를 놓치지 않고 있었다. 엘리시아는 그의 시선을 느끼며 고개를 돌렸다. \"이 상황에서 어떤 선택을 하실 건가요?\"",
        "엘리시아는 손끝에 닿은 은잔을 내려놓고 주변의 모든 시선을 한 번에 모아 받았다. 그녀는 그 순간, 다음 움직임을 움직여야 했다. 그들은 서로의 시선 속에서 다음 움직임을 준비하며, 그 침묵 속에 얇은 의미를 탐색했다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(pseudoNovel.verdict).not.toBe("pass");
    expect(pseudoNovel.issues.map((issue) => issue.code)).toContain("pseudo_scene_filler");
    expect(pseudoNovel.metrics.novelness.details.pseudoSceneFillerHits).toEqual(
      expect.arrayContaining(["다음 움직임", "얇은 의미", "시선을 한 번에 모아 받"]),
    );
  });

  it("flags mechanical dialogue staging that makes rendered prose read like log translation", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "크레센트 공작가의 응접실에는 은잔과 창빛이 낮게 놓여 있었다.",
        "엘리시아는 카이젠 쪽으로 손끝을 찻잔에 둔 채 입을 열었다. \"다음 말은 신중히 고르세요.\"",
        "카이젠은 엘리시아 쪽으로 흐트러지지 않은 미소로 입을 열었다. \"그 정도로 흔들릴 분은 아니시죠.\"",
        "세레나는 엘리시아 쪽으로 손끝을 소매 안쪽으로 접으며 입을 열었다. \"언니가 걱정돼서 그래요.\"",
        "마리안은 엘리시아 쪽으로 목소리를 낮춰 입을 열었다. \"제가 확인하겠습니다.\"",
        "엘리시아는 은잔을 내려놓았고, 문가의 숨소리가 짧게 끊겼다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(report.verdict).not.toBe("pass");
    expect(report.issues.map((issue) => issue.code)).toContain("mechanical_dialogue_staging");
    expect(report.metrics.novelness.details.mechanicalDialogueStagingHits).toEqual(
      expect.arrayContaining([
        "쪽으로 손끝을 찻잔에 둔 채 입을 열었다",
        "쪽으로 흐트러지지 않은 미소로 입을 열었다",
      ]),
    );
  });

  it("flags episodes that repeat the same dialogue and dramatic beat", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "라벤더 별궁의 문은 닫혀 있었고, 은잔에는 창빛이 얇게 남았다.",
        "엘리시아는 잔을 내려놓으며 카이젠을 바라보았다. \"위험은 이미 가까워졌습니다.\"",
        "카이젠은 고개를 조금 돌렸다. \"위험은 이미 가까워졌습니다.\"",
        "세레나는 손끝을 접으며 웃지 않았다. \"위험은 이미 가까워졌습니다.\"",
        "마리안은 문가에서 한 박자 늦게 멈췄다. \"위험은 이미 가까워졌습니다.\"",
        "라엘은 잔에서 손을 떼지 않은 채 같은 말을 기다렸다. \"위험은 이미 가까워졌습니다.\"",
        "엘리시아는 다시 잔을 내려놓았고, 모두가 같은 침묵 안에서 다음 말을 기다렸다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(report.verdict).not.toBe("pass");
    expect(report.metrics.dramaticVariation.score).toBeLessThan(0.75);
    expect(report.issues.map((issue) => issue.code)).toContain("low_dramatic_variation");
    expect(report.metrics.dramaticVariation.details.repeatedDialogueLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "위험은 이미 가까워졌습니다.", count: 5 }),
      ]),
    );
  });

  it("flags Korean particle errors and deterministic polish residue", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "마법탑 알카나의 공기는 차갑게 내려앉았다.",
        "라엘의 말끝가 엘리시아의 귀에 걸렸고, 세레나는 얇은 의미를 숨긴 채 미소를 고쳤다.",
        "그 안에 깔린 잔 받침 소리은 쉽게 넘길 수 없었다.",
        "엘리시아는 다음 움직임을 움직임하기 위한 말 없는 기척을 붙잡았다.",
        "마리안은 말밑를 확인하려는 듯 손끝을 접었다.",
        "세레나는 미소를 유지했다고, 라엘은 대답을 늦췄다.",
        "카이젠은 대답을 기다린고, 마리안은 협력을 요구한고, 엘리시아는 물러섰다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(report.verdict).not.toBe("pass");
    expect(report.issues.map((issue) => issue.code)).toContain("surface_polish_artifact");
    expect(report.metrics.novelness.details.surfacePolishArtifactHits).toEqual(
      expect.arrayContaining(["말끝가", "얇은 의미", "잔 받침 소리", "소리은", "다음 움직임", "움직임을 움직", "움직임하기", "말밑를", "다고,", "린고,", "한고,"]),
    );
  });

  it("flags human readability artifacts that pass structural source coverage", () => {
    const report = evaluateNovelOutputQA({
      text: [
        "크레센트 공작가의 응접실에는 은잔과 창빛이 낮게 놓여 있었다.",
        "라엘은 엘리시아를 바라보았다. \"제가 나서겠습니다. 당신은 말만 아끼시면 됩니다. 대답은 한 번이면 됩니다.\"",
        "엘리시아는 잠깐 숨을 골랐다. \"황태자 전하, 기록이 닫히기 전에요.\"",
        "세레나는 손끝으로 찻잔 가장자리를 쓸며 미소를 고쳤다. \"피하지 않으셔도 됩니다.\"",
        "카이젠은 웃었다. \"공작 영애님, 크레센트 영애, 지금 움직이죠.\"",
        "닫힌 장부는 대답보다 오래 남았다. 문가의 빛이 낮게 흔들렸다.",
        "그래서 방 안의 질문은 한 사람에게만 머물지 않았다.",
      ].join("\n\n"),
      episodeWindow,
      sceneLogs: [sceneLog],
      actionLogs,
    });

    expect(report.verdict).not.toBe("pass");
    expect(report.issues.map((issue) => issue.code)).toContain("human_readability_artifact");
    expect(report.metrics.novelness.details.humanReadabilityArtifactHits).toEqual(
      expect.arrayContaining([
        "제가 나서겠습니다. 당신은 말만 아끼시면 됩니다",
        "대답은 한 번이면 됩니다",
        "잠깐 숨을 골랐다",
        "기록이 닫히기 전에요",
        "피하지 않으셔도 됩니다",
        "공작 영애님, 크레센트 영애",
        "대답보다 오래 남았다",
        "그래서 방 안의 질문은 한 사람에게만 머물지 않았다",
      ]),
    );
  });

  it("flags cross-episode prose skeleton repetition that per-episode QA can miss", () => {
    const repeatedEpisodes = Array.from({ length: 12 }, (_, index) => ({
      episodeNumber: index + 1,
      text: [
        `# ${index + 1}화. 반복되는 방`,
        "크레센트 공작가 응접실의 아침은 지나치게 얌전했다.",
        "엘리시아는 잔을 내려놓으며 카이젠을 바라보았다. \"위험은 가까워졌습니다.\"",
        "카이젠은 시선을 잠깐 낮췄다. 대답보다 먼저 문손잡이 쪽의 그림자가 움직였다.",
        "대화는 끝난 것처럼 보였지만, 아무것도 끝나지 않았다.",
      ].join("\n\n"),
      verdict: "pass" as const,
      score: 0.95,
    }));
    const variedEpisodes = Array.from({ length: 12 }, (_, index) => ({
      episodeNumber: index + 1,
      text: [
        `# ${index + 1}화. 다른 방 ${index}`,
        [
          "크레센트 공작가 하인 통로에는 젖은 흙 냄새가 먼저 올라왔다.",
          "황궁 아우레아 문서실에서는 잉크가 마르기 전에 발소리가 멎었다.",
          "마법탑 알카나 금서 서고의 돌벽은 새벽빛을 거의 돌려주지 않았다.",
          "라벤더 별궁 온실 회랑에는 향료 상자의 뚜껑이 반쯤 열려 있었다.",
        ][index % 4]!,
        [
          "엘리시아는 장갑 끝을 접고 아직 묻지 않은 이름을 삼켰다.",
          "카이젠은 문가에서 한 걸음 물러나 허락의 폭을 다시 쟀다.",
          "세레나는 웃음을 올리기 전, 찻잔의 위치부터 고쳤다.",
          "마리안은 명단 끈을 손바닥 아래 숨기고 복도 소리를 들었다.",
        ][index % 4]!,
        [
          "마지막에는 닫힌 문보다 남은 발자국이 더 오래 보였다.",
          "그날의 끝은 대답이 아니라 비어 있는 서명란으로 남았다.",
          "누구도 먼저 일어나지 않았고, 촛농만 낮게 굳었다.",
          "다음 사람의 손에 넘어간 것은 말이 아니라 아직 젖은 잉크였다.",
        ][index % 4]!,
      ].join("\n\n"),
      verdict: "pass" as const,
      score: 0.95,
    }));

    const repeated = evaluateNovelOutputCorpusQA({ episodes: repeatedEpisodes });
    const varied = evaluateNovelOutputCorpusQA({ episodes: variedEpisodes });

    expect(repeated.verdict).not.toBe("pass");
    expect(repeated.repeatedOpeningSkeletons[0]).toEqual(expect.objectContaining({
      count: 12,
    }));
    expect(repeated.repeatedEndingSkeletons[0]).toEqual(expect.objectContaining({
      count: 12,
    }));
    expect(varied.verdict).toBe("pass");
    expect(varied.repeatedOpeningSkeletons).toHaveLength(0);
    expect(varied.repeatedEndingSkeletons).toHaveLength(0);
  });
});
