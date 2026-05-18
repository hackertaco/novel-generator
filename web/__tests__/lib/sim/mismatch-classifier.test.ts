import { describe, expect, it } from "vitest";
import type { NovelSeed } from "@/lib/schema/novel";
import {
  addCharacterBelief,
  addCharacterMemory,
  addCharacterUtterance,
  addObjectiveFact,
  classifySimulationStateMismatches,
  createSimulationState,
} from "@/lib/sim";

function makeSeed(): NovelSeed {
  return {
    title: "분류기 테스트",
    logline: "사실 대비 인지 불일치를 분류한다.",
    total_chapters: 12,
    world: {
      name: "황궁",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        북회랑: "비밀문이 있는 복도",
      },
      factions: {},
      rules: ["황궁 금고는 봉인되어 있다."],
    },
    characters: [
      {
        id: "hero",
        name: "세라",
        role: "주인공",
        social_rank: "noble",
        introduction_chapter: 1,
        voice: {
          tone: "차분함",
          speech_patterns: ["...그래요"],
          sample_dialogues: ["문은 아직 잠겨 있어요."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락 귀족의 후계자",
        arc_summary: "진실을 추적한다",
        state: {
          level: null,
          location: "북회랑",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
    ],
    arcs: [],
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "3인칭",
      tense: "과거형",
      formatting_rules: [],
    },
    story_threads: [],
  };
}

function appendEvent(
  state: ReturnType<typeof createSimulationState>,
  event: {
    id: string;
    chapter: number;
    summary: string;
  },
): void {
  state.eventLog.push({
    id: event.id,
    chapter: event.chapter,
    type: "learn_fact",
    actorId: "hero",
    location: "북회랑",
    summary: event.summary,
  });
}

describe("mismatch classifier", () => {
  it("normalizes memory, belief, and utterance canonical conflicts with affected entities", () => {
    const state = createSimulationState(makeSeed());
    appendEvent(state, {
      id: "evt-trauma-1",
      chapter: 2,
      summary: "폭발 충격이 세라의 기억과 판단을 흔든다.",
    });
    const lockedDoorFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 2,
      subject: "북회랑 비밀문",
      predicate: "status",
      object: "잠겨 있음",
      category: "discovery",
      summary: "북회랑 비밀문은 잠겨 있다.",
      subjectEntity: {
        entityId: "secret-door",
        entityType: "item",
      },
      scope: {
        scopeId: "location:north-corridor",
        scopeType: "location",
        entityIds: ["north-corridor"],
      },
    });

    addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 2,
      kind: "direct_experience",
      summary: "세라는 비밀문이 이미 열려 있었다고 기억한다.",
      truthAlignment: "distorted",
      divergenceCause: {
        kind: "trauma",
        summary: "폭발 충격으로 장면을 잘못 떠올린다.",
        sourceEventId: "evt-trauma-1",
      },
      references: {
        eventId: "evt-trauma-1",
        objectiveFactIds: [lockedDoorFact.id],
      },
    });

    addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 2,
      kind: "interpretation",
      subject: "비밀문 상태",
      belief: "세라는 누군가가 문을 열어 두었다고 믿는다.",
      cause: "충격 직후 흔적을 개방의 증거로 오독했다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "misinterpretation",
        summary: "잠금 흔적을 반대로 해석했다.",
        sourceEventId: "evt-trauma-1",
      },
      references: {
        eventId: "evt-trauma-1",
        objectiveFactIds: [lockedDoorFact.id],
      },
    });

    addCharacterUtterance(state.utterances, {
      characterId: "hero",
      chapter: 2,
      sceneId: "scene-2-corridor",
      line: "문은 처음부터 열려 있었어요.",
      cause: "자신의 실수를 숨기기 위해 반대로 말한다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lying",
        summary: "자기 책임을 피하려고 거짓말한다.",
        sourceEventId: "evt-trauma-1",
      },
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-2-corridor",
        eventId: "evt-trauma-1",
        witnessCharacterIds: [],
        objectiveFactIds: [lockedDoorFact.id],
      },
    });

    const report = classifySimulationStateMismatches(state);

    expect(report.mismatchCount).toBe(3);
    expect(report.byContradictionType).toEqual({
      canonical_conflict: 3,
    });
    expect(report.byCauseType).toEqual({
      trauma: 1,
      misinterpretation: 1,
      lying: 1,
    });
    expect(report.byRecordType).toEqual({
      memory: 1,
      belief: 1,
      utterance: 1,
    });
    expect(report.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "memory",
          contradictionType: "canonical_conflict",
          contradictionCategories: ["canonical_conflict"],
          validityStatus: "valid",
          affectedEntities: {
            characterIds: ["hero"],
            objectiveFactIds: [lockedDoorFact.id],
            entityIds: ["secret-door", "north-corridor"],
            scopeIds: ["location:north-corridor"],
          },
          provenance: {
            causeType: "trauma",
            sourceEpisode: 2,
            sourceEventId: "evt-trauma-1",
            causeId: expect.stringContaining("trauma"),
          },
        }),
        expect.objectContaining({
          recordType: "belief",
          contradictionType: "canonical_conflict",
          contradictionCategories: ["canonical_conflict"],
          normalizedCanonicalTruths: [
            expect.objectContaining({
              factId: lockedDoorFact.id,
            }),
          ],
          provenance: {
            causeType: "misinterpretation",
            sourceEpisode: 2,
            sourceEventId: "evt-trauma-1",
            causeId: expect.stringContaining("misinterpretation"),
          },
        }),
        expect.objectContaining({
          recordType: "utterance",
          contradictionType: "canonical_conflict",
          contradictionCategories: ["canonical_conflict"],
          provenance: {
            causeType: "lying",
            sourceEpisode: 2,
            sourceEventId: "evt-trauma-1",
            causeId: expect.stringContaining("lying"),
          },
        }),
      ]),
    );
  });

  it("classifies missing canonical truth across cognition record types", () => {
    const state = createSimulationState(makeSeed());

    addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 4,
      kind: "secondhand_report",
      summary: "세라는 문서에 적힌 위치를 기억한다고 생각한다.",
      truthAlignment: "partial",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "문서 원본을 보지 못한 채 전언만 들었다.",
      },
      references: {
        objectiveFactIds: ["fact:missing"],
      },
    });

    addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 4,
      kind: "deduction",
      subject: "실종 문서 위치",
      belief: "세라는 문서가 금고 안에 있다고 믿는다.",
      cause: "문서를 확인하지 못한 채 단정했다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "원본 접근 없이 추측했다.",
      },
      references: {
        objectiveFactIds: ["fact:missing"],
      },
    });

    addCharacterUtterance(state.utterances, {
      characterId: "hero",
      chapter: 4,
      sceneId: "scene-4-hall",
      line: "문서는 금고 안에 있어요.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "확인 기록 없이 단정해 말했다.",
      },
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-4-hall",
        objectiveFactIds: ["fact:missing"],
        witnessCharacterIds: [],
      },
    });

    const report = classifySimulationStateMismatches(state);

    expect(report.mismatchCount).toBe(3);
    expect(report.byContradictionType).toEqual({
      missing_canonical_truth: 3,
    });
    expect(report.byCauseType).toEqual({
      uncaused_mismatch: 3,
    });
    expect(report.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "memory",
          contradictionType: "missing_canonical_truth",
          contradictionCategories: ["missing_canonical_truth"],
          affectedEntities: {
            characterIds: ["hero"],
            objectiveFactIds: ["fact:missing"],
            entityIds: [],
            scopeIds: [],
          },
          normalizedCanonicalTruths: [],
          provenance: {
            causeType: "uncaused_mismatch",
            sourceEpisode: 4,
            sourceEventId: expect.stringContaining("synthetic:memory"),
            causeId: expect.stringContaining("uncaused_mismatch"),
          },
        }),
        expect.objectContaining({
          recordType: "belief",
          contradictionType: "missing_canonical_truth",
          provenance: {
            causeType: "uncaused_mismatch",
            sourceEpisode: 4,
            sourceEventId: expect.stringContaining("synthetic:belief"),
            causeId: expect.stringContaining("uncaused_mismatch"),
          },
        }),
        expect.objectContaining({
          recordType: "utterance",
          contradictionType: "missing_canonical_truth",
          provenance: {
            causeType: "uncaused_mismatch",
            sourceEpisode: 4,
            sourceEventId: expect.stringContaining("synthetic:utterance"),
            causeId: expect.stringContaining("uncaused_mismatch"),
          },
        }),
      ]),
    );
  });

  it("returns normalized value mismatches for supposedly aligned claims", () => {
    const state = createSimulationState(makeSeed());
    const vaultFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 6,
      subject: "Royal Vault",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "The Royal Vault remains sealed.",
      subjectEntity: {
        entityId: "royal-vault",
        entityType: "location",
      },
      scope: {
        scopeId: "location:royal-vault",
        scopeType: "location",
        entityIds: ["royal-vault"],
      },
    });

    addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 6,
      kind: "deduction",
      subject: "Royal Vault status",
      belief: "Sera concludes the royal vault is already OPEN.",
      cause: "She trusts an incorrect rumor without checking the vault.",
      canonicalAlignment: "supported",
      references: {
        eventId: "evt-vault-rumor-1",
        objectiveFactIds: [vaultFact.id],
      },
    });

    const report = classifySimulationStateMismatches(state);

    expect(report.mismatchCount).toBe(1);
    expect(report.byContradictionType).toEqual({
      normalized_value_mismatch: 1,
    });
    expect(report.byCauseType).toEqual({
      uncaused_mismatch: 1,
    });
    expect(report.results).toEqual([
      expect.objectContaining({
        recordType: "belief",
        contradictionType: "normalized_value_mismatch",
        contradictionCategories: ["normalized_value_mismatch"],
        validityStatus: "invalid",
        normalizedObservedClaims: [
          {
            raw: "Sera concludes the royal vault is already OPEN.",
            normalized: "sera concludes the royal vault is already open.",
          },
        ],
        affectedEntities: {
          characterIds: ["hero"],
          objectiveFactIds: [vaultFact.id],
          entityIds: ["royal-vault"],
          scopeIds: ["location:royal-vault"],
        },
        provenance: {
          causeType: "uncaused_mismatch",
          sourceEpisode: 6,
          sourceEventId: "evt-vault-rumor-1",
          causeId: expect.stringContaining("uncaused_mismatch"),
        },
      }),
    ]);
  });
});
