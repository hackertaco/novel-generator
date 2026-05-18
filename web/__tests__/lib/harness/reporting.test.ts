// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildForeshadowContinuityVerifierReport,
  buildForeshadowVerificationInput,
  buildForeshadowVerificationVerdictSummary,
  buildForeshadowingVerificationItems,
  ForeshadowContinuityVerifierReportSchema,
  evaluateForeshadowResolutionWindows,
  ForeshadowVerificationInputSchema,
  ForeshadowVerificationItemSummarySchema,
  ForeshadowVerificationRegisteredItemSchema,
  ForeshadowVerificationVerdictSummarySchema,
  ForeshadowResolutionWindowSummarySchema,
} from "@/lib/harness";
import type { NovelSeed } from "@/lib/schema/novel";

function createSeedWithAbandonedForeshadowing(): NovelSeed {
  return {
    title: "폐기 복선 계약 테스트",
    logline: "구조 개편으로 일부 복선을 의도적으로 폐기한다.",
    total_chapters: 300,
    world: {
      name: "회랑",
      genre: "fantasy",
      sub_genre: "romantasy",
      time_period: "중세풍",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    story_threads: [],
    arcs: [],
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [
      {
        id: "fs_cut",
        name: "폐기된 문양 떡밥",
        description: "재구성 과정에서 더 이상 회수하지 않기로 한 문양 떡밥",
        importance: "minor",
        planted_at: 7,
        hints_at: [],
        reveal_at: null,
        abandonment_reason: "mid-arc simplification removed the duplicate mystery branch",
        abandonment_marker: "intentional-abandonment:timeline-cut",
        origin: {
          episode_id: "ep_007",
          scene_id: "scene_007_corridor",
          source_span: {
            start_offset: 12,
            end_offset: 38,
            excerpt: "문양의 잔광이 벽 틈으로 스며들었다.",
          },
        },
        linked_hint_occurrences: [],
        status: "pending",
        hint_count: 0,
      },
    ],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [],
    },
  } as unknown as NovelSeed;
}

