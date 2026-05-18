import { z } from "zod";

import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";
import type { WorldModelRunResult } from "@/lib/sim/world-runner";

const StringListSchema = z.array(z.string());

export const EpisodeSelectionModeSchema = z.enum(["timeline_order", "highest_impact", "lowest_impact"]);

export const WorldEpisodeWindowSchema = z.object({
  episodeNumber: z.number().int().positive(),
  timelineIndex: z.number().int().nonnegative(),
  sourceSceneIds: StringListSchema,
  sourceEventIds: StringListSchema,
  sourceActionLogIds: StringListSchema,
  sourceStateDeltaIds: StringListSchema,
  sourcePlanLifecycleIds: StringListSchema,
  sourceDirectorPressureIds: StringListSchema,
  startChapter: z.number().int().positive(),
  endChapter: z.number().int().positive(),
  primaryCharacterIds: StringListSchema,
  selectionScore: z.number().min(0).max(1),
  selectionReasons: StringListSchema,
  editorialIntent: z.string(),
});

export const EpisodeSelectionPlanSchema = z.object({
  mode: z.literal("episode_selection"),
  selectionMode: EpisodeSelectionModeSchema,
  targetEpisodeCount: z.number().int().positive(),
  sourceSceneCount: z.number().int().nonnegative(),
  sourceActionLogCount: z.number().int().nonnegative(),
  selectedEpisodeCount: z.number().int().nonnegative(),
  windows: z.array(WorldEpisodeWindowSchema),
  diagnostics: z.object({
    averageSelectionScore: z.number().min(0).max(1),
    minSelectionScore: z.number().min(0).max(1),
    maxSelectionScore: z.number().min(0).max(1),
    coveredActionLogRatio: z.number().min(0).max(1),
    averageStateDeltaCountPerEpisode: z.number().nonnegative(),
    averagePlanLifecycleCountPerEpisode: z.number().nonnegative(),
    averageSceneCountPerEpisode: z.number().nonnegative(),
    averageActionLogCountPerEpisode: z.number().nonnegative(),
  }),
});

export type EpisodeSelectionMode = z.infer<typeof EpisodeSelectionModeSchema>;
export type WorldEpisodeWindow = z.infer<typeof WorldEpisodeWindowSchema>;
export type EpisodeSelectionPlan = z.infer<typeof EpisodeSelectionPlanSchema>;

