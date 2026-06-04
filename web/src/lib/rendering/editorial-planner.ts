import { z } from "zod";

import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { SceneLog } from "@/lib/sim/scene-log";

const StringListSchema = z.array(z.string());

export const EditorialRenderModeSchema = z.enum(["summary", "normal", "expanded", "spotlight"]);
export const EditorialEmotionalZoomSchema = z.enum(["none", "light", "deep"]);
export const EditorialDialoguePrioritySchema = z.enum(["low", "medium", "high"]);
export const EditorialSceneSectionRoleSchema = z.enum(["setup", "escalation", "inflection", "fallout"]);

export const EditorialBeatPlanSchema = z.object({
  sourceActionLogId: z.string(),
  tick: z.number().int().positive(),
  actorId: z.string(),
  actorName: z.string(),
  editorialWeight: z.number().min(0).max(1),
  renderMode: EditorialRenderModeSchema,
  expansionReasons: StringListSchema,
  emotionalZoom: EditorialEmotionalZoomSchema,
  dialoguePriority: EditorialDialoguePrioritySchema,
  povPriorityCharacterId: z.string(),
  suggestedWordBudget: z.number().int().positive(),
  handling: z.string(),
});

export const EditorialSceneSectionSchema = z.object({
  sectionId: z.string(),
  role: EditorialSceneSectionRoleSchema,
  sourceActionLogIds: StringListSchema,
  purpose: z.string(),
  renderInstruction: z.string(),
  suggestedWordBudget: z.number().int().positive(),
});

export const EditorialPlanSchema = z.object({
  sceneId: z.string(),
  chapter: z.number().int().positive(),
  primaryPovCharacterId: z.string(),
  pacingShape: z.string(),
  totalSuggestedWordBudget: z.number().int().positive(),
  spotlightLogIds: StringListSchema,
  summaryLogIds: StringListSchema,
  sceneSections: z.array(EditorialSceneSectionSchema),
  beatPlans: z.array(EditorialBeatPlanSchema),
  diagnostics: z.object({
    averageWeight: z.number().min(0).max(1),
    maxWeight: z.number().min(0).max(1),
    minWeight: z.number().min(0).max(1),
    modeCounts: z.record(EditorialRenderModeSchema, z.number().int().nonnegative()),
  }),
});

export type EditorialRenderMode = z.infer<typeof EditorialRenderModeSchema>;
export type EditorialEmotionalZoom = z.infer<typeof EditorialEmotionalZoomSchema>;
export type EditorialDialoguePriority = z.infer<typeof EditorialDialoguePrioritySchema>;
export type EditorialSceneSectionRole = z.infer<typeof EditorialSceneSectionRoleSchema>;
export type EditorialBeatPlan = z.infer<typeof EditorialBeatPlanSchema>;
export type EditorialSceneSection = z.infer<typeof EditorialSceneSectionSchema>;
export type EditorialPlan = z.infer<typeof EditorialPlanSchema>;

