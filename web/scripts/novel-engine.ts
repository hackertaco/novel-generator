#!/usr/bin/env tsx

import * as path from "path";
import { fileURLToPath } from "url";

import type { LongFormVerificationExecutionResult } from "../src/lib/harness";
import {
  getLongFormVerificationCliExitCode,
  runLongFormVerificationCli,
  type RunLongFormVerificationCliOptions,
} from "./verify-long-form";
import {
  handleGenerateCliFailure,
  runGenerateCli,
  type GenerateCliIo,
  type RunGenerateCliOptions,
} from "./generate";

export type NovelEngineCliCommand = "generate" | "verify-long-form";

export interface RunNovelEngineCliOptions {
  args?: string[];
  io?: GenerateCliIo;
  runGenerate?: (options?: RunGenerateCliOptions) => Promise<void>;
  runVerify?: (
    options?: RunLongFormVerificationCliOptions,
  ) => Promise<LongFormVerificationExecutionResult>;
}

export interface NovelEngineCliExecution {
  command: NovelEngineCliCommand;
  verificationResult?: LongFormVerificationExecutionResult;
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/novel-engine.ts generate [generate options]",
    "  npx tsx scripts/novel-engine.ts verify-long-form [verify options]",
    "",
    "When no subcommand is provided, the CLI defaults to generate mode.",
  ].join("\n");
}

function parseNovelEngineCommand(
  args: string[] = process.argv.slice(2),
): {
  command: NovelEngineCliCommand;
  commandArgs: string[];
} {
  const [first, ...rest] = args;

  if (!first || first.startsWith("--")) {
    return {
      command: "generate",
      commandArgs: args,
    };
  }

  if (first === "generate" || first === "verify-long-form") {
    return {
      command: first,
      commandArgs: rest,
    };
  }

  throw new Error(`Unknown novel-engine command: ${first}\n\n${usage()}`);
}

export async function runNovelEngineCli(
  options: RunNovelEngineCliOptions = {},
): Promise<NovelEngineCliExecution> {
  const parsed = parseNovelEngineCommand(options.args);
  const runGenerate = options.runGenerate ?? runGenerateCli;
  const runVerify = options.runVerify ?? runLongFormVerificationCli;

  if (parsed.command === "generate") {
    await runGenerate({
      args: parsed.commandArgs,
      io: options.io,
    });
    return {
      command: "generate",
    };
  }

  const verificationResult = await runVerify({
    args: parsed.commandArgs,
    io: options.io,
  });
  return {
    command: "verify-long-form",
    verificationResult,
  };
}

async function main(): Promise<void> {
  try {
    const execution = await runNovelEngineCli();
    if (execution.command === "verify-long-form" && execution.verificationResult) {
      process.exitCode = getLongFormVerificationCliExitCode(
        execution.verificationResult,
      );
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.includes("Unknown novel-engine command:")
    ) {
      console.error(error.message);
      process.exit(1);
    }

    process.exit(handleGenerateCliFailure(error));
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedFile === currentFile) {
  void main();
}
