import { describe, expect, it } from "vitest";
import type { NovelSeed } from "@/lib/schema/novel";
import {
  SimulationEventLedger,
  TemporalObjectiveStateQueryEngine,
  addObjectiveFact,
  createObjectiveFactStore,
  createSimulationState,
  queryObjectiveStateAtTimestamp,
} from "@/lib/sim";

function makeSeed(): NovelSeed {
  return {
    title: "시간축 테스트 소설",
    logline: "한 인물의 상태가 시간축을 따라 바뀐다.",
    total_chapters: 12,
    world: {
      name: "제국",
      genre: "판타지",
      sub_genre: "궁정",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: {
        황궁: "권력의 중심",
        북회랑: "비밀 통로",
        서고: "기록 보관실",
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
          sample_dialogues: ["지금 확인하겠습니다."],
          personality_core: "침착하지만 집요함",
        },
        backstory: "몰락한 귀족가의 후계자",
        arc_summary: "진실을 추적한다",
        internal_arc: {
          want: "회랑의 비밀을 밝힌다",
          need: "타인을 믿는다",
          misbelief: "혼자여야 안전하다",
        },
        state: {
          level: null,
          location: "황궁",
          status: "normal",
          relationships: {},
          inventory: ["은열쇠"],
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
    story_threads: [],
  };
}

function locationObject(facts: Array<{ predicate: string; category: string; object: string }>): string | undefined {
  return facts.find((fact) => fact.predicate === "is_at" && fact.category === "character_location")?.object;
}

describe("temporal objective state query engine", () => {
  it("returns the authoritative entity state before and after specific events in the same chapter", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());
    const afterFirstMove = ledger.applyEvent(initial, {
      id: "evt-1",
      chapter: 2,
      type: "move",
      actorId: "hero",
      location: "북회랑",
      summary: "세라가 북회랑으로 이동한다.",
    });
    const afterSecondMove = ledger.applyEvent(afterFirstMove, {
      id: "evt-2",
      chapter: 2,
      type: "move",
      actorId: "hero",
      location: "서고",
      summary: "세라가 서고로 이동한다.",
    });

    const beforeFirstMove = queryObjectiveStateAtTimestamp(afterSecondMove, {
      subjectEntityId: "hero",
      timestamp: {
        chapter: 2,
        eventId: "evt-1",
        relation: "before",
      },
    });
    const afterFirstOnly = queryObjectiveStateAtTimestamp(afterSecondMove, {
      subjectEntityId: "hero",
      timestamp: {
        chapter: 2,
        eventId: "evt-1",
        relation: "after",
      },
    });
    const afterSecondMoveState = queryObjectiveStateAtTimestamp(afterSecondMove, {
      subjectEntityId: "hero",
      timestamp: {
        chapter: 2,
        eventId: "evt-2",
        relation: "after",
      },
    });
    const chapterEnd = queryObjectiveStateAtTimestamp(afterSecondMove, {
      subjectEntityId: "hero",
      timestamp: {
        chapter: 2,
      },
    });

    expect(locationObject(beforeFirstMove.facts)).toBe("황궁");
    expect(locationObject(afterFirstOnly.facts)).toBe("북회랑");
    expect(locationObject(afterSecondMoveState.facts)).toBe("서고");
    expect(locationObject(chapterEnd.facts)).toBe("서고");
    expect(chapterEnd.conflicts).toEqual([]);
  });

  it("filters the authoritative state by scope without leaking unrelated fact lines", () => {
    const state = createSimulationState(makeSeed());

    const snapshot = queryObjectiveStateAtTimestamp(state, {
      scopeId: "scope:character:hero",
      timestamp: {
        chapter: 0,
      },
    });

    expect(snapshot.facts.map((fact) => fact.predicate).sort()).toEqual(["is_at", "status"]);
    expect(snapshot.facts.every((fact) => fact.scope.scopeId === "scope:character:hero")).toBe(true);
  });

  it("resolves overlapping effective facts with deterministic precedence and reports the conflict", () => {
    const state = createSimulationState(makeSeed());
    const objectiveFacts = createObjectiveFactStore();

    addObjectiveFact(objectiveFacts, {
      chapter: 1,
      subject: "세라",
      predicate: "is_at",
      object: "황궁",
      category: "character_location",
      summary: "[character-location] 세라: 황궁",
      sourceEventId: "evt-1",
      subjectEntity: {
        entityId: "hero",
        entityType: "character",
      },
      scope: {
        scopeId: "scope:character:hero",
        scopeType: "character",
        entityIds: ["hero"],
      },
      factLineId: "fact-line:character-location:hero",
      tags: ["character:hero"],
    });
    addObjectiveFact(objectiveFacts, {
      chapter: 1,
      subject: "세라",
      predicate: "is_at",
      object: "북회랑",
      category: "character_location",
      summary: "[character-location] 세라: 북회랑",
      sourceEventId: "evt-2",
      subjectEntity: {
        entityId: "hero",
        entityType: "character",
      },
      scope: {
        scopeId: "scope:character:hero",
        scopeType: "character",
        entityIds: ["hero"],
      },
      factLineId: "fact-line:character-location:hero",
      revisesFactId: "evt-1:1",
      revisionReason: "뒤늦게 닫히지 않은 기존 위치 기록보다 최신 이동이 우선한다",
      tags: ["character:hero"],
    });

    state.objectiveFacts = objectiveFacts;
    state.eventLog = [
      {
        id: "evt-1",
        chapter: 1,
        type: "move",
        actorId: "hero",
        location: "황궁",
        summary: "세라가 황궁에 있다.",
      },
      {
        id: "evt-2",
        chapter: 1,
        type: "move",
        actorId: "hero",
        location: "북회랑",
        summary: "세라가 북회랑으로 이동한다.",
      },
    ];

    const engine = new TemporalObjectiveStateQueryEngine(state);
    const snapshot = engine.query({
      subjectEntityId: "hero",
      timestamp: {
        chapter: 1,
      },
    });

    expect(locationObject(snapshot.facts)).toBe("북회랑");
    expect(snapshot.conflicts).toMatchObject([
      {
        lineId: "fact-line:character-location:hero",
        rulesApplied: ["later_event_wins"],
      },
    ]);
    expect(snapshot.conflicts[0]?.loserFactIds).toEqual(["evt-1:1"]);
    expect(snapshot.conflicts[0]?.winnerFactId).toBe("evt-2:2");
  });
});
