import type {
  CharacterDivergenceCause,
  ObjectiveFactRecord,
  SimulationState,
} from "@/lib/sim";
import { addObjectiveFact, createSimulationState } from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";

export function makeSimulationTestSeed(): NovelSeed {
  return {
    title: "인지 상태 테스트",
    logline: "기억과 믿음의 분기를 검증한다.",
    total_chapters: 12,
    world: {
      name: "황궁",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        북회랑: "비밀 통로가 숨겨진 회랑",
        "황실 금고": "봉인된 황실 보관실",
      },
      factions: {},
      rules: ["사건 직후의 진실과 해석은 분리해 기록한다."],
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
          sample_dialogues: ["금고는 아직 닫혀 있어요."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락 귀족의 후계자",
        arc_summary: "가려진 진실을 끝까지 추적한다",
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
          sample_dialogues: ["증거를 먼저 봅시다."],
          personality_core: "현실적이고 민첩함",
        },
        backstory: "황궁 관리",
        arc_summary: "현실 감각으로 주인공을 보완한다",
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

export function createStateWithVaultSealFact(): {
  state: SimulationState;
  fact: ObjectiveFactRecord;
} {
  const state = createSimulationState(makeSimulationTestSeed());
  const fact = addObjectiveFact(state.objectiveFacts, {
    chapter: 4,
    subject: "황실 금고",
    predicate: "status",
    object: "sealed",
    category: "discovery",
    summary: "황실 금고는 여전히 봉인 상태다.",
    sourceEventId: "evt-vault-seal",
    tags: ["fact:vault-seal"],
  });

  return { state, fact };
}

export function causedMemoryDeception(): CharacterDivergenceCause {
  return {
    kind: "deception",
    summary: "세라의 의도적 허위 보고를 그대로 받아들였다.",
    sourceEventId: "evt-vault-rumor",
    sourceCharacterId: "hero",
  };
}

export function causedBeliefLackOfInformation(): CharacterDivergenceCause {
  return {
    kind: "lack_of_information",
    summary: "리안은 금고 봉인을 직접 확인하지 못한 채 추론만 이어 갔다.",
    sourceEventId: "evt-vault-rumor",
    sourceCharacterId: "hero",
  };
}
