import * as path from "path";

import {
  collectHarnessRunOutcome,
  executeLongFormVerificationRun,
  finalizeLongFormVerificationRun,
  initializeLongFormVerificationRun,
  LONG_FORM_VERIFICATION_REPORT_FILENAME,
  LONG_FORM_VERIFICATION_RESULT_FILENAME,
  LONG_FORM_VERIFICATION_SCENARIO_FILENAME,
  LONG_FORM_ACCEPTANCE_CRITERIA_FILENAME,
  NovelHarness,
  prepareLongFormVerificationRun,
} from "../harness";
import type {
  ExecutedLongFormVerificationRun,
  HarnessConfig,
  HarnessEvent,
  HarnessRunOutcome,
  LongFormVerificationExecutionResult,
  PreparedLongFormVerificationRun,
  RunLongFormVerificationOptions,
} from "../harness";
import {
  getBudgetConfig,
  getDefaultConfig,
  getFastConfig,
  getSimpleConfig,
} from "../harness";
import type {
  ChapterGenerationRunInput,
  LongFormVerificationRunInput,
  NovelWorkflowError,
  NovelWorkflowLifecycleEvent,
  NovelWorkflowRunResult,
  NovelWorkflowStageId,
} from "./contracts";
import {
  createWorkflowRunId,
  createWorkflowStageRecords,
  resolveWorkflowStageContracts,
  validateWorkflowStageContracts,
} from "./contracts";
import {
  createWorkflowRuntime,
  runWorkflowStageSequence,
} from "./core";
import type { WorkflowStageDefinition } from "./core";

export interface RunChapterGenerationWorkflowOptions {
  input: ChapterGenerationRunInput;
  createHarness?: (config: HarnessConfig) => Pick<NovelHarness, "run">;
  resolveConfig?: (preset: string) => HarnessConfig;
  collectRunOutcome?: (
    events: AsyncIterable<HarnessEvent>,
    onEvent?: (event: HarnessEvent) => void | Promise<void>,
  ) => Promise<HarnessRunOutcome>;
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
}

export interface ChapterGenerationWorkflowPayload {
  outcome: HarnessRunOutcome;
}

export interface RunLongFormVerificationWorkflowOptions {
  input: LongFormVerificationRunInput;
  runVerification?: (
    options?: RunLongFormVerificationOptions,
  ) => Promise<LongFormVerificationExecutionResult>;
  createHarness?: (config: HarnessConfig) => Pick<NovelHarness, "runToCompletion">;
  resolveConfig?: (preset: string) => HarnessConfig;
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
}

export interface LongFormVerificationResolveRunInputOutput {
  preset: string;
  outDir: string;
  verbose: boolean;
  budgetUsd: number | null;
  scenarioSource: "inline" | "path" | "default";
}

export interface LongFormVerificationResolveConfigOutput {
  preset: string;
  configName: string;
  budgetUsd: number | null;
  outDir: string;
  artifactPaths: {
    outDir: string;
    reportFile: string;
    resultFile: string;
    scenarioSeedFile: string;
    acceptanceCriteriaFile: string;
  };
}

export interface LongFormVerificationInitializeModelsOutput {
  scenarioId: string;
  totalEpisodes: number;
  continuityCheckpointCount: number;
  expectedMismatchAttributionCount: number;
}

export interface LongFormVerificationVerifyOutput {
  scenarioId: string;
  chapterCount: number;
  reportPassed: boolean;
  validationFailed: boolean;
  contradictionCount: number;
  canonicalValidationFailureCount: number;
}

export interface LongFormVerificationFinalizeOutput {
  artifactPaths: {
    outDir: string;
    reportFile: string;
    resultFile: string;
    scenarioSeedFile: string;
    acceptanceCriteriaFile: string;
  };
  reportPassed: boolean;
  validationFailed: boolean;
  contradictionCount: number;
}

export interface LongFormVerificationWorkflowStageOutputs {
  resolveRunInput?: LongFormVerificationResolveRunInputOutput;
  resolveConfig?: LongFormVerificationResolveConfigOutput;
  initializeSimulationModels?: LongFormVerificationInitializeModelsOutput;
  verifyOutput?: LongFormVerificationVerifyOutput;
  finalizeOutput?: LongFormVerificationFinalizeOutput;
}

export interface LongFormVerificationWorkflowPayload {
  result?: LongFormVerificationExecutionResult;
  stageOutputs: LongFormVerificationWorkflowStageOutputs;
}

