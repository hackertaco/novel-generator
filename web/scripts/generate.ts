#!/usr/bin/env tsx
/**
 * CLI entry point for the novel generation harness.
 *
 * Usage:
 *   npx tsx scripts/generate.ts --seed seed.json --chapters 1-5
 *   npx tsx scripts/generate.ts --seed seed.json --chapters 1-5 --preset budget
 *   npx tsx scripts/generate.ts --seed seed.json --chapters 1-10 --out ./output
 *
 * Options:
 *   --seed <path>       Path to seed JSON file (required)
 *   --chapters <range>  Chapter range, e.g. "1-5" or "1" (default: 1-3)
 *   --preset <name>     Config preset: "default", "budget", "fast" (default: "default")
 *   --out <dir>         Output directory for chapter files (default: ./output)
 *   --budget <usd>      Budget limit in USD (default: unlimited)
 *   --verbose           Print pipeline events (default: true)
 *   --quiet             Suppress pipeline events
 */

import * as fs from "fs";
import * as path from "path";
import { NovelHarness, getDefaultConfig, getBudgetConfig, getFastConfig } from "../src/lib/harness";
import type { HarnessConfig } from "../src/lib/harness";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  seedPath: string;
  startChapter: number;
  endChapter: number;
  preset: string;
  outDir: string;
  budget: number | null;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  let seedPath = "";
  let chapters = "1-3";
  let preset = "default";
  let outDir = "./output";
  let budget: number | null = null;
  let verbose = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--seed":
        seedPath = args[++i];
        break;
      case "--chapters":
        chapters = args[++i];
        break;
      case "--preset":
        preset = args[++i];
        break;
      case "--out":
        outDir = args[++i];
        break;
      case "--budget":
        budget = parseFloat(args[++i]);
        break;
      case "--quiet":
        verbose = false;
        break;
      case "--verbose":
        verbose = true;
        break;
    }
  }

  if (!seedPath) {
    console.error("Usage: npx tsx scripts/generate.ts --seed <path> [--chapters 1-5] [--preset default|budget|fast]");
    process.exit(1);
  }

  const [start, end] = chapters.includes("-")
    ? chapters.split("-").map(Number)
    : [Number(chapters), Number(chapters)];

  return {
    seedPath,
    startChapter: start,
    endChapter: end,
    preset,
    outDir,
    budget,
    verbose,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();

  // Load seed
  const seedRaw = fs.readFileSync(path.resolve(opts.seedPath), "utf-8");
  const seed = JSON.parse(seedRaw);

  // Select preset
  let config: HarnessConfig;
  switch (opts.preset) {
    case "budget":
      config = getBudgetConfig();
      break;
    case "fast":
      config = getFastConfig();
      break;
    default:
      config = getDefaultConfig();
  }

  // Apply overrides
  if (opts.budget !== null) config.budgetUsd = opts.budget;
  config.output = { mode: "file", dir: opts.outDir, verbose: opts.verbose };

  // Create output directory
  const outDir = path.resolve(opts.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n📖 소설 생성 하네스`);
  console.log(`   설정: ${config.name}`);
  console.log(`   시드: ${seed.title}`);
  console.log(`   범위: ${opts.startChapter}~${opts.endChapter}화`);
  console.log(`   출력: ${outDir}`);
  if (config.budgetUsd) console.log(`   예산: $${config.budgetUsd}`);
  console.log("");

  // Run harness
  const harness = new NovelHarness(config);
  const startTime = Date.now();

  for await (const event of harness.run(seed, opts.startChapter, opts.endChapter)) {
    switch (event.type) {
      case "chapter_start":
        if (opts.verbose) console.log(`\n--- ${event.chapter}화 생성 시작 ---`);
        break;

      case "pipeline_event":
        if (opts.verbose && event.event.type === "stage_change") {
          process.stdout.write(`  [${event.event.stage}] `);
        }
        break;

      case "chapter_complete": {
        const r = event.result;
        // Save chapter text
        const chFile = path.join(outDir, `chapter-${String(r.chapterNumber).padStart(3, "0")}.txt`);
        fs.writeFileSync(chFile, r.text, "utf-8");

        // Save summary
        const sumFile = path.join(outDir, `chapter-${String(r.chapterNumber).padStart(3, "0")}.summary.json`);
        fs.writeFileSync(sumFile, JSON.stringify(r.summary, null, 2), "utf-8");

        console.log(`\n  ✅ ${r.chapterNumber}화 완료`);
        console.log(`     분량: ${r.text.length.toLocaleString()}자`);
        console.log(`     점수: ${Math.round(r.score * 100)}점`);
        console.log(`     토큰: ${r.usage.total_tokens.toLocaleString()}`);
        console.log(`     비용: $${r.usage.cost_usd.toFixed(4)}`);
        console.log(`     시간: ${(r.durationMs / 1000).toFixed(1)}초`);
        break;
      }

      case "error":
        console.error(`\n  ❌ ${event.chapter}화 에러: ${event.message}`);
        break;

      case "done": {
        const d = event.result;
        console.log(`\n${"=".repeat(50)}`);
        console.log(`📊 결과 요약 (${d.config})`);
        console.log(`   총 ${d.chapters.length}화 생성`);
        console.log(`   총 토큰: ${d.totalUsage.total_tokens.toLocaleString()}`);
        console.log(`   총 비용: $${d.totalCostUsd.toFixed(4)}`);
        console.log(`   총 시간: ${(d.totalDurationMs / 1000).toFixed(1)}초`);
        console.log(`   평균 점수: ${Math.round(d.chapters.reduce((s, c) => s + c.score, 0) / d.chapters.length * 100)}점`);
        console.log(`${"=".repeat(50)}\n`);

        // Save full result
        const resultFile = path.join(outDir, "result.json");
        fs.writeFileSync(resultFile, JSON.stringify({
          config: d.config,
          totalUsage: d.totalUsage,
          totalCostUsd: d.totalCostUsd,
          totalDurationMs: d.totalDurationMs,
          chapters: d.chapters.map((c) => ({
            chapterNumber: c.chapterNumber,
            charCount: c.text.length,
            score: c.score,
            usage: c.usage,
            durationMs: c.durationMs,
          })),
        }, null, 2), "utf-8");
        break;
      }
    }
  }

  console.log(`완료! (${((Date.now() - startTime) / 1000).toFixed(1)}초)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
