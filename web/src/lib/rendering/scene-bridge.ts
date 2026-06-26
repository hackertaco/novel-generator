/**
 * Scene Bridge — 한 화로 묶인 장면 사이의 간극(시간/장소/미해결 압력/계기/음모 단계)을
 * 시뮬 로그에서 결정적으로 뽑는다. LLM 없음.
 *
 * 배경: 역전 모드의 beats 절단이 outline beats가 몰래 하던 부업(장면 연결 등뼈)까지
 * 제거했다. writer에게 "이어라"는 지시 대신 이을 재료를 입력으로 준다.
 * spec: docs/superpowers/specs/2026-06-08-outline-inversion-design.md
 */

export interface SceneBridgeSceneInput {
  sceneId: string;
  chapter: number;
  location: string;
  sceneOutcome: string;
  sourceActionLogIds: string[];
}

export interface SceneBridgeActionLogInput {
  logId: string;
  chapter: number;
  followUpActionSeed: string;
}

export interface SceneBridgeEventInput {
  id: string;
  chapter: number;
  sceneId?: string;
  triggeredBy?: string;
}

export interface SceneBridgeSchemeEntry {
  chapter: number;
  characterId: string;
  stageId: string;
}

export interface SceneBridge {
  fromSceneId: string;
  toSceneId: string;
  /** chapter(시간단위) 차이 — 0이면 같은 시간단위 안에서 이어진다. */
  timeGapChapters: number;
  fromLocation: string;
  toLocation: string;
  /** 앞 장면이 남긴 미해결 압력 — 마지막 비어있지 않은 followUpActionSeed, 없으면 sceneOutcome. */
  unresolvedPressure: string;
  /** 다음 장면 첫 사건의 triggeredBy — 그 장면이 열린 계기. 없으면 빈 문자열. */
  openingCause: string;
  /** 도착 장면 시점에 진행 중인 음모 단계. 없으면 null. */
  schemeStage: string | null;
}

function unresolvedPressureFor(
  scene: SceneBridgeSceneInput,
  actionLogs: SceneBridgeActionLogInput[],
): string {
  const ids = new Set(scene.sourceActionLogIds);
  const sceneActionLogs = ids.size > 0
    ? actionLogs.filter((log) => ids.has(log.logId))
    // sourceActionLogIds가 비면 같은 chapter 로그로 폴백 (episode-window-writer.ts의 actionLogsForScene와 동일 패턴)
    : actionLogs.filter((log) => log.chapter === scene.chapter);
  for (let index = sceneActionLogs.length - 1; index >= 0; index -= 1) {
    const seed = sceneActionLogs[index]!.followUpActionSeed.trim();
    if (seed.length > 0) return seed;
  }
  return scene.sceneOutcome.replace(/[.。]$/, "");
}

function openingCauseFor(
  scene: SceneBridgeSceneInput,
  events: SceneBridgeEventInput[],
): string {
  const sceneEvents = events.filter((event) =>
    // event에 sceneId가 없으면 chapter로 폴백 매칭
    event.sceneId === scene.sceneId || (!event.sceneId && event.chapter === scene.chapter)
  );
  for (const event of sceneEvents) {
    const cause = event.triggeredBy?.trim() ?? "";
    if (cause.length > 0) return cause;
  }
  return "";
}

function schemeStageAt(chapter: number, schemeTimeline: SceneBridgeSchemeEntry[]): string | null {
  let stage: string | null = null;
  for (const entry of schemeTimeline) {
    if (entry.chapter <= chapter) stage = entry.stageId;
  }
  return stage;
}

// 전제: sceneLogs는 timeline(chapter) 순서로 정렬되어 들어온다 — 인접 쌍을 순차로 잇는다.
export function buildSceneBridges(input: {
  sceneLogs: SceneBridgeSceneInput[];
  actionLogs: SceneBridgeActionLogInput[];
  events: SceneBridgeEventInput[];
  schemeTimeline: SceneBridgeSchemeEntry[];
}): SceneBridge[] {
  const bridges: SceneBridge[] = [];
  for (let index = 0; index + 1 < input.sceneLogs.length; index += 1) {
    const from = input.sceneLogs[index]!;
    const to = input.sceneLogs[index + 1]!;
    bridges.push({
      fromSceneId: from.sceneId,
      toSceneId: to.sceneId,
      timeGapChapters: to.chapter - from.chapter,
      fromLocation: from.location,
      toLocation: to.location,
      unresolvedPressure: unresolvedPressureFor(from, input.actionLogs),
      openingCause: openingCauseFor(to, input.events),
      schemeStage: schemeStageAt(to.chapter, input.schemeTimeline),
    });
  }
  return bridges;
}

export function formatSceneBridgesForPrompt(bridges: SceneBridge[]): string {
  return bridges.map((bridge, index) => {
    const elapsed = bridge.timeGapChapters <= 0
      ? "같은 시간단위 안에서 이어짐"
      : `시간단위 ${bridge.timeGapChapters} 경과`;
    const move = bridge.fromLocation === bridge.toLocation
      ? `같은 장소(${bridge.toLocation})`
      : `${bridge.fromLocation} → ${bridge.toLocation}`;
    return [
      `- 다리 ${index + 1} [${bridge.fromSceneId} → ${bridge.toSceneId}]`,
      `  - 경과: ${elapsed} / 장소: ${move}`,
      `  - 앞 장면의 미해결 압력: ${bridge.unresolvedPressure || "-"}`,
      bridge.openingCause ? `  - 다음 장면이 열린 계기: ${bridge.openingCause}` : "",
      bridge.schemeStage ? `  - 진행 중인 음모 단계: ${bridge.schemeStage}` : "",
    ].filter((line) => line.length > 0).join("\n");
  }).join("\n");
}
