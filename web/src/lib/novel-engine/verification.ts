import type { LongFormVerificationExecutionResult } from "../harness";
import {
  buildLongFormVerificationProgrammaticRunResponse,
  runLongFormVerificationWorkflow,
  type LongFormVerificationProgrammaticRunRequest,
  type LongFormVerificationProgrammaticRunResponse,
  type LongFormVerificationWorkflowPayload,
  type NovelWorkflowLifecycleEvent,
  type NovelWorkflowRunResult,
  type RunLongFormVerificationWorkflowOptions,
} from "../orchestration";

export interface RunNovelVerificationOptions
  extends Pick<
    RunLongFormVerificationWorkflowOptions,
    "runVerification" | "createHarness" | "resolveConfig"
  > {
  request: LongFormVerificationProgrammaticRunRequest;
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
}

export interface NovelVerificationExecution {
  request: LongFormVerificationProgrammaticRunRequest;
  workflowResult: NovelWorkflowRunResult<LongFormVerificationWorkflowPayload>;
  lifecycleEvents: NovelWorkflowLifecycleEvent[];
  result: LongFormVerificationExecutionResult;
  contract: LongFormVerificationProgrammaticRunResponse;
}

export class LongFormVerificationWorkflowRunError extends Error {
  readonly workflowResult: NovelWorkflowRunResult<LongFormVerificationWorkflowPayload>;
  readonly lifecycleEvents: NovelWorkflowLifecycleEvent[];

  constructor(options: {
    workflowResult: NovelWorkflowRunResult<LongFormVerificationWorkflowPayload>;
    lifecycleEvents: NovelWorkflowLifecycleEvent[];
  }) {
    super(
      options.workflowResult.errors[0]?.message
      ?? "Long-form verification workflow completed without a result payload.",
    );
    this.name = "LongFormVerificationWorkflowRunError";
    this.workflowResult = options.workflowResult;
    this.lifecycleEvents = options.lifecycleEvents;
  }
}

export async function runNovelVerification(
  options: RunNovelVerificationOptions,
): Promise<NovelVerificationExecution> {
  const lifecycleEvents: NovelWorkflowLifecycleEvent[] = [];
  const workflowResult = await runLongFormVerificationWorkflow({
    input: options.request.input,
    runVerification: options.runVerification,
    createHarness: options.createHarness,
    resolveConfig: options.resolveConfig,
    onLifecycleEvent: async (event) => {
      lifecycleEvents.push(event);
      await options.onLifecycleEvent?.(event);
    },
  });
  const result = workflowResult.payload?.result;

  if (!result) {
    throw new LongFormVerificationWorkflowRunError({
      workflowResult,
      lifecycleEvents,
    });
  }

  return {
    request: options.request,
    workflowResult,
    lifecycleEvents,
    result,
    contract: buildLongFormVerificationProgrammaticRunResponse({
      request: options.request,
      workflowResult,
      result,
    }),
  };
}
