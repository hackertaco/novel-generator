import { describe, expect, it } from "vitest";
import {
  CharacterBeliefRecordSchema,
  addCharacterBelief,
  createCharacterBeliefStore,
  listCharacterBeliefs,
  setCharacterTrust,
} from "@/lib/sim";

describe("sim belief state", () => {
  it("creates independent per-character belief stores", () => {
    const store = createCharacterBeliefStore(["hero", "ally"]);

    expect(store.hero.characterId).toBe("hero");
    expect(store.hero.timeline).toEqual([]);
    expect(store.hero.activeThreads).toEqual([]);
    expect(store.hero.trustByCharacter).toEqual({});
    expect(store.ally.characterId).toBe("ally");
  });

  it("stores subjective interpretations separately from facts and memories", () => {
    const store = createCharacterBeliefStore(["hero"]);
    setCharacterTrust(store, "hero", "ally", 1);

    const belief = addCharacterBelief(store, {
      characterId: "hero",
      chapter: 12,
      kind: "suspicion",
      subject: "리안의 동선",
      belief: "리안이 북회랑 순찰 시간을 일부러 비웠을 수 있다.",
      confidence: "low",
      cause: "직접 본 빈 순찰 시간과 이전 경고를 연결한 추정",
      references: {
        eventId: "evt-12",
        objectiveFactIds: ["evt-12:1"],
        memoryIds: ["memory:hero:2"],
        relatedCharacterIds: ["ally"],
      },
      tags: ["belief:suspicion"],
    });

    const parsed = CharacterBeliefRecordSchema.parse(belief);
    expect(parsed.kind).toBe("suspicion");
    expect(parsed.references.memoryIds).toEqual(["memory:hero:2"]);
    expect(store.hero.trustByCharacter.ally).toBe(1);
    expect(listCharacterBeliefs(store, "hero", { activeOnly: true })).toHaveLength(1);
  });
});
