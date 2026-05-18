// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { runChapterGenerationPipeline } from "@/lib/cli/pipeline-run";
import { assertChapterGenerationReleaseParity } from "@/lib/novel-engine";
import {
  createChapterGenerationProgrammaticRunRequest,
} from "@/lib/orchestration";
import { runNovelGeneration } from "@/lib/novel-engine";
import {
  createParityHarnessConfig,
  createStandardParityScenario,
  ParityPassingHarness,
} from "../../helpers/chapter-generation-parity";

describe("novel-engine library entrypoint", () => {
  it("matches the CLI artifact contract for equivalent inputs", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "novel-engine-library-"));
    const libraryOutDir = path.join(tempDir, "library-out");
    const cliOutDir = path.join(tempDir, "cli-out");
    const scenario = createStandardParityScenario();
    const request = createChapterGenerationProgrammaticRunRequest({
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
      request,
      createHarness: () => new ParityPassingHarness() as never,
      resolveConfig: () => createParityHarnessConfig(),
    });
    const seedPath = path.join(tempDir, "seed.json");
    fs.writeFileSync(seedPath, JSON.stringify(scenario.seed, null, 2), "utf-8");

    const cliResult = await runChapterGenerationPipeline({
      args: [
        "--seed",
        seedPath,
        "--chapters",
        String(scenario.chapterNumber),
        "--out",
        cliOutDir,
        "--quiet",
      ],
      cwd: tempDir,
      createHarness: () => new ParityPassingHarness() as never,
      resolveConfig: () => createParityHarnessConfig(),
    });

    expect(libraryResult.request).toEqual(request);
    expect(libraryResult.execution.workflowResult.ok).toBe(true);
    expect(libraryResult.contract.ok).toBe(true);
    expect(libraryResult.contract.request.input).toMatchObject({
      workflow: "chapter_generation",
      startChapter: scenario.startChapter,
      endChapter: scenario.endChapter,
    });
    const releaseValidation = assertChapterGenerationReleaseParity([
      {
        surface: "cli",
        contract: cliResult.contract,
      },
      {
        surface: "library",
        contract: libraryResult.contract,
      },
    ]);
    expect(releaseValidation.ok).toBe(true);
    expect(libraryResult.execution.artifactBundle).toMatchObject({
      workflow: "chapter_generation",
      outDir: libraryOutDir,
      resultFile: {
        relativePath: "result.json",
        serialization: "json_pretty",
      },
      runMetadataFile: {
        relativePath: path.join("metadata", "run-metadata.json"),
        serialization: "json_pretty",
      },
      artifactManifestFile: {
        relativePath: path.join("metadata", "artifact-manifest.json"),
      },
      chapterTexts: [
        expect.objectContaining({
          relativePath: path.join(
            "chapters",
            `chapter-${String(scenario.chapterNumber).padStart(3, "0")}.txt`,
          ),
          serialization: "utf8_text",
          value: "Parity runner smoke chapter.",
        }),
      ],
      chapterSummaries: [
        expect.objectContaining({
          relativePath: path.join(
            "summaries",
            `chapter-${String(scenario.chapterNumber).padStart(3, "0")}.summary.json`,
          ),
          serialization: "json_pretty",
        }),
      ],
    });
  });
});
