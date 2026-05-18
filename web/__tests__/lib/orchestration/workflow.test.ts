// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it, vi } from "vitest";

import type {
  HarnessConfig,
  HarnessEvent,
  LongFormVerificationExecutionResult,
} from "@/lib/harness";
import { createDeterministicLongFormValidationScenario } from "@/lib/sim";
import type { NovelSeed } from "@/lib/schema/novel";
import {
  CHAPTER_GENERATION_ARTIFACT_LAYOUT,
  CHAPTER_GENERATION_STAGE_CONTRACTS,
  LONG_FORM_VERIFICATION_STAGE_CONTRACTS,
  createLongFormVerificationWorkflowStages,
  createWorkflowRuntime,
  createWorkflowStageRecords,
  runEndToEndChapterGeneration,
  runChapterGenerationWorkflow,
  runLongFormVerificationWorkflow,
  runWorkflowStageSequence,
  validateWorkflowStageContracts,
} from "@/lib/orchestration";

function createSeed(): NovelSeed {
  return {
    title: "simulation-first smoke",
    logline: "정교한 시뮬레이션 계약을 검증한다.",
    total_chapters: 1,
    world: {
      name: "회색 도시",
      genre: "mystery",
      sub_genre: "fantasy",
      time_period: "modern",
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

function createSuccessfulDoneEvent(): HarnessEvent {
  return {
    type: "done",
    result: {
      config: "test",
      chapters: [{
        chapterNumber: 1,
        text: "첫 화 본문",
        summary: {
          chapter: 1,
          title: "1화",
          summary: "요약",
          plot_summary: "요약",
          ending_scene_state: {
            location: "회랑",
            time_of_day: "night",
            characters_present: ["haeon"],
            ongoing_action: "시뮬레이션 계약을 검증한다",
            unresolved_tension: "검증 결과가 유지되는가",
          },
        },
        score: 0.92,
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
          cost_usd: 0.01,
        },
        durationMs: 25,
      }],
      totalUsage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        cost_usd: 0.01,
      },
      totalDurationMs: 25,
      totalCostUsd: 0.01,
      canonicalValidationFailures: [],
      beliefInterpretationRecoveries: [],
    },
  };
}

function createHarnessConfig(): HarnessConfig {
  return {
    name: "test",
    models: {
      planning: "gpt-5.4",
      writing: "gpt-5.4",
      critique: "gpt-4o",
      repair: "gpt-4o",
      default: "gpt-4o",
    },
    pipeline: [],
    qualityThreshold: 0.85,
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
    output: {
      mode: "silent",
      verbose: false,
    },
    chapterLength: {
      min: 100,
      max: 1000,
    },
    fastMode: false,
    parallelMode: false,
    simpleMode: false,
  };
}

describe("orchestration workflow contracts", () => {
  it("declares valid dependency graphs for generation and long-form verification", () => {
    expect(validateWorkflowStageContracts(CHAPTER_GENERATION_STAGE_CONTRACTS)).toEqual([]);
    expect(validateWorkflowStageContracts(LONG_FORM_VERIFICATION_STAGE_CONTRACTS)).toEqual([]);
  });

  it("runs chapter generation through library contracts and emits structured lifecycle events", async () => {
    const lifecycleEvents: string[] = [];
    const collectRunOutcome = vi.fn(async (
      events: AsyncIterable<HarnessEvent>,
      onEvent?: (event: HarnessEvent) => void | Promise<void>,
    ) => {
      for await (const event of events) {
        await onEvent?.(event);
      }
      return {
        ok: true,
        result: createSuccessfulDoneEvent().result,
      } as const;
    });

    const result = await runChapterGenerationWorkflow({
      input: {
        workflow: "chapter_generation",
        seed: createSeed(),
        startChapter: 1,
        endChapter: 1,
      },
      createHarness: () => ({
        async *run(): AsyncGenerator<HarnessEvent> {
          yield { type: "chapter_start", chapter: 1 };
          yield {
            type: "pipeline_event",
            chapter: 1,
            event: { type: "stage_change", stage: "drafting" },
          };
          yield {
            type: "chapter_complete",
            result: createSuccessfulDoneEvent().result.chapters[0],
          };
          yield createSuccessfulDoneEvent();
        },
      }),
      collectRunOutcome,
      resolveConfig: () => createHarnessConfig(),
      onLifecycleEvent: (event) => {
        lifecycleEvents.push(event.type);
      },
    });

    expect(result.ok).toBe(true);
    expect(result.workflow).toBe("chapter_generation");
    expect(result.errors).toEqual([]);
    expect(result.payload?.outcome.ok).toBe(true);
    expect(
      result.stageRecords.every((record) => record.status === "completed"),
    ).toBe(true);
    expect(lifecycleEvents).toContain("run_started");
    expect(lifecycleEvents).toContain("source_event");
    expect(lifecycleEvents).toContain("run_completed");
    expect(collectRunOutcome).toHaveBeenCalledTimes(1);
  });

  it("exposes a shared end-to-end generation entrypoint with reusable artifacts and verification report", async () => {
    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "chapter-generation-end-to-end-"),
    );

    const result = await runEndToEndChapterGeneration({
      outDir,
      input: {
        workflow: "chapter_generation",
        seed: createSeed(),
        startChapter: 1,
        endChapter: 1,
      },
      createHarness: () => ({
        async *run(): AsyncGenerator<HarnessEvent> {
          yield { type: "chapter_start", chapter: 1 };
          yield {
            type: "chapter_complete",
            result: createSuccessfulDoneEvent().result.chapters[0],
          };
          yield createSuccessfulDoneEvent();
        },
      }),
      resolveConfig: () => createHarnessConfig(),
    });

    expect(result.workflowResult.ok).toBe(true);
    expect(result.outcome.ok).toBe(true);
    expect(result.report.totalTokens).toBe(30);
    expect(result.report.foreshadowQualityGate.pass).toBe(true);
    expect(result.artifactPaths?.resultFile).toContain("result.json");
    expect(
      fs.existsSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.chaptersDirName,
          "chapter-001.txt",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.summariesDirName,
          "chapter-001.summary.json",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName,
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          outDir,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
          CHAPTER_GENERATION_ARTIFACT_LAYOUT.manifestFileName,
        ),
      ),
    ).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(outDir, "result.json"), "utf-8")),
    ).toMatchObject({
      totalTokens: 30,
      chapters: [
        {
          chapterNumber: 1,
          charCount: "첫 화 본문".length,
        },
      ],
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            outDir,
            CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
            CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName,
          ),
          "utf-8",
        ),
      ),
    ).toMatchObject({
      workflow: "chapter_generation",
      seedTitle: "simulation-first smoke",
      chapterRange: {
        startChapter: 1,
        endChapter: 1,
        generatedChapterCount: 1,
      },
      artifactLayout: {
        chaptersDir: CHAPTER_GENERATION_ARTIFACT_LAYOUT.chaptersDirName,
        summariesDir: CHAPTER_GENERATION_ARTIFACT_LAYOUT.summariesDirName,
        metadataDir: CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
      },
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            outDir,
            CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName,
            CHAPTER_GENERATION_ARTIFACT_LAYOUT.manifestFileName,
          ),
          "utf-8",
        ),
      ),
    ).toMatchObject({
      workflow: "chapter_generation",
      artifacts: {
        resultFile: "result.json",
        runMetadataFile:
          `${CHAPTER_GENERATION_ARTIFACT_LAYOUT.metadataDirName}/`
          + `${CHAPTER_GENERATION_ARTIFACT_LAYOUT.runMetadataFileName}`,
        chapters: [
          {
            chapterNumber: 1,
            textFile:
              `${CHAPTER_GENERATION_ARTIFACT_LAYOUT.chaptersDirName}/chapter-001.txt`,
            summaryFile:
              `${CHAPTER_GENERATION_ARTIFACT_LAYOUT.summariesDirName}/chapter-001.summary.json`,
          },
        ],
      },
    });
  });

  it("returns structured verification workflow results without CLI/process assumptions", async () => {
    const result = await runLongFormVerificationWorkflow({
      input: {
        workflow: "long_form_verification",
        preset: "default",
        outDir: "/tmp/long-form-contract-smoke",
      },
      runVerification: async () => ({
        scenario: {
          id: "scenario-1",
          totalEpisodes: 300,
          seed: createSeed(),
          expectedMismatchAttributions: [],
          continuityCheckpoints: [],
        } as never,
        outcome: {
          ok: true,
          result: createSuccessfulDoneEvent().result,
        },
        report: {
          scenario: {
            id: "scenario-1",
            totalEpisodes: 300,
            continuityCheckpointCount: 0,
            expectedMismatchAttributionCount: 0,
          },
          run: {
            scenarioId: "scenario-1",
            totalEpisodes: 300,
            generatedEpisodes: 1,
            expectedMismatchAttributionCount: 0,
            continuityCheckpointCount: 0,
            config: "default",
            preset: "default",
            startedAt: "2026-05-06T00:00:00.000Z",
            completedAt: "2026-05-06T00:00:01.000Z",
            durationMs: 1000,
            totalTokens: 30,
            totalCostUsd: 0.01,
            chapterCoverageComplete: true,
            chapterVerificationPassed: true,
            finalVerificationPassed: true,
            canonicalValidationPassed: true,
            causalLedgerValidationPassed: true,
            contradictionValidationPassed: true,
            passed: true,
          },
          mismatchSummary: {
            detectedMismatchCount: 0,
            uniqueMismatchCauseLinkCount: 0,
            issueCount: 0,
            invalidContradictionCount: 0,
            allowedExceptionCount: 0,
            byRecordType: {},
            byCauseType: {},
            byContradictionType: {},
          },
          mismatchCauseLinks: [],
          expectedMismatchAttributions: [],
          verificationReports: [],
          canonicalValidationFailures: [],
          causalLedgerValidation: {
            passed: true,
            issueCount: 0,
            issues: [],
            summary: "ok",
          },
          contradictionValidation: {
            contradiction_count: 0,
            counts: {
              belief: 0,
              memory: 0,
              utterance: 0,
              continuity: 0,
            },
            totalViolationCount: 0,
            passed: true,
            beliefViolations: [],
            memoryViolations: [],
            utteranceViolations: [],
            continuityViolations: [],
            episodeDiagnostics: [],
          },
        } as never,
        contradictionValidation: {
          contradiction_count: 0,
          counts: {
            belief: 0,
            memory: 0,
            utterance: 0,
            continuity: 0,
          },
          totalViolationCount: 0,
          passed: true,
          beliefViolations: [],
          memoryViolations: [],
          utteranceViolations: [],
          continuityViolations: [],
          episodeDiagnostics: [],
        } as never,
        acceptanceCriteria: {
          schemaVersion: "long_form_acceptance_criteria.v1",
          seedId: "seed_b04b806cc965",
          evaluatedAt: "2026-05-06T00:05:00.000Z",
          overallPassed: true,
          targetEpisodeCount: 300,
          payoffThreshold: 0.9,
          payoffWindowEpisodes: 80,
          summary: {
            passedCount: 11,
            failedCount: 0,
            totalCount: 11,
          },
          componentCoverage: {},
          criteria: [],
        },
        validationFailed: false,
        artifactPaths: {
          outDir: "/tmp/long-form-contract-smoke",
          reportFile: "/tmp/long-form-contract-smoke/report.json",
          resultFile: "/tmp/long-form-contract-smoke/result.json",
          scenarioSeedFile: "/tmp/long-form-contract-smoke/scenario.seed.json",
          acceptanceCriteriaFile: "/tmp/long-form-contract-smoke/ac-results.json",
        },
      } satisfies LongFormVerificationExecutionResult),
    });

    expect(result.ok).toBe(true);
    expect(result.workflow).toBe("long_form_verification");
    expect(result.errors).toEqual([]);
    expect(result.payload?.result.validationFailed).toBe(false);
    expect(result.payload?.stageOutputs.resolveRunInput).toMatchObject({
      preset: "default",
      outDir: "/tmp/long-form-contract-smoke",
      scenarioSource: "default",
    });
    expect(result.stageRecords.find((record) => record.stage === "verify_output")?.status).toBe("completed");
  });

  it("supports programmatic stage invocation for long-form verification without CLI formatting", async () => {
    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "long-form-workflow-stages-"),
    );
    const stageContracts = LONG_FORM_VERIFICATION_STAGE_CONTRACTS;
    const stageRecords = createWorkflowStageRecords(stageContracts);
    const runtime = createWorkflowRuntime({
      workflow: "long_form_verification",
      runId: "long-form:stage-test",
      startedAt: "2026-05-06T00:00:00.000Z",
      stageContracts,
      stageRecords,
    });

    const sequenceResult = await runWorkflowStageSequence(
      runtime,
      {
        input: {
          workflow: "long_form_verification",
          preset: "default",
          outDir,
          scenario: createDeterministicLongFormValidationScenario(),
        },
        stageOutputs: {},
      },
      createLongFormVerificationWorkflowStages({
        createHarness: () => ({
          runToCompletion: async () => ({
            ok: true as const,
            result: {
              config: "test",
              chapters: createSuccessfulDoneEvent().result.chapters,
              totalUsage: createSuccessfulDoneEvent().result.totalUsage,
              totalDurationMs: 25,
              totalCostUsd: 0.01,
              verification: undefined,
              canonicalValidationFailures: [],
              beliefInterpretationRecoveries: [],
            },
          }),
        }),
        resolveConfig: () => createHarnessConfig(),
      }),
    );

    expect(sequenceResult.ok).toBe(false);
    if (sequenceResult.ok) {
      return;
    }

    expect(sequenceResult.context.result?.artifactPaths.reportFile).toContain(
      "validation-report.json",
    );
    expect(sequenceResult.context.stageOutputs.resolveConfig).toMatchObject({
      configName: "test",
      outDir,
    });
    expect(sequenceResult.context.stageOutputs.initializeSimulationModels).toMatchObject({
      scenarioId: sequenceResult.context.result?.scenario.id,
      totalEpisodes: 300,
    });
    expect(sequenceResult.context.stageOutputs.verifyOutput).toMatchObject({
      scenarioId: sequenceResult.context.result?.scenario.id,
      chapterCount: 1,
      validationFailed: true,
    });
    expect(sequenceResult.context.stageOutputs.finalizeOutput).toBeUndefined();
    expect(sequenceResult.error.code).toBe("contradiction_validation_failed");
    expect(fs.existsSync(path.join(outDir, "validation-report.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "result.json"))).toBe(true);
  });
});
