import type { Foreshadowing } from "@/lib/schema/foreshadowing";

function makeForeshadowThreadFixture(
  overrides: Partial<Foreshadowing> = {},
): Foreshadowing {
  return {
    id: "fs_fixture",
    name: "복선 verdict fixture",
    description: "복선 verdict regression fixture",
    importance: "normal",
    planted_at: 4,
    hints_at: [],
    reveal_at: 12,
    origin: {
      episode_id: "ep_004",
      scene_id: "scene_004_01",
      source_span: {
        start_offset: 0,
        end_offset: 24,
        excerpt: "복선이 처음 제시된다.",
      },
    },
    linked_hint_occurrences: [],
    status: "pending",
    hint_count: 0,
    ...overrides,
  };
}

export const foreshadowThreadVerdictFixtures = {
  unresolvedFailure: makeForeshadowThreadFixture({
    id: "fs_unresolved_fixture",
    name: "미회수 복선",
    description: "끝까지 회수되지 않았고 폐기 표식도 없는 복선",
    reveal_at: null,
  }),
  disappearedWithoutMarkerFailure: makeForeshadowThreadFixture({
    id: "fs_disappeared_fixture",
    name: "사라진 복선",
    description: "중간에 일부만 드러난 뒤 명시적 종료 없이 사라진 복선",
    resolution: {
      status: "partial",
      cause: { revealed: true, chapter: 12, evidence: ["원인의 일부가 공개됐다."] },
      identity: { revealed: false, chapter: null, evidence: [] },
      consequence: { revealed: false, chapter: null, evidence: [] },
    },
  }),
  intentionallyAbandonedNonFailure: makeForeshadowThreadFixture({
    id: "fs_abandoned_fixture",
    name: "의도적 폐기 복선",
    description: "구조 조정으로 의도적으로 폐기된 복선",
    reveal_at: null,
    lifecycle: "intentionally_abandoned",
    abandonment_marker: "intentional-abandonment:timeline-cut",
    abandonment_reason: "중반 구조 조정으로 중복 미스터리 축을 폐기했다.",
  }),
} as const;
