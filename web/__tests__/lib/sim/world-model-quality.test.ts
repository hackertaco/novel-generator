import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import {
  WorldModelQualityReportSchema,
  evaluateWorldModelQuality,
} from "@/lib/sim";
import { runWorldModelFirstSimulation } from "@/lib/sim/world-runner";

function normalizeLegacySeedInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const seed = input as Record<string, unknown>;
  const foreshadowing = Array.isArray(seed.foreshadowing)
    ? seed.foreshadowing.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const value = { ...(item as Record<string, unknown>) };
      const plantedAt = typeof value.planted_at === "number"
        ? value.planted_at
        : typeof value.plant_chapter === "number"
          ? value.plant_chapter
          : 1;
      const revealAt = typeof value.reveal_at === "number"
        ? value.reveal_at
        : typeof value.reveal_chapter === "number"
          ? value.reveal_chapter
          : null;
      return {
        ...value,
        name: value.name ?? value.id,
        canonical_target: value.canonical_target ?? value.description,
        planted_at: plantedAt,
        hints_at: value.hints_at ?? value.hint_chapters ?? [],
        reveal_at: revealAt,
        origin: value.origin ?? {
          episode_id: `ep_${String(plantedAt).padStart(3, "0")}`,
          scene_id: `scene_${String(plantedAt).padStart(3, "0")}_01`,
          source_span: {
            start_offset: 0,
            end_offset: 1,
            excerpt: String(value.description ?? value.id ?? "foreshadowing"),
          },
        },
      };
    })
    : [];
  return {
    ...seed,
    story_threads: seed.story_threads ?? [],
    extended_outlines: seed.extended_outlines ?? [],
    foreshadowing,
  };
}

function loadFixtureSeed(): NovelSeed {
  const raw = readFileSync(
    join(process.cwd(), "seeds/test-romance-fantasy.json"),
    "utf8",
  );
  return NovelSeedSchema.parse(normalizeLegacySeedInput(JSON.parse(raw)));
}

