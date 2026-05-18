import * as fs from "fs";
import * as path from "path";

import type { LongFormVerificationExecutionResult, LongFormVerificationReport, LongFormVerificationResultPayload } from "../harness";
import type { LongFormAcceptanceCriteriaReport } from "../harness/acceptance-criteria";
import type { RendererRegenerationRequest } from "../harness";
import { normalizeRendererRegenerationRequest } from "../harness/renderer-regeneration";
import type {
  ChapterGenerationArtifactManifest,
  ChapterGenerationArtifactPaths,
  ChapterGenerationExecutionReport,
  ChapterGenerationRunMetadata,
} from "../orchestration/end-to-end";
import type { NovelWorkflowArtifactReference, NovelWorkflowArtifactRole } from "../orchestration/run-contracts";
import type { ChapterSummary } from "../schema/chapter";
import type {
  ChapterResult,
  HarnessResult,
} from "../harness/harness";
import type { SimulationCausalLedger } from "../sim/causal-ledger";
import type { SimulationCausalLedgerAggregation } from "../sim/causal-ledger-aggregation";

export type NovelArtifactSerialization = "json_pretty" | "utf8_text";

interface NovelArtifactBase {
  id: string;
  role: NovelWorkflowArtifactRole;
  label: string;
  path: string;
  relativePath: string;
  chapterNumber?: number;
}

export interface NovelArtifactDirectory extends NovelArtifactBase {
  kind: "directory";
}

export interface NovelArtifactFile<TValue> extends NovelArtifactBase {
  kind: "file";
  contentType: string;
  serialization: NovelArtifactSerialization;
  value: TValue;
}

export type NovelArtifactRecord<TValue = unknown> =
  | NovelArtifactDirectory
  | NovelArtifactFile<TValue>;

export interface ChapterGenerationArtifactBundle {
  workflow: "chapter_generation";
  outDir: string;
  outputDirectory: NovelArtifactDirectory;
  chaptersDirectory: NovelArtifactDirectory;
  summariesDirectory: NovelArtifactDirectory;
  ledgersDirectory: NovelArtifactDirectory;
  rendererRegenerationDirectory: NovelArtifactDirectory;
  metadataDirectory: NovelArtifactDirectory;
  resultFile: NovelArtifactFile<ChapterGenerationExecutionReport>;
  runMetadataFile: NovelArtifactFile<ChapterGenerationRunMetadata>;
  artifactManifestFile: NovelArtifactFile<ChapterGenerationArtifactManifest>;
  chapterTexts: Array<NovelArtifactFile<string>>;
  chapterSummaries: Array<NovelArtifactFile<ChapterSummary>>;
  rendererRegenerationStates: Array<NovelArtifactFile<RendererRegenerationRequest>>;
  causalLedgerFile?: NovelArtifactFile<SimulationCausalLedger>;
  causalLedgerAggregationFile?: NovelArtifactFile<SimulationCausalLedgerAggregation>;
  artifacts: NovelArtifactRecord[];
}

export interface LongFormVerificationArtifactBundle {
  workflow: "long_form_verification";
  outDir: string;
  outputDirectory: NovelArtifactDirectory;
  reportFile: NovelArtifactFile<LongFormVerificationReport>;
  resultFile: NovelArtifactFile<LongFormVerificationResultPayload>;
  scenarioSeedFile: NovelArtifactFile<LongFormVerificationExecutionResult["scenario"]["seed"]>;
  acceptanceCriteriaFile: NovelArtifactFile<LongFormAcceptanceCriteriaReport>;
  chapterTexts: Array<NovelArtifactFile<string>>;
  chapterSummaries: Array<NovelArtifactFile<ChapterSummary>>;
  artifacts: NovelArtifactRecord[];
}

export type NovelArtifactBundle =
  | ChapterGenerationArtifactBundle
  | LongFormVerificationArtifactBundle;

function toRelativePath(outDir: string, artifactPath: string): string {
  const relativePath = path.relative(outDir, artifactPath);
  return relativePath === "" ? "." : relativePath;
}

