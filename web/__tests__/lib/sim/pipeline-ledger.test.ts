import { describe, expect, it } from "vitest";

import type { ChapterBlueprint } from "@/lib/schema/planning";
import {
  createWorldStateAuthority,
  emitGeneratedChapterSceneLedger,
  listCharacterMemories,
  listObjectiveFacts,
} from "@/lib/sim";

import { makeSimulationTestSeed } from "./fixtures/cognition-fixtures";

function makeBlueprint(): ChapterBlueprint {
  return {
    chapter_number: 4,
    title: "북회랑의 흔적",
    arc_id: "arc-1",
    one_liner: "세라와 리안이 북회랑 흔적을 추적하며 다음 행동을 정한다.",
    role_in_arc: "rising_action",
    scenes: [
      {
        purpose: "세라가 북회랑 봉인 흔적을 확인하고 리안에게 누군가가 봉인을 시험했다고 말한다.",
        type: "dialogue",
        characters: ["hero", "ally"],
        estimated_chars: 1200,
        emotional_tone: "긴장",
        must_reveal: ["누군가가 북회랑 봉인을 시험한 흔적이 남아 있다."],
        triggered_by: "직전 화에서 사라진 황실 장부의 행방이 북회랑으로 좁혀졌다.",
        leads_to: "세라와 리안이 북회랑 내부를 함께 수색하기로 결론낸다.",
        where_detail: "북회랑 입구",
      },
      {
        purpose: "리안이 수색 계획을 확정하고 세라와 함께 북회랑 안쪽으로 진입한다.",
        type: "action",
        characters: ["ally", "hero"],
        estimated_chars: 1000,
        emotional_tone: "결의",
        must_reveal: ["리안과 세라가 즉시 북회랑 내부 수색을 시작한다."],
        triggered_by: "봉인 흔적이 단순 소문이 아니라는 사실이 확인됐다.",
        leads_to: "다음 화에서 북회랑 내부 단서를 직접 마주하게 된다.",
        where_detail: "북회랑 안쪽 계단",
      },
    ],
    dependencies: [],
    target_word_count: 2200,
    emotional_arc: "긴장→결의",
    key_points: [],
    characters_involved: ["hero", "ally"],
    tension_level: 7,
    foreshadowing_actions: [],
    pov: "third",
    pov_character: "hero",
  };
}

describe("emitGeneratedChapterSceneLedger", () => {
  it("writes one complete causal event per finalized scene in chapter order", () => {
    const seed = makeSimulationTestSeed();
    const authority = createWorldStateAuthority(seed);
    const blueprint = makeBlueprint();

    const emitted = emitGeneratedChapterSceneLedger(authority, {
      seed,
      chapterNumber: 4,
      blueprint,
      sceneTexts: [
        "세라는 봉인 틈의 금속 가루를 손끝으로 문질렀다. 리안은 그 흔적이 방금 생긴 것처럼 선명하다고 중얼거렸다.",
        "리안은 먼저 계단 아래를 보겠다고 말했고, 세라는 횃불을 들어 길을 밝혔다.",
      ],
    });

    const state = authority.getSimulationState();
    const firstEvent = state.eventLog[0];
    const secondEvent = state.eventLog[1];
    const sceneFacts = listObjectiveFacts(state.objectiveFacts, {
      category: "discovery",
    }).filter((fact) => fact.sourceEventId?.startsWith("evt_ch004_sc"));

    expect(emitted).toHaveLength(2);
    expect(firstEvent).toMatchObject({
      id: "evt_ch004_sc01_plot",
      type: "plot_action",
      sceneId: "scene_004_01",
      actorId: "hero",
      targetId: "ally",
      tags: expect.arrayContaining([
        "pipeline:generated-scene",
        "major-plot-action",
      ]),
    });
    expect(firstEvent?.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prerequisiteId: "scene-trigger:scene_004_01",
          type: "scene_state",
        }),
      ]),
    );
    expect(firstEvent?.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "objective_fact_created" }),
        expect.objectContaining({ type: "memory_recorded" }),
      ]),
    );

    expect(secondEvent?.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prerequisiteId: "prior-event:evt_ch004_sc01_plot",
          type: "event",
          eventId: "evt_ch004_sc01_plot",
        }),
      ]),
    );

    expect(sceneFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceEventId: "evt_ch004_sc01_plot",
          subject: "누군가가 북회랑 봉인을 시험한 흔적이 남아 있다.",
          predicate: "major_action",
          object: "누군가가 북회랑 봉인을 시험한 흔적이 남아 있다.",
        }),
        expect.objectContaining({
          sourceEventId: "evt_ch004_sc02_plot",
          subject: "리안과 세라가 즉시 북회랑 내부 수색을 시작한다.",
          predicate: "major_action",
          object: "리안과 세라가 즉시 북회랑 내부 수색을 시작한다.",
        }),
      ]),
    );

    expect(listCharacterMemories(state.memories, "hero")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chapter: 4,
          kind: "direct_experience",
          summary: "누군가가 북회랑 봉인을 시험한 흔적이 남아 있다.",
          references: expect.objectContaining({
            eventId: "evt_ch004_sc01_plot",
          }),
        }),
      ]),
    );
    expect(listCharacterMemories(state.memories, "ally")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chapter: 4,
          kind: "direct_experience",
          references: expect.objectContaining({
            eventId: "evt_ch004_sc02_plot",
          }),
        }),
      ]),
    );
  });
});
