import type {
  LongFormVerificationExecutionResult,
  RunLongFormVerificationOptions,
} from "@/lib/harness";

export interface LongFormVerificationParityScenario {
  name: string;
  preset: string;
  budgetUsd: number | null;
  scenarioPath: string;
}

export interface LongFormVerificationExpectedOutcome {
  scenarioId: string;
  totalEpisodes: number;
  generatedEpisodes: number;
  contradictionCount: number;
  passed: boolean;
}

export function createLongFormVerificationParityScenario(): LongFormVerificationParityScenario {
  return {
    name: "long_form_verification_standard",
    preset: "fast",
    budgetUsd: 9.5,
    scenarioPath: "./fixtures/long-form-scenario.json",
  };
}

export function createLongFormVerificationExpectedOutcome(): LongFormVerificationExpectedOutcome {
  return {
    scenarioId: "scenario-300-parity",
    totalEpisodes: 300,
    generatedEpisodes: 300,
    contradictionCount: 0,
    passed: true,
  };
}

export function createLongFormVerificationParityRunner(
  expected = createLongFormVerificationExpectedOutcome(),
) {
  return async function runVerification(
    options?: RunLongFormVerificationOptions,
  ): Promise<LongFormVerificationExecutionResult> {
    const outDir = options?.outDir ?? "./output/long-form-validation";

    return {
      scenario: {
        id: expected.scenarioId,
        totalEpisodes: expected.totalEpisodes,
        continuityCheckpoints: [],
        expectedMismatchAttributions: [],
      } as never,
      validationFailed: !expected.passed,
      report: {
        run: {
          config: options?.preset ?? "default",
          preset: options?.preset ?? "default",
          startedAt: "2026-05-06T00:00:00.000Z",
          completedAt: "2026-05-06T00:05:00.000Z",
          durationMs: 300000,
          totalTokens: 1200,
          totalCostUsd: 1.2,
          generatedEpisodes: expected.generatedEpisodes,
          chapterVerificationPassed: expected.passed,
          finalVerificationPassed: expected.passed,
          canonicalValidationPassed: expected.passed,
          causalLedgerValidationPassed: expected.passed,
          contradictionValidationPassed: expected.passed,
          passed: expected.passed,
        },
        canonicalValidationFailures: [],
        causalLedgerValidation: {
          passed: expected.passed,
          issueCount: 0,
          issues: [],
          summary: "ok",
        },
      } as never,
      acceptanceCriteria: {
        schemaVersion: "long_form_acceptance_criteria.v1",
        seedId: "seed_b04b806cc965",
        evaluatedAt: "2026-05-06T00:00:00.000Z",
        overallPassed: expected.passed,
        targetEpisodeCount: 300,
        payoffThreshold: 0.9,
        payoffWindowEpisodes: 80,
        summary: {
          passedCount: expected.passed ? 11 : 10,
          failedCount: expected.passed ? 0 : 1,
          totalCount: 11,
        },
        componentCoverage: {},
        criteria: [],
      },
      contradictionValidation: {
        passed: expected.passed,
        contradiction_count: expected.contradictionCount,
        totalViolationCount: expected.contradictionCount,
        counts: {
          belief: 0,
          memory: 0,
          utterance: 0,
          continuity: 0,
        },
        beliefViolations: [],
        memoryViolations: [],
        utteranceViolations: [],
        continuityViolations: [],
        episodeDiagnostics: [],
      } as never,
      artifactPaths: {
        outDir,
        reportFile: `${outDir}/validation-report.json`,
        resultFile: `${outDir}/result.json`,
        scenarioSeedFile: `${outDir}/scenario.seed.json`,
        acceptanceCriteriaFile: `${outDir}/ac-results.json`,
      },
    } as never;
  };
}
