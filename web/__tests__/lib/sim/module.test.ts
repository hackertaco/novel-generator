import { describe, expect, it } from "vitest";
import {
  buildSimulationPromptContext,
  createSimulationState,
  listCharacterBeliefs,
  listCharacterMemories,
  listObjectiveFacts,
  SimulationEventLedger,
} from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";

function makeSeed(): NovelSeed {
  return {
    title: "테스트 소설",
    logline: "주인공이 비밀을 추적한다.",
    total_chapters: 30,
    world: {
      name: "제국",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        황궁: "권력의 중심",
        북회랑: "비밀 통로가 있는 장소",
      },
      factions: {
        황실: "황궁 권력",
      },
      rules: ["황명 없이는 북회랑 출입 금지"],
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
          sample_dialogues: ["정말 그랬어요?"],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락한 귀족가의 후계자",
        arc_summary: "진실을 직면한다",
        internal_arc: {
          want: "북회랑의 진실을 밝힌다",
          need: "타인을 믿고 협력해야 한다",
          misbelief: "혼자 움직여야만 배신당하지 않는다",
        },
        state: {
          level: null,
          location: "황궁",
          status: "normal",
          relationships: { ally: "경계" },
          inventory: ["은열쇠"],
          secrets_known: ["북회랑 지도"],
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
          sample_dialogues: ["빨리 움직이죠."],
          personality_core: "현실적이고 민첩함",
        },
        backstory: "황궁 하급 관리",
        arc_summary: "주인공을 돕는다",
        relationship_facts: [
          {
            target: "hero",
            kinship: "none",
            service: "none",
            romance_role: "none",
            public_face: "formal",
            private_truth: "trusting",
            trust_level: 1,
            forbidden_register: [],
            preferred_patterns: [],
          },
        ],
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
      formatting_rules: ["짧은 문단"],
    },
    story_threads: [
      {
        id: "conspiracy",
        name: "북회랑 음모",
        type: "main",
        description: "북회랑에서 벌어진 음모를 추적한다",
        relations: [],
        reveal_timeline: [],
      },
    ],
  };
}

