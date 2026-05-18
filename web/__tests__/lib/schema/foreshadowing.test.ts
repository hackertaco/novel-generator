// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ForeshadowingSchema,
  classifyForeshadowResolutionStatus,
  shouldAct,
  type Foreshadowing,
} from "@/lib/schema/foreshadowing";
import { foreshadowLifecycleFixtures } from "./fixtures/foreshadowing-fixtures";

function makeForeshadowResolutionFixture(
  overrides: Partial<Foreshadowing> = {},
): Foreshadowing {
  return {
    id: "fs_fixture",
    name: "복선 fixture",
    description: "복선 회수 validator fixture",
    importance: "normal",
    planted_at: 4,
    hints_at: [],
    reveal_at: 12,
    status: "pending",
    hint_count: 0,
    ...overrides,
  };
}

const resolutionValidationFixtures = {
  partialResolution: makeForeshadowResolutionFixture({
    id: "fs_partial_resolution",
    name: "부분 회수 fixture",
    description: "원인과 결과만 드러나고 핵심 정체는 남긴다.",
    resolution: {
      status: "partial",
      cause: { revealed: true, chapter: 10, evidence: ["원인 공개"] },
      identity: { revealed: false, chapter: null, evidence: [] },
      consequence: { revealed: true, chapter: 12, evidence: ["결과 공개"] },
    },
  }),
  fullResolution: makeForeshadowResolutionFixture({
    id: "fs_full_resolution",
    name: "완전 회수 fixture",
    description: "원인, 정체, 결과가 모두 장면에서 닫힌다.",
    resolution: {
      cause: { revealed: true, chapter: 10, evidence: ["원인 공개"] },
      identity: { revealed: true, chapter: 11, evidence: ["정체 공개"] },
      consequence: { revealed: true, chapter: 12, evidence: ["결과 공개"] },
    },
  }),
  nearMissUnresolvedCoreElement: makeForeshadowResolutionFixture({
    id: "fs_near_miss_unresolved_core",
    name: "핵심 미해결 근접 fixture",
    description: "겉보기 단서는 모두 나왔지만 핵심 진실은 아직 닫히지 않았다.",
    resolution: {
      status: "partial",
      cause: { revealed: true, chapter: 10, evidence: ["원인 공개"] },
      identity: { revealed: true, chapter: 11, evidence: ["정체 공개"] },
      consequence: { revealed: true, chapter: 12, evidence: ["결과 공개"] },
    },
  }),
} as const;

