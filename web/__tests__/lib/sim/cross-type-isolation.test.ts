import { describe, expect, it } from "vitest";
import {
  addCharacterBelief,
  addCharacterMemory,
  addCharacterUtterance,
  addObjectiveFact,
  closeMatchingObjectiveFacts,
  createCharacterBeliefStore,
  createCharacterMemoryStore,
  createCharacterUtteranceStore,
  createObjectiveFactStore,
  listCharacterBeliefs,
  listCharacterMemories,
  listCharacterUtterances,
  listObjectiveFacts,
  setCharacterTrust,
} from "@/lib/sim";

describe("sim cross-type query isolation", () => {
  it("keeps fact, memory, belief, and utterance queries isolated under mixed writes", () => {
    const objectiveFacts = createObjectiveFactStore();
    const memories = createCharacterMemoryStore(["hero"]);
    const beliefs = createCharacterBeliefStore(["hero"]);
    const utterances = createCharacterUtteranceStore(["hero"]);

    const fact = addObjectiveFact(objectiveFacts, {
      chapter: 12,
      subject: "북회랑 열쇠",
      predicate: "is_hidden_in",
      object: "황실 금고",
      category: "discovery",
      summary: "북회랑 열쇠는 황실 금고에 있다.",
      sourceEventId: "evt-12",
      tags: ["thread:key-mystery"],
    });

    const memory = addCharacterMemory(memories, {
      characterId: "hero",
      chapter: 12,
      kind: "direct_experience",
      summary: "세라가 금고 봉인을 직접 확인했다.",
      cause: "현장에서 봉인을 봄",
      references: {
        eventId: "evt-12",
        objectiveFactIds: [fact.id],
      },
      tags: ["memory:key-location"],
    });

    const belief = addCharacterBelief(beliefs, {
      characterId: "hero",
      chapter: 12,
      kind: "deduction",
      subject: "북회랑 음모",
      belief: "열쇠 위치를 숨긴 사람이 황실 내부자일 수 있다.",
      cause: "직접 본 봉인과 이전 경고를 연결한 해석",
      references: {
        eventId: "evt-12",
        objectiveFactIds: [fact.id],
        memoryIds: [memory.id],
      },
      tags: ["belief:deduction"],
    });

    const utterance = addCharacterUtterance(utterances, {
      characterId: "hero",
      chapter: 12,
      sceneId: "scene-12-vault",
      line: "열쇠는 아직 금고 안에 있어요.",
      audienceCharacterIds: ["ally"],
      cause: "직접 확인한 사실을 공유함",
      relatedCharacterIds: ["ally"],
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-12-vault",
        eventId: "evt-12",
        sceneTurn: 2,
        witnessCharacterIds: ["ally"],
        objectiveFactIds: [fact.id],
      },
      tags: ["utterance:report"],
    });

    const factResults = listObjectiveFacts(objectiveFacts, {
      category: "discovery",
      activeOnly: true,
    });
    const memoryResults = listCharacterMemories(memories, "hero");
    const beliefResults = listCharacterBeliefs(beliefs, "hero", {
      activeOnly: true,
    });
    const utteranceResults = listCharacterUtterances(utterances, "hero", {
      sceneId: "scene-12-vault",
    });

    expect(factResults).toEqual([fact]);
    expect(factResults.map((record) => record.id)).toEqual([fact.id]);
    expect(factResults.every((record) => record.id.startsWith("evt-12:"))).toBe(true);

    expect(memoryResults).toEqual([memory]);
    expect(memoryResults.map((record) => record.id)).toEqual([memory.id]);
    expect(memoryResults.every((record) => record.id.startsWith("memory:"))).toBe(true);

    expect(beliefResults).toEqual([belief]);
    expect(beliefResults.map((record) => record.id)).toEqual([belief.id]);
    expect(beliefResults.every((record) => record.id.startsWith("belief:"))).toBe(true);

    expect(utteranceResults).toEqual([utterance]);
    expect(utteranceResults.map((record) => record.id)).toEqual([utterance.id]);
    expect(utteranceResults.every((record) => record.id.startsWith("utterance:"))).toBe(true);

    closeMatchingObjectiveFacts(
      objectiveFacts,
      {
        subject: "북회랑 열쇠",
        predicate: "is_hidden_in",
        category: "discovery",
      },
      13,
    );
    const replacementFact = addObjectiveFact(objectiveFacts, {
      chapter: 13,
      subject: "북회랑 열쇠",
      predicate: "is_hidden_in",
      object: "북회랑 제단",
      category: "discovery",
      summary: "북회랑 열쇠는 북회랑 제단으로 옮겨졌다.",
      sourceEventId: "evt-13",
      tags: ["thread:key-mystery"],
    });

    addCharacterMemory(memories, {
      characterId: "hero",
      chapter: 13,
      kind: "recollection",
      summary: "세라가 금고의 빈 자리를 다시 떠올린다.",
      cause: "제단 이동 단서를 확인함",
      references: {
        eventId: "evt-13",
        objectiveFactIds: [replacementFact.id],
        utteranceIds: [utterance.id],
      },
      tags: ["memory:recall"],
    });

    setCharacterTrust(beliefs, "hero", "ally", 2);
    addCharacterBelief(beliefs, {
      characterId: "hero",
      chapter: 13,
      kind: "suspicion",
      subject: "ally",
      belief: "리안이 이동 시점을 알고 있었을 수 있다.",
      confidence: "low",
      cause: "새 단서와 기존 기억을 결합한 의심",
      references: {
        eventId: "evt-13",
        memoryIds: [memory.id],
        utteranceIds: [utterance.id],
        relatedCharacterIds: ["ally"],
      },
      tags: ["belief:suspicion"],
    });

    addCharacterUtterance(utterances, {
      characterId: "hero",
      chapter: 13,
      sceneId: "scene-13-hallway",
      line: "금고는 비어 있었어요.",
      audienceCharacterIds: ["ally"],
      cause: "직접 확인한 결과를 보고함",
      relatedCharacterIds: ["ally"],
      provenance: {
        source: "direct_scene_capture",
        sceneId: "scene-13-hallway",
        eventId: "evt-13",
        sceneTurn: 1,
        witnessCharacterIds: ["ally"],
        objectiveFactIds: [replacementFact.id],
      },
      tags: ["utterance:update"],
    });

    expect(listObjectiveFacts(objectiveFacts, { activeOnly: true })).toEqual([replacementFact]);
    expect(listCharacterMemories(memories, "hero").map((record) => record.id))
      .toEqual(["memory:hero:1", "memory:hero:2"]);
    expect(
      listCharacterBeliefs(beliefs, "hero", { activeOnly: true }).map((record) => record.id),
    ).toEqual(["belief:hero:1", "belief:hero:2"]);
    expect(
      listCharacterUtterances(utterances, "hero").map((record) => record.id),
    ).toEqual(["utterance:hero:1", "utterance:hero:2"]);

    expect(listCharacterMemories(memories, "hero").some((record) => "belief" in record)).toBe(false);
    expect(listCharacterBeliefs(beliefs, "hero").some((record) => "line" in record)).toBe(false);
    expect(listCharacterUtterances(utterances, "hero").some((record) => "predicate" in record)).toBe(false);
    expect(listObjectiveFacts(objectiveFacts).some((record) => "references" in record)).toBe(false);
  });
});
