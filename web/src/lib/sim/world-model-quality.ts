import { z } from "zod";

import type {
  CharacterActionLog,
  InteractionResolution,
} from "./character-action-sim";
import type { WorldModelRunResult } from "./world-runner";

const StringListSchema = z.array(z.string());

export const WorldModelQualityIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "blocking"]),
  message: z.string(),
  evidence: StringListSchema,
});

export const WorldModelQualityReportSchema = z.object({
  mode: z.literal("world_model_quality"),
  score: z.number().min(0).max(1),
  verdict: z.enum(["pass", "warn", "fail"]),
  metrics: z.object({
    responsiveness: z.number().min(0).max(1),
    memoryInfluence: z.number().min(0).max(1),
    relationshipDynamics: z.number().min(0).max(1),
    agencyDistribution: z.number().min(0).max(1),
    actorTargetDiversity: z.number().min(0).max(1),
    repetitionControl: z.number().min(0).max(1),
    causalContinuity: z.number().min(0).max(1),
    followUpResolvedRate: z.number().min(0).max(1),
    uniqueOutcomeRate: z.number().min(0).max(1),
    followUpSeedUniqueness: z.number().min(0).max(1),
    targetReactionUniqueness: z.number().min(0).max(1),
    concreteStateDeltaRate: z.number().min(0).max(1),
    operatorCategoryDiversity: z.number().min(0).max(1),
    actionOperatorAcceptanceRate: z.number().min(0).max(1),
    planLifecycleCoverage: z.number().min(0).max(1),
    narrativeDirectorWorldConditionRate: z.number().min(0).max(1),
    worldConditionActionRate: z.number().min(0).max(1),
    foreshadowScheduleCoverage: z.number().min(0).max(1),
  }),
  counts: z.object({
    actionLogs: z.number().int().nonnegative(),
    interactionResolutions: z.number().int().nonnegative(),
    sceneLogs: z.number().int().nonnegative(),
    logsWithTargets: z.number().int().nonnegative(),
    logsWithReactions: z.number().int().nonnegative(),
    logsUsingPriorObservation: z.number().int().nonnegative(),
    logsWithMemoryUpdates: z.number().int().nonnegative(),
    logsWithBeliefUpdates: z.number().int().nonnegative(),
    logsUsingKnownFactsInDecision: z.number().int().nonnegative(),
    logsWithTrustDeltas: z.number().int().nonnegative(),
    repeatedVisibleBehaviorCount: z.number().int().nonnegative(),
    repeatedUtteranceCount: z.number().int().nonnegative(),
    duplicateActorTargetPairCount: z.number().int().nonnegative(),
    dominantActionTypeShare: z.number().min(0).max(1),
    dominantActorTargetPairShare: z.number().min(0).max(1),
    uniqueActors: z.number().int().nonnegative(),
    uniqueActorTargetPairs: z.number().int().nonnegative(),
    uniqueActionTypes: z.number().int().nonnegative(),
    uniqueTargetReactions: z.number().int().nonnegative(),
    uniqueFollowUpActionSeeds: z.number().int().nonnegative(),
    uniqueSceneOutcomes: z.number().int().nonnegative(),
    duplicateTargetReactionCount: z.number().int().nonnegative(),
    duplicateFollowUpActionSeedCount: z.number().int().nonnegative(),
    duplicateSceneOutcomeCount: z.number().int().nonnegative(),
    followUpResolutionCandidates: z.number().int().nonnegative(),
    followUpResolvedCount: z.number().int().nonnegative(),
    genericPressureTemplateCount: z.number().int().nonnegative(),
    actionLogsWithStateDeltas: z.number().int().nonnegative(),
    totalStateDeltas: z.number().int().nonnegative(),
    sceneLogsWithOutcomeDeltaIds: z.number().int().nonnegative(),
    uniqueActionOperatorIds: z.number().int().nonnegative(),
    uniqueOperatorCategories: z.number().int().nonnegative(),
    acceptedActionOperators: z.number().int().nonnegative(),
    partialActionOperators: z.number().int().nonnegative(),
    blockedActionOperators: z.number().int().nonnegative(),
    backfiredActionOperators: z.number().int().nonnegative(),
    logsWithWorldGameMasterResolution: z.number().int().nonnegative(),
    logsUsingWorldCondition: z.number().int().nonnegative(),
    worldGameMasterWitnessCount: z.number().int().nonnegative(),
    worldGameMasterAffordanceCount: z.number().int().nonnegative(),
    activePlanTransitions: z.number().int().nonnegative(),
    completedPlanTransitions: z.number().int().nonnegative(),
    blockedPlanTransitions: z.number().int().nonnegative(),
    abandonedPlanTransitions: z.number().int().nonnegative(),
    narrativeDirectorPressureCount: z.number().int().nonnegative(),
    narrativeDirectorForcedActionCount: z.number().int().nonnegative(),
    expectedForeshadowTouches: z.number().int().nonnegative(),
    actualForeshadowTouches: z.number().int().nonnegative(),
  }),
  blockingIssues: z.array(WorldModelQualityIssueSchema),
  warnings: z.array(WorldModelQualityIssueSchema),
  recommendations: StringListSchema,
});

