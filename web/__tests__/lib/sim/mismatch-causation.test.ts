import { describe, expect, it } from "vitest";

import {
  CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME,
  CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION,
  CharacterMismatchCausationRecordSchema,
  createCharacterMismatchCausationLedger,
  ensureCharacterMismatchCausationProvenance,
  loadCharacterMismatchCausationLedger,
} from "@/lib/sim";

describe("mismatch causation schema", () => {
  it("accepts a canonical conflict with a traced source event and inclusive episode span", () => {
    const record = CharacterMismatchCausationRecordSchema.parse({
      mismatchType: "canonical_conflict",
      causeStatus: "recorded",
      explicitCause: {
        kind: "misinterpretation",
        summary: "단서를 잘못 해석했다.",
        sourceEventId: "evt-archive-1",
      },
      sourceEvent: {
        eventId: "evt-archive-1",
        chapter: 11,
      },
      affectedEntity: {
        recordType: "belief",
        recordId: "belief:hero:3",
        characterId: "hero",
      },
      triggeringEvent: {
        eventId: "evt-belief-11",
        chapter: 11,
        sourceActorId: "hero",
      },
      contradictedFact: {
        factId: "fact:archive-door",
        lineId: "line:archive-door",
        chapter: 11,
        sourceEventId: "evt-archive-1",
      },
      introduction: {
        chapter: 11,
        eventId: "evt-belief-11",
      },
      episodeSpan: {
        startChapter: 11,
        endChapter: 14,
        chapterCount: 4,
      },
    });

    expect(record.episodeSpan.chapterCount).toBe(4);
    expect(ensureCharacterMismatchCausationProvenance(record).provenance).toEqual({
      causeId: expect.stringContaining("misinterpretation"),
      causeType: "misinterpretation",
      sourceEpisode: 11,
      sourceEventId: "evt-archive-1",
    });
  });

  it("accepts persisted canonical conflicts when they explicitly record an uncaused mismatch failure", () => {
    expect(() =>
      createCharacterMismatchCausationLedger([{
        mismatchType: "canonical_conflict",
        causeStatus: "missing",
        validationFailure: {
          code: "uncaused_mismatch",
          message: "No explicit recorded cause was available for memory:hero:1 (canonical_conflict).",
          mismatch: {
            recordType: "memory",
            recordId: "memory:hero:1",
            characterId: "hero",
            chapter: 5,
            mismatchType: "canonical_conflict",
            factIds: ["fact:memory:1"],
          },
          missingCause: {
            path: "divergenceCause",
            required: "explicit_divergence_cause",
            allowedKinds: [],
          },
          failureContext: {
            contradictedFactId: "fact:memory:1",
            objectiveFactIds: ["fact:memory:1"],
            traceabilityAnchors: [],
            unresolvedTraceabilityReferences: [],
          },
        },
        affectedEntity: {
          recordType: "memory",
          recordId: "memory:hero:1",
          characterId: "hero",
        },
        contradictedFact: {
          factId: "fact:memory:1",
          chapter: 5,
        },
        introduction: {
          chapter: 5,
        },
        episodeSpan: {
          startChapter: 5,
          endChapter: 5,
          chapterCount: 1,
        },
      }])
    ).not.toThrow();
  });

  it("rejects persisted canonical conflicts when sourceEventId is recorded without a source event", () => {
    expect(() =>
      createCharacterMismatchCausationLedger([{
        mismatchType: "canonical_conflict",
        causeStatus: "recorded",
        explicitCause: {
          kind: "forgetting",
          summary: "충격 이후 순서를 잘못 기억했다.",
          sourceEventId: "evt-memory-4",
        },
        affectedEntity: {
          recordType: "memory",
          recordId: "memory:hero:4",
          characterId: "hero",
        },
        contradictedFact: {
          factId: "fact:memory:4",
          chapter: 9,
        },
        introduction: {
          chapter: 9,
        },
        episodeSpan: {
          startChapter: 9,
          endChapter: 9,
          chapterCount: 1,
        },
      }])
    ).toThrow(/sourceEvent/);
  });

  it("rejects persisted records missing an affected entity reference", () => {
    expect(() =>
      loadCharacterMismatchCausationLedger({
        schema: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME,
        version: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION,
        records: [{
          mismatchType: "canonical_conflict",
          causeStatus: "recorded",
          explicitCause: {
            kind: "misunderstanding",
            summary: "현장 단서를 반대로 읽었다.",
            sourceEventId: "evt-courtyard-2",
          },
          sourceEvent: {
            eventId: "evt-courtyard-2",
            chapter: 12,
          },
          contradictedFact: {
            factId: "fact:courtyard:2",
            chapter: 12,
            sourceEventId: "evt-courtyard-2",
          },
          introduction: {
            chapter: 12,
          },
          episodeSpan: {
            startChapter: 12,
            endChapter: 13,
            chapterCount: 2,
          },
        }],
      })
    ).toThrow(/affectedEntity/);
  });

  it("rejects persisted records missing an episode span", () => {
    expect(() =>
      loadCharacterMismatchCausationLedger({
        schema: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME,
        version: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION,
        records: [{
          mismatchType: "canonical_conflict",
          causeStatus: "recorded",
          explicitCause: {
            kind: "lying",
            summary: "군중을 속이기 위해 반대로 말했다.",
            sourceEventId: "evt-hall-5",
          },
          sourceEvent: {
            eventId: "evt-hall-5",
            chapter: 18,
          },
          affectedEntity: {
            recordType: "utterance",
            recordId: "utterance:hero:7",
            characterId: "hero",
          },
          contradictedFact: {
            factId: "fact:hall:5",
            chapter: 18,
            sourceEventId: "evt-hall-5",
          },
          introduction: {
            chapter: 18,
          },
        }],
      })
    ).toThrow(/episodeSpan/);
  });

  it("rejects source events that do not anchor the span start", () => {
    expect(() =>
      CharacterMismatchCausationRecordSchema.parse({
        mismatchType: "canonical_conflict",
        causeStatus: "recorded",
        explicitCause: {
          kind: "trauma",
          summary: "충격으로 상황을 왜곡했다.",
          sourceEventId: "evt-trauma-2",
        },
        sourceEvent: {
          eventId: "evt-trauma-2",
          chapter: 8,
        },
        affectedEntity: {
          recordType: "utterance",
          recordId: "utterance:hero:9",
          characterId: "hero",
        },
        contradictedFact: {
          factId: "fact:trauma:2",
          chapter: 8,
          sourceEventId: "evt-trauma-2",
        },
        introduction: {
          chapter: 9,
        },
        episodeSpan: {
          startChapter: 9,
          endChapter: 10,
          chapterCount: 2,
        },
      })
    ).toThrow(/startChapter/);
  });

  it("rejects multi-episode spans when no source event reference exists", () => {
    expect(() =>
      CharacterMismatchCausationRecordSchema.parse({
        mismatchType: "canonical_conflict",
        causeStatus: "recorded",
        explicitCause: {
          kind: "lack_of_information",
          summary: "확인 기록 없이 추정했다.",
        },
        affectedEntity: {
          recordType: "belief",
          recordId: "belief:hero:6",
          characterId: "hero",
        },
        contradictedFact: {
          factId: "fact:hero:6",
          chapter: 7,
        },
        introduction: {
          chapter: 7,
        },
        episodeSpan: {
          startChapter: 7,
          endChapter: 8,
          chapterCount: 2,
        },
      })
    ).toThrow(/single chapter/);
  });

  it("serializes mismatch causation records with an explicit versioned contract", () => {
    const original = CharacterMismatchCausationRecordSchema.parse({
      mismatchType: "canonical_conflict",
      causeStatus: "recorded",
      explicitCause: {
        kind: "misinterpretation",
        summary: "단서를 성급히 연결했다.",
        sourceEventId: "evt-archive-9",
      },
      sourceEvent: {
        eventId: "evt-archive-9",
        chapter: 17,
      },
      affectedEntity: {
        recordType: "belief",
        recordId: "belief:hero:9",
        characterId: "hero",
      },
      triggeringEvent: {
        eventId: "evt-belief-9",
        chapter: 17,
        sourceActorId: "hero",
      },
      contradictedFact: {
        factId: "fact:archive:9",
        lineId: "line:archive:9",
        chapter: 17,
        sourceEventId: "evt-archive-9",
      },
      introduction: {
        chapter: 17,
        eventId: "evt-belief-9",
      },
      episodeSpan: {
        startChapter: 17,
        endChapter: 19,
        chapterCount: 3,
      },
    });

    const persisted = createCharacterMismatchCausationLedger([original]);
    const restored = loadCharacterMismatchCausationLedger(
      JSON.parse(JSON.stringify(persisted)),
    );

    expect(restored).toEqual({
      schema: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME,
      version: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION,
      records: [ensureCharacterMismatchCausationProvenance(original)],
    });
  });

  it("rejects introduction event anchors without a triggering event reference", () => {
    expect(() =>
      CharacterMismatchCausationRecordSchema.parse({
        mismatchType: "normalized_value_mismatch",
        causeStatus: "missing",
        validationFailure: {
          code: "uncaused_mismatch",
          message: "No explicit recorded cause was available for belief:hero:10 (normalized_value_mismatch).",
          mismatch: {
            recordType: "belief",
            recordId: "belief:hero:10",
            characterId: "hero",
            chapter: 10,
            mismatchType: "normalized_value_mismatch",
            factIds: [],
          },
          missingCause: {
            path: "divergenceCause",
            required: "explicit_divergence_cause",
            allowedKinds: [],
          },
          failureContext: {
            objectiveFactIds: [],
            traceabilityAnchors: [],
            unresolvedTraceabilityReferences: [],
          },
        },
        affectedEntity: {
          recordType: "belief",
          recordId: "belief:hero:10",
          characterId: "hero",
        },
        introduction: {
          chapter: 10,
          eventId: "evt-intro-10",
        },
        episodeSpan: {
          startChapter: 10,
          endChapter: 10,
          chapterCount: 1,
        },
      })
    ).toThrow(/triggeringEvent/);
  });

  it("rejects mismatch records that omit both explicitCause and validationFailure", () => {
    expect(() =>
      CharacterMismatchCausationRecordSchema.parse({
        mismatchType: "missing_canonical_truth",
        causeStatus: "missing",
        affectedEntity: {
          recordType: "belief",
          recordId: "belief:hero:11",
          characterId: "hero",
        },
        introduction: {
          chapter: 11,
        },
        episodeSpan: {
          startChapter: 11,
          endChapter: 11,
          chapterCount: 1,
        },
      })
    ).toThrow(/validationFailure/);
  });

  it("rejects persisted mismatch causation ledgers with an unsupported version", () => {
    expect(() =>
      loadCharacterMismatchCausationLedger({
        schema: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME,
        version: CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION + 1,
        records: [],
      })
    ).toThrow(/expected 1/);
  });
});
