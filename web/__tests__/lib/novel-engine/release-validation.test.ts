// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { runChapterGenerationPipeline } from "@/lib/cli/pipeline-run";
import {
  assertChapterGenerationReleaseParity,
  runNovelGeneration,
} from "@/lib/novel-engine";
import { createChapterGenerationProgrammaticRunRequest } from "@/lib/orchestration";
import type { ChapterGenerationProgrammaticRunResponse } from "@/lib/orchestration";
import {
  buildApiBodyForParityScenario,
  createParityHarnessConfig,
  createParityHarnessMockImplementation,
  createRendererRegenerationParityScenario,
  createStandardParityScenario,
  ParityPassingHarness,
  type ChapterGenerationParityScenario,
} from "../../helpers/chapter-generation-parity";

const mockRun = vi.fn();

vi.mock("@/lib/harness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/harness")>(
    "@/lib/harness",
  );

  class MockNovelHarness {
    run = mockRun;
  }

  return {
    ...actual,
    NovelHarness: MockNovelHarness,
    getDefaultConfig: vi.fn().mockReturnValue({}),
    getBudgetConfig: vi.fn().mockReturnValue({}),
    getFastConfig: vi.fn().mockReturnValue({}),
  };
});

async function callRoute(body: unknown) {
  const { POST } = await import("@/app/api/orchestrate/route");
  const request = new Request("http://localhost/api/orchestrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await POST(request as never);
  return { response, text: await response.text() };
}

function parseSsePayloads(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => chunk.slice("data: ".length))
    .filter((chunk) => chunk.length > 0 && chunk !== "[DONE]")
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

async function runReleaseValidationScenario(
  scenario: ChapterGenerationParityScenario,
) {
  mockRun.mockImplementationOnce(createParityHarnessMockImplementation());
  const harnessModule = await import("@/lib/harness");
  vi.mocked(harnessModule.getDefaultConfig).mockReturnValue(
    createParityHarnessConfig(),
  );

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `release-validation-${scenario.name}-`),
  );
  const seedPath = path.join(tempDir, "seed.json");
  const rendererRequestPath = path.join(
    tempDir,
    "renderer-regeneration-request.json",
  );
  const cliOutDir = path.join(tempDir, "cli-out");
  const libraryOutDir = path.join(tempDir, "library-out");
  const apiOutDir = path.join(tempDir, "api-out");

  fs.writeFileSync(seedPath, JSON.stringify(scenario.seed, null, 2), "utf-8");

  const cliArgs = [
    "--seed",
    seedPath,
    "--chapters",
    String(scenario.chapterNumber),
    "--out",
    cliOutDir,
    "--quiet",
  ];

  if (scenario.rendererRegeneration) {
    fs.writeFileSync(
      rendererRequestPath,
      JSON.stringify(scenario.rendererRegeneration, null, 2),
      "utf-8",
    );
    cliArgs.push(
      "--renderer-regeneration-request",
      rendererRequestPath,
    );
  }

  const cliResult = await runChapterGenerationPipeline({
    args: cliArgs,
    cwd: tempDir,
    createHarness: () => new ParityPassingHarness() as never,
    resolveConfig: () => createParityHarnessConfig(),
  });

  const request = createChapterGenerationProgrammaticRunRequest({
    input: {
      workflow: "chapter_generation",
      seed: scenario.seed,
      startChapter: scenario.startChapter,
      endChapter: scenario.endChapter,
      preset: scenario.preset,
      budgetUsd: scenario.budgetUsd,
      rendererRegeneration: scenario.rendererRegeneration,
    },
    preset: scenario.preset,
    outDir: libraryOutDir,
    verbose: false,
    budgetUsd: scenario.budgetUsd,
  });

  const libraryResult = await runNovelGeneration({
    request,
    createHarness: () => new ParityPassingHarness() as never,
    resolveConfig: () => createParityHarnessConfig(),
  });

  const { response, text } = await callRoute(
    buildApiBodyForParityScenario(scenario, apiOutDir),
  );
  expect(response.status).toBe(200);

  const events = parseSsePayloads(text);
  const doneEvent = events.find((event) => event.type === "harness_done") as
    | { run: ChapterGenerationProgrammaticRunResponse }
    | undefined;
  expect(doneEvent).toBeDefined();

  return {
    cli: cliResult.contract,
    library: libraryResult.contract,
    api: doneEvent!.run,
  };
}

describe("chapter-generation release validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    createStandardParityScenario(),
    createRendererRegenerationParityScenario(),
  ])(
    "keeps CLI, library, and API contracts in parity for $name",
    async (scenario) => {
      const surfaces = await runReleaseValidationScenario(scenario);

      const report = assertChapterGenerationReleaseParity([
        {
          surface: "cli",
          contract: surfaces.cli,
        },
        {
          surface: "library",
          contract: surfaces.library,
        },
        {
          surface: "api",
          contract: surfaces.api,
        },
      ]);

      expect(report.ok).toBe(true);
      expect(report.invariantViolations).toHaveLength(0);
      expect(report.parityMismatches).toHaveLength(0);
    },
  );
});
