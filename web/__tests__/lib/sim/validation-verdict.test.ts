import { describe, expect, it } from "vitest";

import {
  createSimulationValidationVerdict,
  formatSimulationValidationFailure,
  loadCharacterMismatchCausationLedger,
} from "@/lib/sim";
import type {
  CharacterClaimMismatchRecord,
  CognitionVerificationIssue,
  CognitionVerificationReport,
  ObjectiveStateVerificationRecord,
} from "@/lib/sim";

function makeUncausedValidationFailure(overrides?: {
  recordType?: "memory" | "belief" | "utterance";
  recordId?: string;
  characterId?: string;
  chapter?: number;
  mismatchType?: "canonical_conflict" | "missing_canonical_truth" | "normalized_value_mismatch";
  factIds?: string[];
  objectiveFactIds?: string[];
  contradictedFactId?: string;
  triggeringEventId?: string;
}) {
  const recordType = overrides?.recordType ?? "memory";
  const recordId = overrides?.recordId ?? "memory:1";
  const characterId = overrides?.characterId ?? "hero";
  const chapter = overrides?.chapter ?? 3;
  const mismatchType = overrides?.mismatchType ?? "canonical_conflict";
  const factIds = overrides?.factIds ?? ["fact:1"];
  const objectiveFactIds = overrides?.objectiveFactIds ?? factIds;

  return {
    code: "uncaused_mismatch" as const,
    message: `No explicit recorded cause was available for ${recordType}:${recordId} (${mismatchType}).`,
    mismatch: {
      recordType,
      recordId,
      characterId,
      chapter,
      mismatchType,
      factIds,
    },
    missingCause: {
      path: "divergenceCause" as const,
      required: "explicit_divergence_cause" as const,
      allowedKinds: [],
    },
    failureContext: {
      triggeringEventId: overrides?.triggeringEventId,
      contradictedFactId: overrides?.contradictedFactId,
      objectiveFactIds,
      traceabilityAnchors: [],
      unresolvedTraceabilityReferences: [],
      provenance: {
        causeId: `cause:${recordType}:${recordId}:uncaused_mismatch:${overrides?.triggeringEventId ?? `synthetic:${recordType}:${recordId}:chapter:${chapter}`}:ep${chapter}`,
        causeType: "uncaused_mismatch" as const,
        sourceEpisode: chapter,
        sourceEventId: overrides?.triggeringEventId ?? `synthetic:${recordType}:${recordId}:chapter:${chapter}`,
      },
    },
  };
}

function makeMismatch(
  overrides: Partial<CharacterClaimMismatchRecord>,
): CharacterClaimMismatchRecord {
  return {
    recordType: "memory",
    characterId: "hero",
    recordId: "memory:1",
    chapter: 3,
    claim: "세라는 문이 열려 있었다고 기억한다.",
    mismatchType: "canonical_conflict",
    causation: {
      mismatchType: "canonical_conflict",
      causeStatus: "recorded",
      provenance: {
        causeId: "cause:memory:memory:1:trauma:evt-1:ep2",
        causeType: "trauma",
        sourceEpisode: 2,
        sourceEventId: "evt-1",
      },
      explicitCause: {
        kind: "trauma",
        summary: "폭발 충격으로 기억이 왜곡됐다.",
        sourceEventId: "evt-1",
      },
      sourceEvent: {
        eventId: "evt-1",
        chapter: 2,
      },
      affectedEntity: {
        recordType: "memory",
        recordId: "memory:1",
        characterId: "hero",
      },
      validationFailure: undefined,
      introduction: {
        chapter: 3,
      },
      episodeSpan: {
        startChapter: 2,
        endChapter: 3,
        chapterCount: 2,
      },
    },
    validityStatus: "valid",
    explanation: "Allowed mismatch: trauma-linked false memory is traceable.",
    canonicalTruths: [],
    ruleOutcome: {
      status: "valid",
      requiredDimensions: ["perceived"],
      satisfiedDimensions: ["perceived"],
      missingDimensions: [],
      traceabilityStatus: "supported",
      traceabilityAnchors: ["event:evt-1"],
      unresolvedTraceabilityReferences: [],
      trace: [],
      summary: "traceable",
    },
    evidence: {
      objectiveFactIds: ["fact:1"],
      memoryIds: [],
      utteranceIds: [],
      traceabilityAnchors: ["event:evt-1"],
      unresolvedTraceabilityReferences: [],
    },
    issueCodes: [],
    ...overrides,
  };
}

