import { describe, expect, it, vi } from "vitest";

import type { PipelineAgent } from "@/lib/agents/pipeline";
import type {
  HarnessConfig,
  HarnessEvent,
  RendererRegenerationRequest,
} from "@/lib/harness";
import {
  createLedgerScopedRendererRegenerationRequest,
  createRendererSceneSnapshots,
} from "@/lib/harness";
import { addCharacterBelief, createSimulationState } from "@/lib/sim";

import { makeSimulationTestSeed } from "../sim/fixtures/cognition-fixtures";

vi.mock("@/lib/planning/master-planner", () => ({
  generateMasterPlan: vi.fn(),
}));

vi.mock("@/lib/harness/config", () => ({
  getDefaultConfig: () => makeHarnessConfig(),
}));

class RendererOnlyPipelineAgent implements PipelineAgent {
  name = "renderer-only";

  async *run(ctx: Parameters<PipelineAgent["run"]>[0]) {
    ctx.text = "재렌더링된 본문이다. 같은 사건을 유지한 채 prose만 정리했다.";
    ctx.bestScore = 0.91;
    yield { type: "replace_text", content: ctx.text } as const;
  }
}

class MutatingRendererPipelineAgent implements PipelineAgent {
  name = "renderer-mutating";

  async *run(ctx: Parameters<PipelineAgent["run"]>[0]) {
    ctx.worldStateAuthority?.applyEvent({
      id: "evt-illegal-regen-mutation",
      type: "plot_action",
      chapter: ctx.chapterNumber,
      actorId: "hero",
      summary: "재렌더링 중 사건 상태를 불법으로 바꾼다.",
      participants: ["hero"],
      objectiveFactIds: [],
      cognition: {
        experiencedBy: ["hero"],
        interpretedBy: [],
        witnesses: ["hero"],
      },
      memoryUpdates: [],
      beliefUpdates: [],
      utteranceIds: [],
      causes: [],
      effects: [],
      tags: ["illegal-mutation"],
    } as never);
    ctx.text = "상태를 바꿔버린 잘못된 prose.";
    yield { type: "replace_text", content: ctx.text } as const;
  }
}

class ScopedSceneRendererPipelineAgent implements PipelineAgent {
  name = "renderer-scoped";

  async *run(ctx: Parameters<PipelineAgent["run"]>[0]) {
    expect(ctx.blueprint?.scenes).toHaveLength(1);
    ctx.sceneTexts = [
      "세라는 봉인 가장자리를 손끝으로 짚으며 방금 전까지 남아 있던 열기를 확인했다.",
    ];
    ctx.text = ctx.sceneTexts.join("\n\n");
    ctx.bestScore = 0.94;
    yield { type: "replace_text", content: ctx.text } as const;
  }
}

class ScopeViolatingRendererPipelineAgent implements PipelineAgent {
  name = "renderer-scope-violating";

  async *run(ctx: Parameters<PipelineAgent["run"]>[0]) {
    ctx.sceneTexts = [
      "첫 번째 씬까지 다시 써버린다.",
      "승인된 씬도 다시 쓴다.",
    ];
    ctx.text = ctx.sceneTexts.join("\n\n");
    yield { type: "replace_text", content: ctx.text } as const;
  }
}