describe("ForeshadowingSchema", () => {
  it("parses valid data", () => {
    const data = {
      id: "fs_1",
      name: "복선 1",
      description: "테스트 복선",
      importance: "critical",
      planted_at: 5,
      hints_at: [15, 30],
      reveal_at: 48,
      origin: {
        episode_id: "ep_005",
        scene_id: "scene_005_courtyard",
        source_span: {
          start_offset: 112,
          end_offset: 168,
          excerpt: "정원 바닥에 붉은 밀랍 조각이 떨어져 있었다.",
        },
      },
      linked_hint_occurrences: [
        {
          episode_id: "ep_006",
          scene_id: "scene_006_archive",
          source_span: {
            start_offset: 10,
            end_offset: 28,
            excerpt: "마리안은 같은 밀랍 자국을 다시 본다.",
          },
        },
        {
          episode_id: "ep_006",
          scene_id: "scene_006_archive",
          source_span: {
            start_offset: 10,
            end_offset: 28,
            excerpt: "마리안은 같은 밀랍 자국을 다시 본다.",
          },
        },
      ],
      status: "pending",
      hint_count: 0,
      resolution: {
        status: "partial",
        cause: {
          revealed: true,
          chapter: 30,
          evidence: ["세레나가 붉은 밀랍이 황실 봉인용 밀랍이라고 밝혀낸다."],
        },
        identity: {
          revealed: false,
          chapter: null,
          evidence: [],
        },
        consequence: {
          revealed: true,
          chapter: 48,
          evidence: ["밀랍 출처를 추적한 결과 정원 사건이 황실 문서 위조와 연결된다."],
        },
      },
    };

    const result = ForeshadowingSchema.parse(data);

    expect(result.id).toBe("fs_1");
    expect(result.name).toBe("복선 1");
    expect(result.description).toBe("테스트 복선");
    expect(result.importance).toBe("critical");
    expect(result.planted_at).toBe(5);
    expect(result.hints_at).toEqual([15, 30]);
    expect(result.reveal_at).toBe(48);
    expect(result.origin).toEqual({
      episode_id: "ep_005",
      scene_id: "scene_005_courtyard",
      source_span: {
        start_offset: 112,
        end_offset: 168,
        excerpt: "정원 바닥에 붉은 밀랍 조각이 떨어져 있었다.",
      },
    });
    expect(result.linked_hint_occurrences).toEqual([
      {
        episode_id: "ep_006",
        scene_id: "scene_006_archive",
        source_span: {
          start_offset: 10,
          end_offset: 28,
          excerpt: "마리안은 같은 밀랍 자국을 다시 본다.",
        },
      },
      {
        episode_id: "ep_006",
        scene_id: "scene_006_archive",
        source_span: {
          start_offset: 10,
          end_offset: 28,
          excerpt: "마리안은 같은 밀랍 자국을 다시 본다.",
        },
      },
    ]);
    expect(result.verification_metadata).toEqual({
      source_episode_ids: ["ep_005", "ep_006"],
      source_scene_ids: ["scene_005_courtyard", "scene_006_archive"],
      source_occurrence_count: 3,
      shared_target_summary: "테스트 복선",
    });
    expect(result.lifecycle).toBe("pending");
    expect(result.status).toBe("pending");
    expect(result.hint_count).toBe(0);
    expect(result.resolution.status).toBe("partial");
    expect(result.resolution.cause.revealed).toBe(true);
    expect(result.resolution.identity.revealed).toBe(false);
    expect(result.resolution.consequence.chapter).toBe(48);
  });

  it('uses correct defaults (importance="normal", status="pending", hint_count=0)', () => {
    const data = {
      id: "fs_2",
      name: "복선 2",
      description: "기본값 테스트",
      planted_at: 10,
      reveal_at: 50,
    };

    const result = ForeshadowingSchema.parse(data);

    expect(result.importance).toBe("normal");
    expect(result.lifecycle).toBe("pending");
    expect(result.status).toBe("pending");
    expect(result.hint_count).toBe(0);
    expect(result.hints_at).toEqual([]);
    expect(result.linked_hint_occurrences).toEqual([]);
    expect(result.verification_metadata).toEqual({
      source_episode_ids: [],
      source_scene_ids: [],
      source_occurrence_count: 0,
      shared_target_summary: "기본값 테스트",
    });
    expect(result.resolution).toEqual({
      status: "unresolved",
      cause: {
        revealed: false,
        chapter: null,
        evidence: [],
      },
      identity: {
        revealed: false,
        chapter: null,
        evidence: [],
      },
      consequence: {
        revealed: false,
        chapter: null,
        evidence: [],
      },
    });
  });

  it("aggregates verification metadata from merged source provenance and canonical targets", () => {
    const result = ForeshadowingSchema.parse({
      id: "fs_merged",
      name: "붉은 봉인",
      description: "",
      canonical_target: "황실 봉인 밀랍의 진짜 출처",
      planted_at: 3,
      reveal_at: 19,
      origin: {
        episode_id: "ep_003",
        scene_id: "scene_003_garden",
        source_span: {
          start_offset: 5,
          end_offset: 21,
        },
      },
      linked_hint_occurrences: [
        {
          episode_id: "ep_008",
          scene_id: "scene_008_archive",
          source_span: {
            start_offset: 12,
            end_offset: 31,
          },
        },
        {
          episode_id: "ep_008",
          scene_id: "scene_008_archive",
          source_span: {
            start_offset: 40,
            end_offset: 58,
          },
        },
      ],
    });

    expect(result.verification_metadata).toEqual({
      source_episode_ids: ["ep_003", "ep_008"],
      source_scene_ids: ["scene_003_garden", "scene_008_archive"],
      source_occurrence_count: 3,
      shared_target_summary: "황실 봉인 밀랍의 진짜 출처",
    });
    expect(result.lifecycle).toBe("pending");
  });

  it("derives a resolved lifecycle when all payoff facets are fully resolved", () => {
    const result = ForeshadowingSchema.parse(
      resolutionValidationFixtures.fullResolution,
    );

    expect(result.lifecycle).toBe("resolved");
  });

  it.each([
    {
      label: "pending lifecycle fixture",
      fixture: foreshadowLifecycleFixtures.pending,
      expectedLifecycle: "pending",
      expectedResolution: "unresolved",
    },
    {
      label: "resolved lifecycle fixture",
      fixture: foreshadowLifecycleFixtures.resolved,
      expectedLifecycle: "resolved",
      expectedResolution: "full",
    },
    {
      label: "intentionally abandoned fixture with reason",
      fixture: foreshadowLifecycleFixtures.intentionallyAbandonedWithReason,
      expectedLifecycle: "intentionally_abandoned",
      expectedResolution: "unresolved",
    },
    {
      label: "intentionally abandoned fixture with marker",
      fixture: foreshadowLifecycleFixtures.intentionallyAbandonedWithMarker,
      expectedLifecycle: "intentionally_abandoned",
      expectedResolution: "unresolved",
    },
    {
      label: "intentionally abandoned fixture inferred from marker only",
      fixture: foreshadowLifecycleFixtures.intentionallyAbandonedMarkerOnly,
      expectedLifecycle: "intentionally_abandoned",
      expectedResolution: "unresolved",
    },
  ])(
    "accepts the $label",
    ({ fixture, expectedLifecycle, expectedResolution }) => {
      const result = ForeshadowingSchema.parse(fixture);

      expect(result.lifecycle).toBe(expectedLifecycle);
      expect(result.resolution.status).toBe(expectedResolution);
    },
  );

  it("preserves the explicit abandonment marker in normalized foreshadow schema output", () => {
    const result = ForeshadowingSchema.parse(
      foreshadowLifecycleFixtures.intentionallyAbandonedMarkerOnly,
    );

    expect(result.abandonment_marker).toBe(
      "intentional-abandonment:timeline-cut",
    );
    expect(result.lifecycle).toBe("intentionally_abandoned");
  });

  it("rejects intentionally abandoned lifecycle fixtures without abandonment metadata", () => {
    const result = ForeshadowingSchema.safeParse(
      foreshadowLifecycleFixtures.intentionallyAbandonedWithoutMetadata,
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["abandonment_reason"],
          message:
            "intentionally abandoned foreshadowing must include an abandonment reason or abandonment marker",
        }),
      ]),
    );
  });

  it("rejects invalid origin spans where end_offset does not follow start_offset", () => {
    const data = {
      id: "fs_3",
      name: "복선 3",
      description: "잘못된 출처 범위",
      planted_at: 4,
      reveal_at: 12,
      origin: {
        episode_id: "ep_004",
        scene_id: "scene_004_archive",
        source_span: {
          start_offset: 40,
          end_offset: 40,
        },
      },
    };

    expect(() => ForeshadowingSchema.parse(data)).toThrow("end_offset must be greater than start_offset");
  });

  it("keeps unresolved when no payoff facets are revealed", () => {
    const unresolved = ForeshadowingSchema.parse({
      id: "fs_partial_invalid_none",
      name: "부분 회수 실패",
      description: "아직 아무 것도 공개되지 않았다.",
      planted_at: 4,
      reveal_at: 12,
      resolution: {
        status: "partial",
        cause: { revealed: false, chapter: null, evidence: [] },
        identity: { revealed: false, chapter: null, evidence: [] },
        consequence: { revealed: false, chapter: null, evidence: [] },
      },
    });

    expect(unresolved.resolution.status).toBe("unresolved");
  });

  it("denies full resolution when an explicit partial status keeps the core unknown open", () => {
    const result = ForeshadowingSchema.parse(
      resolutionValidationFixtures.nearMissUnresolvedCoreElement,
    );

    expect(result.resolution.status).toBe("partial");
  });

  it("still infers full resolution when every payoff facet is revealed and no unresolved status is supplied", () => {
    const result = ForeshadowingSchema.parse(
      resolutionValidationFixtures.fullResolution,
    );

    expect(result.resolution.status).toBe("full");
  });

  it("downgrades full resolution to partial unless all payoff facets are revealed", () => {
    const result = ForeshadowingSchema.parse({
      id: "fs_full_invalid",
      name: "완전 회수 실패",
      description: "정체는 아직 숨겨져 있다.",
      planted_at: 7,
      reveal_at: 20,
      resolution: {
        status: "full",
        cause: { revealed: true, chapter: 17, evidence: ["원인 설명"] },
        identity: { revealed: false, chapter: null, evidence: [] },
        consequence: { revealed: true, chapter: 20, evidence: ["결과 확인"] },
      },
    });

    expect(result.resolution.status).toBe("partial");
  });

  it("rejects revealed payoff facets that omit chapter or evidence", () => {
    expect(() =>
      ForeshadowingSchema.parse({
        id: "fs_facet_invalid",
        name: "증거 누락",
        description: "공개 사실의 근거가 없다.",
        planted_at: 3,
        reveal_at: 9,
        resolution: {
          status: "partial",
          cause: { revealed: true, chapter: null, evidence: [] },
          identity: { revealed: false, chapter: null, evidence: [] },
          consequence: { revealed: false, chapter: null, evidence: [] },
        },
      }),
    ).toThrow("revealed facets must include at least one evidence entry");
  });

  it.each([
    {
      label: "partial-resolution",
      fixture: resolutionValidationFixtures.partialResolution,
      expectedStatus: "partial",
    },
    {
      label: "full-resolution",
      fixture: resolutionValidationFixtures.fullResolution,
      expectedStatus: "full",
    },
    {
      label: "near-miss unresolved-core-element",
      fixture: resolutionValidationFixtures.nearMissUnresolvedCoreElement,
      expectedStatus: "partial",
    },
  ])("accepts the $label validator fixture", ({ fixture, expectedStatus }) => {
    const result = ForeshadowingSchema.parse(fixture);
    expect(result.resolution.status).toBe(expectedStatus);
  });

  it.each([
    {
      label: "partial-resolution",
      fixture: resolutionValidationFixtures.partialResolution,
    },
    {
      label: "near-miss unresolved-core-element",
      fixture: resolutionValidationFixtures.nearMissUnresolvedCoreElement,
    },
  ])("keeps the $label validator fixture below full resolution", ({ fixture }) => {
    const result = ForeshadowingSchema.parse(fixture);

    expect(result.resolution.status).not.toBe("full");
  });

  it("returns full only for the fully resolved validator fixture", () => {
    const result = ForeshadowingSchema.parse(
      resolutionValidationFixtures.fullResolution,
    );

    expect(result.resolution.status).toBe("full");
  });

  it("keeps the unresolved-core near-miss fixture clamped below derived full resolution", () => {
    const rawResolution = resolutionValidationFixtures.nearMissUnresolvedCoreElement.resolution!;

    expect(classifyForeshadowResolutionStatus(rawResolution)).toBe("full");

    const result = ForeshadowingSchema.parse(
      resolutionValidationFixtures.nearMissUnresolvedCoreElement,
    );
    expect(result.resolution.status).toBe("partial");
  });
});