function makeIssue(
  overrides: Partial<CognitionVerificationIssue>,
): CognitionVerificationIssue {
  return {
    code: "missing_divergence_cause",
    recordType: "utterance",
    characterId: "hero",
    recordId: "utterance:1",
    chapter: 3,
    factIds: ["fact:1"],
    severity: "error",
    message: "Utterance conflicts with canonical truth without an explicit cause.",
    ...overrides,
  };
}

function makeObjectiveStateCheck(): ObjectiveStateVerificationRecord {
  return {
    recordType: "utterance",
    characterId: "hero",
    recordId: "utterance:1",
    chapter: 3,
    factIds: ["fact:1"],
    normalizedTruthValues: {
      canonicalFacts: [],
      observedClaims: [{ raw: "문은 열려 있었어요.", normalized: "문은 열려 있었어요." }],
    },
    comparisonFields: {
      canonicalSubjects: [],
      canonicalPredicates: [],
      canonicalObjects: [],
      canonicalSummaries: [],
      observedClaims: [{ raw: "문은 열려 있었어요.", normalized: "문은 열려 있었어요." }],
    },
    contradictionCategories: ["missing_divergence_cause"],
    issueCodes: ["missing_divergence_cause"],
  };
}

describe("simulation validation verdict", () => {
  it("splits allowed exceptions from invalid contradictions", () => {
    const report: CognitionVerificationReport = {
      passed: false,
      checkedMemories: 1,
      checkedBeliefs: 1,
      checkedUtterances: 1,
      issues: [
        makeIssue({ recordId: "utterance:2" }),
      ],
      mismatches: [
        makeMismatch({ recordId: "memory:allowed" }),
        makeMismatch({
          recordType: "utterance",
          recordId: "utterance:rejected",
          validityStatus: "invalid",
          explanation: "Rejected mismatch: utterance has no explicit cause.",
          issueCodes: ["missing_divergence_cause"],
        }),
      ],
      objectiveStateChecks: [makeObjectiveStateCheck()],
    };

    const verdict = createSimulationValidationVerdict(report);

    expect(verdict.passed).toBe(false);
    expect(verdict.allowedExceptionCount).toBe(1);
    expect(verdict.invalidContradictionCount).toBe(1);
    expect(verdict.allowedExceptions.map((item) => item.recordId)).toEqual(["memory:allowed"]);
    expect(verdict.invalidContradictions.map((item) => item.recordId)).toEqual(["utterance:rejected"]);
    expect(verdict.issueCount).toBe(1);
    expect(verdict.objectiveStateChecks).toHaveLength(1);
    expect(
      loadCharacterMismatchCausationLedger(
        JSON.parse(JSON.stringify(verdict.mismatchCausationLedger)),
      ).records,
    ).toEqual(report.mismatches.map((mismatch) => mismatch.causation));
  });

  it("formats a concise failure summary with contradiction counts", () => {
    const verdict = createSimulationValidationVerdict({
      passed: false,
      checkedMemories: 0,
      checkedBeliefs: 0,
      checkedUtterances: 1,
      issues: [makeIssue({ recordId: "utterance:broken" })],
      mismatches: [
        makeMismatch({
          recordType: "utterance",
          recordId: "utterance:broken",
          validityStatus: "invalid",
          explanation: "Rejected mismatch: utterance has no explicit cause.",
          issueCodes: ["missing_divergence_cause"],
        }),
      ],
      objectiveStateChecks: [makeObjectiveStateCheck()],
    });

    expect(formatSimulationValidationFailure(verdict, 7)).toContain("7화 verification failed.");
    expect(formatSimulationValidationFailure(verdict, 7)).toContain("invalid contradictions=1");
    expect(formatSimulationValidationFailure(verdict, 7)).toContain("allowed exceptions=0");
  });

  it("persists fully caused memory, belief, and utterance mismatches in the ledger contract", () => {
    const report: CognitionVerificationReport = {
      passed: false,
      checkedMemories: 1,
      checkedBeliefs: 1,
      checkedUtterances: 1,
      issues: [],
      mismatches: [
        makeMismatch({
          recordType: "memory",
          recordId: "memory:complete",
          chapter: 6,
          claim: "세라는 금고 문이 이미 열렸다고 기억한다.",
          causation: {
            mismatchType: "canonical_conflict",
            causeStatus: "recorded",
            explicitCause: {
              kind: "trauma",
              summary: "폭발 충격 뒤 기억 순서가 뒤섞였다.",
              sourceEventId: "evt-memory-1",
            },
            sourceEvent: {
              eventId: "evt-memory-1",
              chapter: 4,
            },
            affectedEntity: {
              recordType: "memory",
              recordId: "memory:complete",
              characterId: "hero",
            },
            introduction: {
              chapter: 6,
            },
            episodeSpan: {
              startChapter: 4,
              endChapter: 6,
              chapterCount: 3,
            },
          },
        }),
        makeMismatch({
          recordType: "belief",
          recordId: "belief:complete",
          chapter: 7,
          claim: "세라는 내부자가 문을 열었다고 믿는다.",
          causation: {
            mismatchType: "canonical_conflict",
            causeStatus: "recorded",
            explicitCause: {
              kind: "misinterpretation",
              summary: "불완전한 단서를 연결해 내부자 개입으로 오판했다.",
              sourceEventId: "evt-belief-2",
            },
            sourceEvent: {
              eventId: "evt-belief-2",
              chapter: 5,
            },
            affectedEntity: {
              recordType: "belief",
              recordId: "belief:complete",
              characterId: "hero",
            },
            introduction: {
              chapter: 7,
            },
            episodeSpan: {
              startChapter: 5,
              endChapter: 7,
              chapterCount: 3,
            },
          },
        }),
        makeMismatch({
          recordType: "utterance",
          recordId: "utterance:complete",
          chapter: 8,
          claim: "세라는 모두에게 경비가 문을 열었다고 말한다.",
          causation: {
            mismatchType: "canonical_conflict",
            causeStatus: "recorded",
            explicitCause: {
              kind: "lying",
              summary: "군중의 시선을 돌리기 위해 의도적으로 거짓말했다.",
              sourceEventId: "evt-utterance-3",
            },
            sourceEvent: {
              eventId: "evt-utterance-3",
              chapter: 8,
            },
            affectedEntity: {
              recordType: "utterance",
              recordId: "utterance:complete",
              characterId: "hero",
            },
            introduction: {
              chapter: 8,
            },
            episodeSpan: {
              startChapter: 8,
              endChapter: 8,
              chapterCount: 1,
            },
          },
        }),
      ],
      objectiveStateChecks: [makeObjectiveStateCheck()],
    };

    const verdict = createSimulationValidationVerdict(report);
    const restored = loadCharacterMismatchCausationLedger(
      JSON.parse(JSON.stringify(verdict.mismatchCausationLedger)),
    );

    expect(restored.records.map((record) => record.affectedEntity.recordType)).toEqual([
      "memory",
      "belief",
      "utterance",
    ]);
    expect(restored.records.map((record) => record.affectedEntity.recordId)).toEqual([
      "memory:complete",
      "belief:complete",
      "utterance:complete",
    ]);
  });

  it("persists uncaused mismatch validation failures without requiring an explicit cause payload", () => {
    const verdict = createSimulationValidationVerdict({
      passed: false,
      checkedMemories: 0,
      checkedBeliefs: 1,
      checkedUtterances: 0,
      issues: [makeIssue({ recordType: "belief", recordId: "belief:missing-cause" })],
      mismatches: [
        makeMismatch({
          recordType: "belief",
          recordId: "belief:missing-cause",
          validityStatus: "invalid",
          issueCodes: ["missing_divergence_cause"],
          explanation: "Rejected mismatch: belief has no explicit cause.",
          causation: {
            mismatchType: "canonical_conflict",
            causeStatus: "missing",
            validationFailure: makeUncausedValidationFailure({
              recordType: "belief",
              recordId: "belief:missing-cause",
              mismatchType: "canonical_conflict",
            }),
            affectedEntity: {
              recordType: "belief",
              recordId: "belief:missing-cause",
              characterId: "hero",
            },
            introduction: {
              chapter: 3,
            },
            episodeSpan: {
              startChapter: 3,
              endChapter: 3,
              chapterCount: 1,
            },
          },
        }),
      ],
      objectiveStateChecks: [],
    });

    expect(verdict.mismatchCausationLedger.records).toEqual([
      expect.objectContaining({
        mismatchType: "canonical_conflict",
        causeStatus: "missing",
        validationFailure: makeUncausedValidationFailure({
          recordType: "belief",
          recordId: "belief:missing-cause",
          mismatchType: "canonical_conflict",
        }),
      }),
    ]);
  });
});
