// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunLongFormVerificationWorkflow = vi.fn();

vi.mock("@/lib/orchestration", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orchestration")>(
    "@/lib/orchestration",
  );

  return {
    ...actual,
    runLongFormVerificationWorkflow: mockRunLongFormVerificationWorkflow,
  };
});

describe("POST /api/verify-long-form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards scenario-backed long-form runs to the reusable verification API", async () => {
    mockRunLongFormVerificationWorkflow.mockResolvedValue({
      ok: true,
      workflow: "long_form_verification",
      runId: "verification-run-success",
      startedAt: "2026-05-06T00:00:00.000Z",
      completedAt: "2026-05-06T00:05:00.000Z",
      stageRecords: [
        {
          stage: "resolve_run_input",
          status: "completed",
          dependsOn: [],
          components: [],
        },
        {
          stage: "resolve_config",
          status: "completed",
          dependsOn: ["resolve_run_input"],
          components: [],
        },
        {
          stage: "initialize_simulation_models",
          status: "completed",
          dependsOn: ["resolve_config"],
          components: [
            "hidden_truth_model",
            "world_model",
            "belief_model",
            "event_ledger",
            "reveal_policy",
          ],
        },
        {
          stage: "verify_output",
          status: "completed",
          dependsOn: ["initialize_simulation_models"],
          components: ["verifier", "world_model", "belief_model", "event_ledger"],
        },
        {
          stage: "finalize_output",
          status: "completed",
          dependsOn: ["verify_output"],
          components: ["verifier"],
        },
      ],
      errors: [],
      payload: {
        result: {
          scenario: {
            id: "scenario-300",
            totalEpisodes: 300,
            continuityCheckpoints: [],
            expectedMismatchAttributions: [],
          },
          validationFailed: false,
          report: {
            run: {
              config: "fast",
              startedAt: "2026-05-06T00:00:00.000Z",
              completedAt: "2026-05-06T00:05:00.000Z",
              durationMs: 300000,
              totalTokens: 1200,
              totalCostUsd: 1.2,
              generatedEpisodes: 300,
              chapterVerificationPassed: true,
              finalVerificationPassed: true,
              passed: true,
            },
            canonicalValidationFailures: [],
            causalLedgerValidation: {
              issueCount: 0,
            },
          },
          acceptanceCriteria: {
            schemaVersion: "long_form_acceptance_criteria.v1",
            seedId: "seed_b04b806cc965",
            evaluatedAt: "2026-05-06T00:05:00.000Z",
            overallPassed: true,
            targetEpisodeCount: 300,
            payoffThreshold: 0.9,
            payoffWindowEpisodes: 80,
            summary: {
              passedCount: 11,
              failedCount: 0,
              totalCount: 11,
            },
            componentCoverage: {},
            criteria: [],
          },
          contradictionValidation: {
            passed: true,
            contradiction_count: 0,
            totalViolationCount: 0,
            episodeDiagnostics: [],
          },
          artifactPaths: {
            outDir: "/tmp/long-form",
            reportFile: "/tmp/long-form/validation-report.json",
            resultFile: "/tmp/long-form/result.json",
            scenarioSeedFile: "/tmp/long-form/scenario.seed.json",
            acceptanceCriteriaFile: "/tmp/long-form/ac-results.json",
          },
        },
      },
    });

    const { POST } = await import("@/app/api/verify-long-form/route");
    const response = await POST(
      new Request("http://localhost/api/verify-long-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: "fast",
          scenarioPath: "./fixtures/scenario.json",
          outDir: "./tmp/verification",
          budget: 9.5,
          verbose: false,
        }),
      }) as never,
    );

    expect(mockRunLongFormVerificationWorkflow).toHaveBeenCalledWith({
      input: {
        workflow: "long_form_verification",
        preset: "fast",
        scenarioPath: "./fixtures/scenario.json",
        outDir: "./tmp/verification",
        budgetUsd: 9.5,
        verbose: false,
      },
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      run: {
        workflow: "long_form_verification",
        ok: true,
        request: {
          input: {
            workflow: "long_form_verification",
            preset: "fast",
            scenarioPath: "./fixtures/scenario.json",
            outDir: "./tmp/verification",
            budgetUsd: 9.5,
            verbose: false,
          },
          options: {
            preset: "fast",
            outDir: "./tmp/verification",
            budgetUsd: 9.5,
            verbose: false,
          },
        },
        progress: {
          status: "completed",
          totalStageCount: 5,
          completedStageCount: 5,
          completionPercent: 100,
        },
        state: {
          workflow: "long_form_verification",
          scenario: {
            id: "scenario-300",
            totalEpisodes: 300,
          },
          verification: {
            contradictionViolationCount: 0,
            causalLedgerIssueCount: 0,
            passed: true,
          },
        },
      },
      scenario: {
        id: "scenario-300",
        totalEpisodes: 300,
      },
      validationFailed: false,
      report: {
        run: {
          passed: true,
        },
      },
      contradictionValidation: {
        passed: true,
        contradiction_count: 0,
        totalViolationCount: 0,
        episodeDiagnostics: [],
      },
    });
    expect(payload.run.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "output_directory",
        path: "/tmp/long-form",
      }),
      expect.objectContaining({
        role: "verification_report_file",
        path: "/tmp/long-form/validation-report.json",
      }),
    ]));
  });

  it("marks contradiction-bearing verification runs as failed", async () => {
    mockRunLongFormVerificationWorkflow.mockResolvedValue({
      ok: false,
      workflow: "long_form_verification",
      runId: "verification-run-failure",
      startedAt: "2026-05-06T00:00:00.000Z",
      completedAt: "2026-05-06T00:05:00.000Z",
      stageRecords: [
        {
          stage: "resolve_run_input",
          status: "completed",
          dependsOn: [],
          components: [],
        },
        {
          stage: "resolve_config",
          status: "completed",
          dependsOn: ["resolve_run_input"],
          components: [],
        },
        {
          stage: "initialize_simulation_models",
          status: "completed",
          dependsOn: ["resolve_config"],
          components: [
            "hidden_truth_model",
            "world_model",
            "belief_model",
            "event_ledger",
            "reveal_policy",
          ],
        },
        {
          stage: "verify_output",
          status: "failed",
          dependsOn: ["initialize_simulation_models"],
          components: ["verifier", "world_model", "belief_model", "event_ledger"],
        },
        {
          stage: "finalize_output",
          status: "pending",
          dependsOn: ["verify_output"],
          components: ["verifier"],
        },
      ],
      errors: [
        {
          code: "contradiction_validation_failed",
          message: "contradictions detected",
          stage: "verify_output",
          retryable: false,
        },
      ],
      payload: {
        result: {
          scenario: {
            id: "scenario-300",
            totalEpisodes: 300,
            continuityCheckpoints: [],
            expectedMismatchAttributions: [],
          },
          validationFailed: true,
          report: {
            run: {
              config: "fast",
              startedAt: "2026-05-06T00:00:00.000Z",
              completedAt: "2026-05-06T00:05:00.000Z",
              durationMs: 300000,
              totalTokens: 900,
              totalCostUsd: 0.9,
              generatedEpisodes: 300,
              chapterVerificationPassed: false,
              finalVerificationPassed: false,
              passed: false,
            },
            canonicalValidationFailures: [],
            causalLedgerValidation: {
              issueCount: 0,
            },
          },
          acceptanceCriteria: {
            schemaVersion: "long_form_acceptance_criteria.v1",
            seedId: "seed_b04b806cc965",
            evaluatedAt: "2026-05-06T00:05:00.000Z",
            overallPassed: false,
            targetEpisodeCount: 300,
            payoffThreshold: 0.9,
            payoffWindowEpisodes: 80,
            summary: {
              passedCount: 10,
              failedCount: 1,
              totalCount: 11,
            },
            componentCoverage: {},
            criteria: [],
          },
          contradictionValidation: {
            passed: false,
            contradiction_count: 2,
            totalViolationCount: 2,
            episodeDiagnostics: [],
          },
          artifactPaths: {
            outDir: "/tmp/long-form",
            reportFile: "/tmp/long-form/validation-report.json",
            resultFile: "/tmp/long-form/result.json",
            scenarioSeedFile: "/tmp/long-form/scenario.seed.json",
            acceptanceCriteriaFile: "/tmp/long-form/ac-results.json",
          },
        },
      },
    });

    const { POST } = await import("@/app/api/verify-long-form/route");
    const response = await POST(
      new Request("http://localhost/api/verify-long-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: "fast",
          scenarioPath: "./fixtures/scenario.json",
        }),
      }) as never,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      run: {
        workflow: "long_form_verification",
        ok: false,
        progress: {
          status: "failed",
          failedStageCount: 1,
          currentStage: "verify_output",
        },
        state: {
          workflow: "long_form_verification",
          verification: {
            contradictionViolationCount: 2,
            passed: false,
          },
        },
      },
      validationFailed: true,
      report: {
        run: {
          passed: false,
        },
      },
      contradictionValidation: {
        contradiction_count: 2,
      },
    });
  });
});
