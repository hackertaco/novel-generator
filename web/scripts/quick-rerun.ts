#!/usr/bin/env tsx
/**
 * Quick E2E rerun using an existing seed — skips plot/seed generation.
 * Usage: npx tsx scripts/quick-rerun.ts <seed-json-path> [chapters]
 */
import * as fs from "fs";
import * as path from "path";

// Load .env
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

import { NovelHarness, getFastConfig } from "../src/lib/harness";
import { computeDeterministicScores } from "../src/lib/evaluators/deterministic-scorer";

async function main() {
  const seedPath = process.argv[2] || "e2e-output/2026-04-06T1044/seed.json";
  const maxChapters = parseInt(process.argv[3] || "3", 10);

  const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  console.log(`[rerun] Seed: "${seed.title}", ${maxChapters}화 생성`);

  const outDir = `/tmp/e2e-rerun-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  fs.mkdirSync(path.join(outDir, "chapters"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "seed.json"), JSON.stringify(seed, null, 2));

  const harness = new NovelHarness(getFastConfig());

  const start = Date.now();
  const texts: string[] = [];
  let currentCh = 0;

  for await (const event of harness.run(seed, 1, maxChapters)) {
    if (event.type === "chapter_start") {
      currentCh = event.chapter;
      process.stdout.write(`  ${currentCh}화: `);
    } else if (event.type === "pipeline_event") {
      const pe = event.event;
      if (pe.type === "stage_change") process.stdout.write(`[${pe.stage}] `);
    } else if (event.type === "chapter_complete") {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const text = (event as { result?: { text?: string } }).result?.text || "";
      texts.push(text);
      const scores = computeDeterministicScores(text, seed, currentCh);
      console.log(`\n  ✓ ${currentCh}화: ${text.length}자, ${elapsed}초, 점수=${scores.overall.toFixed(2)}`);
      fs.writeFileSync(path.join(outDir, "chapters", `ch${String(currentCh).padStart(2, "0")}.txt`), text);
    }
  }

  console.log(`\n[rerun] 완료! 출력: ${outDir}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
