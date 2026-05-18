import { randomUUID } from "crypto";

import type { ChapterSummary } from "../schema/chapter";
import type { NovelSeed } from "../schema/novel";
import type { MasterPlan } from "../schema/planning";
import type { RendererRegenerationRequest } from "../harness";
import type { DeterministicLongFormValidationScenario } from "../sim";

export type NovelWorkflowKind =
  | "chapter_generation"
  | "long_form_verification";

export type NovelEngineComponentId =
  | "hidden_truth_model"
  | "world_model"
  | "belief_model"
  | "interaction_simulator"
  | "event_ledger"
  | "reveal_policy"
  | "renderer"
  | "verifier";

export type NovelWorkflowStageId =
  | "resolve_run_input"
  | "resolve_config"
  | "initialize_simulation_models"
  | "simulate_episodes"
  | "render_output"
  | "verify_output"
  | "finalize_output";

export interface WorkflowStageContract {
  id: NovelWorkflowStageId;
  label: string;
  dependsOn: NovelWorkflowStageId[];
  components: NovelEngineComponentId[];
  description: string;
}

export interface ChapterGenerationRunInput {
  workflow: "chapter_generation";
  runId?: string;
  seed: NovelSeed;
  startChapter: number;
  endChapter: number;
  preset?: string;
  budgetUsd?: number | null;
  masterPlan?: MasterPlan;
  previousSummaries?: Array<{
    chapter: number;
    title: string;
    summary: string;
  }>;
  previousChapterEnding?: string;
  previousSceneState?: ChapterSummary["ending_scene_state"];
  rendererRegeneration?: RendererRegenerationRequest;
}

export interface LongFormVerificationRunInput {
  workflow: "long_form_verification";
  runId?: string;
  preset?: string;
  budgetUsd?: number | null;
  outDir?: string;
  verbose?: boolean;
  scenario?: DeterministicLongFormValidationScenario;
  scenarioPath?: string;
}

export type NovelWorkflowRunInput =
  | ChapterGenerationRunInput
  | LongFormVerificationRunInput;

export type NovelWorkflowErrorCode =
  | "workflow_stage_dependency_invalid"
  | "workflow_runtime_error"
  | "unexpected_workflow_result"
  | "simulation_validation_failed"
  | "foreshadow_quality_gate"
  | "causal_ledger_validation_failed"
  | "contradiction_validation_failed";