function createDirectoryArtifact(options: {
  id: string;
  role: NovelWorkflowArtifactRole;
  label: string;
  outDir: string;
  artifactPath: string;
  chapterNumber?: number;
}): NovelArtifactDirectory {
  return {
    id: options.id,
    role: options.role,
    label: options.label,
    kind: "directory",
    path: options.artifactPath,
    relativePath: toRelativePath(options.outDir, options.artifactPath),
    chapterNumber: options.chapterNumber,
  };
}

function createJsonArtifact<TValue>(options: {
  id: string;
  role: NovelWorkflowArtifactRole;
  label: string;
  outDir: string;
  artifactPath: string;
  value: TValue;
  chapterNumber?: number;
}): NovelArtifactFile<TValue> {
  return {
    id: options.id,
    role: options.role,
    label: options.label,
    kind: "file",
    path: options.artifactPath,
    relativePath: toRelativePath(options.outDir, options.artifactPath),
    contentType: "application/json",
    serialization: "json_pretty",
    value: options.value,
    chapterNumber: options.chapterNumber,
  };
}

function createTextArtifact(options: {
  id: string;
  role: NovelWorkflowArtifactRole;
  label: string;
  outDir: string;
  artifactPath: string;
  value: string;
  chapterNumber?: number;
}): NovelArtifactFile<string> {
  return {
    id: options.id,
    role: options.role,
    label: options.label,
    kind: "file",
    path: options.artifactPath,
    relativePath: toRelativePath(options.outDir, options.artifactPath),
    contentType: "text/plain",
    serialization: "utf8_text",
    value: options.value,
    chapterNumber: options.chapterNumber,
  };
}

function serializeArtifactValue(artifact: NovelArtifactFile<unknown>): string {
  switch (artifact.serialization) {
    case "json_pretty":
      return JSON.stringify(artifact.value, null, 2);
    case "utf8_text":
      return String(artifact.value);
    default: {
      const exhaustiveCheck: never = artifact.serialization;
      return exhaustiveCheck;
    }
  }
}