export type WorldModelQualityIssue = z.infer<typeof WorldModelQualityIssueSchema>;
export type WorldModelQualityReport = z.infer<typeof WorldModelQualityReportSchema>;

export interface WorldModelQualityThresholds {
  minScore: number;
  minResponsiveness: number;
  minMemoryInfluence: number;
  minRelationshipDynamics: number;
  minAgencyDistribution: number;
  minActorTargetDiversity: number;
  minRepetitionControl: number;
  minCausalContinuity: number;
  minFollowUpResolvedRate: number;
  minUniqueOutcomeRate: number;
  minFollowUpSeedUniqueness: number;
  minTargetReactionUniqueness: number;
  minConcreteStateDeltaRate: number;
  minOperatorCategoryDiversity: number;
  minActionOperatorAcceptanceRate: number;
  minPlanLifecycleCoverage: number;
  minNarrativeDirectorWorldConditionRate: number;
  minWorldConditionActionRate: number;
  minForeshadowScheduleCoverage: number;
}

export const DEFAULT_WORLD_MODEL_QUALITY_THRESHOLDS: WorldModelQualityThresholds = {
  minScore: 0.72,
  minResponsiveness: 0.65,
  minMemoryInfluence: 0.55,
  minRelationshipDynamics: 0.55,
  minAgencyDistribution: 0.55,
  minActorTargetDiversity: 0.25,
  minRepetitionControl: 0.55,
  minCausalContinuity: 0.65,
  minFollowUpResolvedRate: 0.8,
  minUniqueOutcomeRate: 0.7,
  minFollowUpSeedUniqueness: 0.25,
  minTargetReactionUniqueness: 0.25,
  minConcreteStateDeltaRate: 0.6,
  minOperatorCategoryDiversity: 0.4,
  minActionOperatorAcceptanceRate: 0.7,
  minPlanLifecycleCoverage: 0.25,
  minNarrativeDirectorWorldConditionRate: 0.8,
  minWorldConditionActionRate: 0.8,
  minForeshadowScheduleCoverage: 0.8,
};

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniqueCount(values: string[]): number {
  return new Set(values.filter(Boolean)).size;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedValues(values: string[]): string[] {
  return values.map(normalizeText).filter(Boolean);
}

function uniquenessRate(values: string[]): number {
  const normalized = normalizedValues(values);
  return ratio(new Set(normalized).size, normalized.length);
}

function countWith<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

function trustDeltaMagnitude(log: CharacterActionLog): number {
  return Object.values(log.trustDeltas)
    .reduce((sum, value) => sum + Math.abs(value), 0);
}

function relationshipMagnitude(resolution: InteractionResolution): number {
  const shift = resolution.relationshipShift;
  return Math.abs(shift.trustDelta)
    + Math.abs(shift.suspicionDelta)
    + Math.abs(shift.dependencyDelta)
    + Math.abs(shift.hostilityDelta)
    + Math.abs(resolution.powerShift.delta)
    + Math.abs(resolution.emotionalShift.intensityDelta);
}

function repeatedAdjacentActions(actionLogs: CharacterActionLog[]): number {
  let repeats = 0;
  for (let index = 1; index < actionLogs.length; index += 1) {
    const current = actionLogs[index]!;
    const previous = actionLogs[index - 1]!;
    if (current.actorId === previous.actorId && current.action.type === previous.action.type) {
      repeats += 1;
    }
  }
  return repeats;
}

function duplicateCount(values: string[]): number {
  const counts = new Map<string, number>();
  for (const value of normalizedValues(values)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.values())
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function dominantShare(values: string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values()) / values.length;
}

function observationMentionsPrior(log: CharacterActionLog): boolean {
  const observed = log.observed.join(" ").trim();
  if (!observed) return false;
  return log.memoryUpdates.some((memory) => observed.includes(memory.summary.slice(0, 12)))
    || log.beliefUpdates.some((belief) => observed.includes(belief.belief.slice(0, 12)))
    || !/장면|active|tick|활성/.test(observed);
}

function logUsesKnownFactsInDecision(log: CharacterActionLog): boolean {
  const decisionText = [
    log.action.intent,
    log.action.rationale,
    log.intendedEffect,
    log.actualEffect.followUpActionSeed,
    log.observed.join(" "),
  ].join(" ");
  return log.privateState.knownFacts.some((fact) => {
    const normalized = fact.replace(/\s+/g, " ").trim();
    if (normalized.length < 6) return false;
    return decisionText.includes(normalized)
      || normalized.split(/[,\s.]+/).filter((token) => token.length >= 3)
        .some((token) => decisionText.includes(token));
  });
}

function followUpSearchSurface(log: CharacterActionLog): string {
  return normalizeText([
    log.observed.join(" "),
    log.action.intent,
    log.action.rationale,
    log.visibleBehavior,
    log.intendedEffect,
    log.actualEffect.targetReaction,
    log.memoryUpdates.map((memory) => memory.summary).join(" "),
    log.beliefUpdates.map((belief) => `${belief.belief} ${belief.cause}`).join(" "),
  ].join(" "));
}

function countResolvedFollowUps(
  actionLogs: CharacterActionLog[],
  lookahead = 3,
): { candidates: number; resolved: number } {
  let candidates = 0;
  let resolved = 0;
  for (let index = 0; index < actionLogs.length; index += 1) {
    const seed = normalizeText(actionLogs[index]!.actualEffect.followUpActionSeed);
    if (!seed) continue;
    const nextLogs = actionLogs.slice(index + 1, index + 1 + lookahead);
    if (nextLogs.length === 0) continue;
    candidates += 1;
    if (nextLogs.some((log) => followUpSearchSurface(log).includes(seed))) {
      resolved += 1;
    }
  }
  return { candidates, resolved };
}

function scheduledForeshadowTouchKeys(result: WorldModelRunResult): string[] {
  const start = result.report.startChapter;
  const end = result.report.endChapter;
  const keys: string[] = [];

  for (const foreshadowing of result.seed.foreshadowing) {
    if (foreshadowing.lifecycle === "intentionally_abandoned") continue;
    if (foreshadowing.planted_at >= start && foreshadowing.planted_at <= end) {
      keys.push(`${foreshadowing.planted_at}:${foreshadowing.id}:plant`);
    }
    for (const hintChapter of foreshadowing.hints_at) {
      if (hintChapter >= start && hintChapter <= end) {
        keys.push(`${hintChapter}:${foreshadowing.id}:hint`);
      }
    }
    if (foreshadowing.reveal_at && foreshadowing.reveal_at >= start && foreshadowing.reveal_at <= end) {
      keys.push(`${foreshadowing.reveal_at}:${foreshadowing.id}:reveal`);
    }
  }

  return keys;
}

function actualForeshadowTouchKeys(result: WorldModelRunResult): Set<string> {
  const keys = new Set<string>();

  for (const event of result.state.eventLog) {
    const payload = event.payload as { foreshadowingTouched?: unknown } | undefined;
    const touched = payload?.foreshadowingTouched;
    if (!Array.isArray(touched)) continue;
    for (const item of touched) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = typeof record.foreshadowingId === "string" ? record.foreshadowingId : "";
      const action = typeof record.action === "string" ? record.action : "";
      if (!id || !action) continue;
      keys.add(`${event.chapter}:${id}:${action}`);
    }
  }

  return keys;
}

