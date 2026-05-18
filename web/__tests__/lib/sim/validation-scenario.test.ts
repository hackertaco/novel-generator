import { describe, expect, it } from "vitest";
import {
  createDeterministicLongFormValidationScenario,
  createSimulationState,
  LONG_FORM_VALIDATION_TOTAL_EPISODES,
} from "@/lib/sim";

describe("long-form validation scenario fixture", () => {
  it("builds a deterministic 300-episode scenario", () => {
    const first = createDeterministicLongFormValidationScenario();
    const second = createDeterministicLongFormValidationScenario();

    expect(first).toEqual(second);
    expect(first.totalEpisodes).toBe(LONG_FORM_VALIDATION_TOTAL_EPISODES);
    expect(first.seed.total_chapters).toBe(LONG_FORM_VALIDATION_TOTAL_EPISODES);
    expect(first.groundTruthCausalEvents).toHaveLength(LONG_FORM_VALIDATION_TOTAL_EPISODES);
    expect(first.groundTruthCausalEvents[0]?.event.id).toBe("evt_001");
    expect(first.groundTruthCausalEvents.at(-1)?.event.id).toBe("evt_300");
    expect(first.continuityCheckpoints.map((checkpoint) => checkpoint.chapter)).toEqual([
      1,
      48,
      96,
      144,
      192,
      240,
      300,
    ]);
  });

  it("keeps checkpoint references aligned with event, fact, and mismatch ids", () => {
    const scenario = createDeterministicLongFormValidationScenario();
    const eventIds = new Set(
      scenario.groundTruthCausalEvents.map((record) => record.event.id),
    );
    const factKeys = new Set(
      scenario.groundTruthCausalEvents.flatMap((record) =>
        record.canonicalFactChanges.map((change) => change.factKey)
      ),
    );
    const mismatchIds = new Set(
      scenario.groundTruthCausalEvents.flatMap((record) =>
        record.expectedMismatchAttributions.map((mismatch) => mismatch.mismatchId)
      ),
    );

    expect(mismatchIds).toEqual(
      new Set([
        "mm_037_jisu_belief",
        "mm_073_haeon_memory",
        "mm_096_jisu_utterance",
        "mm_214_taeyul_belief",
        "mm_247_haeon_belief",
      ]),
    );

    for (const checkpoint of scenario.continuityCheckpoints) {
      expect(checkpoint.chapter).toBeLessThanOrEqual(LONG_FORM_VALIDATION_TOTAL_EPISODES);
      for (const eventId of checkpoint.requiredEventIds) {
        expect(eventIds.has(eventId)).toBe(true);
      }
      for (const factKey of checkpoint.activeFactKeys) {
        expect(factKeys.has(factKey)).toBe(true);
      }
      for (const mismatchId of checkpoint.expectedMismatchIds) {
        expect(mismatchIds.has(mismatchId)).toBe(true);
      }
      for (const memoryExpectation of checkpoint.memoryExpectations) {
        for (const factKey of memoryExpectation.canonicalFactKeys) {
          expect(factKeys.has(factKey)).toBe(true);
        }
      }
      for (const beliefExpectation of checkpoint.beliefExpectations) {
        for (const factKey of beliefExpectation.canonicalFactKeys) {
          expect(factKeys.has(factKey)).toBe(true);
        }
      }
      for (const utteranceExpectation of checkpoint.utteranceExpectations) {
        for (const factKey of utteranceExpectation.canonicalFactKeys) {
          expect(factKeys.has(factKey)).toBe(true);
        }
      }
    }
  });

  it("boots the seeded inputs into the current simulation state and foreshadow registry", () => {
    const scenario = createDeterministicLongFormValidationScenario();
    const state = createSimulationState(scenario.seed);

    expect(state.seedTitle).toBe("황궁 일식록");
    expect(Object.keys(state.characters)).toEqual(
      expect.arrayContaining(["haeon", "jisu", "taeyul", "regent"]),
    );
    expect(state.characters.haeon.location).toBe("왕립 관측소");
    expect(state.foreshadowRegistry.timeline).toEqual([
      "fs_burn_mark",
      "fs_moon_key",
      "fs_false_genealogy",
      "fs_tide_engine",
      "fs_fake_treaty",
      "fs_oath_text",
    ]);
    expect(state.foreshadowRegistry.byId.fs_burn_mark).toMatchObject({
      registrationEpisode: 3,
      resolutionDeadlineEpisode: 83,
    });
    expect(state.foreshadowRegistry.byId.fs_oath_text).toMatchObject({
      registrationEpisode: 241,
      resolutionDeadlineEpisode: 321,
    });
  });

  it("records explicit mismatch attribution across memory, belief, and utterance cases", () => {
    const scenario = createDeterministicLongFormValidationScenario();
    const mismatchMap = new Map(
      scenario.groundTruthCausalEvents.flatMap((record) =>
        record.expectedMismatchAttributions.map((mismatch) => [
          mismatch.mismatchId,
          mismatch,
        ] as const)
      ),
    );

    expect(mismatchMap.get("mm_073_haeon_memory")).toMatchObject({
      characterId: "haeon",
      recordType: "memory",
      causeKind: "trauma",
      sourceEventId: "evt_073",
    });
    expect(mismatchMap.get("mm_096_jisu_utterance")).toMatchObject({
      characterId: "jisu",
      recordType: "utterance",
      causeKind: "lying",
      sourceEventId: "evt_096",
    });
    expect(mismatchMap.get("mm_214_taeyul_belief")).toMatchObject({
      characterId: "taeyul",
      recordType: "belief",
      causeKind: "deception",
      sourceEventId: "evt_214",
    });
  });
});