interface ChapterGenerationWorkflowContext {
  input: ChapterGenerationRunInput;
  preset: string;
  config?: HarnessConfig;
  harness?: Pick<NovelHarness, "run">;
  outcome?: HarnessRunOutcome;
}

interface LongFormVerificationWorkflowContext {
  input: LongFormVerificationRunInput;
  preparedRun?: PreparedLongFormVerificationRun;
  execution?: ExecutedLongFormVerificationRun;
  result?: LongFormVerificationExecutionResult;
  stageOutputs: LongFormVerificationWorkflowStageOutputs;
}

const silentIo = {
  log: () => undefined,
  error: () => undefined,
};

export function resolveHarnessConfig(preset: string): HarnessConfig {
  switch (preset) {
    case "budget":
      return getBudgetConfig();
    case "fast":
      return getFastConfig();
    case "simple":
      return getSimpleConfig();
    default:
      return getDefaultConfig();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildUnexpectedWorkflowError(
  stage: NovelWorkflowStageId,
  error: unknown,
): NovelWorkflowError {
  return {
    code: "workflow_runtime_error",
    message: error instanceof Error ? error.message : String(error),
    stage,
    retryable: false,
    details: error instanceof Error && error.stack
      ? { stack: error.stack }
      : undefined,
  };
}

function buildHarnessOutcomeError(
  outcome: HarnessRunOutcome,
): NovelWorkflowError | null {
  if (outcome.ok) {
    return null;
  }

  return {
    code: outcome.error.code,
    message: outcome.error.message,
    stage: "verify_output",
    retryable: false,
    details: {
      reports: outcome.error.reports,
      chapterCount: outcome.result.chapters.length,
    },
  };
}

function mapHarnessEventStage(event: HarnessEvent): NovelWorkflowStageId {
  switch (event.type) {
    case "chapter_start":
    case "pipeline_event":
      return "simulate_episodes";
    case "chapter_complete":
      return "render_output";
    case "error":
      return "verify_output";
    case "done":
      return "finalize_output";
    default:
      return "simulate_episodes";
  }
}

function buildChapterGenerationWorkflowResult(
  base: {
    ok: boolean;
    runId: string;
    startedAt: string;
    completedAt: string;
    stageRecords: ReturnType<typeof createWorkflowStageRecords>;
    errors: NovelWorkflowError[];
  },
  outcome?: HarnessRunOutcome,
): NovelWorkflowRunResult<ChapterGenerationWorkflowPayload> {
  return {
    ok: base.ok,
    workflow: "chapter_generation",
    runId: base.runId,
    startedAt: base.startedAt,
    completedAt: base.completedAt,
    stageRecords: base.stageRecords,
    payload: outcome ? { outcome } : undefined,
    errors: base.errors,
  };
}

function buildLongFormVerificationWorkflowResult(
  base: {
    ok: boolean;
    runId: string;
    startedAt: string;
    completedAt: string;
    stageRecords: ReturnType<typeof createWorkflowStageRecords>;
    errors: NovelWorkflowError[];
  },
  stageOutputs: LongFormVerificationWorkflowStageOutputs,
  result?: LongFormVerificationExecutionResult,
): NovelWorkflowRunResult<LongFormVerificationWorkflowPayload> {
  const hasStageOutputs = Object.keys(stageOutputs).length > 0;
  return {
    ok: base.ok,
    workflow: "long_form_verification",
    runId: base.runId,
    startedAt: base.startedAt,
    completedAt: base.completedAt,
    stageRecords: base.stageRecords,
    payload: result || hasStageOutputs
      ? {
        result,
        stageOutputs,
      }
      : undefined,
    errors: base.errors,
  };
}

function resolveLongFormScenarioSource(
  input: LongFormVerificationRunInput,
): LongFormVerificationResolveRunInputOutput["scenarioSource"] {
  if (input.scenario) {
    return "inline";
  }
  if (input.scenarioPath) {
    return "path";
  }
  return "default";
}

function buildVerificationWorkflowError(
  result: LongFormVerificationExecutionResult,
): NovelWorkflowError {
  return {
    code: "contradiction_validation_failed",
    message: "Long-form verification reported validation failures.",
    stage: "verify_output",
    retryable: false,
    details: {
      scenarioId: result.scenario.id,
      contradictionCount:
        result.contradictionValidation.contradiction_count,
    },
  };
}

function buildLongFormVerificationStageOutput(
  result: Pick<
    LongFormVerificationExecutionResult,
    "scenario" | "report" | "contradictionValidation" | "validationFailed"
  > & Partial<Pick<LongFormVerificationExecutionResult, "outcome">>,
): LongFormVerificationVerifyOutput {
  return {
    scenarioId: result.scenario.id,
    chapterCount: result.outcome?.result.chapters.length ?? 0,
    reportPassed: result.report.run.passed,
    validationFailed: result.validationFailed,
    contradictionCount:
      result.contradictionValidation.contradiction_count,
    canonicalValidationFailureCount:
      result.outcome?.result.canonicalValidationFailures.length ?? 0,
  };
}

export function createLongFormVerificationWorkflowStages(
  options: Pick<
    RunLongFormVerificationWorkflowOptions,
    "createHarness" | "resolveConfig" | "runVerification"
  > = {},
): Array<WorkflowStageDefinition<LongFormVerificationWorkflowContext>> {
  return [
    {
      stage: "resolve_run_input",
      execute: ({ input, stageOutputs }) => {
        const output: LongFormVerificationResolveRunInputOutput = {
          preset: input.preset ?? "default",
          outDir: input.outDir ?? "./output/long-form-validation",
          verbose: input.verbose ?? true,
          budgetUsd: input.budgetUsd ?? null,
          scenarioSource: resolveLongFormScenarioSource(input),
        };

        return {
          context: {
            stageOutputs: {
              ...stageOutputs,
              resolveRunInput: output,
            },
          },
          details: { ...output },
        };
      },
    },
    {
      stage: "resolve_config",
      execute: ({ input, stageOutputs }) => {
        if (options.runVerification) {
          const outDir = path.resolve(
            input.outDir ?? "./output/long-form-validation",
          );
          const output: LongFormVerificationResolveConfigOutput = {
            preset: input.preset ?? "default",
            configName: input.preset ?? "default",
            budgetUsd: input.budgetUsd ?? null,
            outDir,
            artifactPaths: {
              outDir,
              reportFile: path.join(
                outDir,
                LONG_FORM_VERIFICATION_REPORT_FILENAME,
              ),
              resultFile: path.join(
                outDir,
                LONG_FORM_VERIFICATION_RESULT_FILENAME,
              ),
              scenarioSeedFile: path.join(
                outDir,
                LONG_FORM_VERIFICATION_SCENARIO_FILENAME,
              ),
              acceptanceCriteriaFile: path.join(
                outDir,
                LONG_FORM_ACCEPTANCE_CRITERIA_FILENAME,
              ),
            },
          };

          return {
            context: {
              stageOutputs: {
                ...stageOutputs,
                resolveConfig: output,
              },
            },
            details: { ...output },
          };
        }

        const preparedRun = prepareLongFormVerificationRun({
          preset: input.preset,
          outDir: input.outDir,
          budget: input.budgetUsd,
          verbose: input.verbose,
          scenario: input.scenario,
          scenarioPath: input.scenarioPath,
          io: silentIo,
          createHarness: options.createHarness,
          resolveConfig: options.resolveConfig,
        });
        const output: LongFormVerificationResolveConfigOutput = {
          preset: preparedRun.preset,
          configName: preparedRun.config.name,
          budgetUsd: preparedRun.config.budgetUsd ?? null,
          outDir: preparedRun.outDir,
          artifactPaths: preparedRun.artifactPaths,
        };

        return {
          context: {
            preparedRun,
            stageOutputs: {
              ...stageOutputs,
              resolveConfig: output,
            },
          },
          details: { ...output },
        };
      },
    },
    {
      stage: "initialize_simulation_models",
      execute: ({ input, preparedRun, stageOutputs }) => {
        if (options.runVerification && !preparedRun) {
          const output: LongFormVerificationInitializeModelsOutput = {
            scenarioId: input.scenario?.id ?? "external-runner",
            totalEpisodes: input.scenario?.totalEpisodes ?? 0,
            continuityCheckpointCount:
              input.scenario?.continuityCheckpoints.length ?? 0,
            expectedMismatchAttributionCount:
              input.scenario?.groundTruthCausalEvents.reduce(
                (count, record) =>
                  count + record.expectedMismatchAttributions.length,
                0,
              ) ?? 0,
          };

          return {
            context: {
              stageOutputs: {
                ...stageOutputs,
                initializeSimulationModels: output,
              },
            },
            details: { ...output },
          };
        }

        if (!preparedRun) {
          return {
            error: buildUnexpectedWorkflowError(
              "initialize_simulation_models",
              new Error("Prepared long-form verification run missing."),
            ),
          };
        }

        initializeLongFormVerificationRun(preparedRun);
        const output: LongFormVerificationInitializeModelsOutput = {
          scenarioId: preparedRun.scenario.id,
          totalEpisodes: preparedRun.scenario.totalEpisodes,
          continuityCheckpointCount:
            preparedRun.scenario.continuityCheckpoints.length,
          expectedMismatchAttributionCount:
            preparedRun.scenario.groundTruthCausalEvents.reduce(
              (count, record) =>
                count + record.expectedMismatchAttributions.length,
              0,
            ),
        };

        return {
          context: {
            stageOutputs: {
              ...stageOutputs,
              initializeSimulationModels: output,
            },
          },
          details: { ...output },
        };
      },
    },
    {
      stage: "verify_output",
      execute: async ({ input, preparedRun, stageOutputs }, sequenceRuntime) => {
        if (options.runVerification) {
          const result = await options.runVerification({
            preset: input.preset,
            outDir: input.outDir,
            budget: input.budgetUsd,
            verbose: input.verbose ?? true,
            scenario: input.scenario,
            scenarioPath: input.scenarioPath,
            io: silentIo,
          });

          await sequenceRuntime.emitLifecycleEvent({
            type: "source_event",
            workflow: "long_form_verification",
            runId: sequenceRuntime.runId,
            stage: "verify_output",
            occurredAt: sequenceRuntime.now(),
            source: "verification",
            payload: {
              validationFailed: result.validationFailed,
              scenarioId: result.scenario.id,
            },
          });

          const output = buildLongFormVerificationStageOutput(result);
          return {
            context: {
              result,
              stageOutputs: {
                ...stageOutputs,
                verifyOutput: output,
              },
            },
            details: { ...output },
            error: result.validationFailed
              ? buildVerificationWorkflowError(result)
              : undefined,
          };
        }

        if (!preparedRun) {
          return {
            error: buildUnexpectedWorkflowError(
              "verify_output",
              new Error("Prepared long-form verification run missing."),
            ),
          };
        }

        const execution = await executeLongFormVerificationRun(preparedRun);

        await sequenceRuntime.emitLifecycleEvent({
          type: "source_event",
          workflow: "long_form_verification",
          runId: sequenceRuntime.runId,
          stage: "verify_output",
          occurredAt: sequenceRuntime.now(),
          source: "verification",
          payload: {
            validationFailed: execution.validationFailed,
            scenarioId: execution.scenario.id,
          },
        });

        const output = buildLongFormVerificationStageOutput({
          scenario: execution.scenario,
          outcome: execution.outcome,
          report: execution.report,
          contradictionValidation: execution.contradictionValidation,
          validationFailed: execution.validationFailed,
        });

        if (execution.validationFailed) {
          const result = finalizeLongFormVerificationRun(preparedRun, execution);
          return {
            context: {
              execution,
              result,
              stageOutputs: {
                ...stageOutputs,
                verifyOutput: output,
              },
            },
            details: { ...output },
            error: buildVerificationWorkflowError(result),
          };
        }

        return {
          context: {
            execution,
            stageOutputs: {
              ...stageOutputs,
              verifyOutput: output,
            },
          },
          details: { ...output },
        };
      },
    },
    {
      stage: "finalize_output",
      execute: ({ preparedRun, execution, result, stageOutputs }) => {
        const finalizedResult = result
          ?? (preparedRun && execution
            ? finalizeLongFormVerificationRun(preparedRun, execution)
            : undefined);

        if (!finalizedResult) {
          return {
            error: buildUnexpectedWorkflowError(
              "finalize_output",
              new Error(
                "Long-form verification workflow completed without a result payload.",
              ),
            ),
          };
        }

        const output: LongFormVerificationFinalizeOutput = {
          artifactPaths: finalizedResult.artifactPaths,
          reportPassed: finalizedResult.report.run.passed,
          validationFailed: finalizedResult.validationFailed,
          contradictionCount:
            finalizedResult.contradictionValidation.contradiction_count,
        };

        return {
          context: {
            result: finalizedResult,
            stageOutputs: {
              ...stageOutputs,
              finalizeOutput: output,
            },
          },
          details: { ...output },
        };
      },
    },
  ];
}

export async function runChapterGenerationWorkflow(
  options: RunChapterGenerationWorkflowOptions,
): Promise<NovelWorkflowRunResult<ChapterGenerationWorkflowPayload>> {
  const stageContracts = resolveWorkflowStageContracts("chapter_generation");
  const stageErrors = validateWorkflowStageContracts(stageContracts);
  const stageRecords = createWorkflowStageRecords(stageContracts);
  const runId = createWorkflowRunId(
    "chapter_generation",
    options.input.runId,
  );
  const startedAt = nowIso();
  const runtime = createWorkflowRuntime({
    workflow: "chapter_generation",
    runId,
    startedAt,
    stageContracts,
    stageRecords,
    onLifecycleEvent: options.onLifecycleEvent,
  });

  await runtime.startRun();

  if (stageErrors.length > 0) {
    for (const error of stageErrors) {
      const failedAt = runtime.now();
      await runtime.failStage(error.stage, error, failedAt);
      await runtime.failRun(error, failedAt);
    }

    return buildChapterGenerationWorkflowResult({
      ok: false,
      runId,
      startedAt,
      completedAt: runtime.now(),
      stageRecords,
      errors: stageErrors,
    });
  }

  const collectRunOutcome = options.collectRunOutcome ?? collectHarnessRunOutcome;
  const createHarness = options.createHarness
    ?? ((config: HarnessConfig) => new NovelHarness(config));
  const configResolver = options.resolveConfig ?? resolveHarnessConfig;

  try {
    const sequenceResult = await runWorkflowStageSequence(
      runtime,
      {
        input: options.input,
        preset: options.input.preset ?? "default",
      } as ChapterGenerationWorkflowContext,
      [
        {
          stage: "resolve_run_input",
          execute: ({ input }) => ({
            details: {
              startChapter: input.startChapter,
              endChapter: input.endChapter,
            },
          }),
        },
        {
          stage: "resolve_config",
          execute: (context) => {
            const { input, preset } = context;
            const config = configResolver(preset);
            if (input.budgetUsd !== undefined) {
              config.budgetUsd = input.budgetUsd;
            }
            config.output = { ...config.output, verbose: false };

            return {
              context: {
                ...context,
                config,
              },
              details: {
                preset,
                configName: config.name,
              },
            };
          },
        },
        {
          stage: "initialize_simulation_models",
          execute: (context) => ({
            context: {
              ...context,
              harness: createHarness(
                context.config ?? resolveHarnessConfig("default"),
              ),
            },
            details: {
              components: stageRecords.find(
                (record) => record.stage === "initialize_simulation_models",
              )?.components,
            },
          }),
        },
        {
          stage: "simulate_episodes",
          execute: async (context, sequenceRuntime) => {
            const { input, harness } = context;
            const outcome = await collectRunOutcome(
              harness!.run(
                input.seed,
                input.startChapter,
                input.endChapter,
                {
                  masterPlan: input.masterPlan,
                  previousSummaries: input.previousSummaries,
                  previousChapterEnding: input.previousChapterEnding,
                  previousSceneState: input.previousSceneState,
                  rendererRegeneration: input.rendererRegeneration,
                },
              ),
              async (event) => {
                await sequenceRuntime.emitLifecycleEvent({
                  type: "source_event",
                  workflow: "chapter_generation",
                  runId,
                  stage: mapHarnessEventStage(event),
                  occurredAt: sequenceRuntime.now(),
                  source: "harness",
                  payload: event,
                });

                if (event.type === "chapter_start") {
                  await sequenceRuntime.progressStage(
                    "simulate_episodes",
                    `chapter ${event.chapter} simulation started`,
                    { chapter: event.chapter },
                  );
                }

                if (event.type === "chapter_complete") {
                  await sequenceRuntime.progressStage(
                    "render_output",
                    `chapter ${event.result.chapterNumber} rendered`,
                    {
                      chapter: event.result.chapterNumber,
                      passedVerification:
                        event.result.verification?.passed ?? null,
                    },
                  );
                }
              },
            );

            return {
              context: {
                ...context,
                outcome,
              },
              details: {
                chapterCount: outcome.result.chapters.length,
              },
            };
          },
        },
        {
          stage: "render_output",
          execute: ({ outcome }) => ({
            details: {
              generatedChapterCount: outcome?.result.chapters.length ?? 0,
            },
          }),
        },
        {
          stage: "verify_output",
          execute: ({ outcome }) => {
            if (!outcome) {
              return {
                error: buildUnexpectedWorkflowError(
                  "verify_output",
                  new Error("Chapter generation outcome missing before verification."),
                ),
              };
            }

            const workflowError = buildHarnessOutcomeError(outcome);
            if (workflowError) {
              return {
                error: workflowError,
              };
            }

            return {
              details: {
                canonicalValidationFailureCount:
                  outcome.result.canonicalValidationFailures.length,
              },
            };
          },
        },
        {
          stage: "finalize_output",
          execute: ({ outcome }) => ({
            details: {
              totalCostUsd: outcome?.result.totalCostUsd ?? 0,
              totalDurationMs: outcome?.result.totalDurationMs ?? 0,
            },
          }),
        },
      ],
    );

    if (!sequenceResult.ok) {
      return buildChapterGenerationWorkflowResult(
        {
          ok: false,
          runId,
          startedAt,
          completedAt: sequenceResult.completedAt,
          stageRecords,
          errors: [sequenceResult.error],
        },
        sequenceResult.context.outcome,
      );
    }

    const outcome = sequenceResult.context.outcome;
    if (!outcome) {
      throw new Error(
        "Chapter generation workflow completed without an outcome payload.",
      );
    }

    const completedAt = runtime.now();
    await runtime.completeRun(true, 0, completedAt);
    return buildChapterGenerationWorkflowResult(
      {
        ok: true,
        runId,
        startedAt,
        completedAt,
        stageRecords,
        errors: [],
      },
      outcome,
    );
  } catch (error) {
    const workflowError = buildUnexpectedWorkflowError(
      "simulate_episodes",
      error,
    );
    const completedAt = runtime.now();
    await runtime.failStage(workflowError.stage, workflowError, completedAt);
    await runtime.failRun(workflowError, completedAt);
    return buildChapterGenerationWorkflowResult({
      ok: false,
      runId,
      startedAt,
      completedAt,
      stageRecords,
      errors: [workflowError],
    });
  }
}

export async function runLongFormVerificationWorkflow(
  options: RunLongFormVerificationWorkflowOptions,
): Promise<NovelWorkflowRunResult<LongFormVerificationWorkflowPayload>> {
  const stageContracts = resolveWorkflowStageContracts("long_form_verification");
  const stageErrors = validateWorkflowStageContracts(stageContracts);
  const stageRecords = createWorkflowStageRecords(stageContracts);
  const runId = createWorkflowRunId(
    "long_form_verification",
    options.input.runId,
  );
  const startedAt = nowIso();
  const runtime = createWorkflowRuntime({
    workflow: "long_form_verification",
    runId,
    startedAt,
    stageContracts,
    stageRecords,
    onLifecycleEvent: options.onLifecycleEvent,
  });

  await runtime.startRun();

  if (stageErrors.length > 0) {
    for (const error of stageErrors) {
      const failedAt = runtime.now();
      await runtime.failStage(error.stage, error, failedAt);
      await runtime.failRun(error, failedAt);
    }

    return buildLongFormVerificationWorkflowResult({
      ok: false,
      runId,
      startedAt,
      completedAt: runtime.now(),
      stageRecords,
      errors: stageErrors,
    }, {});
  }

  try {
    const sequenceResult = await runWorkflowStageSequence(
      runtime,
      {
        input: options.input,
        stageOutputs: {},
      } satisfies LongFormVerificationWorkflowContext,
      createLongFormVerificationWorkflowStages(options),
    );

    if (!sequenceResult.ok) {
      return buildLongFormVerificationWorkflowResult(
        {
          ok: false,
          runId,
          startedAt,
          completedAt: sequenceResult.completedAt,
          stageRecords,
          errors: [sequenceResult.error],
        },
        sequenceResult.context.stageOutputs,
        sequenceResult.context.result,
      );
    }

    const result = sequenceResult.context.result;
    if (!result) {
      throw new Error(
        "Long-form verification workflow completed without a result payload.",
      );
    }

    const completedAt = runtime.now();
    await runtime.completeRun(true, 0, completedAt);
    return buildLongFormVerificationWorkflowResult(
      {
        ok: true,
        runId,
        startedAt,
        completedAt,
        stageRecords,
        errors: [],
      },
      sequenceResult.context.stageOutputs,
      result,
    );
  } catch (error) {
    const workflowError = buildUnexpectedWorkflowError(
      "verify_output",
      error,
    );
    const completedAt = runtime.now();
    await runtime.failStage(workflowError.stage, workflowError, completedAt);
    await runtime.failRun(workflowError, completedAt);
    return buildLongFormVerificationWorkflowResult({
      ok: false,
      runId,
      startedAt,
      completedAt,
      stageRecords,
      errors: [workflowError],
    }, {});
  }
}
