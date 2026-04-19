#!/usr/bin/env tsx
// Load .env before anything else
import * as fs from "fs";
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

/**
 * E2E Novel Generation Test Script
 *
 * Generates a novel (plots → seed → chapters) via the API,
 * then validates the output with deterministic evaluators.
 *
 * Usage:
 *   npx tsx scripts/e2e-test.ts
 *   npx tsx scripts/e2e-test.ts --genre 로판 --chapters 2 --preset fast
 *   npx tsx scripts/e2e-test.ts --base-url http://localhost:6367
 */

import * as path from "path";

// Evaluators (deterministic, no LLM cost)
import { sanitize, fixEndingRepeat, detectEndingRepeat, detectSentenceStartRepeat, detectShortDialogueSequence } from "../src/lib/agents/rule-guard";
import { runMathematicalChecks, type MathematicalCheckResults } from "../src/lib/evaluators/mathematical-checks";
import { evaluateStyle } from "../src/lib/evaluators/style";
import { evaluatePacing } from "../src/lib/evaluators/pacing";
import { computeDeterministicScores, type DeterministicScores } from "../src/lib/evaluators/deterministic-scorer";
import type { NovelSeed } from "../src/lib/schema/novel";
import type { ChapterSummary } from "../src/lib/schema/chapter";

// Direct harness (bypasses API timeout)
import { NovelHarness, getDefaultConfig, getBudgetConfig, getFastConfig, getSimpleConfig, getTestNoPolisherConfig, getTestNoQualityLoopConfig, getTestNoQualityNoPolisherConfig } from "../src/lib/harness";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChapterResult {
  chapterNumber: number;
  fullText: string;
  summary: ChapterSummary | null;
  score: number;
  usage: { prompt_tokens: number; completion_tokens: number; cost_usd: number };
  errors: string[];
  durationMs: number;
}

interface E2EConfig {
  baseUrl: string;
  genre: string;
  chapters: number;
  preset: "default" | "budget" | "fast" | "simple" | "no-polisher" | "no-qualityloop" | "no-quality-polisher";
  plotIndex: number;
  threshold: number;
  verbose: boolean;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): E2EConfig {
  const args = process.argv.slice(2);
  const config: E2EConfig = {
    baseUrl: "http://localhost:6367",
    genre: "로판",
    chapters: 2,
    preset: "fast",
    plotIndex: 0,
    threshold: 0.60,
    verbose: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--base-url": config.baseUrl = args[++i]; break;
      case "--genre": config.genre = args[++i]; break;
      case "--chapters": config.chapters = parseInt(args[++i], 10); break;
      case "--preset": config.preset = args[++i] as E2EConfig["preset"]; break;
      case "--plot-index": config.plotIndex = parseInt(args[++i], 10); break;
      case "--threshold": config.threshold = parseFloat(args[++i]); break;
      case "--verbose": config.verbose = true; break;
      case "--quiet": config.verbose = false; break;
    }
  }
  return config;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) { console.log(`[e2e] ${msg}`); }
function warn(msg: string) { console.log(`[e2e] ⚠ ${msg}`); }
function ok(msg: string) { console.log(`[e2e] ✓ ${msg}`); }
function fail(msg: string) { console.log(`[e2e] ✗ ${msg}`); }

async function fetchJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1_200_000), // 20 min (LLM API can be slow)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Phase 1: Generate
// ---------------------------------------------------------------------------

