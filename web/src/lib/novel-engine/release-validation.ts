import * as path from "path";

import {
  normalizeRendererRegenerationRequest,
  type RendererRegenerationRequest,
} from "../harness";
import type {
  ChapterGenerationProgrammaticRunResponse,
  NovelWorkflowArtifactReference,
} from "../orchestration";

export type ChapterGenerationReleaseSurface = "cli" | "library" | "api";

export interface ChapterGenerationReleaseSurfaceResult {
  surface: ChapterGenerationReleaseSurface;
  contract: ChapterGenerationProgrammaticRunResponse;
}

export interface NormalizedChapterGenerationReleaseContract {
  ok: boolean;
  workflow: "chapter_generation";
  runId: string;
  request: ChapterGenerationProgrammaticRunResponse["request"];
  progress: ChapterGenerationProgrammaticRunResponse["progress"];
  state: ChapterGenerationProgrammaticRunResponse["state"];
  artifacts: ChapterGenerationProgrammaticRunResponse["artifacts"];
  report: ChapterGenerationProgrammaticRunResponse["report"];
  errors: ChapterGenerationProgrammaticRunResponse["errors"];
}

export interface ChapterGenerationReleaseInvariantViolation {
  surface: ChapterGenerationReleaseSurface;
  message: string;
}

export interface ChapterGenerationReleaseParityMismatch {
  baselineSurface: ChapterGenerationReleaseSurface;
  comparedSurface: ChapterGenerationReleaseSurface;
  path: string;
  baselineValue: unknown;
  comparedValue: unknown;
}

export interface ChapterGenerationReleaseSurfaceValidation {
  surface: ChapterGenerationReleaseSurface;
  normalizedContract: NormalizedChapterGenerationReleaseContract;
}

export interface ChapterGenerationReleaseValidationReport {
  ok: boolean;
  baselineSurface: ChapterGenerationReleaseSurface;
  surfaces: ChapterGenerationReleaseSurfaceValidation[];
  invariantViolations: ChapterGenerationReleaseInvariantViolation[];
  parityMismatches: ChapterGenerationReleaseParityMismatch[];
}

function normalizeComparablePath(
  outDir: string | undefined,
  artifactPath: string,
): string {
  if (!outDir) {
    return artifactPath.split(path.sep).join("/");
  }

  const relativePath = path.relative(outDir, artifactPath);
  return (relativePath === "" ? "." : relativePath).split(path.sep).join("/");
}

function normalizeArtifactReference(
  artifact: NovelWorkflowArtifactReference,
  outDir: string | undefined,
): NovelWorkflowArtifactReference {
  return {
    ...artifact,
    path: normalizeComparablePath(outDir, artifact.path),
  };
}

function normalizeRendererRegeneration(
  request: RendererRegenerationRequest | undefined,
): RendererRegenerationRequest | undefined {
  return request
    ? normalizeRendererRegenerationRequest(request)
    : undefined;
}

export function normalizeChapterGenerationContractForReleaseParity(
  contract: ChapterGenerationProgrammaticRunResponse,
): NormalizedChapterGenerationReleaseContract {
  const normalized = JSON.parse(
    JSON.stringify(contract),
  ) as ChapterGenerationProgrammaticRunResponse;
  const outDir = normalized.request.options.outDir;

  normalized.request.input.rendererRegeneration = normalizeRendererRegeneration(
    normalized.request.input.rendererRegeneration,
  );
  normalized.request.input.previousSummaries = (
    normalized.request.input.previousSummaries ?? []
  ).map((summary) => ({
    ...summary,
  }));
  normalized.report.chapters = normalized.report.chapters.map((chapter) => ({
    ...chapter,
    rendererRegenerationRequest: normalizeRendererRegeneration(
      chapter.rendererRegenerationRequest,
    ),
  }));

  return {
    ...normalized,
    runId: "<run-id>",
    request: {
      ...normalized.request,
      input: {
        ...normalized.request.input,
        previousSummaries: normalized.request.input.previousSummaries,
      },
      options: {
        ...normalized.request.options,
        outDir: outDir ? "<outDir>" : undefined,
      },
    },
    progress: {
      ...normalized.progress,
      stageRecords: normalized.progress.stageRecords.map((record) => ({
        stage: record.stage,
        status: record.status,
        dependsOn: [...record.dependsOn],
        components: [...record.components],
        details: record.details,
      })),
    },
    state: {
      ...normalized.state,
      startedAt: "<timestamp>",
      completedAt: "<timestamp>",
    },
    artifacts: [...normalized.artifacts]
      .map((artifact) => normalizeArtifactReference(artifact, outDir))
      .sort((left, right) => {
        const leftKey = `${left.role}:${left.chapterNumber ?? 0}:${left.path}`;
        const rightKey = `${right.role}:${right.chapterNumber ?? 0}:${right.path}`;
        return leftKey.localeCompare(rightKey);
      }),
  };
}