describe("foreshadow reporting contract", () => {
  it("preserves intentional-abandonment markers in the shared verification-item payload", () => {
    const items = buildForeshadowingVerificationItems(
      createSeedWithAbandonedForeshadowing(),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "fs_cut",
      name: "폐기된 문양 떡밥",
      plantedAt: 7,
      revealAt: null,
      lifecycle: "intentionally_abandoned",
      terminalState: {
        status: "intentionally_abandoned",
        source: "abandonment_marker",
        provenance: {
          sourceEpisodeIds: ["ep_007"],
          sourceSceneIds: ["scene_007_corridor"],
          sourceOccurrenceCount: 1,
        },
      },
      abandonmentReason:
        "mid-arc simplification removed the duplicate mystery branch",
      abandonmentMarker: "intentional-abandonment:timeline-cut",
      intentionalAbandonment: {
        marker: "intentional-abandonment:timeline-cut",
        source: "abandonment_marker",
        provenance: {
          sourceEpisodeIds: ["ep_007"],
          sourceSceneIds: ["scene_007_corridor"],
          sourceOccurrenceCount: 1,
        },
      },
      sourceEpisodeIds: ["ep_007"],
      sourceSceneIds: ["scene_007_corridor"],
      sourceOccurrenceCount: 1,
      sharedTargetSummary:
        "재구성 과정에서 더 이상 회수하지 않기로 한 문양 떡밥",
    });
    expect(ForeshadowVerificationItemSummarySchema.parse(items[0])).toEqual(
      items[0],
    );
  });

  it("reports intentional abandonment as a separate non-failure closure bucket", () => {
    const summary = buildForeshadowVerificationVerdictSummary({
      ...createSeedWithAbandonedForeshadowing(),
      foreshadowing: [
        createSeedWithAbandonedForeshadowing().foreshadowing[0]!,
        {
          id: "fs_resolved",
          name: "회수된 떡밥",
          description: "정상적으로 회수된 떡밥",
          importance: "major",
          planted_at: 3,
          hints_at: [],
          reveal_at: 14,
          origin: {
            episode_id: "ep_003",
            scene_id: "scene_003_archive",
            source_span: {
              start_offset: 2,
              end_offset: 20,
            },
          },
          linked_hint_occurrences: [],
          status: "pending",
          hint_count: 0,
        },
        {
          id: "fs_open",
          name: "미회수 떡밥",
          description: "끝까지 열린 채 남은 떡밥",
          importance: "major",
          planted_at: 9,
          hints_at: [],
          reveal_at: null,
          origin: {
            episode_id: "ep_009",
            scene_id: "scene_009_rooftop",
            source_span: {
              start_offset: 5,
              end_offset: 23,
            },
          },
          linked_hint_occurrences: [],
          status: "pending",
          hint_count: 0,
        },
      ],
    });

    expect(summary).toMatchObject({
      totalThreads: 3,
      resolvedThreads: 1,
      failureThreads: 1,
      intentionalNonFailureClosures: 1,
      unresolvedFailures: 1,
      invalidPayoffFailures: 0,
      nonTerminalFailures: 0,
    });
    expect(summary.threadVerdicts).toEqual([
      expect.objectContaining({
        id: "fs_cut",
        classification: "intentional_non_failure_closure",
        countsAsFailure: false,
      }),
      expect.objectContaining({
        id: "fs_resolved",
        classification: "resolved",
        countsAsFailure: false,
      }),
      expect.objectContaining({
        id: "fs_open",
        classification: "unresolved_failure",
        countsAsFailure: true,
      }),
    ]);
    expect(ForeshadowVerificationVerdictSummarySchema.parse(summary)).toEqual(
      summary,
    );
  });

  it("records terminal resolution provenance for fully paid-off foreshadow threads", () => {
    const items = buildForeshadowingVerificationItems({
      ...createSeedWithAbandonedForeshadowing(),
      foreshadowing: [
        {
          id: "fs_payoff",
          name: "회수된 봉인 떡밥",
          description: "붉은 봉인의 정체가 끝내 밝혀진다.",
          importance: "critical",
          planted_at: 3,
          hints_at: [],
          reveal_at: 18,
          origin: {
            episode_id: "ep_003",
            scene_id: "scene_003_archive",
            source_span: {
              start_offset: 4,
              end_offset: 24,
            },
          },
          linked_hint_occurrences: [],
          status: "pending",
          hint_count: 0,
          resolution: {
            cause: { revealed: true, chapter: 16, evidence: ["원인 공개"] },
            identity: { revealed: true, chapter: 17, evidence: ["정체 공개"] },
            consequence: { revealed: true, chapter: 18, evidence: ["결과 공개"] },
          },
          payoff_candidate: {
            eventId: "evt_payoff_archive",
            foreshadowId: "fs_payoff",
            chapter: 18,
            promise: "붉은 봉인의 정체가 끝내 밝혀진다.",
            resolutionStatus: "full",
            explicitlySatisfiedConditions: [
              "promise",
              "earliestPayoffEpisode",
              "plannedRevealEpisode",
              "requiredResolutionStatus",
            ],
          },
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "fs_payoff",
      lifecycle: "resolved",
      terminalState: {
        status: "resolved",
        source: "lifecycle",
        provenance: {
          sourceEpisodeIds: ["ep_003"],
          sourceSceneIds: ["scene_003_archive"],
          sourceOccurrenceCount: 1,
        },
      },
      intentionalAbandonment: null,
    });
  });

  it("builds a continuity-verifier-ready input with registration metadata and ordered episode outputs", () => {
    const input = buildForeshadowVerificationInput(
      {
        ...createSeedWithAbandonedForeshadowing(),
        foreshadowing: [
          {
            id: "fs_gate",
            name: "회랑 문양 균열",
            description: "세라핀의 피가 문양과 반응한다는 초기 징후",
            importance: "critical",
            planted_at: 1,
            hints_at: [2],
            reveal_at: 9,
            origin: {
              episode_id: "ep_001",
              scene_id: "scene_001_corridor_gate",
              source_span: {
                start_offset: 8,
                end_offset: 41,
              },
            },
            linked_hint_occurrences: [
              {
                episode_id: "ep_002",
                scene_id: "scene_002_mirror_hall",
                source_span: {
                  start_offset: 3,
                  end_offset: 22,
                },
              },
            ],
            status: "pending",
            hint_count: 1,
          },
        ],
      },
      [
        {
          chapterNumber: 2,
          text: "2화 본문. 균열은 거울 앞에서 다시 미세하게 반응했다.",
          summary: {
            title: "2화",
            plot_summary: "거울의 반응이 첫 떡밥을 더 선명하게 만든다.",
            cliffhanger: "누가 거울 뒤에 숨어 있는가?",
            foreshadowing_touched: [
              {
                foreshadowing_id: "fs_gate",
                action: "hint",
                context: "거울 앞에서 문양이 다시 흔들린다.",
              },
            ],
            ending_scene_state: {
              location: "거울 회랑",
              time_of_day: "밤",
              characters_present: ["세라핀", "레온"],
              ongoing_action: "거울 뒤를 확인하려 한다",
              unresolved_tension: "숨어 있는 인물의 정체",
            },
          },
        },
        {
          chapter_number: 1,
          episode_id: "ep_001",
          content: "1화 본문. 세라핀의 손끝에서 붉은 금이 문양 위로 번졌다.",
          title: "1화",
          plot_summary: "문이 피에 반응한다는 최초의 이상 징후가 등장한다.",
          foreshadowing_touched: [
            {
              foreshadowing_id: "fs_gate",
              action: "plant",
              context: "문양이 손끝의 피를 따라 갈라진다.",
            },
          ],
        },
      ],
    );

    expect(input.registeredForeshadowItems).toHaveLength(1);
    expect(ForeshadowVerificationRegisteredItemSchema.parse(input.registeredForeshadowItems[0])).toEqual(
      input.registeredForeshadowItems[0],
    );
    expect(input.registeredForeshadowItems[0]).toMatchObject({
      id: "fs_gate",
      registrationEpisode: 1,
      registrationEpisodeId: "ep_001",
      registrationSceneId: "scene_001_corridor_gate",
      sourceEpisodeIds: ["ep_001", "ep_002"],
      sourceSceneIds: ["scene_001_corridor_gate", "scene_002_mirror_hall"],
      sourceOccurrenceCount: 2,
      expectedPayoff: {
        promise: "세라핀의 피가 문양과 반응한다는 초기 징후",
        plannedRevealEpisode: 9,
        earliestPayoffEpisode: 9,
        requiredResolutionStatus: "full",
      },
      candidateResolutionEvents: [],
    });

    expect(input.episodeSequence.map((episode) => episode.episodeNumber)).toEqual([
      1,
      2,
    ]);
    expect(input.episodeSequence[0]).toMatchObject({
      episodeNumber: 1,
      episodeId: "ep_001",
      title: "1화",
      plotSummary: "문이 피에 반응한다는 최초의 이상 징후가 등장한다.",
      foreshadowingTouched: [
        {
          foreshadowingId: "fs_gate",
          action: "plant",
          context: "문양이 손끝의 피를 따라 갈라진다.",
        },
      ],
    });
    expect(input.episodeSequence[1]).toMatchObject({
      episodeNumber: 2,
      episodeId: "ep_002",
      cliffhanger: "누가 거울 뒤에 숨어 있는가?",
      endingSceneState: {
        location: "거울 회랑",
        timeOfDay: "밤",
        charactersPresent: ["세라핀", "레온"],
        ongoingAction: "거울 뒤를 확인하려 한다",
        unresolvedTension: "숨어 있는 인물의 정체",
      },
      foreshadowingTouched: [
        {
          foreshadowingId: "fs_gate",
          action: "hint",
          context: "거울 앞에서 문양이 다시 흔들린다.",
        },
      ],
    });
    expect(ForeshadowVerificationInputSchema.parse(input)).toEqual(input);
  });

  it("scans normalized episode outputs for reveal touches and records candidate resolution episodes per foreshadow item", () => {
    const input = buildForeshadowVerificationInput(
      {
        ...createSeedWithAbandonedForeshadowing(),
        foreshadowing: [
          {
            id: "fs_gate",
            name: "회랑 문양 균열",
            description: "세라핀의 피가 문양과 반응한다는 초기 징후",
            importance: "critical",
            planted_at: 1,
            hints_at: [2],
            reveal_at: 9,
            origin: {
              episode_id: "ep_001",
              scene_id: "scene_001_corridor_gate",
              source_span: {
                start_offset: 8,
                end_offset: 41,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 1,
          },
          {
            id: "fs_orb",
            name: "유리 구슬",
            description: "구슬 안의 문양이 반응의 근원을 드러낸다.",
            importance: "major",
            planted_at: 2,
            hints_at: [],
            reveal_at: 11,
            origin: {
              episode_id: "ep_002",
              scene_id: "scene_002_orb_room",
              source_span: {
                start_offset: 4,
                end_offset: 28,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
        ],
      },
      [
        {
          chapterNumber: 4,
          summary: {
            title: "4화",
            plot_summary: "문양의 정체가 조금 더 드러난다.",
            cliffhanger: null,
            foreshadowing_touched: [
              {
                foreshadowing_id: "fs_gate",
                action: "reveal",
                context: "회랑 문양이 세라핀의 혈통에만 반응한다는 사실이 공개된다.",
              },
              {
                foreshadowing_id: "fs_gate",
                action: "hint",
                context: "이전 떡밥이 다시 언급된다.",
              },
              {
                foreshadowing_id: "fs_unknown",
                action: "reveal",
                context: "등록되지 않은 떡밥은 무시되어야 한다.",
              },
            ],
          },
        },
        {
          chapterNumber: 6,
          summary: {
            title: "6화",
            plot_summary: "구슬의 의미가 해석된다.",
            cliffhanger: null,
            foreshadowing_touched: [
              {
                foreshadowing_id: "fs_gate",
                action: "REVEAL",
                context: "혈통 반응의 결과가 봉인 해제 조건과 연결된다.",
              },
              {
                foreshadowing_id: "fs_orb",
                action: "reveal",
                context: "유리 구슬 속 문양이 봉인의 진짜 기원을 증언한다.",
              },
            ],
          },
        },
      ],
    );

    expect(input.registeredForeshadowItems).toEqual([
      expect.objectContaining({
        id: "fs_gate",
        resolutionClassification: "fully_resolved",
        candidateResolutionEvents: [
          {
            episodeNumber: 4,
            episodeId: "ep_004",
            action: "reveal",
            context:
              "회랑 문양이 세라핀의 혈통에만 반응한다는 사실이 공개된다.",
          },
          {
            episodeNumber: 6,
            episodeId: "ep_006",
            action: "reveal",
            context:
              "혈통 반응의 결과가 봉인 해제 조건과 연결된다.",
          },
        ],
      }),
      expect.objectContaining({
        id: "fs_orb",
        candidateResolutionEvents: [
          {
            episodeNumber: 6,
            episodeId: "ep_006",
            action: "reveal",
            context:
              "유리 구슬 속 문양이 봉인의 진짜 기원을 증언한다.",
          },
        ],
      }),
    ]);
  });

  it("classifies foreshadow resolution windows from recorded reveal events and deadline horizon", () => {
    const input = buildForeshadowVerificationInput(
      {
        ...createSeedWithAbandonedForeshadowing(),
        foreshadowing: [
          {
            id: "fs_resolved",
            name: "제때 회수된 떡밥",
            description: "80화 안에 회수되어야 하는 떡밥",
            importance: "critical",
            planted_at: 1,
            hints_at: [],
            reveal_at: 40,
            origin: {
              episode_id: "ep_001",
              scene_id: "scene_001_gate",
              source_span: {
                start_offset: 0,
                end_offset: 20,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
          {
            id: "fs_expired",
            name: "늦게 회수된 떡밥",
            description: "기한이 지난 뒤에야 회수된 떡밥",
            importance: "critical",
            planted_at: 5,
            hints_at: [],
            reveal_at: 95,
            origin: {
              episode_id: "ep_005",
              scene_id: "scene_005_tower",
              source_span: {
                start_offset: 0,
                end_offset: 18,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
          {
            id: "fs_missed",
            name: "놓친 떡밥",
            description: "끝내 회수되지 않은 떡밥",
            importance: "critical",
            planted_at: 10,
            hints_at: [],
            reveal_at: null,
            origin: {
              episode_id: "ep_010",
              scene_id: "scene_010_hall",
              source_span: {
                start_offset: 0,
                end_offset: 16,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
          {
            id: "fs_pending",
            name: "아직 기한 전인 떡밥",
            description: "현재 러닝 범위에서는 아직 기한이 남아 있다",
            importance: "critical",
            planted_at: 160,
            hints_at: [],
            reveal_at: null,
            origin: {
              episode_id: "ep_160",
              scene_id: "scene_160_square",
              source_span: {
                start_offset: 0,
                end_offset: 22,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
          {
            id: "fs_abandoned",
            name: "의도적으로 폐기된 떡밥",
            description: "명시적으로 폐기 처리된 떡밥",
            importance: "minor",
            planted_at: 20,
            hints_at: [],
            reveal_at: null,
            abandonment_marker: "intentional-abandonment:timeline-cut",
            origin: {
              episode_id: "ep_020",
              scene_id: "scene_020_archive",
              source_span: {
                start_offset: 0,
                end_offset: 19,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
        ],
      },
      [
        {
          chapterNumber: 40,
          summary: {
            title: "40화",
            plot_summary: "제때 회수된 떡밥이 정체를 드러낸다.",
            cliffhanger: null,
            foreshadowing_touched: [
              {
                foreshadowing_id: "fs_resolved",
                action: "reveal",
                context: "문양의 진짜 주인이 40화에서 드러난다.",
              },
            ],
          },
        },
        {
          chapterNumber: 95,
          summary: {
            title: "95화",
            plot_summary: "늦게 회수된 떡밥이 마침내 정리된다.",
            cliffhanger: null,
            foreshadowing_touched: [
              {
                foreshadowing_id: "fs_expired",
                action: "reveal",
                context: "탑의 비밀이 95화에서야 드러난다.",
              },
            ],
          },
        },
        {
          chapterNumber: 200,
          summary: {
            title: "200화",
            plot_summary: "아직 일부 떡밥은 남아 있다.",
            cliffhanger: null,
            foreshadowing_touched: [],
          },
        },
      ],
    );

    const result = evaluateForeshadowResolutionWindows(input);
    const itemsById = Object.fromEntries(result.items.map((item) => [item.id, item]));

    expect(ForeshadowResolutionWindowSummarySchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      resolutionWindowEpisodes: 80,
      evaluationHorizonEpisode: 200,
      totals: {
        total: 5,
        fullyResolved: 1,
        unresolved: 4,
        resolvedWithinWindow: 1,
        pending: 1,
        missed: 1,
        expired: 1,
        intentionallyAbandoned: 1,
      },
    });
    expect(itemsById.fs_resolved).toMatchObject({
      registrationEpisode: 1,
      resolutionDeadlineEpisode: 81,
      windowStatus: "resolved_within_window",
      resolutionClassification: "fully_resolved",
      firstResolutionEvent: {
        episodeNumber: 40,
        episodeId: "ep_040",
      },
    });
    expect(itemsById.fs_expired).toMatchObject({
      registrationEpisode: 5,
      resolutionDeadlineEpisode: 85,
      windowStatus: "expired",
      resolutionClassification: "unresolved",
      firstResolutionEvent: {
        episodeNumber: 95,
        episodeId: "ep_095",
      },
    });
    expect(itemsById.fs_missed).toMatchObject({
      registrationEpisode: 10,
      resolutionDeadlineEpisode: 90,
      windowStatus: "missed",
      resolutionClassification: "unresolved",
      firstResolutionEvent: null,
    });
    expect(itemsById.fs_pending).toMatchObject({
      registrationEpisode: 160,
      resolutionDeadlineEpisode: 240,
      windowStatus: "pending",
      resolutionClassification: "unresolved",
      firstResolutionEvent: null,
    });
    expect(itemsById.fs_abandoned).toMatchObject({
      registrationEpisode: 20,
      resolutionDeadlineEpisode: 100,
      windowStatus: "intentionally_abandoned",
      resolutionClassification: "unresolved",
      firstResolutionEvent: null,
    });
  });

  it("builds a reusable continuity verifier report with per-item status, resolution episode, and expiry reasoning", () => {
    const seed = {
      ...createSeedWithAbandonedForeshadowing(),
      foreshadowing: [
        {
          id: "fs_resolved",
          name: "제때 회수된 떡밥",
          description: "80화 안에 회수되어야 하는 떡밥",
          importance: "critical",
          planted_at: 1,
          hints_at: [],
          reveal_at: 40,
          origin: {
            episode_id: "ep_001",
            scene_id: "scene_001_gate",
            source_span: {
              start_offset: 0,
              end_offset: 20,
            },
          },
          linked_hint_occurrences: [],
          status: "pending",
          hint_count: 0,
        },
        {
          id: "fs_expired",
          name: "늦게 회수된 떡밥",
          description: "기한이 지난 뒤에야 회수된 떡밥",
          importance: "critical",
          planted_at: 5,
          hints_at: [],
          reveal_at: 95,
          origin: {
            episode_id: "ep_005",
            scene_id: "scene_005_tower",
            source_span: {
              start_offset: 0,
              end_offset: 18,
            },
          },
          linked_hint_occurrences: [],
          status: "pending",
          hint_count: 0,
        },
        {
          id: "fs_missed",
          name: "놓친 떡밥",
          description: "끝내 회수되지 않은 떡밥",
          importance: "critical",
          planted_at: 10,
          hints_at: [],
          reveal_at: null,
          origin: {
            episode_id: "ep_010",
            scene_id: "scene_010_hall",
            source_span: {
              start_offset: 0,
              end_offset: 16,
            },
          },
          linked_hint_occurrences: [],
          status: "pending",
          hint_count: 0,
        },
        {
          id: "fs_abandoned",
          name: "의도적으로 폐기된 떡밥",
          description: "명시적으로 폐기 처리된 떡밥",
          importance: "minor",
          planted_at: 20,
          hints_at: [],
          reveal_at: null,
          abandonment_marker: "intentional-abandonment:timeline-cut",
          origin: {
            episode_id: "ep_020",
            scene_id: "scene_020_archive",
            source_span: {
              start_offset: 0,
              end_offset: 19,
            },
          },
          linked_hint_occurrences: [],
          status: "pending",
          hint_count: 0,
        },
      ],
    } as NovelSeed;

    const report = buildForeshadowContinuityVerifierReport(seed, [
      {
        chapterNumber: 40,
        summary: {
          title: "40화",
          plot_summary: "제때 회수된 떡밥이 정체를 드러낸다.",
          cliffhanger: null,
          foreshadowing_touched: [
            {
              foreshadowing_id: "fs_resolved",
              action: "reveal",
              context: "문양의 진짜 주인이 40화에서 드러난다.",
            },
          ],
        },
      },
      {
        chapterNumber: 95,
        summary: {
          title: "95화",
          plot_summary: "늦게 회수된 떡밥이 마침내 정리된다.",
          cliffhanger: null,
          foreshadowing_touched: [
            {
              foreshadowing_id: "fs_expired",
              action: "reveal",
              context: "탑의 비밀이 95화에서야 드러난다.",
            },
          ],
        },
      },
      {
        chapterNumber: 200,
        summary: {
          title: "200화",
          plot_summary: "아직 일부 떡밥은 남아 있다.",
          cliffhanger: null,
          foreshadowing_touched: [],
        },
      },
    ]);

    const itemsById = Object.fromEntries(report.items.map((item) => [item.id, item]));

    expect(ForeshadowContinuityVerifierReportSchema.parse(report)).toEqual(report);
    expect(report).toMatchObject({
      resolutionWindowEpisodes: 80,
      evaluationHorizonEpisode: 200,
      totals: {
        total: 4,
        resolvedWithinWindow: 1,
        pending: 0,
        missed: 1,
        expired: 1,
        intentionallyAbandoned: 1,
      },
    });
    expect(itemsById.fs_resolved).toMatchObject({
      status: "resolved_within_window",
      resolutionClassification: "fully_resolved",
      resolutionEpisode: 40,
      resolutionEpisodeId: "ep_040",
      expiryReasoning: {
        kind: "resolved_before_deadline",
        deadlineEpisode: 81,
        resolutionEpisode: 40,
        episodesRemaining: 41,
      },
    });
    expect(itemsById.fs_expired).toMatchObject({
      status: "expired",
      resolutionClassification: "unresolved",
      resolutionEpisode: 95,
      resolutionEpisodeId: "ep_095",
      countsAsFailure: true,
      expiryReasoning: {
        kind: "resolved_after_deadline",
        deadlineEpisode: 85,
        resolutionEpisode: 95,
        episodesLate: 10,
      },
    });
    expect(itemsById.fs_missed).toMatchObject({
      status: "missed",
      resolutionClassification: "unresolved",
      resolutionEpisode: null,
      threadVerdictClassification: "unresolved_failure",
      expiryReasoning: {
        kind: "deadline_passed_without_resolution",
        deadlineEpisode: 90,
        evaluationHorizonEpisode: 200,
        episodesLate: 110,
      },
    });
    expect(itemsById.fs_abandoned).toMatchObject({
      status: "intentionally_abandoned",
      resolutionClassification: "unresolved",
      resolutionEpisode: null,
      countsAsFailure: false,
      expiryReasoning: {
        kind: "intentionally_abandoned",
        deadlineEpisode: 100,
      },
    });
  });
});
