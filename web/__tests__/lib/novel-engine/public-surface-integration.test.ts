// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  createChapterGenerationProgrammaticRunRequest,
  createLongFormVerificationProgrammaticRunRequest,
} from "@/lib/orchestration";
import {
  runNovelGeneration,
  runNovelVerification,
} from "@/lib/novel-engine";

import { runGenerateCli } from "../../../scripts/generate";
import { runNovelEngineCli } from "../../../scripts/novel-engine";
import {
  createParityHarnessConfig,
  createChapterGenerationExpectedOutcome,
  createStandardParityScenario,
  ParityPassingHarness,
} from "../../helpers/chapter-generation-parity";
import {
  createLongFormVerificationExpectedOutcome,
  createLongFormVerificationParityRunner,
  createLongFormVerificationParityScenario,
} from "../../helpers/long-form-verification-parity";

function readGeneratedChapterArtifacts(outDir: string, chapterNumber: number) {
  const paddedChapter = String(chapterNumber).padStart(3, "0");

  return {
    text: fs.readFileSync(
      path.join(outDir, "chapters", `chapter-${paddedChapter}.txt`),
      "utf-8",
    ),
    summary: JSON.parse(
      fs.readFileSync(
        path.join(outDir, "summaries", `chapter-${paddedChapter}.summary.json`),
        "utf-8",
      ),
    ) as {
      title: string;
      plot_summary: string;
      ending_scene_state: {
        unresolved_tension: string;
      };
    },
  };
}

describe("novel-engine public surface integration", () => {
  it("drives equivalent chapter generation outcomes through the top-level CLI and library API", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "novel-engine-surface-generate-"),
    );
    const scenario = createStandardParityScenario();
    const expected = createChapterGenerationExpectedOutcome(false);
    const seedPath = path.join(tempDir, "seed.json");
    const cliOutDir = path.join(tempDir, "cli-out");
    const libraryOutDir = path.join(tempDir, "library-out");

    fs.writeFileSync(seedPath, JSON.stringify(scenario.seed, null, 2), "utf-8");

    const cliExecution = await runNovelEngineCli({
      args: [
        "generate",
        "--seed",
        seedPath,
        "--chapters",
        String(scenario.chapterNumber),
        "--out",
        cliOutDir,
        "--quiet",
      ],
      runGenerate: (options) => runGenerateCli({
        ...options,
        createHarness: () => new ParityPassingHarness() as never,
        resolveConfig: () => createParityHarnessConfig(),
      }),
    });

    const libraryRequest = createChapterGenerationProgrammaticRunRequest({
      input: {
        workflow: "chapter_generation",
        seed: scenario.seed,
        startChapter: scenario.startChapter,
        endChapter: scenario.endChapter,
        preset: scenario.preset,
        budgetUsd: scenario.budgetUsd,
      },
      preset: scenario.preset,
      outDir: libraryOutDir,
      verbose: false,
    });
    const libraryResult = await runNovelGeneration({
      request: libraryRequest,
      createHarness: () => new ParityPassingHarness() as never,
      resolveConfig: () => createParityHarnessConfig(),
    });

    const cliArtifacts = readGeneratedChapterArtifacts(
      cliOutDir,
      scenario.chapterNumber,
    );
    const programmaticArtifacts = readGeneratedChapterArtifacts(
      libraryOutDir,
      scenario.chapterNumber,
    );

    expect(cliExecution.command).toBe("generate");
    expect(libraryResult.contract.ok).toBe(true);
    expect(cliArtifacts).toMatchObject({
      text: expected.text,
      summary: {
        title: `${scenario.chapterNumber}화`,
        plot_summary: expected.plotSummary,
        ending_scene_state: {
          unresolved_tension: expected.unresolvedTension,
        },
      },
    });
    expect(programmaticArtifacts).toEqual(cliArtifacts);
  });

  it("drives equivalent long-form verification outcomes through the top-level CLI and library API", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "novel-engine-surface-verify-"),
    );
    const scenario = createLongFormVerificationParityScenario();
    const expected = createLongFormVerificationExpectedOutcome();
    const cliOutDir = path.join(tempDir, "cli-out");
    const libraryOutDir = path.join(tempDir, "library-out");
    const runVerification = createLongFormVerificationParityRunner(expected);

    const cliExecution = await runNovelEngineCli({
      args: [
        "verify-long-form",
        "--preset",
        scenario.preset,
        "--out",
        cliOutDir,
        "--budget",
        String(scenario.budgetUsd),
        "--scenario",
        scenario.scenarioPath,
        "--quiet",
      ],
      runVerify: (options) => runVerification({
        preset: scenario.preset,
        outDir: cliOutDir,
        budget: scenario.budgetUsd,
        scenarioPath: scenario.scenarioPath,
        verbose: false,
        io: options?.io,
      }),
    });

    const libraryResult = await runNovelVerification({
      request: createLongFormVerificationProgrammaticRunRequest({
        input: {
          workflow: "long_form_verification",
          preset: scenario.preset,
          outDir: libraryOutDir,
          budgetUsd: scenario.budgetUsd,
          scenarioPath: scenario.scenarioPath,
          verbose: false,
        },
      }),
      runVerification,
    });

    expect(cliExecution.command).toBe("verify-long-form");
    expect(cliExecution.verificationResult).toBeDefined();
    expect(cliExecution.verificationResult?.scenario).toMatchObject({
      id: expected.scenarioId,
      totalEpisodes: expected.totalEpisodes,
    });
    expect(cliExecution.verificationResult?.report.run).toMatchObject({
      generatedEpisodes: expected.generatedEpisodes,
      passed: expected.passed,
    });
    expect(cliExecution.verificationResult?.contradictionValidation).toMatchObject({
      contradiction_count: expected.contradictionCount,
      passed: expected.passed,
    });
    expect(libraryResult.contract.request).toMatchObject({
      input: {
        workflow: "long_form_verification",
        preset: scenario.preset,
        outDir: libraryOutDir,
        budgetUsd: scenario.budgetUsd,
        scenarioPath: scenario.scenarioPath,
        verbose: false,
      },
    });
    expect(libraryResult.contract.state.scenario).toMatchObject({
      id: expected.scenarioId,
      totalEpisodes: expected.totalEpisodes,
    });
    expect(libraryResult.contract.state.verification).toMatchObject({
      contradictionViolationCount: expected.contradictionCount,
      passed: expected.passed,
    });
    expect(libraryResult.contract.result.report.run).toMatchObject({
      generatedEpisodes: expected.generatedEpisodes,
      passed: expected.passed,
    });
  });
});
