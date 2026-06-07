#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";

import nextEnv from "@next/env";
import { load as loadYaml } from "js-yaml";

import {
  buildWorldLogEditorialMap,
  buildEpisodeWindowWriterPrompt,
  evaluateNovelOutputCorpusQA,
  evaluateNovelOutputQA,
  formatWorldLogEditorialMapMarkdown,
  polishEpisodeDraftProse,
  renderEpisodeDraftFromWorldLog,
  renderSceneLogsToProse,
  selectEpisodeWindows,
  type EpisodeSelectionMode,
  type NovelOutputQAReport,
  type SceneLogBatchRenderReport,
  type WorldEpisodeWindow,
  writeEpisodeWindowNovel,
  writeWorldNovelChapter,
} from "../src/lib/rendering";
import { NovelSeedSchema, type NovelSeed } from "../src/lib/schema/novel";
import {
  cullDerivedOutline,
  labelDerivedOutline,
  type DerivedOutline,
} from "../src/lib/rendering/derived-outline";
import type { CharacterActionLog } from "../src/lib/sim/character-action-sim";
import type { SceneLog } from "../src/lib/sim/scene-log";
import { runWorldModelFirstSimulation } from "../src/lib/sim/world-runner";

type WriterMode = "renderer" | "llm" | "episode-llm" | "episode-prompt" | "episode-draft";

interface SimulateWorldCliOptions {
  seedPath: string;
  startChapter: number;
  endChapter?: number;
  outDir: string;
  maxBeatsPerChapter: number;
  characterActionsPerChapter: number;
  writerMode: WriterMode;
  writerModel?: string;
  targetEpisodeCount?: number;
  episodeSelectionMode: EpisodeSelectionMode;
  maxScenesPerEpisode?: number;
  qaRepairAttempts: number;
  qaPassThreshold: number;
  selectionOnly: boolean;
  plannerEnabled?: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/simulate-world.ts --seed ./seeds/test-romance-fantasy.json --chapters 1-200 --out ./output/world-run",
    "",
    "Options:",
    "  --seed <path>       Seed JSON/YAML path",
    "  --chapters <range>  Chapter range, e.g. 1-200 or 1",
    "  --out <dir>         Output directory",
    "  --max-beats <n>     Max simulated plot beats per chapter (default: 3)",
    "  --mind-actions <n>  Max WorldBrain character actions per chapter (default: 2)",
    "  --writer <mode>     renderer | llm | episode-llm | episode-prompt | episode-draft (default: renderer)",
    "  --writer-model <m>  Model for --writer llm/episode-llm",
    "  --episodes <n>      Episode windows to extract from timeline logs (default: scene count)",
    "  --episode-selection <mode>  timeline_order | highest_impact | lowest_impact (default: timeline_order)",
    "  --max-scenes-per-episode <n>  Max adjacent scenes per episode window (default: 3)",
    "  --qa-repair-attempts <n>  Episode QA repair retries for --writer episode-llm (default: 1)",
    "  --qa-pass-threshold <n>   Minimum episode QA score for pass (default: 0.82)",
    "  --planner / --no-planner  Utility-scoring Planner 강제 on/off (미지정 시 world-runner 기본값 = on)",
    "  --selection-only  Generate world logs and episode windows only; skip prose rendering and LLM writing",
  ].join("\n");
}

/**
 * 역전 모드(빈 chapter_outlines) 전용 — 로그에서 발견한 줄거리(derived outline)를 기록.
 * spec: docs/superpowers/specs/2026-06-08-outline-inversion-design.md §6
 */
async function writeDerivedOutlineArtifacts(input: {
  outDir: string;
  result: {
    seed: NovelSeed;
    sceneLogs: Array<{ sceneId: string; chapter: number; sourceEventIds: string[] }>;
    actionLogs: Array<{ chapter: number; actualEffect: { scenePressureDelta: number } }>;
    ledger: { events: Array<{ id: string; chapter: number; tags?: string[]; summary: string }> };
    schemeTimeline: unknown;
  };
  targetEpisodeCount?: number;
  writeJson: (filePath: string, value: unknown) => void;
}): Promise<DerivedOutline | undefined> {
  const { result, outDir } = input;
  input.writeJson(path.join(outDir, "scheme-timeline.json"), result.schemeTimeline);
  if (result.seed.chapter_outlines.length > 0) return undefined;

  const pressureByChapter = new Map<number, number>();
  for (const log of result.actionLogs) {
    const current = pressureByChapter.get(log.chapter) ?? 0;
    pressureByChapter.set(log.chapter, Math.max(current, log.actualEffect.scenePressureDelta));
  }
  const scenes = result.sceneLogs.map((scene) => ({
    sceneId: scene.sceneId,
    chapter: scene.chapter,
    eventIds: scene.sourceEventIds,
    pressurePeak: pressureByChapter.get(scene.chapter) ?? 0,
  }));
  const events = (result.ledger.events ?? []).map((event) => ({
    id: event.id,
    chapter: event.chapter,
    tags: event.tags ?? [],
    summary: event.summary,
  }));
  const outline = cullDerivedOutline({
    scenes,
    events,
    totalChapters: input.targetEpisodeCount ?? scenes.length,
  });
  const eventSummariesById = Object.fromEntries(events.map((event) => [event.id, event.summary]));
  const labeled = await labelDerivedOutline({ outline, eventSummariesById });
  input.writeJson(path.join(outDir, "derived-outline.json"), labeled);
  const markdown = [
    "# Derived Outline (발견된 줄거리)",
    "",
    ...labeled.chapters.map((chapter) =>
      `## ${chapter.title} — ${chapter.oneLiner}\n- 장면: ${chapter.sourceSceneIds.join(", ")}\n- 절단: ${chapter.endsOn ?? "-"} (tension ${chapter.tensionPeak})`,
    ),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "derived-outline.md"), markdown, "utf8");
  return labeled;
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

