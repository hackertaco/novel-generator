#!/usr/bin/env tsx
/**
 * Quick E2E rerun using an existing seed — skips plot/seed generation.
 * Usage: npx tsx scripts/quick-rerun.ts <seed-json-path> [chapters] [outDir]
 */
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import type { NovelSeed } from "../src/lib/schema/novel";
import type { ChapterSummary } from "../src/lib/schema/chapter";
import type { MasterPlan } from "../src/lib/schema/planning";
import type { ChapterResult, HarnessEvent } from "../src/lib/harness";
import { NovelHarness, getFastConfig } from "../src/lib/harness";
import { computeDeterministicScores } from "../src/lib/evaluators/deterministic-scorer";

if (fs.existsSync(".env")) {
  const envFile = fs.readFileSync(".env", "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

export const RETRY_DELAYS_MS = [5000, 15000, 45000] as const;

export interface ChapterRunState {
  masterPlan?: MasterPlan;
  previousSummaries: Array<{ chapter: number; title: string; summary: string }>;
  previousChapterEnding?: string;
  previousSceneState?: ChapterSummary["ending_scene_state"];
}

export interface ChapterRunStatus {
  chapter: number;
  success: boolean;
  attempts: number;
  score?: number;
  errorMessages: string[];
  attemptDetails: ChapterRunAttempt[];
  safeguardStages: string[];
  pipelineWarnings: string[];
}

export interface ChapterRunAttempt {
  attempt: number;
  success: boolean;
  score?: number;
  stageHistory: string[];
  safeguardStages: string[];
  pipelineWarnings: string[];
  errorMessages: string[];
  blueprintPath?: string;
  chapterPath?: string;
}

export interface ArtifactCheck {
  kind:
    | "seed"
    | "progress_log"
    | "chapter_log"
    | "chapter_text"
    | "blueprint"
    | "world_state"
    | "report";
  path: string;
  exists: boolean;
  required: boolean;
  chapter?: number;
}

export interface ArtifactVerification {
  ok: boolean;
  checks: ArtifactCheck[];
  missingRequired: ArtifactCheck[];
}

export interface QuickRerunReport {
  generatedAt: string;
  seedTitle: string;
  maxChapters: number;
  summary: string;
  statuses: ChapterRunStatus[];
  safeguardSummary: Record<string, number>;
  artifactVerification: ArtifactVerification;
  progressLogPath: string;
  chapterLogPath: string;
  worldStateEntries: number;
}

export interface QuickRerunResult {
  outDir: string;
  statuses: ChapterRunStatus[];
  progressLogPath: string;
  chapterLogPath: string;
  reportPath: string;
  artifactVerification: ArtifactVerification;
  report: QuickRerunReport;
}

interface HarnessLike {
  run(
    seed: NovelSeed,
    startChapter: number,
    endChapter: number,
    options?: {
      masterPlan?: MasterPlan;
      previousSummaries?: Array<{ chapter: number; title: string; summary: string }>;
      previousChapterEnding?: string;
      previousSceneState?: ChapterSummary["ending_scene_state"];
    },
  ): AsyncGenerator<HarnessEvent>;
  getState(): { masterPlan?: MasterPlan };
  getWorldStateSnapshot(): unknown[];
}

interface RunChapterAttemptArgs {
  harness: HarnessLike;
  seed: NovelSeed;
  chapter: number;
  outDir: string;
  state: ChapterRunState;
  attempt: number;
  progressLogPath: string;
  chapterLogPath: string;
}

interface RunChapterAttemptResult {
  success: boolean;
  chapterResult?: ChapterResult;
  masterPlan?: MasterPlan;
  errorMessages: string[];
  stageHistory: string[];
  safeguardStages: string[];
  pipelineWarnings: string[];
  blueprintPath?: string;
  chapterPath?: string;
  score?: number;
}

const SAFEGUARD_STAGES = new Set([
  "future-character-debate",
  "missing-character-repair",
  "chapter-quality-repair",
  "final-cast-hard-repair",
]);

function timestamp(): string {
  return new Date().toISOString();
}

function appendLine(filePath: string, line: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${line}\n`, "utf-8");
}

function logProgress(progressLogPath: string, message: string): void {
  const line = `[${timestamp()}] ${message}`;
  console.log(line);
  appendLine(progressLogPath, line);
}

function appendChapterStatus(chapterLogPath: string, message: string): void {
  appendLine(chapterLogPath, `[${timestamp()}] ${message}`);
}

function saveBlueprint(outDir: string, chapter: number, blueprint: unknown): string {
  const blueprintsDir = path.join(outDir, "blueprints");
  fs.mkdirSync(blueprintsDir, { recursive: true });
  const bpPath = path.join(blueprintsDir, `ch${String(chapter).padStart(2, "0")}.json`);
  fs.writeFileSync(bpPath, JSON.stringify(blueprint, null, 2));
  return bpPath;
}

function saveChapterText(outDir: string, chapter: number, text: string): string {
  const chaptersDir = path.join(outDir, "chapters");
  fs.mkdirSync(chaptersDir, { recursive: true });
  const chapterPath = path.join(chaptersDir, `ch${String(chapter).padStart(2, "0")}.txt`);
  fs.writeFileSync(chapterPath, text);
  return chapterPath;
}

async function runChapterAttempt({
  harness,
  seed,
  chapter,
  outDir,
  state,
  attempt,
  progressLogPath,
  chapterLogPath,
}: RunChapterAttemptArgs): Promise<RunChapterAttemptResult> {
  logProgress(progressLogPath, `ch${chapter} attempt ${attempt} start`);

  const errorMessages: string[] = [];
  const stageHistory: string[] = [];
  const safeguardStages: string[] = [];
  const pipelineWarnings: string[] = [];
  let chapterResult: ChapterResult | undefined;
  let blueprintPath: string | undefined;
  let chapterPath: string | undefined;
  let score: number | undefined;

  for await (const event of harness.run(seed, chapter, chapter, {
    masterPlan: state.masterPlan,
    previousSummaries: [...state.previousSummaries],
    previousChapterEnding: state.previousChapterEnding,
    previousSceneState: state.previousSceneState,
  })) {
    switch (event.type) {
      case "chapter_start": {
        logProgress(progressLogPath, `ch${event.chapter} started`);
        break;
      }
      case "plan_generated": {
        logProgress(progressLogPath, `master plan ready for ch${chapter}`);
        break;
      }
      case "plausibility_check": {
        logProgress(
          progressLogPath,
          `plausibility ${event.passed ? "passed" : "flagged"} before ch${chapter} (${event.issues.length} issues)`,
        );
        break;
      }
      case "plausibility_fixed": {
        logProgress(progressLogPath, `plausibility auto-fix applied before ch${chapter} (${event.fixes.length} fixes)`);
        break;
      }
      case "causal_validated": {
        logProgress(progressLogPath, `causal validation for ch${chapter}: score=${event.score.toFixed(2)}`);
        break;
      }
      case "blueprint_generated": {
        blueprintPath = saveBlueprint(outDir, event.chapter, event.blueprint);
        logProgress(progressLogPath, `ch${event.chapter} blueprint saved -> ${blueprintPath}`);
        break;
      }
      case "pipeline_event": {
        const pe = event.event;
        if (pe.type === "stage_change") {
          stageHistory.push(pe.stage);
          if (SAFEGUARD_STAGES.has(pe.stage)) {
            safeguardStages.push(pe.stage);
          }
          logProgress(progressLogPath, `ch${event.chapter} stage=${pe.stage}`);
        } else if (pe.type === "error") {
          pipelineWarnings.push(pe.message);
          logProgress(progressLogPath, `ch${event.chapter} pipeline warning: ${pe.message}`);
        }
        break;
      }
      case "chapter_complete": {
        chapterResult = event.result;
        chapterPath = saveChapterText(outDir, event.result.chapterNumber, event.result.text);
        score = computeDeterministicScores(event.result.text, seed, event.result.chapterNumber).overall;
        logProgress(
          progressLogPath,
          `ch${event.result.chapterNumber} complete (${event.result.text.length} chars, ${(
            event.result.durationMs / 1000
          ).toFixed(1)}s, score=${score.toFixed(2)}) -> ${chapterPath}`,
        );
        appendChapterStatus(
          chapterLogPath,
          `ch${event.result.chapterNumber} success attempt=${attempt} score=${score.toFixed(2)} duration_ms=${event.result.durationMs}`,
        );
        break;
      }
      case "error": {
        errorMessages.push(event.message);
        logProgress(progressLogPath, `ch${event.chapter} error: ${event.message}`);
        break;
      }
      case "done": {
        break;
      }
    }
  }

  const masterPlan = harness.getState().masterPlan;

  if (!chapterResult) {
    const fallbackMessage = errorMessages.length > 0
      ? errorMessages.join(" | ")
      : `ch${chapter} completed without chapter_complete event`;
    appendChapterStatus(
      chapterLogPath,
      `ch${chapter} failure attempt=${attempt} error=${fallbackMessage}`,
    );
  }

  return {
    success: Boolean(chapterResult),
    chapterResult,
    masterPlan,
    errorMessages,
    stageHistory,
    safeguardStages,
    pipelineWarnings,
    blueprintPath,
    chapterPath,
    score,
  };
}

export function formatRunSummary(statuses: ChapterRunStatus[], maxChapters: number): string {
  const successChapters = statuses.filter((status) => status.success).map((status) => status.chapter);
  const failedChapters = statuses.filter((status) => !status.success).map((status) => status.chapter);
  const failedLabel = failedChapters.length > 0 ? failedChapters.join(", ") : "없음";
  return `${maxChapters}화 중 ${successChapters.length}화 성공, ${failedLabel}화 실패`;
}

function createArtifactCheck(
  kind: ArtifactCheck["kind"],
  filePath: string,
  required: boolean,
  chapter?: number,
): ArtifactCheck {
  return {
    kind,
    path: filePath,
    exists: fs.existsSync(filePath),
    required,
    chapter,
  };
}

function verifyArtifacts(
  outDir: string,
  statuses: ChapterRunStatus[],
  progressLogPath: string,
  chapterLogPath: string,
  reportPath: string,
  worldStateEntries: number,
): ArtifactVerification {
  const checks: ArtifactCheck[] = [
    createArtifactCheck("seed", path.join(outDir, "seed.json"), true),
    createArtifactCheck("progress_log", progressLogPath, true),
    createArtifactCheck("chapter_log", chapterLogPath, true),
    createArtifactCheck("report", reportPath, true),
  ];

  for (const status of statuses) {
    if (!status.success) continue;
    checks.push(
      createArtifactCheck(
        "chapter_text",
        path.join(outDir, "chapters", `ch${String(status.chapter).padStart(2, "0")}.txt`),
        true,
        status.chapter,
      ),
      createArtifactCheck(
        "blueprint",
        path.join(outDir, "blueprints", `ch${String(status.chapter).padStart(2, "0")}.json`),
        true,
        status.chapter,
      ),
    );
  }

  if (worldStateEntries > 0) {
    checks.push(createArtifactCheck("world_state", path.join(outDir, "world-state.json"), true));
  }

  const missingRequired = checks.filter((check) => check.required && !check.exists);
  return {
    ok: missingRequired.length === 0,
    checks,
    missingRequired,
  };
}

function summarizeSafeguards(statuses: ChapterRunStatus[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const stage of SAFEGUARD_STAGES) {
    summary[stage] = 0;
  }

  for (const status of statuses) {
    for (const attempt of status.attemptDetails) {
      for (const stage of attempt.safeguardStages) {
        summary[stage] = (summary[stage] ?? 0) + 1;
      }
    }
  }

  return summary;
}

function writeReport(
  outDir: string,
  seed: NovelSeed,
  maxChapters: number,
  statuses: ChapterRunStatus[],
  progressLogPath: string,
  chapterLogPath: string,
  worldStateEntries: number,
): { reportPath: string; report: QuickRerunReport; artifactVerification: ArtifactVerification } {
  const reportPath = path.join(outDir, "report.json");
  const report: QuickRerunReport = {
    generatedAt: timestamp(),
    seedTitle: seed.title,
    maxChapters,
    summary: formatRunSummary(statuses, maxChapters),
    statuses,
    safeguardSummary: summarizeSafeguards(statuses),
    artifactVerification: {
      ok: false,
      checks: [],
      missingRequired: [],
    },
    progressLogPath,
    chapterLogPath,
    worldStateEntries,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const artifactVerification = verifyArtifacts(
    outDir,
    statuses,
    progressLogPath,
    chapterLogPath,
    reportPath,
    worldStateEntries,
  );
  report.artifactVerification = artifactVerification;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return { reportPath, report, artifactVerification };
}

export async function runQuickRerun({
  harness,
  seed,
  maxChapters,
  outDir,
  retryDelaysMs = [...RETRY_DELAYS_MS],
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  harness: HarnessLike;
  seed: NovelSeed;
  maxChapters: number;
  outDir: string;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}): Promise<QuickRerunResult> {
  fs.mkdirSync(path.join(outDir, "chapters"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "blueprints"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "seed.json"), JSON.stringify(seed, null, 2));

  const progressLogPath = path.join(outDir, "progress.log");
  const chapterLogPath = path.join(outDir, "quick-rerun.log");

  appendLine(progressLogPath, `=== quick rerun start ${timestamp()} ===`);
  appendLine(chapterLogPath, `=== quick rerun chapter status ${timestamp()} ===`);
  logProgress(progressLogPath, `[rerun] Seed: "${seed.title}", ${maxChapters}화 생성`);

  const statuses: ChapterRunStatus[] = [];
  const state: ChapterRunState = {
    previousSummaries: [],
  };

  for (let chapter = 1; chapter <= maxChapters; chapter++) {
    let completed = false;
    let lastErrors: string[] = [];
    const attemptDetails: ChapterRunAttempt[] = [];

    for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt++) {
      const attemptResult = await runChapterAttempt({
        harness,
        seed,
        chapter,
        outDir,
        state,
        attempt,
        progressLogPath,
        chapterLogPath,
      });

      if (attemptResult.masterPlan && !state.masterPlan) {
        state.masterPlan = attemptResult.masterPlan;
      }

      attemptDetails.push({
        attempt,
        success: attemptResult.success,
        score: attemptResult.score,
        stageHistory: attemptResult.stageHistory,
        safeguardStages: attemptResult.safeguardStages,
        pipelineWarnings: attemptResult.pipelineWarnings,
        errorMessages: attemptResult.errorMessages,
        blueprintPath: attemptResult.blueprintPath,
        chapterPath: attemptResult.chapterPath,
      });

      if (attemptResult.success && attemptResult.chapterResult) {
        const result = attemptResult.chapterResult;
        const score = computeDeterministicScores(result.text, seed, result.chapterNumber);
        state.previousSummaries.push({
          chapter: result.chapterNumber,
          title: result.summary.title,
          summary: result.summary.plot_summary,
        });
        state.previousChapterEnding = result.text.slice(-500);
        state.previousSceneState = result.summary.ending_scene_state;
        statuses.push({
          chapter,
          success: true,
          attempts: attempt,
          score: score.overall,
          errorMessages: attemptResult.errorMessages,
          attemptDetails,
          safeguardStages: attemptDetails.flatMap((detail) => detail.safeguardStages),
          pipelineWarnings: attemptDetails.flatMap((detail) => detail.pipelineWarnings),
        });
        completed = true;
        break;
      }

      lastErrors = attemptResult.errorMessages;
      const delayMs = retryDelaysMs[attempt - 1];
      if (delayMs !== undefined) {
        logProgress(
          progressLogPath,
          `ch${chapter} retry scheduled in ${Math.floor(delayMs / 1000)}s (attempt ${attempt + 1}/${retryDelaysMs.length + 1})`,
        );
        await sleep(delayMs);
      }
    }

    if (!completed) {
      statuses.push({
        chapter,
        success: false,
        attempts: retryDelaysMs.length + 1,
        errorMessages: lastErrors,
        attemptDetails,
        safeguardStages: attemptDetails.flatMap((detail) => detail.safeguardStages),
        pipelineWarnings: attemptDetails.flatMap((detail) => detail.pipelineWarnings),
      });
      logProgress(progressLogPath, `ch${chapter} failed after ${retryDelaysMs.length + 1} attempts`);
    }
  }

  const worldState = harness.getWorldStateSnapshot();
  if (worldState.length > 0) {
    fs.writeFileSync(path.join(outDir, "world-state.json"), JSON.stringify(worldState, null, 2));
    logProgress(progressLogPath, `[rerun] world-state.json 저장 (${worldState.length}화 추출)`);
  }

  const summary = formatRunSummary(statuses, maxChapters);
  logProgress(progressLogPath, `[rerun] ${summary}`);
  appendChapterStatus(chapterLogPath, `summary ${summary}`);
  const safeguardSummary = summarizeSafeguards(statuses);
  logProgress(
    progressLogPath,
    `[rerun] safeguard summary ${Object.entries(safeguardSummary).map(([stage, count]) => `${stage}=${count}`).join(", ")}`,
  );
  appendChapterStatus(
    chapterLogPath,
    `safeguards ${Object.entries(safeguardSummary).map(([stage, count]) => `${stage}=${count}`).join(" ")}`,
  );
  const { reportPath, report, artifactVerification } = writeReport(
    outDir,
    seed,
    maxChapters,
    statuses,
    progressLogPath,
    chapterLogPath,
    worldState.length,
  );
  if (artifactVerification.ok) {
    logProgress(progressLogPath, `[rerun] artifact verification passed (${artifactVerification.checks.length} checks)`);
    appendChapterStatus(chapterLogPath, `artifacts ok checks=${artifactVerification.checks.length}`);
  } else {
    const missing = artifactVerification.missingRequired.map((check) => check.path).join(", ");
    logProgress(progressLogPath, `[rerun] artifact verification failed: ${missing}`);
    appendChapterStatus(chapterLogPath, `artifacts missing ${missing}`);
  }
  logProgress(progressLogPath, `[rerun] 완료! 출력: ${outDir}`);

  return {
    outDir,
    statuses,
    progressLogPath,
    chapterLogPath,
    reportPath,
    artifactVerification,
    report,
  };
}

export async function main(argv = process.argv): Promise<QuickRerunResult> {
  const seedPath = argv[2] || "e2e-output/2026-04-06T1044/seed.json";
  const maxChapters = parseInt(argv[3] || "3", 10);
  const outDirArg = argv[4];

  const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as NovelSeed;
  const outDir = outDirArg || `/tmp/e2e-rerun-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;

  return runQuickRerun({
    harness: new NovelHarness(getFastConfig()),
    seed,
    maxChapters,
    outDir,
  });
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isMain) {
  main().then((result) => {
    if (result.statuses.some((status) => !status.success) || !result.artifactVerification.ok) {
      process.exitCode = 1;
    }
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
