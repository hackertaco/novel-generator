import { describe, expect, it } from "vitest";
import { buildScenePrompt, buildSimpleScenePrompt } from "@/lib/agents/scene-writer";
import {
  addCharacterBelief,
  addObjectiveFact,
  createWorldStateAuthority,
} from "@/lib/sim";
import type { ChapterBlueprint, SceneSpec } from "@/lib/schema/planning";
import { makeSimulationTestSeed } from "../sim/fixtures/cognition-fixtures";

function makeScene(): SceneSpec {
  return {
    purpose: "세라가 북회랑 봉인의 흔적을 살피며 리안의 반응을 읽어낸다.",
    type: "dialogue",
    characters: ["hero", "ally"],
    estimated_chars: 1200,
    emotional_tone: "긴장",
    must_reveal: [],
    where_detail: "북회랑 입구",
    dialogue_turns: [
      { speaker: "세라", intent: "떠보기" },
      { speaker: "리안", intent: "방어" },
    ],
  };
}

function makeBlueprint(): ChapterBlueprint {
  return {
    chapter_number: 4,
    title: "북회랑의 침묵",
    arc_id: "arc-1",
    one_liner: "세라가 북회랑 봉인의 흔적을 확인하고 리안을 떠본다.",
    role_in_arc: "rising_action",
    scenes: [makeScene()],
    dependencies: [],
    target_word_count: 1200,
    emotional_arc: "긴장→의심",
    key_points: [],
    characters_involved: ["hero", "ally"],
    tension_level: 7,
    foreshadowing_actions: [],
    pov: "third",
    pov_character: "세라",
  };
}

function primeAuthority() {
  const seed = makeSimulationTestSeed();
  const authority = createWorldStateAuthority(seed);
  authority.applyDialogueScene({
    chapter: 4,
    sceneId: "scene-4-vault",
    turns: [
      {
        characterId: "hero",
        line: "금고 앞에 누가 다녀간 흔적이 있어요.",
        audienceCharacterIds: ["ally"],
        intent: "떠보기",
        cause: "세라가 봉인 틈의 금속 가루를 직접 확인했다.",
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

  return { seed, authority };
}

describe("scene writer viewpoint prompts", () => {
  it("adds focal cognition to the full scene prompt", () => {
    const { seed, authority } = primeAuthority();
    const blueprint = makeBlueprint();
    const scene = blueprint.scenes[0];

    const prompt = buildScenePrompt(
      seed,
      4,
      blueprint,
      scene,
      0,
      [],
      [],
      { worldStateAuthority: authority },
    );

    expect(prompt).toContain("현재 시점 인지 스냅샷");
    expect(prompt).toContain("Focal Character Viewpoint");
    expect(prompt).toContain("세라는 봉인 틈에서 금속 가루를 직접 확인했다고 기억한다");
    expect(prompt).toContain("세라는 누군가가 봉인을 시험 삼아 건드렸다고 의심한다");
    expect(prompt).toContain("관찰, 내면, 분위기 묘사는 세라의 현재 기억과 믿음 범위를 넘어서면 안 됩니다");
  });

  it("adds focal cognition to the simple scene prompt", () => {
    const { seed, authority } = primeAuthority();
    const blueprint = makeBlueprint();
    const scene = blueprint.scenes[0];

    const prompt = buildSimpleScenePrompt(
      seed,
      4,
      blueprint,
      scene,
      0,
      [],
      [],
      undefined,
      authority,
    );

    expect(prompt).toContain("현재 시점 인지 스냅샷");
    expect(prompt).toContain("Focal Character Viewpoint");
    expect(prompt).toContain("세라는 봉인 틈에서 금속 가루를 직접 확인했다고 기억한다");
    expect(prompt).toContain("세라는 누군가가 봉인을 시험 삼아 건드렸다고 의심한다");
  });

  it("limits viewpoint narration to the POV character's active belief state", () => {
    const seed = makeSimulationTestSeed();
    const authority = createWorldStateAuthority(seed);
    const simulationState = authority.getSimulationState();
    const blueprint = {
      ...makeBlueprint(),
      pov_character: "리안",
    };
    const scene = blueprint.scenes[0];

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
      characterId: "ally",
      chapter: 4,
      kind: "deduction",
      subject: "황실 금고",
      belief: "리안은 금고 봉인이 이미 누군가에게 풀렸다고 믿는다.",
      confidence: "medium",
      cause: "봉인 주변의 긁힌 흔적이 내부자의 침입처럼 보였다.",
      canonicalAlignment: "contradicted",
      divergenceCause: {
        kind: "lack_of_information",
        summary: "리안은 봉인의 실제 상태를 직접 확인하지 못했다.",
        sourceEventId: "evt-vault-seal",
      },
      references: {
        objectiveFactIds: [sealedFact.id],
        relatedCharacterIds: ["hero"],
      },
      tags: ["belief:pov-misread"],
    });

    addCharacterBelief(simulationState.beliefs, {
      characterId: "hero",
      chapter: 4,
      kind: "suspicion",
      subject: "리안",
      belief: "세라는 리안이 무언가를 숨기고 있다고 의심한다.",
      confidence: "medium",
      cause: "리안의 시선이 봉인 틈에서 오래 머물렀다.",
      canonicalAlignment: "uncertain",
      references: {
        relatedCharacterIds: ["ally"],
      },
      tags: ["belief:hero-suspicion"],
    });

    const prompt = buildScenePrompt(
      seed,
      4,
      blueprint,
      scene,
      0,
      [],
      [],
      { worldStateAuthority: authority },
    );

    expect(prompt).toContain("Focal Character Viewpoint");
    expect(prompt).toContain("[deduction/contradicted/medium] 황실 금고: 리안은 금고 봉인이 이미 누군가에게 풀렸다고 믿는다.");
    expect(prompt).toContain("관찰, 내면, 분위기 묘사는 리안의 현재 기억과 믿음 범위를 넘어서면 안 됩니다");
    expect(prompt).not.toContain("세라는 리안이 무언가를 숨기고 있다고 의심한다.");
  });
});