export function persistNovelArtifactBundle(bundle: NovelArtifactBundle): void {
  fs.mkdirSync(bundle.outDir, { recursive: true });

  for (const artifact of bundle.artifacts) {
    if (artifact.kind === "directory") {
      fs.mkdirSync(artifact.path, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(
      artifact.path,
      serializeArtifactValue(artifact),
      "utf-8",
    );
  }
}

export function buildNovelWorkflowArtifactReferences(
  bundle: NovelArtifactBundle,
): NovelWorkflowArtifactReference[] {
  return bundle.artifacts.map((artifact) => ({
    id: artifact.id,
    role: artifact.role,
    label: artifact.label,
    kind: artifact.kind,
    path: artifact.path,
    contentType: artifact.kind === "file" ? artifact.contentType : undefined,
    chapterNumber: artifact.chapterNumber,
  }));
}

export function buildChapterGenerationArtifactBundle(options: {
  artifactPaths: ChapterGenerationArtifactPaths;
  report: ChapterGenerationExecutionReport;
  outcome: HarnessResult;
  runMetadata: ChapterGenerationRunMetadata;
  manifest: ChapterGenerationArtifactManifest;
}): ChapterGenerationArtifactBundle {
  const outputDirectory = createDirectoryArtifact({
    id: "output_directory",
    role: "output_directory",
    label: "Output Directory",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.outDir,
  });
  const chaptersDirectory = createDirectoryArtifact({
    id: "chapters_directory",
    role: "chapters_directory",
    label: "Chapter Text Directory",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.chaptersDir,
  });
  const summariesDirectory = createDirectoryArtifact({
    id: "summaries_directory",
    role: "summaries_directory",
    label: "Chapter Summary Directory",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.summariesDir,
  });
  const ledgersDirectory = createDirectoryArtifact({
    id: "ledgers_directory",
    role: "ledgers_directory",
    label: "Ledger Directory",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.ledgersDir,
  });
  const rendererRegenerationDirectory = createDirectoryArtifact({
    id: "renderer_regeneration_directory",
    role: "renderer_regeneration_directory",
    label: "Renderer Regeneration Directory",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.rendererRegenerationDir,
  });
  const metadataDirectory = createDirectoryArtifact({
    id: "metadata_directory",
    role: "metadata_directory",
    label: "Metadata Directory",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.metadataDir,
  });

  const resultFile = createJsonArtifact({
    id: "result_file",
    role: "result_file",
    label: "Run Result JSON",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.resultFile,
    value: options.report,
  });
  const runMetadataFile = createJsonArtifact({
    id: "run_metadata_file",
    role: "run_metadata_file",
    label: "Run Metadata JSON",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.runMetadataFile,
    value: options.runMetadata,
  });
  const artifactManifestFile = createJsonArtifact({
    id: "artifact_manifest_file",
    role: "artifact_manifest_file",
    label: "Artifact Manifest JSON",
    outDir: options.artifactPaths.outDir,
    artifactPath: options.artifactPaths.manifestFile,
    value: options.manifest,
  });

  const chapterTexts = options.outcome.chapters.map((chapter, index) =>
    createTextArtifact({
      id: `chapter_text:${chapter.chapterNumber}`,
      role: "chapter_text",
      label: `Chapter ${chapter.chapterNumber} Text`,
      outDir: options.artifactPaths.outDir,
      artifactPath: options.artifactPaths.chapterFiles[index]!,
      value: chapter.text,
      chapterNumber: chapter.chapterNumber,
    }));

  const chapterSummaries = options.outcome.chapters.map((chapter, index) =>
    createJsonArtifact({
      id: `chapter_summary:${chapter.chapterNumber}`,
      role: "chapter_summary",
      label: `Chapter ${chapter.chapterNumber} Summary`,
      outDir: options.artifactPaths.outDir,
      artifactPath: options.artifactPaths.summaryFiles[index]!,
      value: chapter.summary,
      chapterNumber: chapter.chapterNumber,
    }));

  const chaptersWithRendererState = options.outcome.chapters.filter(
    (chapter): chapter is ChapterResult & { rendererRegenerationRequest: RendererRegenerationRequest } =>
      Boolean(chapter.rendererRegenerationRequest),
  );
  const rendererRegenerationStates = chaptersWithRendererState.map((chapter, index) =>
    createJsonArtifact({
      id: `renderer_regeneration_state:${chapter.chapterNumber}`,
      role: "renderer_regeneration_state",
      label: `Renderer Regeneration State ${chapter.chapterNumber}`,
      outDir: options.artifactPaths.outDir,
      artifactPath: options.artifactPaths.rendererRegenerationFiles[index]!,
      value: normalizeRendererRegenerationRequest(
        chapter.rendererRegenerationRequest,
      ),
      chapterNumber: chapter.chapterNumber,
    }));

  const causalLedgerFile = options.artifactPaths.causalLedgerFile && options.outcome.causalLedger
    ? createJsonArtifact({
      id: "causal_ledger_file",
      role: "causal_ledger_file",
      label: "Causal Ledger JSON",
      outDir: options.artifactPaths.outDir,
      artifactPath: options.artifactPaths.causalLedgerFile,
      value: options.outcome.causalLedger,
    })
    : undefined;

  const causalLedgerAggregationFile =
    options.artifactPaths.causalLedgerAggregationFile
    && options.report.causalLedgerAggregation
      ? createJsonArtifact({
        id: "causal_ledger_aggregation_file",
        role: "causal_ledger_aggregation_file",
        label: "Causal Ledger Aggregation JSON",
        outDir: options.artifactPaths.outDir,
        artifactPath: options.artifactPaths.causalLedgerAggregationFile,
        value: options.report.causalLedgerAggregation,
      })
      : undefined;

  const artifacts: NovelArtifactRecord[] = [
    outputDirectory,
    resultFile,
    chaptersDirectory,
    summariesDirectory,
    ledgersDirectory,
    rendererRegenerationDirectory,
    metadataDirectory,
    runMetadataFile,
    artifactManifestFile,
    ...chapterTexts,
    ...chapterSummaries,
    ...rendererRegenerationStates,
  ];

  if (causalLedgerFile) {
    artifacts.push(causalLedgerFile);
  }
  if (causalLedgerAggregationFile) {
    artifacts.push(causalLedgerAggregationFile);
  }

  return {
    workflow: "chapter_generation",
    outDir: options.artifactPaths.outDir,
    outputDirectory,
    chaptersDirectory,
    summariesDirectory,
    ledgersDirectory,
    rendererRegenerationDirectory,
    metadataDirectory,
    resultFile,
    runMetadataFile,
    artifactManifestFile,
    chapterTexts,
    chapterSummaries,
    rendererRegenerationStates,
    causalLedgerFile,
    causalLedgerAggregationFile,
    artifacts,
  };
}

export function buildLongFormVerificationArtifactBundle(options: {
  result: Pick<
    LongFormVerificationExecutionResult,
    "scenario" | "outcome" | "report" | "acceptanceCriteria" | "artifactPaths"
  >;
  resultPayload: LongFormVerificationResultPayload;
}): LongFormVerificationArtifactBundle {
  const outputDirectory = createDirectoryArtifact({
    id: "output_directory",
    role: "output_directory",
    label: "Output Directory",
    outDir: options.result.artifactPaths.outDir,
    artifactPath: options.result.artifactPaths.outDir,
  });
  const reportFile = createJsonArtifact({
    id: "verification_report_file",
    role: "verification_report_file",
    label: "Long-Form Verification Report",
    outDir: options.result.artifactPaths.outDir,
    artifactPath: options.result.artifactPaths.reportFile,
    value: options.result.report,
  });
  const resultFile = createJsonArtifact({
    id: "result_file",
    role: "result_file",
    label: "Long-Form Verification Result JSON",
    outDir: options.result.artifactPaths.outDir,
    artifactPath: options.result.artifactPaths.resultFile,
    value: options.resultPayload,
  });
  const scenarioSeedFile = createJsonArtifact({
    id: "verification_scenario_seed_file",
    role: "verification_scenario_seed_file",
    label: "Verification Scenario Seed",
    outDir: options.result.artifactPaths.outDir,
    artifactPath: options.result.artifactPaths.scenarioSeedFile,
    value: options.result.scenario.seed,
  });
  const acceptanceCriteriaFile = createJsonArtifact({
    id: "acceptance_criteria_results_file",
    role: "acceptance_criteria_results_file",
    label: "Acceptance Criteria Results",
    outDir: options.result.artifactPaths.outDir,
    artifactPath: options.result.artifactPaths.acceptanceCriteriaFile,
    value: options.result.acceptanceCriteria,
  });

  const chapterTexts = options.result.outcome.result.chapters.map((chapter) => {
    const paddedChapter = String(chapter.chapterNumber).padStart(3, "0");
    return createTextArtifact({
      id: `chapter_text:${chapter.chapterNumber}`,
      role: "chapter_text",
      label: `Chapter ${chapter.chapterNumber} Text`,
      outDir: options.result.artifactPaths.outDir,
      artifactPath: path.join(
        options.result.artifactPaths.outDir,
        `chapter-${paddedChapter}.txt`,
      ),
      value: chapter.text,
      chapterNumber: chapter.chapterNumber,
    });
  });

  const chapterSummaries = options.result.outcome.result.chapters.map((chapter) => {
    const paddedChapter = String(chapter.chapterNumber).padStart(3, "0");
    return createJsonArtifact({
      id: `chapter_summary:${chapter.chapterNumber}`,
      role: "chapter_summary",
      label: `Chapter ${chapter.chapterNumber} Summary`,
      outDir: options.result.artifactPaths.outDir,
      artifactPath: path.join(
        options.result.artifactPaths.outDir,
        `chapter-${paddedChapter}.summary.json`,
      ),
      value: chapter.summary,
      chapterNumber: chapter.chapterNumber,
    });
  });

  const artifacts: NovelArtifactRecord[] = [
    outputDirectory,
    reportFile,
    resultFile,
    scenarioSeedFile,
    acceptanceCriteriaFile,
    ...chapterTexts,
    ...chapterSummaries,
  ];

  return {
    workflow: "long_form_verification",
    outDir: options.result.artifactPaths.outDir,
    outputDirectory,
    reportFile,
    resultFile,
    scenarioSeedFile,
    acceptanceCriteriaFile,
    chapterTexts,
    chapterSummaries,
    artifacts,
  };
}
