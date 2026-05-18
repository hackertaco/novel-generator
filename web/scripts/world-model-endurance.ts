#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import { performance } from "node:perf_hooks";

import { load as loadYaml } from "js-yaml";

import { NovelSeedSchema, type NovelSeed } from "../src/lib/schema/novel";
import {
  analyzeWorldModelEndurance,
  type WorldModelEnduranceReport,
  type WorldModelQualityReport,
} from "../src/lib/sim";
import {
  runWorldModelFirstSimulation,
  type WorldModelRunCheckpoint,
  type WorldModelRunResult,
} from "../src/lib/sim/world-runner";

interface EnduranceCliOptions {
  seedPath: string;
  startChapter: number;
  endChapter: number;
  outDir: string;
  chunkSize: number;
  maxBeatsPerChapter: number;
  characterActionsPerChapter: number;
  failOnWarn: boolean;
}

interface ChunkSummary {
  startChapter: number;
  endChapter: number;
  durationMs: number;
  eventCount: number;
  actionLogCount: number;
  verdict: WorldModelEnduranceReport["verdict"];
  reasons: string[];
  dominantActorShare: number;
  dominantRoleShare: number;
  lowActivityActors: string[];
  lowActivityRoles: string[];
  worldModelQuality: {
    score: number;
    verdict: WorldModelQualityReport["verdict"];
    metrics: WorldModelQualityReport["metrics"];
    blockingIssueCodes: string[];
    warningCodes: string[];
  };
}

interface AggregateEnduranceReport {
  mode: "world_model_endurance_chunks";
  continuityMode: "continuous_checkpoint";
  continuityPreservedAcrossChunks: true;
  seedPath: string;
  chapters: {
    start: number;
    end: number;
    count: number;
  };
  chunkSize: number;
  chunkCount: number;
  totalDurationMs: number;
  eventCount: number;
  actionLogCount: number;
  cumulativeLedgerEventCount: number;
  actorCounts: Record<string, number>;
  roleCounts: Record<string, number>;
  actionTypeCounts: Record<string, number>;
  worldModelQuality: {
    averageScore: number;
    minScore: number;
    verdict: WorldModelQualityReport["verdict"];
    metricAverages: WorldModelQualityReport["metrics"];
    blockingIssueCodes: string[];
    warningCodes: string[];
    recommendations: string[];
  };
  chunks: ChunkSummary[];
  verdict: WorldModelEnduranceReport["verdict"];
  reasons: string[];
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/world-model-endurance.ts --seed ./seeds/test-romance-fantasy.json --chapters 1-300 --chunk-size 30 --out ./output/world-endurance",
    "",
    "Options:",
    "  --seed <path>       Seed JSON/YAML path",
    "  --chapters <range>  Chapter range, e.g. 1-300 or 1",
    "  --out <dir>         Output directory",
    "  --chunk-size <n>    Chapters per continuous checkpoint chunk (default: 30)",
    "  --max-beats <n>     Max simulated plot beats per chapter (default: 3)",
    "  --mind-actions <n>  Max WorldBrain character actions per chapter (default: 2)",
    "  --fail-on-warn      Exit non-zero when any chunk is warn/fail",
  ].join("\n");
}

function parseChapterRange(value: string): { startChapter: number; endChapter: number } {
  const trimmed = value.trim();
  const match = /^(\d+)(?:-(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid --chapters range: ${value}`);
  }

  const startChapter = Number.parseInt(match[1]!, 10);
  const endChapter = Number.parseInt(match[2] ?? match[1]!, 10);
  if (startChapter <= 0 || endChapter <= 0 || endChapter < startChapter) {
    throw new Error(`Invalid --chapters range: ${value}`);
  }

  return { startChapter, endChapter };
}

function parsePositiveInt(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return parsed;
}

function parseArgs(args = process.argv.slice(2)): EnduranceCliOptions {
  let seedPath: string | undefined;
  let chapters = "1";
  let outDir = "./output/world-model-endurance";
  let chunkSize = 30;
  let maxBeatsPerChapter = 3;
  let characterActionsPerChapter = 2;
  let failOnWarn = false;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const next = args[index + 1];
    switch (token) {
      case "--seed":
        if (!next) throw new Error("--seed requires a path");
        seedPath = next;
        index += 1;
        break;
      case "--chapters":
        if (!next) throw new Error("--chapters requires a range");
        chapters = next;
        index += 1;
        break;
      case "--out":
        if (!next) throw new Error("--out requires a directory");
        outDir = next;
        index += 1;
        break;
      case "--chunk-size":
        if (!next) throw new Error("--chunk-size requires a number");
        chunkSize = parsePositiveInt(next, "--chunk-size");
        index += 1;
        break;
      case "--max-beats":
        if (!next) throw new Error("--max-beats requires a number");
        maxBeatsPerChapter = parsePositiveInt(next, "--max-beats");
        index += 1;
        break;
      case "--mind-actions":
        if (!next) throw new Error("--mind-actions requires a number");
        characterActionsPerChapter = parseNonNegativeInt(next, "--mind-actions");
        index += 1;
        break;
      case "--fail-on-warn":
        failOnWarn = true;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${token}\n\n${usage()}`);
    }
  }

  if (!seedPath) {
    throw new Error(`Missing --seed\n\n${usage()}`);
  }

  return {
    seedPath,
    ...parseChapterRange(chapters),
    outDir,
    chunkSize,
    maxBeatsPerChapter,
    characterActionsPerChapter,
    failOnWarn,
  };
}

function readStructuredFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return loadYaml(raw);
  }
  return JSON.parse(raw);
}

function normalizeLegacySeedInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const seed = input as Record<string, unknown>;
  const foreshadowing = Array.isArray(seed.foreshadowing)
    ? seed.foreshadowing.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }

      const value = { ...(item as Record<string, unknown>) };
      const plantedAt = typeof value.planted_at === "number"
        ? value.planted_at
        : typeof value.plant_chapter === "number"
          ? value.plant_chapter
          : 1;
      const revealAt = typeof value.reveal_at === "number"
        ? value.reveal_at
        : typeof value.reveal_chapter === "number"
          ? value.reveal_chapter
          : null;

      return {
        ...value,
        name: value.name ?? value.id,
        canonical_target: value.canonical_target ?? value.description,
        planted_at: plantedAt,
        hints_at: value.hints_at ?? value.hint_chapters ?? [],
        reveal_at: revealAt,
        origin: value.origin ?? {
          episode_id: `ep_${String(plantedAt).padStart(3, "0")}`,
          scene_id: `scene_${String(plantedAt).padStart(3, "0")}_01`,
          source_span: {
            start_offset: 0,
            end_offset: 1,
            excerpt: String(value.description ?? value.id ?? "foreshadowing"),
          },
        },
      };
    })
    : [];

  return {
    ...seed,
    story_threads: seed.story_threads ?? [],
    extended_outlines: seed.extended_outlines ?? [],
    foreshadowing,
  };
}