describe("world model quality evaluator", () => {
  it("scores whether agents react, remember, change relationships, and avoid repetition", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 3,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
    });

    const report = evaluateWorldModelQuality(result, {
      minScore: 0.1,
      minResponsiveness: 0.1,
      minMemoryInfluence: 0.1,
      minRelationshipDynamics: 0.1,
      minAgencyDistribution: 0.1,
      minRepetitionControl: 0.1,
      minCausalContinuity: 0.1,
    });

    expect(WorldModelQualityReportSchema.safeParse(report).success).toBe(true);
    expect(report.counts.actionLogs).toBe(result.actionLogs.length);
    expect(report.counts.interactionResolutions).toBe(result.interactionResolutions.length);
    expect(report.score).toBeGreaterThan(0);
    expect(report.metrics.responsiveness).toBeGreaterThan(0);
    expect(report.metrics.memoryInfluence).toBeGreaterThan(0);
    expect(report.metrics.relationshipDynamics).toBeGreaterThan(0);
    expect(report.metrics.actorTargetDiversity).toBeGreaterThan(0);
    expect(report.metrics.repetitionControl).toBeGreaterThan(0);
    expect(report.metrics.followUpResolvedRate).toBeGreaterThan(0);
    expect(report.metrics.uniqueOutcomeRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.concreteStateDeltaRate).toBe(1);
    expect(report.metrics.operatorCategoryDiversity).toBeGreaterThan(0);
    expect(report.metrics.actionOperatorAcceptanceRate).toBeGreaterThan(0);
    expect(report.metrics.planLifecycleCoverage).toBeGreaterThan(0);
    expect(report.metrics.narrativeDirectorWorldConditionRate).toBe(1);
    expect(report.metrics.worldConditionActionRate).toBe(1);
    expect(report.metrics.foreshadowScheduleCoverage).toBe(1);
    expect(report.counts.followUpResolutionCandidates).toBe(result.actionLogs.length - 1);
    expect(report.counts.uniqueFollowUpActionSeeds).toBeGreaterThan(0);
    expect(report.counts.uniqueActorTargetPairs).toBeGreaterThan(0);
    expect(report.counts.uniqueActionOperatorIds).toBeGreaterThan(0);
    expect(report.counts.uniqueOperatorCategories).toBeGreaterThan(0);
    expect(report.counts.acceptedActionOperators).toBeGreaterThan(0);
    expect(report.counts.logsWithWorldGameMasterResolution).toBe(result.actionLogs.length);
    expect(report.counts.logsUsingWorldCondition).toBe(result.actionLogs.length);
    expect(report.counts.worldGameMasterAffordanceCount).toBeGreaterThanOrEqual(result.actionLogs.length);
    expect(report.counts.activePlanTransitions + report.counts.completedPlanTransitions).toBeGreaterThan(0);
    expect(report.counts.narrativeDirectorPressureCount).toBe(result.sceneLogs.length);
    expect(report.counts.narrativeDirectorForcedActionCount).toBe(0);
    expect(report.counts.expectedForeshadowTouches).toBeGreaterThan(0);
    expect(report.counts.actualForeshadowTouches).toBe(report.counts.expectedForeshadowTouches);
    expect(report.counts.totalStateDeltas).toBeGreaterThanOrEqual(result.actionLogs.length);
    expect(result.actionLogs.every((log) => log.actualEffect.stateDeltas.length > 0)).toBe(true);
    expect(result.actionLogs.every((log) => log.action.operator.preconditions.length > 0)).toBe(true);
    expect(result.actionLogs.every((log) => log.action.operator.expectedEffects.length > 0)).toBe(true);
    expect(result.actionLogs.every((log) => log.planLifecycle.linkedFollowUpActionSeed.length > 0)).toBe(true);
    expect(result.sceneLogs.every((scene) => scene.sceneOutcomeDeltaIds.length > 0)).toBe(true);
    expect(result.sceneLogs.every((scene) => scene.narrativeDirectorPressures.length > 0)).toBe(true);
    expect(["pass", "warn", "fail"]).toContain(report.verdict);
  });

  it("keeps world friction, action categories, director pressure, and speech varied enough for long logs", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 8,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const report = evaluateWorldModelQuality(result, {
      minScore: 0.1,
      minResponsiveness: 0.1,
      minMemoryInfluence: 0.1,
      minRelationshipDynamics: 0.1,
      minAgencyDistribution: 0.1,
      minRepetitionControl: 0.1,
      minCausalContinuity: 0.1,
      minFollowUpResolvedRate: 0.1,
    });
    const statuses = new Set(result.actionLogs.map((log) => log.action.operator.status));
    const categories = new Set(result.actionLogs.map((log) => log.action.operator.category));
    const planStatuses = new Set(result.actionLogs.map((log) => log.planLifecycle.nextStatus));
    const firstNonAcceptedIndex = result.actionLogs.findIndex((log) => log.action.operator.status !== "accepted");
    const utteranceCount = result.interactionResolutions.length;
    const uniqueUtteranceCount = new Set(
      result.interactionResolutions.map((resolution) => resolution.speechDraft.utteranceCandidate),
    ).size;
    const actorTargetPairs = new Set(result.actionLogs.map((log) =>
      `${log.actorId}->${log.targetIds[0] ?? "scene"}`
    ));

    expect(statuses.has("partial") || statuses.has("backfired") || statuses.has("blocked")).toBe(true);
    expect(categories).toEqual(new Set(["information", "magic", "social", "political", "physical"]));
    expect(planStatuses).toEqual(new Set(["active", "abandoned", "blocked", "completed"]));
    expect(result.actionLogs.every((log) => log.privateState.activeIntentionId.startsWith("intention:"))).toBe(true);
    expect(result.actionLogs.every((log) => log.privateState.retrievedMemoryIds.length > 0)).toBe(true);
    expect(result.actionLogs.every((log) =>
      log.privateState.agentBrain.intentionStack.some((frame) =>
        frame.intentionId === log.privateState.activeIntentionId
      )
    )).toBe(true);
    expect(result.actionLogs.every((log) =>
      log.privateState.agentBrain.memoryStore.retrievedMemoryIds.length > 0
    )).toBe(true);
    expect(result.actionLogs.every((log) =>
      log.privateState.agentBrain.beliefStore.knownFactCount >= log.privateState.knownFacts.length
    )).toBe(true);
	    expect(result.actionLogs.every((log) =>
	      log.privateState.agentBrain.desireStore.hiddenGoal.length > 0
	    )).toBe(true);
	    expect(result.actionLogs.every((log) =>
	      log.privateState.agentBrain.desireStore.activeGoalId.length > 0
	    )).toBe(true);
	    expect(result.actionLogs.every((log) =>
	      log.privateState.agentBrain.desireStore.goalHierarchy.length >= 3
	    )).toBe(true);
	    expect(result.actionLogs.every((log) =>
	      log.privateState.agentBrain.desireStore.goalHierarchy.some((goal) =>
	        goal.linkedIntentionIds.includes(log.privateState.activeIntentionId)
	      )
	    )).toBe(true);
	    expect(result.actionLogs.some((log) =>
	      log.privateState.agentBrain.desireStore.goalHierarchy.some((goal) =>
	        goal.horizon !== "scene" && goal.status !== "active"
	      )
	    )).toBe(true);
	    expect(result.actionLogs.every((log) =>
	      Object.keys(log.privateState.agentBrain.beliefStore.trustByCharacter).length > 0
	    )).toBe(true);
	    const beliefSummaries = result.actionLogs.flatMap((log) =>
	      log.beliefUpdates.map((belief) => belief.belief)
	    );
	    const genericBeliefCount = beliefSummaries.filter((belief) =>
	      belief.includes("아직 더 확인해야 하는 상대")
	    ).length;
	    expect(genericBeliefCount / beliefSummaries.length).toBeLessThan(0.25);
	    expect(new Set(beliefSummaries).size / beliefSummaries.length).toBeGreaterThan(0.4);
	    for (let chapter = 2; chapter <= 8; chapter += 1) {
      const previousChapterLogs = result.actionLogs.filter((log) => log.chapter === chapter - 1);
      const nextChapterFirstLogs = result.actionLogs
        .filter((log) => log.chapter === chapter)
        .slice(0, 2);
      const carryoverPressure = previousChapterLogs
        .slice()
        .reverse()
        .find((log) => log.planLifecycle.nextStatus !== "completed")
        ?.actualEffect.followUpActionSeed;

      expect(carryoverPressure).toBeTruthy();
      expect(nextChapterFirstLogs.some((log) =>
        log.observed.some((entry) => entry.includes(`이전 화 unresolved pressure: ${carryoverPressure}`))
      )).toBe(true);
    }
    expect(firstNonAcceptedIndex).toBeGreaterThanOrEqual(0);
    expect(result.actionLogs.slice(firstNonAcceptedIndex + 1, firstNonAcceptedIndex + 4).some((log) =>
      log.observed.some((entry) => entry.includes("직전 GM result"))
    )).toBe(true);
    expect(uniqueUtteranceCount / utteranceCount).toBeGreaterThan(0.9);
    expect(report.counts.repeatedUtteranceCount).toBe(0);
    expect(actorTargetPairs.size).toBeGreaterThanOrEqual(10);
    expect(report.metrics.actorTargetDiversity).toBeGreaterThanOrEqual(0.5);
    expect(report.counts.dominantActorTargetPairShare).toBeLessThan(0.25);
    expect(report.warnings.map((warning) => warning.code)).not.toContain("narrow_interaction_graph");
    expect(result.sceneLogs.some((scene) =>
      scene.narrativeDirectorPressures.some((pressure) => pressure.summary.includes("독살당한 공작 영애"))
    )).toBe(false);
    expect(report.warnings.map((warning) => warning.code)).not.toContain("low_world_friction");
    expect(report.warnings.map((warning) => warning.code)).not.toContain("low_plan_lifecycle_tension");
    expect(report.warnings.map((warning) => warning.code)).not.toContain("low_worldConditionActionRate");
    expect(report.blockingIssues.map((issue) => issue.code)).not.toContain("low_foreshadowScheduleCoverage");
  });

  it("uses world-grounded fallback pressure after authored outlines end", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 201,
      endChapter: 203,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const leakedLoglineFallback = /독살당한 공작 영애|흐름이 진전된다/u;

    expect(result.sceneLogs).toHaveLength(3);
    expect(result.sceneLogs.every((scene) =>
      scene.narrativeDirectorPressures.every((pressure) =>
        !leakedLoglineFallback.test(pressure.summary)
      )
    )).toBe(true);
    expect(result.sceneLogs.every((scene) =>
      !leakedLoglineFallback.test([
        scene.atmosphere,
        scene.emotionalArc.start,
        scene.emotionalArc.turn,
        scene.sceneOutcome,
        ...scene.rendererGuidance,
      ].join(" "))
    )).toBe(true);
    expect(result.actionLogs.every((log) =>
      !leakedLoglineFallback.test([
        ...log.observed,
        log.action.rationale,
        log.intendedEffect,
        log.actualEffect.targetReaction,
        log.actualEffect.followUpActionSeed,
        ...log.actualEffect.stateDeltas.map((delta) => delta.summary),
      ].join(" "))
    )).toBe(true);
    expect(result.actionLogs.some((log) =>
      log.observed.some((entry) => /은잔|약혼 반지 케이스|은시계|기록|목격담|문서|자백|출입 흔적/u.test(entry))
    )).toBe(true);
  });

  it("keeps late 300-chapter world pressure on long-arc stages instead of flat modulo loops", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 241,
      endChapter: 250,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const directorPressures = result.sceneLogs.flatMap((scene) => scene.narrativeDirectorPressures);
    const longArcThreadIds = directorPressures.flatMap((pressure) =>
      pressure.targetThreadIds.filter((threadId) => threadId.startsWith("long-arc:"))
    );
    const eventClassThreadIds = directorPressures.flatMap((pressure) =>
      pressure.targetThreadIds.filter((threadId) => threadId.startsWith("event-class:"))
    );
    const incidentThreadIds = directorPressures.flatMap((pressure) =>
      pressure.targetThreadIds.filter((threadId) => threadId.startsWith("incident:"))
    );
    const summaries = directorPressures.map((pressure) => pressure.summary).join(" ");

    expect(result.sceneLogs).toHaveLength(10);
    expect(new Set(longArcThreadIds)).toEqual(new Set(["long-arc:power-settlement"]));
    expect(new Set(eventClassThreadIds).size).toBeGreaterThanOrEqual(4);
    expect(new Set(incidentThreadIds).size).toBeGreaterThanOrEqual(2);
    expect(new Set(directorPressures.map((pressure) => pressure.type)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(result.sceneLogs.map((scene) => scene.scenePurpose)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(result.sceneLogs.map((scene) => scene.location)).size).toBeGreaterThanOrEqual(8);
    expect(result.sceneLogs.some((scene) => scene.location.includes(" "))).toBe(true);
    expect(summaries).toMatch(/권력 정산|최종 책임|증언|파벌|기록|출입|의례|청문|봉인|정산/u);
    expect(summaries).not.toMatch(/타이밍는|타이밍를|은잔와|수상한 물건를/u);
    expect(result.actionLogs.every((log) =>
      !/타이밍는|타이밍를|은잔와|수상한 물건를/u.test(log.observed.join(" "))
    )).toBe(true);
    expect(result.actionLogs.every((log) =>
      log.observed.some((entry) => entry.includes("월드 조건:"))
    )).toBe(true);
  });

  it("fails shallow world logs that repeat generic follow-up and scene outcomes", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 3,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
    });
    const shallow: typeof result = {
      ...result,
      actionLogs: result.actionLogs.map((log) => ({
        ...log,
        visibleBehavior: "상대의 표정을 살핀다",
        intendedEffect: "상대의 반응을 확인한다",
        actualEffect: {
          ...log.actualEffect,
          targetReaction: "상대는 바로 답하지 않고 바라본다",
          followUpActionSeed: "상대가 반응할 이유가 생긴다",
        },
      })),
      sceneLogs: result.sceneLogs.map((scene) => ({
        ...scene,
        sceneOutcome: "다음 반응이 필요해진다",
      })),
    };

    const report = evaluateWorldModelQuality(shallow);

    expect(report.verdict).toBe("fail");
    expect(report.metrics.followUpResolvedRate).toBe(0);
    expect(report.metrics.uniqueOutcomeRate).toBeLessThan(0.7);
    expect(report.counts.uniqueFollowUpActionSeeds).toBe(1);
    expect(report.counts.genericPressureTemplateCount).toBe(result.actionLogs.length);
    expect(report.blockingIssues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "low_followUpResolvedRate",
        "low_uniqueOutcomeRate",
        "low_followUpSeedUniqueness",
        "generic_pressure_templates",
      ]),
    );
  });
});