export interface BuildEditorialPlanInput {
  sceneLog: SceneLog;
  actionLogs: CharacterActionLog[];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function magnitude(values: number[]): number {
  return values.reduce((sum, value) => sum + Math.abs(value), 0);
}

function modeForWeight(weight: number): EditorialRenderMode {
  if (weight >= 0.78) return "spotlight";
  if (weight >= 0.58) return "expanded";
  if (weight <= 0.34) return "summary";
  return "normal";
}

function emotionalZoomForWeight(weight: number): EditorialEmotionalZoom {
  if (weight >= 0.7) return "deep";
  if (weight >= 0.45) return "light";
  return "none";
}

function dialoguePriorityForWeight(weight: number): EditorialDialoguePriority {
  if (weight >= 0.68) return "high";
  if (weight >= 0.42) return "medium";
  return "low";
}

function wordBudgetForMode(mode: EditorialRenderMode): number {
  const budgets: Record<EditorialRenderMode, number> = {
    summary: 55,
    normal: 135,
    expanded: 260,
    spotlight: 420,
  };
  return budgets[mode];
}

function sceneTurnByActionLogId(sceneLog: SceneLog): Map<string, SceneLog["dialogueTurns"][number]> {
  const result = new Map<string, SceneLog["dialogueTurns"][number]>();
  for (const turn of sceneLog.dialogueTurns) {
    for (const logId of turn.sourceActionLogIds) {
      result.set(logId, turn);
    }
  }
  return result;
}

function rolePressure(log: CharacterActionLog): number {
  const roleWeights: Record<string, number> = {
    protagonist: 0.1,
    love_interest: 0.08,
    villain: 0.1,
    antagonist: 0.08,
    rival: 0.06,
    ally: 0.04,
    wildcard: 0.06,
  };
  return roleWeights[log.privateState.agentRole] ?? 0.04;
}

function actionPressure(log: CharacterActionLog): number {
  const actionWeights: Record<string, number> = {
    probe_dialogue: 0.1,
    counter_probe: 0.11,
    deflect_dialogue: 0.12,
    request_help: 0.08,
    request_access: 0.12,
    maintain_mask: 0.09,
    withdraw: 0.07,
    observe: 0.04,
    // 사건(plot-level) 행동은 장면의 핵심이므로 높은 가중치.
    confront: 0.22,
    sabotage: 0.2,
    take_physical: 0.18,
    awaken_magic: 0.22,
  };
  return actionWeights[log.action.type] ?? 0.04;
}

function turnPressure(turn?: SceneLog["dialogueTurns"][number]): number {
  if (!turn?.interactionDynamics) return 0;
  const { emotionalShift, powerShift, relationshipShift } = turn.interactionDynamics;
  const emotional = Math.min(Math.abs(emotionalShift.intensityDelta) * 0.05, 0.18);
  const power = Math.min(Math.abs(powerShift.delta) * 0.05, 0.16);
  const relationship = Math.min(
    magnitude([
      relationshipShift.trustDelta,
      relationshipShift.suspicionDelta,
      relationshipShift.dependencyDelta,
      relationshipShift.hostilityDelta,
    ]) * 0.04,
    0.2,
  );
  const withheld = turn.informationWithheld.length > 0 ? 0.06 : 0;
  return emotional + power + relationship + withheld;
}

function expansionReasons(input: {
  log: CharacterActionLog;
  turn?: SceneLog["dialogueTurns"][number];
  causalImpact: number;
  relationshipImpact: number;
  pressureImpact: number;
}): string[] {
  const reasons: string[] = [];
  if (input.causalImpact >= 0.12) reasons.push("다음 행동을 부르는 장면 압력이 큼");
  if (input.relationshipImpact >= 0.12) reasons.push("관계/의심/의존 수치가 흔들림");
  if (input.turn?.informationWithheld.length) reasons.push("비밀을 직접 말하지 않고 주변부만 노출해야 함");
  if (["probe_dialogue", "counter_probe", "deflect_dialogue", "maintain_mask"].includes(input.log.action.type)) {
    reasons.push("대사의 겉뜻과 속뜻이 다름");
  }
  if (input.log.targetIds.length >= 2) reasons.push("여러 인물의 해석이 갈라짐");
  if (reasons.length === 0) reasons.push("흐름 연결용 짧은 행동");
  return reasons;
}

function handlingForMode(mode: EditorialRenderMode): string {
  const handling: Record<EditorialRenderMode, string> = {
    summary: "한두 문장으로 지나가되 원인/결과만 남긴다.",
    normal: "대사 또는 행동 하나와 짧은 반응으로 장면화한다.",
    expanded: "대사, 침묵, 상대 반응을 모두 배치해 리듬을 만든다.",
    spotlight: "장면의 중심 박자로 길게 잡고 시선/침묵/손동작/호칭 변화를 누적한다.",
  };
  return handling[mode];
}

function primaryPovForLog(log: CharacterActionLog, turn?: SceneLog["dialogueTurns"][number]): string {
  if (turn?.interactionDynamics?.relationshipShift.targetCharacterId) {
    return turn.interactionDynamics.relationshipShift.targetCharacterId;
  }
  return log.targetIds[0] ?? log.actorId;
}

function buildBeatPlan(
  log: CharacterActionLog,
  turn: SceneLog["dialogueTurns"][number] | undefined,
): EditorialBeatPlan {
  const relationshipImpact = turnPressure(turn);
  const pressureImpact = Math.min(Math.abs(log.actualEffect.scenePressureDelta) * 0.06, 0.18);
  const causalImpact = log.actualEffect.followUpActionSeed.length > 0 ? 0.1 + pressureImpact : pressureImpact;
  const trustImpact = Math.min(magnitude(Object.values(log.trustDeltas)) * 0.03, 0.12);
  const targetImpact = Math.min(log.targetIds.length * 0.04, 0.12);
  const weight = clamp(
    0.22
    + rolePressure(log)
    + actionPressure(log)
    + relationshipImpact
    + causalImpact
    + trustImpact
    + targetImpact,
  );
  const renderMode = modeForWeight(weight);

  return EditorialBeatPlanSchema.parse({
    sourceActionLogId: log.logId,
    tick: log.tick,
    actorId: log.actorId,
    actorName: log.actorName,
    editorialWeight: round2(weight),
    renderMode,
    expansionReasons: expansionReasons({
      log,
      turn,
      causalImpact,
      relationshipImpact,
      pressureImpact,
    }),
    emotionalZoom: emotionalZoomForWeight(weight),
    dialoguePriority: dialoguePriorityForWeight(weight),
    povPriorityCharacterId: primaryPovForLog(log, turn),
    suggestedWordBudget: wordBudgetForMode(renderMode),
    handling: handlingForMode(renderMode),
  });
}

function rebalanceRenderModes(beatPlans: EditorialBeatPlan[]): EditorialBeatPlan[] {
  if (beatPlans.length <= 1) return beatPlans;

  const rankedIds = beatPlans
    .slice()
    .sort((a, b) => b.editorialWeight - a.editorialWeight || a.tick - b.tick)
    .map((beat) => beat.sourceActionLogId);
  const spotlightLimit = Math.max(1, Math.ceil(beatPlans.length * 0.22));
  const expandedLimit = Math.max(spotlightLimit + 1, Math.ceil(beatPlans.length * 0.55));
  const summaryStart = beatPlans.length >= 6 ? Math.floor(beatPlans.length * 0.85) : Number.POSITIVE_INFINITY;

  return beatPlans.map((beat) => {
    const rank = rankedIds.indexOf(beat.sourceActionLogId);
    const renderMode: EditorialRenderMode = rank < spotlightLimit
      ? "spotlight"
      : rank < expandedLimit
        ? "expanded"
        : rank >= summaryStart && beat.editorialWeight < 0.72
          ? "summary"
          : "normal";
    return EditorialBeatPlanSchema.parse({
      ...beat,
      renderMode,
      suggestedWordBudget: wordBudgetForMode(renderMode),
      handling: handlingForMode(renderMode),
    });
  });
}

function pacingShapeForModes(modes: EditorialRenderMode[]): string {
  if (modes.includes("spotlight")) return "짧은 표면 행동에서 시작해 spotlight 박자에서 머무른 뒤 압력만 남긴다.";
  if (modes.filter((mode) => mode === "expanded").length >= 2) {
    return "두세 개의 expanded 박자를 교차시키고 반복 행동은 summary로 접는다.";
  }
  return "normal 박자로 진행하고 반복 로그는 빠르게 접는다.";
}

function sectionPurpose(role: EditorialSceneSectionRole): string {
  const purposes: Record<EditorialSceneSectionRole, string> = {
    setup: "장면의 표면 평온, 위치, 시선 방향, 첫 불편함을 깐다.",
    escalation: "인물들이 서로의 말끝과 행동을 받아치며 압력을 올린다.",
    inflection: "관계/권력/감정 수치가 가장 크게 움직이는 순간에 머문다.",
    fallout: "새 설명을 하지 않고 다음 행동을 부르는 침묵과 잔여 압력만 남긴다.",
  };
  return purposes[role];
}

function sectionInstruction(role: EditorialSceneSectionRole, beats: EditorialBeatPlan[]): string {
  const names = Array.from(new Set(beats.map((beat) => beat.actorName))).join(", ");
  const spotlight = beats.some((beat) => beat.renderMode === "spotlight");
  const highDialogue = beats.some((beat) => beat.dialoguePriority === "high");
  const parts: string[] = [];

  if (role === "setup") {
    parts.push("장소와 감각 앵커를 먼저 두고, 첫 행동은 짧게 처리한다.");
  }
  if (role === "escalation") {
    parts.push("행동-대사-침묵을 교차시키고 같은 설명어를 반복하지 않는다.");
  }
  if (role === "inflection") {
    parts.push(spotlight ? "spotlight 로그는 대사 전후의 손동작과 반응 속도까지 길게 잡는다." : "가장 무거운 expanded 로그에 문단 길이를 배분한다.");
  }
  if (role === "fallout") {
    parts.push("결론을 해설하지 말고, 누가 다음에 움직일 수밖에 없는지만 보이게 한다.");
  }
  if (highDialogue) {
    parts.push("대사 후보는 그대로 쓰기보다 호칭, 말 끊김, 시선 회피를 붙여 장면화한다.");
  }
  if (names) {
    parts.push(`중심 인물: ${names}.`);
  }

  return parts.join(" ");
}

function buildSceneSections(beatPlans: EditorialBeatPlan[]): EditorialSceneSection[] {
  if (beatPlans.length === 0) return [];

  const ordered = beatPlans.slice().sort((a, b) => a.tick - b.tick || a.sourceActionLogId.localeCompare(b.sourceActionLogId));
  const peakIndex = ordered.reduce((bestIndex, beat, index) => {
    const best = ordered[bestIndex]!;
    if (beat.editorialWeight > best.editorialWeight) return index;
    if (beat.editorialWeight === best.editorialWeight && beat.renderMode === "spotlight") return index;
    return bestIndex;
  }, 0);
  const setupEnd = ordered.length >= 4 ? 1 : Math.max(1, Math.min(2, peakIndex));
  const rawGroups: Array<{ role: EditorialSceneSectionRole; beats: EditorialBeatPlan[] }> = [
    { role: "setup", beats: ordered.slice(0, setupEnd) },
    { role: "escalation", beats: ordered.slice(setupEnd, peakIndex) },
    { role: "inflection", beats: ordered.slice(peakIndex, Math.min(ordered.length, peakIndex + 2)) },
    { role: "fallout", beats: ordered.slice(Math.min(ordered.length, peakIndex + 2)) },
  ];
  const groups = rawGroups.filter((group) => group.beats.length > 0);

  return groups.map((group, index) => EditorialSceneSectionSchema.parse({
    sectionId: `${String(index + 1).padStart(2, "0")}_${group.role}`,
    role: group.role,
    sourceActionLogIds: group.beats.map((beat) => beat.sourceActionLogId),
    purpose: sectionPurpose(group.role),
    renderInstruction: sectionInstruction(group.role, group.beats),
    suggestedWordBudget: Math.max(
      120,
      Math.round(group.beats.reduce((sum, beat) => sum + beat.suggestedWordBudget, 0) / 10) * 10,
    ),
  }));
}

export function buildEditorialPlan(input: BuildEditorialPlanInput): EditorialPlan {
  const turnsByLogId = sceneTurnByActionLogId(input.sceneLog);
  const beatPlans = rebalanceRenderModes(input.actionLogs
    .slice()
    .sort((a, b) => a.tick - b.tick || a.logId.localeCompare(b.logId))
    .map((log) => buildBeatPlan(log, turnsByLogId.get(log.logId))));
  const weights = beatPlans.map((beat) => beat.editorialWeight);
  const primaryPovCharacterId = beatPlans
    .slice()
    .sort((a, b) => b.editorialWeight - a.editorialWeight)[0]?.povPriorityCharacterId
    ?? input.sceneLog.participantIds[0]
    ?? "unknown";
  const modeCounts = {
    summary: beatPlans.filter((beat) => beat.renderMode === "summary").length,
    normal: beatPlans.filter((beat) => beat.renderMode === "normal").length,
    expanded: beatPlans.filter((beat) => beat.renderMode === "expanded").length,
    spotlight: beatPlans.filter((beat) => beat.renderMode === "spotlight").length,
  };
  const sceneSections = buildSceneSections(beatPlans);

  return EditorialPlanSchema.parse({
    sceneId: input.sceneLog.sceneId,
    chapter: input.sceneLog.chapter,
    primaryPovCharacterId,
    pacingShape: pacingShapeForModes(beatPlans.map((beat) => beat.renderMode)),
    totalSuggestedWordBudget: Math.max(
      600,
      beatPlans.reduce((sum, beat) => sum + beat.suggestedWordBudget, 0),
    ),
    spotlightLogIds: beatPlans
      .filter((beat) => beat.renderMode === "spotlight")
      .map((beat) => beat.sourceActionLogId),
    summaryLogIds: beatPlans
      .filter((beat) => beat.renderMode === "summary")
      .map((beat) => beat.sourceActionLogId),
    sceneSections,
    beatPlans,
    diagnostics: {
      averageWeight: round2(weights.reduce((sum, weight) => sum + weight, 0) / Math.max(1, weights.length)),
      maxWeight: round2(Math.max(0, ...weights)),
      minWeight: round2(weights.length > 0 ? Math.min(...weights) : 0),
      modeCounts,
    },
  });
}
