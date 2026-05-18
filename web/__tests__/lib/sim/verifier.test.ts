import { describe, expect, it } from "vitest";
import type { NovelSeed } from "@/lib/schema/novel";
import {
  addCharacterBelief,
  addCharacterMemory,
  addObjectiveFact,
  addCharacterUtterance,
  createSimulationState,
  verifyCharacterCognitionConsistency,
} from "@/lib/sim";

function makeSeed(): NovelSeed {
  return {
    title: "검증기 테스트",
    logline: "기억과 믿음 검증을 확인한다.",
    total_chapters: 12,
    world: {
      name: "황궁",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        북회랑: "비밀 통로가 있는 장소",
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
          sample_dialogues: ["문은 아직 열리지 않았어요."],
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

function appendHistoryEvent(
  state: ReturnType<typeof createSimulationState>,
  event: {
    id: string;
    chapter: number;
    summary: string;
    type?: "learn_fact" | "move" | "status_change";
    actorId?: string;
    location?: string | null;
  },
): void {
  state.eventLog.push({
    id: event.id,
    chapter: event.chapter,
    type: event.type ?? "learn_fact",
    actorId: event.actorId ?? "hero",
    location: event.location ?? null,
    summary: event.summary,
  });
}

describe("sim verifier", () => {
  it("accepts caused memory, belief, and utterance divergence when the cause is allowed", () => {
    const state = createSimulationState(makeSeed());
    appendHistoryEvent(state, {
      id: "evt-trauma-1",
      chapter: 2,
      summary: "북회랑 폭발 충격이 세라의 판단과 발화를 흔든다.",
    });
    const lockedDoorFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 2,
      subject: "북회랑 비밀문",
      predicate: "is",
      object: "잠겨 있음",
      category: "discovery",
      summary: "북회랑 비밀문은 잠겨 있다.",
    });

    addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 2,
      kind: "direct_experience",
      summary: "세라는 비밀문이 열려 있었다고 잘못 기억한다.",
      truthAlignment: "distorted",
      divergenceCause: {
        kind: "trauma",
        summary: "직전 폭발 충격으로 장면을 왜곡해 떠올린다.",
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
      belief: "세라는 누군가가 문을 일부러 열어 두었다고 믿는다.",
      cause: "충격 직후 남은 흔적을 성급히 해석함",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "misinterpretation",
        summary: "파손 흔적을 개방 흔적으로 오독했다.",
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
      cause: "충격 직후 자신의 기억을 사실로 믿고 보고한다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lying",
        summary: "자신의 실수를 숨기기 위해 사실과 다르게 말한다.",
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

    const report = verifyCharacterCognitionConsistency(state);

    expect(report.passed).toBe(true);
    expect(report.checkedMemories).toBe(1);
    expect(report.checkedBeliefs).toBe(1);
    expect(report.checkedUtterances).toBe(1);
    expect(report.issues).toEqual([]);
    expect(report.objectiveStateChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "memory",
          recordId: expect.stringMatching(/^memory:/),
          factIds: [lockedDoorFact.id],
          contradictionCategories: ["canonical_conflict"],
          normalizedTruthValues: expect.objectContaining({
            canonicalFacts: [
              expect.objectContaining({
                factId: lockedDoorFact.id,
                subject: {
                  raw: "북회랑 비밀문",
                  normalized: "북회랑 비밀문",
                },
                predicate: {
                  raw: "is",
                  normalized: "is",
                },
                object: {
                  raw: "잠겨 있음",
                  normalized: "잠겨 있음",
                },
                summary: {
                  raw: "북회랑 비밀문은 잠겨 있다.",
                  normalized: "북회랑 비밀문은 잠겨 있다.",
                },
              }),
            ],
            observedClaims: [
              {
                raw: "세라는 비밀문이 열려 있었다고 잘못 기억한다.",
                normalized: "세라는 비밀문이 열려 있었다고 잘못 기억한다.",
              },
            ],
          }),
          comparisonFields: expect.objectContaining({
            canonicalSubjects: [
              {
                raw: "북회랑 비밀문",
                normalized: "북회랑 비밀문",
              },
            ],
            canonicalPredicates: [
              {
                raw: "is",
                normalized: "is",
              },
            ],
            canonicalObjects: [
              {
                raw: "잠겨 있음",
                normalized: "잠겨 있음",
              },
            ],
            canonicalSummaries: [
              {
                raw: "북회랑 비밀문은 잠겨 있다.",
                normalized: "북회랑 비밀문은 잠겨 있다.",
              },
            ],
            observedClaims: [
              {
                raw: "세라는 비밀문이 열려 있었다고 잘못 기억한다.",
                normalized: "세라는 비밀문이 열려 있었다고 잘못 기억한다.",
              },
            ],
          }),
          issueCodes: [],
        }),
        expect.objectContaining({
          recordType: "belief",
          contradictionCategories: ["canonical_conflict"],
          issueCodes: [],
        }),
        expect.objectContaining({
          recordType: "utterance",
          contradictionCategories: ["canonical_conflict"],
          issueCodes: [],
        }),
      ]),
    );
    expect(report.mismatches).toEqual([
      expect.objectContaining({
        recordType: "memory",
        validityStatus: "valid",
        mismatchType: "canonical_conflict",
        causation: expect.objectContaining({
          mismatchType: "canonical_conflict",
          sourceEvent: {
            eventId: "evt-trauma-1",
            chapter: 2,
          },
          triggeringEvent: {
            eventId: "evt-trauma-1",
            chapter: 2,
            sourceActorId: "hero",
          },
          contradictedFact: {
            factId: lockedDoorFact.id,
            lineId: lockedDoorFact.revision.lineId,
            chapter: 2,
          },
          introduction: {
            chapter: 2,
            eventId: "evt-trauma-1",
          },
          affectedEntity: {
            recordType: "memory",
            recordId: expect.stringMatching(/^memory:/),
            characterId: "hero",
          },
          episodeSpan: {
            startChapter: 2,
            endChapter: 2,
            chapterCount: 1,
          },
        }),
        explanation: expect.stringContaining("event evt-trauma-1"),
        ruleOutcome: expect.objectContaining({
          status: "valid",
          causeKind: "trauma",
          requiredDimensions: ["perceived", "misunderstood"],
          satisfiedDimensions: expect.arrayContaining(["perceived", "misunderstood"]),
          traceabilityStatus: "supported",
          traceabilityAnchors: expect.arrayContaining(["event:evt-trauma-1"]),
        }),
      }),
      expect.objectContaining({
        recordType: "belief",
        validityStatus: "valid",
        mismatchType: "canonical_conflict",
        causation: expect.objectContaining({
          mismatchType: "canonical_conflict",
          sourceEvent: {
            eventId: "evt-trauma-1",
            chapter: 2,
          },
          triggeringEvent: {
            eventId: "evt-trauma-1",
            chapter: 2,
            sourceActorId: "hero",
          },
          contradictedFact: {
            factId: lockedDoorFact.id,
            lineId: lockedDoorFact.revision.lineId,
            chapter: 2,
          },
          introduction: {
            chapter: 2,
            eventId: "evt-trauma-1",
          },
          affectedEntity: {
            recordType: "belief",
            recordId: expect.stringMatching(/^belief:/),
            characterId: "hero",
          },
        }),
        explanation: expect.stringContaining(
          "Evidence chain: perceived[event evt-trauma-1",
        ),
        ruleOutcome: expect.objectContaining({
          status: "valid",
          causeKind: "misinterpretation",
          requiredDimensions: ["perceived", "inferred", "misunderstood"],
          satisfiedDimensions: expect.arrayContaining([
            "perceived",
            "inferred",
            "misunderstood",
          ]),
          traceabilityStatus: "supported",
        }),
      }),
      expect.objectContaining({
        recordType: "utterance",
        validityStatus: "valid",
        mismatchType: "canonical_conflict",
        causation: expect.objectContaining({
          mismatchType: "canonical_conflict",
          sourceEvent: {
            eventId: "evt-trauma-1",
            chapter: 2,
          },
          triggeringEvent: {
            eventId: "evt-trauma-1",
            chapter: 2,
            sourceActorId: "hero",
          },
          contradictedFact: {
            factId: lockedDoorFact.id,
            lineId: lockedDoorFact.revision.lineId,
            chapter: 2,
          },
          introduction: {
            chapter: 2,
            eventId: "evt-trauma-1",
          },
          affectedEntity: {
            recordType: "utterance",
            recordId: expect.stringMatching(/^utterance:/),
            characterId: "hero",
          },
        }),
        explanation: expect.stringContaining("cause kind lying"),
        ruleOutcome: expect.objectContaining({
          status: "valid",
          causeKind: "lying",
          requiredDimensions: ["concealed"],
          satisfiedDimensions: ["concealed"],
          traceabilityStatus: "supported",
        }),
        canonicalTruths: [
          expect.objectContaining({
            factId: lockedDoorFact.id,
            summary: "북회랑 비밀문은 잠겨 있다.",
          }),
        ],
        evidence: expect.objectContaining({
          eventId: "evt-trauma-1",
          objectiveFactIds: [lockedDoorFact.id],
          traceabilityAnchors: expect.arrayContaining(["event:evt-trauma-1"]),
          unresolvedTraceabilityReferences: [],
        }),
      }),
    ]);
  });

  it("distinguishes the root-cause event from the event that introduced a mismatch", () => {
    const state = createSimulationState(makeSeed());
    appendHistoryEvent(state, {
      id: "evt-rumor-1",
      chapter: 2,
      actorId: "hero",
      summary: "세라가 불완전한 봉인 단서를 보고 잘못된 인상을 받는다.",
    });
    appendHistoryEvent(state, {
      id: "evt-belief-formation-1",
      chapter: 4,
      actorId: "hero",
      summary: "세라가 금고 상태에 대한 확신을 말로 정리한다.",
    });
    const vaultFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 1,
      subject: "황실 금고",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "황실 금고는 봉인된 상태다.",
      sourceEventId: "evt-rumor-1",
    });

    const belief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 4,
      kind: "deduction",
      subject: "황실 금고 봉인",
      belief: "세라는 금고가 이미 열렸다고 확신한다.",
      cause: "초기 단서를 다시 떠올리며 확신으로 굳혔다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "misinterpretation",
        summary: "2화의 불완전한 흔적을 개방 증거로 오독했다.",
        sourceEventId: "evt-rumor-1",
      },
      references: {
        eventId: "evt-belief-formation-1",
        objectiveFactIds: [vaultFact.id],
      },
    });

    const report = verifyCharacterCognitionConsistency(state);
    const mismatch = report.mismatches.find((item) => item.recordId === belief.id);

    expect(mismatch?.causation).toEqual(
      expect.objectContaining({
        mismatchType: "canonical_conflict",
        sourceEvent: {
          eventId: "evt-rumor-1",
          chapter: 2,
        },
        triggeringEvent: {
          eventId: "evt-belief-formation-1",
          chapter: 4,
          sourceActorId: "hero",
        },
        contradictedFact: {
          factId: vaultFact.id,
          lineId: vaultFact.revision.lineId,
          chapter: 1,
          sourceEventId: "evt-rumor-1",
        },
        introduction: {
          chapter: 4,
          eventId: "evt-belief-formation-1",
        },
        episodeSpan: {
          startChapter: 2,
          endChapter: 4,
          chapterCount: 3,
        },
      }),
    );
  });

  it("flags memory, belief, and utterance divergence that lack an allowed cause", () => {
    const state = createSimulationState(makeSeed());
    const vaultFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 3,
      subject: "황실 금고",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "황실 금고는 여전히 봉인 상태다.",
    });

    const memory = addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 3,
      kind: "recollection",
      summary: "세라는 금고가 열렸다고 기억한다.",
      references: {
        eventId: "evt-vault-1",
        objectiveFactIds: [vaultFact.id],
      },
    });
    memory.truthAlignment = "distorted";

    const belief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 3,
      kind: "suspicion",
      subject: "금고 봉인",
      belief: "세라는 누군가 이미 봉인을 풀었다고 믿는다.",
      cause: "문 손잡이의 열기를 보고 성급히 결론 내렸다.",
      references: {
        eventId: "evt-vault-1",
        objectiveFactIds: [vaultFact.id],
      },
    });
    belief.canonicalAlignment = "contradicted";
    belief.divergenceCause = {
      kind: "lying",
      summary: "내적 상태에 거짓말 원인을 잘못 부여했다.",
      sourceEventId: "evt-vault-1",
    };

    const utterance = addCharacterUtterance(state.utterances, {
      characterId: "hero",
      chapter: 3,
      sceneId: "scene-3-vault",
      line: "금고는 이미 열려 있었어요.",
      cause: "세라는 군중을 오도하려 한다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lying",
        summary: "발화 시점에는 사실을 알면서도 반대로 말한다.",
        sourceEventId: "evt-vault-1",
      },
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-3-vault",
        eventId: "evt-vault-1",
        witnessCharacterIds: [],
        objectiveFactIds: [vaultFact.id],
      },
    });
    utterance.divergenceCause = undefined;

    const report = verifyCharacterCognitionConsistency(state);

    expect(report.passed).toBe(false);
    expect(report.checkedUtterances).toBe(1);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_divergence_cause",
          recordType: "memory",
          recordId: memory.id,
        }),
        expect.objectContaining({
          code: "unsupported_divergence_cause",
          recordType: "belief",
          recordId: belief.id,
        }),
        expect.objectContaining({
          code: "missing_divergence_cause",
          recordType: "utterance",
          recordId: utterance.id,
        }),
      ]),
    );
    expect(report.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "memory",
          validityStatus: "invalid",
          issueCodes: ["missing_divergence_cause"],
          causation: expect.objectContaining({
            mismatchType: "canonical_conflict",
            causeStatus: "missing",
            explicitCause: undefined,
            validationFailure: expect.objectContaining({
              code: "uncaused_mismatch",
              message: `No explicit recorded cause was available for memory:${memory.id} (canonical_conflict).`,
              mismatch: {
                recordType: "memory",
                recordId: memory.id,
                characterId: "hero",
                chapter: 3,
                mismatchType: "canonical_conflict",
                factIds: [vaultFact.id],
              },
              missingCause: {
                path: "divergenceCause",
                required: "explicit_divergence_cause",
                allowedKinds: [
                  "forgetting",
                  "misunderstanding",
                  "misinterpretation",
                  "lack_of_information",
                  "deception",
                  "trauma",
                ],
              },
              failureContext: {
                triggeringEventId: "evt-vault-1",
                contradictedFactId: vaultFact.id,
                objectiveFactIds: [vaultFact.id],
                traceabilityAnchors: [],
                sourceEventId: undefined,
                unresolvedTraceabilityReferences: ["event:evt-vault-1"],
                provenance: {
                  causeType: "uncaused_mismatch",
                  sourceEpisode: 3,
                  sourceEventId: "evt-vault-1",
                  causeId: expect.stringContaining("uncaused_mismatch"),
                },
              },
            }),
            provenance: {
              causeType: "uncaused_mismatch",
              sourceEpisode: 3,
              sourceEventId: "evt-vault-1",
              causeId: expect.stringContaining("uncaused_mismatch"),
            },
            sourceEvent: undefined,
            episodeSpan: {
              startChapter: 3,
              endChapter: 3,
              chapterCount: 1,
            },
          }),
          explanation: expect.stringContaining(
            "no explicit divergence cause was recorded",
          ),
        }),
        expect.objectContaining({
          recordType: "belief",
          validityStatus: "invalid",
          issueCodes: ["unsupported_divergence_cause"],
          causation: expect.objectContaining({
            mismatchType: "canonical_conflict",
            sourceEvent: undefined,
            episodeSpan: {
              startChapter: 3,
              endChapter: 3,
              chapterCount: 1,
            },
          }),
          explanation: expect.stringContaining(
            "unsupported_divergence_cause",
          ),
        }),
        expect.objectContaining({
          recordType: "utterance",
          validityStatus: "invalid",
          issueCodes: ["missing_divergence_cause"],
        }),
      ]),
    );
  });

  it("records normalized objective-state comparison fields for aligned outputs", () => {
    const state = createSimulationState(makeSeed());
    const vaultFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 2,
      subject: "황실 금고",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "황실 금고는 여전히 봉인 상태다.",
    });

    const belief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 2,
      kind: "deduction",
      subject: "황실 금고 봉인",
      belief: " 세라는   금고가 아직   봉인되어 있다고 믿는다. ",
      cause: "직접 확인한 봉인 문양과 경비 배치를 근거로 판단했다.",
      canonicalAlignment: "supported",
      references: {
        eventId: "evt-vault-check-1",
        objectiveFactIds: [vaultFact.id],
      },
    });

    const report = verifyCharacterCognitionConsistency(state);

    expect(report.passed).toBe(true);
    expect(report.mismatches).toEqual([]);
    expect(report.objectiveStateChecks).toEqual([
      expect.objectContaining({
        recordType: "belief",
        recordId: belief.id,
        characterId: "hero",
        factIds: [vaultFact.id],
        contradictionCategories: [],
        issueCodes: [],
        normalizedTruthValues: {
          canonicalFacts: [
            expect.objectContaining({
              factId: vaultFact.id,
              subject: {
                raw: "황실 금고",
                normalized: "황실 금고",
              },
              predicate: {
                raw: "status",
                normalized: "status",
              },
              object: {
                raw: "sealed",
                normalized: "sealed",
              },
              summary: {
                raw: "황실 금고는 여전히 봉인 상태다.",
                normalized: "황실 금고는 여전히 봉인 상태다.",
              },
            }),
          ],
          observedClaims: [
            {
              raw: " 세라는   금고가 아직   봉인되어 있다고 믿는다. ",
              normalized: "세라는 금고가 아직 봉인되어 있다고 믿는다.",
            },
          ],
        },
        comparisonFields: {
          canonicalSubjects: [
            {
              raw: "황실 금고",
              normalized: "황실 금고",
            },
          ],
          canonicalPredicates: [
            {
              raw: "status",
              normalized: "status",
            },
          ],
          canonicalObjects: [
            {
              raw: "sealed",
              normalized: "sealed",
            },
          ],
          canonicalSummaries: [
            {
              raw: "황실 금고는 여전히 봉인 상태다.",
              normalized: "황실 금고는 여전히 봉인 상태다.",
            },
          ],
          observedClaims: [
            {
              raw: " 세라는   금고가 아직   봉인되어 있다고 믿는다. ",
              normalized: "세라는 금고가 아직 봉인되어 있다고 믿는다.",
            },
          ],
        },
      }),
    ]);
  });

  it("flags normalized output mismatches against canonical truth for supposedly aligned records", () => {
    const state = createSimulationState(makeSeed());
    const vaultFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 6,
      subject: "Royal Vault",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "The Royal Vault remains sealed.",
    });

    const belief = addCharacterBelief(state.beliefs, {
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

    const report = verifyCharacterCognitionConsistency(state);

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "normalized_value_mismatch",
          recordType: "belief",
          recordId: belief.id,
          factIds: [vaultFact.id],
        }),
      ]),
    );
    expect(report.mismatches).toEqual([
      expect.objectContaining({
        recordType: "belief",
        recordId: belief.id,
        mismatchType: "normalized_value_mismatch",
        causation: expect.objectContaining({
          mismatchType: "normalized_value_mismatch",
          causeStatus: "missing",
          explicitCause: undefined,
          validationFailure: {
            code: "uncaused_mismatch",
            message: `No explicit recorded cause was available for belief:${belief.id} (normalized_value_mismatch).`,
            mismatch: {
              recordType: "belief",
              recordId: belief.id,
              characterId: "hero",
              chapter: 6,
              mismatchType: "normalized_value_mismatch",
              factIds: [vaultFact.id],
            },
            missingCause: {
              path: "divergenceCause",
              required: "explicit_divergence_cause",
              allowedKinds: [
                "misunderstanding",
                "misinterpretation",
                "lack_of_information",
                "deception",
                "trauma",
                "bias",
              ],
            },
            failureContext: {
              triggeringEventId: "evt-vault-rumor-1",
              contradictedFactId: vaultFact.id,
              objectiveFactIds: [vaultFact.id],
              traceabilityAnchors: [],
              sourceEventId: undefined,
              unresolvedTraceabilityReferences: ["event:evt-vault-rumor-1"],
              provenance: {
                causeType: "uncaused_mismatch",
                sourceEpisode: 6,
                sourceEventId: "evt-vault-rumor-1",
                causeId: expect.stringContaining("uncaused_mismatch"),
              },
            },
          },
          provenance: {
            causeType: "uncaused_mismatch",
            sourceEpisode: 6,
            sourceEventId: "evt-vault-rumor-1",
            causeId: expect.stringContaining("uncaused_mismatch"),
          },
          sourceEvent: undefined,
          triggeringEvent: undefined,
          contradictedFact: {
            factId: vaultFact.id,
            lineId: vaultFact.revision.lineId,
            chapter: 6,
            sourceEventId: undefined,
          },
          introduction: {
            chapter: 6,
          },
          affectedEntity: {
            recordType: "belief",
            recordId: belief.id,
            characterId: "hero",
          },
          episodeSpan: {
            startChapter: 6,
            endChapter: 6,
            chapterCount: 1,
          },
        }),
        validityStatus: "invalid",
        issueCodes: ["normalized_value_mismatch"],
        explanation: expect.stringContaining(
          "normalized case-insensitive comparison",
        ),
      }),
    ]);
    expect(report.objectiveStateChecks).toEqual([
      expect.objectContaining({
        recordType: "belief",
        recordId: belief.id,
        contradictionCategories: ["normalized_value_mismatch"],
        issueCodes: ["normalized_value_mismatch"],
        normalizedTruthValues: {
          canonicalFacts: [
            expect.objectContaining({
              factId: vaultFact.id,
              object: {
                raw: "sealed",
                normalized: "sealed",
              },
            }),
          ],
          observedClaims: [
            {
              raw: "Sera concludes the royal vault is already OPEN.",
              normalized: "sera concludes the royal vault is already open.",
            },
          ],
        },
      }),
    ]);
  });

  it("rejects a divergence cause when the stored state cannot trace any perception path", () => {
    const state = createSimulationState(makeSeed());
    const vaultFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 5,
      subject: "황실 금고",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "황실 금고는 여전히 봉인 상태다.",
    });

    const utterance = addCharacterUtterance(state.utterances, {
      characterId: "hero",
      chapter: 5,
      sceneId: "scene-5-vault",
      line: "금고는 이미 열려 있었어요.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "misunderstanding",
        summary: "세라는 어딘가에서 본 흔적을 잘못 이해했다고 주장한다.",
      },
      provenance: {
        source: "reconstructed_from_record",
        sceneId: "scene-5-vault",
        objectiveFactIds: [vaultFact.id],
        witnessCharacterIds: [],
      },
    });

    const report = verifyCharacterCognitionConsistency(state);

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_traceability_link",
          recordType: "utterance",
          recordId: utterance.id,
        }),
      ]),
    );
    expect(report.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "utterance",
          validityStatus: "invalid",
          issueCodes: ["missing_traceability_link"],
          causation: expect.objectContaining({
            mismatchType: "canonical_conflict",
            explicitCause: expect.objectContaining({
              kind: "misunderstanding",
            }),
            sourceEvent: undefined,
            episodeSpan: {
              startChapter: 5,
              endChapter: 5,
              chapterCount: 1,
            },
          }),
          explanation: expect.stringContaining(
            "not explicitly linked to simulation history",
          ),
          ruleOutcome: expect.objectContaining({
            status: "invalid",
            causeKind: "misunderstanding",
            requiredDimensions: ["perceived", "misunderstood"],
            missingDimensions: ["perceived"],
            satisfiedDimensions: ["misunderstood"],
            traceabilityStatus: "missing",
            traceabilityAnchors: [],
          }),
        }),
      ]),
    );
  });

  it("rejects divergence explanations that are not linked to recorded simulation history", () => {
    const state = createSimulationState(makeSeed());
    const vaultFact = addObjectiveFact(state.objectiveFacts, {
      chapter: 7,
      subject: "황실 금고",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "황실 금고는 여전히 봉인 상태다.",
    });

    const belief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 7,
      kind: "deduction",
      subject: "황실 금고 봉인",
      belief: "세라는 봉인이 이미 풀렸다고 단정한다.",
      cause: "세라는 확인되지 않은 단서를 사실처럼 이어 붙였다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "실제 봉인 기록을 읽지 못한 채 섣불리 결론 내렸다.",
        sourceEventId: "evt-missing-history",
      },
      references: {
        objectiveFactIds: [vaultFact.id],
        memoryIds: ["memory:hero:404"],
      },
    });

    const report = verifyCharacterCognitionConsistency(state);

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_traceability_link",
          recordType: "belief",
          recordId: belief.id,
        }),
      ]),
    );
    expect(report.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "belief",
          recordId: belief.id,
          validityStatus: "invalid",
          issueCodes: ["missing_traceability_link"],
          causation: expect.objectContaining({
            mismatchType: "canonical_conflict",
            explicitCause: expect.objectContaining({
              kind: "lack_of_information",
              sourceEventId: "evt-missing-history",
            }),
            sourceEvent: undefined,
            episodeSpan: {
              startChapter: 7,
              endChapter: 7,
              chapterCount: 1,
            },
          }),
          explanation: expect.stringContaining("Missing references: cause event evt-missing-history, memory memory:hero:404"),
          ruleOutcome: expect.objectContaining({
            status: "invalid",
            causeKind: "lack_of_information",
            requiredDimensions: ["inferred"],
            satisfiedDimensions: ["inferred"],
            missingDimensions: [],
            traceabilityStatus: "missing",
            unresolvedTraceabilityReferences: [
              "cause-event:evt-missing-history",
              "memory:memory:hero:404",
            ],
          }),
          evidence: expect.objectContaining({
            traceabilityAnchors: [],
            unresolvedTraceabilityReferences: [
              "cause-event:evt-missing-history",
              "memory:memory:hero:404",
            ],
          }),
        }),
      ]),
    );
    expect(report.objectiveStateChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "belief",
          recordId: belief.id,
          contradictionCategories: ["canonical_conflict", "missing_traceability_link"],
          issueCodes: ["missing_traceability_link"],
        }),
      ]),
    );
  });

  it("flags records that cannot be reconciled with canonical fact references", () => {
    const state = createSimulationState(makeSeed());

    const memory = addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 4,
      kind: "recollection",
      summary: "세라는 북회랑 문양을 떠올린다.",
      references: {
        objectiveFactIds: ["fact:missing"],
      },
    });
    memory.truthAlignment = "partial";
    memory.divergenceCause = {
      kind: "forgetting",
      summary: "일부 세부가 흐릿하다.",
    };

    const belief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 4,
      kind: "deduction",
      subject: "북회랑 문양",
      belief: "세라는 문양이 반역 가문의 표식이라고 본다.",
      cause: "과거 기록을 충분히 확인하지 못했다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "정확한 족보 문서를 아직 읽지 못했다.",
      },
      references: {
        objectiveFactIds: ["fact:missing"],
      },
    });

    const utterance = addCharacterUtterance(state.utterances, {
      characterId: "hero",
      chapter: 4,
      sceneId: "scene-4-hall",
      line: "그 문양은 반역 가문의 표식이에요.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "정확한 문서를 확인하기 전에 단정했다.",
      },
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-4-hall",
        objectiveFactIds: ["fact:missing"],
      },
    });

    const report = verifyCharacterCognitionConsistency(state);

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_objective_fact",
          recordType: "memory",
          recordId: memory.id,
          factIds: ["fact:missing"],
        }),
        expect.objectContaining({
          code: "unknown_objective_fact",
          recordType: "belief",
          recordId: belief.id,
          factIds: ["fact:missing"],
        }),
        expect.objectContaining({
          code: "unknown_objective_fact",
          recordType: "utterance",
          recordId: utterance.id,
          factIds: ["fact:missing"],
        }),
      ]),
    );
    expect(report.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "memory",
          mismatchType: "missing_canonical_truth",
          validityStatus: "invalid",
          causation: expect.objectContaining({
            mismatchType: "missing_canonical_truth",
            causeStatus: "missing",
            explicitCause: undefined,
            validationFailure: expect.objectContaining({
              code: "uncaused_mismatch",
              message: `No explicit recorded cause was available for memory:${memory.id} (missing_canonical_truth).`,
              mismatch: {
                recordType: "memory",
                recordId: memory.id,
                characterId: "hero",
                chapter: 4,
                mismatchType: "missing_canonical_truth",
                factIds: ["fact:missing"],
              },
            }),
            sourceEvent: undefined,
          }),
        }),
        expect.objectContaining({
          recordType: "belief",
          mismatchType: "missing_canonical_truth",
          validityStatus: "invalid",
          causation: expect.objectContaining({
            mismatchType: "missing_canonical_truth",
            causeStatus: "missing",
            explicitCause: undefined,
            validationFailure: expect.objectContaining({
              code: "uncaused_mismatch",
              message: `No explicit recorded cause was available for belief:${belief.id} (missing_canonical_truth).`,
              mismatch: {
                recordType: "belief",
                recordId: belief.id,
                characterId: "hero",
                chapter: 4,
                mismatchType: "missing_canonical_truth",
                factIds: ["fact:missing"],
              },
            }),
            sourceEvent: undefined,
          }),
        }),
        expect.objectContaining({
          recordType: "utterance",
          mismatchType: "missing_canonical_truth",
          validityStatus: "invalid",
          causation: expect.objectContaining({
            mismatchType: "missing_canonical_truth",
            causeStatus: "missing",
            explicitCause: undefined,
            validationFailure: expect.objectContaining({
              code: "uncaused_mismatch",
              message: `No explicit recorded cause was available for utterance:${utterance.id} (missing_canonical_truth).`,
              mismatch: {
                recordType: "utterance",
                recordId: utterance.id,
                characterId: "hero",
                chapter: 4,
                mismatchType: "missing_canonical_truth",
                factIds: ["fact:missing"],
              },
            }),
            sourceEvent: undefined,
            episodeSpan: {
              startChapter: 4,
              endChapter: 4,
              chapterCount: 1,
            },
          }),
          canonicalTruths: [],
          issueCodes: ["unknown_objective_fact"],
          explanation: expect.stringContaining(
            "canonical truth could not be resolved for fact ids fact:missing",
          ),
        }),
      ]),
    );
    expect(report.objectiveStateChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "memory",
          contradictionCategories: [
            "missing_canonical_truth",
          ],
          issueCodes: ["unknown_objective_fact"],
        }),
        expect.objectContaining({
          recordType: "belief",
          contradictionCategories: [
            "missing_canonical_truth",
          ],
          issueCodes: ["unknown_objective_fact"],
        }),
        expect.objectContaining({
          recordType: "utterance",
          contradictionCategories: [
            "missing_canonical_truth",
          ],
          issueCodes: ["unknown_objective_fact"],
        }),
      ]),
    );
  });
});
