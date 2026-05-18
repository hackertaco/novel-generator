#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";

import { load as loadYaml } from "js-yaml";

import { NovelSeedSchema, type NovelSeed } from "../src/lib/schema/novel";
import {
  buildWorldBrainFromSeed,
  summarizeWorldBrain,
  type WorldBrain,
} from "../src/lib/sim/world-brain";

interface BuildWorldBrainCliOptions {
  seedPath: string;
  outDir: string;
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/build-world-brain.ts --seed ./seeds/test-romance-fantasy.json --out ./output/world-brain",
    "",
    "Options:",
    "  --seed <path>  Seed JSON/YAML path",
    "  --out <dir>    Output directory",
  ].join("\n");
}

function parseArgs(args = process.argv.slice(2)): BuildWorldBrainCliOptions {
  let seedPath: string | undefined;
  let outDir = "./output/world-brain";

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const next = args[index + 1];
    switch (token) {
      case "--seed":
        if (!next) throw new Error("--seed requires a path");
        seedPath = next;
        index += 1;
        break;
      case "--out":
        if (!next) throw new Error("--out requires a directory");
        outDir = next;
        index += 1;
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

  return { seedPath, outDir };
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

function renderBrainMarkdown(brain: WorldBrain): string {
  const summary = summarizeWorldBrain(brain);
  const characterLines = Object.values(brain.characterMinds).map((mind) => [
    `### ${mind.name}`,
    `- 역할: ${mind.role}`,
    `- 겉목표: ${mind.desires.surfaceGoal}`,
    `- 숨은목표: ${mind.desires.hiddenGoal}`,
    `- 두려움: ${mind.fears.join(", ") || "미정"}`,
    `- 비밀: ${mind.secrets.join(", ") || "없음"}`,
    `- 관계 모델 수: ${Object.keys(mind.relationshipModel).length}`,
  ].join("\n"));

  const railLines = [
    ...brain.plotRails.mustHappen.map((rail) => `- [${rail.kind}] ${rail.chapterRange}: ${rail.description}`),
    ...brain.plotRails.mustNotHappenBefore.map((rail) => `- [${rail.kind}] ${rail.chapterRange}: ${rail.description}`),
  ];

  return [
    `# ${brain.title} World Brain`,
    "",
    brain.logline,
    "",
    "## Summary",
    ...Object.entries(summary).map(([key, value]) => `- ${key}: ${String(value)}`),
    "",
    "## World Pressure",
    `- premise: ${brain.worldHistory.foundingPremise}`,
    ...brain.conflictMap.pressurePoints.map((point) => `- ${point}`),
    "",
    "## Plot Rails",
    ...railLines,
    "",
    "## Character Minds",
    ...characterLines,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs();
  const seed = loadSeed(options.seedPath);
  const brain = buildWorldBrainFromSeed(seed);
  const outDir = path.resolve(options.outDir);

  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, "world-brain.json"), brain);
  writeJson(path.join(outDir, "summary.json"), summarizeWorldBrain(brain));
  fs.writeFileSync(path.join(outDir, "world-brain.md"), renderBrainMarkdown(brain), "utf8");

  const summary = summarizeWorldBrain(brain);
  console.log("\n월드 브레인 생성 완료");
  console.log(`   제목: ${brain.title}`);
  console.log(`   인물 마음: ${summary.characterMindCount}`);
  console.log(`   세력: ${summary.factionCount}`);
  console.log(`   비밀: ${summary.secretCount}`);
  console.log(`   필수 레일: ${summary.mustHappenRailCount}`);
  console.log(`   조기공개 금지 레일: ${summary.mustNotHappenBeforeRailCount}`);
  console.log(`   출력: ${outDir}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