export interface SelectEpisodeWindowsInput {
  result: WorldModelRunResult;
  targetEpisodeCount?: number;
  selectionMode?: EpisodeSelectionMode;
  maxScenesPerEpisode?: number;
  targetActionLogsPerEpisode?: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function magnitude(values: number[]): number {
  return values.reduce((sum, value) => sum + Math.abs(value), 0);
}

function actionLogsForScene(sceneLog: SceneLog, actionLogs: CharacterActionLog[]): CharacterActionLog[] {
  const sourceIds = new Set(sceneLog.sourceActionLogIds);
  const bySourceIds = actionLogs.filter((log) => sourceIds.has(log.logId));
  if (bySourceIds.length > 0) {
    return bySourceIds;
  }
  return actionLogs.filter((log) => log.chapter === sceneLog.chapter);
}

function relationshipMagnitude(sceneLog: SceneLog): number {
  return sceneLog.dialogueTurns.reduce((sum, turn) => {
    const shift = turn.interactionDynamics?.relationshipShift;
    const power = turn.interactionDynamics?.powerShift;
    const emotional = turn.interactionDynamics?.emotionalShift;
    return sum + magnitude([
      shift?.trustDelta ?? 0,
      shift?.suspicionDelta ?? 0,
      shift?.dependencyDelta ?? 0,
      shift?.hostilityDelta ?? 0,
      power?.delta ?? 0,
      emotional?.intensityDelta ?? 0,
    ]);
  }, 0);
}

function stateDeltaIds(actionLogs: CharacterActionLog[]): string[] {
  return actionLogs.flatMap((log) =>
    log.actualEffect.stateDeltas.map((delta) => `${log.logId}:${delta.deltaId}`)
  );
}

function planLifecycleIds(actionLogs: CharacterActionLog[]): string[] {
  return actionLogs.map((log) => log.planLifecycle.planId).filter(Boolean);
}

interface TimelineSceneEntry {
  sceneLog: SceneLog;
  actionLogs: CharacterActionLog[];
  timelineIndex: number;
}

function scoreWindow(sceneLogs: SceneLog[], actionLogs: CharacterActionLog[]): number {
  const logCountScore = clamp(actionLogs.length / Math.max(8, sceneLogs.length * 10));
  const participantScore = clamp(unique([
    ...sceneLogs.flatMap((sceneLog) => sceneLog.participantIds),
    ...actionLogs.map((log) => log.actorId),
    ...actionLogs.flatMap((log) => log.targetIds),
  ]).length / 5);
  const relationshipScore = clamp(sceneLogs.reduce((sum, sceneLog) =>
    sum + relationshipMagnitude(sceneLog), 0) / Math.max(48, sceneLogs.length * 64));
  const consequenceScore = clamp(
    actionLogs.filter((log) => log.actualEffect.followUpActionSeed.trim().length > 0).length
      / Math.max(1, actionLogs.length),
  );
  const pressureScore = clamp(
    actionLogs.reduce((sum, log) => sum + Math.abs(log.actualEffect.scenePressureDelta), 0)
      / Math.max(1, actionLogs.length * 2),
  );
  const concreteDeltaScore = clamp(stateDeltaIds(actionLogs).length / Math.max(3, actionLogs.length * 5));
  const planStatusScore = clamp(unique(actionLogs.map((log) => log.planLifecycle.nextStatus)).length / 4);
  const operatorFrictionScore = clamp(
    actionLogs.filter((log) => log.action.operator.status !== "accepted").length
      / Math.max(1, actionLogs.length * 0.25),
  );
  const subtextScore = clamp(
    sceneLogs.flatMap((sceneLog) => sceneLog.dialogueTurns)
      .filter((turn) => turn.informationWithheld.length > 0).length
      / Math.max(1, actionLogs.length),
  );
  const directorPressureScore = clamp(
    sceneLogs.reduce((sum, sceneLog) => sum + sceneLog.narrativeDirectorPressures.length, 0)
      / Math.max(1, sceneLogs.length),
  );

  const multiSceneContinuity = sceneLogs.length > 1 ? Math.min(0.05, (sceneLogs.length - 1) * 0.025) : 0;

  return round2(clamp(
    logCountScore * 0.1
    + participantScore * 0.1
    + relationshipScore * 0.16
    + consequenceScore * 0.12
    + pressureScore * 0.1
    + concreteDeltaScore * 0.12
    + planStatusScore * 0.08
    + operatorFrictionScore * 0.1
    + subtextScore * 0.07
    + directorPressureScore * 0.05
    + multiSceneContinuity,
  ));
}

function selectionReasons(sceneLogs: SceneLog[], actionLogs: CharacterActionLog[], score: number): string[] {
  const reasons: string[] = [];
  const relationship = sceneLogs.reduce((sum, sceneLog) => sum + relationshipMagnitude(sceneLog), 0);
  const uniqueActors = unique(actionLogs.map((log) => log.actorId));
  const highPressureLogs = actionLogs.filter((log) => Math.abs(log.actualEffect.scenePressureDelta) >= 2);
  const deltaCount = stateDeltaIds(actionLogs).length;
  const completedPlanCount = actionLogs.filter((log) => log.planLifecycle.nextStatus === "completed").length;
  const directorPressureCount = sceneLogs.reduce((sum, sceneLog) =>
    sum + sceneLog.narrativeDirectorPressures.length, 0);

  if (relationship >= 12) reasons.push("관계/권력/감정 변화가 장면 안에서 크게 움직임");
  if (uniqueActors.length >= 4) reasons.push("여러 인물이 독립적으로 행동해 episode 밀도가 높음");
  if (highPressureLogs.length > 0) reasons.push("다음 행동을 부르는 압력 로그가 있음");
  if (deltaCount >= Math.max(3, actionLogs.length * 3)) reasons.push("concrete state delta가 충분해 소설화 근거가 있음");
  if (completedPlanCount > 0) reasons.push("완료된 plan lifecycle이 있어 장면 단락을 만들 수 있음");
  if (directorPressureCount > 0) reasons.push("NarrativeDirector world pressure가 episode 조건으로 깔려 있음");
  if (sceneLogs.some((sceneLog) =>
    sceneLog.dialogueTurns.some((turn) => turn.informationWithheld.length > 0)
  )) {
    reasons.push("드러난 말과 숨긴 정보 사이의 subtext가 있음");
  }
  if (sceneLogs.length > 1) reasons.push("인접 timeline scene을 하나의 episode 호흡으로 묶음");
  if (score >= 0.82) reasons.push("소설 장면으로 확장할 가치가 높은 window");
  if (reasons.length === 0) reasons.push("timeline continuity를 유지하기 위한 연결 episode");

  return reasons;
}

function editorialIntent(sceneLogs: SceneLog[], actionLogs: CharacterActionLog[]): string {
  const actors = unique(actionLogs.map((log) => log.actorName)).slice(0, 4).join(", ");
  const title = sceneLogs.map((sceneLog) => sceneLog.title).join(" / ");
  const pressure = actionLogs
    .map((log) => log.actualEffect.followUpActionSeed)
    .find((value) => value.trim().length > 0)
    ?? sceneLogs.at(-1)?.sceneOutcome
    ?? "";
  const readablePressure = pressure
    .replace(/은\/는/g, "은")
    .replace(/이\/가/g, "이")
    .replace(/을\/를/g, "을");
  const fallbackActors = unique(sceneLogs.flatMap((sceneLog) => sceneLog.participantNames)).join(", ");
  return `${title}: ${actors || fallbackActors}의 행동 로그를 묶어 '${readablePressure}' 압력을 독자용 episode로 자른다.`;
}

function buildWindow(
  sceneLogs: SceneLog[],
  actionLogs: CharacterActionLog[],
  timelineIndex: number,
): WorldEpisodeWindow {
  const firstScene = sceneLogs[0]!;
  const lastScene = sceneLogs.at(-1) ?? firstScene;
  const score = scoreWindow(sceneLogs, actionLogs);
  const sourceStateDeltaIds = stateDeltaIds(actionLogs);
  const sourcePlanLifecycleIds = planLifecycleIds(actionLogs);
  const sourceDirectorPressureIds = sceneLogs.flatMap((sceneLog) =>
    sceneLog.narrativeDirectorPressures.map((pressure) => pressure.pressureId)
  );
  return WorldEpisodeWindowSchema.parse({
    episodeNumber: timelineIndex + 1,
    timelineIndex,
    sourceSceneIds: sceneLogs.map((sceneLog) => sceneLog.sceneId),
    sourceEventIds: unique(sceneLogs.flatMap((sceneLog) => sceneLog.sourceEventIds)),
    sourceActionLogIds: actionLogs.map((log) => log.logId),
    sourceStateDeltaIds,
    sourcePlanLifecycleIds,
    sourceDirectorPressureIds,
    startChapter: firstScene.chapter,
    endChapter: lastScene.chapter,
    primaryCharacterIds: unique([
      ...actionLogs.map((log) => log.actorId),
      ...actionLogs.flatMap((log) => log.targetIds),
      ...sceneLogs.flatMap((sceneLog) => sceneLog.participantIds),
    ]).slice(0, 6),
    selectionScore: score,
    selectionReasons: selectionReasons(sceneLogs, actionLogs, score),
    editorialIntent: editorialIntent(sceneLogs, actionLogs),
  });
}

function buildEntryWindows(entries: TimelineSceneEntry[]): WorldEpisodeWindow {
  return buildWindow(
    entries.map((entry) => entry.sceneLog),
    entries.flatMap((entry) => entry.actionLogs),
    entries[0]?.timelineIndex ?? 0,
  );
}

function buildSingleSceneEntries(result: WorldModelRunResult): TimelineSceneEntry[] {
  return result.sceneLogs.map((sceneLog, timelineIndex) => ({
    sceneLog,
    actionLogs: actionLogsForScene(sceneLog, result.actionLogs),
    timelineIndex,
  }));
}

function selectTimelineOrderWindows(
  entries: TimelineSceneEntry[],
  targetEpisodeCount: number,
  targetActionLogsPerEpisode: number,
  maxScenesPerEpisode: number,
): WorldEpisodeWindow[] {
  if (targetEpisodeCount >= entries.length) {
    return entries.map((entry) => buildEntryWindows([entry]));
  }

  const windows: WorldEpisodeWindow[] = [];
  let cursor = 0;
  for (let episodeIndex = 0; episodeIndex < targetEpisodeCount && cursor < entries.length; episodeIndex += 1) {
    const remainingEpisodes = targetEpisodeCount - episodeIndex - 1;
    const latestExclusiveEnd = entries.length - remainingEpisodes;
    const group: TimelineSceneEntry[] = [];
    let actionCount = 0;

    while (cursor < latestExclusiveEnd && group.length < maxScenesPerEpisode) {
      const next = entries[cursor]!;
      group.push(next);
      actionCount += next.actionLogs.length;
      cursor += 1;
      if (actionCount >= targetActionLogsPerEpisode && group.length > 0) break;
    }

    windows.push(buildEntryWindows(group));
  }

  return windows;
}

function buildImpactCandidates(
  entries: TimelineSceneEntry[],
  maxScenesPerEpisode: number,
): WorldEpisodeWindow[] {
  const candidates: WorldEpisodeWindow[] = [];
  for (let start = 0; start < entries.length; start += 1) {
    for (let span = 1; span <= maxScenesPerEpisode && start + span <= entries.length; span += 1) {
      candidates.push(buildEntryWindows(entries.slice(start, start + span)));
    }
  }
  return candidates;
}

function selectHighestImpactWindows(
  entries: TimelineSceneEntry[],
  targetEpisodeCount: number,
  maxScenesPerEpisode: number,
): WorldEpisodeWindow[] {
  const usedTimelineIndexes = new Set<number>();
  const selected: WorldEpisodeWindow[] = [];
  const candidates = buildImpactCandidates(entries, maxScenesPerEpisode)
    .sort((left, right) =>
      right.selectionScore - left.selectionScore
      || right.sourceActionLogIds.length - left.sourceActionLogIds.length
      || left.timelineIndex - right.timelineIndex
    );

  for (const candidate of candidates) {
    const coveredIndexes = Array.from(
      { length: candidate.sourceSceneIds.length },
      (_, index) => candidate.timelineIndex + index,
    );
    if (coveredIndexes.some((index) => usedTimelineIndexes.has(index))) continue;
    const unusedAfterCandidate = entries.filter((entry) =>
      !usedTimelineIndexes.has(entry.timelineIndex)
      && !coveredIndexes.includes(entry.timelineIndex)
    ).length;
    if (selected.length + 1 + unusedAfterCandidate < targetEpisodeCount) continue;
    selected.push(candidate);
    for (const index of coveredIndexes) usedTimelineIndexes.add(index);
    if (selected.length >= targetEpisodeCount) break;
  }

  if (selected.length < targetEpisodeCount) {
    for (const entry of entries) {
      if (usedTimelineIndexes.has(entry.timelineIndex)) continue;
      selected.push(buildEntryWindows([entry]));
      usedTimelineIndexes.add(entry.timelineIndex);
      if (selected.length >= targetEpisodeCount) break;
    }
  }

  return selected.sort((left, right) => left.timelineIndex - right.timelineIndex);
}

function selectLowestImpactWindows(
  entries: TimelineSceneEntry[],
  targetEpisodeCount: number,
  maxScenesPerEpisode: number,
): WorldEpisodeWindow[] {
  const usedTimelineIndexes = new Set<number>();
  const selected: WorldEpisodeWindow[] = [];
  const candidates = buildImpactCandidates(entries, maxScenesPerEpisode)
    .sort((left, right) =>
      left.selectionScore - right.selectionScore
      || left.sourceActionLogIds.length - right.sourceActionLogIds.length
      || left.timelineIndex - right.timelineIndex
    );

  for (const candidate of candidates) {
    const coveredIndexes = Array.from(
      { length: candidate.sourceSceneIds.length },
      (_, index) => candidate.timelineIndex + index,
    );
    if (coveredIndexes.some((index) => usedTimelineIndexes.has(index))) continue;
    const unusedAfterCandidate = entries.filter((entry) =>
      !usedTimelineIndexes.has(entry.timelineIndex)
      && !coveredIndexes.includes(entry.timelineIndex)
    ).length;
    if (selected.length + 1 + unusedAfterCandidate < targetEpisodeCount) continue;
    selected.push(candidate);
    for (const index of coveredIndexes) usedTimelineIndexes.add(index);
    if (selected.length >= targetEpisodeCount) break;
  }

  if (selected.length < targetEpisodeCount) {
    for (const entry of entries) {
      if (usedTimelineIndexes.has(entry.timelineIndex)) continue;
      selected.push(buildEntryWindows([entry]));
      usedTimelineIndexes.add(entry.timelineIndex);
      if (selected.length >= targetEpisodeCount) break;
    }
  }

  return selected.sort((left, right) => left.timelineIndex - right.timelineIndex);
}

export function selectEpisodeWindows(input: SelectEpisodeWindowsInput): EpisodeSelectionPlan {
  const selectionMode = input.selectionMode ?? "timeline_order";
  const entries = buildSingleSceneEntries(input.result);
  const targetEpisodeCount = Math.max(1, input.targetEpisodeCount ?? entries.length);
  const maxScenesPerEpisode = Math.max(1, input.maxScenesPerEpisode ?? 3);
  const targetActionLogsPerEpisode = Math.max(
    1,
    input.targetActionLogsPerEpisode
      ?? Math.ceil(input.result.actionLogs.length / Math.max(1, targetEpisodeCount)),
  );
  const selected = selectionMode === "highest_impact"
    ? selectHighestImpactWindows(entries, targetEpisodeCount, maxScenesPerEpisode)
    : selectionMode === "lowest_impact"
      ? selectLowestImpactWindows(entries, targetEpisodeCount, maxScenesPerEpisode)
      : selectTimelineOrderWindows(entries, targetEpisodeCount, targetActionLogsPerEpisode, maxScenesPerEpisode);
  const windows = selected.map((window, index) => WorldEpisodeWindowSchema.parse({
    ...window,
    episodeNumber: index + 1,
  }));
  const scores = windows.map((window) => window.selectionScore);
  const coveredActionLogIds = new Set(windows.flatMap((window) => window.sourceActionLogIds));
  const totalSceneCount = windows.reduce((sum, window) => sum + window.sourceSceneIds.length, 0);
  const totalActionLogCount = windows.reduce((sum, window) => sum + window.sourceActionLogIds.length, 0);
  const totalStateDeltaCount = windows.reduce((sum, window) => sum + window.sourceStateDeltaIds.length, 0);
  const totalPlanLifecycleCount = windows.reduce((sum, window) => sum + window.sourcePlanLifecycleIds.length, 0);

  return EpisodeSelectionPlanSchema.parse({
    mode: "episode_selection",
    selectionMode,
    targetEpisodeCount,
    sourceSceneCount: input.result.sceneLogs.length,
    sourceActionLogCount: input.result.actionLogs.length,
    selectedEpisodeCount: windows.length,
    windows,
    diagnostics: {
      averageSelectionScore: round2(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length)),
      minSelectionScore: round2(scores.length > 0 ? Math.min(...scores) : 0),
      maxSelectionScore: round2(Math.max(0, ...scores)),
      coveredActionLogRatio: round2(coveredActionLogIds.size / Math.max(1, input.result.actionLogs.length)),
      averageStateDeltaCountPerEpisode: round2(totalStateDeltaCount / Math.max(1, windows.length)),
      averagePlanLifecycleCountPerEpisode: round2(totalPlanLifecycleCount / Math.max(1, windows.length)),
      averageSceneCountPerEpisode: round2(totalSceneCount / Math.max(1, windows.length)),
      averageActionLogCountPerEpisode: round2(totalActionLogCount / Math.max(1, windows.length)),
    },
  });
}
