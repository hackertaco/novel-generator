// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import type { HarnessConfig, HarnessEvent } from "@/lib/harness";
import {
  ChapterGenerationPipelineExitCode,
  ChapterGenerationWorkflowRunError,
  runProgrammaticChapterGenerationPipeline,
  getChapterGenerationPipelineExitCode,
  resolveChapterGenerationRunRequest,
  runChapterGenerationPipeline,
} from "@/lib/cli/pipeline-run";
import {
  createChapterGenerationProgrammaticRunRequest,
  type NovelWorkflowRunResult,
} from "@/lib/orchestration";

function createSeed() {
  return {
    title: "cli normalization smoke",
    logline: "정규화된 요청이 공유 코어로 전달된다.",
    total_chapters: 12,
    world: {
      name: "회랑",
      genre: "fantasy",
      sub_genre: "mystery",
      time_period: "unknown",
      magic_system: "sigils",
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    story_threads: [],
    arcs: [],
    foreshadowing: [],
    chapter_outlines: [],
    extended_outlines: [],
    style: {
      tone: "긴장",
      prose_guidelines: [],
      banned: [],
    },
  };
}

function createHarnessConfig(): HarnessConfig {
  return {
    name: "test",
    models: {
      planning: "test",
      writing: "test",
      critique: "test",
      repair: "test",
      default: "test",
    },
    pipeline: [],
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
    output: { mode: "file", verbose: false },
    chapterLength: { min: 1, max: 1 },
    fastMode: false,
    parallelMode: false,
    simpleMode: false,
  };
}

class PassingHarness {
  async *run(
    _seed: unknown,
    startChapter: number,
    _endChapter: number,
  ): AsyncGenerator<HarnessEvent> {
    yield { type: "chapter_start", chapter: startChapter };
    yield {
      type: "chapter_complete",
      result: {
        chapterNumber: startChapter,
        text: "CLI runner smoke chapter.",
        summary: {
          title: `${startChapter}화`,
          plot_summary: "공유 코어 실행 순서를 검증한다.",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: [],
            ongoing_action: "테스트 중",
            unresolved_tension: "단계 순서가 유지되는가",
          },
        } as never,
        score: 0.91,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          cost_usd: 0.01,
        },
        durationMs: 15,
      } as never,
    };
    yield {
      type: "done",
      result: {
        config: "test",
        chapters: [{
          chapterNumber: startChapter,
          text: "CLI runner smoke chapter.",
          summary: {
            title: `${startChapter}화`,
            plot_summary: "공유 코어 실행 순서를 검증한다.",
            ending_scene_state: {
              location: "회랑",
              time_of_day: "night",
              characters_present: [],
              ongoing_action: "테스트 중",
              unresolved_tension: "단계 순서가 유지되는가",
            },
          } as never,
          score: 0.91,
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            cost_usd: 0.01,
          },
          durationMs: 15,
        }],
        totalUsage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          cost_usd: 0.01,
        },
        totalDurationMs: 15,
        totalCostUsd: 0.01,
        canonicalValidationFailures: [],
        beliefInterpretationRecoveries: [],
      } as never,
    };
  }
}

