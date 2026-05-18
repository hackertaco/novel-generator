import { describe, expect, it } from "vitest";

import type { NovelSeed } from "@/lib/schema/novel";
import {
  addCharacterBelief,
  addCharacterBeliefInterpretation,
  addCharacterUtterance,
  createSimulationState,
  listCharacterBeliefInterpretations,
  listCharacterBeliefs,
  listCharacterMemories,
  reconcileSimulationContinuityArtifacts,
  SimulationEventLedger,
} from "@/lib/sim";

function makeSeed(): NovelSeed {
  return {
    title: "연속성 재계산 테스트",
    logline: "단서 순서가 수정된 뒤 필요한 인지 상태만 재정렬한다.",
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

describe("continuity reconciliation", () => {
  it("recomputes only replay-dependent continuity artifacts and preserves unrelated world-state", () => {
    const eventLedger = new SimulationEventLedger();
    let state = createSimulationState(makeSeed());

    state = eventLedger.applyEvent(state, {
      id: "evt-mentor-setup",
      chapter: 1,
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
    state = eventLedger.applyEvent(state, {
      id: "evt-hero-move",
      chapter: 4,
      type: "move",
      actorId: "hero",
      location: "운하탑 상층",
      summary: "서윤이 감시탑 상층으로 이동한다.",
    });
    state = eventLedger.applyEvent(state, {
      id: "evt-secret",
      chapter: 5,
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

    const mentorMemory = listCharacterMemories(state.memories, "mentor").at(-1);
    expect(mentorMemory).toBeDefined();

    const mentorBelief = addCharacterBelief(state.beliefs, {
      characterId: "mentor",
      chapter: 1,
      kind: "deduction",
      subject: "감시 일지",
      belief: "하진은 감시 일지가 여전히 증거로 유효하다고 믿는다.",
      cause: "직접 기록한 단서를 여전히 신뢰한다.",
      references: {
        eventId: "evt-mentor-setup",
        objectiveFactIds: mentorMemory!.references.objectiveFactIds,
        memoryIds: [mentorMemory!.id],
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
      sourceMemoryIds: [mentorMemory!.id],
      producedBeliefIds: [mentorBelief.id],
      references: {
        eventId: "evt-mentor-setup",
        objectiveFactIds: mentorBelief.references.objectiveFactIds,
      },
      tags: ["interpretation:mentor-anchor"],
    });

    const allySecretMemory = listCharacterMemories(state.memories, "ally").find(
      (memory) => memory.references.eventId === "evt-secret",
    );
    const allySecretBelief = listCharacterBeliefs(state.beliefs, "ally", {
      activeOnly: true,
    }).find((belief) => belief.references.eventId === "evt-secret");
    expect(allySecretMemory).toBeDefined();
    expect(allySecretBelief).toBeDefined();

    addCharacterBeliefInterpretation(state.beliefInterpretations, {
      characterId: "ally",
      chapter: 5,
      kind: "suspicion",
      subject: allySecretBelief!.subject,
      belief: allySecretBelief!.belief,
      cause: "공유된 단서를 천문대 수색 계획으로 해석했다.",
      sourceMemoryIds: [allySecretMemory!.id],
      producedBeliefIds: [allySecretBelief!.id],
      references: {
        eventId: "evt-secret",
        objectiveFactIds: allySecretBelief!.references.objectiveFactIds,
        memoryIds: [allySecretMemory!.id],
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
        objectiveFactIds: mentorMemory!.references.objectiveFactIds,
      },
      tags: ["utterance:mentor-anchor"],
    });

    const before = state;
    const beforeHeroMoveMemory = listCharacterMemories(before.memories, "hero").find(
      (memory) => memory.references.eventId === "evt-hero-move",
    );
    const beforeHeroSecretMemory = listCharacterMemories(before.memories, "hero").find(
      (memory) => memory.references.eventId === "evt-secret",
    );
    expect(beforeHeroMoveMemory).toBeDefined();
    expect(beforeHeroSecretMemory).toBeDefined();

    const correctedLedger = [
      before.eventLog[0]!,
      {
        ...before.eventLog[2]!,
        chapter: 2,
        episode: 2,
      },
      {
        ...before.eventLog[1]!,
        chapter: 4,
        episode: 4,
      },
    ];

    const result = reconcileSimulationContinuityArtifacts(before, correctedLedger, {
      replayScope: {
        startIndex: 1,
        endIndex: 2,
        startEventId: "evt-secret",
        endEventId: "evt-hero-move",
        startEpisode: 2,
        endEpisode: 4,
        eventIds: ["evt-secret", "evt-hero-move"],
        dependentEventIds: ["evt-hero-move"],
        impactedStateKeys: ["character:hero:location"],
        reason: "Secret-clue repair requires replaying the moved downstream beat.",
      },
    });

    const after = result.state;
    const afterHeroMemories = listCharacterMemories(after.memories, "hero");
    const afterAllySecretMemory = listCharacterMemories(after.memories, "ally").find(
      (memory) => memory.id === allySecretMemory!.id,
    );
    const afterAllySecretBelief = listCharacterBeliefs(after.beliefs, "ally", {
      activeOnly: true,
    }).find((belief) => belief.id === allySecretBelief!.id);
    const afterAllyInterpretation = listCharacterBeliefInterpretations(
      after.beliefInterpretations,
      "ally",
      { activeOnly: true },
    ).find((record) => record.references.eventId === "evt-secret");

    expect(result.report.updatedMemoryIds).toEqual(
      expect.arrayContaining([beforeHeroSecretMemory!.id, allySecretMemory!.id]),
    );
    expect(result.report.updatedBeliefIds).toEqual(
      expect.arrayContaining([allySecretBelief!.id]),
    );
    expect(result.report.updatedInterpretationIds).toEqual(
      expect.arrayContaining([afterAllyInterpretation!.id]),
    );
    expect(result.report.reorderedMemoryCharacters).toContain("hero");

    expect(afterHeroMemories.map((memory) => memory.references.eventId)).toEqual([
      "evt-secret",
      "evt-hero-move",
    ]);
    expect(afterHeroMemories[0]?.chapter).toBe(2);
    expect(afterAllySecretMemory?.chapter).toBe(2);
    expect(afterAllySecretBelief?.chapter).toBe(2);
    expect(afterAllySecretBelief?.references.memoryIds).toEqual([allySecretMemory!.id]);
    expect(afterAllyInterpretation?.chapter).toBe(2);
    expect(afterAllyInterpretation?.sourceMemoryIds).toEqual([allySecretMemory!.id]);
    expect(after.eventLog.map((event) => event.id)).toEqual([
      "evt-mentor-setup",
      "evt-secret",
      "evt-hero-move",
    ]);

    expect(after.objectiveFacts).toBe(before.objectiveFacts);
    expect(after.characters).toBe(before.characters);
    expect(after.utterances).toBe(before.utterances);
    expect(after.foreshadowRegistry).toBe(before.foreshadowRegistry);
    expect(after.threads).toBe(before.threads);
    expect(after.memories.mentor).toBe(before.memories.mentor);
    expect(after.beliefs.mentor).toBe(before.beliefs.mentor);
    expect(after.beliefInterpretations.mentor).toBe(before.beliefInterpretations.mentor);
    expect(after.eventLog[0]).toBe(before.eventLog[0]);
    expect(after.eventLog[1]).not.toBe(before.eventLog[2]);
    expect(after.eventLog[2]).not.toBe(before.eventLog[1]);
  });
});