function isGenericPressureTemplate(value: string): boolean {
  return /반응할 이유|다음 반응|다음 질문|다음 사건|더 확인해야|아직 더 확인|압력이 남|탐색이 이어|움직임이 필요/.test(value);
}

function issue(
  code: string,
  severity: "warning" | "blocking",
  message: string,
  evidence: string[] = [],
): WorldModelQualityIssue {
  return WorldModelQualityIssueSchema.parse({ code, severity, message, evidence });
}

function recommendationForMetric(metric: keyof WorldModelQualityReport["metrics"]): string {
  const recommendations: Record<keyof WorldModelQualityReport["metrics"], string> = {
    responsiveness: "targetReaction과 nextActionSeeds가 다음 tick 선택에 더 직접 반영되도록 scheduler 입력을 강화한다.",
    memoryInfluence: "privateState.knownFacts/recentMemorySummaries가 action.rationale와 observed에 드러나도록 memory retrieval을 강화한다.",
    relationshipDynamics: "trustDeltas와 relationshipShift가 0에 머무르지 않도록 상호작용 해석에 갈등 비용을 더한다.",
    agencyDistribution: "우선순위 캐릭터 boost를 유지하되 장면 목적별로 소외 캐릭터에게 독립 목표를 부여한다.",
    actorTargetDiversity: "반복된 actor-target pair에는 피로도를 주고 조연끼리의 독립 상호작용을 scheduler에 주기적으로 열어 둔다.",
    repetitionControl: "같은 actor/action type이 이어질 때 대체 action type 또는 침묵/withdraw를 선택하게 한다.",
    causalContinuity: "followUpActionSeed를 다음 로그의 observed/currentPlan에 carryover하는 비율을 높인다.",
    followUpResolvedRate: "followUpActionSeed를 문장 템플릿이 아니라 다음 행동/state delta로 해소하도록 action scheduler를 바꾼다.",
    uniqueOutcomeRate: "sceneOutcome을 마지막 leadsTo 문장이 아니라 concrete state delta 요약에서 생성한다.",
    followUpSeedUniqueness: "followUpActionSeed 템플릿을 늘리는 대신 operator 결과와 unresolved pressure id에서 생성한다.",
    targetReactionUniqueness: "targetReaction을 actor/target 템플릿이 아니라 target belief와 relationship delta에서 생성한다.",
    concreteStateDeltaRate: "각 action log의 actualEffect에 concrete stateDeltas를 기록하고 sceneOutcome도 delta id에서 유도한다.",
    operatorCategoryDiversity: "social/information/physical/political/magic operator category가 장면 목적에 맞게 섞이도록 action vocabulary를 확장한다.",
    actionOperatorAcceptanceRate: "precondition을 통과하지 못한 operator는 accepted로 처리하지 말고 blocked/partial 후 replan하도록 만든다.",
    planLifecycleCoverage: "action 결과가 active/completed/blocked/abandoned plan lifecycle event로 남도록 plan resolver를 강화한다.",
    narrativeDirectorWorldConditionRate: "NarrativeDirector는 actor action을 직접 쓰지 말고 deadline/rumor/constraint 같은 world condition event를 각 scene에 남긴다.",
    worldConditionActionRate: "생성된 world condition을 action log의 observed/GM precondition/state delta에 주입해 인물 선택을 실제로 흔들게 한다.",
    foreshadowScheduleCoverage: "foreshadowing plant/hint/reveal 일정을 월드 이벤트로 모두 기록해 장기 thread가 사라지지 않게 한다.",
  };
  return recommendations[metric];
}