function countArtifactsByRole(
  artifacts: ReadonlyArray<NovelWorkflowArtifactReference>,
  role: NovelWorkflowArtifactReference["role"],
): number {
  return artifacts.filter((artifact) => artifact.role === role).length;
}

function validateArtifactLayout(
  contract: ChapterGenerationProgrammaticRunResponse,
  surface: ChapterGenerationReleaseSurface,
): ChapterGenerationReleaseInvariantViolation[] {
  const expectedSingletonRoles: NovelWorkflowArtifactReference["role"][] = [
    "output_directory",
    "result_file",
    "chapters_directory",
    "summaries_directory",
    "ledgers_directory",
    "renderer_regeneration_directory",
    "metadata_directory",
    "run_metadata_file",
    "artifact_manifest_file",
  ];
  const violations: ChapterGenerationReleaseInvariantViolation[] = [];

  for (const role of expectedSingletonRoles) {
    if (countArtifactsByRole(contract.artifacts, role) !== 1) {
      violations.push({
        surface,
        message: `Expected exactly one ${role} artifact.`,
      });
    }
  }

  const generatedChapterCount = contract.report.chapters.length;
  if (
    countArtifactsByRole(contract.artifacts, "chapter_text")
    !== generatedChapterCount
  ) {
    violations.push({
      surface,
      message:
        "Chapter text artifact count does not match the generated chapter count.",
    });
  }

  if (
    countArtifactsByRole(contract.artifacts, "chapter_summary")
    !== generatedChapterCount
  ) {
    violations.push({
      surface,
      message:
        "Chapter summary artifact count does not match the generated chapter count.",
    });
  }

  const rendererStateCount = contract.report.chapters.filter(
    (chapter) => chapter.rendererRegenerationRequest,
  ).length;
  if (
    countArtifactsByRole(contract.artifacts, "renderer_regeneration_state")
    !== rendererStateCount
  ) {
    violations.push({
      surface,
      message:
        "Renderer-regeneration artifact count does not match the report chapter state.",
    });
  }

  return violations;
}

