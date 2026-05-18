import type {
  NovelWorkflowError,
  NovelWorkflowKind,
  NovelWorkflowLifecycleEvent,
  NovelWorkflowStageId,
  NovelWorkflowStageRecord,
  WorkflowStageContract,
} from "./contracts";

export interface WorkflowRuntime {
  workflow: NovelWorkflowKind;
  runId: string;
  startedAt: string;
  stageContracts: WorkflowStageContract[];
  stageRecords: NovelWorkflowStageRecord[];
  emitLifecycleEvent: (
    event: NovelWorkflowLifecycleEvent,
  ) => Promise<void>;
  startRun: () => Promise<void>;
  startStage: (stage: NovelWorkflowStageId, startedAt?: string) => Promise<void>;
  progressStage: (
    stage: NovelWorkflowStageId,
    message: string,
    details?: Record<string, unknown>,
    occurredAt?: string,
  ) => Promise<void>;
  completeStage: (
    stage: NovelWorkflowStageId,
    details?: Record<string, unknown>,
    completedAt?: string,
  ) => Promise<void>;
  failStage: (
    stage: NovelWorkflowStageId,
    error: NovelWorkflowError,
    failedAt?: string,
  ) => Promise<void>;
  failRun: (error: NovelWorkflowError, failedAt?: string) => Promise<void>;
  completeRun: (
    ok: boolean,
    errorCount: number,
    completedAt?: string,
  ) => Promise<void>;
  now: () => string;
}

export interface WorkflowStageExecutionResult<TContext> {
  context?: Partial<TContext>;
  details?: Record<string, unknown>;
  error?: NovelWorkflowError | null;
}

export interface WorkflowStageDefinition<TContext> {
  stage: NovelWorkflowStageId;
  execute: (
    context: TContext,
    runtime: WorkflowRuntime,
  ) => Promise<WorkflowStageExecutionResult<TContext> | void>
    | WorkflowStageExecutionResult<TContext>
    | void;
}

export type WorkflowStageSequenceResult<TContext> =
  | {
    ok: true;
    context: TContext;
  }
  | {
    ok: false;
    context: TContext;
    error: NovelWorkflowError;
    completedAt: string;
  };

function markStageStarted(
  records: NovelWorkflowStageRecord[],
  stage: NovelWorkflowStageId,
  startedAt: string,
): void {
  const record = records.find((entry) => entry.stage === stage);
  if (!record) {
    return;
  }
  record.status = "running";
  record.startedAt = startedAt;
}

function markStageCompleted(
  records: NovelWorkflowStageRecord[],
  stage: NovelWorkflowStageId,
  details: Record<string, unknown> | undefined,
  completedAt: string,
): void {
  const record = records.find((entry) => entry.stage === stage);
  if (!record) {
    return;
  }
  record.status = "completed";
  record.completedAt = completedAt;
  if (details) {
    record.details = details;
  }
}

function markStageFailed(
  records: NovelWorkflowStageRecord[],
  stage: NovelWorkflowStageId,
  error: NovelWorkflowError,
  failedAt: string,
): void {
  const record = records.find((entry) => entry.stage === stage);
  if (!record) {
    return;
  }
  record.status = "failed";
  record.completedAt = failedAt;
  record.details = { error };
}

export function createWorkflowRuntime(options: {
  workflow: NovelWorkflowKind;
  runId: string;
  startedAt: string;
  stageContracts: WorkflowStageContract[];
  stageRecords: NovelWorkflowStageRecord[];
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
  now?: () => string;
}): WorkflowRuntime {
  const now = options.now ?? (() => new Date().toISOString());

  const emitLifecycleEvent = async (
    event: NovelWorkflowLifecycleEvent,
  ): Promise<void> => {
    await options.onLifecycleEvent?.(event);
  };

  return {
    workflow: options.workflow,
    runId: options.runId,
    startedAt: options.startedAt,
    stageContracts: options.stageContracts,
    stageRecords: options.stageRecords,
    emitLifecycleEvent,
    startRun: async () => {
      await emitLifecycleEvent({
        type: "run_started",
        workflow: options.workflow,
        runId: options.runId,
        startedAt: options.startedAt,
        stageContracts: options.stageContracts,
      });
    },
    startStage: async (stage, startedAt = now()) => {
      markStageStarted(options.stageRecords, stage, startedAt);
      await emitLifecycleEvent({
        type: "stage_started",
        workflow: options.workflow,
        runId: options.runId,
        stage,
        startedAt,
      });
    },
    progressStage: async (
      stage,
      message,
      details,
      occurredAt = now(),
    ) => {
      await emitLifecycleEvent({
        type: "stage_progress",
        workflow: options.workflow,
        runId: options.runId,
        stage,
        occurredAt,
        message,
        details,
      });
    },
    completeStage: async (stage, details, completedAt = now()) => {
      markStageCompleted(options.stageRecords, stage, details, completedAt);
      await emitLifecycleEvent({
        type: "stage_completed",
        workflow: options.workflow,
        runId: options.runId,
        stage,
        completedAt,
        details,
      });
    },
    failStage: async (stage, error, failedAt = now()) => {
      markStageFailed(options.stageRecords, stage, error, failedAt);
    },
    failRun: async (error, failedAt = now()) => {
      await emitLifecycleEvent({
        type: "run_failed",
        workflow: options.workflow,
        runId: options.runId,
        failedAt,
        error,
      });
    },
    completeRun: async (ok, errorCount, completedAt = now()) => {
      await emitLifecycleEvent({
        type: "run_completed",
        workflow: options.workflow,
        runId: options.runId,
        completedAt,
        ok,
        errorCount,
      });
    },
    now,
  };
}

export async function runWorkflowStageSequence<TContext>(
  runtime: WorkflowRuntime,
  initialContext: TContext,
  stages: WorkflowStageDefinition<TContext>[],
): Promise<WorkflowStageSequenceResult<TContext>> {
  let context = { ...initialContext };

  for (const definition of stages) {
    await runtime.startStage(
      definition.stage,
      definition.stage === "resolve_run_input" ? runtime.startedAt : undefined,
    );
    const result = await definition.execute(context, runtime);

    if (result?.context) {
      context = {
        ...context,
        ...result.context,
      };
    }

    if (result?.error) {
      const completedAt = runtime.now();
      await runtime.failStage(definition.stage, result.error, completedAt);
      await runtime.failRun(result.error, completedAt);
      return {
        ok: false,
        context,
        error: result.error,
        completedAt,
      };
    }

    await runtime.completeStage(definition.stage, result?.details);
  }

  return {
    ok: true,
    context,
  };
}