function parseArgs(args = process.argv.slice(2)): SimulateWorldCliOptions {
  let seedPath: string | undefined;
  let chapters = "1";
  let outDir = "./output/world-model-first-run";
  let maxBeatsPerChapter = 3;
  let characterActionsPerChapter = 2;
  let writerMode: WriterMode = "renderer";
  let writerModel: string | undefined;
  let targetEpisodeCount: number | undefined;
  let episodeSelectionMode: EpisodeSelectionMode = "timeline_order";
  let maxScenesPerEpisode: number | undefined;
  let qaRepairAttempts = 1;
  let qaPassThreshold = 0.82;
  let selectionOnly = false;
  let plannerEnabled: boolean | undefined;

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
      case "--max-beats":
        if (!next) throw new Error("--max-beats requires a number");
        maxBeatsPerChapter = Number.parseInt(next, 10);
        if (!Number.isFinite(maxBeatsPerChapter) || maxBeatsPerChapter <= 0) {
          throw new Error("--max-beats must be a positive integer");
        }
        index += 1;
        break;
      case "--mind-actions":
        if (!next) throw new Error("--mind-actions requires a number");
        characterActionsPerChapter = Number.parseInt(next, 10);
        if (!Number.isFinite(characterActionsPerChapter) || characterActionsPerChapter < 0) {
          throw new Error("--mind-actions must be a non-negative integer");
        }
        index += 1;
        break;
      case "--writer":
        if (!next) {
          throw new Error("--writer requires a mode: renderer | llm | episode-llm | episode-prompt | episode-draft");
        }
        if (
          next !== "renderer"
          && next !== "llm"
          && next !== "episode-llm"
          && next !== "episode-prompt"
          && next !== "episode-draft"
        ) {
          throw new Error("--writer must be one of: renderer, llm, episode-llm, episode-prompt, episode-draft");
        }
        writerMode = next;
        index += 1;
        break;
      case "--writer-model":
        if (!next) throw new Error("--writer-model requires a model name");
        writerModel = next;
        index += 1;
        break;
      case "--episodes":
        if (!next) throw new Error("--episodes requires a number");
        targetEpisodeCount = Number.parseInt(next, 10);
        if (!Number.isFinite(targetEpisodeCount) || targetEpisodeCount <= 0) {
          throw new Error(`Invalid --episodes: ${next}`);
        }
        index += 1;
        break;
      case "--qa-repair-attempts":
        if (!next) throw new Error("--qa-repair-attempts requires a number");
        qaRepairAttempts = Number.parseInt(next, 10);
        if (!Number.isFinite(qaRepairAttempts) || qaRepairAttempts < 0) {
          throw new Error(`Invalid --qa-repair-attempts: ${next}`);
        }
        index += 1;
        break;
      case "--qa-pass-threshold":
        if (!next) throw new Error("--qa-pass-threshold requires a number");
        qaPassThreshold = Number.parseFloat(next);
        if (!Number.isFinite(qaPassThreshold) || qaPassThreshold <= 0 || qaPassThreshold > 1) {
          throw new Error(`Invalid --qa-pass-threshold: ${next}`);
        }
        index += 1;
        break;
      case "--episode-selection":
        if (next !== "timeline_order" && next !== "highest_impact" && next !== "lowest_impact") {
          throw new Error(`Invalid --episode-selection: ${next}`);
        }
        episodeSelectionMode = next;
        index += 1;
        break;
      case "--max-scenes-per-episode":
        if (!next) throw new Error("--max-scenes-per-episode requires a number");
        maxScenesPerEpisode = Number.parseInt(next, 10);
        if (!Number.isFinite(maxScenesPerEpisode) || maxScenesPerEpisode <= 0) {
          throw new Error(`Invalid --max-scenes-per-episode: ${next}`);
        }
        index += 1;
        break;
      case "--planner":
        plannerEnabled = true;
        break;
      case "--no-planner":
        plannerEnabled = false;
        break;
      case "--selection-only":
        selectionOnly = true;
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
    maxBeatsPerChapter,
    characterActionsPerChapter,
    writerMode,
    writerModel,
    targetEpisodeCount,
    episodeSelectionMode,
    maxScenesPerEpisode,
    qaRepairAttempts,
    qaPassThreshold,
    selectionOnly,
    plannerEnabled,
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

interface EpisodeWriterAttempt {
  attempt: number;
  text: string;
  prompt: string;
  writerReport: Awaited<ReturnType<typeof writeEpisodeWindowNovel>>["report"];
  qa: NovelOutputQAReport;
}

interface EpisodeWriterRun {
  episodeWindow: WorldEpisodeWindow;
  attempts: EpisodeWriterAttempt[];
  finalAttempt: EpisodeWriterAttempt;
}

interface EpisodePromptRun {
  episodeWindow: WorldEpisodeWindow;
  prompt: string;
  promptCharacterCount: number;
  treatmentDecisions: Array<{
    sceneId: string;
    chapter: number;
    narrativeTreatment: string;
    suggestedWordBudget: number;
    keyActionLogIds: string[];
    reasons: string[];
  }>;
}

interface EpisodeDraftRun {
  episodeWindow: WorldEpisodeWindow;
  text: string;
  draftReport: ReturnType<typeof renderEpisodeDraftFromWorldLog>["report"];
  polishReport: ReturnType<typeof polishEpisodeDraftProse>["report"];
  qa: NovelOutputQAReport;
}

interface RendererEpisodeQaRun {
  episodeWindow: WorldEpisodeWindow;
  text: string;
  qa: NovelOutputQAReport;
}

interface RendererEditorialPlanSummary {
  sceneCount: number;
  turnCount: number;
  expandedCandidateTurnCount: number;
  renderedExpandedTurnCount: number;
  modeCounts: Record<"normal" | "expanded" | "spotlight", number>;
  episodes: Array<{
    episodeNumber: number;
    sourceSceneIds: string[];
    qa?: {
      score: number;
      verdict: NovelOutputQAReport["verdict"];
    };
    scenes: Array<{
      sceneId: string;
      chapter: number;
      title: string;
      editorialExpansionCount: number;
      selectedExpandedTurnIds: string[];
      expandedPlans: Array<{
        turnId: string;
        sourceActionLogIds: string[];
        actorNames: string[];
        actionTypes: string[];
        editorialHeat: number;
        renderMode: "expanded" | "spotlight";
        selectedForExpansion: boolean;
        suggestedParagraphs: number;
        expansionReasons: string[];
      }>;
    }>;
  }>;
}

function formatQaRepairSummary(qa: NovelOutputQAReport): string {
  const novelness = qa.metrics.novelness.details as Record<string, unknown>;
  return [
    `score=${qa.score}, verdict=${qa.verdict}`,
    `sourceCoverage=${qa.metrics.sourceCoverage.score}`,
    `sceneSeam=${qa.metrics.sceneSeam.score}`,
    `repetitionControl=${qa.metrics.repetitionControl.score}`,
    `characterAgency=${qa.metrics.characterAgency.score}`,
    `novelness=${qa.metrics.novelness.score}`,
    `novelnessDetails=dialogueCount:${novelness.dialogueCount ?? "?"}, paragraphCount:${novelness.paragraphCount ?? "?"}, sensoryHits:${novelness.sensoryHits ?? "?"}, concreteActionHitCount:${novelness.concreteActionHitCount ?? "?"}, turnHitCount:${novelness.turnHitCount ?? "?"}, weakEnding:${novelness.weakEnding ?? "?"}`,
    `issues=${qa.issues.map((issue) =>
      `${issue.code}: ${issue.message} (${issue.evidence.slice(0, 3).join(" / ")})`
    ).join(" | ") || "none"}`,
  ].join("; ");
}

function shouldRepairEpisode(qa: NovelOutputQAReport, threshold: number): boolean {
  return qa.verdict !== "pass" || qa.score < threshold;
}

function episodeVerdictRank(verdict: NovelOutputQAReport["verdict"]): number {
  if (verdict === "pass") return 2;
  if (verdict === "warn") return 1;
  return 0;
}

function bestEpisodeAttempt(attempts: EpisodeWriterAttempt[]): EpisodeWriterAttempt | undefined {
  return [...attempts].sort((left, right) => {
    const verdictDelta = episodeVerdictRank(right.qa.verdict) - episodeVerdictRank(left.qa.verdict);
    if (verdictDelta !== 0) return verdictDelta;
    const scoreDelta = right.qa.score - left.qa.score;
    if (scoreDelta !== 0) return scoreDelta;
    const issueDelta = left.qa.issues.length - right.qa.issues.length;
    if (issueDelta !== 0) return issueDelta;
    return left.attempt - right.attempt;
  })[0];
}

function buildRendererEditorialPlanSummary(input: {
  episodeWindows: WorldEpisodeWindow[];
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  renderReport: SceneLogBatchRenderReport;
  rendererEpisodeQaRuns: RendererEpisodeQaRun[];
}): RendererEditorialPlanSummary {
  type ExpandedCandidatePlan = SceneLogBatchRenderReport["chapters"][number]["editorialExpansionPlans"][number] & {
    renderMode: "expanded" | "spotlight";
  };
  const isExpandedCandidatePlan = (
    plan: SceneLogBatchRenderReport["chapters"][number]["editorialExpansionPlans"][number],
  ): plan is ExpandedCandidatePlan => plan.renderMode === "expanded" || plan.renderMode === "spotlight";
  const reportsBySceneId = new Map(input.renderReport.chapters.map((report) => [report.sceneId, report]));
  const scenesById = new Map(input.sceneLogs.map((sceneLog) => [sceneLog.sceneId, sceneLog]));
  const logsById = new Map(input.actionLogs.map((log) => [log.logId, log]));
  const qaByEpisode = new Map(input.rendererEpisodeQaRuns.map((run) => [run.episodeWindow.episodeNumber, run.qa]));
  const modeCounts = { normal: 0, expanded: 0, spotlight: 0 };
  let turnCount = 0;
  let expandedCandidateTurnCount = 0;
  let renderedExpandedTurnCount = 0;

  for (const report of input.renderReport.chapters) {
    renderedExpandedTurnCount += report.editorialExpansionCount;
    for (const plan of report.editorialExpansionPlans) {
      modeCounts[plan.renderMode] += 1;
      turnCount += 1;
      if (plan.renderMode !== "normal") {
        expandedCandidateTurnCount += 1;
      }
    }
  }

  return {
    sceneCount: input.renderReport.sceneCount,
    turnCount,
    expandedCandidateTurnCount,
    renderedExpandedTurnCount,
    modeCounts,
    episodes: input.episodeWindows.map((episodeWindow) => {
      const qa = qaByEpisode.get(episodeWindow.episodeNumber);
      return {
        episodeNumber: episodeWindow.episodeNumber,
        sourceSceneIds: episodeWindow.sourceSceneIds,
        qa: qa
          ? {
              score: qa.score,
              verdict: qa.verdict,
            }
          : undefined,
        scenes: episodeWindow.sourceSceneIds.map((sceneId) => {
          const sceneLog = scenesById.get(sceneId);
          const report = reportsBySceneId.get(sceneId);
          const selectedExpandedTurnIds = report?.expandedTurnIds ?? [];
          const selectedExpandedTurnIdSet = new Set(selectedExpandedTurnIds);
          const expandedPlans = (report?.editorialExpansionPlans ?? [])
            .filter(isExpandedCandidatePlan)
            .map((plan) => {
              const actionLogs = plan.sourceActionLogIds
                .map((logId) => logsById.get(logId))
                .filter((log): log is CharacterActionLog => Boolean(log));
              return {
                turnId: plan.turnId,
                sourceActionLogIds: plan.sourceActionLogIds,
                actorNames: Array.from(new Set(actionLogs.map((log) => log.actorName))),
                actionTypes: Array.from(new Set(actionLogs.map((log) => log.action.type))),
                editorialHeat: plan.editorialHeat,
                renderMode: plan.renderMode,
                selectedForExpansion: selectedExpandedTurnIdSet.has(plan.turnId),
                suggestedParagraphs: plan.suggestedParagraphs,
                expansionReasons: plan.expansionReasons,
              };
            });

          return {
            sceneId,
            chapter: sceneLog?.chapter ?? report?.chapter ?? 0,
            title: sceneLog?.title ?? "",
            editorialExpansionCount: report?.editorialExpansionCount ?? 0,
            selectedExpandedTurnIds,
            expandedPlans,
          };
        }),
      };
    }),
  };
}

function formatRendererEditorialPlanMarkdown(summary: RendererEditorialPlanSummary): string {
  const lines = [
    "# Renderer Editorial Plan",
    "",
    `- scenes: ${summary.sceneCount}`,
    `- dialogue turns: ${summary.turnCount}`,
    `- expanded/spotlight candidates: ${summary.expandedCandidateTurnCount}`,
    `- actually expanded turns: ${summary.renderedExpandedTurnCount}`,
    `- mode counts: normal=${summary.modeCounts.normal}, expanded=${summary.modeCounts.expanded}, spotlight=${summary.modeCounts.spotlight}`,
    "",
  ];

  for (const episode of summary.episodes) {
    lines.push(`## Episode ${String(episode.episodeNumber).padStart(3, "0")}`);
    if (episode.qa) {
      lines.push(`- QA: ${episode.qa.verdict} (${episode.qa.score})`);
    }
    lines.push(`- scenes: ${episode.sourceSceneIds.join(", ")}`);
    for (const scene of episode.scenes) {
      lines.push(`- Chapter ${scene.chapter}: ${scene.title || scene.sceneId}`);
      lines.push(`  - selected expanded turns: ${scene.selectedExpandedTurnIds.join(", ") || "none"}`);
      if (scene.expandedPlans.length === 0) {
        lines.push("  - no expanded/spotlight candidates");
        continue;
      }
      for (const plan of scene.expandedPlans) {
        const actors = plan.actorNames.length > 0 ? plan.actorNames.join(", ") : "unknown actor";
        const actions = plan.actionTypes.length > 0 ? plan.actionTypes.join(", ") : "unknown action";
        lines.push(
          `  - ${plan.selectedForExpansion ? "SELECTED " : "candidate "}${plan.renderMode} turn ${plan.turnId} heat=${plan.editorialHeat} paragraphs=${plan.suggestedParagraphs}`,
        );
        lines.push(`    - actors/actions: ${actors} / ${actions}`);
        lines.push(`    - reasons: ${plan.expansionReasons.join(" / ")}`);
        lines.push(`    - sourceActionLogIds: ${plan.sourceActionLogIds.join(", ")}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function writeEpisodeWithQa(input: {
  seed: NovelSeed;
  worldBrain: Parameters<typeof writeEpisodeWindowNovel>[0]["worldBrain"];
  episodeWindow: WorldEpisodeWindow;
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  worldLogEditorialMap: Parameters<typeof writeEpisodeWindowNovel>[0]["worldLogEditorialMap"];
  previousEpisodeEnding: string;
  model?: string;
  qaRepairAttempts: number;
  qaPassThreshold: number;
}): Promise<EpisodeWriterRun> {
  const attempts: EpisodeWriterAttempt[] = [];
  let repairContext: Parameters<typeof writeEpisodeWindowNovel>[0]["repairContext"] | undefined;

  for (let attempt = 1; attempt <= input.qaRepairAttempts + 1; attempt += 1) {
    const writerResult = await writeEpisodeWindowNovel({
      seed: input.seed,
      worldBrain: input.worldBrain,
      episodeWindow: input.episodeWindow,
      sceneLogs: input.sceneLogs,
      actionLogs: input.actionLogs,
      worldLogEditorialMap: input.worldLogEditorialMap,
      previousEpisodeEnding: input.previousEpisodeEnding,
      model: input.model,
      repairContext,
    });
    const text = writerResult.text.trim();
    const qa = evaluateNovelOutputQA({
      text,
      episodeWindow: input.episodeWindow,
      sceneLogs: input.sceneLogs,
      actionLogs: input.actionLogs,
      worldLogEditorialMap: input.worldLogEditorialMap,
    });
    const item = {
      attempt,
      text: `${text}\n`,
      prompt: writerResult.prompt,
      writerReport: writerResult.report,
      qa,
    };
    attempts.push(item);
    if (!shouldRepairEpisode(qa, input.qaPassThreshold)) {
      return {
        episodeWindow: input.episodeWindow,
        attempts,
        finalAttempt: item,
      };
    }
    repairContext = {
      previousDraft: text,
      qaSummary: formatQaRepairSummary(qa),
    };
  }

  const finalAttempt = bestEpisodeAttempt(attempts);
  if (!finalAttempt) {
    throw new Error(`Episode writer produced no attempts for episode ${input.episodeWindow.episodeNumber}`);
  }
  return {
    episodeWindow: input.episodeWindow,
    attempts,
    finalAttempt,
  };
}

async function main(): Promise<void> {
  nextEnv.loadEnvConfig(process.cwd());
  const options = parseArgs();
  const seed = loadSeed(options.seedPath);
  const endChapter = options.endChapter ?? seed.total_chapters;
  const outDir = path.resolve(options.outDir);
  const chaptersDir = path.join(outDir, "chapters");
  const debugChaptersDir = path.join(outDir, "debug-chapters");
  const summariesDir = path.join(outDir, "summaries");
  const sceneLogsDir = path.join(outDir, "scene-logs");
  const actionLogsDir = path.join(outDir, "action-logs");
  const ledgersDir = path.join(outDir, "ledgers");
  const renderReportsDir = path.join(outDir, "render-reports");
  const writerReportsDir = path.join(outDir, "writer-reports");
  const episodesDir = path.join(outDir, "episodes");
  const episodePromptsDir = path.join(outDir, "episode-prompts");
  const episodeReportsDir = path.join(outDir, "episode-reports");
  const episodeQaDir = path.join(outDir, "episode-qa");
  const episodeAttemptsDir = path.join(outDir, "episode-attempts");

  fs.mkdirSync(chaptersDir, { recursive: true });
  fs.mkdirSync(debugChaptersDir, { recursive: true });
  fs.mkdirSync(summariesDir, { recursive: true });
  fs.mkdirSync(sceneLogsDir, { recursive: true });
  fs.mkdirSync(actionLogsDir, { recursive: true });
  fs.mkdirSync(ledgersDir, { recursive: true });
  fs.mkdirSync(renderReportsDir, { recursive: true });
  fs.mkdirSync(writerReportsDir, { recursive: true });
  fs.mkdirSync(episodesDir, { recursive: true });
  fs.mkdirSync(episodePromptsDir, { recursive: true });
  fs.mkdirSync(episodeReportsDir, { recursive: true });
  fs.mkdirSync(episodeQaDir, { recursive: true });
  fs.mkdirSync(episodeAttemptsDir, { recursive: true });

  const useFastWorldRun = options.selectionOnly
    || options.writerMode === "renderer"
    || options.writerMode === "episode-llm"
    || options.writerMode === "episode-prompt"
    || options.writerMode === "episode-draft";
  const result = runWorldModelFirstSimulation(seed, {
    startChapter: options.startChapter,
    endChapter,
    maxBeatsPerChapter: options.maxBeatsPerChapter,
    characterActionsPerChapter: options.characterActionsPerChapter,
    characterSimulationMode: "agent_ticks",
    skipRenderedChapters: useFastWorldRun,
    fastLedgerValidation: useFastWorldRun,
    fastEventApplication: useFastWorldRun,
    outlineStrictMode: true,
    plannerEnabled: options.plannerEnabled,
  });
  const episodeSelection = selectEpisodeWindows({
    result,
    targetEpisodeCount: options.targetEpisodeCount,
    selectionMode: options.episodeSelectionMode,
    maxScenesPerEpisode: options.maxScenesPerEpisode,
  });
  const worldLogEditorialMap = buildWorldLogEditorialMap({
    sceneLogs: result.sceneLogs,
    actionLogs: result.actionLogs,
  });
  if (options.selectionOnly) {
    await writeDerivedOutlineArtifacts({
      outDir,
      result,
      targetEpisodeCount: options.targetEpisodeCount,
      writeJson,
    });
    writeJson(path.join(ledgersDir, "causal-ledger.json"), result.ledger);
    writeJson(path.join(outDir, "world-brain.json"), result.brain);
    writeJson(path.join(outDir, "scene-logs.json"), result.sceneLogs);
    writeJson(path.join(outDir, "episode-selection.json"), episodeSelection);
    writeJson(path.join(outDir, "world-log-editorial-map.json"), worldLogEditorialMap);
    fs.writeFileSync(
      path.join(outDir, "world-log-editorial-map.md"),
      formatWorldLogEditorialMapMarkdown(worldLogEditorialMap),
      "utf8",
    );
    writeJson(path.join(outDir, "action-logs.json"), result.actionLogs);
    writeJson(path.join(outDir, "interaction-resolutions.json"), result.interactionResolutions);
    writeJson(path.join(outDir, "simulation-clock.json"), result.simulationClocks);
    writeJson(path.join(outDir, "simulation-diagnostics.json"), result.simulationDiagnostics);
    writeJson(path.join(outDir, "runtime-mind-states.json"), result.runtimeMindStates);
    writeJson(path.join(outDir, "simulation-state.json"), result.state);
    writeJson(path.join(outDir, "result.json"), result.report);
    writeJson(
      path.join(outDir, "selection-only-report.json"),
      {
        mode: "selection-only",
        selectedEpisodeCount: episodeSelection.selectedEpisodeCount,
        requestedEpisodeCount: options.targetEpisodeCount ?? result.sceneLogs.length,
        sourceSceneCount: result.sceneLogs.length,
        sourceActionLogCount: result.actionLogs.length,
        interactionResolutionCount: result.interactionResolutions.length,
        validation: result.report.validation,
      },
    );

    console.log("\n월드모델 selection-only 완료");
    console.log(`   제목: ${result.report.title}`);
    console.log(`   범위: ${result.report.startChapter}~${result.report.endChapter}화`);
    console.log(`   생성 화수: ${result.report.generatedChapterCount}`);
    console.log(`   사건 로그: ${result.report.generatedEventCount}`);
    console.log(`   원시 행동 로그: ${result.report.worldBrain.agentActionSimulation.actionLogCount}`);
    console.log(`   상호작용 해석: ${result.report.worldBrain.agentActionSimulation.interactionResolutionCount}`);
    console.log(`   장면 로그: ${result.report.worldBrain.sceneLogCount}`);
    console.log(`   선택 episode: ${episodeSelection.selectedEpisodeCount}`);
    console.log(
      `   편집 지도: full=${worldLogEditorialMap.treatmentCounts.full_scene}, expanded=${worldLogEditorialMap.treatmentCounts.expanded_scene}, compressed=${worldLogEditorialMap.treatmentCounts.compressed_scene}, bridge=${worldLogEditorialMap.treatmentCounts.summary_bridge}`,
    );
    console.log(`   검증: ${result.report.validation.passed ? "통과" : "실패"} (${result.report.validation.issueCount} issues)`);
    console.log(`   출력: ${outDir}`);
    if (!result.report.validation.passed) {
      process.exitCode = 1;
    }
    return;
  }

  const rendered = renderSceneLogsToProse({
    sceneLogs: result.sceneLogs,
    worldBrain: result.brain,
    options: {
      includeTraceComments: false,
    },
  });
  const renderedByChapter = new Map(rendered.scenes.map((scene) => [
    scene.report.chapter,
    scene,
  ]));
  const episodeBySceneId = new Map(episodeSelection.windows.flatMap((window) =>
    window.sourceSceneIds.map((sceneId) => [sceneId, window] as const)
  ));
  const rendererEpisodeQaRuns: RendererEpisodeQaRun[] = episodeSelection.windows.map((episodeWindow) => {
    const selectedSceneIds = new Set(episodeWindow.sourceSceneIds);
    const text = result.sceneLogs
      .filter((sceneLog) => selectedSceneIds.has(sceneLog.sceneId))
      .map((sceneLog) => renderedByChapter.get(sceneLog.chapter)?.text ?? "")
      .filter((value) => value.trim().length > 0)
      .join("\n\n");
    return {
      episodeWindow,
      text,
      qa: evaluateNovelOutputQA({
        text,
        episodeWindow,
        sceneLogs: result.sceneLogs,
        actionLogs: result.actionLogs,
      }),
    };
  });
  const rendererEditorialPlanSummary = buildRendererEditorialPlanSummary({
    episodeWindows: episodeSelection.windows,
    sceneLogs: result.sceneLogs,
    actionLogs: result.actionLogs,
    renderReport: rendered.report,
    rendererEpisodeQaRuns,
  });
  const writerByChapter = new Map<number, Awaited<ReturnType<typeof writeWorldNovelChapter>>>();
  const episodeWriterRuns: EpisodeWriterRun[] = [];
  const episodePromptRuns: EpisodePromptRun[] = [];
  const episodeDraftRuns: EpisodeDraftRun[] = [];
  let previousWriterEnding = "";
  if (options.writerMode === "llm") {
    for (const sceneLog of result.sceneLogs) {
      const renderedChapter = renderedByChapter.get(sceneLog.chapter);
      const actionLogs = result.actionLogs.filter((log) => log.chapter === sceneLog.chapter);
      const writerResult = await writeWorldNovelChapter({
        seed,
        worldBrain: result.brain,
        sceneLog,
        actionLogs,
        episodeWindow: episodeBySceneId.get(sceneLog.sceneId),
        previousChapterEnding: previousWriterEnding,
        rendererDraft: renderedChapter?.text,
        model: options.writerModel,
      });
      writerByChapter.set(sceneLog.chapter, writerResult);
      previousWriterEnding = writerResult.text.slice(-700);
    }
  }
  if (options.writerMode === "episode-llm") {
    let previousEpisodeEnding = "";
    for (const episodeWindow of episodeSelection.windows) {
      const episodeRun = await writeEpisodeWithQa({
        seed,
        worldBrain: result.brain,
        episodeWindow,
        sceneLogs: result.sceneLogs,
        actionLogs: result.actionLogs,
        worldLogEditorialMap,
        previousEpisodeEnding,
        model: options.writerModel,
        qaRepairAttempts: options.qaRepairAttempts,
        qaPassThreshold: options.qaPassThreshold,
      });
      episodeWriterRuns.push(episodeRun);
      previousEpisodeEnding = episodeRun.finalAttempt.text.slice(-700);

      const episodeSlug = String(episodeWindow.episodeNumber).padStart(3, "0");
      fs.writeFileSync(
        path.join(episodesDir, `episode-${episodeSlug}.md`),
        episodeRun.finalAttempt.text,
        "utf8",
      );
      fs.writeFileSync(
        path.join(episodePromptsDir, `episode-${episodeSlug}.prompt.md`),
        episodeRun.finalAttempt.prompt,
        "utf8",
      );
      writeJson(
        path.join(episodeReportsDir, `episode-${episodeSlug}.writer-report.json`),
        episodeRun.finalAttempt.writerReport,
      );
      writeJson(
        path.join(episodeQaDir, `episode-${episodeSlug}.qa.json`),
        episodeRun.finalAttempt.qa,
      );
      writeJson(
        path.join(episodeAttemptsDir, `episode-${episodeSlug}.attempts.json`),
        episodeRun.attempts.map((attempt) => ({
          attempt: attempt.attempt,
          selectedAsFinal: attempt.attempt === episodeRun.finalAttempt.attempt,
          writerReport: attempt.writerReport,
          qa: attempt.qa,
        })),
      );
    }
  }
  if (options.writerMode === "episode-prompt") {
    for (const episodeWindow of episodeSelection.windows) {
      const prompt = buildEpisodeWindowWriterPrompt({
        seed,
        worldBrain: result.brain,
        episodeWindow,
        sceneLogs: result.sceneLogs,
        actionLogs: result.actionLogs,
        worldLogEditorialMap,
      });
      const treatmentDecisions = worldLogEditorialMap.chapters
        .filter((chapter) => episodeWindow.sourceSceneIds.includes(chapter.sceneId))
        .map((chapter) => ({
          sceneId: chapter.sceneId,
          chapter: chapter.chapter,
          narrativeTreatment: chapter.narrativeTreatment,
          suggestedWordBudget: chapter.suggestedWordBudget,
          keyActionLogIds: chapter.keyActionLogIds,
          reasons: chapter.reasons,
        }));
      const episodeSlug = String(episodeWindow.episodeNumber).padStart(3, "0");
      fs.writeFileSync(
        path.join(episodePromptsDir, `episode-${episodeSlug}.prompt.md`),
        prompt,
        "utf8",
      );
      const promptRun = {
        episodeWindow,
        prompt,
        promptCharacterCount: prompt.length,
        treatmentDecisions,
      };
      episodePromptRuns.push(promptRun);
      writeJson(
        path.join(episodeReportsDir, `episode-${episodeSlug}.prompt-report.json`),
        {
          episodeNumber: episodeWindow.episodeNumber,
          timelineIndex: episodeWindow.timelineIndex,
          promptCharacterCount: prompt.length,
          sourceSceneIds: episodeWindow.sourceSceneIds,
          sourceActionLogIds: episodeWindow.sourceActionLogIds,
          treatmentDecisions,
        },
      );
    }
  }
  if (options.writerMode === "episode-draft") {
    for (const episodeWindow of episodeSelection.windows) {
      const draft = renderEpisodeDraftFromWorldLog({
        episodeWindow,
        sceneLogs: result.sceneLogs,
        actionLogs: result.actionLogs,
        worldLogEditorialMap,
      });
      const polished = polishEpisodeDraftProse(draft.text);
      const qa = evaluateNovelOutputQA({
        text: polished.text,
        episodeWindow,
        sceneLogs: result.sceneLogs,
        actionLogs: result.actionLogs,
        worldLogEditorialMap,
      });
      const episodeSlug = String(episodeWindow.episodeNumber).padStart(3, "0");
      fs.writeFileSync(
        path.join(episodesDir, `episode-${episodeSlug}.md`),
        polished.text,
        "utf8",
      );
      writeJson(
        path.join(episodeReportsDir, `episode-${episodeSlug}.draft-report.json`),
        draft.report,
      );
      writeJson(
        path.join(episodeReportsDir, `episode-${episodeSlug}.polish-report.json`),
        polished.report,
      );
      writeJson(
        path.join(episodeQaDir, `episode-${episodeSlug}.qa.json`),
        qa,
      );
      episodeDraftRuns.push({
        episodeWindow,
        text: polished.text,
        draftReport: draft.report,
        polishReport: polished.report,
        qa,
      });
    }
  }
  if (options.writerMode === "renderer") {
    for (const episodeRun of rendererEpisodeQaRuns) {
      const episodeSlug = String(episodeRun.episodeWindow.episodeNumber).padStart(3, "0");
      writeJson(
        path.join(episodeQaDir, `episode-${episodeSlug}.qa.json`),
        episodeRun.qa,
      );
    }
  } else {
    for (const episodeRun of rendererEpisodeQaRuns) {
      const episodeSlug = String(episodeRun.episodeWindow.episodeNumber).padStart(3, "0");
      writeJson(
        path.join(episodeQaDir, `episode-${episodeSlug}.renderer.qa.json`),
        episodeRun.qa,
      );
    }
  }

  const chapterWriteRecords = result.chapters.length > 0
    ? result.chapters.map((chapter) => ({
      chapterNumber: chapter.chapterNumber,
      text: chapter.text,
      summary: chapter.summary,
      sceneLog: chapter.sceneLog,
    }))
    : result.sceneLogs.map((sceneLog) => ({
      chapterNumber: sceneLog.chapter,
      text: "",
      summary: {
        chapter: sceneLog.chapter,
        title: sceneLog.title,
        scenePurpose: sceneLog.scenePurpose,
        sceneOutcome: sceneLog.sceneOutcome,
        sourceEventIds: sceneLog.sourceEventIds,
        sourceActionLogIds: sceneLog.sourceActionLogIds,
      },
      sceneLog,
    }));

  for (const chapter of chapterWriteRecords) {
    const chapterSlug = String(chapter.chapterNumber).padStart(3, "0");
    const renderedChapter = renderedByChapter.get(chapter.chapterNumber);
    const writerChapter = writerByChapter.get(chapter.chapterNumber);
    fs.writeFileSync(
      path.join(chaptersDir, `chapter-${chapterSlug}.md`),
      writerChapter?.text ?? renderedChapter?.text ?? chapter.text,
      "utf8",
    );
    fs.writeFileSync(
      path.join(debugChaptersDir, `chapter-${chapterSlug}.debug.md`),
      chapter.text || renderedChapter?.text || "",
      "utf8",
    );
    writeJson(
      path.join(summariesDir, `chapter-${chapterSlug}.summary.json`),
      chapter.summary,
    );
    writeJson(
      path.join(sceneLogsDir, `chapter-${chapterSlug}.scene-log.json`),
      chapter.sceneLog,
    );
    const chapterActionLogs = result.actionLogs.filter((log) =>
      log.chapter === chapter.chapterNumber
    );
    fs.writeFileSync(
      path.join(actionLogsDir, `chapter-${chapterSlug}.actions.jsonl`),
      chapterActionLogs.map((log) => JSON.stringify(log)).join("\n")
        + (chapterActionLogs.length > 0 ? "\n" : ""),
      "utf8",
    );
    if (renderedChapter) {
      writeJson(
        path.join(renderReportsDir, `chapter-${chapterSlug}.render-report.json`),
        renderedChapter.report,
      );
      writeJson(
        path.join(renderReportsDir, `chapter-${chapterSlug}.render-result.json`),
        renderedChapter,
      );
    }
    if (writerChapter) {
      writeJson(
        path.join(writerReportsDir, `chapter-${chapterSlug}.writer-report.json`),
        writerChapter.report,
      );
      fs.writeFileSync(
        path.join(writerReportsDir, `chapter-${chapterSlug}.writer-prompt.md`),
        writerChapter.prompt,
        "utf8",
      );
    }
  }

  await writeDerivedOutlineArtifacts({
    outDir,
    result,
    targetEpisodeCount: options.targetEpisodeCount,
    writeJson,
  });
  writeJson(path.join(ledgersDir, "causal-ledger.json"), result.ledger);
  writeJson(path.join(outDir, "world-brain.json"), result.brain);
  writeJson(path.join(outDir, "scene-logs.json"), result.sceneLogs);
  writeJson(path.join(outDir, "episode-selection.json"), episodeSelection);
  writeJson(path.join(outDir, "world-log-editorial-map.json"), worldLogEditorialMap);
  fs.writeFileSync(
    path.join(outDir, "world-log-editorial-map.md"),
    formatWorldLogEditorialMapMarkdown(worldLogEditorialMap),
    "utf8",
  );
  writeJson(path.join(outDir, "action-logs.json"), result.actionLogs);
  writeJson(path.join(outDir, "interaction-resolutions.json"), result.interactionResolutions);
  writeJson(path.join(outDir, "simulation-clock.json"), result.simulationClocks);
  writeJson(path.join(outDir, "simulation-diagnostics.json"), result.simulationDiagnostics);
  writeJson(path.join(outDir, "render-report.json"), rendered.report);
  writeJson(path.join(outDir, "renderer-editorial-plan.json"), rendererEditorialPlanSummary);
  fs.writeFileSync(
    path.join(outDir, "renderer-editorial-plan.md"),
    formatRendererEditorialPlanMarkdown(rendererEditorialPlanSummary),
    "utf8",
  );
  writeJson(
    path.join(outDir, "writer-report.json"),
    {
      mode: options.writerMode,
      chapterCount: writerByChapter.size,
      totalCostUsd: Array.from(writerByChapter.values()).reduce(
        (sum, item) => sum + item.report.usage.cost_usd,
        0,
      ),
      chapters: Array.from(writerByChapter.values()).map((item) => item.report),
      episodeCount: episodeWriterRuns.length,
      episodeRepairAttemptCount: episodeWriterRuns.reduce(
        (sum, run) => sum + Math.max(0, run.attempts.length - 1),
        0,
      ),
      episodeTotalCostUsd: episodeWriterRuns.reduce(
        (sum, run) => sum + run.attempts.reduce(
          (attemptSum, attempt) => attemptSum + attempt.writerReport.usage.cost_usd,
          0,
        ),
        0,
      ),
      episodeQa: episodeWriterRuns.map((run) => ({
        episodeNumber: run.episodeWindow.episodeNumber,
        attemptCount: run.attempts.length,
        finalAttempt: run.finalAttempt.attempt,
        score: run.finalAttempt.qa.score,
        verdict: run.finalAttempt.qa.verdict,
        issues: run.finalAttempt.qa.issues.map((issue) => issue.code),
      })),
      episodePromptCount: episodePromptRuns.length,
      episodePrompts: episodePromptRuns.map((run) => ({
        episodeNumber: run.episodeWindow.episodeNumber,
        timelineIndex: run.episodeWindow.timelineIndex,
        promptCharacterCount: run.promptCharacterCount,
        sourceSceneIds: run.episodeWindow.sourceSceneIds,
        sourceActionLogIds: run.episodeWindow.sourceActionLogIds,
        treatmentDecisions: run.treatmentDecisions,
      })),
      episodeDraftCount: episodeDraftRuns.length,
      episodeDrafts: episodeDraftRuns.map((run) => ({
        episodeNumber: run.episodeWindow.episodeNumber,
        timelineIndex: run.episodeWindow.timelineIndex,
        outputCharacterCount: run.draftReport.outputCharacterCount,
        polishedCharacterCount: run.polishReport.outputCharacterCount,
        polishChangeCount: run.polishReport.changedReplacementCount,
        polishInternalMarkerCount: run.polishReport.internalMarkerCount,
        paragraphCount: run.draftReport.paragraphCount,
        dialogueLineCount: run.draftReport.dialogueLineCount,
        sourceSceneIds: run.episodeWindow.sourceSceneIds,
        sourceActionLogIds: run.episodeWindow.sourceActionLogIds,
        sourceActionLogCoverage: run.draftReport.sourceActionLogCoverage,
        qa: {
          score: run.qa.score,
          verdict: run.qa.verdict,
          issues: run.qa.issues.map((issue) => issue.code),
        },
      })),
      rendererEpisodeQa: rendererEpisodeQaRuns.map((run) => ({
        episodeNumber: run.episodeWindow.episodeNumber,
        score: run.qa.score,
        verdict: run.qa.verdict,
        issues: run.qa.issues.map((issue) => issue.code),
      })),
    },
  );
  const summaryEpisodeQaRuns = episodeWriterRuns.length > 0
    ? episodeWriterRuns.map((run) => ({
      source: "episode-llm" as const,
      episodeWindow: run.episodeWindow,
      text: run.finalAttempt.text,
      attemptCount: run.attempts.length,
      finalAttempt: run.finalAttempt.attempt,
      attemptScores: run.attempts.map((attempt) => attempt.qa.score),
      qa: run.finalAttempt.qa,
    }))
    : episodeDraftRuns.length > 0
    ? episodeDraftRuns.map((run) => ({
      source: "episode-draft" as const,
      episodeWindow: run.episodeWindow,
      text: run.text,
      attemptCount: 1,
      finalAttempt: 1,
      attemptScores: [run.qa.score],
      qa: run.qa,
    }))
    : rendererEpisodeQaRuns.map((run) => ({
      source: "renderer" as const,
      episodeWindow: run.episodeWindow,
      text: run.text,
      attemptCount: 1,
      finalAttempt: 1,
      attemptScores: [run.qa.score],
      qa: run.qa,
    }));
  const corpusQa = evaluateNovelOutputCorpusQA({
    episodes: summaryEpisodeQaRuns.map((run) => ({
      episodeNumber: run.episodeWindow.episodeNumber,
      text: run.text,
      verdict: run.qa.verdict,
      score: run.qa.score,
    })),
  });
  writeJson(
    path.join(outDir, "episode-qa-summary.json"),
    {
      source: episodeWriterRuns.length > 0
        ? "episode-llm"
        : episodeDraftRuns.length > 0
          ? "episode-draft"
          : "renderer",
      episodeCount: summaryEpisodeQaRuns.length,
      passCount: summaryEpisodeQaRuns.filter((run) => run.qa.verdict === "pass").length,
      warnCount: summaryEpisodeQaRuns.filter((run) => run.qa.verdict === "warn").length,
      failCount: summaryEpisodeQaRuns.filter((run) => run.qa.verdict === "fail").length,
      averageScore: summaryEpisodeQaRuns.length === 0
        ? 0
        : summaryEpisodeQaRuns.reduce((sum, run) => sum + run.qa.score, 0) / summaryEpisodeQaRuns.length,
      minScore: summaryEpisodeQaRuns.length === 0
        ? 0
        : Math.min(...summaryEpisodeQaRuns.map((run) => run.qa.score)),
      maxScore: summaryEpisodeQaRuns.length === 0
        ? 0
        : Math.max(...summaryEpisodeQaRuns.map((run) => run.qa.score)),
      corpusQa,
      episodes: summaryEpisodeQaRuns.map((run) => ({
        source: run.source,
        episodeNumber: run.episodeWindow.episodeNumber,
        sourceSceneIds: run.episodeWindow.sourceSceneIds,
        sourceActionLogCount: run.episodeWindow.sourceActionLogIds.length,
        attemptCount: run.attemptCount,
        finalAttempt: run.finalAttempt,
        attemptScores: run.attemptScores,
        qa: run.qa,
      })),
    },
  );
  writeJson(path.join(outDir, "runtime-mind-states.json"), result.runtimeMindStates);
  writeJson(path.join(outDir, "simulation-state.json"), result.state);
  writeJson(path.join(outDir, "result.json"), result.report);

  console.log("\n월드모델 우선 시뮬레이션 완료");
  console.log(`   제목: ${result.report.title}`);
  console.log(`   범위: ${result.report.startChapter}~${result.report.endChapter}화`);
  console.log(`   생성 화수: ${result.report.generatedChapterCount}`);
  console.log(`   사건 로그: ${result.report.generatedEventCount}`);
  console.log(`   월드 브레인 행동 로그: ${result.report.worldBrain.characterActionEventCount}`);
  console.log(`   원시 행동 로그: ${result.report.worldBrain.agentActionSimulation.actionLogCount}`);
  console.log(`   상호작용 해석: ${result.report.worldBrain.agentActionSimulation.interactionResolutionCount}`);
  console.log(`   반응 커버리지: ${(result.report.worldBrain.agentActionSimulation.reactionCoverage * 100).toFixed(2)}%`);
  console.log(`   장면 로그: ${result.report.worldBrain.sceneLogCount}`);
  console.log(`   선택 episode: ${episodeSelection.selectedEpisodeCount}`);
  console.log(`   대화 턴: ${result.report.worldBrain.dialogueTurnCount}`);
  console.log(`   렌더 문단: ${rendered.report.paragraphCount}`);
  console.log(`   렌더 위반: ${rendered.report.violationCount} (${rendered.report.errorCount} errors)`);
  console.log(`   Writer 모드: ${options.writerMode}`);
  if (episodePromptRuns.length > 0) {
    const averagePromptLength = episodePromptRuns.reduce(
      (sum, run) => sum + run.promptCharacterCount,
      0,
    ) / episodePromptRuns.length;
    console.log(`   Episode Prompt 생성 편수: ${episodePromptRuns.length}`);
    console.log(`   Episode Prompt 평균 길이: ${averagePromptLength.toFixed(0)}자`);
  }
  if (episodeDraftRuns.length > 0) {
    const episodePassCount = episodeDraftRuns.filter((run) => run.qa.verdict === "pass").length;
    const episodeAverageScore = episodeDraftRuns.reduce((sum, run) => sum + run.qa.score, 0) / episodeDraftRuns.length;
    const averageLength = episodeDraftRuns.reduce(
      (sum, run) => sum + run.draftReport.outputCharacterCount,
      0,
    ) / episodeDraftRuns.length;
    console.log(`   Episode Draft 생성 편수: ${episodeDraftRuns.length}`);
    console.log(`   Episode Draft 평균 길이: ${averageLength.toFixed(0)}자`);
    console.log(`   Episode Draft QA pass: ${episodePassCount}/${episodeDraftRuns.length}`);
    console.log(`   Episode Draft QA 평균: ${episodeAverageScore.toFixed(3)}`);
  }
  if (writerByChapter.size > 0) {
    const writerCost = Array.from(writerByChapter.values()).reduce(
      (sum, item) => sum + item.report.usage.cost_usd,
      0,
    );
    const writerViolationCount = Array.from(writerByChapter.values()).reduce(
      (sum, item) => sum + item.report.violationCount,
      0,
    );
    console.log(`   Writer 생성 화수: ${writerByChapter.size}`);
    console.log(`   Writer 비용: $${writerCost.toFixed(4)}`);
    console.log(`   Writer 위반: ${writerViolationCount}`);
  }
  if (episodeWriterRuns.length > 0) {
    const episodeCost = episodeWriterRuns.reduce(
      (sum, run) => sum + run.attempts.reduce(
        (attemptSum, attempt) => attemptSum + attempt.writerReport.usage.cost_usd,
        0,
      ),
      0,
    );
    const episodePassCount = episodeWriterRuns.filter((run) => run.finalAttempt.qa.verdict === "pass").length;
    const episodeAverageScore = episodeWriterRuns.reduce(
      (sum, run) => sum + run.finalAttempt.qa.score,
      0,
    ) / episodeWriterRuns.length;
    console.log(`   Episode Writer 생성 편수: ${episodeWriterRuns.length}`);
    console.log(`   Episode QA pass: ${episodePassCount}/${episodeWriterRuns.length}`);
    console.log(`   Episode QA 평균: ${episodeAverageScore.toFixed(3)}`);
    console.log(`   Episode Writer 비용: $${episodeCost.toFixed(4)}`);
  }
  console.log(`   Corpus QA: ${corpusQa.verdict} score=${corpusQa.score.toFixed(3)}`);
  console.log(`   런타임 마음 상태: ${result.report.worldBrain.runtimeMindStateCount}`);
  console.log(`   계획 이어짐 이벤트: ${result.report.worldBrain.runtimeContinuity.planCarryoverEventCount}`);
  console.log(`   새 지식 누적 인물: ${result.report.worldBrain.runtimeContinuity.charactersWithNewKnowledge}`);
  console.log(`   렌더러 소스 커버리지: ${(result.report.rendererSourceCoverage.sourceBackedChapterRatio * 100).toFixed(2)}%`);
  console.log(`   검증: ${result.report.validation.passed ? "통과" : "실패"} (${result.report.validation.issueCount} issues)`);
  console.log(`   비용: $${result.report.costUsd.toFixed(2)}`);
  console.log(`   출력: ${outDir}`);

  const writerViolationCount = Array.from(writerByChapter.values()).reduce(
    (sum, item) => sum + item.report.violationCount,
    0,
  );
  const episodeQaFailureCount = episodeWriterRuns.filter((run) =>
    run.finalAttempt.qa.verdict !== "pass" || run.finalAttempt.qa.score < options.qaPassThreshold
  ).length;
  const episodeDraftQaFailureCount = episodeDraftRuns.filter((run) =>
    run.qa.verdict !== "pass" || run.qa.score < options.qaPassThreshold
  ).length;
  const rendererEpisodeQaFailureCount = options.writerMode === "renderer"
    ? rendererEpisodeQaRuns.filter((run) =>
      run.qa.verdict !== "pass" || run.qa.score < options.qaPassThreshold
    ).length
    : 0;
  const corpusQaFailureCount = corpusQa.verdict !== "pass" || corpusQa.score < options.qaPassThreshold ? 1 : 0;
  if (
    !result.report.validation.passed
    || rendered.report.errorCount > 0
    || writerViolationCount > 0
    || episodeQaFailureCount > 0
    || episodeDraftQaFailureCount > 0
    || rendererEpisodeQaFailureCount > 0
    || corpusQaFailureCount > 0
  ) {
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