async function generateNovel(config: E2EConfig) {
  const { baseUrl, genre, chapters, preset, plotIndex, verbose } = config;

  // Health check
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`Server not reachable at ${baseUrl}. Is dev server running?`);
  }

  // Step 1: Generate plots
  log("플롯 생성 중...");
  const plotRes = await fetchJson(`${baseUrl}/api/plots`, { genre, count: 3 }) as { plots: Array<{ id: string; title: string; logline: string }> };
  const plots = plotRes.plots;
  if (!plots?.length) throw new Error("플롯 생성 실패");
  ok(`플롯 ${plots.length}개 생성 완료: ${plots.map((p) => p.title).join(", ")}`);
  const selectedPlot = plots[plotIndex] || plots[0];
  log(`선택된 플롯: "${selectedPlot.title}"`);

  // Step 2: Generate seed
  log("시드 생성 중...");
  const seedRes = await fetchJson(`${baseUrl}/api/seed`, { genre, plot: selectedPlot }) as { seed: NovelSeed };
  const seed = seedRes.seed;
  if (!seed) throw new Error("시드 생성 실패");
  ok(`시드 생성 완료: "${seed.title}" (캐릭터 ${seed.characters.length}명, 아웃라인 ${seed.chapter_outlines.length}화)`);

  // Step 3: Generate chapters using harness directly (no API timeout)
  const harnessConfig = preset === "fast" ? getFastConfig()
    : preset === "simple" ? getSimpleConfig()
    : preset === "budget" ? getBudgetConfig()
    : preset === "no-polisher" ? getTestNoPolisherConfig()
    : preset === "no-qualityloop" ? getTestNoQualityLoopConfig()
    : preset === "no-quality-polisher" ? getTestNoQualityNoPolisherConfig()
    : getDefaultConfig();
  const harness = new NovelHarness(harnessConfig);

  log(`하네스 직접 실행 (preset: ${preset}, API 타임아웃 우회)`);

  const chapterResults: ChapterResult[] = [];

  for await (const event of harness.run(seed, 1, chapters)) {
    switch (event.type) {
      case "plan_generated":
        if (verbose) process.stdout.write("[plan] ");
        break;
      case "chapter_start":
        if (verbose) process.stdout.write(`\n  ${event.chapter}화: `);
        break;
      case "pipeline_event":
        if (verbose) {
          if (event.event.type === "stage_change") process.stdout.write(`[${(event.event as { stage: string }).stage}] `);
          else if (event.event.type === "error") warn((event.event as { message: string }).message);
        }
        break;
      case "chapter_complete": {
        const r = event.result;
        chapterResults.push({
          chapterNumber: r.chapterNumber,
          fullText: r.text,
          summary: r.summary,
          score: r.score,
          usage: { prompt_tokens: r.usage.prompt_tokens, completion_tokens: r.usage.completion_tokens, cost_usd: r.usage.cost_usd },
          errors: [],
          durationMs: r.durationMs,
        });
        if (verbose) console.log();
        ok(`${r.chapterNumber}화 완료: ${r.text.length}자, ${(r.durationMs / 1000).toFixed(1)}초, $${r.usage.cost_usd.toFixed(4)}`);
        break;
      }
      case "done":
        if (verbose) log(`하네스 완료: $${event.result.totalUsage.cost_usd.toFixed(4)}`);
        break;
      case "error":
        warn(`${event.chapter}화 에러: ${event.message}`);
        break;
    }
  }

  const summaries = chapterResults
    .filter((ch) => ch.summary)
    .map((ch) => ({
      chapter: ch.chapterNumber,
      title: ch.summary!.title,
      summary: ch.summary!.plot_summary,
      cliffhanger: ch.summary!.cliffhanger,
    }));

  // Dump world state for verification of new extraction fields
  const worldState = harness.getWorldStateSnapshot();

  return { seed, plots, selectedPlot, chapterResults, summaries, masterPlan: undefined, worldState };
}

// ---------------------------------------------------------------------------
// Phase 2: Validate
// ---------------------------------------------------------------------------

interface ChapterEval {
  chapterNumber: number;
  textLength: number;
  ruleGuard: {
    sanitizedDiff: number;
    endingRepeat: number;
    sentenceStartRepeat: number;
    shortDialogueSequence: number;
    issues: Array<{ type: string; detail: string }>;
  };
  pacing: Record<string, unknown> | null;
  style: Record<string, unknown> | null;
  mathChecks: MathematicalCheckResults | null;
  deterministicScores: DeterministicScores | null;
  overallScore: number;
  verdict: "PASS" | "WARN" | "FAIL";
}

