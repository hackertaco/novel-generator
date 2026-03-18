/**
 * Experiment Logger — AutoResearch 실험 결과 로깅 시스템
 *
 * 실험 결과를 JSON 파일로 저장하고 조회하는 기능을 제공합니다.
 */

import fs from "node:fs";
import path from "node:path";

import type { LoopResult, ModificationRecord } from "@/lib/evolution/loop-runner";

const LOG_DIR = path.join(process.cwd(), ".auto-research");

export interface ExperimentLog {
  /** Run ID (timestamp-based) */
  runId: string;
  /** Start time ISO */
  startedAt: string;
  /** End time ISO */
  endedAt: string;
  /** Genre used */
  genre: string;
  /** Configuration summary */
  config: {
    maxIterations: number;
    budgetUsd: number;
    model?: string;
    testChapter: number;
  };
  /** Full result */
  result: LoopResult;
  /** Summary for quick reference */
  summary: {
    baselineScore: number;
    bestScore: number;
    improvement: number;
    improvementPercent: string;
    totalIterations: number;
    keptCount: number;
    revertedCount: number;
    totalTokens: number;
    totalCostUsd: string;
    durationMinutes: string;
    keptModifications: Array<{
      iteration: number;
      target: string;
      modification: string;
      improvement: string;
    }>;
  };
}

/** Ensure log directory exists */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** Generate a run ID from current timestamp */
function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Save a completed experiment run */
export function saveExperimentLog(
  genre: string,
  config: ExperimentLog["config"],
  result: LoopResult,
): ExperimentLog {
  ensureLogDir();

  const runId = generateRunId();
  const now = new Date();
  const startedAt = new Date(now.getTime() - result.durationMs).toISOString();
  const endedAt = now.toISOString();

  const kept = result.keptModifications;
  const totalIterations = result.state.total_runs;
  const keptCount = kept.length;
  const revertedCount = totalIterations - keptCount;

  // Derive baseline score: best score minus total improvement from kept modifications
  const totalImprovement = kept.reduce((sum, m) => sum + m.improvement, 0);
  const bestScore = result.state.best_score;
  const baselineScore = bestScore - totalImprovement;

  const improvementPercent =
    baselineScore > 0
      ? ((totalImprovement / baselineScore) * 100).toFixed(1)
      : "0.0";

  const log: ExperimentLog = {
    runId,
    startedAt,
    endedAt,
    genre,
    config,
    result,
    summary: {
      baselineScore,
      bestScore,
      improvement: totalImprovement,
      improvementPercent: `+${improvementPercent}%`,
      totalIterations,
      keptCount,
      revertedCount,
      totalTokens: result.totalTokens,
      totalCostUsd: `$${result.totalCostUsd.toFixed(4)}`,
      durationMinutes: (result.durationMs / 60_000).toFixed(1),
      keptModifications: kept.map((m: ModificationRecord) => ({
        iteration: m.iteration,
        target: m.target,
        modification: m.modification,
        improvement: `+${m.improvement.toFixed(3)}`,
      })),
    },
  };

  const filePath = path.join(LOG_DIR, `${runId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(log, null, 2), "utf-8");

  return log;
}

/** List all previous experiment logs (most recent first) */
export function listExperimentLogs(): Array<{
  runId: string;
  startedAt: string;
  genre: string;
  bestScore: number;
  improvement: number;
}> {
  ensureLogDir();

  const files = fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json"));

  const logs = files
    .map((f) => {
      try {
        const content = fs.readFileSync(path.join(LOG_DIR, f), "utf-8");
        const log: ExperimentLog = JSON.parse(content);
        return {
          runId: log.runId,
          startedAt: log.startedAt,
          genre: log.genre,
          bestScore: log.summary.bestScore,
          improvement: log.summary.improvement,
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  // Sort by startedAt descending (most recent first)
  logs.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return logs;
}

/** Load a specific experiment log by runId */
export function loadExperimentLog(runId: string): ExperimentLog | null {
  const filePath = path.join(LOG_DIR, `${runId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as ExperimentLog;
  } catch {
    return null;
  }
}

/** Format a date string as "YYYY-MM-DD HH:mm" in local time */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/** Format a number with comma separators */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Print a human-readable summary to console */
export function printExperimentSummary(log: ExperimentLog): string {
  const s = log.summary;
  const border = "\u2550".repeat(39);
  const divider = "\u2500".repeat(39);

  const startTime = formatDateTime(log.startedAt);
  const endTime = formatDateTime(log.endedAt).split(" ")[1];

  const lines: string[] = [
    `\u2550${border}`,
    `  AutoResearch \uC2E4\uD5D8 \uACB0\uACFC`,
    `\u2550${border}`,
    `  \uC2E4\uD589 ID: ${log.runId}`,
    `  \uC7A5\uB974: ${log.genre}`,
    `  \uC2DC\uAC04: ${startTime} ~ ${endTime} (${s.durationMinutes}\uBD84)`,
    `\u2500${divider}`,
    `  \uBCA0\uC774\uC2A4\uB77C\uC778 \uC810\uC218: ${s.baselineScore.toFixed(3)}`,
    `  \uCD5C\uC885 \uC810\uC218:      ${s.bestScore.toFixed(3)}`,
    `  \uAC1C\uC120\uC728:         ${s.improvementPercent}`,
    `\u2500${divider}`,
    `  \uCD1D \uBC18\uBCF5: ${s.totalIterations} | \uC720\uC9C0: ${s.keptCount} | \uB418\uB3CC\uB9BC: ${s.revertedCount}`,
    `  \uD1A0\uD070: ${formatNumber(s.totalTokens)} | \uBE44\uC6A9: ${s.totalCostUsd}`,
    `\u2500${divider}`,
    `  \uC720\uC9C0\uB41C \uC218\uC815 \uC0AC\uD56D:`,
  ];

  for (const mod of s.keptModifications) {
    lines.push(`    #${mod.iteration} [${mod.target}] ${mod.improvement}`);
    lines.push(`       ${mod.modification}`);
  }

  lines.push(`\u2550${border}`);

  return lines.join("\n");
}
