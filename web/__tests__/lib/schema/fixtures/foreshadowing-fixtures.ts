export function makeForeshadowingSchemaFixture(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "fs_fixture",
    name: "복선 fixture",
    description: "복선 lifecycle/schema fixture",
    importance: "normal",
    planted_at: 4,
    hints_at: [],
    reveal_at: 12,
    status: "pending",
    hint_count: 0,
    ...overrides,
  };
}

const unresolvedResolution = {
  status: "unresolved",
  cause: { revealed: false, chapter: null, evidence: [] },
  identity: { revealed: false, chapter: null, evidence: [] },
  consequence: { revealed: false, chapter: null, evidence: [] },
};

export const foreshadowLifecycleFixtures = {
  pending: makeForeshadowingSchemaFixture({
    id: "fs_pending_fixture",
    name: "보류 중인 복선",
    description: "아직 회수되지 않은 기본 복선 fixture",
    resolution: unresolvedResolution,
  }),
  resolved: makeForeshadowingSchemaFixture({
    id: "fs_resolved_fixture",
    name: "회수 완료 복선",
    description: "원인, 정체, 결과가 모두 닫힌 복선 fixture",
    resolution: {
      cause: { revealed: true, chapter: 10, evidence: ["원인 공개"] },
      identity: { revealed: true, chapter: 11, evidence: ["정체 공개"] },
      consequence: { revealed: true, chapter: 12, evidence: ["결과 공개"] },
    },
  }),
  intentionallyAbandonedWithReason: makeForeshadowingSchemaFixture({
    id: "fs_abandoned_reason_fixture",
    name: "사유로 폐기된 복선",
    description: "구조 개편으로 더 이상 회수하지 않기로 한 복선 fixture",
    reveal_at: null,
    lifecycle: "intentionally_abandoned",
    abandonment_reason: "중반 구조 개편으로 이 복선 축을 의도적으로 폐기했다.",
    resolution: unresolvedResolution,
  }),
  intentionallyAbandonedWithMarker: makeForeshadowingSchemaFixture({
    id: "fs_abandoned_marker_fixture",
    name: "마커로 폐기된 복선",
    description: "운영 표식만으로 의도적 폐기를 기록한 복선 fixture",
    reveal_at: null,
    lifecycle: "intentionally_abandoned",
    abandonment_marker: "intentional-abandonment:timeline-cut",
    resolution: unresolvedResolution,
  }),
  intentionallyAbandonedMarkerOnly: makeForeshadowingSchemaFixture({
    id: "fs_abandoned_marker_only_fixture",
    name: "마커만 있는 폐기 복선",
    description: "lifecycle 없이도 마커 자체가 폐기를 의미하는 복선 fixture",
    reveal_at: null,
    abandonment_marker: "intentional-abandonment:timeline-cut",
    resolution: unresolvedResolution,
  }),
  intentionallyAbandonedWithoutMetadata: makeForeshadowingSchemaFixture({
    id: "fs_abandoned_missing_metadata_fixture",
    name: "폐기 사유 누락",
    description: "폐기되었지만 명시적 표식이 없는 복선 fixture",
    reveal_at: null,
    lifecycle: "intentionally_abandoned",
    resolution: unresolvedResolution,
  }),
} as const;
