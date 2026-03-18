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
import type { NovelSeed } from "@/lib/schema/novel";
import { runPlotPipeline } from "@/lib/agents/plot-pipeline";

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
async function generateMinimalSeed(genre: string): Promise<NovelSeed> {
  console.log("📝 플롯 파이프라인으로 초기 시드 생성 중...");
  const pipelineResult = await runPlotPipeline(genre);

  if (pipelineResult.plots.length === 0) {
    throw new Error("플롯 파이프라인에서 결과를 생성하지 못했습니다.");
  }

  const plot = pipelineResult.plots[0];

  // Build chapter outlines from arc_summary
  const totalChapters = 10;
  const chapterOutlines = Array.from({ length: totalChapters }, (_, i) => ({
    chapter_number: i + 1,
    title: `${i + 1}화`,
    arc_id: "arc_1",
    one_liner: plot.arc_summary[i] ?? plot.arc_summary[plot.arc_summary.length - 1] ?? plot.logline,
    key_points: [],
    characters_involved: [],
    tension_level: Math.min(3 + i, 10),
  }));

  // Build characters with distinct voices from plot archetype info
  const characters = [];
  if (plot.male_archetype) {
    // Generate distinct voice based on archetype
    const archetype = plot.male_archetype;
    const isCold = archetype.includes("냉혹") || archetype.includes("차가운") || archetype.includes("냉정");
    const isPlayful = archetype.includes("유쾌") || archetype.includes("장난") || archetype.includes("활발");
    const isDark = archetype.includes("어둠") || archetype.includes("복수") || archetype.includes("야망");

    characters.push({
      id: "char_male_lead",
      name: plot.title.includes("의") ? plot.title.split("의")[0].slice(0, 3) : "강현",
      role: "주인공",
      introduction_chapter: 1,
      voice: {
        tone: isCold ? "짧고 건조한 말투, 존댓말 위주" : isPlayful ? "반말 섞인 가벼운 말투, 농담 잦음" : isDark ? "낮고 무거운 말투, 의미심장한 말" : "담담하지만 날카로운 말투",
        speech_patterns: isCold
          ? ["문장을 짧게 끊는다", "감정 표현을 절제한다", "존댓말을 쓰지만 차갑다"]
          : isPlayful
          ? ["반말과 존댓말을 섞는다", "비유와 농담이 많다", "말끝을 흐린다"]
          : isDark
          ? ["독백이 길다", "상대를 시험하는 질문을 한다", "의미를 숨긴 말을 한다"]
          : ["핵심만 말한다", "불필요한 수식을 안 쓴다", "판단이 빠르다"],
        sample_dialogues: isCold
          ? ["\"필요 없어.\"", "\"그건 네가 알 바 아니야.\"", "\"...좋을 대로 해.\""]
          : isPlayful
          ? ["\"야, 그러다 큰일 나. 진짜로.\"", "\"됐고, 일단 밥이나 먹자.\"", "\"하, 재밌네. 진짜 재밌어.\""]
          : isDark
          ? ["\"각오는 됐겠지.\"", "\"넌 아직 모르는 게 많아.\"", "\"...후회는 하지 마.\""]
          : ["\"상황이 이상해.\"", "\"기다려. 섣불리 움직이면 안 돼.\"", "\"내가 할게.\""],
        personality_core: archetype,
      },
      backstory: `${plot.title}의 남자 주인공 — ${archetype}`,
      arc_summary: plot.arc_summary.join(" → "),
      state: {
        level: null, location: null, status: "normal",
        relationships: {}, inventory: [], secrets_known: [],
      },
    });
  }
  if (plot.female_archetype) {
    const archetype = plot.female_archetype;
    const isStrong = archetype.includes("강인") || archetype.includes("독립") || archetype.includes("당찬");
    const isSoft = archetype.includes("상냥") || archetype.includes("순수") || archetype.includes("따뜻");
    const isCunning = archetype.includes("영리") || archetype.includes("야심") || archetype.includes("계략");

    characters.push({
      id: "char_female_lead",
      name: plot.title.length > 4 ? plot.title.slice(-2) : "서연",
      role: "히로인",
      introduction_chapter: 1,
      voice: {
        tone: isStrong ? "직설적이고 당당한 말투, 반말 비중 높음" : isSoft ? "조심스럽고 부드러운 말투, 존댓말 위주" : isCunning ? "겉은 공손하지만 속에 칼이 있는 말투" : "호기심 많고 솔직한 말투",
        speech_patterns: isStrong
          ? ["감정을 숨기지 않는다", "단정적으로 말한다", "약한 모습을 안 보이려 한다"]
          : isSoft
          ? ["말끝이 부드럽다", "상대의 기분을 먼저 생각한다", "혼잣말이 많다"]
          : isCunning
          ? ["겉과 속이 다른 대사", "상대를 떠보는 질문", "미소 뒤에 계산이 있다"]
          : ["궁금한 건 바로 묻는다", "감정 표현이 솔직하다", "엉뚱한 비유를 쓴다"],
        sample_dialogues: isStrong
          ? ["\"됐어, 내가 알아서 할게.\"", "\"그 정도로 흔들릴 거였으면 시작도 안 했어.\"", "\"...우는 거 아니거든.\""]
          : isSoft
          ? ["\"저... 괜찮으신 거예요?\"", "\"이건 제가 준비한 건데, 받아주실 수 있을까요?\"", "\"조금만 더 기다려주세요...\""]
          : isCunning
          ? ["\"어머, 그런 뜻이 아니었는데요?\"", "\"전 단지 도움을 드리고 싶었을 뿐이에요.\"", "\"...후후, 재밌는 분이시네요.\""]
          : ["\"그게 진짜야? 거짓말 같은데.\"", "\"아, 맞다! 나 아까 그거 보고 떠올랐는데─\"", "\"솔직히 말하면, 좀 무서워.\""],
        personality_core: archetype,
      },
      backstory: `${plot.title}의 여자 주인공 — ${archetype}`,
      arc_summary: plot.arc_summary.join(" → "),
      state: {
        level: null, location: null, status: "normal",
        relationships: {}, inventory: [], secrets_known: [],
      },
    });
  }

  const seed: NovelSeed = {
    title: plot.title,
    logline: plot.logline,
    total_chapters: totalChapters,
    world: {
      name: plot.title,
      genre,
      sub_genre: "",
      time_period: "",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters,
    arcs: [
      {
        id: "arc_1",
        name: "도입",
        start_chapter: 1,
        end_chapter: totalChapters,
        summary: plot.logline,
        key_events: plot.arc_summary,
        climax_chapter: Math.ceil(totalChapters * 0.8),
      },
    ],
    chapter_outlines: chapterOutlines,
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [
        "문단은 3문장 이하로",
        "대사 후 긴 지문 금지",
        "클리셰 표현 사용 가능 (장르 특성)",
        "매 회차 끝은 궁금증 유발",
      ],
    },
  };

  console.log(`✅ 시드 생성 완료: "${seed.title}"`);
  return seed;
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
    seed = await generateMinimalSeed(args.genre);
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
