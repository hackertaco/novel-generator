import { describe, expect, it } from "vitest";
import {
  FORESHADOW_RESOLUTION_WINDOW_EPISODES,
  addForeshadowRegistryEntry,
  createForeshadowRegistryFromSeed,
  createForeshadowRegistryStore,
  evaluateForeshadowPayoffEligibility,
  gateEpisodeForeshadowFullResolution,
  listForeshadowRegistryEntries,
} from "@/lib/sim";
import { refreshForeshadowVerificationMetadata, type Foreshadowing } from "@/lib/schema/foreshadowing";

function makeForeshadowing(overrides: Partial<Foreshadowing> = {}): Foreshadowing {
  return refreshForeshadowVerificationMetadata({
    id: "fs_red_mark",
    name: "붉은 낙인",
    description: "붉은 낙인이 금서 사건 생존자의 봉인 표식이었다는 진실이 밝혀진다.",
    canonical_target: "붉은 낙인의 정체와 금서 사건 연결고리",
    importance: "normal",
    planted_at: 4,
    hints_at: [],
    reveal_at: 29,
    origin: {
      episode_id: "ep_004",
      scene_id: "scene_004_02",
      source_span: {
        start_offset: 0,
        end_offset: 24,
        excerpt: "엘리시아의 손목에 붉은 낙인이 떠오른다.",
      },
    },
    linked_hint_occurrences: [],
    verification_metadata: {
      source_episode_ids: [],
      source_scene_ids: [],
      source_occurrence_count: 0,
      shared_target_summary: "",
    },
    status: "pending",
    hint_count: 0,
    resolution: {
      status: "unresolved",
      cause: { revealed: false, chapter: null, evidence: [] },
      identity: { revealed: false, chapter: null, evidence: [] },
      consequence: { revealed: false, chapter: null, evidence: [] },
    },
    ...overrides,
  });
}

function makeResolvedEpisodeForeshadowing(
  overrides: Partial<Foreshadowing & { payoff_candidate?: Record<string, unknown> }> = {},
) {
  return refreshForeshadowVerificationMetadata({
    ...makeForeshadowing({
      resolution: {
        cause: { revealed: true, chapter: 29, evidence: ["원인 공개"] },
        identity: { revealed: true, chapter: 29, evidence: ["정체 공개"] },
        consequence: { revealed: true, chapter: 29, evidence: ["결과 공개"] },
      },
    }),
    ...overrides,
  });
}

function makeRegisteredRedMarkEntry() {
  return addForeshadowRegistryEntry(createForeshadowRegistryStore(), {
    id: "fs_red_mark",
    registrationEpisode: 4,
    expectedPayoffConditions: {
      promise: "붉은 낙인이 금서 사건 생존자의 봉인 표식이었다는 진실이 밝혀진다.",
      canonicalTarget: "붉은 낙인의 정체와 금서 사건 연결고리",
      earliestPayoffEpisode: 29,
      plannedRevealEpisode: 29,
      requiredResolutionStatus: "full",
    },
  });
}

