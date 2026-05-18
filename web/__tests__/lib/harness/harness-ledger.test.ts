import { describe, expect, it, vi } from "vitest";

import type { PipelineAgent } from "@/lib/agents/pipeline";
import type { HarnessConfig } from "@/lib/harness";
import type { MasterPlan } from "@/lib/schema/planning";

import { makeSimulationTestSeed } from "../sim/fixtures/cognition-fixtures";

vi.mock("@/lib/memory/fact-extractor", () => ({
  extractChapterFacts: vi.fn().mockResolvedValue({
    chapter: 1,
    facts: [],
    character_states: [],
    summary: "fact extractor skipped for ledger integration test",
  }),
}));

vi.mock("@/lib/harness/config", () => ({
  getDefaultConfig: () => makeHarnessConfig(),
}));

class StaticScenePipelineAgent implements PipelineAgent {
  name = "static-scene";

  async *run(ctx: Parameters<PipelineAgent["run"]>[0]) {
    ctx.sceneTexts = [
      "세라는 봉인 자국을 손으로 짚으며 누군가가 먼저 다녀갔다고 확신했다.",
      "리안은 즉시 계단 아래를 확인하자고 말했고 세라는 고개를 끄덕였다.",
    ];
    ctx.text = ctx.sceneTexts.join("\n\n");
    ctx.bestScore = 0.92;
    yield { type: "replace_text", content: ctx.text } as const;
  }
}

function makeHarnessConfig(): HarnessConfig {
  return {
    name: "ledger-test",
    models: {
      planning: "test",
      writing: "test",
      critique: "test",
      repair: "test",
      default: "test",
    },
    pipeline: [{ enabled: true, create: () => new StaticScenePipelineAgent() }],
    qualityThreshold: 0.8,
    maxAttempts: 1,
    budgetUsd: null,
    evalDimensions: [],
    tracking: {
      memory: false,
      characters: false,
      threads: false,
      tone: false,
      progress: false,
      feedback: false,
    },
    output: { mode: "silent", verbose: false },
    chapterLength: { min: 1, max: 1 },
    fastMode: false,
    parallelMode: false,
    simpleMode: false,
  };
}

function makeMasterPlan(): MasterPlan {
  return {
    estimated_total_chapters: { min: 1, max: 1 },
    world_complexity: {
      faction_count: 0,
      location_count: 1,
      power_system_depth: "shallow",
      subplot_count: 0,
    },
    global_foreshadowing_timeline: [],
    parts: [
      {
        id: "part-1",
        name: "part-1",
        start_chapter: 1,
        end_chapter: 1,
        theme: "mystery",
        core_conflict: "봉인 흔적의 정체",
        resolution_target: "북회랑 진입",
        estimated_chapter_count: 1,
        transition_to_next: "",
        arcs: [
          {
            id: "arc-1",
            name: "arc-1",
            part_id: "part-1",
            start_chapter: 1,
            end_chapter: 1,
            summary: "북회랑 흔적을 확인한다.",
            theme: "discovery",
            key_events: [],
            climax_chapter: 1,
            tension_curve: [7],
            chapter_blueprints: [
              {
                chapter_number: 1,
                title: "북회랑의 흔적",
                arc_id: "arc-1",
                one_liner: "세라와 리안이 북회랑 흔적을 확인하고 진입을 결정한다.",
                role_in_arc: "setup",
                scenes: [
                  {
                    purpose: "세라가 북회랑 봉인 흔적을 확인하고 리안에게 누군가가 먼저 다녀갔다고 말한다.",
                    type: "dialogue",
                    characters: ["hero", "ally"],
                    estimated_chars: 1000,
                    emotional_tone: "긴장",
                    must_reveal: ["누군가가 북회랑 봉인을 시험한 흔적이 남아 있다."],
                    triggered_by: "사라진 장부의 마지막 행선지가 북회랑으로 좁혀졌다.",
                    leads_to: "세라와 리안이 북회랑 내부 확인을 결정한다.",
                    where_detail: "북회랑 입구",
                  },
                  {
                    purpose: "리안이 수색 순서를 정하고 세라와 함께 북회랑 안쪽으로 들어간다.",
                    type: "action",
                    characters: ["ally", "hero"],
                    estimated_chars: 1000,
                    emotional_tone: "결의",
                    must_reveal: ["리안과 세라가 즉시 북회랑 내부 수색을 시작한다."],
                    triggered_by: "봉인 흔적이 실제 사건임이 확인됐다.",
                    leads_to: "다음 화에서 북회랑 내부 단서를 직접 마주한다.",
                    where_detail: "북회랑 계단",
                  },
                ],
                dependencies: [],
                target_word_count: 2000,
                emotional_arc: "긴장→결의",
                key_points: [],
                characters_involved: ["hero", "ally"],
                tension_level: 7,
                foreshadowing_actions: [],
                pov: "third",
                pov_character: "hero",
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("NovelHarness causal ledger integration", () => {
  it("emits finalized scene ledger events into the end-to-end run result", async () => {
    const { NovelHarness } = await import("@/lib/harness");
    const seed = makeSimulationTestSeed();
    seed.story_threads = [{
      id: "north-corridor",
      name: "북회랑 음모",
      type: "main",
      description: "북회랑 봉인 흔적의 원인을 추적한다",
      relations: [],
      reveal_timeline: [],
    }];

    const harness = new NovelHarness(makeHarnessConfig());
    (harness as unknown as { _directionDesign: object })._directionDesign = {};

    const outcome = await harness.runToCompletion(seed, 1, 1, {
      masterPlan: makeMasterPlan(),
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.result.causalLedger?.events).toEqual([
      expect.objectContaining({
        id: "evt_ch001_sc01_plot",
        type: "plot_action",
        sceneId: "scene_001_01",
      }),
      expect.objectContaining({
        id: "evt_ch001_sc02_plot",
        type: "plot_action",
        sceneId: "scene_001_02",
      }),
    ]);
    expect(outcome.result.causalLedger?.events[1]?.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prerequisiteId: "prior-event:evt_ch001_sc01_plot",
          eventId: "evt_ch001_sc01_plot",
        }),
      ]),
    );
    expect(outcome.result.causalLedgerValidation).toMatchObject({
      passed: true,
      majorPlotActionCount: 2,
      issueCount: 0,
      issues: [],
    });
    expect(outcome.result.causalLedgerAggregation).toMatchObject({
      totalEventCount: 2,
      totalEpisodeCount: 1,
      episodeSpan: {
        start: 1,
        end: 1,
      },
      perEpisode: [
        expect.objectContaining({
          episode: 1,
          eventCount: 2,
          eventIds: ["evt_ch001_sc01_plot", "evt_ch001_sc02_plot"],
          inboundCrossEpisodeLinkIds: [],
          outboundCrossEpisodeLinkIds: [],
        }),
      ],
      crossEpisode: {
        totalLinkCount: 0,
        resolvedLinkCount: 0,
        unresolvedLinkCount: 0,
        links: [],
      },
    });
  });
});