describe("chapter generation CLI normalization", () => {
  it("loads YAML config files and applies CLI overrides before building a workflow request", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pipeline-run-request-"),
    );
    const configDir = path.join(tempDir, "config");
    fs.mkdirSync(configDir, { recursive: true });

    const seedPath = path.join(configDir, "seed.json");
    const configPath = path.join(configDir, "run.yml");

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");
    fs.writeFileSync(
      configPath,
      [
        'seedPath: "./seed.json"',
        'chapters: "2-4"',
        'preset: "budget"',
        'outDir: "./from-config-output"',
        "budgetUsd: 17",
        "verbose: true",
      ].join("\n"),
      "utf-8",
    );

    const request = resolveChapterGenerationRunRequest({
      cwd: tempDir,
      args: [
        "--config",
        path.relative(tempDir, configPath),
        "--chapters",
        "5-7",
        "--preset",
        "simple",
        "--out",
        "override-output",
        "--quiet",
      ],
    });

    expect(request.input).toMatchObject({
      workflow: "chapter_generation",
      startChapter: 5,
      endChapter: 7,
      preset: "simple",
      budgetUsd: 17,
    });
    expect(request.command).toMatchObject({
      preset: "simple",
      verbose: false,
      budgetUsd: 17,
      outDir: path.resolve(tempDir, "override-output"),
    });
    expect(request.paths).toMatchObject({
      configPath,
      seedPath,
      outDir: path.resolve(tempDir, "override-output"),
    });
    expect(request.seed.title).toBe("cli normalization smoke");
  });

  it("uses renderer regeneration snapshots to pin the effective chapter range", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pipeline-run-regeneration-"),
    );
    const seedPath = path.join(tempDir, "seed.json");
    const snapshotPath = path.join(tempDir, "renderer-snapshot.json");

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({
        chapterNumber: 9,
        blueprint: {
          chapter_number: 9,
          title: "9화",
          arc_id: "arc-9",
          one_liner: "기존 시뮬레이션 상태에서 prose만 다시 렌더링한다.",
          role_in_arc: "rising_action",
          scenes: [],
          emotional_arc: "긴장",
          key_points: [],
          characters_involved: [],
          tension_level: 6,
          target_word_count: 3200,
          foreshadowing_actions: [],
          dependencies: [],
        },
        previousSummaries: [],
        simulationState: {
          seedTitle: "regen",
          chapterCursor: 8,
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
      }, null, 2),
      "utf-8",
    );

    const request = resolveChapterGenerationRunRequest({
      cwd: tempDir,
      args: [
        "--seed",
        seedPath,
        "--chapters",
        "1-3",
        "--renderer-regeneration-request",
        snapshotPath,
      ],
    });

    expect(request.input.startChapter).toBe(9);
    expect(request.input.endChapter).toBe(9);
    expect(request.rendererRegeneration).toMatchObject({
      snapshot: {
        chapterNumber: 9,
        stateIdentity: {
          overallSha256: expect.any(String),
        },
      },
      proseFailureContext: {
        summary: "저장된 narrative state에서 prose만 다시 렌더링합니다.",
      },
    });
  });

  it("runs the shared workflow in stage order and captures lifecycle events for the CLI surface", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pipeline-run-lifecycle-"),
    );
    const seedPath = path.join(tempDir, "seed.json");
    const outDir = path.join(tempDir, "out");

    fs.writeFileSync(seedPath, JSON.stringify(createSeed(), null, 2), "utf-8");

    const result = await runChapterGenerationPipeline({
      args: ["--seed", seedPath, "--chapters", "2", "--out", outDir, "--quiet"],
      cwd: tempDir,
      createHarness: () => new PassingHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    });

    const startedStages = result.lifecycleEvents
      .filter((event) => event.type === "stage_started")
      .map((event) => event.stage);
    const completedStages = result.lifecycleEvents
      .filter((event) => event.type === "stage_completed")
      .map((event) => event.stage);
    const sourceEvents = result.lifecycleEvents
      .filter((event) => event.type === "source_event")
      .map((event) => `${event.stage}:${event.source}`);

    expect(result.execution.workflowResult.ok).toBe(true);
    expect(result.contract).toMatchObject({
      workflow: "chapter_generation",
      ok: true,
      request: {
        input: {
          workflow: "chapter_generation",
          startChapter: 2,
          endChapter: 2,
        },
        options: {
          preset: "default",
          outDir,
          verbose: false,
        },
      },
      progress: {
        status: "completed",
        totalStageCount: 7,
        completedStageCount: 7,
        completionPercent: 100,
      },
      state: {
        workflow: "chapter_generation",
        chapterRange: {
          startChapter: 2,
          endChapter: 2,
          requestedChapterCount: 1,
          generatedChapterCount: 1,
        },
      },
    });
    expect(result.contract.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "result_file",
          path: expect.stringContaining(path.join("out", "result.json")),
        }),
        expect.objectContaining({
          role: "chapter_text",
          chapterNumber: 2,
        }),
      ]),
    );
    expect(result.lifecycleEvents[0]).toMatchObject({
      type: "run_started",
      workflow: "chapter_generation",
    });
    expect(startedStages).toEqual([
      "resolve_run_input",
      "resolve_config",
      "initialize_simulation_models",
      "simulate_episodes",
      "render_output",
      "verify_output",
      "finalize_output",
    ]);
    expect(completedStages).toEqual(startedStages);
    expect(sourceEvents).toEqual([
      "simulate_episodes:harness",
      "render_output:harness",
      "finalize_output:harness",
    ]);
    expect(result.lifecycleEvents.at(-1)).toMatchObject({
      type: "run_completed",
      ok: true,
      errorCount: 0,
    });
  });

  it("reuses the CLI pipeline execution branch for programmatic library runs", async () => {
    const outDir = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-run-programmatic-")),
      "out",
    );
    const request = createChapterGenerationProgrammaticRunRequest({
      input: {
        workflow: "chapter_generation",
        seed: createSeed(),
        startChapter: 3,
        endChapter: 3,
      },
      preset: "default",
      outDir,
      verbose: false,
    });

    const result = await runProgrammaticChapterGenerationPipeline({
      request,
      createHarness: () => new PassingHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    });

    expect(result.request).toEqual(request);
    expect(result.execution.workflowResult.ok).toBe(true);
    expect(result.contract.request).toEqual(request);
    expect(result.contract.state.chapterRange).toMatchObject({
      startChapter: 3,
      endChapter: 3,
      requestedChapterCount: 1,
      generatedChapterCount: 1,
    });
    expect(
      result.lifecycleEvents.filter((event) => event.type === "stage_started"),
    ).toHaveLength(7);
  });

  it("maps invalid-input, workflow, and generic simulation failures to stable exit codes", () => {
    const workflowError = new ChapterGenerationWorkflowRunError({
      workflowError: {
        code: "workflow_runtime_error",
        message: "Harness run completed without a done result.",
        stage: "simulate_episodes",
        retryable: false,
      },
      workflowResult: {
        ok: false,
        workflow: "chapter_generation",
        runId: "run-test",
        startedAt: "2026-05-06T00:00:00.000Z",
        completedAt: "2026-05-06T00:00:01.000Z",
        stageRecords: [],
        errors: [],
      } as NovelWorkflowRunResult<{ outcome: unknown }>,
      lifecycleEvents: [],
    });

    expect(
      getChapterGenerationPipelineExitCode(
        new Error("Unknown generate CLI option: --mystery"),
      ),
    ).toBe(ChapterGenerationPipelineExitCode.invalidInput);
    expect(getChapterGenerationPipelineExitCode(workflowError)).toBe(
      ChapterGenerationPipelineExitCode.workflowRuntimeError,
    );
    expect(
      getChapterGenerationPipelineExitCode(
        new Error("Simulation validation failed without canonical mismatch details."),
      ),
    ).toBe(ChapterGenerationPipelineExitCode.simulationValidationFailed);
  });
});
