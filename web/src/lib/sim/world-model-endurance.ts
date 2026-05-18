import { z } from "zod";

import { buildCharacterSimulationProfiles } from "./character-action-sim";
import {
  WorldModelQualityReportSchema,
  evaluateWorldModelQuality,
} from "./world-model-quality";
import type { WorldModelRunResult } from "./world-runner";

const CountRecordSchema = z.record(z.string(), z.number().int().nonnegative());

export const WorldModelEnduranceLowActivitySchema = z.object({
  id: z.string(),
  count: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
});

export const WorldModelEnduranceReportSchema = z.object({
  mode: z.literal("world_model_endurance"),
  chapters: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
    count: z.number().int().positive(),
  }),
  eventCount: z.number().int().nonnegative(),
  actionLogCount: z.number().int().nonnegative(),
  actionLogsPerChapter: z.number().min(0),
  actorCounts: CountRecordSchema,
  roleCounts: CountRecordSchema,
  actionTypeCounts: CountRecordSchema,
  actorCoverageRatio: z.number().min(0).max(1),
  roleCoverageRatio: z.number().min(0).max(1),
  dominantActorShare: z.number().min(0).max(1),
  dominantRoleShare: z.number().min(0).max(1),
  lowActivityActors: z.array(WorldModelEnduranceLowActivitySchema),
  lowActivityRoles: z.array(WorldModelEnduranceLowActivitySchema),
  diagnostics: z.object({
    inactiveWarningCount: z.number().int().nonnegative(),
    repeatedWarningCount: z.number().int().nonnegative(),
    unresolvedPressureCount: z.number().int().nonnegative(),
    avgReactionCoverage: z.number().min(0).max(1),
    avgMemoryUpdateRate: z.number().min(0),
  }),
  runtimeContinuity: z.object({
    planCarryoverEventCount: z.number().int().nonnegative(),
    charactersWithNewKnowledge: z.number().int().nonnegative(),
    charactersWithTrustDeltas: z.number().int().nonnegative(),
  }),
  validation: z.object({
    passed: z.boolean(),
    issueCount: z.number().int().nonnegative(),
    issueCodes: z.array(z.string()),
  }),
  worldModelQuality: WorldModelQualityReportSchema,
  verdict: z.enum(["pass", "warn", "fail"]),
  reasons: z.array(z.string()),
});

export type WorldModelEnduranceLowActivity = z.infer<typeof WorldModelEnduranceLowActivitySchema>;
export type WorldModelEnduranceReport = z.infer<typeof WorldModelEnduranceReportSchema>;

export interface WorldModelEnduranceThresholds {
  minActionsPerChapter: number;
  minActorActionShare: number;
  minRoleActionShare: number;
  maxDominantActorShare: number;
  maxDominantRoleShare: number;
}

export const DEFAULT_WORLD_MODEL_ENDURANCE_THRESHOLDS: WorldModelEnduranceThresholds = {
  minActionsPerChapter: 2,
  minActorActionShare: 0.02,
  minRoleActionShare: 0.02,
  maxDominantActorShare: 0.55,
  maxDominantRoleShare: 0.65,
};

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxShare(record: Record<string, number>, total: number): number {
  if (total === 0) return 0;
  return Math.max(0, ...Object.values(record)) / total;
}

