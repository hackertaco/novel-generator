import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const PURPOSES = [
  "establish_state",
  "information_discovery",
  "relationship_probe",
  "secret_pressure",
  "advance_plot",
  "foreshadowing",
  "aftermath",
] as const;

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function actionForChapter(chapter: number) {
  const logId = `act_ch${String(chapter).padStart(3, "0")}_001_rael`;
  const previousLogId = `act_ch${String(chapter - 1).padStart(3, "0")}_001_rael`;
  return {
    logId,
    chapter,
    tick: 1,
    actorId: "rael",
    actorName: "라엘",
    targetIds: ["elysia"],
    targetNames: ["엘리시아"],
    observed: chapter > 1 ? [`직전 pressure [pressure:${previousLogId}]`] : ["시작 압력"],
    privateState: {
      activeObjective: "엘리시아의 반응을 확인한다",
      agentBrain: {
        knownFacts: ["라엘와 관계가 있다"],
      },
    },
    action: {
      type: "probe_dialogue",
      intent: "엘리시아의 반응을 확인한다",
      speechActHint: "probe",
      operator: {
        status: "accepted",
      },
    },
    planLifecycle: {
      nextStatus: "active",
      linkedFollowUpActionSeed: `다음 행동으로 이어질 압력 [pressure:${logId}]`,
    },
    visibleBehavior: chapter <= 10
      ? "라엘은 같은 미소를 고정한 채 손끝을 접는다"
      : `라엘은 ${chapter}번째 단서를 확인한다`,
    intendedEffect: "상대의 의심을 흔든다",
    actualEffect: {
      targetReaction: `엘리시아는 ${chapter}번째 의심을 기록한다`,
      followUpActionSeed: `다음 행동으로 이어질 압력 [pressure:${logId}]`,
      scenePressureDelta: 2,
      stateDeltas: [
        { domain: "memory", summary: "기억 갱신" },
        { domain: "belief", summary: "믿음 갱신" },
        { domain: "plan", summary: "계획 갱신" },
        { domain: "pressure", summary: "압력 증가" },
        { domain: "relationship", summary: "관계 변화" },
      ],
      worldGameMaster: {
        status: "accepted",
      },
    },
    memoryUpdates: [{ characterId: "rael", summary: "기억 갱신" }],
    beliefUpdates: [{ characterId: "rael", belief: "믿음 갱신" }],
    trustDeltas: { elysia: -1 },
  };
}

function resolutionForChapter(chapter: number) {
  const logId = `act_ch${String(chapter).padStart(3, "0")}_001_rael`;
  return {
    resolutionId: `res_${logId}`,
    chapter,
    tick: 1,
    sourceActionLogIds: [logId],
    speechDraft: {
      speakerName: "라엘",
      targetNames: ["엘리시아"],
      utteranceCandidate: `크레센트 영애, ${chapter}번째 기록을 보죠.`,
      speechAct: "probe",
      surfaceMeaning: "기록 확인",
      hiddenIntention: "상대의 의심을 흔든다",
      subtext: "직접 말하지 않고 압박한다",
    },
    targetInterpretations: [
      {
        characterName: "엘리시아",
        interpretedAs: "라엘의 계산으로 읽는다",
        emotionalResponse: `의심 ${chapter}을 기록한다`,
      },
    ],
    emotionalShift: {
      intensityDelta: 2,
    },
    powerShift: {
      axis: "information",
      delta: 2,
    },
    relationshipShift: {
      trustDelta: -1,
      suspicionDelta: 1,
      dependencyDelta: 0,
      hostilityDelta: 0,
      reason: "의심이 늘어난다",
    },
    misunderstandings: ["겉말과 속뜻을 분리해 받아들인다"],
    newSharedFacts: ["새 단서가 생긴다"],
    writerHooks: {
      linePurpose: `기록 확인 ${chapter}`,
    },
  };
}

function sceneForChapter(chapter: number) {
  const logId = `act_ch${String(chapter).padStart(3, "0")}_001_rael`;
  return {
    sceneId: `scene_${chapter}`,
    chapter,
    title: `${chapter}화`,
    scenePurpose: PURPOSES[(chapter - 1) % PURPOSES.length],
    location: `장소 ${chapter % 3}`,
    sourceActionLogIds: [logId],
    dialogueTurns: [
      {
        speakerName: "라엘",
        utterance: `크레센트 영애, ${chapter}번째 기록을 보죠.`,
        hiddenIntent: "상대의 의심을 흔든다",
        sourceActionLogIds: [logId],
      },
    ],
  };
}

describe("world-log-causal-report", () => {
  it("warns on mechanical purpose cycles, repeated visible behavior, and character particle errors", () => {
    const runDir = mkdtempSync(join(tmpdir(), "world-log-report-"));
    const chapters = Array.from({ length: 35 }, (_, index) => index + 1);
    writeJson(join(runDir, "action-logs.json"), chapters.map(actionForChapter));
    writeJson(join(runDir, "interaction-resolutions.json"), chapters.map(resolutionForChapter));
    writeJson(join(runDir, "scene-logs.json"), chapters.map(sceneForChapter));

    execFileSync("npx", [
      "tsx",
      "scripts/world-log-causal-report.ts",
      "--run",
      runDir,
      "--chapters",
      "1-35",
      "--out",
      runDir,
    ], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    const report = JSON.parse(
      readFileSync(join(runDir, "causal-chain-report-001-035.json"), "utf8"),
    );
    expect(report.summary.arcProgression.verdict).toBe("warn");
    expect(report.summary.arcProgression.scenePurposeCyclePeriod).toBe(7);
    expect(report.summary.arcProgression.notes).toEqual(
      expect.arrayContaining([expect.stringContaining("기계적으로 반복")]),
    );
    expect(report.summary.textRepetition.verdict).toBe("warn");
    expect(report.summary.textRepetition.notes).toEqual(
      expect.arrayContaining([expect.stringContaining("같은 표면 행동")]),
    );
    expect(report.summary.languageIntegrity.verdict).toBe("warn");
    expect(report.summary.languageIntegrity.topParticleIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "라엘와",
        }),
      ]),
    );
  });
});
