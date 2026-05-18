import * as fs from "fs";
import * as path from "path";

import { load as loadYaml } from "js-yaml";
import { z } from "zod";

import {
  createRendererRegenerationRequest,
  normalizeRendererRegenerationRequest,
  type RendererNarrativeStateSnapshot,
  type RendererRegenerationRequest,
} from "../harness";
import {
  CanonicalValidationRunError,
  CausalLedgerValidationRunError,
  ChapterGenerationWorkflowRunError,
  ContradictionValidationRunError,
  ForeshadowQualityGateRunError,
  createChapterGenerationProgrammaticRunRequest,
  runChapterGenerationProgrammatic,
  type ChapterGenerationProgrammaticRunResponse,
  type ChapterGenerationRunInput,
  type ChapterGenerationProgrammaticRunRequest,
  type NovelWorkflowError,
  type NovelWorkflowLifecycleEvent,
  type RunEndToEndChapterGenerationOptions,
} from "../orchestration";
import { ChapterSummarySchema } from "../schema/chapter";
import type { NovelSeed } from "../schema/novel";
import { MasterPlanSchema, type MasterPlan } from "../schema/planning";

const PreviousSummarySchema = z.object({
  chapter: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
});

const ChapterRangeSchema = z.string().min(1);

const GenerateCliConfigFieldsSchema = z.object({
  workflow: z.literal("chapter_generation").default("chapter_generation"),
  runId: z.string().min(1).optional(),
  seedPath: z.string().min(1),
  chapters: ChapterRangeSchema.optional(),
  startChapter: z.number().int().positive().optional(),
  endChapter: z.number().int().positive().optional(),
  preset: z.string().min(1).default("default"),
  outDir: z.string().min(1).default("./output"),
  budgetUsd: z.number().finite().nonnegative().nullable().default(null),
  qualityThreshold: z.number().finite().min(0).max(1).optional(),
  maxAttempts: z.number().int().positive().optional(),
  verbose: z.boolean().default(true),
  masterPlanPath: z.string().min(1).optional(),
  previousSummariesPath: z.string().min(1).optional(),
  previousSceneStatePath: z.string().min(1).optional(),
  previousChapterEnding: z.string().min(1).optional(),
  rendererRegenerationRequestPath: z.string().min(1).optional(),
});

const GenerateCliConfigSchema = GenerateCliConfigFieldsSchema.superRefine(
  (value, context) => {
    const hasChapterRange = value.chapters !== undefined;
    const hasExplicitStart = value.startChapter !== undefined;
    const hasExplicitEnd = value.endChapter !== undefined;

    if (!hasChapterRange && (!hasExplicitStart || !hasExplicitEnd)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide either chapters or both startChapter and endChapter.",
        path: ["chapters"],
      });
    }

    if (hasExplicitStart !== hasExplicitEnd) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "startChapter and endChapter must be provided together.",
        path: hasExplicitStart ? ["endChapter"] : ["startChapter"],
      });
    }

    if (
      hasExplicitStart
      && hasExplicitEnd
      && value.startChapter! > value.endChapter!
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startChapter must be less than or equal to endChapter.",
        path: ["startChapter"],
      });
    }
  },
);

const CliNovelSeedInputSchema = z.object({
  title: z.string(),
  logline: z.string(),
  total_chapters: z.number().int(),
  world: z.record(z.string(), z.unknown()),
  characters: z.array(z.unknown()),
  story_threads: z.array(z.unknown()),
  arcs: z.array(z.unknown()),
  foreshadowing: z.array(z.unknown()),
  chapter_outlines: z.array(z.unknown()),
  extended_outlines: z.array(z.unknown()),
  style: z.record(z.string(), z.unknown()),
});

const GenerateCliOverridesSchema = z.object({
  configPath: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  seedPath: z.string().min(1).optional(),
  chapters: ChapterRangeSchema.optional(),
  startChapter: z.number().int().positive().optional(),
  endChapter: z.number().int().positive().optional(),
  preset: z.string().min(1).optional(),
  outDir: z.string().min(1).optional(),
  budgetUsd: z.number().finite().nonnegative().nullable().optional(),
  qualityThreshold: z.number().finite().min(0).max(1).optional(),
  maxAttempts: z.number().int().positive().optional(),
  verbose: z.boolean().optional(),
  masterPlanPath: z.string().min(1).optional(),
  previousSummariesPath: z.string().min(1).optional(),
  previousSceneStatePath: z.string().min(1).optional(),
  previousChapterEnding: z.string().min(1).optional(),
  rendererRegenerationRequestPath: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (
    value.startChapter !== undefined
    && value.endChapter !== undefined
    && value.startChapter > value.endChapter
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startChapter must be less than or equal to endChapter.",
      path: ["startChapter"],
    });
  }
});

