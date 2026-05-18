import { describe, expect, it } from "vitest";

import type { NovelSeed } from "@/lib/schema/novel";
import {
  addCharacterBelief,
  addCharacterBeliefInterpretation,
  addCharacterMemory,
  addObjectiveFact,
  createSimulationState,
  createSimulationValidationVerdict,
  createWorldStateAuthorityFromSnapshot,
  listCharacterBeliefs,
  verifyCharacterCognitionConsistency,
} from "@/lib/sim";
import {
  buildRendererNarrativeStateIdentityManifest,
  createRendererRegenerationRequest,
  recoverBeliefInterpretationFailures,
} from "@/lib/harness";

function makeSeed(): NovelSeed {
  return {
    title: "belief recovery",
    logline: "기억 기반 믿음 재계산을 검증한다.",
    total_chapters: 20,
    world: {
      name: "회랑",
      genre: "fantasy",
      sub_genre: "mystery",
      time_period: "imperial",
      magic_system: null,
      key_locations: {
        회랑: "비밀 금고가 숨겨진 장소",
      },
      factions: {},
      rules: ["믿음은 기억에서만 다시 계산한다."],
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
          sample_dialogues: ["지금은 관찰만 해요."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "무너진 가문의 후계자",
        arc_summary: "사실과 해석을 구분하는 법을 배운다.",
        state: {
          level: null,
          location: "회랑",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
    ],
    arcs: [],
    story_threads: [],
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
  };
}

function createRecoveryFixture() {
  const seed = makeSeed();
  const state = createSimulationState(seed);
  const fact = addObjectiveFact(state.objectiveFacts, {
    chapter: 4,
    subject: "금고",
    predicate: "status",
    object: "sealed",
    category: "discovery",
    summary: "금고는 아직 봉인된 상태다.",
    sourceEventId: "evt-vault-check",
    subjectEntity: {
      entityId: "concept:vault-status",
      entityType: "concept",
    },
  });
  const memory = addCharacterMemory(state.memories, {
    characterId: "hero",
    chapter: 4,
    kind: "direct_experience",
    summary: "세라는 금고가 아직 봉인된 상태라는 현장을 직접 본다.",
    references: {
      eventId: "evt-vault-check",
      objectiveFactIds: [fact.id],
      relatedCharacterIds: [],
    },
    tags: ["memory:vault"],
  });
  state.eventLog.push({
    id: "evt-vault-check",
    chapter: 4,
    type: "knowledge_reveal",
    actorId: "hero",
    summary: "세라가 금고 봉인이 유지된 현장을 확인한다.",
    participants: ["hero"],
    objectiveFactIds: [fact.id],
    cognition: {
      experiencedBy: ["hero"],
      interpretedBy: [],
      witnesses: ["hero"],
    },
    memoryUpdates: [],
    beliefUpdates: [],
    utteranceIds: [],
    causes: [],
    effects: [],
    tags: ["observation"],
  } as never);
  const failingBelief = addCharacterBelief(state.beliefs, {
    characterId: "hero",
    chapter: 4,
    kind: "interpretation",
    subject: "금고 상태",
    belief: "세라는 누군가 봉인을 위장했고 금고는 이미 열렸다고 믿는다.",
    cause: "현장의 흔적을 성급하게 해석했다.",
    canonicalAlignment: "contradicted",
    divergenceCause: {
      kind: "misinterpretation",
      summary: "세라는 남겨진 흔적을 잘못 해석했다.",
    },
    references: {
      objectiveFactIds: [fact.id],
      memoryIds: ["memory:stale-link"],
    },
    tags: ["belief:stale-trace"],
  });
  addCharacterBeliefInterpretation(state.beliefInterpretations, {
    characterId: "hero",
    chapter: 4,
    kind: "interpretation",
    subject: failingBelief.subject,
    belief: failingBelief.belief,
    confidence: failingBelief.confidence,
    cause: failingBelief.cause,
    canonicalAlignment: failingBelief.canonicalAlignment,
    divergenceCause: failingBelief.divergenceCause,
    sourceMemoryIds: [memory.id],
    producedBeliefIds: [failingBelief.id],
    references: {
      objectiveFactIds: [fact.id],
    },
    tags: ["belief-interpretation:stale"],
  });

  const beforeVerification = createSimulationValidationVerdict(
    verifyCharacterCognitionConsistency(state),
  );
  const worldStateProjection = [{
    chapter: 4,
    facts: [],
    character_states: [],
    summary: "세라가 금고 봉인이 유지된 현장을 확인했다.",
  }] as never;
  const rendererRegenerationRequest = createRendererRegenerationRequest(
    {
      chapterNumber: 5,
      blueprint: {
        chapter_number: 5,
        title: "오해 이후의 정리",
        arc_id: "arc-recovery",
        one_liner: "같은 사건 기록을 유지한 채 prose만 다시 다듬는다.",
        role_in_arc: "fallout",
        scenes: [],
        emotional_arc: "긴장",
        key_points: [],
        characters_involved: ["hero"],
        tension_level: 6,
        target_word_count: 3000,
        foreshadowing_actions: [],
        dependencies: [],
      },
      previousSummaries: [{
        chapter: 4,
        title: "4화",
        summary: "세라가 금고 봉인을 확인했지만 흔적을 잘못 해석했다.",
      }],
      previousChapterEnding:
        "세라는 봉인된 금고 문에 손을 얹은 채도 누군가 이미 안쪽을 손댔다고 확신했다.",
      simulationState: structuredClone(state),
      worldStateProjection: structuredClone(worldStateProjection),
    },
    {
      proseFailureContext: {
        summary: "사건과 해석을 구분하지 못한 문장을 행동 중심으로 다시 써야 한다.",
        preserve: ["금고 봉인 현장", "세라의 오해"],
        failedText:
          "세라는 금고가 봉인된 상태라는 사실을 보면서도 이미 누군가 열고 나갔다고 단정했다.",
      },
    },
  );

  return {
    seed,
    state,
    memory,
    failingBelief,
    beforeVerification,
    worldStateProjection,
    rendererRegenerationRequest,
  };
}

describe("belief interpretation recovery", () => {
  it("recomputes failing beliefs from linked memories without rerunning prose", () => {
    const fixture = createRecoveryFixture();
    const authority = createWorldStateAuthorityFromSnapshot(fixture.seed, {
      simulationState: fixture.state,
      worldStateProjection: [],
    });

    expect(fixture.beforeVerification.passed).toBe(false);
    expect(
      fixture.beforeVerification.issues.some(
        (issue) =>
          issue.recordType === "belief"
          && issue.recordId === fixture.failingBelief.id
          && issue.code === "missing_traceability_link",
      ),
    ).toBe(true);

    const recovery = recoverBeliefInterpretationFailures(
      authority,
      4,
      fixture.beforeVerification,
    );
    const heroBeliefs = listCharacterBeliefs(
      authority.getSimulationState().beliefs,
      "hero",
      { activeOnly: true },
    );

    expect(recovery.report).toMatchObject({
      chapter: 4,
      attempted: true,
      status: "recovered",
      targetedBeliefIds: [fixture.failingBelief.id],
      selectedMemoryIds: [fixture.memory.id],
      recoveredBeliefIds: [fixture.failingBelief.id],
      unresolvedBeliefIds: [],
    });
    expect(recovery.verification.passed).toBe(true);
    expect(recovery.verification.allowedExceptionCount).toBe(1);
    expect(
      heroBeliefs.some(
        (belief) =>
          belief.references.memoryIds.includes(fixture.memory.id)
          && belief.tags.includes("belief:recovered-from-memory"),
      ),
    ).toBe(true);
    expect(heroBeliefs).toHaveLength(1);
  });

  it("changes only derived belief outputs while preserving memories, emitted prose, and event continuity", () => {
    const fixture = createRecoveryFixture();
    const baselineRequest = structuredClone(fixture.rendererRegenerationRequest);
    const baselineIdentity = fixture.rendererRegenerationRequest.snapshot.stateIdentity!;
    const authority = createWorldStateAuthorityFromSnapshot(fixture.seed, {
      simulationState: structuredClone(fixture.state),
      worldStateProjection: structuredClone(fixture.worldStateProjection),
    });

    const recovery = recoverBeliefInterpretationFailures(
      authority,
      4,
      fixture.beforeVerification,
    );
    const recoveredState = authority.getSimulationState();
    const recoveredBeliefs = listCharacterBeliefs(recoveredState.beliefs, "hero", {
      activeOnly: true,
    });
    const postRecoveryIdentity = buildRendererNarrativeStateIdentityManifest({
      simulationState: recoveredState,
      worldStateProjection: fixture.worldStateProjection,
    });

    expect(recovery.verification.passed).toBe(true);
    expect(recoveredBeliefs).toHaveLength(1);
    expect(recoveredBeliefs[0]?.references.memoryIds).toEqual([fixture.memory.id]);
    expect(recoveredBeliefs[0]?.tags).toContain("belief:recovered-from-memory");
    expect(recoveredState.memories).toEqual(
      fixture.rendererRegenerationRequest.snapshot.simulationState.memories,
    );
    expect(fixture.rendererRegenerationRequest).toEqual(baselineRequest);
    expect(postRecoveryIdentity.segments.beliefs.sha256).not.toBe(
      baselineIdentity.segments.beliefs.sha256,
    );
    expect(postRecoveryIdentity.segments.events.sha256).toBe(
      baselineIdentity.segments.events.sha256,
    );
    expect(postRecoveryIdentity.segments.continuity.sha256).toBe(
      baselineIdentity.segments.continuity.sha256,
    );
    expect(fixture.rendererRegenerationRequest.snapshot.previousSummaries).toEqual(
      baselineRequest.snapshot.previousSummaries,
    );
    expect(fixture.rendererRegenerationRequest.snapshot.previousChapterEnding).toBe(
      baselineRequest.snapshot.previousChapterEnding,
    );
    expect(fixture.rendererRegenerationRequest.proseFailureContext.failedText).toBe(
      baselineRequest.proseFailureContext.failedText,
    );
  });
});
