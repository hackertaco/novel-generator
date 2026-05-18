import type {
  ChapterGenerationProgrammaticRunRequest,
  ChapterGenerationProgrammaticRunResponse,
} from "./run-contracts";
import {
  buildChapterGenerationProgrammaticRunResponse,
} from "./run-contracts";
import type {
  NovelWorkflowError,
  NovelWorkflowLifecycleEvent,
  NovelWorkflowRunResult,
} from "./contracts";
import type {
  EndToEndChapterGenerationRunResult,
  RunEndToEndChapterGenerationOptions,
} from "./end-to-end";
import {
  assertEndToEndChapterGenerationPassed,
  runEndToEndChapterGeneration,
} from "./end-to-end";

export interface RunChapterGenerationProgrammaticOptions
  extends Pick<
    RunEndToEndChapterGenerationOptions,
    "createHarness" | "resolveConfig"
  > {
  request: ChapterGenerationProgrammaticRunRequest;
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
}

export interface ChapterGenerationProgrammaticExecution {
  request: ChapterGenerationProgrammaticRunRequest;
  execution: EndToEndChapterGenerationRunResult;
  lifecycleEvents: NovelWorkflowLifecycleEvent[];
  contract: ChapterGenerationProgrammaticRunResponse;
}

export class ChapterGenerationWorkflowRunError extends Error {
  readonly workflowError: NovelWorkflowError;
  readonly workflowResult: NovelWorkflowRunResult<{ outcome: unknown }>;
  readonly lifecycleEvents: NovelWorkflowLifecycleEvent[];

  constructor(options: {
    workflowError: NovelWorkflowError;
    workflowResult: NovelWorkflowRunResult<{ outcome: unknown }>;
    lifecycleEvents: NovelWorkflowLifecycleEvent[];
  }) {
    super(options.workflowError.message);
    this.name = "ChapterGenerationWorkflowRunError";
    this.workflowError = options.workflowError;
    this.workflowResult = options.workflowResult;
    this.lifecycleEvents = options.lifecycleEvents;
  }
}

export async function runChapterGenerationProgrammatic(
  options: RunChapterGenerationProgrammaticOptions,
): Promise<ChapterGenerationProgrammaticExecution> {
  const lifecycleEvents: NovelWorkflowLifecycleEvent[] = [];
  const execution = await runEndToEndChapterGeneration({
    outDir: options.request.options.outDir,
    input: options.request.input,
    createHarness: options.createHarness,
    resolveConfig: options.resolveConfig,
    onLifecycleEvent: async (event) => {
      lifecycleEvents.push(event);
      await options.onLifecycleEvent?.(event);
    },
  });

  const workflowError = execution.workflowResult.errors[0];
  const shouldTreatAsWorkflowFailure = !execution.workflowResult.ok
    && workflowError?.code !== "simulation_validation_failed";

  if (shouldTreatAsWorkflowFailure) {
    throw new ChapterGenerationWorkflowRunError({
      workflowError: workflowError ?? {
        code: "workflow_runtime_error",
        message: "Chapter generation workflow failed without a structured error.",
        stage: "verify_output",
        retryable: false,
      },
      workflowResult:
        execution.workflowResult as NovelWorkflowRunResult<{ outcome: unknown }>,
      lifecycleEvents,
    });
  }

  assertEndToEndChapterGenerationPassed(execution);

  return {
    request: options.request,
    execution,
    lifecycleEvents,
    contract: buildChapterGenerationProgrammaticRunResponse({
      request: options.request,
      result: execution,
    }),
  };
}