export type GenerateCliConfig = z.infer<typeof GenerateCliConfigSchema>;
export type GenerateCliOverrides = z.infer<typeof GenerateCliOverridesSchema>;

export interface ResolvedGenerateCliPaths {
  configPath?: string;
  seedPath: string;
  outDir: string;
  masterPlanPath?: string;
  previousSummariesPath?: string;
  previousSceneStatePath?: string;
  rendererRegenerationRequestPath?: string;
}

export interface NormalizedChapterGenerationPipelineRunRequest {
  input: ChapterGenerationRunInput;
  command: {
    preset: string;
    outDir: string;
    verbose: boolean;
    budgetUsd: number | null;
  };
  config: GenerateCliConfig;
  paths: ResolvedGenerateCliPaths;
  seed: NovelSeed;
  masterPlan?: MasterPlan;
  previousSummaries?: Array<z.infer<typeof PreviousSummarySchema>>;
  previousSceneState?: z.infer<typeof ChapterSummarySchema.shape.ending_scene_state>;
  rendererRegeneration?: RendererRegenerationRequest;
}

export const ChapterGenerationPipelineExitCode = {
  success: 0,
  invalidInput: 2,
  workflowRuntimeError: 3,
  simulationValidationFailed: 4,
  canonicalValidationFailed: 5,
  foreshadowQualityGateFailed: 6,
  causalLedgerValidationFailed: 7,
  contradictionValidationFailed: 8,
} as const;

export type ChapterGenerationPipelineExitCodeValue =
  typeof ChapterGenerationPipelineExitCode[keyof typeof ChapterGenerationPipelineExitCode];

export { ChapterGenerationWorkflowRunError };

export interface ChapterGenerationPipelineRunResult {
  normalizedRequest: NormalizedChapterGenerationPipelineRunRequest;
  execution: Awaited<
    ReturnType<typeof runChapterGenerationProgrammatic>
  >["execution"];
  lifecycleEvents: NovelWorkflowLifecycleEvent[];
  contract: ChapterGenerationProgrammaticRunResponse;
}

export interface ProgrammaticChapterGenerationPipelineRunResult {
  request: ChapterGenerationProgrammaticRunRequest;
  execution: Awaited<
    ReturnType<typeof runChapterGenerationProgrammatic>
  >["execution"];
  lifecycleEvents: NovelWorkflowLifecycleEvent[];
  contract: ChapterGenerationProgrammaticRunResponse;
}

export interface RunChapterGenerationPipelineOptions
  extends Partial<Pick<
    RunEndToEndChapterGenerationOptions,
    "createHarness" | "resolveConfig"
  >> {
  args?: string[];
  cwd?: string;
  request?: NormalizedChapterGenerationPipelineRunRequest;
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
}

export interface RunProgrammaticChapterGenerationPipelineOptions
  extends Partial<Pick<
    RunEndToEndChapterGenerationOptions,
    "createHarness" | "resolveConfig"
  >> {
  request: ChapterGenerationProgrammaticRunRequest;
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
}