export function evaluateWorldModelQuality(
  result: WorldModelRunResult,
  thresholds: Partial<WorldModelQualityThresholds> = {},
): WorldModelQualityReport {
  const resolvedThresholds = {
    ...DEFAULT_WORLD_MODEL_QUALITY_THRESHOLDS,
    ...thresholds,
  };
  const actionLogs = result.actionLogs;
  const actionLogCount = actionLogs.length;
  const interactionResolutions = result.interactionResolutions;
  const sceneOutcomes = result.sceneLogs.map((scene) => scene.sceneOutcome);
  const targetReactions = actionLogs.map((log) => log.actualEffect.targetReaction);
  const followUpActionSeeds = actionLogs.map((log) => log.actualEffect.followUpActionSeed);
  const followUpResolution = countResolvedFollowUps(actionLogs);
  const genericPressureTemplateCount = countWith(followUpActionSeeds, isGenericPressureTemplate);
  const actionLogsWithStateDeltas = countWith(actionLogs, (log) =>
    (log.actualEffect.stateDeltas ?? []).length > 0
  );
  const totalStateDeltas = actionLogs.reduce(
    (sum, log) => sum + (log.actualEffect.stateDeltas ?? []).length,
    0,
  );
  const sceneLogsWithOutcomeDeltaIds = countWith(result.sceneLogs, (scene) =>
    (scene.sceneOutcomeDeltaIds ?? []).length > 0
  );
  const operatorIds = actionLogs.map((log) => log.action.operator?.id ?? "");
  const operatorCategories = actionLogs.map((log) => log.action.operator?.category ?? "");
  const acceptedActionOperators = countWith(actionLogs, (log) => log.action.operator?.status === "accepted");
  const partialActionOperators = countWith(actionLogs, (log) => log.action.operator?.status === "partial");
  const blockedActionOperators = countWith(actionLogs, (log) => log.action.operator?.status === "blocked");
  const backfiredActionOperators = countWith(actionLogs, (log) => log.action.operator?.status === "backfired");
  const logsWithWorldGameMasterResolution = countWith(actionLogs, (log) =>
    Boolean(log.actualEffect.worldGameMaster?.reason)
  );
  const logsUsingWorldCondition = countWith(actionLogs, (log) =>
    log.observed.some((entry) => entry.startsWith("월드 조건:"))
    || log.actualEffect.worldGameMaster.checkedPreconditions.some((entry) => entry.startsWith("world condition:"))
    || log.actualEffect.stateDeltas.some((delta) => delta.summary.includes("외부 조건:"))
  );
  const worldGameMasterWitnessCount = actionLogs.reduce(
    (sum, log) => sum + (log.actualEffect.worldGameMaster?.witnessCharacterIds.length ?? 0),
    0,
  );
  const worldGameMasterAffordanceCount = actionLogs.reduce(
    (sum, log) => sum + (log.actualEffect.worldGameMaster?.newAffordances.length ?? 0),
    0,
  );
  const planStatuses = actionLogs.map((log) => log.planLifecycle?.nextStatus ?? "");
  const activePlanTransitions = countWith(actionLogs, (log) => log.planLifecycle?.nextStatus === "active");
  const completedPlanTransitions = countWith(actionLogs, (log) => log.planLifecycle?.nextStatus === "completed");
  const blockedPlanTransitions = countWith(actionLogs, (log) => log.planLifecycle?.nextStatus === "blocked");
  const abandonedPlanTransitions = countWith(actionLogs, (log) => log.planLifecycle?.nextStatus === "abandoned");
  const narrativeDirectorPressureCount = result.sceneLogs.reduce(
    (sum, scene) => sum + (scene.narrativeDirectorPressures ?? []).length,
    0,
  );
  const narrativeDirectorForcedActionCount = result.state.eventLog.filter((event) =>
    event.tags?.includes("narrative-director") && Boolean(event.actorId)
  ).length;
  const expectedForeshadowTouchKeys = scheduledForeshadowTouchKeys(result);
  const actualForeshadowTouchKeySet = actualForeshadowTouchKeys(result);
  const coveredForeshadowTouchCount = expectedForeshadowTouchKeys.filter((key) =>
    actualForeshadowTouchKeySet.has(key)
  ).length;
  const logsWithTargets = countWith(actionLogs, (log) => log.targetIds.length > 0);
  const logsWithReactions = countWith(actionLogs, (log) => log.actualEffect.targetReaction.trim().length > 0);
  const logsWithPriorObservation = countWith(actionLogs, observationMentionsPrior);
  const logsWithMemoryUpdates = countWith(actionLogs, (log) => log.memoryUpdates.length > 0);
  const logsWithBeliefUpdates = countWith(actionLogs, (log) => log.beliefUpdates.length > 0);
  const logsUsingKnownFactsInDecision = countWith(actionLogs, logUsesKnownFactsInDecision);
  const logsWithTrustDeltas = countWith(actionLogs, (log) => trustDeltaMagnitude(log) > 0);
  const resolutionDynamics = countWith(interactionResolutions, (resolution) => relationshipMagnitude(resolution) > 0);
  const actors = actionLogs.map((log) => log.actorId);
  const actionTypes = actionLogs.map((log) => log.action.type);
  const actorTargetPairs = actionLogs.map((log) =>
    `${log.actorId}->${log.targetIds[0] ?? "scene"}`
  );
  const uniqueActors = uniqueCount(actors);
  const uniqueActionTypes = uniqueCount(actionTypes);
  const uniqueActorTargetPairs = uniqueCount(actorTargetPairs);
  const adjacentRepeats = repeatedAdjacentActions(actionLogs);
  const repeatedVisibleBehaviorCount = duplicateCount(actionLogs.map((log) => log.visibleBehavior));
  const utterances = interactionResolutions.map((resolution) => resolution.speechDraft.utteranceCandidate);
  const repeatedUtteranceCount = duplicateCount(utterances);
  const dominantActionTypeShare = dominantShare(actionTypes);
  const dominantActorTargetPairShare = dominantShare(actorTargetPairs);
  const duplicateActorTargetPairCount = duplicateCount(actorTargetPairs);
  const duplicateTargetReactionCount = duplicateCount(targetReactions);
  const duplicateFollowUpActionSeedCount = duplicateCount(followUpActionSeeds);
  const duplicateSceneOutcomeCount = duplicateCount(sceneOutcomes);

  const responsiveness = round2((
    ratio(logsWithTargets, actionLogCount)
    + ratio(logsWithReactions, actionLogCount)
    + ratio(interactionResolutions.length, actionLogCount)
  ) / 3);
  const memoryInfluence = round2((
    ratio(logsWithMemoryUpdates, actionLogCount)
    + ratio(logsWithBeliefUpdates, actionLogCount)
    + ratio(logsWithPriorObservation, actionLogCount)
    + ratio(logsUsingKnownFactsInDecision, actionLogCount)
  ) / 4);
  const relationshipDynamics = round2((
    ratio(logsWithTrustDeltas, actionLogCount)
    + ratio(resolutionDynamics, Math.max(1, interactionResolutions.length))
  ) / 2);
  const agencyDistribution = round2(clamp((
    ratio(uniqueActors, Math.max(1, Object.keys(result.brain.characterMinds).length))
    + ratio(uniqueActionTypes, 6)
    + (1 - dominantShare(actors))
    + (1 - dominantActionTypeShare)
  ) / 4));
  const possibleDirectedPairs = Math.max(1, uniqueActors * Math.max(1, uniqueActors - 1));
  const actorTargetDiversity = round2(clamp(ratio(uniqueActorTargetPairs, possibleDirectedPairs)));
  const repetitionControl = round2(clamp((
    (1 - ratio(adjacentRepeats, Math.max(1, actionLogCount - 1)))
    + (1 - ratio(repeatedVisibleBehaviorCount, Math.max(1, actionLogCount)))
    + (1 - ratio(repeatedUtteranceCount, Math.max(1, utterances.length)))
    + (1 - dominantActorTargetPairShare)
    + (1 - dominantActionTypeShare)
  ) / 5));
  const causalContinuity = round2((
    ratio(countWith(actionLogs, (log) => log.actualEffect.followUpActionSeed.trim().length > 0), actionLogCount)
    + ratio(result.report.worldBrain.runtimeContinuity.planCarryoverEventCount, Math.max(1, result.report.generatedEventCount))
    + (result.report.validation.passed ? 1 : 0)
  ) / 3);
  const followUpResolvedRate = round2(ratio(
    followUpResolution.resolved,
    followUpResolution.candidates,
  ));
  const uniqueOutcomeRate = round2(uniquenessRate(sceneOutcomes));
  const followUpSeedUniqueness = round2(uniquenessRate(followUpActionSeeds));
  const targetReactionUniqueness = round2(uniquenessRate(targetReactions));
  const concreteStateDeltaRate = round2(ratio(actionLogsWithStateDeltas, actionLogCount));
  const operatorCategoryDiversity = round2(ratio(uniqueCount(operatorCategories), 5));
  const actionOperatorAcceptanceRate = round2(ratio(acceptedActionOperators, actionLogCount));
  const planLifecycleCoverage = round2(ratio(uniqueCount(planStatuses), 4));
  const narrativeDirectorWorldConditionRate = round2(ratio(
    narrativeDirectorPressureCount - narrativeDirectorForcedActionCount,
    Math.max(1, result.sceneLogs.length),
  ));
  const worldConditionActionRate = round2(ratio(logsUsingWorldCondition, actionLogCount));
  const foreshadowScheduleCoverage = round2(
    expectedForeshadowTouchKeys.length === 0
      ? 1
      : ratio(coveredForeshadowTouchCount, expectedForeshadowTouchKeys.length),
  );

  const metrics = {
    responsiveness,
    memoryInfluence,
    relationshipDynamics,
    agencyDistribution,
    actorTargetDiversity,
    repetitionControl,
    causalContinuity,
    followUpResolvedRate,
    uniqueOutcomeRate,
    followUpSeedUniqueness,
    targetReactionUniqueness,
    concreteStateDeltaRate,
    operatorCategoryDiversity,
    actionOperatorAcceptanceRate,
    planLifecycleCoverage,
    narrativeDirectorWorldConditionRate,
    worldConditionActionRate,
    foreshadowScheduleCoverage,
  };
  const weightedScore = round2(
    clamp(responsiveness * 0.09
    + memoryInfluence * 0.11
    + relationshipDynamics * 0.11
    + agencyDistribution * 0.09
    + repetitionControl * 0.09
    + causalContinuity * 0.11
    + followUpResolvedRate * 0.12
    + uniqueOutcomeRate * 0.1
    + followUpSeedUniqueness * 0.04
    + targetReactionUniqueness * 0.04
    + concreteStateDeltaRate * 0.04
    + operatorCategoryDiversity * 0.04
    + actionOperatorAcceptanceRate * 0.02
    + planLifecycleCoverage * 0.01
    + narrativeDirectorWorldConditionRate * 0.01
    + worldConditionActionRate * 0.02
    + foreshadowScheduleCoverage * 0.04),
  );

  const blockingIssues: WorldModelQualityIssue[] = [];
  const warnings: WorldModelQualityIssue[] = [];
  const checkMetric = (
    metric: keyof typeof metrics,
    threshold: number,
    severity: "warning" | "blocking",
    message: string,
  ) => {
    if (metrics[metric] >= threshold) return;
    const target = severity === "blocking" ? blockingIssues : warnings;
    target.push(issue(
      `low_${metric}`,
      severity,
      message,
      [`${metric}=${metrics[metric].toFixed(2)} < ${threshold.toFixed(2)}`],
    ));
  };

  checkMetric("responsiveness", resolvedThresholds.minResponsiveness, "blocking", "인물 행동이 서로의 반응으로 충분히 이어지지 않는다.");
  checkMetric("memoryInfluence", resolvedThresholds.minMemoryInfluence, "warning", "기억/믿음 업데이트가 다음 행동에 충분히 보이지 않는다.");
  checkMetric("relationshipDynamics", resolvedThresholds.minRelationshipDynamics, "warning", "관계/권력/감정 변화가 약하거나 누적되지 않는다.");
  checkMetric("agencyDistribution", resolvedThresholds.minAgencyDistribution, "warning", "행동 주체나 행동 타입이 한쪽으로 쏠린다.");
  checkMetric("actorTargetDiversity", resolvedThresholds.minActorTargetDiversity, "warning", "상호작용 축이 너무 좁아 특정 인물쌍으로 고착된다.");
  checkMetric("repetitionControl", resolvedThresholds.minRepetitionControl, "warning", "인접 로그에서 같은 인물/행동이 반복된다.");
  if (actionLogCount >= 50 && uniqueActorTargetPairs < Math.max(1, uniqueActors * 2)) {
    warnings.push(issue(
      "narrow_interaction_graph",
      "warning",
      "장기 로그에서 actor-target pair가 너무 적어 월드가 주인공 중심 ping-pong으로 보일 수 있다.",
      [`uniqueActorTargetPairs=${uniqueActorTargetPairs}`, `uniqueActors=${uniqueActors}`],
    ));
  }
  if (actionLogCount >= 50 && dominantActorTargetPairShare > 0.35) {
    warnings.push(issue(
      "dominant_actor_target_pair",
      "warning",
      "특정 actor-target pair가 장기 로그를 과도하게 지배한다.",
      [`dominantActorTargetPairShare=${dominantActorTargetPairShare.toFixed(2)}`],
    ));
  }
  if (repeatedVisibleBehaviorCount > actionLogCount * 0.2) {
    warnings.push(issue(
      "repeated_visible_behavior",
      "warning",
      "같은 visibleBehavior가 너무 자주 반복된다.",
      [`duplicates=${repeatedVisibleBehaviorCount}/${actionLogCount}`],
    ));
  }
  if (repeatedUtteranceCount > utterances.length * 0.15) {
    warnings.push(issue(
      "repeated_utterance_candidate",
      "warning",
      "같은 대사 후보가 너무 자주 반복된다.",
      [`duplicates=${repeatedUtteranceCount}/${utterances.length}`],
    ));
  }
  if (dominantActionTypeShare > 0.45) {
    warnings.push(issue(
      "dominant_action_type",
      "warning",
      "특정 action type이 장면을 과도하게 지배한다.",
      [`dominantActionTypeShare=${dominantActionTypeShare.toFixed(2)}`],
    ));
  }
  if (actionLogCount >= 20 && actionOperatorAcceptanceRate > 0.97) {
    warnings.push(issue(
      "low_world_friction",
      "warning",
      "GM이 행동을 거의 모두 accepted로 처리해 세계 저항이 약하다.",
      [`accepted=${acceptedActionOperators}/${actionLogCount}`],
    ));
  }
  if (actionLogCount >= 20 && blockedPlanTransitions + abandonedPlanTransitions === 0) {
    warnings.push(issue(
      "low_plan_lifecycle_tension",
      "warning",
      "계획이 blocked/abandoned로 꺾이는 로그가 없어 장기 긴장 변화가 약하다.",
      [`blocked=${blockedPlanTransitions}`, `abandoned=${abandonedPlanTransitions}`],
    ));
  }
  checkMetric("causalContinuity", resolvedThresholds.minCausalContinuity, "blocking", "follow-up pressure가 다음 사건으로 충분히 carryover되지 않는다.");
  checkMetric("followUpResolvedRate", resolvedThresholds.minFollowUpResolvedRate, "blocking", "follow-up pressure가 다음 concrete 행동으로 충분히 해소되지 않는다.");
  checkMetric("uniqueOutcomeRate", resolvedThresholds.minUniqueOutcomeRate, "blocking", "sceneOutcome이 너무 반복되어 장면별 결과 변화가 약하다.");
  checkMetric("followUpSeedUniqueness", resolvedThresholds.minFollowUpSeedUniqueness, "blocking", "followUpActionSeed가 너무 적은 템플릿으로 반복된다.");
  checkMetric("targetReactionUniqueness", resolvedThresholds.minTargetReactionUniqueness, "warning", "targetReaction이 너무 적은 템플릿으로 반복된다.");
  checkMetric("concreteStateDeltaRate", resolvedThresholds.minConcreteStateDeltaRate, "blocking", "action log가 concrete state delta를 충분히 남기지 않는다.");
  checkMetric("operatorCategoryDiversity", resolvedThresholds.minOperatorCategoryDiversity, "warning", "action operator category가 충분히 다양하지 않다.");
  checkMetric("actionOperatorAcceptanceRate", resolvedThresholds.minActionOperatorAcceptanceRate, "blocking", "action operator precondition 통과율이 너무 낮다.");
  checkMetric("planLifecycleCoverage", resolvedThresholds.minPlanLifecycleCoverage, "warning", "plan lifecycle 상태가 충분히 기록되지 않는다.");
  checkMetric("narrativeDirectorWorldConditionRate", resolvedThresholds.minNarrativeDirectorWorldConditionRate, "blocking", "NarrativeDirector pressure가 world condition으로 충분히 남지 않는다.");
  checkMetric("worldConditionActionRate", resolvedThresholds.minWorldConditionActionRate, "warning", "월드 조건이 action log와 GM 판정에 충분히 반영되지 않는다.");
  checkMetric("foreshadowScheduleCoverage", resolvedThresholds.minForeshadowScheduleCoverage, "blocking", "복선 plant/hint/reveal 일정이 월드 이벤트 로그에 충분히 남지 않는다.");
  if (genericPressureTemplateCount > actionLogCount * 0.2) {
    blockingIssues.push(issue(
      "generic_pressure_templates",
      "blocking",
      "후속 압력이 concrete action/state delta가 아니라 일반 문장 템플릿으로 반복된다.",
      [`genericPressureTemplateCount=${genericPressureTemplateCount}/${actionLogCount}`],
    ));
  }
  if (weightedScore < resolvedThresholds.minScore) {
    warnings.push(issue(
      "low_world_model_quality_score",
      "warning",
      "월드 모델 품질 총점이 목표보다 낮다.",
      [`score=${weightedScore.toFixed(2)} < ${resolvedThresholds.minScore.toFixed(2)}`],
    ));
  }

  const lowMetrics = Object.entries(metrics)
    .filter(([metric, value]) => value < resolvedThresholds[`min${metric[0]!.toUpperCase()}${metric.slice(1)}` as keyof WorldModelQualityThresholds])
    .map(([metric]) => recommendationForMetric(metric as keyof typeof metrics));
  const recommendations = Array.from(new Set(lowMetrics));
  const verdict = blockingIssues.length > 0
    ? "fail"
    : warnings.length > 0
      ? "warn"
      : "pass";

  return WorldModelQualityReportSchema.parse({
    mode: "world_model_quality",
    score: weightedScore,
    verdict,
    metrics,
    counts: {
      actionLogs: actionLogCount,
      interactionResolutions: interactionResolutions.length,
      sceneLogs: result.sceneLogs.length,
      logsWithTargets,
      logsWithReactions,
      logsUsingPriorObservation: logsWithPriorObservation,
      logsWithMemoryUpdates,
      logsWithBeliefUpdates,
      logsUsingKnownFactsInDecision,
      logsWithTrustDeltas,
      repeatedVisibleBehaviorCount,
      repeatedUtteranceCount,
      duplicateActorTargetPairCount,
      dominantActionTypeShare: round2(dominantActionTypeShare),
      dominantActorTargetPairShare: round2(dominantActorTargetPairShare),
      uniqueActors,
      uniqueActorTargetPairs,
      uniqueActionTypes,
      uniqueTargetReactions: uniqueCount(normalizedValues(targetReactions)),
      uniqueFollowUpActionSeeds: uniqueCount(normalizedValues(followUpActionSeeds)),
      uniqueSceneOutcomes: uniqueCount(normalizedValues(sceneOutcomes)),
      duplicateTargetReactionCount,
      duplicateFollowUpActionSeedCount,
      duplicateSceneOutcomeCount,
      followUpResolutionCandidates: followUpResolution.candidates,
      followUpResolvedCount: followUpResolution.resolved,
      genericPressureTemplateCount,
      actionLogsWithStateDeltas,
      totalStateDeltas,
      sceneLogsWithOutcomeDeltaIds,
      uniqueActionOperatorIds: uniqueCount(normalizedValues(operatorIds)),
      uniqueOperatorCategories: uniqueCount(normalizedValues(operatorCategories)),
      acceptedActionOperators,
      partialActionOperators,
      blockedActionOperators,
      backfiredActionOperators,
      logsWithWorldGameMasterResolution,
      logsUsingWorldCondition,
      worldGameMasterWitnessCount,
      worldGameMasterAffordanceCount,
      activePlanTransitions,
      completedPlanTransitions,
      blockedPlanTransitions,
      abandonedPlanTransitions,
      narrativeDirectorPressureCount,
      narrativeDirectorForcedActionCount,
      expectedForeshadowTouches: expectedForeshadowTouchKeys.length,
      actualForeshadowTouches: coveredForeshadowTouchCount,
    },
    blockingIssues,
    warnings,
    recommendations,
  });
}