describe("classifyForeshadowResolutionStatus", () => {
  it("returns unresolved when no payoff facets are revealed", () => {
    expect(classifyForeshadowResolutionStatus({
      cause: { revealed: false },
      identity: { revealed: false },
      consequence: { revealed: false },
    })).toBe("unresolved");
  });

  it("returns partial when some but not all payoff facets are revealed", () => {
    expect(classifyForeshadowResolutionStatus({
      cause: { revealed: true },
      identity: { revealed: false },
      consequence: { revealed: true },
    })).toBe("partial");
  });

  it("returns full only when cause, identity, and consequence are all revealed", () => {
    expect(classifyForeshadowResolutionStatus({
      cause: { revealed: true },
      identity: { revealed: true },
      consequence: { revealed: true },
    })).toBe("full");
  });
});

describe("shouldAct", () => {
  function makeForeshadowing(
    overrides: Partial<Foreshadowing> = {},
  ): Foreshadowing {
    return {
      id: "fs_1",
      name: "복선 1",
      description: "테스트 복선",
      importance: "critical",
      planted_at: 5,
      hints_at: [15, 30],
      reveal_at: 48,
      linked_hint_occurrences: [],
      lifecycle: "pending",
      status: "pending",
      hint_count: 0,
      ...overrides,
    };
  }

  it('returns "plant" when chapter === planted_at and status === "pending"', () => {
    const fs = makeForeshadowing({ planted_at: 5, status: "pending" });
    expect(shouldAct(fs, 5)).toBe("plant");
  });

  it('returns "reveal" when chapter === reveal_at and status === "planted"', () => {
    const fs = makeForeshadowing({ reveal_at: 48, status: "planted" });
    expect(shouldAct(fs, 48)).toBe("reveal");
  });

  it('returns "hint" when chapter is in hints_at and status === "planted"', () => {
    const fs = makeForeshadowing({
      hints_at: [15, 30],
      status: "planted",
    });
    expect(shouldAct(fs, 15)).toBe("hint");
    expect(shouldAct(fs, 30)).toBe("hint");
  });

  it("returns null when no action is needed", () => {
    const fs = makeForeshadowing({ status: "planted" });
    // Chapter 20 is not planted_at, reveal_at, or in hints_at
    expect(shouldAct(fs, 20)).toBeNull();
  });

  it("returns null for intentionally abandoned foreshadowing even when timing matches", () => {
    const fs = makeForeshadowing({
      planted_at: 5,
      lifecycle: "intentionally_abandoned",
      abandonment_marker: "intentional-abandonment:merged-into:fs_primary",
      status: "pending",
    });

    expect(shouldAct(fs, 5)).toBeNull();
  });

  it("supports legacy foreshadowing field names from raw seeds", () => {
    const legacy = {
      id: "fs_legacy",
      name: "복선 레거시",
      description: "옛 seed 포맷",
      importance: "critical",
      plant_chapter: 2,
      hint_chapters: [4, 6],
      reveal_chapter: 9,
      status: "planted",
    } as unknown as Foreshadowing;

    expect(shouldAct({ ...legacy, status: "pending" } as Foreshadowing, 2)).toBe("plant");
    expect(shouldAct(legacy, 4)).toBe("hint");
    expect(shouldAct(legacy, 9)).toBe("reveal");
  });

  it("returns null when status does not match (e.g., planted_at chapter but status is already planted)", () => {
    const fs = makeForeshadowing({ planted_at: 5, status: "planted" });
    // planted_at chapter but status is not "pending"
    expect(shouldAct(fs, 5)).toBeNull();
  });
});
