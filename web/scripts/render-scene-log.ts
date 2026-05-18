#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";

import { renderSceneLogToProse } from "../src/lib/rendering";
import { SceneLogSchema } from "../src/lib/sim/scene-log";
import { WorldBrainSchema, type WorldBrain } from "../src/lib/sim/world-brain";

interface RenderSceneLogCliOptions {
  sceneLogPath: string;
  worldBrainPath?: string;
  outDir: string;
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/render-scene-log.ts --scene-log ./output/run/scene-logs/chapter-001.scene-log.json --out ./output/rendered",
    "",
    "Options:",
    "  --scene-log <path>    SceneLog JSON path",
    "  --world-brain <path>  Optional WorldBrain JSON path",
    "  --out <dir>           Output directory",
  ].join("\n");
}

function parseArgs(args = process.argv.slice(2)): RenderSceneLogCliOptions {
  let sceneLogPath: string | undefined;
  let worldBrainPath: string | undefined;
  let outDir = "./output/scene-log-render";

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const next = args[index + 1];
    switch (token) {
      case "--scene-log":
        if (!next) throw new Error("--scene-log requires a path");
        sceneLogPath = next;
        index += 1;
        break;
      case "--world-brain":
        if (!next) throw new Error("--world-brain requires a path");
        worldBrainPath = next;
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

  if (!sceneLogPath) {
    throw new Error(`Missing --scene-log\n\n${usage()}`);
  }

  return { sceneLogPath, worldBrainPath, outDir };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadWorldBrain(worldBrainPath?: string): WorldBrain | undefined {
  if (!worldBrainPath) return undefined;
  return WorldBrainSchema.parse(readJson(worldBrainPath));
}

async function main(): Promise<void> {
  const options = parseArgs();
  const sceneLog = SceneLogSchema.parse(readJson(options.sceneLogPath));
  const worldBrain = loadWorldBrain(options.worldBrainPath);
  const outDir = path.resolve(options.outDir);
  const chapterSlug = String(sceneLog.chapter).padStart(3, "0");

  fs.mkdirSync(outDir, { recursive: true });

  const result = renderSceneLogToProse({ sceneLog, worldBrain });

  fs.writeFileSync(
    path.join(outDir, `chapter-${chapterSlug}.rendered.md`),
    result.text,
    "utf8",
  );
  writeJson(path.join(outDir, `chapter-${chapterSlug}.render-result.json`), result);
  writeJson(path.join(outDir, `chapter-${chapterSlug}.render-report.json`), result.report);

  const errorCount = result.report.violations.filter((violation) =>
    violation.severity === "error"
  ).length;

  console.log("\nSceneLog 렌더링 완료");
  console.log(`   장면: ${result.report.sceneId}`);
  console.log(`   원본 사건: ${result.report.sourceEventIds.length}`);
  console.log(`   대사 줄: ${result.report.dialogueLineCount}`);
  console.log(`   문단: ${result.report.paragraphCount}`);
  console.log(`   위반: ${result.report.violations.length} (${errorCount} errors)`);
  console.log(`   출력: ${outDir}`);

  if (errorCount > 0) {
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