function parseNumericFlag(
  flag: string,
  rawValue: string | undefined,
): number {
  if (rawValue === undefined) {
    throw new Error(`${flag} requires a value.`);
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a finite number.`);
  }

  return parsed;
}

function parseStringFlag(
  flag: string,
  rawValue: string | undefined,
): string {
  if (!rawValue) {
    throw new Error(`${flag} requires a value.`);
  }
  return rawValue;
}

function parseChapterRange(range: string): {
  startChapter: number;
  endChapter: number;
} {
  const trimmed = range.trim();
  if (!trimmed) {
    throw new Error("Chapter range cannot be empty.");
  }

  const parts = trimmed.includes("-")
    ? trimmed.split("-")
    : [trimmed, trimmed];
  if (parts.length !== 2) {
    throw new Error(`Invalid chapter range: ${range}`);
  }

  const startChapter = Number(parts[0]);
  const endChapter = Number(parts[1]);
  if (
    !Number.isInteger(startChapter)
    || !Number.isInteger(endChapter)
    || startChapter <= 0
    || endChapter <= 0
  ) {
    throw new Error(`Invalid chapter range: ${range}`);
  }
  if (startChapter > endChapter) {
    throw new Error(
      `Invalid chapter range: ${range} (start cannot be greater than end).`,
    );
  }

  return { startChapter, endChapter };
}

function readStructuredFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf-8");
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".yaml" || extension === ".yml") {
    return loadYaml(raw);
  }

  return JSON.parse(raw);
}

function isRendererNarrativeStateSnapshot(
  value: unknown,
): value is RendererNarrativeStateSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RendererNarrativeStateSnapshot>;
  return typeof candidate.chapterNumber === "number"
    && Boolean(candidate.blueprint)
    && Array.isArray(candidate.previousSummaries)
    && Boolean(candidate.simulationState);
}

function resolvePathWithSource(options: {
  cwd: string;
  configDir?: string;
  configValue?: string;
  overrideValue?: string;
}): string | undefined {
  if (options.overrideValue !== undefined) {
    return path.resolve(options.cwd, options.overrideValue);
  }
  if (options.configValue !== undefined) {
    return path.resolve(options.configDir ?? options.cwd, options.configValue);
  }
  return undefined;
}

function mergeGenerateConfig(
  fileConfig: Partial<GenerateCliConfig>,
  overrides: GenerateCliOverrides,
): GenerateCliConfig {
  const merged = {
    ...fileConfig,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  };

  if (
    merged.chapters === undefined
    && merged.startChapter === undefined
    && merged.endChapter === undefined
  ) {
    merged.chapters = "1-3";
  }

  return GenerateCliConfigSchema.parse(merged);
}

export function parseGenerateCliArgs(
  args: string[] = process.argv.slice(2),
): GenerateCliOverrides {
  const overrides: GenerateCliOverrides = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    switch (token) {
      case "--config":
        overrides.configPath = parseStringFlag(token, args[++index]);
        break;
      case "--run-id":
        overrides.runId = parseStringFlag(token, args[++index]);
        break;
      case "--seed":
        overrides.seedPath = parseStringFlag(token, args[++index]);
        break;
      case "--chapters":
        overrides.chapters = parseStringFlag(token, args[++index]);
        break;
      case "--start-chapter":
        overrides.startChapter = parseNumericFlag(token, args[++index]);
        break;
      case "--end-chapter":
        overrides.endChapter = parseNumericFlag(token, args[++index]);
        break;
      case "--preset":
        overrides.preset = parseStringFlag(token, args[++index]);
        break;
      case "--out":
        overrides.outDir = parseStringFlag(token, args[++index]);
        break;
      case "--budget":
        overrides.budgetUsd = parseNumericFlag(token, args[++index]);
        break;
      case "--master-plan":
        overrides.masterPlanPath = parseStringFlag(token, args[++index]);
        break;
      case "--previous-summaries":
        overrides.previousSummariesPath = parseStringFlag(token, args[++index]);
        break;
      case "--previous-scene-state":
        overrides.previousSceneStatePath = parseStringFlag(token, args[++index]);
        break;
      case "--previous-chapter-ending":
        overrides.previousChapterEnding = parseStringFlag(token, args[++index]);
        break;
      case "--renderer-regeneration-request":
        overrides.rendererRegenerationRequestPath = parseStringFlag(
          token,
          args[++index],
        );
        break;
      case "--quiet":
        overrides.verbose = false;
        break;
      case "--verbose":
        overrides.verbose = true;
        break;
      default:
        throw new Error(`Unknown generate CLI option: ${token}`);
    }
  }

  return GenerateCliOverridesSchema.parse(overrides);
}

export function resolveChapterGenerationRunRequest(options: {
  args?: string[];
  cwd?: string;
} = {}): NormalizedChapterGenerationPipelineRunRequest {
  const cwd = options.cwd ?? process.cwd();
  const overrides = parseGenerateCliArgs(options.args);
  const configPath = overrides.configPath
    ? path.resolve(cwd, overrides.configPath)
    : undefined;
  const configDir = configPath ? path.dirname(configPath) : undefined;
  const fileConfig = configPath
    ? GenerateCliConfigFieldsSchema.partial().parse(readStructuredFile(configPath))
    : {};
  const config = mergeGenerateConfig(fileConfig, overrides);

  const paths: ResolvedGenerateCliPaths = {
    configPath,
    seedPath: resolvePathWithSource({
      cwd,
      configDir,
      configValue: fileConfig.seedPath,
      overrideValue: overrides.seedPath,
    })!,
    outDir: resolvePathWithSource({
      cwd,
      configDir,
      configValue: fileConfig.outDir,
      overrideValue: overrides.outDir,
    })!,
    masterPlanPath: resolvePathWithSource({
      cwd,
      configDir,
      configValue: fileConfig.masterPlanPath,
      overrideValue: overrides.masterPlanPath,
    }),
    previousSummariesPath: resolvePathWithSource({
      cwd,
      configDir,
      configValue: fileConfig.previousSummariesPath,
      overrideValue: overrides.previousSummariesPath,
    }),
    previousSceneStatePath: resolvePathWithSource({
      cwd,
      configDir,
      configValue: fileConfig.previousSceneStatePath,
      overrideValue: overrides.previousSceneStatePath,
    }),
    rendererRegenerationRequestPath: resolvePathWithSource({
      cwd,
      configDir,
      configValue: fileConfig.rendererRegenerationRequestPath,
      overrideValue: overrides.rendererRegenerationRequestPath,
    }),
  };

  const seed = CliNovelSeedInputSchema.parse(
    readStructuredFile(paths.seedPath),
  ) as NovelSeed;
  const masterPlan = paths.masterPlanPath
    ? MasterPlanSchema.parse(readStructuredFile(paths.masterPlanPath))
    : undefined;
  const previousSummaries = paths.previousSummariesPath
    ? z.array(PreviousSummarySchema).parse(
      readStructuredFile(paths.previousSummariesPath),
    )
    : undefined;
  const previousSceneState = paths.previousSceneStatePath
    ? ChapterSummarySchema.shape.ending_scene_state.parse(
      readStructuredFile(paths.previousSceneStatePath),
    )
    : undefined;
  const rendererRegeneration = paths.rendererRegenerationRequestPath
    ? (() => {
      const parsed = readStructuredFile(paths.rendererRegenerationRequestPath);
      return isRendererNarrativeStateSnapshot(parsed)
        ? createRendererRegenerationRequest(parsed)
        : normalizeRendererRegenerationRequest(parsed as RendererRegenerationRequest);
    })()
    : undefined;

  const chapterBounds = config.chapters
    ? parseChapterRange(config.chapters)
    : {
      startChapter: config.startChapter!,
      endChapter: config.endChapter!,
    };
  const effectiveStartChapter =
    rendererRegeneration?.snapshot.chapterNumber ?? chapterBounds.startChapter;
  const effectiveEndChapter =
    rendererRegeneration?.snapshot.chapterNumber ?? chapterBounds.endChapter;

  return {
    input: {
      workflow: "chapter_generation",
      runId: config.runId,
      seed,
      startChapter: effectiveStartChapter,
      endChapter: effectiveEndChapter,
      preset: config.preset,
      budgetUsd: config.budgetUsd,
      masterPlan,
      previousSummaries,
      previousChapterEnding: config.previousChapterEnding,
      previousSceneState: previousSceneState ?? undefined,
      rendererRegeneration,
    },
    command: {
      preset: config.preset,
      outDir: paths.outDir,
      verbose: config.verbose,
      budgetUsd: config.budgetUsd,
    },
    config,
    paths,
    seed,
    masterPlan,
    previousSummaries,
    previousSceneState: previousSceneState ?? undefined,
    rendererRegeneration,
  };
}

function mapWorkflowErrorCodeToExitCode(
  code: NovelWorkflowError["code"],
): ChapterGenerationPipelineExitCodeValue {
  switch (code) {
    case "simulation_validation_failed":
      return ChapterGenerationPipelineExitCode.simulationValidationFailed;
    case "foreshadow_quality_gate":
      return ChapterGenerationPipelineExitCode.foreshadowQualityGateFailed;
    case "causal_ledger_validation_failed":
      return ChapterGenerationPipelineExitCode.causalLedgerValidationFailed;
    case "contradiction_validation_failed":
      return ChapterGenerationPipelineExitCode.contradictionValidationFailed;
    default:
      return ChapterGenerationPipelineExitCode.workflowRuntimeError;
  }
}

function isInvalidInputError(error: unknown): boolean {
  if (error instanceof z.ZodError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const nodeError = error as NodeJS.ErrnoException;
  if (
    nodeError.code === "ENOENT"
    || nodeError.code === "EISDIR"
    || nodeError.code === "ENOTDIR"
  ) {
    return true;
  }

  if (error instanceof SyntaxError) {
    return true;
  }

  return error.message.startsWith("Unknown generate CLI option:")
    || error.message.includes("requires a value.")
    || error.message.includes("must be a finite number.")
    || error.message.startsWith("Invalid chapter range:")
    || error.message === "Chapter range cannot be empty.";
}

export function getChapterGenerationPipelineExitCode(
  error: unknown,
): ChapterGenerationPipelineExitCodeValue {
  if (error instanceof CanonicalValidationRunError) {
    return ChapterGenerationPipelineExitCode.canonicalValidationFailed;
  }

  if (error instanceof ForeshadowQualityGateRunError) {
    return ChapterGenerationPipelineExitCode.foreshadowQualityGateFailed;
  }

  if (error instanceof CausalLedgerValidationRunError) {
    return ChapterGenerationPipelineExitCode.causalLedgerValidationFailed;
  }

  if (error instanceof ContradictionValidationRunError) {
    return ChapterGenerationPipelineExitCode.contradictionValidationFailed;
  }

  if (error instanceof ChapterGenerationWorkflowRunError) {
    return mapWorkflowErrorCodeToExitCode(error.workflowError.code);
  }

  if (
    error instanceof Error
    && error.message === "Simulation validation failed without canonical mismatch details."
  ) {
    return ChapterGenerationPipelineExitCode.simulationValidationFailed;
  }

  if (isInvalidInputError(error)) {
    return ChapterGenerationPipelineExitCode.invalidInput;
  }

  return ChapterGenerationPipelineExitCode.workflowRuntimeError;
}

async function executeChapterGenerationPipelineRequest(options: {
  request: ChapterGenerationProgrammaticRunRequest;
  createHarness?: RunEndToEndChapterGenerationOptions["createHarness"];
  resolveConfig?: RunEndToEndChapterGenerationOptions["resolveConfig"];
  onLifecycleEvent?: (
    event: NovelWorkflowLifecycleEvent,
  ) => void | Promise<void>;
}): Promise<ProgrammaticChapterGenerationPipelineRunResult> {
  const execution = await runChapterGenerationProgrammatic({
    request: options.request,
    createHarness: options.createHarness,
    resolveConfig: options.resolveConfig,
    onLifecycleEvent: options.onLifecycleEvent,
  });

  return {
    request: options.request,
    execution: execution.execution,
    lifecycleEvents: execution.lifecycleEvents,
    contract: execution.contract,
  };
}

export async function runProgrammaticChapterGenerationPipeline(
  options: RunProgrammaticChapterGenerationPipelineOptions,
): Promise<ProgrammaticChapterGenerationPipelineRunResult> {
  return executeChapterGenerationPipelineRequest(options);
}

export async function runChapterGenerationPipeline(
  options: RunChapterGenerationPipelineOptions = {},
): Promise<ChapterGenerationPipelineRunResult> {
  const normalizedRequest = options.request
    ?? resolveChapterGenerationRunRequest({
      args: options.args,
      cwd: options.cwd,
    });
  const programmaticRequest = createChapterGenerationProgrammaticRunRequest({
    input: normalizedRequest.input,
    preset: normalizedRequest.command.preset,
    outDir: normalizedRequest.command.outDir,
    verbose: normalizedRequest.command.verbose,
    budgetUsd: normalizedRequest.command.budgetUsd,
    qualityThreshold: normalizedRequest.config.qualityThreshold,
    maxAttempts: normalizedRequest.config.maxAttempts,
  });
  const execution = await executeChapterGenerationPipelineRequest({
    request: programmaticRequest,
    createHarness: options.createHarness,
    resolveConfig: options.resolveConfig,
    onLifecycleEvent: options.onLifecycleEvent,
  });

  return {
    normalizedRequest,
    execution: execution.execution,
    lifecycleEvents: execution.lifecycleEvents,
    contract: execution.contract,
  };
}
