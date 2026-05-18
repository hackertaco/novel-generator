import { describe, expect, it } from "vitest";
import {
  addCharacterBelief,
  addCharacterMemory,
  createSimulationState,
  createWorldStateAuthority,
  listCharacterBeliefs,
  listCharacterBeliefInterpretations,
  listCharacterUtterances,
  recomputeSimulationBeliefsFromMemories,
} from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";

function makeSeed(): NovelSeed {
  return {
    title: "믿음 재계산 테스트",
    logline: "기억에서 다시 믿음을 계산한다.",
    total_chapters: 20,
    world: {
      name: "황궁",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        황궁: "권력의 중심",
        북회랑: "비밀 통로",
      },
      factions: {},
      rules: ["사실과 해석은 구분되어야 한다."],
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
          sample_dialogues: ["지금은 더 봐야 해요."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락 귀족의 후계자",
        arc_summary: "진실을 직면한다",
        internal_arc: {
          want: "북회랑의 비밀을 밝힌다",
          need: "타인을 믿는 법을 배운다",
          misbelief: "혼자 움직여야만 안전하다",
        },
        state: {
          level: null,
          location: "황궁",
          status: "normal",
          relationships: { ally: "경계" },
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
          sample_dialogues: ["그건 이상하네요."],
          personality_core: "현실적이고 민첩함",
        },
        backstory: "황궁 관리",
        arc_summary: "세라를 돕는다",
        state: {
          level: null,
          location: "황궁",
          status: "normal",
          relationships: { hero: "경계" },
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

describe("sim belief recomputation", () => {
  it("rebuilds scoped memory-derived beliefs without disturbing unrelated belief history", () => {
    const state = createSimulationState(makeSeed());
    const heroEarlyMemory = addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 3,
      kind: "direct_experience",
      summary: "세라는 북회랑 경비가 비는 순간을 직접 본다.",
      references: {
        eventId: "evt-3-gap",
        objectiveFactIds: ["fact:guard-gap"],
        utteranceIds: ["utt:hero:3"],
        relatedCharacterIds: ["ally"],
      },
      tags: ["memory:corridor"],
    });
    const heroScopedMemory = addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 5,
      kind: "secondhand_report",
      summary: "세라는 리안이 금고 도면을 숨겼다는 보고를 듣는다.",
      references: {
        eventId: "evt-5-blueprint",
        objectiveFactIds: ["fact:blueprint"],
        utteranceIds: ["utt:ally:5"],
        relatedCharacterIds: ["ally"],
      },
      tags: ["memory:vault"],
    });

    const retainedBelief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 3,
      kind: "suspicion",
      subject: "북회랑 경비",
      belief: "세라는 누군가 경비 공백을 의도적으로 만들었다고 의심한다.",
      cause: "직접 본 순찰 공백을 수상하게 여긴다",
      references: {
        eventId: "evt-3-gap",
        objectiveFactIds: ["fact:guard-gap"],
        memoryIds: [heroEarlyMemory.id],
        utteranceIds: ["utt:hero:3"],
        relatedCharacterIds: ["ally"],
      },
      tags: ["belief:preexisting"],
    });
    const scopedBelief = addCharacterBelief(state.beliefs, {
      characterId: "hero",
      chapter: 5,
      kind: "deduction",
      subject: "리안의 의도",
      belief: "세라는 리안이 도면을 숨겼다고 믿는다.",
      cause: "불완전한 보고를 그대로 받아들였다",
      references: {
        eventId: "evt-5-blueprint",
        objectiveFactIds: ["fact:blueprint"],
        memoryIds: [heroScopedMemory.id],
        utteranceIds: ["utt:ally:5"],
        relatedCharacterIds: ["ally"],
      },
      tags: ["belief:stale"],
    });

    const result = recomputeSimulationBeliefsFromMemories(state, {
      characterId: "hero",
      scope: {
        chapterRange: { start: 5 },
      },
      deriveBeliefs: ({ currentBeliefs, memory }) => ({
        kind: "interpretation",
        subject: "리안의 의도",
        belief: `세라는 ${memory.summary} 뒤에 더 큰 압박이 있었다고 본다.`,
        cause: `${currentBeliefs.length}개의 기존 믿음을 유지한 채 보고를 재해석한다`,
        references: {
          objectiveFactIds: ["fact:pressure"],
        },
        tags: ["belief:recomputed"],
      }),
    });

    const heroBeliefs = listCharacterBeliefs(state.beliefs, "hero");
    const heroInterpretations = listCharacterBeliefInterpretations(
      state.beliefInterpretations,
      "hero",
    );

    expect(result.selectedMemoryIds).toEqual([heroScopedMemory.id]);
    expect(result.removedBeliefIds).toEqual([scopedBelief.id]);
    expect(result.createdBeliefs).toHaveLength(1);
    expect(result.createdInterpretations).toHaveLength(1);
    expect(result.invalidatedInterpretationIds).toEqual([]);
    expect(heroBeliefs.map((belief) => belief.id)).toContain(retainedBelief.id);
    expect(heroBeliefs.some((belief) => belief.tags.includes("belief:seed"))).toBe(true);
    expect(heroBeliefs.some((belief) => belief.belief === scopedBelief.belief)).toBe(false);
    expect(result.createdBeliefs[0]).toMatchObject({
      characterId: "hero",
      chapter: 5,
      kind: "interpretation",
      subject: "리안의 의도",
      references: {
        eventId: "evt-5-blueprint",
        memoryIds: [heroScopedMemory.id],
        objectiveFactIds: ["fact:blueprint", "fact:pressure"],
        utteranceIds: ["utt:ally:5"],
        relatedCharacterIds: ["ally"],
      },
    });
    expect(result.createdBeliefs[0]?.tags).toEqual(
      expect.arrayContaining(["belief:memory-derived", "belief:recomputed"]),
    );
    expect(heroInterpretations).toEqual([
      expect.objectContaining({
        characterId: "hero",
        chapter: 5,
        sourceMemoryIds: [heroScopedMemory.id],
        producedBeliefIds: [result.createdBeliefs[0]?.id],
        status: "active",
        references: expect.objectContaining({
          memoryIds: [heroScopedMemory.id],
        }),
      }),
    ]);
  });

  it("recomputes through the shared authority without mutating event history or prose stores", () => {
    const authority = createWorldStateAuthority(makeSeed());

    authority.applyEvent({
      id: "evt-2-move",
      chapter: 2,
      type: "move",
      actorId: "hero",
      location: "북회랑",
      summary: "세라가 북회랑으로 이동한다.",
    });

    const dialogueResult = authority.applyDialogueScene({
      chapter: 4,
      sceneId: "scene-4-briefing",
      turns: [
        {
          characterId: "hero",
          line: "도면은 아직 공개되지 않았어요.",
          audienceCharacterIds: ["ally"],
          provenance: {
            source: "direct_scene_capture",
            sceneId: "scene-4-briefing",
            eventId: "evt-4-briefing",
            witnessCharacterIds: ["ally"],
            objectiveFactIds: ["fact:4:blueprint"],
          },
          memoryUpdates: [
            {
              characterId: "ally",
              summary: "리안은 세라에게서 도면이 공개되지 않았다는 말을 듣는다.",
              objectiveFactIds: ["fact:4:blueprint"],
            },
          ],
          beliefUpdates: [
            {
              characterId: "ally",
              kind: "suspicion",
              subject: "세라의 의도",
              belief: "리안은 세라가 도면 일부를 숨긴다고 의심한다.",
              cause: "직접 들은 보고를 의심스럽게 받아들였다",
              objectiveFactIds: ["fact:4:blueprint"],
            },
          ],
        },
      ],
    });

    const stateBefore = authority.getSimulationState();
    const eventLogRef = stateBefore.eventLog;
    const objectiveFactsRef = stateBefore.objectiveFacts;
    const utterancesRef = stateBefore.utterances;
    const staleBeliefId = dialogueResult.beliefs[0]!.id;
    const sourceMemoryId = dialogueResult.memories[0]!.id;

    const result = authority.recomputeBeliefsFromMemories({
      characterId: "ally",
      scope: {
        memoryIds: [sourceMemoryId],
      },
      deriveBeliefs: ({ memory }) => ({
        kind: "interpretation",
        subject: "세라의 의도",
        belief: `리안은 ${memory.summary} 때문에 세라가 외부 압박을 받고 있다고 본다.`,
        cause: "기존 오해를 버리고 기억의 맥락을 다시 해석했다",
        tags: ["belief:authority-recomputed"],
      }),
    });

    const stateAfter = authority.getSimulationState();
    const allyBeliefs = listCharacterBeliefs(stateAfter.beliefs, "ally", {
      activeOnly: true,
    });

    expect(result.removedBeliefIds).toEqual([staleBeliefId]);
    expect(result.createdBeliefs).toHaveLength(1);
    expect(stateAfter.eventLog).toBe(eventLogRef);
    expect(stateAfter.objectiveFacts).toBe(objectiveFactsRef);
    expect(stateAfter.utterances).toBe(utterancesRef);
    expect(stateAfter.eventLog.map((event) => event.id)).toEqual(["evt-2-move"]);
    expect(listCharacterUtterances(stateAfter.utterances, "hero")[0]?.line).toBe(
      "도면은 아직 공개되지 않았어요.",
    );
    expect(allyBeliefs.some((belief) => belief.belief === dialogueResult.beliefs[0]?.belief)).toBe(false);
    expect(result.createdBeliefs[0]?.references.memoryIds).toEqual([sourceMemoryId]);
    expect(result.createdBeliefs[0]?.tags).toEqual(
      expect.arrayContaining(["belief:memory-derived", "belief:authority-recomputed"]),
    );
  });

  it("invalidates stale interpretation artifacts while preserving source memories for recompute", () => {
    const state = createSimulationState(makeSeed());
    const sourceMemory = addCharacterMemory(state.memories, {
      characterId: "hero",
      chapter: 6,
      kind: "secondhand_report",
      summary: "세라는 수상한 배달부가 북회랑 비밀번호를 언급했다는 보고를 듣는다.",
      references: {
        eventId: "evt-6-password",
        objectiveFactIds: ["fact:password"],
        relatedCharacterIds: ["ally"],
      },
      tags: ["memory:password"],
    });

    const firstPass = recomputeSimulationBeliefsFromMemories(state, {
      characterId: "hero",
      scope: {
        memoryIds: [sourceMemory.id],
      },
      deriveBeliefs: ({ memory }) => ({
        kind: "suspicion",
        subject: "배달부의 정체",
        belief: `${memory.summary} 때문에 세라는 배달부가 황실 첩자라고 의심한다.`,
        cause: "전달된 기억을 사실에 가깝게 받아들였다",
        tags: ["belief:first-pass"],
      }),
    });

    const secondPass = recomputeSimulationBeliefsFromMemories(state, {
      characterId: "hero",
      scope: {
        memoryIds: [sourceMemory.id],
      },
      deriveBeliefs: ({ memory }) => ({
        kind: "interpretation",
        subject: "배달부의 정체",
        belief: `${memory.summary} 때문에 세라는 배달부가 함정을 유도하는 미끼라고 본다.`,
        cause: "같은 기억을 다시 해석해 첫 번째 추정을 폐기했다",
        tags: ["belief:second-pass"],
      }),
    });

    const heroMemories = state.memories.hero.byId;
    const heroInterpretations = listCharacterBeliefInterpretations(
      state.beliefInterpretations,
      "hero",
    );
    const invalidated = heroInterpretations.find(
      (record) => record.id === firstPass.createdInterpretations[0]?.id,
    );
    const active = heroInterpretations.find(
      (record) => record.id === secondPass.createdInterpretations[0]?.id,
    );

    expect(heroMemories[sourceMemory.id]).toMatchObject({
      id: sourceMemory.id,
      summary: "세라는 수상한 배달부가 북회랑 비밀번호를 언급했다는 보고를 듣는다.",
      tags: ["memory:password"],
    });
    expect(secondPass.removedBeliefIds).toEqual([firstPass.createdBeliefs[0]!.id]);
    expect(secondPass.invalidatedInterpretationIds).toEqual([
      firstPass.createdInterpretations[0]!.id,
    ]);
    expect(invalidated).toMatchObject({
      status: "invalidated",
      sourceMemoryIds: [sourceMemory.id],
      producedBeliefIds: [firstPass.createdBeliefs[0]!.id],
      invalidation: {
        chapter: 6,
        reason: "Belief interpretation recomputed from source memories",
        replacementInterpretationIds: [secondPass.createdInterpretations[0]!.id],
      },
    });
    expect(active).toMatchObject({
      status: "active",
      sourceMemoryIds: [sourceMemory.id],
      producedBeliefIds: [secondPass.createdBeliefs[0]!.id],
    });
  });
});
