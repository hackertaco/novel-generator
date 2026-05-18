import { describe, expect, it } from "vitest";

import {
  addCharacterBelief,
  addCharacterMemory,
  addCharacterUtterance,
  addObjectiveFact,
  createSimulationState,
  createSimulationValidationVerdict,
  verifyCharacterCognitionConsistency,
  type SimulationState,
} from "@/lib/sim";

import { makeSimulationTestSeed } from "./fixtures/cognition-fixtures";

function appendHistoryEvent(
  state: SimulationState,
  event: {
    id: string;
    chapter: number;
    summary: string;
    actorId?: string;
  },
): void {
  state.eventLog.push({
    id: event.id,
    chapter: event.chapter,
    type: "learn_fact",
    actorId: event.actorId ?? "hero",
    location: null,
    summary: event.summary,
  });
}

describe("sim mismatch introduction ledger", () => {
  it("emits exactly one causation record at the contradiction introduction point for memory, belief, and utterance mismatches", () => {
    const state = createSimulationState(makeSimulationTestSeed());

    appendHistoryEvent(state, {
      id: "evt-vault-truth",
      chapter: 1,
      actorId: "ally",
      summary: "리안이 황실 금고 봉인이 유지된 사실을 확인한다.",
    });
    appendHistoryEvent(state, {
      id: "evt-memory-source",
      chapter: 2,
      summary: "세라가 폭우 속 흔적을 잘못 보고 금고가 열렸다고 착각할 단서를 얻는다.",
    });
    appendHistoryEvent(state, {
      id: "evt-memory-introduction",
      chapter: 3,
      summary: "세라가 왜곡된 기억을 처음 떠올린다.",
    });
    appendHistoryEvent(state, {
      id: "evt-belief-source",
      chapter: 4,
      summary: "세라가 봉인 문양 일부만 보고 내부자 개입을 의심할 오해를 쌓는다.",
    });
    appendHistoryEvent(state, {
      id: "evt-belief-introduction",
      chapter: 5,
      summary: "세라가 오해를 해석으로 굳혀 믿음으로 정리한다.",
    });
    appendHistoryEvent(state, {
      id: "evt-utterance-source",
      chapter: 6,
      summary: "세라가 군중의 시선을 돌리기 위해 거짓 보고를 결심한다.",
    });
    appendHistoryEvent(state, {
      id: "evt-utterance-introduction",
      chapter: 7,
      summary: "세라가 공개적으로 사실과 다른 말을 한다.",
    });

    const fact = addObjectiveFact(state.objectiveFacts, {
      chapter: 1,
      subject: "황실 금고",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "황실 금고는 봉인된 상태다.",
      sourceEventId: "evt-vault-truth",
    });

    const memory = addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 3,
      kind: "recollection",
      summary: "세라는 금고 문이 이미 열려 있었다고 기억한다.",
      cause: "빗속에서 본 왜곡된 흔적을 사실로 재구성했다.",
      truthAlignment: "distorted",
      divergenceCause: {
        kind: "misinterpretation",
        summary: "비에 번진 봉인 자국을 개방 흔적으로 오독했다.",
        sourceEventId: "evt-memory-source",
      },
      references: {
        eventId: "evt-memory-introduction",
        objectiveFactIds: [fact.id],
      },
    });

    const belief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 5,
      kind: "deduction",
      subject: "황실 금고 봉인",
      belief: "세라는 내부자가 이미 금고를 열었다고 믿는다.",
      cause: "불완전한 봉인 흔적과 침묵을 연결해 결론 내렸다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "봉인 전체를 확인하지 못한 상태에서 결론을 확정했다.",
        sourceEventId: "evt-belief-source",
      },
      references: {
        eventId: "evt-belief-introduction",
        objectiveFactIds: [fact.id],
      },
    });

    const utterance = addCharacterUtterance(state.utterances, {
      characterId: "hero",
      chapter: 7,
      sceneId: "scene-7-courtyard",
      line: "금고는 이미 열려 있었어요.",
      cause: "군중을 다른 방향으로 유도하려고 사실과 다르게 말했다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lying",
        summary: "시선을 돌리기 위해 의도적으로 반대 진술을 했다.",
        sourceEventId: "evt-utterance-source",
      },
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-7-courtyard",
        eventId: "evt-utterance-introduction",
        witnessCharacterIds: ["ally"],
        objectiveFactIds: [fact.id],
      },
    });

    const report = verifyCharacterCognitionConsistency(state);
    const verdict = createSimulationValidationVerdict(report);

    expect(report.passed).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.mismatches.map((mismatch) => mismatch.recordId)).toEqual([
      memory.id,
      belief.id,
      utterance.id,
    ]);
    expect(verdict.mismatchCausationLedger.records).toHaveLength(3);

    const expectations = [
      {
        recordType: "memory" as const,
        recordId: memory.id,
        introductionChapter: 3,
        introductionEventId: "evt-memory-introduction",
        sourceChapter: 2,
        sourceEventId: "evt-memory-source",
      },
      {
        recordType: "belief" as const,
        recordId: belief.id,
        introductionChapter: 5,
        introductionEventId: "evt-belief-introduction",
        sourceChapter: 4,
        sourceEventId: "evt-belief-source",
      },
      {
        recordType: "utterance" as const,
        recordId: utterance.id,
        introductionChapter: 7,
        introductionEventId: "evt-utterance-introduction",
        sourceChapter: 6,
        sourceEventId: "evt-utterance-source",
      },
    ];

    for (const entry of expectations) {
      const matchingRecords = verdict.mismatchCausationLedger.records.filter(
        (record) => record.affectedEntity.recordId === entry.recordId,
      );

      expect(matchingRecords).toHaveLength(1);
      expect(matchingRecords[0]).toEqual(
        expect.objectContaining({
          mismatchType: "canonical_conflict",
          affectedEntity: {
            recordType: entry.recordType,
            recordId: entry.recordId,
            characterId: "hero",
          },
          sourceEvent: {
            eventId: entry.sourceEventId,
            chapter: entry.sourceChapter,
          },
          triggeringEvent: {
            eventId: entry.introductionEventId,
            chapter: entry.introductionChapter,
            sourceActorId: "hero",
          },
          contradictedFact: {
            factId: fact.id,
            lineId: fact.revision.lineId,
            chapter: 1,
            sourceEventId: "evt-vault-truth",
          },
          introduction: {
            chapter: entry.introductionChapter,
            eventId: entry.introductionEventId,
          },
          episodeSpan: {
            startChapter: entry.sourceChapter,
            endChapter: entry.introductionChapter,
            chapterCount: entry.introductionChapter - entry.sourceChapter + 1,
          },
        }),
      );
    }
  });
});
