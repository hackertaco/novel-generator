import { z } from "zod";

import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";

const StringListSchema = z.array(z.string());

export const WorldLogNarrativeTreatmentSchema = z.enum([
  "summary_bridge",
  "compressed_scene",
  "expanded_scene",
  "full_scene",
]);

export const WorldLogSceneEditorialDecisionSchema = z.object({
  sceneId: z.string(),
  chapter: z.number().int().positive(),
  title: z.string(),
  scenePurpose: z.string(),
  location: z.string(),
  editorialScore: z.number().min(0).max(1),
  narrativeTreatment: WorldLogNarrativeTreatmentSchema,
  suggestedWordBudget: z.number().int().positive(),
  primaryCharacterIds: StringListSchema,
  sourceActionLogIds: StringListSchema,
  keyActionLogIds: StringListSchema,
  longArcThreadIds: StringListSchema,
  incidentThreadIds: StringListSchema,
  reasons: StringListSchema,
});

export const WorldLogEditorialMapSchema = z.object({
  mode: z.literal("world_log_editorial_map"),
  sceneCount: z.number().int().nonnegative(),
  actionLogCount: z.number().int().nonnegative(),
  averageEditorialScore: z.number().min(0).max(1),
  minEditorialScore: z.number().min(0).max(1),
  maxEditorialScore: z.number().min(0).max(1),
  treatmentCounts: z.record(WorldLogNarrativeTreatmentSchema, z.number().int().nonnegative()),
  chapters: z.array(WorldLogSceneEditorialDecisionSchema),
  diagnostics: z.object({
    fullOrExpandedRatio: z.number().min(0).max(1),
    summaryBridgeRatio: z.number().min(0).max(1),
    distinctLongArcCount: z.number().int().nonnegative(),
    distinctIncidentCount: z.number().int().nonnegative(),
    weakSceneCount: z.number().int().nonnegative(),
    notes: StringListSchema,
  }),
});

export type WorldLogNarrativeTreatment = z.infer<typeof WorldLogNarrativeTreatmentSchema>;
export type WorldLogSceneEditorialDecision = z.infer<typeof WorldLogSceneEditorialDecisionSchema>;
export type WorldLogEditorialMap = z.infer<typeof WorldLogEditorialMapSchema>;

