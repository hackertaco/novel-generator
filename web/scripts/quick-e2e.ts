#!/usr/bin/env tsx
/**
 * Quick E2E test — uses harness directly, no HTTP server needed.
 * Usage: npx tsx scripts/quick-e2e.ts [--genre 로판] [--chapters 2]
 */
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

import { NovelHarness, getFastConfig } from "../src/lib/harness";
import { measureOriginality } from "../src/lib/evaluators/originality";
import { evaluateConsistencyGate } from "../src/lib/evaluators/consistency-gate";
import { computeDeterministicScores } from "../src/lib/evaluators/deterministic-scorer";
import type { NovelSeed } from "../src/lib/schema/novel";

// Parse args
let genre = "로맨스 판타지";
let chapters = 2;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--genre") genre = process.argv[++i];
  if (process.argv[i] === "--chapters") chapters = parseInt(process.argv[++i], 10);
}

async function main() {
  console.log(`\n🔥 Quick E2E: ${genre}, ${chapters}화, preset=fast\n`);

  const harness = new NovelHarness(getFastConfig());

  // Phase 1: Plots
  console.log("📋 플롯 생성 중...");
  let plots: Array<{ id: string; title: string; logline: string }> = [];
  for await (const event of harness.stepPlots(genre)) {
    if (event.type === "plots_generated") {
      plots = event.plots;
    }
  }
  console.log(`✓ 플롯 ${plots.length}개: ${plots.map(p => p.title).join(", ")}`);
  const selectedPlot = plots[0];
  console.log(`  → 선택: "${selectedPlot.title}"`);

  // Phase 2: Seed
  console.log("\n🌱 시드 생성 중...");
  let seed: NovelSeed | null = null;
  for await (const event of harness.stepSeed(genre, selectedPlot)) {
    if (event.type === "seed_generated") {
      seed = event.seed;
    }
  }
  if (!seed) throw new Error("시드 생성 실패");
  console.log(`✓ "${seed.title}" — 캐릭터 ${seed.characters.length}명, 아웃라인 ${seed.chapter_outlines.length}화`);

  // Save seed
  const outDir = path.resolve(__dirname, "../e2e-output", new Date().toISOString().slice(0, 16).replace(/:/g, ""));
  fs.mkdirSync(path.join(outDir, "chapters"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "seed.json"), JSON.stringify(seed, null, 2));

  // Phase 3: Chapters
  console.log(`\n📖 챕터 생성 중 (1~${chapters}화)...\n`);
  const results: Array<{ ch: number; text: string; score: number; cost: number; ms: number }> = [];

  for await (const event of harness.run(seed, 1, chapters)) {
    switch (event.type) {
      case "chapter_start":
        process.stdout.write(`  ${event.chapter}화: `);
        break;
      case "pipeline_event":
        if (event.event.type === "stage_change") {
          process.stdout.write(`[${(event.event as { stage: string }).stage}] `);
        }
        break;
      case "chapter_complete": {
        const r = event.result;
        results.push({ ch: r.chapterNumber, text: r.text, score: r.score, cost: r.usage.cost_usd, ms: r.durationMs });
        console.log(`\n  ✓ ${r.chapterNumber}화: ${r.text.length}자, ${r.score.toFixed(2)}, $${r.usage.cost_usd.toFixed(4)}, ${(r.durationMs/1000).toFixed(1)}s`);
        fs.writeFileSync(path.join(outDir, "chapters", `ch${String(r.chapterNumber).padStart(2,"0")}.txt`), r.text);
        break;
      }
      case "error":
        console.log(`\n  ✗ ${event.chapter}화 에러: ${event.message}`);
        break;
    }
  }

  // Phase 4: Evaluate
  console.log("\n" + "=".repeat(50));
  console.log("  평가 결과");
  console.log("=".repeat(50));

  for (const r of results) {
    const orig = measureOriginality(r.text);
    const consistency = evaluateConsistencyGate(r.text, seed!.characters);
    let det: { overall: number; curiosityGap: number; emotionalImpact: number; originality: number; hookEnding: number; dialogueQuality: number; rhythm: number } | null = null;
    try {
      det = computeDeterministicScores(r.text, seed!, r.ch);
    } catch { /* may fail */ }

    console.log(`\n  ${r.ch}화 (${r.text.length}자, 점수 ${r.score.toFixed(2)})`);
    console.log(`    독창성: ${orig.score.toFixed(2)} (클리셰 ${orig.clicheCount}개, 금지표현 ${orig.bannedCount}개)`);
    if (orig.bannedFound.length > 0) {
      console.log(`    금지표현: ${orig.bannedFound.join(", ")}`);
    }
    console.log(`    일관성 게이트: ${consistency.gate.toFixed(2)} (이슈 ${consistency.issues.length}개)`);
    for (const issue of consistency.issues) {
      console.log(`      [${issue.severity}] ${issue.type}: ${issue.detail}`);
    }
    if (det) {
      console.log(`    결정적 점수: ${det.overall.toFixed(2)}`);
      console.log(`      호기심=${det.curiosityGap.toFixed(2)} 감정=${det.emotionalImpact.toFixed(2)} 독창=${det.originality.toFixed(2)}`);
      console.log(`      절단신공=${det.hookEnding.toFixed(2)} 대사=${det.dialogueQuality.toFixed(2)} 리듬=${det.rhythm.toFixed(2)}`);
    }
  }

  // Summary
  const totalCost = results.reduce((s, r) => s + r.cost, 0);
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  console.log(`\n--- 종합 ---`);
  console.log(`  평균 점수: ${avgScore.toFixed(2)}`);
  console.log(`  총 비용:   $${totalCost.toFixed(4)}`);
  console.log(`  출력 경로: ${outDir}`);
  console.log("=".repeat(50));

  // Print first chapter for human review
  if (results.length > 0) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`  1화 전문 (읽고 비판해주세요)`);
    console.log(`${"─".repeat(50)}\n`);
    console.log(results[0].text);
    console.log(`\n${"─".repeat(50)}\n`);
  }
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
