import { describe, expect, it } from "vitest";
import {
  CharacterUtteranceRecordSchema,
  addCharacterUtterance,
  createCharacterUtteranceStore,
  listCharacterUtterances,
} from "@/lib/sim";

describe("sim utterance state", () => {
  it("creates independent per-speaker utterance stores", () => {
    const store = createCharacterUtteranceStore(["hero", "ally"]);

    expect(store.hero.characterId).toBe("hero");
    expect(store.hero.timeline).toEqual([]);
    expect(store.hero.byScene).toEqual({});
    expect(store.ally.characterId).toBe("ally");
  });

  it("stores spoken statements independently with scene and provenance references", () => {
    const store = createCharacterUtteranceStore(["hero"]);
    const utterance = addCharacterUtterance(store, {
      characterId: "hero",
      chapter: 12,
      sceneId: "scene-12-garden",
      line: "북회랑 열쇠는 아직 금고 안에 있어요.",
      audienceCharacterIds: ["ally"],
      intent: "정보 전달",
      cause: "직접 목격 사실을 공유함",
      relatedCharacterIds: ["ally"],
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-12-garden",
        eventId: "evt-12",
        sceneTurn: 3,
        witnessCharacterIds: ["ally"],
        objectiveFactIds: ["fact:12:key-location"],
      },
      tags: ["utterance:report"],
    });

    const parsed = CharacterUtteranceRecordSchema.parse(utterance);
    expect(parsed.characterId).toBe("hero");
    expect(parsed.sceneId).toBe("scene-12-garden");
    expect(parsed.provenance.source).toBe("direct_scene_capture");
    expect(parsed.provenance.eventId).toBe("evt-12");
    expect(parsed.provenance.objectiveFactIds).toEqual(["fact:12:key-location"]);
    expect(parsed.canonicalAlignment).toBe("supported");
    expect(store.hero.byScene["scene-12-garden"]).toEqual([utterance.id]);
    expect(listCharacterUtterances(store, "hero", { sceneId: "scene-12-garden" })).toEqual([utterance]);
  });

  it("requires explicit divergence metadata only for contradicted factual claims", () => {
    const store = createCharacterUtteranceStore(["hero"]);

    expect(() =>
      addCharacterUtterance(store, {
        characterId: "hero",
        chapter: 12,
        sceneId: "scene-12-garden",
        line: "문은 이미 열려 있어요.",
        provenance: {
          source: "direct_scene_capture",
          sceneId: "scene-12-garden",
          objectiveFactIds: ["fact:12:door-status"],
        },
        canonicalAlignment: "contradicted",
      })
    ).toThrowError(/requires an explicit cause record/);

    expect(() =>
      addCharacterUtterance(store, {
        characterId: "hero",
        chapter: 12,
        sceneId: "scene-12-garden",
        line: "문은 아직 잠겨 있어요.",
        provenance: {
          source: "direct_scene_capture",
          sceneId: "scene-12-garden",
          objectiveFactIds: ["fact:12:door-status"],
        },
        divergenceCause: {
          kind: "lying",
          summary: "사실과 다르게 말한다고 표시했지만 발화 정렬값은 모순되지 않는다.",
        },
      })
    ).toThrowError(/requires contradicted canonical alignment/);
  });
});
