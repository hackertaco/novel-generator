#!/usr/bin/env tsx
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

import * as fs from "fs";
import * as path from "path";

// Evaluators (deterministic, no LLM cost)
import { sanitize, detectEndingRepeat, detectSentenceStartRepeat, detectShortDialogueSequence } from "../src/lib/agents/rule-guard";
import { evaluateStyle } from "../src/lib/evaluators/style";
import { evaluatePacing } from "../src/lib/evaluators/pacing";
import type { NovelSeed } from "../src/lib/schema/novel";
import type { ChapterSummary } from "../src/lib/schema/chapter";

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
  preset: "default" | "budget" | "fast";
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
    signal: AbortSignal.timeout(300_000), // 5 min
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// SSE Stream Parser (mirrors useStreamingGeneration.ts)
// ---------------------------------------------------------------------------

async function parseSSEStream(
  url: string,
  body: unknown,
  onEvent?: (type: string, data: Record<string, unknown>) => void,
): Promise<ChapterResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`HTTP ${res.status}: ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No readable stream");

  const decoder = new TextDecoder();
  let fullText = "";
  let summary: ChapterSummary | null = null;
  let score = 0;
  const usage = { prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 };
  const errors: string[] = [];
  const start = Date.now();

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        onEvent?.(parsed.type, parsed);

        switch (parsed.type) {
          case "chunk":
            fullText += parsed.content;
            break;
          case "replace_text":
            fullText = parsed.content;
            break;
          case "patch": {
            const paragraphs = fullText.split("\n\n").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
            if (parsed.paragraphId >= 0 && parsed.paragraphId < paragraphs.length) {
              paragraphs[parsed.paragraphId] = parsed.content;
              fullText = paragraphs.join("\n\n");
            }
            break;
          }
          case "complete":
            if (parsed.summary) summary = parsed.summary;
            break;
          case "evaluation":
            score = parsed.overall_score || 0;
            break;
          case "usage":
            usage.prompt_tokens += parsed.prompt_tokens || 0;
            usage.completion_tokens += parsed.completion_tokens || 0;
            usage.cost_usd += parsed.cost_usd || 0;
            break;
          case "error":
            errors.push(parsed.message || "unknown error");
            break;
        }
      } catch {
        // ignore parse errors in SSE
      }
    }
  }

  return {
    chapterNumber: 0,
    fullText,
    summary,
    score,
    usage,
    errors,
    durationMs: Date.now() - start,
  };
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

  // Step 3: Generate chapters
  const chapterResults: ChapterResult[] = [];
  const summaries: Array<{ chapter: number; title: string; summary: string; cliffhanger?: string | null }> = [];
  let masterPlan: unknown = undefined;

  for (let ch = 1; ch <= chapters; ch++) {
    log(`${ch}화 생성 중... (preset: ${preset})`);

    const previousChapterEnding = chapterResults.length > 0
      ? chapterResults[chapterResults.length - 1].fullText.slice(-500)
      : undefined;

    const result = await parseSSEStream(
      `${baseUrl}/api/orchestrate`,
      {
        seed,
        chapterNumber: ch,
        previousSummaries: summaries,
        previousChapterEnding,
        masterPlan,
        preset,
        options: {},
      },
      verbose ? (type, data) => {
        if (type === "stage_change") process.stdout.write(`  [${data.stage}] `);
        else if (type === "evaluation") process.stdout.write(`score=${Math.round((data.overall_score as number || 0) * 100)} `);
        else if (type === "error") warn(`  ${data.message}`);
        else if (type === "plan_update") { masterPlan = data.plan; process.stdout.write("[plan] "); }
      } : undefined,
    );

    result.chapterNumber = ch;
    chapterResults.push(result);

    if (result.summary) {
      summaries.push({
        chapter: ch,
        title: result.summary.title,
        summary: result.summary.plot_summary,
        cliffhanger: result.summary.cliffhanger,
      });
    }

    if (verbose) console.log(); // newline after stage logs
    ok(`${ch}화 완료: ${result.fullText.length}자, ${result.durationMs / 1000}초, $${result.usage.cost_usd.toFixed(4)}`);

    if (result.errors.length > 0) {
      for (const e of result.errors) warn(`  에러: ${e}`);
    }
  }

  return { seed, plots, selectedPlot, chapterResults, summaries, masterPlan };
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
  overallScore: number;
  verdict: "PASS" | "WARN" | "FAIL";
}

function validateChapter(text: string, chapterNumber: number, seed: NovelSeed): ChapterEval {
  // Rule Guard
  const sanitized = sanitize(text);
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

  // Score
  const ruleGuardPenalty = Math.max(0, 1.0 - allIssues.length * 0.1);
  const pacingScore = (pacingResult as { overall?: number })?.overall ?? 0.7;
  const styleScore = (styleResult as { overall_score?: number })?.overall_score ?? 0.7;
  const overallScore = ruleGuardPenalty * 0.3 + pacingScore * 0.35 + styleScore * 0.35;

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
    for (const issue of ev.ruleGuard.issues) {
      console.log(`    [${issue.type}] ${issue.detail}`);
    }
  }

  // Cross-chapter: continuity check
  if (chapterResults.length >= 2) {
    console.log("\n--- Cross-Chapter ---");
    const ch1End = chapterResults[0].fullText.slice(-200);
    const ch2Start = chapterResults[1].fullText.slice(0, 200);

    // Check if any character names from ch1 ending appear in ch2 opening
    const ch1Chars = seed.characters.filter((c) => ch1End.includes(c.name)).map((c) => c.name);
    const ch2Chars = seed.characters.filter((c) => ch2Start.includes(c.name)).map((c) => c.name);
    const continuity = ch1Chars.filter((c) => ch2Chars.includes(c));
    console.log(`  Ch1 ending chars: ${ch1Chars.join(", ") || "none"}`);
    console.log(`  Ch2 opening chars: ${ch2Chars.join(", ") || "none"}`);
    console.log(`  Continuity:  ${continuity.length}/${ch1Chars.length} characters carry over`);
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