export interface BuildWorldLogEditorialMapInput {
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
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
  const bySourceId = actionLogs.filter((log) => sourceIds.has(log.logId));
  if (bySourceId.length > 0) return bySourceId;
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

function purposeScore(sceneLog: SceneLog): number {
  const weights: Record<string, number> = {
    establish_state: 0.35,
    information_discovery: 0.56,
    relationship_probe: 0.72,
    secret_pressure: 0.76,
    advance_plot: 0.78,
    foreshadowing: 0.62,
    aftermath: 0.38,
  };
  return weights[sceneLog.scenePurpose] ?? 0.45;
}

function threadIds(sceneLog: SceneLog): string[] {
  return unique(sceneLog.narrativeDirectorPressures.flatMap((pressure) => pressure.targetThreadIds));
}

function scoreScene(sceneLog: SceneLog, actionLogs: CharacterActionLog[]): number {
  const actionDensity = clamp(actionLogs.length / 10);
  const relationshipScore = clamp(relationshipMagnitude(sceneLog) / 64);
  const consequenceScore = clamp(
    actionLogs.filter((log) => log.actualEffect.followUpActionSeed.trim().length > 0).length
      / Math.max(1, actionLogs.length),
  );
  const stateDeltaScore = clamp(
    actionLogs.reduce((sum, log) => sum + log.actualEffect.stateDeltas.length, 0)
      / Math.max(4, actionLogs.length * 5),
  );
  const pressureScore = clamp(
    actionLogs.reduce((sum, log) => sum + Math.abs(log.actualEffect.scenePressureDelta), 0)
      / Math.max(1, actionLogs.length * 2),
  );
  const subtextScore = clamp(
    sceneLog.dialogueTurns.filter((turn) => turn.informationWithheld.length > 0).length
      / Math.max(1, sceneLog.dialogueTurns.length),
  );
  const gmFrictionScore = clamp(
    actionLogs.filter((log) => log.action.operator.status !== "accepted").length
      / Math.max(1, actionLogs.length * 0.25),
  );
  const planClosureScore = clamp(
    actionLogs.filter((log) => log.planLifecycle.nextStatus === "completed").length
      / Math.max(1, actionLogs.length * 0.35),
  );
  const longArcScore = threadIds(sceneLog).some((threadId) => threadId.startsWith("long-arc:")) ? 0.08 : 0;
  const incidentScore = threadIds(sceneLog).some((threadId) => threadId.startsWith("incident:")) ? 0.06 : 0;

  return round2(clamp(
    actionDensity * 0.08
    + relationshipScore * 0.18
    + consequenceScore * 0.12
    + stateDeltaScore * 0.1
    + pressureScore * 0.12
    + subtextScore * 0.11
    + gmFrictionScore * 0.08
    + planClosureScore * 0.08
    + purposeScore(sceneLog) * 0.15
    + longArcScore
    + incidentScore,
  ));
}

function fallbackTreatmentForScore(score: number): WorldLogNarrativeTreatment {
  if (score >= 0.78) return "full_scene";
  if (score >= 0.62) return "expanded_scene";
  if (score >= 0.44) return "compressed_scene";
  return "summary_bridge";
}

function rankedTreatment(input: {
  score: number;
  rank: number;
  sceneCount: number;
}): WorldLogNarrativeTreatment {
  if (input.sceneCount < 8) return fallbackTreatmentForScore(input.score);

  const fullCutoff = Math.max(1, Math.ceil(input.sceneCount * 0.18));
  const expandedCutoff = Math.max(fullCutoff + 1, Math.ceil(input.sceneCount * 0.5));
  const compressedCutoff = Math.max(expandedCutoff + 1, Math.ceil(input.sceneCount * 0.85));
  if (input.rank < fullCutoff && input.score >= 0.62) return "full_scene";
  if (input.rank < expandedCutoff && input.score >= 0.5) return "expanded_scene";
  if (input.rank < compressedCutoff && input.score >= 0.34) return "compressed_scene";
  return "summary_bridge";
}

function wordBudgetForTreatment(treatment: WorldLogNarrativeTreatment): number {
  const budgets: Record<WorldLogNarrativeTreatment, number> = {
    summary_bridge: 120,
    compressed_scene: 260,
    expanded_scene: 520,
    full_scene: 900,
  };
  return budgets[treatment];
}

function treatmentRank(treatment: WorldLogNarrativeTreatment): number {
  const ranks: Record<WorldLogNarrativeTreatment, number> = {
    summary_bridge: 0,
    compressed_scene: 1,
    expanded_scene: 2,
    full_scene: 3,
  };
  return ranks[treatment];
}

function maxTreatment(
  current: WorldLogNarrativeTreatment,
  minimum: WorldLogNarrativeTreatment,
): WorldLogNarrativeTreatment {
  return treatmentRank(current) >= treatmentRank(minimum) ? current : minimum;
}

function reasonsForScene(
  sceneLog: SceneLog,
  actionLogs: CharacterActionLog[],
  score: number,
  treatment: WorldLogNarrativeTreatment,
  landmarkReason?: string,
): string[] {
  const reasons: string[] = [];
  const relationship = relationshipMagnitude(sceneLog);
  const longArcThreads = threadIds(sceneLog).filter((threadId) => threadId.startsWith("long-arc:"));
  const incidentThreads = threadIds(sceneLog).filter((threadId) => threadId.startsWith("incident:"));
  const hiddenTurnCount = sceneLog.dialogueTurns.filter((turn) => turn.informationWithheld.length > 0).length;
  const nonAcceptedCount = actionLogs.filter((log) => log.action.operator.status !== "accepted").length;
  const completedPlanCount = actionLogs.filter((log) => log.planLifecycle.nextStatus === "completed").length;

  if (treatment === "full_scene") reasons.push("독자가 직접 체감해야 하는 핵심 장면");
  if (treatment === "expanded_scene") reasons.push("대사와 반응을 늘려 장면화할 가치가 있음");
  if (treatment === "compressed_scene") reasons.push("원인/결과는 살리되 압축 가능한 연결 장면");
  if (treatment === "summary_bridge") reasons.push("다음 장면을 위한 징검다리 로그");
  if (landmarkReason) reasons.push(landmarkReason);
  if (relationship >= 16) reasons.push("관계/권력/감정 변화가 큼");
  if (hiddenTurnCount > 0) reasons.push("겉말과 숨긴 정보 사이의 subtext가 있음");
  if (actionLogs.some((log) => log.actualEffect.followUpActionSeed.trim().length > 0)) {
    reasons.push("다음 행동을 부르는 follow-up pressure가 있음");
  }
  if (nonAcceptedCount > 0) reasons.push("GM partial/backfired 결과가 있어 사건 마찰이 있음");
  if (completedPlanCount > 0) reasons.push("완료된 plan lifecycle이 있어 단락 종결점을 만들 수 있음");
  if (longArcThreads.length > 0) reasons.push(`장기 국면 연결: ${longArcThreads.join(", ")}`);
  if (incidentThreads.length > 0) reasons.push(`사건 축 연결: ${incidentThreads.join(", ")}`);
  if (score < 0.44) reasons.push("점수가 낮아 길게 쓰면 리듬이 늘어질 수 있음");

  return unique(reasons);
}

function keyActionLogIds(actionLogs: CharacterActionLog[]): string[] {
  return actionLogs
    .slice()
    .sort((left, right) => {
      const leftScore = Math.abs(left.actualEffect.scenePressureDelta)
        + left.actualEffect.stateDeltas.length * 0.2
        + Object.values(left.trustDeltas).reduce((sum, value) => sum + Math.abs(value), 0);
      const rightScore = Math.abs(right.actualEffect.scenePressureDelta)
        + right.actualEffect.stateDeltas.length * 0.2
        + Object.values(right.trustDeltas).reduce((sum, value) => sum + Math.abs(value), 0);
      return rightScore - leftScore || left.tick - right.tick;
    })
    .slice(0, 3)
    .map((log) => log.logId);
}

export function buildWorldLogEditorialMap(input: BuildWorldLogEditorialMapInput): WorldLogEditorialMap {
  const scoredScenes = input.sceneLogs.map((sceneLog) => ({
    sceneLog,
    actionLogs: actionLogsForScene(sceneLog, input.actionLogs),
  })).map((entry) => ({
    ...entry,
    score: scoreScene(entry.sceneLog, entry.actionLogs),
  }));
  const rankBySceneId = new Map(scoredScenes
    .slice()
    .sort((left, right) =>
      right.score - left.score
      || left.sceneLog.chapter - right.sceneLog.chapter
      || left.sceneLog.sceneId.localeCompare(right.sceneLog.sceneId)
    )
    .map((entry, index) => [entry.sceneLog.sceneId, index]));

  const chapters = scoredScenes.map(({ sceneLog, actionLogs, score }, index) => {
    const currentLongArcThread = threadIds(sceneLog).find((threadId) => threadId.startsWith("long-arc:"));
    const previousLongArcThread = index > 0
      ? threadIds(scoredScenes[index - 1]!.sceneLog).find((threadId) => threadId.startsWith("long-arc:"))
      : undefined;
    const landmarkReason = index === 0
      ? "장편 시작 장면이라 독자가 세계 조건을 체감해야 함"
      : index === scoredScenes.length - 1
        ? "범위의 마지막 장면이라 남은 압력과 다음 상태를 분명히 남겨야 함"
        : currentLongArcThread && currentLongArcThread !== previousLongArcThread
          ? `장기 국면 전환 시작: ${currentLongArcThread}`
          : undefined;
    const ranked = rankedTreatment({
      score,
      rank: rankBySceneId.get(sceneLog.sceneId) ?? 0,
      sceneCount: scoredScenes.length,
    });
    const treatment = landmarkReason
      ? maxTreatment(ranked, index === scoredScenes.length - 1 ? "full_scene" : "expanded_scene")
      : ranked;
    const allThreadIds = threadIds(sceneLog);

    return WorldLogSceneEditorialDecisionSchema.parse({
      sceneId: sceneLog.sceneId,
      chapter: sceneLog.chapter,
      title: sceneLog.title,
      scenePurpose: sceneLog.scenePurpose,
      location: sceneLog.location,
      editorialScore: score,
      narrativeTreatment: treatment,
      suggestedWordBudget: wordBudgetForTreatment(treatment),
      primaryCharacterIds: unique([
        ...actionLogs.map((log) => log.actorId),
        ...actionLogs.flatMap((log) => log.targetIds),
        ...sceneLog.participantIds,
      ]).slice(0, 6),
      sourceActionLogIds: actionLogs.map((log) => log.logId),
      keyActionLogIds: keyActionLogIds(actionLogs),
      longArcThreadIds: allThreadIds.filter((threadId) => threadId.startsWith("long-arc:")),
      incidentThreadIds: allThreadIds.filter((threadId) => threadId.startsWith("incident:")),
      reasons: reasonsForScene(sceneLog, actionLogs, score, treatment, landmarkReason),
    });
  });

  const scores = chapters.map((chapter) => chapter.editorialScore);
  const treatmentCounts = {
    summary_bridge: chapters.filter((chapter) => chapter.narrativeTreatment === "summary_bridge").length,
    compressed_scene: chapters.filter((chapter) => chapter.narrativeTreatment === "compressed_scene").length,
    expanded_scene: chapters.filter((chapter) => chapter.narrativeTreatment === "expanded_scene").length,
    full_scene: chapters.filter((chapter) => chapter.narrativeTreatment === "full_scene").length,
  };
  const allLongArcThreads = unique(chapters.flatMap((chapter) => chapter.longArcThreadIds));
  const allIncidentThreads = unique(chapters.flatMap((chapter) => chapter.incidentThreadIds));
  const fullOrExpandedCount = treatmentCounts.full_scene + treatmentCounts.expanded_scene;
  const weakSceneCount = treatmentCounts.summary_bridge;
  const notes: string[] = [];

  if (fullOrExpandedCount === 0 && chapters.length > 0) {
    notes.push("길게 장면화할 로그가 없음");
  }
  if (weakSceneCount > chapters.length * 0.5) {
    notes.push("summary_bridge 비율이 높아 장편 장면 밀도가 약할 수 있음");
  }
  if (allLongArcThreads.length < 2 && chapters.length >= 60) {
    notes.push("장기 국면 thread 종류가 부족함");
  }
  if (allIncidentThreads.length < 3 && chapters.length >= 60) {
    notes.push("사건 축 incident 종류가 부족함");
  }
  if (notes.length === 0) {
    notes.push("월드 로그를 장면/압축/브릿지로 나눌 수 있는 편집 밀도가 확인됨");
  }

  return WorldLogEditorialMapSchema.parse({
    mode: "world_log_editorial_map",
    sceneCount: input.sceneLogs.length,
    actionLogCount: input.actionLogs.length,
    averageEditorialScore: round2(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length)),
    minEditorialScore: round2(scores.length > 0 ? Math.min(...scores) : 0),
    maxEditorialScore: round2(Math.max(0, ...scores)),
    treatmentCounts,
    chapters,
    diagnostics: {
      fullOrExpandedRatio: round2(fullOrExpandedCount / Math.max(1, chapters.length)),
      summaryBridgeRatio: round2(weakSceneCount / Math.max(1, chapters.length)),
      distinctLongArcCount: allLongArcThreads.length,
      distinctIncidentCount: allIncidentThreads.length,
      weakSceneCount,
      notes,
    },
  });
}

