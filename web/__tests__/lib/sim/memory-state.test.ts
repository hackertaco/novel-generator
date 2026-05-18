import { describe, expect, it } from "vitest";
import {
  CharacterMemoryRecordSchema,
  addCharacterMemory,
  createCharacterMemoryStore,
  listCharacterMemories,
} from "@/lib/sim";

describe("sim memory state", () => {
  it("creates independent per-character memory stores", () => {
    const store = createCharacterMemoryStore(["hero", "ally"]);

    expect(store.hero.characterId).toBe("hero");
    expect(store.hero.timeline).toEqual([]);
    expect(store.ally.characterId).toBe("ally");
    expect(store.ally.timeline).toEqual([]);
  });

  it("stores recalled experiences with explicit references instead of a note stream", () => {
    const store = createCharacterMemoryStore(["hero"]);
    const memory = addCharacterMemory(store, {
      characterId: "hero",
      chapter: 12,
      kind: "recollection",
      summary: "세라가 북회랑에서 본 핏자국을 다시 떠올린다.",
      location: "황궁 서고",
      cause: "금고 열쇠 단서를 재검토함",
      references: {
        eventId: "evt-12",
        objectiveFactIds: ["evt-12:1"],
        utteranceIds: ["utterance:hero:1"],
        relatedCharacterIds: ["ally"],
      },
      recalledAtChapter: 18,
      tags: ["memory:recall"],
    });

    const parsed = CharacterMemoryRecordSchema.parse(memory);
    expect(parsed.kind).toBe("recollection");
    expect(parsed.references.eventId).toBe("evt-12");
    expect(parsed.references.objectiveFactIds).toEqual(["evt-12:1"]);
    expect(parsed.references.utteranceIds).toEqual(["utterance:hero:1"]);
    expect(parsed.recalledAtChapters).toEqual([18]);
    expect(listCharacterMemories(store, "hero")).toHaveLength(1);
  });
});