function lowActivityItems(
  ids: string[],
  counts: Record<string, number>,
  total: number,
  minShare: number,
): WorldModelEnduranceLowActivity[] {
  if (total === 0) {
    return ids.map((id) => ({ id, count: 0, share: 0 }));
  }

  return ids
    .map((id) => ({
      id,
      count: counts[id] ?? 0,
      share: ratio(counts[id] ?? 0, total),
    }))
    .filter((item) => item.share < minShare);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function analyzeWorldModelEndurance(
  result: WorldModelRunResult,
  thresholds: Partial<WorldModelEnduranceThresholds> = {},
): WorldModelEnduranceReport {
  const resolvedThresholds = {
    ...DEFAULT_WORLD_MODEL_ENDURANCE_THRESHOLDS,
    ...thresholds,
  };
  const actionLogCount = result.actionLogs.length;
  const actorCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  const actionTypeCounts: Record<string, number> = {};

  for (const log of result.actionLogs) {
    increment(actorCounts, log.actorId);
    increment(roleCounts, log.privateState.agentRole);
    increment(actionTypeCounts, log.action.type);
  }

  const characterMinds = Object.values(result.brain.characterMinds);
  const roleByActor = new Map(
    buildCharacterSimulationProfiles(result.brain).map((profile) => [
      profile.characterId,
      profile.agentRole,
    ]),
  );
  const actorIds = uniqueSorted(characterMinds.map((mind) => mind.characterId));
  const roleIds = uniqueSorted(characterMinds.map((mind) => {
    const matchingLog = result.actionLogs.find((log) => log.actorId === mind.characterId);
    return matchingLog?.privateState.agentRole ?? roleByActor.get(mind.characterId) ?? mind.role;
  }));
  const activeActorCount = actorIds.filter((id) => (actorCounts[id] ?? 0) > 0).length;
  const activeRoleCount = roleIds.filter((id) => (roleCounts[id] ?? 0) > 0).length;
  const diagnostics = result.simulationDiagnostics;
  const chapterCount = result.report.generatedChapterCount;
  const actionLogsPerChapter = chapterCount === 0 ? 0 : actionLogCount / chapterCount;
  const issueCodes = result.report.validation.issues.map((issue) => issue.code);

  const reasons: string[] = [];
  let verdict: "pass" | "warn" | "fail" = "pass";

  const fail = (reason: string) => {
    verdict = "fail";
    reasons.push(reason);
  };
  const warn = (reason: string) => {
    if (verdict !== "fail") verdict = "warn";
    reasons.push(reason);
  };

  if (!result.report.validation.passed) {
    fail(`causal ledger validation failed with ${result.report.validation.issueCount} issue(s)`);
  }
  if (actionLogsPerChapter < resolvedThresholds.minActionsPerChapter) {
    warn(`low action density: ${actionLogsPerChapter.toFixed(2)} actions/chapter`);
  }

  const dominantActorShare = maxShare(actorCounts, actionLogCount);
  const dominantRoleShare = maxShare(roleCounts, actionLogCount);
  if (dominantActorShare > resolvedThresholds.maxDominantActorShare) {
    warn(`dominant actor share too high: ${(dominantActorShare * 100).toFixed(1)}%`);
  }
  if (dominantRoleShare > resolvedThresholds.maxDominantRoleShare) {
    warn(`dominant role share too high: ${(dominantRoleShare * 100).toFixed(1)}%`);
  }

  const lowActivityActors = lowActivityItems(
    actorIds,
    actorCounts,
    actionLogCount,
    resolvedThresholds.minActorActionShare,
  );
  const lowActivityRoles = lowActivityItems(
    roleIds,
    roleCounts,
    actionLogCount,
    resolvedThresholds.minRoleActionShare,
  );
  if (lowActivityActors.length > 0) {
    warn(`low activity actors: ${lowActivityActors.map((item) => item.id).join(", ")}`);
  }
  if (lowActivityRoles.length > 0) {
    warn(`low activity roles: ${lowActivityRoles.map((item) => item.id).join(", ")}`);
  }
  const worldModelQuality = evaluateWorldModelQuality(result);
  if (worldModelQuality.verdict === "fail") {
    fail(`world model quality failed: ${worldModelQuality.blockingIssues.map((item) => item.code).join(", ")}`);
  } else if (worldModelQuality.verdict === "warn") {
    warn(`world model quality warnings: ${worldModelQuality.warnings.map((item) => item.code).join(", ")}`);
  }

  const report = {
    mode: "world_model_endurance" as const,
    chapters: {
      start: result.report.startChapter,
      end: result.report.endChapter,
      count: chapterCount,
    },
    eventCount: result.report.generatedEventCount,
    actionLogCount,
    actionLogsPerChapter,
    actorCounts,
    roleCounts,
    actionTypeCounts,
    actorCoverageRatio: ratio(activeActorCount, actorIds.length),
    roleCoverageRatio: ratio(activeRoleCount, roleIds.length),
    dominantActorShare,
    dominantRoleShare,
    lowActivityActors,
    lowActivityRoles,
    diagnostics: {
      inactiveWarningCount: diagnostics.reduce(
        (sum, item) => sum + item.inactiveCharacterWarnings.length,
        0,
      ),
      repeatedWarningCount: diagnostics.reduce(
        (sum, item) => sum + item.repeatedActionTypeWarnings.length,
        0,
      ),
      unresolvedPressureCount: diagnostics.reduce(
        (sum, item) => sum + item.unresolvedPressureCount,
        0,
      ),
      avgReactionCoverage: average(diagnostics.map((item) => item.reactionCoverage)),
      avgMemoryUpdateRate: average(diagnostics.map((item) => item.memoryUpdateRate)),
    },
    runtimeContinuity: result.report.worldBrain.runtimeContinuity,
    validation: {
      passed: result.report.validation.passed,
      issueCount: result.report.validation.issueCount,
      issueCodes,
    },
    worldModelQuality,
    verdict,
    reasons,
  };

  return WorldModelEnduranceReportSchema.parse(report);
}