function validateChapter(text: string, chapterNumber: number, seed: NovelSeed): ChapterEval {
  // Rule Guard (apply fixEndingRepeat like the real pipeline does)
  const sanitized = fixEndingRepeat(sanitize(text));
  const sanitizedDiff = text.length - sanitized.length;
  const endingIssues = detectEndingRepeat(sanitized);
  const sentenceStartIssues = detectSentenceStartRepeat(sanitized);
  const dialogueIssues = detectShortDialogueSequence(sanitized);
  const allIssues = [...endingIssues, ...sentenceStartIssues, ...dialogueIssues];

  // Pacing
  let pacingResult: Record<string, unknown> | null = null;
  try {
    pacingResult = evaluatePacing(sanitized, chapterNumber) as unknown as Record<string, unknown>;
  } catch { /* evaluator may not exist or throw */ }

  // Style
  let styleResult: Record<string, unknown> | null = null;
  try {
    styleResult = evaluateStyle(sanitized, seed.style) as unknown as Record<string, unknown>;
  } catch { /* evaluator may not exist or throw */ }

  // Mathematical checks
  let mathChecks: MathematicalCheckResults | null = null;
  try {
    mathChecks = runMathematicalChecks(sanitized);
  } catch { /* evaluator may throw */ }

  // Deterministic scores (19 dimensions + consistency gate)
  let deterministicScores: DeterministicScores | null = null;
  try {
    deterministicScores = computeDeterministicScores(sanitized, seed, chapterNumber);
  } catch { /* evaluator may throw */ }

  // Score: use deterministic scorer as primary (includes fun metrics)
  // Fall back to legacy calculation if deterministic scorer fails
  const ruleGuardPenalty = Math.max(0, 1.0 - allIssues.length * 0.1);
  let overallScore: number;
  if (deterministicScores) {
    // Deterministic scorer already applies consistency gate
    // Blend with ruleGuard penalty (10%) for mechanical issues
    overallScore = deterministicScores.overall * 0.9 + ruleGuardPenalty * 0.1;
  } else {
    const pacingScore = (pacingResult as { overall?: number })?.overall ?? 0.7;
    const styleScore = (styleResult as { overall_score?: number })?.overall_score ?? 0.7;
    const mathScore = mathChecks?.overallScore ?? 0.7;
    overallScore = ruleGuardPenalty * 0.2 + pacingScore * 0.25 + styleScore * 0.25 + mathScore * 0.3;
  }

  const criticalCount = allIssues.filter((i) => (i as { severity?: string }).severity === "critical").length;
  const verdict = criticalCount > 0 || overallScore < 0.5 ? "FAIL"
    : overallScore < 0.65 ? "WARN"
    : "PASS";

  return {
    chapterNumber,
    textLength: sanitized.length,
    ruleGuard: {
      sanitizedDiff,
      endingRepeat: endingIssues.length,
      sentenceStartRepeat: sentenceStartIssues.length,
      shortDialogueSequence: dialogueIssues.length,
      issues: allIssues.map((i) => ({ type: i.type, detail: i.detail })),
    },
    pacing: pacingResult,
    style: styleResult,
    mathChecks,
    deterministicScores,
    overallScore: Math.round(overallScore * 100) / 100,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Phase 3: Report
// ---------------------------------------------------------------------------

function generateReport(
  config: E2EConfig,
  seed: NovelSeed,
  chapterResults: ChapterResult[],
  evals: ChapterEval[],
  outputDir: string,
) {
  // Save artifacts
  fs.mkdirSync(path.join(outputDir, "chapters"), { recursive: true });
  fs.writeFileSync(path.join(outputDir, "seed.json"), JSON.stringify(seed, null, 2));

  for (const ch of chapterResults) {
    fs.writeFileSync(path.join(outputDir, "chapters", `ch${String(ch.chapterNumber).padStart(2, "0")}.txt`), ch.fullText);
    if (ch.summary) {
      fs.writeFileSync(
        path.join(outputDir, "chapters", `ch${String(ch.chapterNumber).padStart(2, "0")}-summary.json`),
        JSON.stringify(ch.summary, null, 2),
      );
    }
  }

  for (const ev of evals) {
    fs.writeFileSync(
      path.join(outputDir, "chapters", `ch${String(ev.chapterNumber).padStart(2, "0")}-eval.json`),
      JSON.stringify(ev, null, 2),
    );
  }

  // Dump world state extraction for verification
  if (genResult.worldState && genResult.worldState.length > 0) {
    fs.writeFileSync(
      path.join(outputDir, "world-state.json"),
      JSON.stringify(genResult.worldState, null, 2),
    );
  }

  // Total cost
  const totalCost = chapterResults.reduce((sum, ch) => sum + ch.usage.cost_usd, 0);
  const totalDuration = chapterResults.reduce((sum, ch) => sum + ch.durationMs, 0);
  const avgScore = evals.reduce((sum, ev) => sum + ev.overallScore, 0) / evals.length;
  const overallVerdict = evals.some((e) => e.verdict === "FAIL") ? "FAIL"
    : evals.some((e) => e.verdict === "WARN") ? "WARN"
    : "PASS";

  // Print report
  console.log("\n" + "=".repeat(50));
  console.log(`  E2E Test Report — ${new Date().toISOString()}`);
  console.log("=".repeat(50));
  console.log(`\nGenre:    ${config.genre}`);
  console.log(`Preset:   ${config.preset}`);
  console.log(`Chapters: ${config.chapters}`);
  console.log(`Cost:     $${totalCost.toFixed(4)}`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Title:    ${seed.title}`);

  console.log("\n--- Chapter Scores ---");
  for (const ev of evals) {
    const ch = chapterResults.find((c) => c.chapterNumber === ev.chapterNumber);
    const verdictColor = ev.verdict === "PASS" ? "✓" : ev.verdict === "WARN" ? "⚠" : "✗";
    console.log(`  Ch${ev.chapterNumber}: ${ev.overallScore} (${verdictColor} ${ev.verdict})`);
    console.log(`    Length:     ${ev.textLength}자`);
    console.log(`    RuleGuard:  ending=${ev.ruleGuard.endingRepeat} start=${ev.ruleGuard.sentenceStartRepeat} dialogue=${ev.ruleGuard.shortDialogueSequence}`);
    if (ev.ruleGuard.sanitizedDiff > 0) console.log(`    Sanitized:  ${ev.ruleGuard.sanitizedDiff}자 제거됨`);
    if (ch) console.log(`    Cost:       $${ch.usage.cost_usd.toFixed(4)}, ${(ch.durationMs / 1000).toFixed(1)}s`);
    // Show deterministic scores breakdown (fun/engagement metrics)
    if (ev.deterministicScores) {
      const ds = ev.deterministicScores;
      console.log(`    Score:      narrative=${ds.narrative.toFixed(2)} voice=${ds.characterVoice.toFixed(2)} pacing=${ds.readabilityPacing.toFixed(2)} engage=${ds.engagement.toFixed(2)}`);
      console.log(`    Fun:        pageTurn=${ds.pageTurner.toFixed(2)} curiosity=${ds.curiosityGap.toFixed(2)} emotion=${ds.emotionalImpact.toFixed(2)} original=${ds.originality.toFixed(2)}`);
      console.log(`    Gate:       consistency=${ds.consistencyGate.toFixed(2)}`);
    } else if (ev.mathChecks) {
      const mc = ev.mathChecks;
      console.log(`    Math:       info=${mc.informationDensity.score.toFixed(2)} loop=${mc.loopDetection.score.toFixed(2)} dialogue=${mc.dialogueInfo.score.toFixed(2)} H=${mc.sentimentArc.hurstExponent}(${mc.sentimentArc.hurstScore.toFixed(2)})`);
    }
    for (const issue of ev.ruleGuard.issues) {
      console.log(`    [${issue.type}] ${issue.detail}`);
    }
  }

  // Cross-chapter: continuity check (enhanced — 500 chars, all pairs, first-name matching)
  // Helper: check if a character appears in text by full name OR first name
  const charInText = (c: { name: string }, text: string): boolean => {
    if (text.includes(c.name)) return true;
    const firstName = c.name.split(/\s+/)[0];
    return firstName.length >= 2 && text.includes(firstName);
  };
  const charLabel = (c: { name: string }): string => c.name.split(/\s+/)[0];

  if (chapterResults.length >= 2) {
    console.log("\n--- Cross-Chapter Continuity ---");
    let totalCarryOver = 0;
    let totalExpected = 0;
    for (let ci = 0; ci < chapterResults.length - 1; ci++) {
      const chEnd = chapterResults[ci].fullText.slice(-500);
      const chStart = chapterResults[ci + 1].fullText.slice(0, 500);

      const endChars = seed.characters.filter((c) => charInText(c, chEnd));
      const startChars = seed.characters.filter((c) => charInText(c, chStart));
      const carryOver = endChars.filter((c) => startChars.some((sc) => sc.name === c.name));

      totalCarryOver += carryOver.length;
      totalExpected += Math.max(endChars.length, 1);

      console.log(`  ${ci + 1}→${ci + 2}화: ${carryOver.length}/${endChars.length} chars (${endChars.map(charLabel).join(",") || "none"} → ${startChars.map(charLabel).join(",") || "none"})`);
    }
    const continuityScore = totalExpected > 0 ? (totalCarryOver / totalExpected) : 0;
    console.log(`  Overall:  ${(continuityScore * 100).toFixed(0)}% character continuity`);
  }

  console.log(`\n--- Overall ---`);
  console.log(`  Score:   ${avgScore.toFixed(2)}`);
  console.log(`  Verdict: ${overallVerdict}`);
  console.log(`  Output:  ${outputDir}`);
  console.log("=".repeat(50));

  // Save report
  const report = {
    config,
    seed: { title: seed.title, characters: seed.characters.length },
    chapters: evals,
    totalCost,
    totalDuration,
    avgScore,
    verdict: overallVerdict,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));

  return overallVerdict;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputDir = `/tmp/e2e-test-${timestamp}`;

  log(`E2E 테스트 시작: ${config.genre}, ${config.chapters}화, preset=${config.preset}`);
  log(`서버: ${config.baseUrl}`);

  try {
    // Phase 1: Generate
    const { seed, chapterResults } = await generateNovel(config);

    // Phase 2: Validate
    log("\n검증 중...");
    const evals: ChapterEval[] = [];
    for (const ch of chapterResults) {
      const ev = validateChapter(ch.fullText, ch.chapterNumber, seed);
      evals.push(ev);
    }

    // Phase 3: Report
    const verdict = generateReport(config, seed, chapterResults, evals, outputDir);

    // Exit code
    process.exit(verdict === "FAIL" ? 1 : 0);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

main();