export function formatWorldLogEditorialMapMarkdown(map: WorldLogEditorialMap): string {
  const lines = [
    "# World Log Editorial Map",
    "",
    `- scenes: ${map.sceneCount}`,
    `- action logs: ${map.actionLogCount}`,
    `- score: avg=${map.averageEditorialScore}, min=${map.minEditorialScore}, max=${map.maxEditorialScore}`,
    `- treatments: full=${map.treatmentCounts.full_scene}, expanded=${map.treatmentCounts.expanded_scene}, compressed=${map.treatmentCounts.compressed_scene}, bridge=${map.treatmentCounts.summary_bridge}`,
    `- long arcs: ${map.diagnostics.distinctLongArcCount}, incidents: ${map.diagnostics.distinctIncidentCount}`,
    `- notes: ${map.diagnostics.notes.join(" / ")}`,
    "",
  ];

  for (const chapter of map.chapters) {
    lines.push(`## ${chapter.chapter}화 ${chapter.title}`);
    lines.push(`- treatment: ${chapter.narrativeTreatment} (${chapter.editorialScore})`);
    lines.push(`- budget: ${chapter.suggestedWordBudget} words`);
    lines.push(`- purpose/location: ${chapter.scenePurpose} / ${chapter.location}`);
    lines.push(`- key logs: ${chapter.keyActionLogIds.join(", ") || "none"}`);
    lines.push(`- threads: ${[...chapter.longArcThreadIds, ...chapter.incidentThreadIds].join(", ") || "none"}`);
    lines.push(`- reasons: ${chapter.reasons.join(" / ")}`);
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}