function loadSeed(seedPath: string): NovelSeed {
  return NovelSeedSchema.parse(normalizeLegacySeedInput(readStructuredFile(seedPath)));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function addCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function chunkRanges(startChapter: number, endChapter: number, chunkSize: number): Array<{
  startChapter: number;
  endChapter: number;
}> {
  const ranges = [];
  for (let start = startChapter; start <= endChapter; start += chunkSize) {
    ranges.push({
      startChapter: start,
      endChapter: Math.min(endChapter, start + chunkSize - 1),
    });
  }
  return ranges;
}

function chunkSlug(startChapter: number, endChapter: number): string {
  return `ch${String(startChapter).padStart(3, "0")}-${String(endChapter).padStart(3, "0")}`;
}

function resultExcerpt(result: WorldModelRunResult): unknown {
  return {
    report: result.report,
    simulationDiagnostics: result.simulationDiagnostics,
    actionLogs: result.actionLogs,
    interactionResolutions: result.interactionResolutions,
    sceneLogs: result.sceneLogs,
    runtimeMindStates: result.runtimeMindStates,
  };
}

function worstVerdict(
  left: WorldModelEnduranceReport["verdict"],
  right: WorldModelEnduranceReport["verdict"],
): WorldModelEnduranceReport["verdict"] {
  if (left === "fail" || right === "fail") return "fail";
  if (left === "warn" || right === "warn") return "warn";
  return "pass";
}

function worstQualityVerdict(
  left: WorldModelQualityReport["verdict"],
  right: WorldModelQualityReport["verdict"],
): WorldModelQualityReport["verdict"] {
  if (left === "fail" || right === "fail") return "fail";
  if (left === "warn" || right === "warn") return "warn";
  return "pass";
}

function emptyQualityMetrics(): WorldModelQualityReport["metrics"] {
  return {
    responsiveness: 0,
    memoryInfluence: 0,
    relationshipDynamics: 0,
    agencyDistribution: 0,
    actorTargetDiversity: 0,
    repetitionControl: 0,
    causalContinuity: 0,
    followUpResolvedRate: 0,
    uniqueOutcomeRate: 0,
    followUpSeedUniqueness: 0,
    targetReactionUniqueness: 0,
    concreteStateDeltaRate: 0,
    operatorCategoryDiversity: 0,
    actionOperatorAcceptanceRate: 0,
    planLifecycleCoverage: 0,
    narrativeDirectorWorldConditionRate: 0,
    worldConditionActionRate: 0,
    foreshadowScheduleCoverage: 0,
  };
}

function addQualityMetrics(
  target: WorldModelQualityReport["metrics"],
  source: WorldModelQualityReport["metrics"],
): void {
  for (const key of Object.keys(target) as Array<keyof WorldModelQualityReport["metrics"]>) {
    target[key] += source[key];
  }
}

function divideQualityMetrics(
  source: WorldModelQualityReport["metrics"],
  divisor: number,
): WorldModelQualityReport["metrics"] {
  const safeDivisor = Math.max(1, divisor);
  return {
    responsiveness: source.responsiveness / safeDivisor,
    memoryInfluence: source.memoryInfluence / safeDivisor,
    relationshipDynamics: source.relationshipDynamics / safeDivisor,
    agencyDistribution: source.agencyDistribution / safeDivisor,
    actorTargetDiversity: source.actorTargetDiversity / safeDivisor,
    repetitionControl: source.repetitionControl / safeDivisor,
    causalContinuity: source.causalContinuity / safeDivisor,
    followUpResolvedRate: source.followUpResolvedRate / safeDivisor,
    uniqueOutcomeRate: source.uniqueOutcomeRate / safeDivisor,
    followUpSeedUniqueness: source.followUpSeedUniqueness / safeDivisor,
    targetReactionUniqueness: source.targetReactionUniqueness / safeDivisor,
    concreteStateDeltaRate: source.concreteStateDeltaRate / safeDivisor,
    operatorCategoryDiversity: source.operatorCategoryDiversity / safeDivisor,
    actionOperatorAcceptanceRate: source.actionOperatorAcceptanceRate / safeDivisor,
    planLifecycleCoverage: source.planLifecycleCoverage / safeDivisor,
    narrativeDirectorWorldConditionRate: source.narrativeDirectorWorldConditionRate / safeDivisor,
    worldConditionActionRate: source.worldConditionActionRate / safeDivisor,
    foreshadowScheduleCoverage: source.foreshadowScheduleCoverage / safeDivisor,
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

async function main(): Promise<void> {
  const options = parseArgs();
  const seed = loadSeed(options.seedPath);
  const outDir = path.resolve(options.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const aggregate: AggregateEnduranceReport = {
    mode: "world_model_endurance_chunks",
    continuityMode: "continuous_checkpoint",
    continuityPreservedAcrossChunks: true,
    seedPath: path.resolve(options.seedPath),
    chapters: {
      start: options.startChapter,
      end: options.endChapter,
      count: options.endChapter - options.startChapter + 1,
    },
    chunkSize: options.chunkSize,
    chunkCount: 0,
    totalDurationMs: 0,
    eventCount: 0,
    actionLogCount: 0,
    cumulativeLedgerEventCount: 0,
    actorCounts: {},
    roleCounts: {},
    actionTypeCounts: {},
    worldModelQuality: {
      averageScore: 0,
      minScore: 1,
      verdict: "pass",
      metricAverages: emptyQualityMetrics(),
      blockingIssueCodes: [],
      warningCodes: [],
      recommendations: [],
    },
    chunks: [],
    verdict: "pass",
    reasons: [],
  };
  let checkpoint: WorldModelRunCheckpoint | undefined;
  let qualityScoreSum = 0;
  const qualityMetricSums = emptyQualityMetrics();

  for (const range of chunkRanges(options.startChapter, options.endChapter, options.chunkSize)) {
    const slug = chunkSlug(range.startChapter, range.endChapter);
    const chunkDir = path.join(outDir, "chunks", slug);
    const startTime = performance.now();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: range.startChapter,
      endChapter: range.endChapter,
      maxBeatsPerChapter: options.maxBeatsPerChapter,
      characterActionsPerChapter: options.characterActionsPerChapter,
      characterSimulationMode: "agent_ticks",
      initialCheckpoint: checkpoint,
    });
    checkpoint = result.checkpoint;
    const durationMs = performance.now() - startTime;
    const report = analyzeWorldModelEndurance(result);

    writeJson(path.join(chunkDir, "endurance-report.json"), report);
    writeJson(path.join(chunkDir, "result-excerpt.json"), resultExcerpt(result));

    addCounts(aggregate.actorCounts, report.actorCounts);
    addCounts(aggregate.roleCounts, report.roleCounts);
    addCounts(aggregate.actionTypeCounts, report.actionTypeCounts);
    aggregate.chunkCount += 1;
    aggregate.totalDurationMs += durationMs;
    aggregate.eventCount += report.eventCount;
    aggregate.actionLogCount += report.actionLogCount;
    aggregate.cumulativeLedgerEventCount = result.ledger.events.length;
    aggregate.verdict = worstVerdict(aggregate.verdict, report.verdict);
    aggregate.reasons.push(...report.reasons.map((reason) => `${slug}: ${reason}`));
    qualityScoreSum += report.worldModelQuality.score;
    aggregate.worldModelQuality.minScore = Math.min(
      aggregate.worldModelQuality.minScore,
      report.worldModelQuality.score,
    );
    aggregate.worldModelQuality.verdict = worstQualityVerdict(
      aggregate.worldModelQuality.verdict,
      report.worldModelQuality.verdict,
    );
    addQualityMetrics(qualityMetricSums, report.worldModelQuality.metrics);
    aggregate.worldModelQuality.blockingIssueCodes.push(
      ...report.worldModelQuality.blockingIssues.map((item) => item.code),
    );
    aggregate.worldModelQuality.warningCodes.push(
      ...report.worldModelQuality.warnings.map((item) => item.code),
    );
    aggregate.worldModelQuality.recommendations.push(...report.worldModelQuality.recommendations);
    aggregate.chunks.push({
      startChapter: range.startChapter,
      endChapter: range.endChapter,
      durationMs,
      eventCount: report.eventCount,
      actionLogCount: report.actionLogCount,
      verdict: report.verdict,
      reasons: report.reasons,
      dominantActorShare: report.dominantActorShare,
      dominantRoleShare: report.dominantRoleShare,
      lowActivityActors: report.lowActivityActors.map((item) => item.id),
      lowActivityRoles: report.lowActivityRoles.map((item) => item.id),
      worldModelQuality: {
        score: report.worldModelQuality.score,
        verdict: report.worldModelQuality.verdict,
        metrics: report.worldModelQuality.metrics,
        blockingIssueCodes: report.worldModelQuality.blockingIssues.map((item) => item.code),
        warningCodes: report.worldModelQuality.warnings.map((item) => item.code),
      },
    });
    aggregate.worldModelQuality.averageScore = qualityScoreSum / aggregate.chunkCount;
    aggregate.worldModelQuality.metricAverages = divideQualityMetrics(qualityMetricSums, aggregate.chunkCount);
    aggregate.worldModelQuality.blockingIssueCodes = uniqueSorted(aggregate.worldModelQuality.blockingIssueCodes);
    aggregate.worldModelQuality.warningCodes = uniqueSorted(aggregate.worldModelQuality.warningCodes);
    aggregate.worldModelQuality.recommendations = uniqueSorted(aggregate.worldModelQuality.recommendations);

    writeJson(path.join(outDir, "endurance-report.json"), aggregate);
    console.log(
      `${slug} ${report.verdict} events=${report.eventCount} actions=${report.actionLogCount} duration=${(durationMs / 1000).toFixed(2)}s`,
    );
  }

  writeJson(path.join(outDir, "endurance-report.json"), aggregate);
  console.log("\n월드모델 endurance probe 완료");
  console.log(`   범위: ${options.startChapter}~${options.endChapter}화`);
  console.log(`   chunk: ${aggregate.chunkCount}개 x 최대 ${options.chunkSize}화`);
  console.log(`   사건 로그: ${aggregate.eventCount}`);
  console.log(`   누적 ledger 사건: ${aggregate.cumulativeLedgerEventCount}`);
  console.log(`   행동 로그: ${aggregate.actionLogCount}`);
  console.log(`   월드 품질: ${aggregate.worldModelQuality.verdict} score=${aggregate.worldModelQuality.averageScore.toFixed(2)}`);
  console.log(`   판정: ${aggregate.verdict}`);
  console.log(`   출력: ${outDir}`);
  console.log("   연속성: continuous_checkpoint로 chunk 사이 런타임 마음 상태와 월드 상태를 이어받습니다.");

  if (aggregate.verdict === "fail" || (options.failOnWarn && aggregate.verdict === "warn")) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