describe("foreshadow registry", () => {
  it("records planted items with a unique id, payoff conditions, and a registration+80 deadline", () => {
    const store = createForeshadowRegistryStore();

    const entry = addForeshadowRegistryEntry(store, {
      id: "fs_unique",
      registrationEpisode: 12,
      registrationSceneId: "scene_012_01",
      expectedPayoffConditions: {
        promise: "서고 열쇠의 진짜 주인이 후반부에 드러난다.",
        canonicalTarget: "서고 열쇠의 소유권",
        earliestPayoffEpisode: 34,
        plannedRevealEpisode: 40,
      },
    });

    expect(entry.id).toBe("fs_unique");
    expect(entry.registrationEpisode).toBe(12);
    expect(entry.expectedPayoffConditions.promise).toContain("후반부");
    expect(entry.resolutionDeadlineEpisode).toBe(
      12 + FORESHADOW_RESOLUTION_WINDOW_EPISODES,
    );
    expect(() =>
      addForeshadowRegistryEntry(store, {
        id: "fs_unique",
        registrationEpisode: 14,
        expectedPayoffConditions: {
          promise: "중복 등록",
        },
      }),
    ).toThrow(/already exists/);
  });

  it("bootstraps registry entries from seeded foreshadowing items", () => {
    const store = createForeshadowRegistryFromSeed([
      makeForeshadowing(),
      makeForeshadowing({
        id: "fs_minor",
        name: "찢긴 초대장",
        description: "찢긴 초대장이 함정 초대였다는 사실이 일부 먼저 드러난다.",
        importance: "minor",
        planted_at: 7,
        reveal_at: 18,
        origin: {
          episode_id: "ep_007",
          scene_id: "scene_007_01",
          source_span: {
            start_offset: 0,
            end_offset: 18,
            excerpt: "초대장 한 귀퉁이가 불에 그슬려 있었다.",
          },
        },
      }),
    ]);

    const [first, second] = listForeshadowRegistryEntries(store);

    expect(first).toMatchObject({
      id: "fs_red_mark",
      registrationEpisode: 4,
      registrationSceneId: "scene_004_02",
      expectedPayoffConditions: {
        promise: "붉은 낙인이 금서 사건 생존자의 봉인 표식이었다는 진실이 밝혀진다.",
        canonicalTarget: "붉은 낙인의 정체와 금서 사건 연결고리",
        earliestPayoffEpisode: 29,
        plannedRevealEpisode: 29,
        requiredResolutionStatus: "full",
      },
      resolutionDeadlineEpisode: 84,
    });
    expect(second?.expectedPayoffConditions.requiredResolutionStatus).toBe("partial");
    expect(second?.resolutionDeadlineEpisode).toBe(87);
  });

  it("marks payoff closure eligible only when every registered condition is explicitly satisfied", () => {
    const store = createForeshadowRegistryStore();
    const entry = addForeshadowRegistryEntry(store, {
      id: "fs_archive_key",
      registrationEpisode: 12,
      expectedPayoffConditions: {
        promise: "서고 열쇠의 진짜 주인이 후반부에 드러난다.",
        canonicalTarget: "서고 열쇠의 소유권",
        earliestPayoffEpisode: 34,
        plannedRevealEpisode: 40,
        requiredResolutionStatus: "full",
      },
    });

    const result = evaluateForeshadowPayoffEligibility(entry, {
      eventId: "evt_payoff_archive_key",
      foreshadowId: "fs_archive_key",
      chapter: 42,
      promise: "서고 열쇠의 진짜 주인이 후반부에 드러난다.",
      canonicalTarget: "서고 열쇠의 소유권",
      resolutionStatus: "full",
      explicitlySatisfiedConditions: [
        "promise",
        "canonicalTarget",
        "earliestPayoffEpisode",
        "plannedRevealEpisode",
        "requiredResolutionStatus",
      ],
    });

    expect(result).toEqual({
      eligibleForClosure: true,
      checkedConditions: [
        "promise",
        "requiredResolutionStatus",
        "canonicalTarget",
        "earliestPayoffEpisode",
        "plannedRevealEpisode",
      ],
      missingConditions: [],
      failedConditions: [],
    });
  });

  it("keeps a payoff ineligible when a registered condition is only implied, not explicitly satisfied", () => {
    const store = createForeshadowRegistryStore();
    const entry = addForeshadowRegistryEntry(store, {
      id: "fs_red_mark",
      registrationEpisode: 4,
      expectedPayoffConditions: {
        promise: "붉은 낙인의 정체가 금서 사건과 연결된다는 사실이 드러난다.",
        canonicalTarget: "붉은 낙인의 정체",
        earliestPayoffEpisode: 20,
        requiredResolutionStatus: "full",
      },
    });

    const result = evaluateForeshadowPayoffEligibility(entry, {
      eventId: "evt_red_mark_payoff",
      foreshadowId: "fs_red_mark",
      chapter: 20,
      promise: "붉은 낙인의 정체가 금서 사건과 연결된다는 사실이 드러난다.",
      canonicalTarget: "붉은 낙인의 정체",
      resolutionStatus: "full",
      explicitlySatisfiedConditions: [
        "promise",
        "earliestPayoffEpisode",
        "requiredResolutionStatus",
      ],
    });

    expect(result.eligibleForClosure).toBe(false);
    expect(result.missingConditions).toEqual(["canonicalTarget"]);
    expect(result.failedConditions).toEqual([]);
  });

  it("rejects closure when the payoff does not meet the registered resolution status", () => {
    const store = createForeshadowRegistryStore();
    const entry = addForeshadowRegistryEntry(store, {
      id: "fs_minor_invitation",
      registrationEpisode: 7,
      expectedPayoffConditions: {
        promise: "찢긴 초대장이 함정 초대였다는 사실이 드러난다.",
        plannedRevealEpisode: 18,
        requiredResolutionStatus: "full",
      },
    });

    const result = evaluateForeshadowPayoffEligibility(entry, {
      eventId: "evt_invitation_payoff",
      foreshadowId: "fs_minor_invitation",
      chapter: 19,
      promise: "찢긴 초대장이 함정 초대였다는 사실이 드러난다.",
      resolutionStatus: "partial",
      explicitlySatisfiedConditions: [
        "promise",
        "plannedRevealEpisode",
        "requiredResolutionStatus",
      ],
    });

    expect(result.eligibleForClosure).toBe(false);
    expect(result.missingConditions).toEqual([]);
    expect(result.failedConditions).toEqual([
      {
        condition: "requiredResolutionStatus",
        reason:
          "payoff resolution status does not satisfy the registered closure requirement",
      },
    ]);
  });

  it("rejects closure when the payoff backlink points at a different foreshadow id", () => {
    const store = createForeshadowRegistryStore();
    const entry = addForeshadowRegistryEntry(store, {
      id: "fs_archive_key",
      registrationEpisode: 12,
      expectedPayoffConditions: {
        promise: "서고 열쇠의 진짜 주인이 후반부에 드러난다.",
        canonicalTarget: "서고 열쇠의 소유권",
        earliestPayoffEpisode: 34,
        plannedRevealEpisode: 40,
        requiredResolutionStatus: "full",
      },
    });

    const result = evaluateForeshadowPayoffEligibility(entry, {
      eventId: "evt_payoff_archive_key",
      foreshadowId: "fs_other_thread",
      chapter: 42,
      promise: "서고 열쇠의 진짜 주인이 후반부에 드러난다.",
      canonicalTarget: "서고 열쇠의 소유권",
      resolutionStatus: "full",
      explicitlySatisfiedConditions: [
        "promise",
        "canonicalTarget",
        "earliestPayoffEpisode",
        "plannedRevealEpisode",
        "requiredResolutionStatus",
      ],
    });

    expect(result.eligibleForClosure).toBe(false);
    expect(result.missingConditions).toEqual([]);
    expect(result.failedConditions).toEqual([
      {
        condition: "foreshadowId",
        reason: "payoff backlink does not match the originating foreshadow id",
      },
    ]);
  });

  it("keeps fully revealed foreshadowing below full resolution when no explicit payoff linkage is provided", () => {
    const entry = makeRegisteredRedMarkEntry();

    const normalized = refreshForeshadowVerificationMetadata(
      gateEpisodeForeshadowFullResolution(
        makeResolvedEpisodeForeshadowing(),
        entry,
      ),
    );

    expect(normalized.resolution.status).toBe("partial");
    expect(normalized.lifecycle).toBe("pending");
  });

  it("keeps fully revealed foreshadowing below full resolution when the payoff links to the wrong foreshadow id", () => {
    const entry = makeRegisteredRedMarkEntry();

    const normalized = refreshForeshadowVerificationMetadata(
      gateEpisodeForeshadowFullResolution(
        makeResolvedEpisodeForeshadowing({
          payoff_candidate: {
            eventId: "evt_red_mark_payoff",
            foreshadowId: "fs_other_thread",
            chapter: 29,
            promise: "붉은 낙인이 금서 사건 생존자의 봉인 표식이었다는 진실이 밝혀진다.",
            canonicalTarget: "붉은 낙인의 정체와 금서 사건 연결고리",
            resolutionStatus: "full",
            explicitlySatisfiedConditions: [
              "promise",
              "canonicalTarget",
              "earliestPayoffEpisode",
              "plannedRevealEpisode",
              "requiredResolutionStatus",
            ],
          },
        }),
        entry,
      ),
    );

    expect(normalized.resolution.status).toBe("partial");
    expect(normalized.lifecycle).toBe("pending");
  });

  it("keeps fully revealed foreshadowing below full resolution when the linked payoff misses a required condition", () => {
    const entry = makeRegisteredRedMarkEntry();

    const normalized = refreshForeshadowVerificationMetadata(
      gateEpisodeForeshadowFullResolution(
        makeResolvedEpisodeForeshadowing({
          payoff_candidate: {
            eventId: "evt_red_mark_payoff",
            foreshadowId: "fs_red_mark",
            chapter: 29,
            promise: "붉은 낙인이 금서 사건 생존자의 봉인 표식이었다는 진실이 밝혀진다.",
            resolutionStatus: "full",
            explicitlySatisfiedConditions: [
              "promise",
              "earliestPayoffEpisode",
              "plannedRevealEpisode",
              "requiredResolutionStatus",
            ],
          },
        }),
        entry,
      ),
    );

    expect(normalized.resolution.status).toBe("partial");
    expect(normalized.lifecycle).toBe("pending");
  });

  it("preserves full resolution when the episode payoff satisfies every condition and explicitly links the original foreshadow id", () => {
    const entry = makeRegisteredRedMarkEntry();

    const normalized = refreshForeshadowVerificationMetadata(
      gateEpisodeForeshadowFullResolution(
        makeResolvedEpisodeForeshadowing({
          payoff_candidate: {
            eventId: "evt_red_mark_payoff",
            foreshadowId: "fs_red_mark",
            chapter: 29,
            promise: "붉은 낙인이 금서 사건 생존자의 봉인 표식이었다는 진실이 밝혀진다.",
            canonicalTarget: "붉은 낙인의 정체와 금서 사건 연결고리",
            resolutionStatus: "full",
            explicitlySatisfiedConditions: [
              "promise",
              "canonicalTarget",
              "earliestPayoffEpisode",
              "plannedRevealEpisode",
              "requiredResolutionStatus",
            ],
          },
        }),
        entry,
      ),
    );

    expect(normalized.resolution.status).toBe("full");
    expect(normalized.lifecycle).toBe("resolved");
  });
});
