import { describe, expect, it } from "vitest";
import {
  CharacterStateWriter,
  applyGeneratedDialogueScene,
  createSimulationState,
  listCharacterBeliefs,
  listCharacterMemories,
  listCharacterUtterances,
} from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";
import {
  causedBeliefLackOfInformation,
  causedMemoryDeception,
  createStateWithVaultSealFact,
} from "./fixtures/cognition-fixtures";

function makeSeed(): NovelSeed {
  return {
    title: "대사 상태 쓰기 테스트",
    logline: "대사가 기억과 믿음으로 연결된다.",
    total_chapters: 12,
    world: {
      name: "황궁",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        북회랑: "비밀이 오가는 통로",
      },
      factions: {},
      rules: ["진실은 직접 말해도 해석은 각자 다르다."],
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
          sample_dialogues: ["열쇠는 제가 봤어요."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락 귀족의 후계자",
        arc_summary: "진실을 직면한다",
        state: {
          level: null,
          location: "북회랑",
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
          sample_dialogues: ["증거가 필요해요."],
          personality_core: "현실적이고 민첩함",
        },
        backstory: "황궁 관리",
        arc_summary: "주인공을 돕는다",
        state: {
          level: null,
          location: "북회랑",
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

describe("sim character state writer", () => {
  it("writes generated dialogue into utterance, memory, and belief state", () => {
    const state = createSimulationState(makeSeed());
    const writer = new CharacterStateWriter();

    const result = writer.writeDialogueTurn(state, {
      characterId: "hero",
      chapter: 4,
      sceneId: "scene-4-vault",
      line: "열쇠는 황실 금고 안에 있어요.",
      audienceCharacterIds: ["ally"],
      intent: "정보 전달",
      cause: "직접 확인한 사실을 공유한다",
      relatedCharacterIds: ["ally"],
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-4-vault",
        eventId: "evt-4-vault-key",
        witnessCharacterIds: ["ally"],
        objectiveFactIds: ["fact:4:vault-key"],
      },
      memoryUpdates: [
        {
          characterId: "hero",
          summary: "세라는 자신이 직접 본 금고 열쇠 위치를 다시 확인한다.",
          objectiveFactIds: ["fact:4:vault-key"],
        },
        {
          characterId: "ally",
          summary: "리안은 세라에게서 열쇠 위치를 전해 듣는다.",
          cause: "세라의 직접 발화를 들었다",
          objectiveFactIds: ["fact:4:vault-key"],
        },
      ],
      beliefUpdates: [
        {
          characterId: "ally",
          kind: "deduction",
          subject: "황실 금고 경비",
          belief: "리안은 금고 경비가 이미 열쇠 위치를 감추려 한다고 본다.",
          cause: "세라의 보고와 최근 경비 교대 이상 징후를 연결한 해석",
          objectiveFactIds: ["fact:4:vault-key"],
        },
      ],
    });

    const heroUtterances = listCharacterUtterances(state.utterances, "hero", {
      sceneId: "scene-4-vault",
    });
    const allyMemories = listCharacterMemories(state.memories, "ally");
    const allyBeliefs = listCharacterBeliefs(state.beliefs, "ally", {
      activeOnly: true,
    });

    expect(result.utterance.id).toBe(heroUtterances[0]?.id);
    expect(result.memories).toHaveLength(2);
    expect(result.beliefs).toHaveLength(1);
    expect(heroUtterances[0]?.line).toBe("열쇠는 황실 금고 안에 있어요.");
    expect(heroUtterances[0]?.tags).toContain("utterance:dialogue_state");
    expect(allyMemories[0]?.references.utteranceIds).toEqual([result.utterance.id]);
    expect(allyMemories[0]?.kind).toBe("secondhand_report");
    expect(allyBeliefs[0]?.references.utteranceIds).toEqual([result.utterance.id]);
    expect(allyBeliefs[0]?.references.memoryIds).toEqual([allyMemories[0]!.id]);
  });

  it("writes full dialogue scenes through the reusable state-write API", () => {
    const state = createSimulationState(makeSeed());

    const result = applyGeneratedDialogueScene(state, {
      chapter: 5,
      sceneId: "scene-5-corridor",
      turns: [
        {
          characterId: "hero",
          line: "누군가 일부러 열쇠를 옮겼어요.",
          audienceCharacterIds: ["ally"],
          provenance: {
            source: "direct_scene_capture",
            sceneId: "scene-5-corridor",
            eventId: "evt-5-1",
            witnessCharacterIds: ["ally"],
            objectiveFactIds: [],
          },
          memoryUpdates: [
            {
              characterId: "ally",
              summary: "리안은 열쇠가 이동했다는 세라의 진술을 기억한다.",
            },
          ],
        },
        {
          characterId: "ally",
          line: "그럼 내부자가 있다는 뜻이군요.",
          audienceCharacterIds: ["hero"],
          provenance: {
            source: "direct_scene_capture",
            sceneId: "scene-5-corridor",
            eventId: "evt-5-2",
            witnessCharacterIds: ["hero"],
            objectiveFactIds: [],
          },
          beliefUpdates: [
            {
              characterId: "hero",
              kind: "interpretation",
              subject: "범인 범위",
              belief: "세라는 내부 협조자가 있다는 가설을 진지하게 받아들인다.",
              cause: "리안의 추론이 자신의 현장 단서와 맞아떨어진다",
            },
          ],
        },
      ],
    });

    const heroUtterances = listCharacterUtterances(state.utterances, "hero");
    const allyUtterances = listCharacterUtterances(state.utterances, "ally");
    const heroBeliefs = listCharacterBeliefs(state.beliefs, "hero", {
      activeOnly: true,
    });

    expect(result.utterances).toHaveLength(2);
    expect(result.memories).toHaveLength(1);
    expect(result.beliefs).toHaveLength(1);
    expect(heroUtterances[0]?.provenance.sceneTurn).toBe(0);
    expect(allyUtterances[0]?.provenance.sceneTurn).toBe(1);
    expect(heroBeliefs.at(-1)?.references.utteranceIds).toEqual([allyUtterances[0]!.id]);
  });

  it("defaults dialogue-driven writes to typed memories and auto-links metadata", () => {
    const state = createSimulationState(makeSeed());
    const writer = new CharacterStateWriter();

    const result = writer.writeDialogueTurn(state, {
      characterId: "hero",
      chapter: 6,
      sceneId: "scene-6-archive",
      line: "봉인은 제가 직접 풀었어요.",
      audienceCharacterIds: ["ally"],
      cause: "세라가 현장 결과를 설명한다",
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-6-archive",
        eventId: "evt-6-seal",
        witnessCharacterIds: ["ally"],
        objectiveFactIds: ["fact:6:seal-opened"],
      },
      memoryUpdates: [
        {
          characterId: "hero",
          summary: "세라는 자신이 봉인을 해제한 순간을 다시 떠올린다.",
        },
        {
          characterId: "ally",
          summary: "리안은 세라가 봉인을 직접 풀었다는 말을 듣는다.",
        },
      ],
      beliefUpdates: [
        {
          characterId: "ally",
          kind: "suspicion",
          subject: "세라의 숨김",
          belief: "리안은 세라가 봉인 해제 과정 일부를 감추고 있다고 의심한다.",
          cause: "세라가 결과만 강조하고 세부를 흐린다고 느낀다",
          memoryIds: ["memory:ally:prior"],
        },
      ],
    });

    const speakerMemory = result.memories[0];
    const listenerMemory = result.memories[1];
    const listenerBelief = result.beliefs[0];

    expect(result.utterance.provenance.sceneId).toBe("scene-6-archive");
    expect(result.utterance.provenance.witnessCharacterIds).toEqual(["ally"]);
    expect(result.utterance.provenance.objectiveFactIds).toEqual(["fact:6:seal-opened"]);
    expect(speakerMemory.kind).toBe("direct_experience");
    expect(speakerMemory.references.utteranceIds).toEqual([result.utterance.id]);
    expect(speakerMemory.references.relatedCharacterIds).toEqual(["ally"]);
    expect(listenerMemory.kind).toBe("secondhand_report");
    expect(listenerMemory.references.utteranceIds).toEqual([result.utterance.id]);
    expect(listenerMemory.references.relatedCharacterIds).toEqual(["hero"]);
    expect(listenerBelief.references.utteranceIds).toEqual([result.utterance.id]);
    expect(listenerBelief.references.objectiveFactIds).toEqual(["fact:6:seal-opened"]);
    expect(listenerBelief.references.memoryIds).toEqual([
      "memory:ally:prior",
      listenerMemory.id,
    ]);
    expect(listenerBelief.references.relatedCharacterIds).toEqual(["hero"]);
    expect(listenerBelief.tags).toContain("belief:dialogue");
  });

  it("records caused divergence in per-character memory and belief updates", () => {
    const { state, fact } = createStateWithVaultSealFact();
    const writer = new CharacterStateWriter();

    const result = writer.writeDialogueTurn(state, {
      characterId: "hero",
      chapter: 4,
      sceneId: "scene-4-vault",
      line: "금고는 이미 열렸어요.",
      audienceCharacterIds: ["ally"],
      cause: "세라가 리안을 다른 방향으로 유도한다",
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-4-vault",
        eventId: "evt-vault-rumor",
        witnessCharacterIds: ["ally"],
        objectiveFactIds: [fact.id],
      },
      memoryUpdates: [
        {
          characterId: "ally",
          summary: "리안은 세라의 말을 듣고 금고가 열렸다고 기억한다.",
          kind: "secondhand_report",
          truthAlignment: "distorted",
          divergenceCause: causedMemoryDeception(),
          objectiveFactIds: [fact.id],
        },
      ],
      beliefUpdates: [
        {
          characterId: "ally",
          kind: "interpretation",
          subject: "금고 상태",
          belief: "리안은 누군가 이미 봉인을 풀었다고 믿는다.",
          cause: "세라의 진술과 복도 소란을 결합해 해석했다.",
          canonicalAlignment: "contradicted",
          divergenceCause: causedBeliefLackOfInformation(),
          objectiveFactIds: [fact.id],
        },
      ],
    });

    expect(result.memories).toHaveLength(1);
    expect(result.beliefs).toHaveLength(1);
    expect(result.memories[0]?.truthAlignment).toBe("distorted");
    expect(result.memories[0]?.divergenceCause).toEqual(causedMemoryDeception());
    expect(result.beliefs[0]?.canonicalAlignment).toBe("contradicted");
    expect(result.beliefs[0]?.divergenceCause).toEqual(causedBeliefLackOfInformation());
    expect(result.beliefs[0]?.references.memoryIds).toEqual([result.memories[0]!.id]);
    expect(result.beliefs[0]?.references.objectiveFactIds).toEqual([fact.id]);
  });

  it("rejects unexplained divergent per-character memory and belief updates", () => {
    const writer = new CharacterStateWriter();

    const { state: memoryState, fact: memoryFact } = createStateWithVaultSealFact();
    expect(() =>
      writer.writeDialogueTurn(memoryState, {
        characterId: "hero",
        chapter: 4,
        sceneId: "scene-4-vault",
        line: "금고는 이미 열렸어요.",
        audienceCharacterIds: ["ally"],
        provenance: {
          source: "direct_scene_capture",
          sceneId: "scene-4-vault",
          eventId: "evt-vault-rumor",
          witnessCharacterIds: ["ally"],
          objectiveFactIds: [memoryFact.id],
        },
        memoryUpdates: [
          {
            characterId: "ally",
            summary: "리안은 금고가 열렸다고 기억한다.",
            kind: "secondhand_report",
            truthAlignment: "distorted",
            objectiveFactIds: [memoryFact.id],
          },
        ],
      })
    ).toThrowError(/requires an explicit cause record/);

    const { state: beliefState, fact: beliefFact } = createStateWithVaultSealFact();
    expect(() =>
      writer.writeDialogueTurn(beliefState, {
        characterId: "hero",
        chapter: 4,
        sceneId: "scene-4-vault",
        line: "금고는 이미 열렸어요.",
        audienceCharacterIds: ["ally"],
        provenance: {
          source: "direct_scene_capture",
          sceneId: "scene-4-vault",
          eventId: "evt-vault-rumor",
          witnessCharacterIds: ["ally"],
          objectiveFactIds: [beliefFact.id],
        },
        beliefUpdates: [
          {
            characterId: "ally",
            kind: "suspicion",
            subject: "금고 봉인",
            belief: "리안은 누군가 이미 금고를 열었다고 믿는다.",
            cause: "세라의 발화를 그대로 사실로 받아들였다.",
            canonicalAlignment: "contradicted",
            objectiveFactIds: [beliefFact.id],
          },
        ],
      })
    ).toThrowError(/requires an explicit cause record/);
  });

  it("rejects canonical mismatches on utterance, memory, and belief writes immediately", () => {
    const writer = new CharacterStateWriter();

    const { state: utteranceState, fact: utteranceFact } = createStateWithVaultSealFact();
    expect(() =>
      writer.writeDialogueTurn(utteranceState, {
        characterId: "hero",
        chapter: 4,
        sceneId: "scene-4-vault",
        line: "문은 이미 열렸어요.",
        audienceCharacterIds: ["ally"],
        provenance: {
          source: "direct_scene_capture",
          sceneId: "scene-4-vault",
          eventId: "evt-vault-rumor",
          witnessCharacterIds: ["ally"],
          objectiveFactIds: [utteranceFact.id],
        },
      })
    ).toThrowError(/Immediate utterance write rejected/);
    expect(utteranceState.utterances.hero.timeline).toEqual([]);

    const { state: memoryState, fact: memoryFact } = createStateWithVaultSealFact();
    expect(() =>
      writer.writeDialogueTurn(memoryState, {
        characterId: "hero",
        chapter: 4,
        sceneId: "scene-4-vault",
        line: "봉인 기록부터 확인해요.",
        audienceCharacterIds: ["ally"],
        provenance: {
          source: "direct_scene_capture",
          sceneId: "scene-4-vault",
          eventId: "evt-vault-rumor",
          witnessCharacterIds: ["ally"],
          objectiveFactIds: [],
        },
        memoryUpdates: [
          {
            characterId: "ally",
            summary: "리안은 금고가 이미 열렸다고 기억한다.",
            kind: "secondhand_report",
            objectiveFactIds: [memoryFact.id],
          },
        ],
      })
    ).toThrowError(/Immediate memory write rejected/);
    expect(memoryState.memories.ally.timeline).toEqual([]);
    expect(memoryState.utterances.hero.timeline).toEqual([]);

    const { state: beliefState, fact: beliefFact } = createStateWithVaultSealFact();
    expect(() =>
      writer.writeDialogueTurn(beliefState, {
        characterId: "hero",
        chapter: 4,
        sceneId: "scene-4-vault",
        line: "봉인 기록부터 확인해요.",
        audienceCharacterIds: ["ally"],
        provenance: {
          source: "direct_scene_capture",
          sceneId: "scene-4-vault",
          eventId: "evt-vault-rumor",
          witnessCharacterIds: ["ally"],
          objectiveFactIds: [],
        },
        beliefUpdates: [
          {
            characterId: "ally",
            kind: "interpretation",
            subject: "세라의 위치",
            belief: "리안은 세라가 아직 황궁에 있다고 믿는다.",
            cause: "이전 동선을 더 신뢰하며 장면을 잘못 해석한다.",
            objectiveFactIds: [beliefFact.id],
          },
        ],
      })
    ).toThrowError(/Immediate belief write rejected/);
    expect(beliefState.beliefs.ally.timeline).toEqual([]);
    expect(beliefState.utterances.hero.timeline).toEqual([]);
  });
});
