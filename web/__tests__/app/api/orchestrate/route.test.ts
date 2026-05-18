// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { runChapterGenerationPipeline } from "@/lib/cli/pipeline-run";
import { assertChapterGenerationReleaseParity } from "@/lib/novel-engine";
import { buildSimulationCausalLedgerAggregation } from "@/lib/sim";
import {
  buildApiBodyForParityScenario,
  createParityHarnessConfig,
  createParityHarnessMockImplementation,
  createStandardParityScenario,
  ParityPassingHarness,
} from "../../../helpers/chapter-generation-parity";

const mockRun = vi.fn();

vi.mock("@/lib/harness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/harness")>(
    "@/lib/harness",
  );

  class MockNovelHarness {
    run = mockRun;
  }

  return {
    ...actual,
    NovelHarness: MockNovelHarness,
    getDefaultConfig: vi.fn().mockReturnValue({}),
    getBudgetConfig: vi.fn().mockReturnValue({}),
    getFastConfig: vi.fn().mockReturnValue({}),
  };
});

async function callRoute(body: unknown) {
  const { POST } = await import("@/app/api/orchestrate/route");
  const request = new Request("http://localhost/api/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await POST(request as never);
  return { response, text: await response.text() };
}

function parseSsePayloads(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => chunk.slice("data: ".length))
    .filter((chunk) => chunk.length > 0 && chunk !== "[DONE]")
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

describe("POST /api/orchestrate", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRun.mockImplementation(async function* () {
      yield {
        type: "done",
        result: {
          config: "default",
          chapters: [],
          totalUsage: {
            prompt_tokens: 12,
            completion_tokens: 20,
            total_tokens: 32,
            cost_usd: 0.12,
          },
          totalDurationMs: 4500,
          totalCostUsd: 0.12,
          canonicalValidationFailures: [],
          causalLedgerAggregation: buildSimulationCausalLedgerAggregation([
            {
              id: "evt_stream_001",
              chapter: 1,
              type: "learn_fact",
              actorId: "hero",
              summary: "스트리밍 계약에서 집계가 전달된다.",
              prerequisites: [],
              involvedEntities: [],
              outcomes: [],
              stateChanges: [],
              tags: ["route-test"],
              payload: {
                subject: "route test clue",
                object: "delivered",
              },
            },
          ]),
          causalLedgerValidation: {
            passed: false,
            majorPlotActionCount: 0,
            issueCount: 1,
            issues: [
              {
                code: "episode_order_violation",
                eventId: "evt_late_cause",
                chapter: 3,
                episode: 3,
                referencedEventId: "evt_early_effect",
                message: "Event \"evt_late_cause\" is out of chronology after \"evt_early_effect\".",
              },
            ],
          },
        },
      };
    });
  });

  it("includes intentional-abandonment markers in the harness_done payload", async () => {
    const { response, text } = await callRoute({
      seed: {
        title: "복선 폐기 API 계약",
        logline: "스트리밍 완료 이벤트가 폐기 복선을 노출해야 한다.",
        total_chapters: 300,
        world: {
          name: "회랑",
          genre: "fantasy",
          sub_genre: "romantasy",
          time_period: "중세풍",
          magic_system: null,
          key_locations: {},
          factions: {},
          rules: [],
        },
        characters: [],
        story_threads: [],
        arcs: [],
        chapter_outlines: [],
        extended_outlines: [],
        foreshadowing: [
          {
            id: "fs_cut",
            name: "폐기된 회랑 떡밥",
            description: "구조 개편으로 의도적으로 폐기된 회랑 떡밥",
            importance: "minor",
            planted_at: 4,
            hints_at: [],
            reveal_at: null,
            abandonment_reason: "timeline compression removed the redundant clue line",
            abandonment_marker: "intentional-abandonment:timeline-cut",
            origin: {
              episode_id: "ep_004",
              scene_id: "scene_004_corridor",
              source_span: {
                start_offset: 7,
                end_offset: 25,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
        ],
        style: {
          max_paragraph_length: 3,
          dialogue_ratio: 0.6,
          sentence_style: "short",
          hook_ending: true,
          pov: "1인칭",
          tense: "과거형",
          formatting_rules: [],
        },
      },
      chapterNumber: 1,
      previousSummaries: [],
      preset: "default",
    });

    expect(response.status).toBe(200);

    const events = parseSsePayloads(text);
    const doneEvent = events.find((event) => event.type === "harness_done");

    expect(doneEvent).toMatchObject({
      type: "harness_done",
      run: {
        workflow: "chapter_generation",
        ok: true,
        request: {
          input: {
            workflow: "chapter_generation",
            startChapter: 1,
            endChapter: 1,
          },
          options: {
            preset: "default",
            verbose: false,
            budgetUsd: null,
          },
        },
        progress: {
          status: "completed",
          totalStageCount: 7,
          completedStageCount: 7,
        },
        state: {
          workflow: "chapter_generation",
          chapterRange: {
            startChapter: 1,
            endChapter: 1,
            generatedChapterCount: 0,
          },
          verification: {
            causalLedgerIssueCount: 1,
            contradictionViolationCount: 1,
          },
        },
        artifacts: [],
      },
      foreshadowingVerificationItems: [
        {
          id: "fs_cut",
          lifecycle: "intentionally_abandoned",
          terminalState: {
            status: "intentionally_abandoned",
            source: "abandonment_marker",
            provenance: {
              sourceEpisodeIds: ["ep_004"],
              sourceSceneIds: ["scene_004_corridor"],
              sourceOccurrenceCount: 1,
            },
          },
          abandonmentReason:
            "timeline compression removed the redundant clue line",
          abandonmentMarker: "intentional-abandonment:timeline-cut",
          intentionalAbandonment: {
            marker: "intentional-abandonment:timeline-cut",
            source: "abandonment_marker",
            provenance: {
              sourceEpisodeIds: ["ep_004"],
              sourceSceneIds: ["scene_004_corridor"],
              sourceOccurrenceCount: 1,
            },
          },
          sourceEpisodeIds: ["ep_004"],
          sourceSceneIds: ["scene_004_corridor"],
          sourceOccurrenceCount: 1,
        },
      ],
      foreshadowContinuityVerifierReport: {
        resolutionWindowEpisodes: 80,
        evaluationHorizonEpisode: 0,
        totals: {
          total: 1,
          resolvedWithinWindow: 0,
          pending: 0,
          missed: 0,
          expired: 0,
          intentionallyAbandoned: 1,
        },
        items: [
          {
            id: "fs_cut",
            status: "intentionally_abandoned",
            resolutionEpisode: null,
            resolutionEpisodeId: null,
            countsAsFailure: false,
            threadVerdictClassification: "intentional_non_failure_closure",
            expiryReasoning: {
              kind: "intentionally_abandoned",
              deadlineEpisode: 84,
              evaluationHorizonEpisode: 0,
            },
          },
        ],
      },
      foreshadowVerificationVerdictSummary: {
        totalThreads: 1,
        resolvedThreads: 0,
        failureThreads: 0,
        intentionalNonFailureClosures: 1,
        invalidPayoffFailures: 0,
        unresolvedFailures: 0,
        nonTerminalFailures: 0,
        threadVerdicts: [
          {
            id: "fs_cut",
            classification: "intentional_non_failure_closure",
            countsAsFailure: false,
          },
        ],
      },
      foreshadowResolutionWindowSummary: {
        resolutionWindowEpisodes: 80,
        evaluationHorizonEpisode: 0,
        totals: {
          total: 1,
          resolvedWithinWindow: 0,
          pending: 0,
          missed: 0,
          expired: 0,
          intentionallyAbandoned: 1,
        },
        items: [
          {
            id: "fs_cut",
            windowStatus: "intentionally_abandoned",
            resolutionDeadlineEpisode: 84,
            firstResolutionEvent: null,
          },
        ],
      },
      causalLedgerValidation: {
        passed: false,
        majorPlotActionCount: 0,
        issueCount: 1,
        issues: [
          {
            code: "episode_order_violation",
            eventId: "evt_late_cause",
            chapter: 3,
            episode: 3,
            referencedEventId: "evt_early_effect",
          },
        ],
      },
      contradictionValidation: {
        passed: false,
        contradiction_count: 1,
        totalViolationCount: 1,
        detectedCognitionViolationCount: 0,
        counts: {
          belief: 0,
          memory: 0,
          utterance: 0,
          continuity: 1,
        },
        continuityViolations: [
          {
            code: "episode_order_violation",
            eventId: "evt_late_cause",
            chapter: 3,
            episode: 3,
            referencedEventId: "evt_early_effect",
          },
        ],
        episodeDiagnostics: [
          {
            episode: 3,
            episodeId: "ep_003",
            contradictionCount: 1,
            details: [
              {
                sourceType: "continuity",
                contradictionType: "episode_order_violation",
                eventId: "evt_late_cause",
                referencedEventId: "evt_early_effect",
              },
            ],
          },
        ],
      },
      causalLedgerAggregation: {
        totalEventCount: 1,
        totalEpisodeCount: 1,
        episodeSpan: {
          start: 1,
          end: 1,
        },
        perEpisode: [
          {
            episode: 1,
            eventCount: 1,
            eventIds: ["evt_stream_001"],
            inboundCrossEpisodeLinkIds: [],
            outboundCrossEpisodeLinkIds: [],
          },
        ],
        crossEpisode: {
          totalLinkCount: 0,
          resolvedLinkCount: 0,
          unresolvedLinkCount: 0,
          links: [],
        },
      },
    });
  });

  it("forwards canonical uncaused-mismatch failures through the streaming error and done payloads", async () => {
    const canonicalValidationFailure = {
      code: "simulation_validation_failed" as const,
      chapter: 1,
      summary: "1화에서 belief 상태가 canonical truth와 충돌했지만 explicit cause가 없습니다.",
      invalidContradictionCount: 1,
      allowedExceptionCount: 0,
      issueCount: 1,
      mismatchCount: 1,
      uncausedMismatchFailures: [
        {
          code: "uncaused_mismatch",
          message:
            "No explicit recorded cause was available for belief:belief:missing-cause (canonical_conflict).",
          mismatch: {
            recordType: "belief",
            recordId: "belief:missing-cause",
            characterId: "hero",
            chapter: 1,
            mismatchType: "canonical_conflict",
            factIds: ["fact:sealed-gate"],
          },
          missingCause: {
            path: "divergenceCause",
            required: "explicit_divergence_cause",
            allowedKinds: ["misinterpretation", "lack_of_information"],
          },
          failureContext: {
            triggeringEventId: "evt-sealed-gate",
            contradictedFactId: "fact:sealed-gate",
            objectiveFactIds: ["fact:sealed-gate"],
            traceabilityAnchors: [],
            unresolvedTraceabilityReferences: [],
          },
        },
      ],
    };

    mockRun.mockImplementationOnce(async function* () {
      yield {
        type: "error",
        chapter: 1,
        message: canonicalValidationFailure.summary,
        code: "simulation_validation_failed",
        canonicalValidationFailure,
      };
      yield {
        type: "done",
        result: {
          config: "default",
          chapters: [],
          totalUsage: {
            prompt_tokens: 12,
            completion_tokens: 20,
            total_tokens: 32,
            cost_usd: 0.12,
          },
          totalDurationMs: 4500,
          totalCostUsd: 0.12,
          canonicalValidationFailures: [canonicalValidationFailure],
        },
      };
    });

    const { response, text } = await callRoute({
      seed: {
        title: "canonical failure stream contract",
        logline: "스트리밍 API가 canonical mismatch payload를 노출한다.",
        total_chapters: 300,
        world: {
          name: "회랑",
          genre: "fantasy",
          sub_genre: "romantasy",
          time_period: "중세풍",
          magic_system: null,
          key_locations: {},
          factions: {},
          rules: [],
        },
        characters: [],
        story_threads: [],
        arcs: [],
        chapter_outlines: [],
        extended_outlines: [],
        foreshadowing: [],
        style: {
          max_paragraph_length: 3,
          dialogue_ratio: 0.6,
          sentence_style: "short",
          hook_ending: true,
          pov: "1인칭",
          tense: "과거형",
          formatting_rules: [],
        },
      },
      chapterNumber: 1,
      previousSummaries: [],
      preset: "default",
    });

    expect(response.status).toBe(200);

    const events = parseSsePayloads(text);
    expect(events).toContainEqual({
      type: "error",
      message: canonicalValidationFailure.summary,
      code: "simulation_validation_failed",
      canonicalValidationFailure,
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "harness_done",
        canonicalValidationFailures: [canonicalValidationFailure],
      }),
    );
  });

  it("forwards belief interpretation recovery outcomes without rerunning prose", async () => {
    const beliefInterpretationRecovery = {
      chapter: 1,
      attempted: true,
      status: "recovered",
      triggerIssueCodes: ["missing_traceability_link"],
      targetedBeliefIds: ["belief:hero:3"],
      targetedCharacterIds: ["hero"],
      selectedMemoryIds: ["memory:hero:4"],
      recomputations: [
        {
          characterId: "hero",
          targetedBeliefIds: ["belief:hero:3"],
          selectedMemoryIds: ["memory:hero:4"],
          removedBeliefIds: ["belief:hero:3"],
          invalidatedInterpretationIds: ["belief-interpretation:hero:2"],
          createdBeliefIds: ["belief:hero:4"],
          createdInterpretationIds: ["belief-interpretation:hero:3"],
        },
      ],
      before: {
        passed: false,
        issueCount: 1,
        invalidContradictionCount: 1,
        targetedIssueCount: 1,
        targetedInvalidContradictionCount: 1,
      },
      after: {
        passed: true,
        issueCount: 0,
        invalidContradictionCount: 0,
        targetedIssueCount: 0,
        targetedInvalidContradictionCount: 0,
      },
      recoveredBeliefIds: ["belief:hero:3"],
      unresolvedBeliefIds: [],
      message:
        "Belief interpretation recovery rebuilt the failing belief set from existing memories.",
    } as const;

    mockRun.mockImplementationOnce(async function* () {
      yield {
        type: "chapter_complete",
        result: {
          chapterNumber: 1,
          text: "세라는 기억을 다시 더듬고 결론을 바로잡았다.",
          summary: {
            title: "1화",
            plot_summary: "기억 기반 재해석이 수행된다.",
            ending_scene_state: {
              location: "회랑",
              time_of_day: "night",
              characters_present: ["hero"],
              ongoing_action: "봉인 흔적을 다시 검토한다",
              unresolved_tension: "누가 흔적을 남겼는가",
            },
          },
          score: 0.84,
          usage: {
            prompt_tokens: 8,
            completion_tokens: 12,
            total_tokens: 20,
            cost_usd: 0.02,
          },
          durationMs: 45,
          verification: {
            passed: true,
            allowedExceptionCount: 1,
            invalidContradictionCount: 0,
          },
          beliefInterpretationRecovery,
        },
      };
      yield {
        type: "done",
        result: {
          config: "default",
          chapters: [],
          totalUsage: {
            prompt_tokens: 8,
            completion_tokens: 12,
            total_tokens: 20,
            cost_usd: 0.02,
          },
          totalDurationMs: 45,
          totalCostUsd: 0.02,
          beliefInterpretationRecoveries: [beliefInterpretationRecovery],
          canonicalValidationFailures: [],
        },
      };
    });

    const { response, text } = await callRoute({
      seed: {
        title: "belief recovery route contract",
        logline: "스트리밍 API가 믿음 재계산 복구 결과를 전달한다.",
        total_chapters: 300,
        world: {
          name: "회랑",
          genre: "fantasy",
          sub_genre: "romantasy",
          time_period: "중세풍",
          magic_system: null,
          key_locations: {},
          factions: {},
          rules: [],
        },
        characters: [],
        story_threads: [],
        arcs: [],
        chapter_outlines: [],
        extended_outlines: [],
        foreshadowing: [],
        style: {
          max_paragraph_length: 3,
          dialogue_ratio: 0.6,
          sentence_style: "short",
          hook_ending: true,
          pov: "1인칭",
          tense: "과거형",
          formatting_rules: [],
        },
      },
      chapterNumber: 1,
      previousSummaries: [],
      preset: "default",
    });

    expect(response.status).toBe(200);

    const events = parseSsePayloads(text);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "complete",
        beliefInterpretationRecovery,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "harness_done",
        beliefInterpretationRecoveries: [beliefInterpretationRecovery],
      }),
    );
  });

  it("forwards renderer regeneration requests and pins the run to the snapshot chapter", async () => {
    const rendererRegeneration = {
      snapshot: {
        chapterNumber: 7,
        blueprint: {
          chapter_number: 7,
          title: "7화",
          arc_id: "arc-7",
          one_liner: "기존 상태 스냅샷을 prose만 다시 렌더링한다.",
          role_in_arc: "rising_action",
          scenes: [],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: [],
          tension_level: 6,
          target_word_count: 3000,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [],
        simulationState: {
          seedTitle: "regen",
          chapterCursor: 6,
          objectiveFacts: { entries: [] },
          audienceKnowledge: [],
          characters: {},
          memories: { byCharacterId: {} },
          beliefs: { byCharacterId: {}, trustMatrix: {} },
          utterances: { byCharacterId: {} },
          foreshadowRegistry: { items: {} },
          threads: {},
          eventLog: [],
        },
        worldStateProjection: [],
      },
      proseFailureContext: {
        summary: "문체가 과도하게 설명적이다.",
        issues: ["행동보다 요약이 앞선다."],
      },
    };

    const { response } = await callRoute({
      seed: {
        title: "렌더 재생성 API 계약",
        logline: "기존 상태 스냅샷에서 prose만 다시 쓴다.",
        total_chapters: 300,
        world: {
          name: "회랑",
          genre: "fantasy",
          sub_genre: "romantasy",
          time_period: "중세풍",
          magic_system: null,
          key_locations: {},
          factions: {},
          rules: [],
        },
        characters: [],
        story_threads: [],
        arcs: [],
        chapter_outlines: [],
        extended_outlines: [],
        foreshadowing: [],
        style: {
          max_paragraph_length: 3,
          dialogue_ratio: 0.6,
          sentence_style: "short",
          hook_ending: true,
          pov: "1인칭",
          tense: "과거형",
          formatting_rules: [],
        },
      },
      chapterNumber: 7,
      previousSummaries: [],
      preset: "default",
      mode: "renderer_regeneration",
      batch: { startChapter: 1, endChapter: 9 },
      rendererRegeneration,
    });

    expect(response.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith(
      expect.anything(),
      7,
      7,
      expect.objectContaining({
        rendererRegeneration,
      }),
    );
  });

  it("emits the same artifact contract shape as the CLI for equivalent inputs", async () => {
    mockRun.mockImplementationOnce(createParityHarnessMockImplementation());
    const harnessModule = await import("@/lib/harness");
    vi.mocked(harnessModule.getDefaultConfig).mockReturnValue(
      createParityHarnessConfig(),
    );

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrate-parity-"));
    const outDir = path.join(tempDir, "out");
    const scenario = createStandardParityScenario();

    const { response, text } = await callRoute(
      buildApiBodyForParityScenario(scenario, outDir),
    );

    expect(response.status).toBe(200);

    const events = parseSsePayloads(text);
    const doneEvent = events.find((event) => event.type === "harness_done");
    expect(doneEvent).toBeDefined();

    const seedPath = path.join(tempDir, "seed.json");
    fs.writeFileSync(seedPath, JSON.stringify(scenario.seed, null, 2), "utf-8");

    const cliResult = await runChapterGenerationPipeline({
      args: [
        "--seed",
        seedPath,
        "--chapters",
        String(scenario.chapterNumber),
        "--out",
        outDir,
        "--quiet",
      ],
      cwd: tempDir,
      createHarness: () => new ParityPassingHarness() as never,
      resolveConfig: () => createParityHarnessConfig(),
    });

    const releaseValidation = assertChapterGenerationReleaseParity([
      {
        surface: "cli",
        contract: cliResult.contract,
      },
      {
        surface: "api",
        contract: (doneEvent as { run: typeof cliResult.contract }).run,
      },
    ]);
    expect(releaseValidation.ok).toBe(true);
  });
});
