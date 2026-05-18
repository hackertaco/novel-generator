import { describe, expect, it } from "vitest";
import { buildBeatPrompt, type Beat } from "@/lib/agents/beat-writer";
import {
  addCharacterBelief,
  addObjectiveFact,
  createWorldStateAuthority,
} from "@/lib/sim";
import type { SceneSpec } from "@/lib/schema/planning";
import { makeSimulationTestSeed } from "../sim/fixtures/cognition-fixtures";

function makeScene(): SceneSpec {
  return {
    purpose: "세라가 리안에게 금고 봉인에 대한 의심을 떠보며 반응을 살핀다.",
    type: "dialogue",
    characters: ["hero", "ally"],
    estimated_chars: 800,
    emotional_tone: "긴장",
    must_reveal: [],
    where_detail: "북회랑 입구",
    dialogue_turns: [
      { speaker: "세라", intent: "떠보기" },
      { speaker: "리안", intent: "방어" },
    ],
  };
}

describe("buildBeatPrompt", () => {
  it("injects the active speaker's memory and belief snapshot for dialogue beats", () => {
    const seed = makeSimulationTestSeed();
    const authority = createWorldStateAuthority(seed);
    const scene = makeScene();
    const beat: Beat = {
      type: "dialogue",
      instruction: "세라가 먼저 질문을 던진다.",
      characters: ["세라", "리안"],
      emotionalTarget: "긴장",
      microTension: "리안이 무언가를 숨기는 기색을 드러낸다.",
    };

    authority.applyDialogueScene({
      chapter: 4,
      sceneId: "scene-4-vault",
      turns: [
        {
          characterId: "hero",
          line: "금고 앞에 누가 다녀간 흔적이 있어요.",
          audienceCharacterIds: ["ally"],
          intent: "떠보기",
          cause: "봉인 틈의 금속 가루를 확인했다.",
          provenance: {
            source: "direct_scene_capture",
            sceneId: "scene-4-vault",
            eventId: "evt-scene-4-vault",
          },
          memoryUpdates: [
            {
              characterId: "hero",
              summary: "세라는 봉인 틈에서 금속 가루를 직접 확인했다고 기억한다.",
              kind: "direct_experience",
            },
          ],
          beliefUpdates: [
            {
              characterId: "hero",
              kind: "suspicion",
              subject: "북회랑 봉인",
              belief: "세라는 누군가가 봉인을 시험 삼아 건드렸다고 의심한다.",
              confidence: "medium",
              cause: "흔적이 자연 마모와 다르다.",
              canonicalAlignment: "uncertain",
            },
          ],
        },
      ],
    });

    const prompt = buildBeatPrompt({
      beat,
      beatIndex: 1,
      totalBeats: 4,
      scene,
      seed,
      chapterNumber: 4,
      previousText: "",
      accumulatedText: "세라는 북회랑의 침묵을 가만히 살폈다.",
      worldStateAuthority: authority,
      focalCharacterId: "hero",
    });

    expect(prompt).toContain("현재 시점 인지 스냅샷");
    expect(prompt).toContain("Focal Character Viewpoint");
    expect(prompt).toContain("Render internal observations and descriptive narration through this character's remembered and believed state");
    expect(prompt).toContain("현재 화자 인지 스냅샷");
    expect(prompt).toContain("Active Speaker Cognition");
    expect(prompt).toContain("세라는 봉인 틈에서 금속 가루를 직접 확인했다고 기억한다");
    expect(prompt).toContain("세라는 누군가가 봉인을 시험 삼아 건드렸다고 의심한다");
    expect(prompt).toContain("Generate this speaker's utterance from their remembered and believed state");
  });

  it("uses focal cognition for non-dialogue beats without adding a speaker block", () => {
    const seed = makeSimulationTestSeed();
    const authority = createWorldStateAuthority(seed);
    const scene = makeScene();
    const beat: Beat = {
      type: "reaction",
      instruction: "세라가 금속 가루를 만져 본다.",
      characters: ["세라"],
    };

    const prompt = buildBeatPrompt({
      beat,
      beatIndex: 0,
      totalBeats: 3,
      scene,
      seed,
      chapterNumber: 4,
      previousText: "",
      accumulatedText: "",
      worldStateAuthority: authority,
      focalCharacterId: "hero",
    });

    expect(prompt).toContain("현재 시점 인지 스냅샷");
    expect(prompt).toContain("Focal Character Viewpoint");
    expect(prompt).toContain("Render internal observations and descriptive narration through this character's remembered and believed state");
    expect(prompt).not.toContain("현재 화자 인지 스냅샷");
    expect(prompt).not.toContain("Active Speaker Cognition");
  });

  it("keeps dialogue generation anchored to the speaker's belief when it conflicts with canonical truth", () => {
    const seed = makeSimulationTestSeed();
    const authority = createWorldStateAuthority(seed);
    const simulationState = authority.getSimulationState();
    const scene = makeScene();
    const beat: Beat = {
      type: "dialogue",
      instruction: "세라가 리안을 떠보며 먼저 압박한다.",
      characters: ["세라", "리안"],
      emotionalTarget: "의심",
      microTension: "세라가 잘못된 확신으로 대화를 몰아간다.",
    };

    const sealedFact = addObjectiveFact(simulationState.objectiveFacts, {
      chapter: 4,
      subject: "황실 금고",
      predicate: "status",
      object: "sealed",
      category: "discovery",
      summary: "황실 금고는 여전히 봉인 상태다.",
      sourceEventId: "evt-vault-seal",
      tags: ["fact:vault-seal"],
    });

    addCharacterBelief(simulationState.beliefs, {
      characterId: "hero",
      chapter: 4,
      kind: "deduction",
      subject: "황실 금고",
      belief: "세라는 리안이 이미 봉인을 풀었다고 믿는다.",
      confidence: "high",
      cause: "봉인 틈의 금속 가루가 조작 흔적처럼 보였다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "misunderstanding",
        summary: "세라는 봉인 흔적을 리안의 범행 증거로 오해했다.",
        sourceEventId: "evt-vault-seal",
      },
      references: {
        objectiveFactIds: [sealedFact.id],
        relatedCharacterIds: ["ally"],
      },
      tags: ["belief:wrong-accusation"],
    });

    const prompt = buildBeatPrompt({
      beat,
      beatIndex: 1,
      totalBeats: 4,
      scene,
      seed,
      chapterNumber: 4,
      previousText: "",
      accumulatedText: "",
      worldStateAuthority: authority,
      focalCharacterId: "hero",
    });

    expect(prompt).toContain("[deduction/contradicted/high] 황실 금고: 세라는 리안이 이미 봉인을 풀었다고 믿는다.");
    expect(prompt).not.toContain("황실 금고는 여전히 봉인 상태다.");
    expect(prompt).toContain("Generate this speaker's utterance from their remembered and believed state, not omniscient truth.");
  });
});