function makeHarnessConfig(): HarnessConfig {
  return {
    name: "renderer-regeneration-test",
    models: {
      planning: "test",
      writing: "test",
      critique: "test",
      repair: "test",
      default: "test",
    },
    pipeline: [{ enabled: true, create: () => new RendererOnlyPipelineAgent() }],
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

describe("NovelHarness renderer regeneration mode", () => {
  it("re-renders from the supplied snapshot without triggering replanning", async () => {
    const { NovelHarness } = await import("@/lib/harness");
    const { generateMasterPlan } = await import("@/lib/planning/master-planner");
    const seed = makeSimulationTestSeed();
    const harness = new NovelHarness(makeHarnessConfig());
    const failedText =
      "세라는 북회랑 봉인 흔적을 보며 누군가 먼저 왔다고 생각했다. 세라는 북회랑 봉인 흔적을 보며 누군가 먼저 왔다고 생각했다.";
    const simulationState = createSimulationState(seed);
    simulationState.eventLog.push({
      id: "evt-regen-1",
      type: "knowledge_reveal",
      chapter: 1,
      actorId: "hero",
      summary: "세라가 북회랑 봉인 흔적을 직접 확인했다.",
      participants: ["hero"],
      objectiveFactIds: [],
      cognition: {
        experiencedBy: ["hero"],
        interpretedBy: [],
        witnesses: ["hero"],
      },
      memoryUpdates: [],
      beliefUpdates: [],
      utteranceIds: [],
      causes: [],
      effects: [],
      tags: ["observation"],
    } as never);
    addCharacterBelief(simulationState.beliefs, {
      characterId: "hero",
      chapter: 1,
      kind: "interpretation",
      subject: "북회랑 봉인 흔적",
      belief: "누군가 자신보다 먼저 북회랑에 도착했다.",
      confidence: "medium",
      cause: "봉인 흔적과 남겨진 발자국을 연결한 추론",
      references: {
        eventId: "evt-regen-1",
      },
    });
    const request = {
      snapshot: {
        chapterNumber: 2,
        blueprint: {
          chapter_number: 2,
          title: "봉인 흔적의 재정리",
          arc_id: "arc-regen",
          one_liner: "기존 서사를 유지한 채 prose만 다시 다듬는다.",
          role_in_arc: "rising_action",
          scenes: [],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: ["hero"],
          tension_level: 6,
          target_word_count: 3000,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [{
          chapter: 1,
          title: "1화",
          summary: "세라가 북회랑 봉인 흔적을 발견했다.",
        }],
        previousChapterEnding: "세라는 봉인 흔적을 내려다보며 누군가 먼저 다녀갔다고 생각했다.",
        simulationState,
        worldStateProjection: [{
          chapter: 1,
          facts: [],
          character_states: [],
          summary: "이전 화 요약",
        }],
      },
      proseFailureContext: {
        summary: "설명 문장이 길고, 같은 사실을 두 번 반복한다.",
        issues: ["행동보다 요약이 먼저 나온다."],
        preserve: ["북회랑 봉인 흔적 발견", "세라의 의심"],
        failedText,
      },
    } as const satisfies RendererRegenerationRequest;
    const snapshotBefore = structuredClone(request.snapshot);

    const events: HarnessEvent[] = [];
    for await (const event of harness.run(seed, 2, 2, {
      rendererRegeneration: request,
    })) {
      events.push(event);
    }

    expect(generateMasterPlan).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "plan_generated")).toBe(false);

    const completeEvent = events.find((event) => event.type === "chapter_complete");
    expect(completeEvent).toMatchObject({
      type: "chapter_complete",
      result: {
        chapterNumber: 2,
        text: "재렌더링된 본문이다. 같은 사건을 유지한 채 prose만 정리했다.",
      },
    });

    const doneEvent = events.find((event) => event.type === "done");
    expect(doneEvent).toMatchObject({
      type: "done",
      result: {
        mode: "renderer_regeneration",
        chapters: [
          expect.objectContaining({
            chapterNumber: 2,
          }),
        ],
      },
    });
    expect(completeEvent).toMatchObject({
      type: "chapter_complete",
      result: {
        rendererRegenerationRequest: {
          snapshot: {
            stateIdentity: expect.objectContaining({
              overallSha256: expect.any(String),
              segments: expect.objectContaining({
                beliefs: expect.objectContaining({
                  recordCount: 1,
                }),
                events: expect.objectContaining({
                  recordCount: 1,
                }),
                continuity: expect.objectContaining({
                  recordCount: 1,
                }),
              }),
            }),
          },
          immutabilityReport: expect.objectContaining({
            byteEquivalent: true,
            rehydratedMatchesBaseline: true,
            postRenderMatchesBaseline: true,
            segmentComparisons: {
              beliefs: expect.objectContaining({
                rehydratedMatchesBaseline: true,
                postRenderMatchesBaseline: true,
              }),
              events: expect.objectContaining({
                rehydratedMatchesBaseline: true,
                postRenderMatchesBaseline: true,
              }),
              continuity: expect.objectContaining({
                rehydratedMatchesBaseline: true,
                postRenderMatchesBaseline: true,
              }),
            },
          }),
        },
      },
    });
    expect(completeEvent?.result.text).not.toBe(failedText);
    expect(completeEvent?.result.text).toBe(
      "재렌더링된 본문이다. 같은 사건을 유지한 채 prose만 정리했다.",
    );
    expect(
      completeEvent?.result.rendererRegenerationRequest?.snapshot.simulationState,
    ).toEqual(snapshotBefore.simulationState);
    expect(
      completeEvent?.result.rendererRegenerationRequest?.snapshot.worldStateProjection,
    ).toEqual(snapshotBefore.worldStateProjection);
    expect(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.baseline.overallSha256,
    ).toBe(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.rehydrated.overallSha256,
    );
    expect(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.baseline.overallSha256,
    ).toBe(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.postRender.overallSha256,
    );
    expect(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.segmentComparisons.beliefs.baseline.sha256,
    ).toBe(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.segmentComparisons.beliefs.postRender.sha256,
    );
    expect(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.segmentComparisons.events.baseline.sha256,
    ).toBe(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.segmentComparisons.events.postRender.sha256,
    );
    expect(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.segmentComparisons.continuity.baseline.sha256,
    ).toBe(
      completeEvent?.result.rendererRegenerationRequest?.immutabilityReport?.segmentComparisons.continuity.postRender.sha256,
    );
    expect(request.snapshot).toEqual(snapshotBefore);
  });

  it("fails renderer-only regeneration if the pipeline mutates read-only narrative state", async () => {
    const { NovelHarness } = await import("@/lib/harness");
    const seed = makeSimulationTestSeed();
    const harness = new NovelHarness({
      ...makeHarnessConfig(),
      pipeline: [{ enabled: true, create: () => new MutatingRendererPipelineAgent() }],
    });
    const request = {
      snapshot: {
        chapterNumber: 2,
        blueprint: {
          chapter_number: 2,
          title: "불변성 위반",
          arc_id: "arc-regen",
          one_liner: "prose만 고쳐야 한다.",
          role_in_arc: "rising_action",
          scenes: [],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: ["hero"],
          tension_level: 6,
          target_word_count: 3000,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [],
        simulationState: createSimulationState(seed),
        worldStateProjection: [],
      },
      proseFailureContext: {
        summary: "문장만 고쳐야 한다.",
      },
    } as const satisfies RendererRegenerationRequest;

    await expect(async () => {
      for await (const _event of harness.run(seed, 2, 2, {
        rendererRegeneration: request,
      })) {
        // drain
      }
    }).rejects.toThrow(/Renderer regeneration mutated read-only narrative state/);
  });

  it("re-renders only ledger-impacted scenes and keeps preserved scenes byte-stable", async () => {
    const { NovelHarness } = await import("@/lib/harness");
    const seed = makeSimulationTestSeed();
    const harness = new NovelHarness({
      ...makeHarnessConfig(),
      pipeline: [{ enabled: true, create: () => new ScopedSceneRendererPipelineAgent() }],
    });
    const simulationState = createSimulationState(seed);
    const originalSceneTexts = [
      "첫 번째 씬은 그대로 남는다. 세라는 복도 끝에서 숨을 골랐다.",
      "두 번째 씬은 잘못된 ledger span 때문에 다시 써야 한다. 세라는 봉인을 보고도 같은 문장을 반복했다.",
      "세 번째 씬도 그대로 남는다. 문밖의 발소리는 아직 들리지 않았다.",
    ];
    const request = createLedgerScopedRendererRegenerationRequest(
      {
        chapterNumber: 2,
        blueprint: {
          chapter_number: 2,
          title: "봉인 흔적의 재정리",
          arc_id: "arc-regen",
          one_liner: "중간 씬만 다시 렌더링한다.",
          role_in_arc: "rising_action",
          scenes: [
            {
              purpose: "세라가 복도 끝에서 숨을 고르고 봉인 흔적을 살핀다.",
              type: "introspection",
              characters: ["hero"],
              estimated_chars: 900,
              emotional_tone: "긴장",
            },
            {
              purpose: "세라가 봉인 흔적의 열기를 확인하고 누군가 방금 다녀갔다고 판단한다.",
              type: "discovery",
              characters: ["hero"],
              estimated_chars: 1200,
              emotional_tone: "긴장",
            },
            {
              purpose: "세라가 다음 발소리를 듣고 몸을 숨긴다.",
              type: "action",
              characters: ["hero"],
              estimated_chars: 900,
              emotional_tone: "불안",
            },
          ],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: ["hero"],
          tension_level: 6,
          target_word_count: 3000,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [],
        previousChapterEnding: "직전 화 끝에서 세라는 북회랑 앞까지 도착했다.",
        simulationState,
        worldStateProjection: [],
        renderedScenes: createRendererSceneSnapshots(2, originalSceneTexts),
      },
      {
        ledger: [
          {
            id: "evt-regen-1",
            type: "learn_fact",
            chapter: 2,
            actorId: "hero",
            summary: "세라가 북회랑 봉인 가장자리의 열기를 확인한다.",
            sceneId: "scene_002_02",
            participants: ["hero"],
            objectiveFactIds: [],
            cognition: {
              experiencedBy: ["hero"],
              interpretedBy: [],
              witnesses: ["hero"],
            },
            memoryUpdates: [],
            beliefUpdates: [],
            utteranceIds: [],
            causes: [],
            effects: [],
            tags: ["observation"],
          } as never,
        ],
        correctionPlan: {
          replayScope: {
            startIndex: 0,
            endIndex: 0,
            startEventId: "evt-regen-1",
            endEventId: "evt-regen-1",
            startEpisode: 2,
            endEpisode: 2,
            eventIds: ["evt-regen-1"],
            dependentEventIds: [],
            impactedStateKeys: ["character:hero:belief"],
            reason: "중간 씬 observation event를 수정했다.",
          },
        },
        proseFailureContext: {
          summary: "ledger correction으로 중간 씬 prose만 다시 써야 한다.",
          failedText: originalSceneTexts[1],
        },
        sceneTexts: originalSceneTexts,
      },
    );

    const events: HarnessEvent[] = [];
    for await (const event of harness.run(seed, 2, 2, {
      rendererRegeneration: request,
    })) {
      events.push(event);
    }

    const completeEvent = events.find((event) => event.type === "chapter_complete");
    expect(completeEvent).toMatchObject({
      type: "chapter_complete",
      result: {
        text: [
          originalSceneTexts[0],
          "세라는 봉인 가장자리를 손끝으로 짚으며 방금 전까지 남아 있던 열기를 확인했다.",
          originalSceneTexts[2],
        ].join("\n\n"),
        rendererRegenerationRequest: {
          regenerationScope: {
            mode: "scoped_scene_patch",
            impactedSceneIds: ["scene_002_02"],
            preservedSceneIds: ["scene_002_01", "scene_002_03"],
          },
          proseStabilityReport: {
            byteStable: true,
            unrestrictedRewriteBlocked: true,
          },
        },
      },
    });
    expect(
      completeEvent?.result.rendererRegenerationRequest?.snapshot.renderedScenes?.map(
        (scene) => scene.text,
      ),
    ).toEqual([
      originalSceneTexts[0],
      "세라는 봉인 가장자리를 손끝으로 짚으며 방금 전까지 남아 있던 열기를 확인했다.",
      originalSceneTexts[2],
    ]);
  });

  it("rejects scoped regeneration outputs that widen the approved scene rewrite", async () => {
    const { NovelHarness } = await import("@/lib/harness");
    const seed = makeSimulationTestSeed();
    const harness = new NovelHarness({
      ...makeHarnessConfig(),
      pipeline: [{ enabled: true, create: () => new ScopeViolatingRendererPipelineAgent() }],
    });
    const request = createLedgerScopedRendererRegenerationRequest(
      {
        chapterNumber: 2,
        blueprint: {
          chapter_number: 2,
          title: "범위 위반",
          arc_id: "arc-regen",
          one_liner: "승인된 씬만 다시 써야 한다.",
          role_in_arc: "rising_action",
          scenes: [
            {
              purpose: "세라가 복도 끝에서 흔적을 본다.",
              type: "discovery",
              characters: ["hero"],
              estimated_chars: 900,
              emotional_tone: "긴장",
            },
            {
              purpose: "세라가 봉인의 열기를 확인한다.",
              type: "discovery",
              characters: ["hero"],
              estimated_chars: 900,
              emotional_tone: "긴장",
            },
          ],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: ["hero"],
          tension_level: 6,
          target_word_count: 1800,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [],
        simulationState: createSimulationState(seed),
        worldStateProjection: [],
        renderedScenes: createRendererSceneSnapshots(2, [
          "첫 번째 씬은 보존 대상이다.",
          "두 번째 씬만 교체 대상이다.",
        ]),
      },
      {
        ledger: [
          {
            id: "evt-regen-2",
            type: "learn_fact",
            chapter: 2,
            actorId: "hero",
            summary: "세라가 두 번째 씬에서 봉인의 열기를 확인한다.",
            sceneId: "scene_002_02",
            participants: ["hero"],
            objectiveFactIds: [],
            cognition: {
              experiencedBy: ["hero"],
              interpretedBy: [],
              witnesses: ["hero"],
            },
            memoryUpdates: [],
            beliefUpdates: [],
            utteranceIds: [],
            causes: [],
            effects: [],
            tags: ["observation"],
          } as never,
        ],
        correctionPlan: {
          replayScope: {
            startIndex: 0,
            endIndex: 0,
            startEventId: "evt-regen-2",
            endEventId: "evt-regen-2",
            startEpisode: 2,
            endEpisode: 2,
            eventIds: ["evt-regen-2"],
            dependentEventIds: [],
            impactedStateKeys: [],
            reason: "두 번째 씬만 보정 대상이다.",
          },
        },
        sceneTexts: [
          "첫 번째 씬은 보존 대상이다.",
          "두 번째 씬만 교체 대상이다.",
        ],
      },
    );

    await expect(async () => {
      for await (const _event of harness.run(seed, 2, 2, {
        rendererRegeneration: request,
      })) {
        // drain
      }
    }).rejects.toThrow(/unrestricted rewrite outside the approved scene scope/);
  });
});
