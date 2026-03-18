#!/usr/bin/env npx tsx
/**
 * AutoResearch CLI — 커맨드라인에서 AutoResearch 루프를 실행합니다.
 *
 * Usage:
 *   npx tsx scripts/auto-research.ts [options]
 *
 * Options:
 *   --genre <genre>        장르 (기본: "로맨스 판타지")
 *   --iterations <n>       반복 횟수 (기본: 10)
 *   --budget <usd>         예산 USD (기본: 1.0)
 *   --model <model>        모델 오버라이드 (선택)
 *   --seed-file <path>     NovelSeed JSON 파일 경로 (선택)
 *   --help                 도움말 표시
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Load .env.local manually (no dotenv dependency)
// ---------------------------------------------------------------------------
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Only set if not already defined (real env takes precedence)
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const projectRoot = path.resolve(
  typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : path.dirname(new URL(import.meta.url).pathname),
  "..",
);
loadEnvFile(path.join(projectRoot, ".env.local"));
loadEnvFile(path.join(projectRoot, ".env"));

// ---------------------------------------------------------------------------
// Imports (after env is loaded so API keys are available)
// ---------------------------------------------------------------------------
import { runAutoResearchLoop, type LoopRunnerConfig } from "@/lib/evolution/loop-runner";
import { saveExperimentLog, printExperimentSummary } from "@/lib/evolution/experiment-logger";
import { generateRichSeed } from "@/lib/evolution/seed-generator";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): {
  genre: string;
  iterations: number;
  budget: number;
  model?: string;
  judgeModel?: string;
  seedFile?: string;
  help: boolean;
} {
  const args = {
    genre: "로맨스 판타지",
    iterations: 10,
    budget: 1.0,
    model: undefined as string | undefined,
    judgeModel: undefined as string | undefined,
    seedFile: undefined as string | undefined,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--genre":
        args.genre = argv[++i] ?? args.genre;
        break;
      case "--iterations":
        args.iterations = parseInt(argv[++i] ?? "10", 10);
        break;
      case "--budget":
        args.budget = parseFloat(argv[++i] ?? "1.0");
        break;
      case "--model":
        args.model = argv[++i];
        break;
      case "--judge-model":
        args.judgeModel = argv[++i];
        break;
      case "--seed-file":
        args.seedFile = argv[++i];
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        console.error(`알 수 없는 옵션: ${arg}`);
        args.help = true;
    }
  }

  return args;
}

function printUsage(): void {
  console.log(`
사용법: npx tsx scripts/auto-research.ts [옵션]

옵션:
  --genre <genre>        장르 (기본: "로맨스 판타지")
  --iterations <n>       반복 횟수 (기본: 10)
  --budget <usd>         예산 USD (기본: 1.0)
  --model <model>        모델 오버라이드 (선택)
  --seed-file <path>     NovelSeed JSON 파일 경로 (선택)
  --help, -h             도움말 표시

예시:
  npx tsx scripts/auto-research.ts --genre "판타지" --iterations 5 --budget 0.5
  npx tsx scripts/auto-research.ts --seed-file seeds/my-novel.json
  `.trim());
}

// ---------------------------------------------------------------------------
// Seed generation
// ---------------------------------------------------------------------------
async function generateFullSeed(genre: string, model?: string): Promise<NovelSeed> {
  console.log("📝 풍부한 시드 생성 중 (5단계 파이프라인)...");
  const result = await generateRichSeed({
    genre,
    model,
    totalChapters: 200,
    onProgress: (step) => console.log(`   ${step}`),
  });
  console.log(`✅ 시드 생성 완료: "${result.seed.title}" (캐릭터 ${result.seed.characters.length}명, 아크 ${result.seed.arcs.length}개)`);
  return result.seed;
}

function loadSeedFile(filePath: string): NovelSeed {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`시드 파일을 찾을 수 없습니다: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(content) as NovelSeed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Load or generate seed
  let seed: NovelSeed;
  if (args.seedFile) {
    console.log(`📂 시드 파일 로드: ${args.seedFile}`);
    seed = loadSeedFile(args.seedFile);
  } else {
    seed = await generateFullSeed(args.genre, args.model);
  }

  // Print start banner
  const modelDisplay = args.model ?? "gpt-4o-mini";
  const judgeDisplay = args.judgeModel ? ` | 심사: ${args.judgeModel}` : "";
  console.log(`
🔬 AutoResearch Loop 시작
   장르: ${args.genre}
   반복: ${args.iterations}회 | 예산: $${args.budget.toFixed(2)}
   생성모델: ${modelDisplay}${judgeDisplay}
   ─────────────────────────
`);

  // Setup abort controller for graceful shutdown
  const abortController = new AbortController();

  let interrupted = false;
  const onSigInt = () => {
    if (interrupted) {
      console.log("\n⚠️  강제 종료합니다.");
      process.exit(1);
    }
    interrupted = true;
    console.log("\n⚠️  중단 요청됨. 현재 반복 완료 후 종료합니다...");
    abortController.abort();
  };

  process.on("SIGINT", onSigInt);

  try {
    // Run the loop
    const config: LoopRunnerConfig = {
      seed,
      genre: args.genre,
      maxIterations: args.iterations,
      budgetUsd: args.budget,
      model: args.model,
      judgeModel: args.judgeModel,
      signal: abortController.signal,
      onProgress: (event) => {
        const prefix = `[${event.iteration}/${args.iterations}]`;
        switch (event.phase) {
          case "generate":
            console.log(`${prefix} ⏳ ${event.message}`);
            break;
          case "evaluate":
            if (event.score) {
              console.log(`${prefix} 📊 ${event.message}`);
            } else {
              console.log(`${prefix} 📊 ${event.message}`);
            }
            break;
          case "modify":
            console.log(`${prefix} 🔧 ${event.message}`);
            break;
          case "apply":
            console.log(`${prefix} 🔧 ${event.message}`);
            break;
          case "compare":
            if (event.message.includes("개선")) {
              console.log(`${prefix} ✅ ${event.message}`);
            } else if (event.message.includes("악화")) {
              console.log(`${prefix} ❌ ${event.message}`);
            } else {
              console.log(`${prefix} ℹ️  ${event.message}`);
            }
            break;
        }
      },
    };

    const result = await runAutoResearchLoop(config);

    // Save experiment log
    const log = saveExperimentLog(args.genre, {
      maxIterations: args.iterations,
      budgetUsd: args.budget,
      model: args.model,
      testChapter: 1,
    }, result);

    // Print summary
    console.log("");
    console.log(printExperimentSummary(log));
    console.log("");
    console.log(`📁 로그 저장됨: .auto-research/${log.runId}.json`);

    process.exit(0);
  } catch (error) {
    if (error instanceof Error && error.message.includes("aborted")) {
      console.log("\n🛑 AutoResearch 루프가 중단되었습니다.");
      process.exit(0);
    }
    throw error;
  } finally {
    process.off("SIGINT", onSigInt);
  }
}

main().catch((error) => {
  console.error("\n❌ AutoResearch 실행 실패:");
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
