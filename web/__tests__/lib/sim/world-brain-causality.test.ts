import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
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

describe("WorldBrain causality logs", () => {
  it("records plan, knowledge ownership, and action economics for character actions", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 3,
      characterActionsPerChapter: 2,
    });
    const characterActions = result.ledger.events.filter((event) =>
      event.tags.includes("character-action")
    );

    expect(characterActions.length).toBeGreaterThanOrEqual(12);
    expect(result.actionLogs).toHaveLength(characterActions.length);
    expect(result.interactionResolutions).toHaveLength(characterActions.length);
    expect(result.simulationDiagnostics).toHaveLength(3);
    expect(result.report.worldBrain.agentActionSimulation).toEqual(expect.objectContaining({
      mode: "agent_ticks",
      actionLogCount: characterActions.length,
      interactionResolutionCount: characterActions.length,
    }));
    expect(result.report.worldBrain.agentActionSimulation.reactionCoverage).toBeGreaterThanOrEqual(0.7);
    expect(result.sceneLogs).toHaveLength(3);
    expect(result.report.worldBrain.sceneLogCount).toBe(3);
    expect(result.report.worldBrain.dialogueTurnCount).toBe(characterActions.length);
    expect(result.report.worldBrain.runtimeMindStateCount).toBeGreaterThanOrEqual(5);
    expect(result.report.worldBrain.runtimeContinuity.planCarryoverEventCount).toBeGreaterThanOrEqual(1);
    expect(result.report.worldBrain.runtimeContinuity.charactersWithNewKnowledge).toBeGreaterThanOrEqual(2);
    expect(result.report.worldBrain.runtimeContinuity.charactersWithTrustDeltas).toBeGreaterThanOrEqual(2);
    expect(result.sceneLogs.flatMap((sceneLog) => sceneLog.dialogueTurns)).toHaveLength(characterActions.length);
    const elysiaChapter1 = characterActions.find((event) =>
      event.chapter === 1 && event.actorId === "elysia"
    );
    const elysiaChapter2 = characterActions.find((event) =>
      event.chapter === 2 && event.actorId === "elysia"
    );

    expect(elysiaChapter1?.payload?.planTransition).toEqual(expect.objectContaining({
      afterPlan: expect.any(String),
    }));
    expect(elysiaChapter2?.payload?.planTransition).toEqual(expect.objectContaining({
      beforePlan: (elysiaChapter1?.payload?.planTransition as { afterPlan?: string }).afterPlan,
    }));
    const elysiaKnownFacts = result.runtimeMindStates.elysia?.knownFacts ?? [];
    expect(elysiaKnownFacts.length).toBeGreaterThan(
      result.brain.characterMinds.elysia?.knownFacts.length ?? 0,
    );
    expect(elysiaKnownFacts.some((fact) => fact.includes("세레나 크레센트"))).toBe(true);
    const initialKnownFacts = Object.values(result.brain.characterMinds)
      .flatMap((mind) => mind.knownFacts);
    expect(initialKnownFacts).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/(라엘|카이젠|마리안)와 관계가 있다/u),
      ]),
    );
    expect(result.actionLogs.some((log) => log.privateState.agentRole === "antagonist")).toBe(true);
    expect(result.actionLogs.some((log) => log.privateState.agentRole === "villain")).toBe(true);
    expect(result.actionLogs.some((log) => log.privateState.agentRole === "ally")).toBe(true);
    for (const event of characterActions) {
      expect(event.payload?.planTransition).toEqual(expect.objectContaining({
        characterId: event.actorId,
        beforePlan: expect.any(String),
        afterPlan: expect.any(String),
        reason: expect.any(String),
      }));
      expect(event.payload?.knowledgeFlow).toEqual(expect.objectContaining({
        usedKnowledge: expect.any(Array),
        gainedKnowledge: expect.any(Array),
        ownerCharacterIds: expect.arrayContaining([event.actorId]),
      }));
      expect(event.payload?.actionEconomics).toEqual(expect.objectContaining({
        cost: expect.any(String),
        risk: expect.any(String),
        benefit: expect.any(String),
        consequence: expect.any(String),
      }));
      expect(event.payload?.actorMind).toEqual(expect.objectContaining({
        agentRole: expect.any(String),
        roleMission: expect.any(String),
        activeObjective: expect.any(String),
        decisionPriorities: expect.any(Array),
        autonomyRule: expect.any(String),
      }));
      expect(event.cognition?.memoryUpdates.length).toBeGreaterThanOrEqual(1);
      expect(event.cognition?.beliefUpdates.length).toBeGreaterThanOrEqual(1);
      expect(event.payload?.sourceActionLogIds).toEqual(expect.any(Array));
    }
    for (const sceneLog of result.sceneLogs) {
      expect(sceneLog.sourceEventIds.length).toBeGreaterThan(0);
      expect(sceneLog.sourceActionLogIds.length).toBeGreaterThan(0);
      expect(sceneLog.scenePurpose).toMatch(/^(establish_state|advance_plot|relationship_probe|secret_pressure|information_discovery|foreshadowing|aftermath)$/);
      const directorPurpose = sceneLog.narrativeDirectorPressures[0]?.targetScenePurpose;
      if (directorPurpose) {
        expect(sceneLog.scenePurpose).toBe(directorPurpose);
      }
      for (const turn of sceneLog.dialogueTurns) {
        expect(turn.sourceEventId).toMatch(/^evt_world_/);
        expect(sceneLog.sourceEventIds).toContain(turn.sourceEventId);
        expect(turn.sourceActionLogIds.length).toBeGreaterThan(0);
        expect(turn.utterance).toEqual(expect.any(String));
        expect(turn.draftStatus).toBe("drafted");
        expect(turn.speechAct).toMatch(/^(probe|deflect|request_help|request_access|maintain_mask|threaten_softly|confess_partial|reassure|withhold)$/);
        expect(turn.voiceGuidance).toEqual(expect.any(Array));
        expect(turn.renderableConstraints).toEqual(expect.objectContaining({
          allowedRevealedFacts: turn.informationRevealed,
          forbiddenExplicitFacts: turn.informationWithheld,
          voiceRequirements: turn.voiceGuidance,
          sourceEventId: turn.sourceEventId,
        }));
        expect(turn.renderableConstraints.requiredSubtext).toEqual(
          expect.arrayContaining([turn.hiddenIntent]),
        );
        expect(turn.spokenIntent).toEqual(expect.any(String));
        expect(turn.hiddenIntent).toEqual(expect.any(String));
        expect(turn.informationRevealed).toEqual(expect.any(Array));
        expect(turn.informationWithheld).toEqual(expect.any(Array));
        expect(turn.listenerInterpretation).toEqual(expect.any(String));
        expect(turn.relationshipEffect).toEqual(expect.any(String));
        expect(turn.interactionDynamics).toEqual(expect.objectContaining({
          utteranceCandidate: turn.utterance,
          surfaceMeaning: expect.any(String),
          hiddenIntention: expect.any(String),
          emotionalShift: expect.objectContaining({
            actorAfter: expect.any(String),
          }),
          powerShift: expect.objectContaining({
            axis: expect.any(String),
          }),
          relationshipShift: expect.objectContaining({
            reason: expect.any(String),
          }),
          writerHooks: expect.objectContaining({
            gesture: expect.any(String),
          }),
        }));
      }
    }
  });
});
