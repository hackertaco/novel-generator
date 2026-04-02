import { describe, it, expect } from "vitest";
import { WorldStateManager } from "@/lib/memory/world-state-manager";
import type { ChapterWorldState, WorldFact } from "@/lib/memory/world-state";

function makeFact(overrides: Partial<WorldFact> = {}): WorldFact {
  return {
    subject: "리에나",
    action: "감금됨",
    object: "북궁 별관",
    chapter: 1,
    ...overrides,
  };
}

function makeChapterState(chapter: number, overrides: Partial<ChapterWorldState> = {}): ChapterWorldState {
  return {
    chapter,
    facts: [makeFact({ chapter })],
    character_states: [
      {
        name: "리에나",
        location: "북궁 별관",
        physical: "족쇄 자국",
        emotional: "경계심",
        knows: ["처형이 중단됨"],
        relationships: [{ with: "테오", status: "보호 본능" }],
      },
    ],
    summary: `${chapter}화 요약`,
    ...overrides,
  };
}

describe("WorldStateManager", () => {
  it("addChapterState and getCurrentFacts", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));
    mgr.addChapterState(makeChapterState(2, {
      facts: [makeFact({ chapter: 2, subject: "테오", action: "도주함", object: "성벽 밖" })],
    }));

    const facts = mgr.getCurrentFacts();
    expect(facts).toHaveLength(2);
    expect(facts[0].subject).toBe("리에나");
    expect(facts[1].subject).toBe("테오");
  });

  it("getCurrentFacts excludes expired facts", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1, {
      facts: [makeFact({ chapter: 1, valid_until: 2 })],
    }));
    mgr.addChapterState(makeChapterState(2));

    const facts = mgr.getCurrentFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0].chapter).toBe(2);
  });

  it("getCharacterState returns latest state", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));
    mgr.addChapterState(makeChapterState(2, {
      character_states: [
        {
          name: "리에나",
          location: "왕궁",
          physical: "회복 중",
          emotional: "결의",
          knows: ["처형이 중단됨", "테오의 정체"],
          relationships: [{ with: "테오", status: "신뢰" }],
        },
      ],
    }));

    const state = mgr.getCharacterState("리에나");
    expect(state?.location).toBe("왕궁");
    expect(state?.emotional).toBe("결의");
  });

  it("getCharacterState returns undefined for unknown character", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));
    expect(mgr.getCharacterState("모르는사람")).toBeUndefined();
  });

  it("detectContradictions finds same subject+action with different object", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1, {
      facts: [makeFact({ subject: "리에나", action: "위치", object: "북궁", chapter: 1 })],
    }));

    const newFacts: WorldFact[] = [
      { subject: "리에나", action: "위치", object: "남궁", chapter: 2 },
    ];

    const contradictions = mgr.detectContradictions(newFacts);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].description).toContain("북궁");
    expect(contradictions[0].description).toContain("남궁");
  });

  it("detectContradictions returns empty when no conflicts", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));

    const newFacts: WorldFact[] = [
      { subject: "테오", action: "발견함", object: "비밀 통로", chapter: 2 },
    ];

    expect(mgr.detectContradictions(newFacts)).toHaveLength(0);
  });

  it("formatForWriter includes facts and character states", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));

    const output = mgr.formatForWriter(2);
    expect(output).toContain("현재 세계 상태");
    expect(output).toContain("리에나");
    expect(output).toContain("감금됨");
    expect(output).toContain("북궁 별관");
    expect(output).toContain("1화 요약");
    expect(output).toContain("모순되는 내용을 쓰지 마세요");
  });

  it("formatForWriter limits to 20 most recent facts", () => {
    const mgr = new WorldStateManager();
    const manyFacts = Array.from({ length: 25 }, (_, i) =>
      makeFact({ subject: `인물${i}`, chapter: 1 }),
    );
    mgr.addChapterState(makeChapterState(1, { facts: manyFacts }));

    const output = mgr.formatForWriter(2);
    // Should contain fact 5-24 (last 20), not fact 0-4
    expect(output).toContain("인물24");
    expect(output).not.toContain("인물0 감금됨");
  });

  it("getAllCharacterNames collects unique names", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));
    mgr.addChapterState(makeChapterState(2, {
      character_states: [
        { name: "리에나", location: "왕궁", physical: "", emotional: "", knows: [], relationships: [] },
        { name: "테오", location: "성벽", physical: "", emotional: "", knows: [], relationships: [] },
      ],
    }));

    const names = mgr.getAllCharacterNames();
    expect(names).toContain("리에나");
    expect(names).toContain("테오");
    expect(names).toHaveLength(2);
  });

  it("size returns number of chapters tracked", () => {
    const mgr = new WorldStateManager();
    expect(mgr.size).toBe(0);
    mgr.addChapterState(makeChapterState(1));
    expect(mgr.size).toBe(1);
    mgr.addChapterState(makeChapterState(2));
    expect(mgr.size).toBe(2);
  });

  it("toJSON and fromJSON round-trip", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));
    mgr.addChapterState(makeChapterState(2));

    const json = mgr.toJSON();
    const restored = WorldStateManager.fromJSON(json);
    expect(restored.size).toBe(2);
    expect(restored.getCurrentFacts()).toHaveLength(2);
    expect(restored.getCharacterState("리에나")).toBeDefined();
  });

  it("getSummaries returns chapter summaries", () => {
    const mgr = new WorldStateManager();
    mgr.addChapterState(makeChapterState(1));
    mgr.addChapterState(makeChapterState(2));

    const summaries = mgr.getSummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toEqual({ chapter: 1, summary: "1화 요약" });
  });
});
