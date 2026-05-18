import { describe, expect, it } from "vitest";
import type { NovelSeed } from "@/lib/schema/novel";
import {
  addCharacterBelief,
  addCharacterMemory,
  addCharacterUtterance,
  addObjectiveFact,
  CharacterMismatchCausationRecordSchema,
  createSimulationState,
  executeVerifierAutoCorrectionEdits,
  resolveVerifierFailureAutoCorrectionRoute,
  VerifierAutoCorrectionScopeError,
} from "@/lib/sim";

function makeSeed(): NovelSeed {
  return {
    title: "자동 보정 가드 테스트",
    logline: "보정 스코프 가드를 검증한다.",
    total_chapters: 10,
    world: {
      name: "황궁",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        금고: "봉인된 황궁 금고",
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
          sample_dialogues: ["봉인은 유지되고 있어요."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락 귀족의 후계자",
        arc_summary: "금고의 비밀을 추적한다",
        state: {
          level: null,
          location: "금고",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "ally",
        name: "리안",
        role: "조력자",
        social_rank: "commoner",
        introduction_chapter: 1,
        voice: {
          tone: "직설적",
          speech_patterns: ["그러니까"],
          sample_dialogues: ["봉인 기록을 확인하죠."],
          personality_core: "현실적이고 민첩함",
        },
        backstory: "황궁 실무관",
        arc_summary: "세라를 돕는다",
        state: {
          level: null,
          location: "금고",
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

function createStateWithVaultFact() {
  const state = createSimulationState(makeSeed());
  const fact = addObjectiveFact(state.objectiveFacts, {
    chapter: 3,
    subject: "황궁 금고",
    predicate: "is",
    object: "봉인됨",
    category: "world_rule",
    summary: "황궁 금고는 여전히 봉인되어 있다.",
    sourceEventId: "evt-seal-locked",
  });

  return { state, fact };
}

describe("verifier auto correction execution", () => {
  it("applies edits that stay inside the routed failure scope", () => {
    const { state, fact } = createStateWithVaultFact();
    const belief = addCharacterBelief(state.beliefs, {
      characterId: "ally",
      chapter: 3,
      kind: "interpretation",
      subject: "금고 봉인",
      belief: "리안은 봉인이 누군가의 속임수라고 믿는다.",
      cause: "수상한 발자국과 경비 교대를 함께 해석했다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "bias",
        summary: "리안은 원래 경비대를 불신한다.",
        sourceEventId: "evt-seal-locked",
      },
      references: {
        eventId: "evt-seal-locked",
        objectiveFactIds: [fact.id],
      },
    });

    const route = resolveVerifierFailureAutoCorrectionRoute({
      code: "unsupported_divergence_cause",
      source: "verification_issue",
    });

    const report = executeVerifierAutoCorrectionEdits(
      { simulationState: state },
      route,
      [
        {
          targetType: "belief",
          targetId: belief.id,
          fieldPath: "divergenceCause.kind",
          operation: "set",
          value: "misunderstanding",
        },
        {
          targetType: "belief",
          targetId: belief.id,
          fieldPath: "divergenceCause.summary",
          operation: "set",
          value: "발자국 의미를 경비대의 조작으로 오독했다.",
        },
      ],
    );

    const corrected = state.beliefs.ally.byId[belief.id];
    expect(report.appliedEditCount).toBe(2);
    expect(report.blockedEditCount).toBe(0);
    expect(corrected.divergenceCause).toMatchObject({
      kind: "misunderstanding",
      summary: "발자국 의미를 경비대의 조작으로 오독했다.",
      sourceEventId: "evt-seal-locked",
    });
  });

  it("blocks out-of-scope edits and reports the rejected path", () => {
    const { state, fact } = createStateWithVaultFact();
    const memory = addCharacterMemory(state.memories, {
      characterId: "ally",
      chapter: 3,
      kind: "secondhand_report",
      summary: "리안은 금고가 방금 열렸다고 기억한다.",
      truthAlignment: "distorted",
      divergenceCause: {
        kind: "forgetting",
        summary: "이전 보고와 이번 장면을 뒤섞어 기억했다.",
        sourceEventId: "evt-seal-locked",
      },
      references: {
        eventId: "evt-seal-locked",
        objectiveFactIds: [fact.id],
      },
    });

    const route = resolveVerifierFailureAutoCorrectionRoute({
      code: "missing_divergence_cause",
      source: "verification_issue",
    });

    expect.assertions(6);

    try {
      executeVerifierAutoCorrectionEdits(
        { simulationState: state },
        route,
        [
          {
            targetType: "memory",
            targetId: memory.id,
            fieldPath: "summary",
            operation: "set",
            value: "리안은 금고가 아직 봉인되어 있다고 기억한다.",
          },
        ],
      );
    } catch (error) {
      expect(error).toBeInstanceOf(VerifierAutoCorrectionScopeError);
      expect(state.memories.ally.byId[memory.id]?.summary).toBe(
        "리안은 금고가 방금 열렸다고 기억한다.",
      );
      expect((error as VerifierAutoCorrectionScopeError).report).toMatchObject({
        failureClass: "missing_divergence_cause",
        autoCorrectionScope: "divergence_cause_annotation",
        attemptedEditCount: 1,
        appliedEditCount: 0,
        blockedEditCount: 1,
      });
      expect((error as VerifierAutoCorrectionScopeError).report.blockedEdits).toEqual([
        expect.objectContaining({
          targetType: "memory",
          fieldPath: "summary",
          allowedFieldPaths: ["divergenceCause"],
        }),
      ]);
      expect((error as VerifierAutoCorrectionScopeError).message).toContain(
        "out-of-scope edit",
      );
      expect((error as VerifierAutoCorrectionScopeError).toJSON()).toMatchObject({
        name: "VerifierAutoCorrectionScopeError",
        blockedEditCount: 1,
      });
    }
  });

  it("rejects correction attempts against target types outside the permitted scope", () => {
    const { state, fact } = createStateWithVaultFact();
    const memory = addCharacterMemory(state.memories, {
      characterId: "ally",
      chapter: 3,
      kind: "secondhand_report",
      summary: "리안은 금고 봉인이 수상하다고만 기억한다.",
      truthAlignment: "accurate",
      references: {
        eventId: "evt-seal-locked",
        objectiveFactIds: [fact.id],
      },
    });

    const route = resolveVerifierFailureAutoCorrectionRoute({
      code: "missing_divergence_cause",
      source: "verification_issue",
    });

    expect.assertions(5);

    try {
      executeVerifierAutoCorrectionEdits(
        { simulationState: state },
        route,
        [
          {
            targetType: "objective_fact",
            targetId: fact.id,
            fieldPath: "sourceEventId",
            operation: "set",
            value: "evt-retcon-attempt",
          },
          {
            targetType: "memory",
            targetId: memory.id,
            fieldPath: "divergenceCause",
            operation: "set",
            value: {
              kind: "misunderstanding",
              summary: "허용된 편집과 함께 범위 밖 정정을 끼워 넣으려 했다.",
              sourceEventId: "evt-seal-locked",
            },
          },
        ],
      );
    } catch (error) {
      expect(error).toBeInstanceOf(VerifierAutoCorrectionScopeError);
      expect(state.objectiveFacts.byId[fact.id]?.sourceEventId).toBe("evt-seal-locked");
      expect(state.memories.ally.byId[memory.id]?.divergenceCause).toBeUndefined();
      expect((error as VerifierAutoCorrectionScopeError).report.blockedEdits).toEqual([
        expect.objectContaining({
          targetType: "objective_fact",
          fieldPath: "sourceEventId",
          allowedFieldPaths: [],
        }),
      ]);
      expect((error as VerifierAutoCorrectionScopeError).report).toMatchObject({
        attemptedEditCount: 2,
        appliedEditCount: 0,
        blockedEditCount: 1,
      });
    }
  });

  it("fails closed when a mixed correction plan includes one blocked edit", () => {
    const { state, fact } = createStateWithVaultFact();
    const utterance = addCharacterUtterance(state.utterances, {
      characterId: "hero",
      chapter: 3,
      sceneId: "scene-3-vault",
      line: "봉인 기록부터 확인해요.",
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-3-vault",
        eventId: "evt-seal-locked",
        witnessCharacterIds: ["ally"],
        objectiveFactIds: [fact.id],
      },
    });

    const route = resolveVerifierFailureAutoCorrectionRoute({
      code: "missing_traceability_link",
      source: "verification_issue",
    });

    expect(() =>
      executeVerifierAutoCorrectionEdits(
        { simulationState: state },
        route,
        [
          {
            targetType: "utterance",
            targetId: utterance.id,
            fieldPath: "provenance.eventId",
            operation: "set",
            value: "evt-linked-repair",
          },
          {
            targetType: "utterance",
            targetId: utterance.id,
            fieldPath: "line",
            operation: "set",
            value: "이 문장은 스코프 밖 수정이라 차단되어야 한다.",
          },
        ],
      )
    ).toThrowError(VerifierAutoCorrectionScopeError);

    const untouched = state.utterances.hero.byId[utterance.id];
    expect(untouched.provenance.eventId).toBe("evt-seal-locked");
    expect(untouched.line).toBe("봉인 기록부터 확인해요.");
  });

  it("allows persisted mismatch repair only inside the annotation scope", () => {
    const mismatchRecord = CharacterMismatchCausationRecordSchema.parse({
      mismatchType: "canonical_conflict",
      causeStatus: "missing",
      validationFailure: {
        code: "uncaused_mismatch",
        message: "No explicit cause is recorded.",
        mismatch: {
          recordType: "belief",
          recordId: "belief:ally:1",
          characterId: "ally",
          chapter: 3,
          mismatchType: "canonical_conflict",
          factIds: ["fact:1"],
        },
        missingCause: {
          path: "divergenceCause",
          required: "explicit_divergence_cause",
          allowedKinds: ["misunderstanding"],
        },
        failureContext: {
          triggeringEventId: "evt-seal-locked",
          sourceEventId: "evt-seal-locked",
          contradictedFactId: "fact:1",
          objectiveFactIds: ["fact:1"],
          traceabilityAnchors: ["event:evt-seal-locked"],
          unresolvedTraceabilityReferences: [],
        },
      },
      affectedEntity: {
        recordType: "belief",
        recordId: "belief:ally:1",
        characterId: "ally",
      },
      triggeringEvent: {
        eventId: "evt-seal-locked",
        chapter: 3,
        sourceActorId: "hero",
      },
      contradictedFact: {
        factId: "fact:1",
        chapter: 3,
      },
      introduction: {
        chapter: 3,
        eventId: "evt-seal-locked",
      },
      episodeSpan: {
        startChapter: 3,
        endChapter: 3,
        chapterCount: 1,
      },
    });

    const route = resolveVerifierFailureAutoCorrectionRoute({
      code: "uncaused_mismatch",
      source: "validation_failure",
    });

    const mismatchCausationRecords = {
      "mismatch:1": mismatchRecord,
    };

    const report = executeVerifierAutoCorrectionEdits(
      {
        mismatchCausationRecords,
      },
      route,
      [
        {
          targetType: "mismatch",
          targetId: "mismatch:1",
          fieldPath: "causeStatus",
          operation: "set",
          value: "recorded",
        },
        {
          targetType: "mismatch",
          targetId: "mismatch:1",
          fieldPath: "explicitCause",
          operation: "set",
          value: {
            kind: "misunderstanding",
            summary: "리안이 봉인 흔적을 개방 흔적으로 잘못 해석했다.",
            sourceEventId: "evt-seal-locked",
          },
        },
        {
          targetType: "mismatch",
          targetId: "mismatch:1",
          fieldPath: "sourceEvent",
          operation: "set",
          value: {
            eventId: "evt-seal-locked",
            chapter: 3,
          },
        },
        {
          targetType: "mismatch",
          targetId: "mismatch:1",
          fieldPath: "provenance",
          operation: "set",
          value: {
            causeId: "cause:mismatch:1",
            causeType: "misunderstanding",
            sourceEpisode: 3,
            sourceEventId: "evt-seal-locked",
          },
        },
        {
          targetType: "mismatch",
          targetId: "mismatch:1",
          fieldPath: "validationFailure",
          operation: "remove",
        },
      ],
    );
    const correctedMismatch = mismatchCausationRecords["mismatch:1"];

    expect(report.appliedEditCount).toBe(5);
    expect(report.blockedEditCount).toBe(0);
    expect(correctedMismatch).toMatchObject({
      causeStatus: "recorded",
      explicitCause: {
        kind: "misunderstanding",
      },
      sourceEvent: {
        eventId: "evt-seal-locked",
        chapter: 3,
      },
      provenance: {
        causeId: "cause:mismatch:1",
        causeType: "misunderstanding",
      },
    });
    expect(correctedMismatch.validationFailure).toBeUndefined();
  });
});
