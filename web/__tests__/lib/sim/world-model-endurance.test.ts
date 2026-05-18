import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import { analyzeWorldModelEndurance, WorldModelEnduranceReportSchema } from "@/lib/sim";
import { runWorldModelFirstSimulation } from "@/lib/sim/world-runner";

function normalizeLegacySeedInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const seed = input as Record<string, unknown>;
  const foreshadowing = Array.isArray(seed.foreshadowing)
    ? seed.foreshadowing.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }

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

function recentMemorySignature(state: { recentMemorySummaries: string[] }) {
  return state.recentMemorySummaries.slice(-3).join(" || ");
}

describe("world model endurance metrics", () => {
  it("measures agent action coverage and long-form risk signals from a real run", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 3,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 2,
      characterSimulationMode: "agent_ticks",
    });

    const report = analyzeWorldModelEndurance(result, {
      minActorActionShare: 0.01,
      minRoleActionShare: 0.01,
    });

    expect(WorldModelEnduranceReportSchema.safeParse(report).success).toBe(true);
    expect(report.chapters).toEqual({ start: 1, end: 3, count: 3 });
    expect(report.actionLogCount).toBe(result.actionLogs.length);
    expect(report.eventCount).toBe(result.report.generatedEventCount);
    expect(report.actionLogsPerChapter).toBeGreaterThanOrEqual(2);
    expect(report.actorCounts.elysia).toBeGreaterThan(0);
    expect(report.roleCounts.protagonist).toBeGreaterThan(0);
    expect(report.diagnostics.avgReactionCoverage).toBeGreaterThan(0);
    expect(report.runtimeContinuity.charactersWithNewKnowledge).toBeGreaterThan(0);
    expect(report.worldModelQuality.mode).toBe("world_model_quality");
    expect(report.worldModelQuality.counts.actionLogs).toBe(result.actionLogs.length);
    expect(report.worldModelQuality.score).toBeGreaterThan(0);
    expect(["pass", "warn", "fail"]).toContain(report.verdict);
  });

  it("continues runtime mind state and ledger through checkpoints", () => {
    const seed = loadFixtureSeed();
    const firstChunk = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 3,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 2,
      characterSimulationMode: "agent_ticks",
    });
    const secondChunk = runWorldModelFirstSimulation(seed, {
      startChapter: 4,
      endChapter: 5,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 2,
      characterSimulationMode: "agent_ticks",
      initialCheckpoint: firstChunk.checkpoint,
    });

    expect(secondChunk.ledger.events.length).toBe(
      firstChunk.ledger.events.length + secondChunk.report.generatedEventCount,
    );
    expect(secondChunk.report.generatedEventCount).toBeGreaterThan(0);
    expect(secondChunk.checkpoint.previousEvent?.chapter).toBe(5);
    expect(secondChunk.runtimeMindStates.elysia.recentMemorySummaries.length).toBeGreaterThanOrEqual(
      firstChunk.runtimeMindStates.elysia.recentMemorySummaries.length,
    );
    expect(secondChunk.runtimeMindStates.elysia.recentVisibleBehaviors.length).toBeGreaterThanOrEqual(
      firstChunk.runtimeMindStates.elysia.recentVisibleBehaviors.length,
    );
    expect(secondChunk.runtimeMindStates.elysia.recentUtterances.length).toBeGreaterThanOrEqual(
      firstChunk.runtimeMindStates.elysia.recentUtterances.length,
    );
    expect(secondChunk.runtimeMindStates.elysia.reflectionNotes.length).toBeGreaterThan(0);
    expect(secondChunk.runtimeMindStates.elysia.proceduralMemory.length).toBeGreaterThan(0);
    expect(Object.keys(secondChunk.runtimeMindStates.elysia.actionFatigueByType).length).toBeGreaterThan(0);
    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.memoryStore.episodicMemory.length).toBeGreaterThan(
      firstChunk.runtimeMindStates.elysia.agentBrainState.memoryStore.episodicMemory.length,
    );
    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.memoryStore.semanticMemory.length).toBeGreaterThan(
      firstChunk.runtimeMindStates.elysia.agentBrainState.memoryStore.semanticMemory.length,
    );
    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.memoryStore.proceduralMemory.length).toBeGreaterThan(0);
	    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.intentionStack.length).toBeGreaterThan(0);
	    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.desireStore.activeGoalId.length).toBeGreaterThan(0);
	    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.desireStore.goalHierarchy.length).toBeGreaterThanOrEqual(3);
	    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.desireStore.goalHierarchy.some((goal) =>
	      goal.horizon === "long"
	    )).toBe(true);
	    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.desireStore.goalHierarchy.some((goal) =>
	      goal.horizon === "scene" && goal.updatedAtChapter >= 4
	    )).toBe(true);
	    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.desireStore.goalHierarchy.some((goal) =>
	      goal.linkedIntentionIds.some((intentionId) => intentionId.startsWith("intention:elysia:"))
	    )).toBe(true);
	    expect(secondChunk.runtimeMindStates.elysia.agentBrainState.desireStore.goalHierarchy.some((goal) =>
	      goal.horizon !== "scene" && goal.status !== "active"
	    )).toBe(true);
	    expect(Object.keys(secondChunk.runtimeMindStates.elysia.agentBrainState.reflection.actionFatigueByType).length)
	      .toBeGreaterThan(0);
    expect(secondChunk.actionLogs.some((log) =>
      log.privateState.retrievedMemoryIds.some((memoryId) => memoryId.includes("fact"))
    )).toBe(true);

    const runtimeStates = Object.values(secondChunk.runtimeMindStates);
    const signatureDiversity = new Set(runtimeStates.map(recentMemorySignature)).size / runtimeStates.length;
    expect(signatureDiversity).toBeGreaterThanOrEqual(0.6);
    expect(secondChunk.actionLogs.every((log) =>
      log.actualEffect.worldGameMaster.witnessCharacterIds.length <= 1
    )).toBe(true);
  });
});
