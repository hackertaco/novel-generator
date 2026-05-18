#!/usr/bin/env tsx

import { fileURLToPath } from "url";
import * as path from "path";

import {
  isLongFormVerificationValidationFailed,
  runLongFormVerification,
  type LongFormVerificationExecutionResult,
  type LongFormVerificationIo,
} from "../src/lib/harness";
import {
  runLongFormVerificationWorkflow,
  type LongFormVerificationRunInput,
} from "../src/lib/orchestration";

export interface LongFormVerificationCliOptions {
  preset: string;
  outDir: string;
  budget: number | null;
  scenarioPath?: string;
  verbose: boolean;
}

export interface RunLongFormVerificationCliOptions {
  args?: string[];
  io?: LongFormVerificationIo;
  runVerification?: typeof runLongFormVerification;
}

function parseArgs(
  args: string[] = process.argv.slice(2),
): LongFormVerificationCliOptions {
  let preset = "default";
  let outDir = "./output/long-form-validation";
  let budget: number | null = null;
  let scenarioPath: string | undefined;
  let verbose = true;

  for (let index = 0; index < args.length; index += 1) {
    switch (args[index]) {
      case "--preset":
        preset = args[++index] ?? preset;
        break;
      case "--out":
        outDir = args[++index] ?? outDir;
        break;
      case "--budget":
        budget = Number(args[++index]);
        break;
      case "--scenario":
        scenarioPath = args[++index] ?? scenarioPath;
        break;
      case "--quiet":
        verbose = false;
        break;
      case "--verbose":
        verbose = true;
        break;
    }
  }

  return {
    preset,
    outDir,
    budget,
    scenarioPath,
    verbose,
  };
}

export async function runLongFormVerificationCli(
  options: RunLongFormVerificationCliOptions = {},
): Promise<LongFormVerificationExecutionResult> {
  const parsed = parseArgs(options.args);
  const runVerification = options.runVerification ?? runLongFormVerification;
  const workflowInput: LongFormVerificationRunInput = {
    workflow: "long_form_verification",
    preset: parsed.preset,
    outDir: parsed.outDir,
    budgetUsd: parsed.budget,
    scenarioPath: parsed.scenarioPath,
    verbose: parsed.verbose,
  };
  const workflowResult = await runLongFormVerificationWorkflow({
    input: workflowInput,
    runVerification: (workflowOptions) => runVerification({
      ...workflowOptions,
      budget: workflowOptions?.budget,
      io: options.io,
    }),
  });

  if (!workflowResult.payload) {
    throw new Error(
      workflowResult.errors[0]?.message
      ?? "Long-form verification workflow completed without a result payload.",
    );
  }

  if (!workflowResult.payload.result) {
    throw new Error(
      workflowResult.errors[0]?.message
      ?? "Long-form verification workflow completed without a verification result.",
    );
  }

  return workflowResult.payload.result;
}

export function getLongFormVerificationCliExitCode(
  result: Pick<
    LongFormVerificationExecutionResult,
    "report" | "contradictionValidation"
  >,
): number {
  return isLongFormVerificationValidationFailed(result) ? 1 : 0;
}

async function main(): Promise<void> {
  const result = await runLongFormVerificationCli();
  process.exitCode = getLongFormVerificationCliExitCode(result);
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedFile === currentFile) {
  void main();
}
