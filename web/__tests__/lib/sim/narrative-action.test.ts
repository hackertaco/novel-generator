import { describe, expect, it } from "vitest";
import {
  addCharacterMemory,
  createSimulationState,
  listAudienceKnowledge,
  listCharacterBeliefs,
  listCharacterMemories,
  SimulationEventLedger,
} from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";

function makeSeed(): NovelSeed {
  return {
    title: "회귀 테스트",
    logline: "악녀가 회귀하여 음모를 막는다.",
    total_chapters: 30,
    world: {
      name: "제국",
      genre: "로맨스 판타지",
      sub_genre: "회귀",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: { 황궁: "권력의 중심" },
      factions: { 황실: "황궁 권력" },
      rules: [],
    },
    characters: [
      {
        id: "hero",
        name: "엘리시아",
        role: "주인공",
        social_rank: "noble",
        introduction_chapter: 1,
        voice: {
          tone: "차분함",
          speech_patterns: [],
          sample_dialogues: ["..."],
          personality_core: "냉정",
        },
        backstory: "회귀자",
        arc_summary: "복수를 결심한다",
        internal_arc: {
          want: "복수",
          need: "신뢰",
          misbelief: "혼자 해야 한다",
        },
        state: {
          level: null,
          location: "공작가",
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

function audienceSummaries(state: ReturnType<typeof createSimulationState>): string[] {
  return listAudienceKnowledge(state.audienceKnowledge).map((record) => record.summary);
}

describe("NarrativeAction event types", () => {
  it("recollection_surfaced pushes the chapter into the memory's recall log and exposes a flashback to the audience", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());
    addCharacterMemory(initial.memories, {
      characterId: "hero",
      chapter: 0,
      kind: "direct_experience",
      summary: "엘리시아는 전생에서 독살당했다",
      emotionalTone: "분노",
    });
    const memoryId = initial.memories.hero.timeline[0];

    const next = ledger.applyEvent(initial, {
      id: "evt-recall-1",
      chapter: 1,
      type: "recollection_surfaced",
      actorId: "hero",
      summary: "엘리시아는 전생의 독살을 떠올렸다",
      payload: {
        memoryId,
        characterId: "hero",
        summary: "전생의 독살이 다시 떠올랐다",
        visibility: "audience",
      },
    });

    const recalled = listCharacterMemories(next.memories, "hero").find(
      (memory) => memory.id === memoryId,
    );
    expect(recalled?.recalledAtChapters).toContain(1);
    expect(audienceSummaries(next)).toContain("전생의 독살이 다시 떠올랐다");
    const audienceRecord = listAudienceKnowledge(next.audienceKnowledge).find(
      (record) => record.summary === "전생의 독살이 다시 떠올랐다",
    );
    expect(audienceRecord?.source).toBe("flashback");
  });

  it("internal_monologue exposes a monologue line to the audience without mutating beliefs", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());
    const beforeBeliefCount = listCharacterBeliefs(initial.beliefs, "hero").length;

    const next = ledger.applyEvent(initial, {
      id: "evt-monologue-1",
      chapter: 1,
      type: "internal_monologue",
      actorId: "hero",
      summary: "엘리시아는 라엘에게 다시 속지 않으리라 다짐했다",
      payload: {
        characterId: "hero",
        summary: "이번엔 절대 라엘에게 속지 않을 것이다",
        visibility: "audience",
      },
    });

    expect(listCharacterBeliefs(next.beliefs, "hero").length).toBe(beforeBeliefCount);
    expect(audienceSummaries(next)).toContain("이번엔 절대 라엘에게 속지 않을 것이다");
    const record = listAudienceKnowledge(next.audienceKnowledge).find(
      (entry) => entry.summary === "이번엔 절대 라엘에게 속지 않을 것이다",
    );
    expect(record?.source).toBe("monologue");
  });

  it("realization creates a deduction belief and surfaces it to the audience", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());
    const beforeBeliefCount = listCharacterBeliefs(initial.beliefs, "hero").length;

    const next = ledger.applyEvent(initial, {
      id: "evt-realize-1",
      chapter: 1,
      type: "realization",
      actorId: "hero",
      summary: "엘리시아는 자신이 회귀했음을 깨달았다",
      payload: {
        characterId: "hero",
        subject: "회귀",
        belief: "나는 1년 전으로 회귀했다",
        cause: "익숙한 방, 죽음 직전의 통증, 같은 약혼식 풍경",
        visibility: "audience",
      },
    });

    const afterBeliefs = listCharacterBeliefs(next.beliefs, "hero");
    expect(afterBeliefs.length).toBe(beforeBeliefCount + 1);
    const newBelief = afterBeliefs[afterBeliefs.length - 1];
    expect(newBelief.kind).toBe("deduction");
    expect(newBelief.belief).toBe("나는 1년 전으로 회귀했다");

    const audienceRecord = listAudienceKnowledge(next.audienceKnowledge).find(
      (record) => record.summary === "나는 1년 전으로 회귀했다",
    );
    expect(audienceRecord?.source).toBe("monologue");
    expect(audienceRecord?.references.characterBeliefIds).toContain(newBelief.id);
  });

  it("time_jump advances the chapter cursor and records the jump as audience knowledge", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());
    expect(initial.chapterCursor).toBe(0);

    const next = ledger.applyEvent(initial, {
      id: "evt-jump-1",
      chapter: 1,
      type: "time_jump",
      summary: "1년 후로 시간이 흘렀다",
      payload: {
        fromChapter: 1,
        toChapter: 5,
        summary: "1년이 흘러 황궁 만찬 직전이다",
      },
    });

    expect(next.chapterCursor).toBeGreaterThanOrEqual(5);
    expect(audienceSummaries(next)).toContain("1년이 흘러 황궁 만찬 직전이다");
    const audienceRecord = listAudienceKnowledge(next.audienceKnowledge).find(
      (record) => record.summary === "1년이 흘러 황궁 만찬 직전이다",
    );
    expect(audienceRecord?.source).toBe("exposition");
  });
});