describe("sim module", () => {
  it("boots a canonical simulation state from a novel seed", () => {
    const seed = makeSeed();
    seed.foreshadowing.push({
      id: "fs_red_mark",
      name: "붉은 낙인",
      description: "붉은 낙인의 정체가 황실 금서 사건과 연결된다는 사실이 밝혀진다.",
      canonical_target: "붉은 낙인의 정체",
      importance: "normal",
      planted_at: 2,
      hints_at: [],
      reveal_at: 16,
      origin: {
        episode_id: "ep_002",
        scene_id: "scene_002_01",
        source_span: {
          start_offset: 0,
          end_offset: 20,
          excerpt: "세라의 손등에 붉은 낙인이 번진다.",
        },
      },
      linked_hint_occurrences: [],
      verification_metadata: {
        source_episode_ids: [],
        source_scene_ids: [],
        source_occurrence_count: 0,
        shared_target_summary: "",
      },
      status: "pending",
      hint_count: 0,
      resolution: {
        status: "unresolved",
        cause: { revealed: false, chapter: null, evidence: [] },
        identity: { revealed: false, chapter: null, evidence: [] },
        consequence: { revealed: false, chapter: null, evidence: [] },
      },
    });

    const state = createSimulationState(seed);
    const activeFacts = listObjectiveFacts(state.objectiveFacts, { activeOnly: true });

    expect(state.seedTitle).toBe("테스트 소설");
    expect(state.characters.hero.location).toBe("황궁");
    expect(state.memories.hero.timeline).toEqual([]);
    expect(state.beliefInterpretations.hero.timeline).toEqual([]);
    expect(state.utterances.hero.timeline).toEqual([]);
    expect(state.characters.hero.secretsKnown).toContain("북회랑 지도");
    expect(listCharacterBeliefs(state.beliefs, "hero", { activeOnly: true })[0]?.belief)
      .toBe("혼자 움직여야만 배신당하지 않는다");
    expect(state.foreshadowRegistry.timeline).toEqual(["fs_red_mark"]);
    expect(state.foreshadowRegistry.byId.fs_red_mark).toMatchObject({
      registrationEpisode: 2,
      registrationSceneId: "scene_002_01",
      resolutionDeadlineEpisode: 82,
      expectedPayoffConditions: {
        promise: "붉은 낙인의 정체가 황실 금서 사건과 연결된다는 사실이 밝혀진다.",
        canonicalTarget: "붉은 낙인의 정체",
        earliestPayoffEpisode: 16,
        plannedRevealEpisode: 16,
      },
    });
    expect(state.threads.conspiracy.title).toBe("북회랑 음모");
    expect(activeFacts.some((fact) => fact.summary.includes("황명 없이는 북회랑 출입 금지"))).toBe(true);
    expect(activeFacts.some((fact) => fact.category === "character_location" && fact.subject === "세라" && fact.object === "황궁")).toBe(true);
  });

  it("applies events as state transitions", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());

    const afterMove = ledger.applyEvent(initial, {
      id: "evt-1",
      chapter: 2,
      type: "move",
      actorId: "hero",
      location: "북회랑",
      summary: "세라가 북회랑으로 이동한다.",
    });
    expect(afterMove.characters.hero.location).toBe("북회랑");
    expect(afterMove.memories.hero.timeline).toHaveLength(1);
    expect(afterMove.memories.hero.byId[afterMove.memories.hero.timeline[0]]?.summary).toBe("세라가 북회랑으로 이동한다.");
    const locationFacts = listObjectiveFacts(afterMove.objectiveFacts, {
      subject: "세라",
      predicate: "is_at",
      category: "character_location",
    });
    expect(locationFacts).toHaveLength(2);
    expect(locationFacts[0].validToChapter).toBe(2);
    expect(locationFacts[1].object).toBe("북회랑");

    const afterFact = ledger.applyEvent(afterMove, {
      id: "evt-2",
      chapter: 2,
      type: "learn_fact",
      actorId: "hero",
      summary: "북회랑 열쇠는 황실 금고에 있다.",
      payload: {
        fact: "북회랑 열쇠는 황실 금고에 있다.",
        recipients: ["hero", "ally"],
        visibility: "audience",
        subject: "북회랑 열쇠",
        predicate: "is_hidden_in",
        object: "황실 금고",
      },
    });
    expect(afterFact.characters.ally.secretsKnown).toContain("북회랑 열쇠는 황실 금고에 있다.");
    expect(afterFact.audienceKnowledge).toContain("북회랑 열쇠는 황실 금고에 있다.");
    expect(listCharacterBeliefs(afterFact.beliefs, "ally")).toHaveLength(0);
    const allyMemoryIds = afterFact.memories.ally.timeline;
    expect(allyMemoryIds).toHaveLength(1);
    const allyMemory = afterFact.memories.ally.byId[allyMemoryIds[0]];
    expect(allyMemory?.kind).toBe("secondhand_report");
    expect(allyMemory?.references.eventId).toBe("evt-2");
    const learnedFact = listObjectiveFacts(afterFact.objectiveFacts, {
      category: "discovery",
      limit: 1,
    })[0];
    expect(learnedFact.subject).toBe("북회랑 열쇠");
    expect(learnedFact.predicate).toBe("is_hidden_in");
    expect(learnedFact.object).toBe("황실 금고");

    const afterRelation = ledger.applyEvent(afterFact, {
      id: "evt-3",
      chapter: 2,
      type: "relationship_shift",
      actorId: "hero",
      targetId: "ally",
      summary: "세라가 리안을 신뢰하기 시작한다.",
      payload: {
        label: "경계 -> 신뢰",
        trustDelta: 1,
      },
    });
    expect(afterRelation.characters.hero.relationships.ally).toBe("경계 -> 신뢰");
    expect(afterRelation.beliefs.hero.trustByCharacter.ally).toBe(1);
    expect(
      listObjectiveFacts(afterRelation.objectiveFacts, {
        category: "relationship",
        activeOnly: true,
      })[0]?.object,
    ).toBe("경계 -> 신뢰");
  });

  it("links event-driven writes with correct memory typing and fact metadata", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());

    const afterFact = ledger.applyEvent(initial, {
      id: "evt-knowledge-1",
      chapter: 3,
      type: "learn_fact",
      actorId: "hero",
      summary: "황실 인장은 위조품이다.",
      payload: {
        fact: "황실 인장은 위조품이다.",
        recipients: ["hero", "ally"],
        visibility: "shared",
        subject: "황실 인장",
        predicate: "is",
        object: "위조품",
      },
    });

    const learnedFact = listObjectiveFacts(afterFact.objectiveFacts, {
      category: "discovery",
      subject: "황실 인장",
      predicate: "is",
      object: "위조품",
      activeOnly: true,
    })[0];
    const heroMemory = listCharacterMemories(afterFact.memories, "hero").at(-1);
    const allyMemory = listCharacterMemories(afterFact.memories, "ally").at(-1);

    expect(initial.memories.hero.timeline).toEqual([]);
    expect(afterFact.eventLog.at(-1)?.id).toBe("evt-knowledge-1");
    expect(learnedFact?.sourceEventId).toBe("evt-knowledge-1");
    expect(heroMemory?.kind).toBe("direct_experience");
    expect(allyMemory?.kind).toBe("secondhand_report");
    expect(heroMemory?.references.eventId).toBe("evt-knowledge-1");
    expect(heroMemory?.references.objectiveFactIds).toEqual([learnedFact!.id]);
    expect(heroMemory?.references.relatedCharacterIds).toEqual([]);
    expect(heroMemory?.tags).toContain("event:learn_fact");
    expect(allyMemory?.references.objectiveFactIds).toEqual([learnedFact!.id]);
    expect(allyMemory?.references.relatedCharacterIds).toEqual(["hero"]);
    expect(allyMemory?.tags).toContain("event:learn_fact");
  });

  it("derives memory and belief updates from story events with explicit divergence records", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());

    const afterMove = ledger.applyEvent(initial, {
      id: "evt-4-hidden-passage",
      chapter: 4,
      type: "move",
      actorId: "hero",
      location: "북회랑 비밀문",
      summary: "세라가 비밀문 안으로 사라진다.",
      cognition: {
        memoryUpdates: [
          {
            characterId: "ally",
            kind: "direct_experience",
            summary: "리안은 세라가 북회랑 끝에서 함정에 빠졌다고 잘못 기억한다.",
            truthAlignment: "distorted",
            divergenceCause: {
              kind: "misunderstanding",
              summary: "리안은 닫히는 비밀문을 함정 붕괴로 오인했다.",
              sourceEventId: "evt-4-hidden-passage",
            },
            relatedCharacterIds: ["hero"],
            tags: ["memory:misread-scene"],
          },
        ],
        beliefUpdates: [
          {
            characterId: "ally",
            kind: "suspicion",
            subject: "세라의 의도",
            belief: "리안은 세라가 자신을 따돌리기 위해 일부러 사라졌다고 믿는다.",
            cause: "방금 본 장면과 세라의 이전 독단을 연결한 해석",
            canonicalAlignment: "contradicted",
            divergenceCause: {
              kind: "lack_of_information",
              summary: "리안은 비밀문 존재를 보지 못해 탈출 경로를 알지 못한다.",
              sourceEventId: "evt-4-hidden-passage",
            },
            tags: ["belief:wrong-theory"],
          },
        ],
      },
    });

    const locationFact = listObjectiveFacts(afterMove.objectiveFacts, {
      subject: "세라",
      predicate: "is_at",
      category: "character_location",
      activeOnly: true,
    })[0];
    const heroMemory = listCharacterMemories(afterMove.memories, "hero").at(-1);
    const allyMemory = listCharacterMemories(afterMove.memories, "ally").at(-1);
    const allyBelief = listCharacterBeliefs(afterMove.beliefs, "ally", {
      activeOnly: true,
    }).at(-1);

    expect(locationFact?.object).toBe("북회랑 비밀문");
    expect(heroMemory?.kind).toBe("direct_experience");
    expect(heroMemory?.truthAlignment).toBe("accurate");
    expect(heroMemory?.references.objectiveFactIds).toEqual([locationFact!.id]);
    expect(allyMemory?.truthAlignment).toBe("distorted");
    expect(allyMemory?.references.objectiveFactIds).toEqual([locationFact!.id]);
    expect(allyMemory?.divergenceCause).toEqual({
      kind: "misunderstanding",
      summary: "리안은 닫히는 비밀문을 함정 붕괴로 오인했다.",
      sourceEventId: "evt-4-hidden-passage",
    });
    expect(allyBelief?.canonicalAlignment).toBe("contradicted");
    expect(allyBelief?.references.objectiveFactIds).toEqual([locationFact!.id]);
    expect(allyBelief?.divergenceCause).toEqual({
      kind: "lack_of_information",
      summary: "리안은 비밀문 존재를 보지 못해 탈출 경로를 알지 못한다.",
      sourceEventId: "evt-4-hidden-passage",
    });
    expect(allyBelief?.references.memoryIds).toEqual([allyMemory!.id]);
  });

  it("rejects fact-divergent cognition updates that omit an explicit cause record", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());

    expect(() =>
      ledger.applyEvent(initial, {
        id: "evt-5-bad-memory",
        chapter: 5,
        type: "move",
        actorId: "hero",
        location: "북회랑 제단",
        summary: "세라가 제단으로 이동한다.",
        cognition: {
          memoryUpdates: [
            {
              characterId: "ally",
              kind: "direct_experience",
              summary: "리안은 세라가 금고에 남았다고 기억한다.",
              truthAlignment: "distorted",
            },
          ],
        },
      })
    ).toThrowError(/requires an explicit cause record/);

    expect(() =>
      ledger.applyEvent(initial, {
        id: "evt-5-bad-belief",
        chapter: 5,
        type: "move",
        actorId: "hero",
        location: "북회랑 제단",
        summary: "세라가 제단으로 이동한다.",
        cognition: {
          beliefUpdates: [
            {
              characterId: "ally",
              kind: "suspicion",
              subject: "세라의 위치",
              belief: "리안은 세라가 아직 금고 앞에 있다고 믿는다.",
              cause: "방금 본 장면을 끝까지 확인하지 못했다.",
              canonicalAlignment: "contradicted",
            },
          ],
        },
      })
    ).toThrowError(/requires an explicit cause record/);
  });

  it("rejects canonical mismatches during event-driven cognition writes", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());

    expect(() =>
      ledger.applyEvent(initial, {
        id: "evt-6-bad-memory-match",
        chapter: 5,
        type: "move",
        actorId: "hero",
        location: "북회랑 제단",
        summary: "세라가 제단으로 이동한다.",
        cognition: {
          memoryUpdates: [
            {
              characterId: "ally",
              kind: "direct_experience",
              summary: "리안은 세라가 아직 황궁에 남아 있다고 기억한다.",
            },
          ],
        },
      })
    ).toThrowError(/Immediate memory write rejected/);

    expect(() =>
      ledger.applyEvent(initial, {
        id: "evt-6-bad-belief-match",
        chapter: 5,
        type: "move",
        actorId: "hero",
        location: "북회랑 제단",
        summary: "세라가 제단으로 이동한다.",
        cognition: {
          beliefUpdates: [
            {
              characterId: "ally",
              kind: "suspicion",
              subject: "세라의 위치",
              belief: "리안은 세라가 아직 황궁에 있다고 믿는다.",
              cause: "눈앞의 장면보다 이전 경로를 더 신뢰한다.",
            },
          ],
        },
      })
    ).toThrowError(/Immediate belief write rejected/);
  });

  it("builds prompt context from simulation state", () => {
    const ledger = new SimulationEventLedger();
    const state = ledger.applyEvent(createSimulationState(makeSeed()), {
      id: "evt-1",
      chapter: 2,
      type: "open_thread",
      actorId: "hero",
      summary: "세라가 금고 열쇠의 행방을 추적하기 시작한다.",
      payload: {
        threadId: "vault-key",
        title: "금고 열쇠 추적",
      },
      cognition: {
        memoryUpdates: [
          {
            characterId: "hero",
            summary: "세라는 북회랑 쪽에서 금속 마찰음을 들었다고 기억한다.",
            kind: "direct_experience",
          },
        ],
        beliefUpdates: [
          {
            characterId: "hero",
            kind: "interpretation",
            subject: "북회랑의 움직임",
            belief: "세라는 누군가가 금고 봉인을 건드렸다고 의심한다.",
            confidence: "medium",
            cause: "금속 마찰음과 경비 교대 시각이 겹쳤다.",
            canonicalAlignment: "uncertain",
          },
        ],
      },
    });

    const prompt = buildSimulationPromptContext(state, {
      chapterNumber: 3,
      sceneCharacterIds: ["hero", "ally"],
      activeSpeakerCharacterId: "hero",
    });

    expect(prompt).toContain("Simulation State");
    expect(prompt).toContain("Objective Facts");
    expect(prompt).toContain("세라");
    expect(prompt).toContain("knowledge=");
    expect(prompt).toContain("beliefs=");
    expect(prompt).toContain("memories=");
    expect(prompt).toContain("금고 열쇠 추적");
    expect(prompt).toContain("Recent Event Log");
    expect(prompt).toContain("Active Speaker Cognition");
    expect(prompt).toContain("북회랑 쪽에서 금속 마찰음을 들었다고 기억한다");
    expect(prompt).toContain("누군가가 금고 봉인을 건드렸다고 의심한다");
  });
});