export function validateChapterGenerationReleaseSurface(
  result: ChapterGenerationReleaseSurfaceResult,
): ChapterGenerationReleaseInvariantViolation[] {
  const { surface, contract } = result;
  const violations: ChapterGenerationReleaseInvariantViolation[] = [];
  const requestedChapterCount =
    contract.request.input.endChapter - contract.request.input.startChapter + 1;
  const generatedChapterCount = contract.report.chapters.length;
  const expectedMode = contract.request.input.rendererRegeneration
    ? "renderer_regeneration"
    : "standard";

  if (!contract.ok) {
    violations.push({ surface, message: "Run contract must report ok=true." });
  }

  if (contract.workflow !== "chapter_generation") {
    violations.push({
      surface,
      message: "Workflow must remain chapter_generation.",
    });
  }

  if (contract.request.input.workflow !== "chapter_generation") {
    violations.push({
      surface,
      message: "Request input workflow must remain chapter_generation.",
    });
  }

  if (contract.progress.status !== "completed") {
    violations.push({
      surface,
      message: "Run progress must finish with status=completed.",
    });
  }

  if (contract.progress.completedStageCount !== contract.progress.totalStageCount) {
    violations.push({
      surface,
      message: "All workflow stages must be completed for a release-parity run.",
    });
  }

  if (contract.progress.failedStageCount !== 0) {
    violations.push({
      surface,
      message: "Release-parity runs must not contain failed stages.",
    });
  }

  if (contract.state.chapterRange.requestedChapterCount !== requestedChapterCount) {
    violations.push({
      surface,
      message: "Requested chapter count must match the request range.",
    });
  }

  if (contract.state.chapterRange.generatedChapterCount !== generatedChapterCount) {
    violations.push({
      surface,
      message: "Generated chapter count must match the report chapter count.",
    });
  }

  if (contract.report.mode !== expectedMode || contract.state.mode !== expectedMode) {
    violations.push({
      surface,
      message: "Run mode must stay aligned with renderer-regeneration intent.",
    });
  }

  if (contract.state.totals.totalTokens !== contract.report.totalTokens) {
    violations.push({
      surface,
      message: "State totalTokens must equal report.totalTokens.",
    });
  }

  if (contract.state.totals.totalCostUsd !== contract.report.totalCostUsd) {
    violations.push({
      surface,
      message: "State totalCostUsd must equal report.totalCostUsd.",
    });
  }

  if (contract.state.totals.totalDurationMs !== contract.report.totalDurationMs) {
    violations.push({
      surface,
      message: "State totalDurationMs must equal report.totalDurationMs.",
    });
  }

  if (
    contract.state.verification.canonicalValidationFailureCount
    !== contract.report.canonicalValidationFailures.length
  ) {
    violations.push({
      surface,
      message:
        "Canonical validation failure count must equal the detailed report length.",
    });
  }

  if (
    contract.state.verification.contradictionViolationCount
    !== contract.report.contradictionValidation.totalViolationCount
  ) {
    violations.push({
      surface,
      message:
        "Contradiction violation count must equal the contradiction report total.",
    });
  }

  if (
    contract.state.verification.causalLedgerIssueCount
    !== contract.report.causalLedgerValidation.issueCount
  ) {
    violations.push({
      surface,
      message:
        "Causal-ledger issue count must equal the causal-ledger report total.",
    });
  }

  if (
    contract.state.verification.foreshadowQualityGatePassed
    !== contract.report.foreshadowQualityGate.pass
  ) {
    violations.push({
      surface,
      message:
        "Foreshadow quality gate pass state must equal the report verdict.",
    });
  }

  const chapterNumbers = contract.report.chapters.map((chapter) => chapter.chapterNumber);
  const expectedNumbers = Array.from(
    { length: requestedChapterCount },
    (_, index) => contract.request.input.startChapter + index,
  );
  if (JSON.stringify(chapterNumbers) !== JSON.stringify(expectedNumbers)) {
    violations.push({
      surface,
      message:
        "Generated chapter numbers must exactly match the requested contiguous range.",
    });
  }

  if (contract.errors.length !== 0) {
    violations.push({
      surface,
      message: "Successful release-parity runs must not contain workflow errors.",
    });
  }

  violations.push(...validateArtifactLayout(contract, surface));
  return violations;
}

