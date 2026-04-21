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
}

export interface QuickRerunResult {
  outDir: string;
  statuses: ChapterRunStatus[];
  progressLogPath: string;
  chapterLogPath: string;
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
}

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
  let chapterResult: ChapterResult | undefined;

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
        const bpPath = saveBlueprint(outDir, event.chapter, event.blueprint);
        logProgress(progressLogPath, `ch${event.chapter} blueprint saved -> ${bpPath}`);
        break;
      }
      case "pipeline_event": {
        const pe = event.event;
        if (pe.type === "stage_change") {
          logProgress(progressLogPath, `ch${event.chapter} stage=${pe.stage}`);
        } else if (pe.type === "error") {
          logProgress(progressLogPath, `ch${event.chapter} pipeline warning: ${pe.message}`);
        }
        break;
      }
      case "chapter_complete": {
        chapterResult = event.result;
        const chapterPath = saveChapterText(outDir, event.result.chapterNumber, event.result.text);
        const score = computeDeterministicScores(event.result.text, seed, event.result.chapterNumber);
        logProgress(
          progressLogPath,
          `ch${event.result.chapterNumber} complete (${event.result.text.length} chars, ${(
            event.result.durationMs / 1000
          ).toFixed(1)}s, score=${score.overall.toFixed(2)}) -> ${chapterPath}`,
        );
        appendChapterStatus(
          chapterLogPath,
          `ch${event.result.chapterNumber} success attempt=${attempt} score=${score.overall.toFixed(2)} duration_ms=${event.result.durationMs}`,
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
  };
}

export function formatRunSummary(statuses: ChapterRunStatus[], maxChapters: number): string {
  const successChapters = statuses.filter((status) => status.success).map((status) => status.chapter);
  const failedChapters = statuses.filter((status) => !status.success).map((status) => status.chapter);
  const failedLabel = failedChapters.length > 0 ? failedChapters.join(", ") : "없음";
  return `${maxChapters}화 중 ${successChapters.length}화 성공, ${failedLabel}화 실패`;
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
  logProgress(progressLogPath, `[rerun] 완료! 출력: ${outDir}`);

  return {
    outDir,
    statuses,
    progressLogPath,
    chapterLogPath,
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
    if (result.statuses.some((status) => !status.success)) {
      process.exitCode = 1;
    }
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