export interface NovelWorkflowError {
  code: NovelWorkflowErrorCode;
  message: string;
  stage: NovelWorkflowStageId;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type NovelWorkflowLifecycleEvent =
  | {
    type: "run_started";
    workflow: NovelWorkflowKind;
    runId: string;
    startedAt: string;
    stageContracts: WorkflowStageContract[];
  }
  | {
    type: "stage_started";
    workflow: NovelWorkflowKind;
    runId: string;
    stage: NovelWorkflowStageId;
    startedAt: string;
  }
  | {
    type: "stage_progress";
    workflow: NovelWorkflowKind;
    runId: string;
    stage: NovelWorkflowStageId;
    occurredAt: string;
    message: string;
    details?: Record<string, unknown>;
  }
  | {
    type: "source_event";
    workflow: NovelWorkflowKind;
    runId: string;
    stage: NovelWorkflowStageId;
    occurredAt: string;
    source: "harness" | "verification";
    payload: unknown;
  }
  | {
    type: "stage_completed";
    workflow: NovelWorkflowKind;
    runId: string;
    stage: NovelWorkflowStageId;
    completedAt: string;
    details?: Record<string, unknown>;
  }
  | {
    type: "run_failed";
    workflow: NovelWorkflowKind;
    runId: string;
    failedAt: string;
    error: NovelWorkflowError;
  }
  | {
    type: "run_completed";
    workflow: NovelWorkflowKind;
    runId: string;
    completedAt: string;
    ok: boolean;
    errorCount: number;
  };

export interface NovelWorkflowStageRecord {
  stage: NovelWorkflowStageId;
  status: "pending" | "running" | "completed" | "failed";
  dependsOn: NovelWorkflowStageId[];
  components: NovelEngineComponentId[];
  startedAt?: string;
  completedAt?: string;
  details?: Record<string, unknown>;
}

export interface NovelWorkflowRunResult<TPayload> {
  ok: boolean;
  workflow: NovelWorkflowKind;
  runId: string;
  startedAt: string;
  completedAt: string;
  stageRecords: NovelWorkflowStageRecord[];
  payload?: TPayload;
  errors: NovelWorkflowError[];
}

export const CHAPTER_GENERATION_STAGE_CONTRACTS: WorkflowStageContract[] = [
  {
    id: "resolve_run_input",
    label: "Resolve Run Input",
    dependsOn: [],
    components: [],
    description: "Normalize explicit run input into a reusable workflow request.",
  },
  {
    id: "resolve_config",
    label: "Resolve Config",
    dependsOn: ["resolve_run_input"],
    components: [],
    description: "Resolve preset/config dependencies without process-level defaults.",
  },
  {
    id: "initialize_simulation_models",
    label: "Initialize Simulation Models",
    dependsOn: ["resolve_config"],
    components: [
      "hidden_truth_model",
      "world_model",
      "belief_model",
      "event_ledger",
      "reveal_policy",
    ],
    description: "Prepare canonical truth, cognition, reveal rules, and ledger state before generation.",
  },
  {
    id: "simulate_episodes",
    label: "Simulate Episodes",
    dependsOn: ["initialize_simulation_models"],
    components: [
      "interaction_simulator",
      "world_model",
      "belief_model",
      "event_ledger",
    ],
    description: "Advance episode state through simulation-centered interactions and immediate fact updates.",
  },
  {
    id: "render_output",
    label: "Render Output",
    dependsOn: ["simulate_episodes"],
    components: ["renderer", "reveal_policy"],
    description: "Render episode prose from simulation state and reveal constraints.",
  },
  {
    id: "verify_output",
    label: "Verify Output",
    dependsOn: ["simulate_episodes", "render_output"],
    components: ["verifier", "world_model", "belief_model", "event_ledger"],
    description: "Verify causal, memory, belief, and utterance integrity against canonical truth.",
  },
  {
    id: "finalize_output",
    label: "Finalize Output",
    dependsOn: ["verify_output"],
    components: ["renderer", "verifier"],
    description: "Finalize reusable workflow results and artifact metadata for downstream surfaces.",
  },
];

export const LONG_FORM_VERIFICATION_STAGE_CONTRACTS: WorkflowStageContract[] = [
  {
    id: "resolve_run_input",
    label: "Resolve Run Input",
    dependsOn: [],
    components: [],
    description: "Normalize verification run input into a reusable workflow request.",
  },
  {
    id: "resolve_config",
    label: "Resolve Config",
    dependsOn: ["resolve_run_input"],
    components: [],
    description: "Resolve verification config without relying on CLI defaults.",
  },
  {
    id: "initialize_simulation_models",
    label: "Initialize Simulation Models",
    dependsOn: ["resolve_config"],
    components: [
      "hidden_truth_model",
      "world_model",
      "belief_model",
      "event_ledger",
      "reveal_policy",
    ],
    description: "Rehydrate canonical simulation state for long-horizon verification.",
  },
  {
    id: "verify_output",
    label: "Verify Output",
    dependsOn: ["initialize_simulation_models"],
    components: ["verifier", "world_model", "belief_model", "event_ledger"],
    description: "Run contradiction, foreshadow, and cognition verification across the full horizon.",
  },
  {
    id: "finalize_output",
    label: "Finalize Output",
    dependsOn: ["verify_output"],
    components: ["verifier"],
    description: "Finalize structured verification results and artifact references.",
  },
];

export function resolveWorkflowStageContracts(
  workflow: NovelWorkflowKind,
): WorkflowStageContract[] {
  return workflow === "chapter_generation"
    ? CHAPTER_GENERATION_STAGE_CONTRACTS
    : LONG_FORM_VERIFICATION_STAGE_CONTRACTS;
}

export function validateWorkflowStageContracts(
  contracts: WorkflowStageContract[],
): NovelWorkflowError[] {
  const errors: NovelWorkflowError[] = [];
  const ids = new Set<NovelWorkflowStageId>();

  for (const contract of contracts) {
    if (ids.has(contract.id)) {
      errors.push({
        code: "workflow_stage_dependency_invalid",
        message: `Duplicate stage contract: ${contract.id}`,
        stage: contract.id,
        retryable: false,
      });
      continue;
    }
    ids.add(contract.id);
  }

  for (const contract of contracts) {
    for (const dependency of contract.dependsOn) {
      if (dependency === contract.id) {
        errors.push({
          code: "workflow_stage_dependency_invalid",
          message: `Stage ${contract.id} cannot depend on itself.`,
          stage: contract.id,
          retryable: false,
        });
      } else if (!ids.has(dependency)) {
        errors.push({
          code: "workflow_stage_dependency_invalid",
          message: `Stage ${contract.id} depends on unknown stage ${dependency}.`,
          stage: contract.id,
          retryable: false,
        });
      }
    }
  }

  return errors;
}

export function createWorkflowStageRecords(
  contracts: WorkflowStageContract[],
): NovelWorkflowStageRecord[] {
  return contracts.map((contract) => ({
    stage: contract.id,
    status: "pending",
    dependsOn: [...contract.dependsOn],
    components: [...contract.components],
  }));
}

export function createWorkflowRunId(
  workflow: NovelWorkflowKind,
  suppliedRunId?: string,
): string {
  return suppliedRunId?.trim() || `${workflow}:${randomUUID()}`;
}