function findFirstDifference(
  baseline: unknown,
  compared: unknown,
  pathLabel = "$",
): { path: string; baselineValue: unknown; comparedValue: unknown } | null {
  if (Object.is(baseline, compared)) {
    return null;
  }

  if (
    baseline === null
    || compared === null
    || typeof baseline !== "object"
    || typeof compared !== "object"
  ) {
    return {
      path: pathLabel,
      baselineValue: baseline,
      comparedValue: compared,
    };
  }

  if (Array.isArray(baseline) || Array.isArray(compared)) {
    if (!Array.isArray(baseline) || !Array.isArray(compared)) {
      return {
        path: pathLabel,
        baselineValue: baseline,
        comparedValue: compared,
      };
    }

    if (baseline.length !== compared.length) {
      return {
        path: `${pathLabel}.length`,
        baselineValue: baseline.length,
        comparedValue: compared.length,
      };
    }

    for (let index = 0; index < baseline.length; index += 1) {
      const difference = findFirstDifference(
        baseline[index],
        compared[index],
        `${pathLabel}[${index}]`,
      );
      if (difference) {
        return difference;
      }
    }

    return null;
  }

  const baselineRecord = baseline as Record<string, unknown>;
  const comparedRecord = compared as Record<string, unknown>;
  const keys = Array.from(
    new Set([...Object.keys(baselineRecord), ...Object.keys(comparedRecord)]),
  ).sort();

  for (const key of keys) {
    if (!(key in baselineRecord) || !(key in comparedRecord)) {
      return {
        path: `${pathLabel}.${key}`,
        baselineValue: baselineRecord[key],
        comparedValue: comparedRecord[key],
      };
    }

    const difference = findFirstDifference(
      baselineRecord[key],
      comparedRecord[key],
      `${pathLabel}.${key}`,
    );
    if (difference) {
      return difference;
    }
  }

  return null;
}

export function validateChapterGenerationReleaseParity(
  surfaces: ReadonlyArray<ChapterGenerationReleaseSurfaceResult>,
  options: { baselineSurface?: ChapterGenerationReleaseSurface } = {},
): ChapterGenerationReleaseValidationReport {
  if (surfaces.length < 2) {
    throw new Error(
      "Release parity validation requires at least two surfaces to compare.",
    );
  }

  const baselineSurface = options.baselineSurface ?? "cli";
  const normalizedSurfaces = surfaces.map((surface) => ({
    surface: surface.surface,
    normalizedContract: normalizeChapterGenerationContractForReleaseParity(
      surface.contract,
    ),
  }));
  const baseline = normalizedSurfaces.find(
    (surface) => surface.surface === baselineSurface,
  );

  if (!baseline) {
    throw new Error(
      `Baseline surface "${baselineSurface}" was not provided for release parity validation.`,
    );
  }

  const invariantViolations = surfaces.flatMap((surface) =>
    validateChapterGenerationReleaseSurface(surface),
  );
  const parityMismatches: ChapterGenerationReleaseParityMismatch[] = [];

  for (const surface of normalizedSurfaces) {
    if (surface.surface === baseline.surface) {
      continue;
    }

    const difference = findFirstDifference(
      baseline.normalizedContract,
      surface.normalizedContract,
    );
    if (difference) {
      parityMismatches.push({
        baselineSurface,
        comparedSurface: surface.surface,
        path: difference.path,
        baselineValue: difference.baselineValue,
        comparedValue: difference.comparedValue,
      });
    }
  }

  return {
    ok: invariantViolations.length === 0 && parityMismatches.length === 0,
    baselineSurface,
    surfaces: normalizedSurfaces,
    invariantViolations,
    parityMismatches,
  };
}

export function assertChapterGenerationReleaseParity(
  surfaces: ReadonlyArray<ChapterGenerationReleaseSurfaceResult>,
  options: { baselineSurface?: ChapterGenerationReleaseSurface } = {},
): ChapterGenerationReleaseValidationReport {
  const report = validateChapterGenerationReleaseParity(surfaces, options);

  if (report.ok) {
    return report;
  }

  const lines = ["Chapter-generation release parity validation failed."];

  if (report.invariantViolations.length > 0) {
    lines.push("Invariant violations:");
    for (const violation of report.invariantViolations) {
      lines.push(`- [${violation.surface}] ${violation.message}`);
    }
  }

  if (report.parityMismatches.length > 0) {
    lines.push("Surface mismatches:");
    for (const mismatch of report.parityMismatches) {
      lines.push(
        `- ${mismatch.baselineSurface} vs ${mismatch.comparedSurface} at ${mismatch.path}`,
      );
    }
  }

  throw new Error(lines.join("\n"));
}
