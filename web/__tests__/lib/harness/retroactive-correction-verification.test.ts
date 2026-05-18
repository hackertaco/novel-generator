import { describe, expect, it } from "vitest";

import type { NovelSeed } from "@/lib/schema/novel";
import {
  addCharacterBelief,
  addCharacterBeliefInterpretation,
  addCharacterUtterance,
  applySimulationEventLedgerPatch,
  buildRetroactiveCorrectionPlan,
  createSimulationState,
  listCharacterBeliefInterpretations,
  listCharacterBeliefs,
  listCharacterMemories,
  reconcileSimulationContinuityArtifacts,
  SimulationEventLedger,
  SimulationEventLedgerPatchError,
  validateMajorPlotActionLedger,
} from "@/lib/sim";
import {
  buildRendererProseStabilityReport,
  createLedgerScopedRendererRegenerationRequest,
} from "@/lib/harness";

function makeSeed(): NovelSeed {
  return {
    title: "연속성 보정 검증",
    logline: "원인보다 앞선 행동을 국소 보정하고 나머지는 그대로 남긴다.",
    total_chapters: 24,
    world: {
      name: "운하 도시",
      genre: "미스터리",
      sub_genre: "추리",
      time_period: "근대",
      magic_system: null,
      key_locations: {
        운하탑: "도시 전체가 내려다보이는 감시탑",
        천문대: "암호 장치가 숨겨진 장소",
      },
      factions: {},
      rules: ["모든 단서는 사건 발생 직후 장부에 기록된다."],
    },
    characters: [
      {
        id: "hero",
        name: "서윤",
        role: "주인공",
        social_rank: "commoner",
        introduction_chapter: 1,
        voice: {
          tone: "단호함",
          speech_patterns: ["정리해 보죠."],
          sample_dialogues: ["단서는 순서를 속이지 않아요."],
          personality_core: "침착하고 집요함",
        },
        backstory: "기록 보관소 조사관",
        arc_summary: "왜곡된 단서 흐름을 바로잡는다.",
        state: {
          level: null,
          location: "운하탑",
          status: "normal",
          relationships: { ally: "협력", mentor: "존경" },
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "ally",
        name: "도진",
        role: "조력자",
        social_rank: "commoner",
        introduction_chapter: 1,
        voice: {
          tone: "예민함",
          speech_patterns: ["뭔가 이상해요."],
          sample_dialogues: ["기록 순서가 뒤집혔어요."],
          personality_core: "눈치가 빠르지만 성급함",
        },
        backstory: "도시 순찰대 서기",
        arc_summary: "단서 해석을 배우며 성장한다.",
        state: {
          level: null,
          location: "운하탑",
          status: "normal",
          relationships: { hero: "협력", mentor: "거리감" },
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "mentor",
        name: "하진",
        role: "조언자",
        social_rank: "noble",
        introduction_chapter: 1,
        voice: {
          tone: "차분함",
          speech_patterns: ["기록은 남는다."],
          sample_dialogues: ["먼저 남긴 흔적부터 보아라."],
          personality_core: "신중하고 분석적",
        },
        backstory: "은퇴한 장부 감찰관",
        arc_summary: "젊은 조사관들을 돕는다.",
        state: {
          level: null,
          location: "운하탑",
          status: "normal",
          relationships: { hero: "신뢰", ally: "관찰" },
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

function createFixture() {
  const seed = makeSeed();
  const runtimeLedger = new SimulationEventLedger();
  let state = createSimulationState(seed);

  state = runtimeLedger.applyEvent(state, {
    id: "evt-mentor-setup",
    chapter: 1,
    episode: 1,
    sceneId: "scene_001_01",
    type: "learn_fact",
    actorId: "mentor",
    summary: "하진은 운하탑 천장에 예전 감시 일지가 숨겨졌다고 남긴다.",
    payload: {
      fact: "예전 감시 일지는 운하탑 천장에 숨겨져 있다.",
      recipients: ["mentor"],
      visibility: "shared",
      subject: "예전 감시 일지",
      predicate: "is_hidden_in",
      object: "운하탑 천장",
    },
  });

  state = runtimeLedger.applyEvent(state, {
    id: "evt-hero-move",
    chapter: 4,
    episode: 4,
    sceneId: "scene_004_02",
    type: "move",
    actorId: "hero",
    location: "운하탑 상층",
    summary: "서윤이 암호 열쇠 단서를 따라 감시탑 상층으로 이동한다.",
    prerequisites: [
      {
        prerequisiteId: "route-confirmed",
        type: "event",
        description: "암호 열쇠 단서가 먼저 확보되어야 한다.",
        eventId: "evt-secret",
      },
    ],
  });

  state = runtimeLedger.applyEvent(state, {
    id: "evt-secret",
    chapter: 5,
    episode: 5,
    sceneId: "scene_005_01",
    type: "learn_fact",
    actorId: "hero",
    summary: "암호 열쇠는 천문대에 숨겨져 있다는 단서를 서윤과 도진이 공유한다.",
    payload: {
      fact: "암호 열쇠는 천문대에 숨겨져 있다.",
      recipients: ["hero", "ally"],
      visibility: "shared",
      subject: "암호 열쇠",
      predicate: "is_hidden_in",
      object: "천문대",
    },
    cognition: {
      beliefUpdates: [
        {
          characterId: "ally",
          kind: "suspicion",
          subject: "암호 열쇠의 경로",
          belief: "도진은 다음 수색 지점이 천문대라고 믿는다.",
          cause: "방금 공유된 단서를 다음 행동 계획으로 해석했다.",
          canonicalAlignment: "supported",
        },
      ],
    },
  });

  state = runtimeLedger.applyEvent(state, {
    id: "evt-patrol-note",
    chapter: 6,
    episode: 6,
    sceneId: "scene_006_01",
    type: "learn_fact",
    actorId: "mentor",
    summary: "하진은 순찰 노트가 아직 봉인실에 남아 있다고 덧붙인다.",
    payload: {
      fact: "순찰 노트는 봉인실에 남아 있다.",
      recipients: ["mentor"],
      visibility: "shared",
      subject: "순찰 노트",
      predicate: "is_stored_in",
      object: "봉인실",
    },
  });

  const mentorMemory = listCharacterMemories(state.memories, "mentor").find(
    (memory) => memory.references.eventId === "evt-mentor-setup",
  );
  const allySecretMemory = listCharacterMemories(state.memories, "ally").find(
    (memory) => memory.references.eventId === "evt-secret",
  );
  const heroMoveMemory = listCharacterMemories(state.memories, "hero").find(
    (memory) => memory.references.eventId === "evt-hero-move",
  );
  const heroSecretMemory = listCharacterMemories(state.memories, "hero").find(
    (memory) => memory.references.eventId === "evt-secret",
  );
  const allySecretBelief = listCharacterBeliefs(state.beliefs, "ally", {
    activeOnly: true,
  }).find((belief) => belief.references.eventId === "evt-secret");

  if (
    !mentorMemory
    || !allySecretMemory
    || !heroMoveMemory
    || !heroSecretMemory
    || !allySecretBelief
  ) {
    throw new Error("fixture initialization failed to create required cognition records");
  }

  const mentorBelief = addCharacterBelief(state.beliefs, {
    characterId: "mentor",
    chapter: 1,
    kind: "deduction",
    subject: "감시 일지",
    belief: "하진은 감시 일지가 여전히 증거로 유효하다고 믿는다.",
    cause: "직접 기록한 단서를 여전히 신뢰한다.",
    references: {
      eventId: "evt-mentor-setup",
      objectiveFactIds: mentorMemory.references.objectiveFactIds,
      memoryIds: [mentorMemory.id],
    },
    tags: ["belief:mentor-anchor"],
  });

  addCharacterBeliefInterpretation(state.beliefInterpretations, {
    characterId: "mentor",
    chapter: 1,
    kind: "deduction",
    subject: "감시 일지",
    belief: mentorBelief.belief,
    cause: "직접 남긴 장부를 재확인했다.",
    sourceMemoryIds: [mentorMemory.id],
    producedBeliefIds: [mentorBelief.id],
    references: {
      eventId: "evt-mentor-setup",
      objectiveFactIds: mentorBelief.references.objectiveFactIds,
    },
    tags: ["interpretation:mentor-anchor"],
  });

  addCharacterBeliefInterpretation(state.beliefInterpretations, {
    characterId: "ally",
    chapter: 5,
    kind: "suspicion",
    subject: allySecretBelief.subject,
    belief: allySecretBelief.belief,
    cause: "공유된 단서를 천문대 수색 계획으로 해석했다.",
    sourceMemoryIds: [allySecretMemory.id],
    producedBeliefIds: [allySecretBelief.id],
    references: {
      eventId: "evt-secret",
      objectiveFactIds: allySecretBelief.references.objectiveFactIds,
      memoryIds: [allySecretMemory.id],
    },
    tags: ["interpretation:secret-route"],
  });

  addCharacterUtterance(state.utterances, {
    characterId: "mentor",
    chapter: 2,
    sceneId: "scene-mentor-2",
    line: "먼저 남긴 기록부터 추적해라.",
    provenance: {
      source: "direct_scene_capture",
      sceneId: "scene-mentor-2",
      eventId: "evt-mentor-setup",
      objectiveFactIds: mentorMemory.references.objectiveFactIds,
    },
    tags: ["utterance:mentor-anchor"],
  });

  return {
    seed,
    state,
    mentorMemory,
    mentorBelief,
    allySecretMemory,
    allySecretBelief,
    heroMoveMemory,
    heroSecretMemory,
    originalSceneTexts: [
      "첫 번째 씬은 그대로 둔다. 서윤은 감시탑 벽면에 남은 바람 자국만 훑었다.",
      "두 번째 씬은 잘못된 인과 순서 때문에 다시 써야 한다. 서윤은 아직 듣지 못한 단서를 이미 확보한 것처럼 움직였다.",
      "세 번째 씬도 그대로 둔다. 바깥 종소리는 아직 누구의 발걸음도 재촉하지 않았다.",
    ],
  };
}

describe("retroactive correction verification coverage", () => {
  it("fixes the targeted causal failure while preserving unaffected ledger, state, and prose outside the bounded scope", () => {
    const fixture = createFixture();
    const initialValidation = validateMajorPlotActionLedger(fixture.state.eventLog, {
      initialState: createSimulationState(fixture.seed),
    });
    const failure = initialValidation.issues.find(
      (issue) =>
        issue.code === "prerequisite_order_violation"
        && issue.eventId === "evt-hero-move",
    );

    expect(initialValidation.passed).toBe(false);
    expect(failure).toBeDefined();

    const plan = buildRetroactiveCorrectionPlan({
      ledger: fixture.state.eventLog,
      failureReport: {
        code: "prerequisite_order_violation",
        eventId: "evt-hero-move",
        chapter: 4,
        episode: 4,
        referencedEventId: "evt-secret",
        prerequisiteId: "route-confirmed",
        message:
          "Prerequisite event \"evt-secret\" must appear before \"evt-hero-move\".",
      },
    });

    const patched = applySimulationEventLedgerPatch(
      fixture.state.eventLog,
      plan,
      [
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-secret",
          fieldPath: "sequence",
          operation: "move",
          value: { beforeEventId: "evt-hero-move" },
        },
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-secret",
          fieldPath: "chapter",
          operation: "set",
          value: 2,
        },
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-secret",
          fieldPath: "episode",
          operation: "set",
          value: 2,
        },
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-secret",
          fieldPath: "sceneId",
          operation: "set",
          value: "scene_002_02",
        },
      ],
      { correctionId: "corr-secret-order" },
    );

    const correctedValidation = validateMajorPlotActionLedger(patched.ledger.events, {
      initialState: createSimulationState(fixture.seed),
    });

    expect(correctedValidation.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt-hero-move",
          code: "prerequisite_order_violation",
        }),
      ]),
    );

    const reconciliation = reconcileSimulationContinuityArtifacts(
      fixture.state,
      patched.ledger.events,
      plan,
    );
    const after = reconciliation.state;
    const afterHeroMemories = listCharacterMemories(after.memories, "hero");
    const afterAllySecretMemory = listCharacterMemories(after.memories, "ally").find(
      (memory) => memory.id === fixture.allySecretMemory.id,
    );
    const afterAllySecretBelief = listCharacterBeliefs(after.beliefs, "ally", {
      activeOnly: true,
    }).find((belief) => belief.id === fixture.allySecretBelief.id);
    const afterAllyInterpretation = listCharacterBeliefInterpretations(
      after.beliefInterpretations,
      "ally",
      { activeOnly: true },
    ).find((record) => record.references.eventId === "evt-secret");

    expect(reconciliation.report.updatedMemoryIds).toEqual(
      expect.arrayContaining([
        fixture.heroSecretMemory.id,
        fixture.allySecretMemory.id,
      ]),
    );
    expect(reconciliation.report.updatedBeliefIds).toEqual(
      expect.arrayContaining([fixture.allySecretBelief.id]),
    );
    expect(reconciliation.report.updatedInterpretationIds).toEqual(
      expect.arrayContaining([afterAllyInterpretation!.id]),
    );
    expect(reconciliation.report.reorderedMemoryCharacters).toContain("hero");

    expect(afterHeroMemories.map((memory) => memory.references.eventId)).toEqual([
      "evt-secret",
      "evt-hero-move",
    ]);
    expect(afterHeroMemories[0]?.chapter).toBe(2);
    expect(afterHeroMemories[1]?.chapter).toBe(4);
    expect(afterAllySecretMemory?.chapter).toBe(2);
    expect(afterAllySecretBelief?.chapter).toBe(2);
    expect(afterAllySecretBelief?.references.memoryIds).toEqual([
      fixture.allySecretMemory.id,
    ]);
    expect(afterAllyInterpretation?.chapter).toBe(2);
    expect(afterAllyInterpretation?.sourceMemoryIds).toEqual([
      fixture.allySecretMemory.id,
    ]);
    expect(after.eventLog.map((event) => event.id)).toEqual([
      "evt-mentor-setup",
      "evt-secret",
      "evt-hero-move",
      "evt-patrol-note",
    ]);

    expect(after.objectiveFacts).toBe(fixture.state.objectiveFacts);
    expect(after.characters).toBe(fixture.state.characters);
    expect(after.utterances).toBe(fixture.state.utterances);
    expect(after.foreshadowRegistry).toBe(fixture.state.foreshadowRegistry);
    expect(after.threads).toBe(fixture.state.threads);
    expect(after.memories.mentor).toBe(fixture.state.memories.mentor);
    expect(after.beliefs.mentor).toBe(fixture.state.beliefs.mentor);
    expect(after.beliefInterpretations.mentor).toBe(
      fixture.state.beliefInterpretations.mentor,
    );
    expect(after.eventLog[0]).toBe(fixture.state.eventLog[0]);
    expect(after.eventLog[3]).toBe(fixture.state.eventLog[3]);

    const request = createLedgerScopedRendererRegenerationRequest(
      {
        chapterNumber: 4,
        blueprint: {
          chapter_number: 4,
          title: "감시탑 상층 재정렬",
          arc_id: "arc-correction",
          one_liner: "인과 보정 후 영향을 받은 씬만 다시 쓴다.",
          role_in_arc: "rising_action",
          scenes: [
            {
              purpose: "서윤이 감시탑 벽면의 흔적을 살핀다.",
              type: "observation",
              characters: ["hero"],
              estimated_chars: 800,
              emotional_tone: "긴장",
            },
            {
              purpose: "서윤이 확보된 단서를 근거로 상층 수색을 시작한다.",
              type: "action",
              characters: ["hero"],
              estimated_chars: 1100,
              emotional_tone: "긴장",
            },
            {
              purpose: "서윤이 다시 발소리를 듣고 숨을 고른다.",
              type: "introspection",
              characters: ["hero"],
              estimated_chars: 700,
              emotional_tone: "불안",
            },
          ],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: ["hero"],
          tension_level: 6,
          target_word_count: 2600,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [],
        previousChapterEnding: "서윤은 아직 확정되지 않은 단서를 확신처럼 붙들고 있었다.",
        simulationState: after,
        worldStateProjection: [],
      },
      {
        ledger: patched.ledger.events,
        correctionPlan: plan,
        sceneTexts: fixture.originalSceneTexts,
        proseFailureContext: {
          summary: "보정된 ledger 기준으로 영향받은 씬 prose만 다시 써야 한다.",
          failedText: fixture.originalSceneTexts[1],
        },
      },
    );

    const stabilityReport = buildRendererProseStabilityReport({
      baselineScenes: request.snapshot.renderedScenes ?? [],
      finalSceneTexts: [
        fixture.originalSceneTexts[0],
        "서윤은 먼저 확보된 천문대 단서를 다시 떠올린 뒤에야 감시탑 상층으로 발을 옮겼다.",
        fixture.originalSceneTexts[2],
      ],
      regenerationScope: request.regenerationScope!,
    });

    expect(request.regenerationScope).toMatchObject({
      mode: "scoped_scene_patch",
      impactedSceneIds: ["scene_004_02"],
      preservedSceneIds: ["scene_004_01", "scene_004_03"],
      ledgerEventIds: ["evt-hero-move", "evt-secret"],
    });
    expect(stabilityReport).toMatchObject({
      mode: "scoped_scene_patch",
      byteStable: true,
      unrestrictedRewriteBlocked: true,
      impactedSceneIds: ["scene_004_02"],
      preservedSceneIds: ["scene_004_01", "scene_004_03"],
    });
    expect(
      stabilityReport.preservedSceneComparisons.every((comparison) => comparison.byteStable),
    ).toBe(true);
  });

  it("fails closed when a requested correction exceeds the approved ledger window", () => {
    const fixture = createFixture();
    const plan = buildRetroactiveCorrectionPlan({
      ledger: fixture.state.eventLog,
      failureReport: {
        code: "prerequisite_order_violation",
        eventId: "evt-hero-move",
        chapter: 4,
        episode: 4,
        referencedEventId: "evt-secret",
        prerequisiteId: "route-confirmed",
        message:
          "Prerequisite event \"evt-secret\" must appear before \"evt-hero-move\".",
      },
    });

    expect(() =>
      applySimulationEventLedgerPatch(fixture.state.eventLog, plan, [
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-patrol-note",
          fieldPath: "chapter",
          operation: "set",
          value: 9,
        },
      ])
    ).toThrowError(SimulationEventLedgerPatchError);

    try {
      applySimulationEventLedgerPatch(fixture.state.eventLog, plan, [
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-patrol-note",
          fieldPath: "chapter",
          operation: "set",
          value: 9,
        },
      ]);
    } catch (error) {
      const patchError = error as SimulationEventLedgerPatchError;
      expect(patchError.report.appliedEditCount).toBe(0);
      expect(patchError.report.blockedEdits).toEqual([
        expect.objectContaining({
          targetEventId: "evt-patrol-note",
          correctionWindowEventIds: ["evt-hero-move", "evt-secret"],
          reason: expect.stringContaining("outside the declared correction window"),
        }),
      ]);
    }

    expect(fixture.state.eventLog.map((event) => event.id)).toEqual([
      "evt-mentor-setup",
      "evt-hero-move",
      "evt-secret",
      "evt-patrol-note",
    ]);
    expect(fixture.state.eventLog[3]?.chapter).toBe(6);
  });
});
