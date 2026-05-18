// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  type HarnessConfig,
  LongFormVerificationReportSchema,
  runLongFormVerification,
} from "@/lib/harness";
import {
  buildSimulationCausalLedger,
  CharacterMismatchCausationLedgerSchema,
  createDeterministicLongFormValidationScenario,
  createSimulationValidationVerdict,
  SimulationCausalLedgerAggregationSchema,
  type CharacterClaimMismatchRecord,
  type SimulationEvent,
} from "@/lib/sim";

import {
  getLongFormVerificationCliExitCode,
  runLongFormVerificationCli,
} from "../../scripts/verify-long-form";

function createHarnessConfig(): HarnessConfig {
  return {
    name: "test",
    models: {
      planning: "test",
      writing: "test",
      critique: "test",
      repair: "test",
      default: "test",
    },
    pipeline: [],
    qualityThreshold: 0.8,
    maxAttempts: 1,
    budgetUsd: null,
    evalDimensions: [],
    tracking: {
      memory: false,
      characters: false,
      threads: false,
      tone: false,
      progress: false,
      feedback: false,
    },
    output: { mode: "file", verbose: false },
    chapterLength: { min: 1, max: 1 },
    fastMode: false,
    parallelMode: false,
    simpleMode: false,
  };
}

function createPassingChapterResult(chapterNumber: number) {
  return {
    chapterNumber,
    text: `chapter ${chapterNumber}`,
    summary: {
      title: `${chapterNumber}화`,
      plot_summary: `장편 검증용 ${chapterNumber}화`,
      ending_scene_state: {
        location: "회랑",
        time_of_day: "night",
        characters_present: ["haeon"],
        ongoing_action: "장기 검증을 계속한다",
        unresolved_tension: "300화 동안 인과성이 유지되는가",
      },
    } as never,
    score: 0.91,
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      cost_usd: 0.01,
    },
    durationMs: 10,
    verification: createSimulationValidationVerdict({
      passed: true,
      checkedMemories: 0,
      checkedBeliefs: 0,
      checkedUtterances: 0,
      issues: [],
      mismatches: [],
      objectiveStateChecks: [],
    }),
  };
}

function createAllowedMismatch(chapter: number): CharacterClaimMismatchRecord {
  return {
    recordType: "belief",
    characterId: "haeon",
    recordId: "belief:eclipse-saboteur",
    chapter,
    claim: "해온은 태율이 일식전 오작동을 유도했다고 단정한다.",
    mismatchType: "canonical_conflict",
    causation: {
      mismatchType: "canonical_conflict",
      causeStatus: "recorded",
      provenance: {
        causeId: "cause:bias:eclipse-saboteur",
        causeType: "bias",
        sourceEpisode: 247,
        sourceEventId: "evt_247",
      },
      explicitCause: {
        kind: "bias",
        summary: "해온은 섭정이 남긴 조작된 기록에 강하게 끌린다.",
        sourceEventId: "evt_247",
        sourceCharacterId: "haeon",
      },
      sourceEvent: {
        eventId: "evt_247",
        chapter: 247,
      },
      affectedEntity: {
        recordType: "belief",
        recordId: "belief:eclipse-saboteur",
        characterId: "haeon",
      },
      triggeringEvent: {
        eventId: "evt_trigger_247",
        chapter: 247,
        sourceActorId: "haeon",
      },
      contradictedFact: {
        factId: "fact:eclipse-saboteur",
        chapter: 247,
        sourceEventId: "evt_247",
      },
      introduction: {
        chapter: 247,
        eventId: "evt_trigger_247",
      },
      episodeSpan: {
        startChapter: 247,
        endChapter: chapter,
        chapterCount: (chapter - 247) + 1,
      },
    },
    validityStatus: "valid",
    explanation: "Allowed mismatch: bias-driven belief remains traceable to a recorded cause.",
    canonicalTruths: [],
    ruleOutcome: {
      status: "valid",
      requiredDimensions: ["inferred"],
      satisfiedDimensions: ["inferred"],
      missingDimensions: [],
      traceabilityStatus: "supported",
      traceabilityAnchors: ["fact:eclipse-saboteur"],
      unresolvedTraceabilityReferences: [],
      trace: [
        {
          dimension: "inferred",
          status: "supported",
          evidence: ["bias-linked belief update"],
        },
      ],
      summary: "Bias provides an explicit, supported cause for the contradiction.",
    },
    evidence: {
      objectiveFactIds: ["fact:eclipse-saboteur"],
      memoryIds: [],
      utteranceIds: [],
      traceabilityAnchors: ["fact:eclipse-saboteur"],
      unresolvedTraceabilityReferences: [],
    },
    issueCodes: [],
  };
}

function buildRunEvent(episode: number): SimulationEvent {
  const previousEpisode = episode - 1;

  return {
    id: `evt_${String(episode).padStart(3, "0")}`,
    chapter: episode,
    episode,
    type: "learn_fact",
    actorId: "haeon",
    summary: `Episode ${episode} records a new causal beat.`,
    prerequisites: previousEpisode > 0
      ? [
          {
            prerequisiteId: `prior-event:evt_${String(previousEpisode).padStart(3, "0")}`,
            type: "event",
            description: "The previous episode's discovery must already exist.",
            eventId: `evt_${String(previousEpisode).padStart(3, "0")}`,
          },
          {
            prerequisiteId: `carry-state:${previousEpisode}`,
            type: "scene_state",
            description: "The archive-route state carries forward.",
            stateKey: "scene:archive-route:known",
          },
        ]
      : [],
    involvedEntities: [],
    outcomes: episode % 3 === 0
      ? [{
          outcomeId: `evt_${String(episode).padStart(3, "0")}:knowledge`,
          type: "knowledge_revealed",
          summary: "The archive route becomes actionable.",
        }]
      : [],
    stateChanges: [{
      changeId: `evt_${String(episode).padStart(3, "0")}:scene-state`,
      domain: "world_model",
      operation: "update",
      stateKey: "scene:archive-route:known",
      summary: "Carry the archive route state into later episodes.",
    }],
    tags: ["long-form-cli-test"],
    payload: {
      subject: `archive clue ${episode}`,
      object: `route status ${episode}`,
    },
  };
}

describe("verify-long-form CLI", () => {
  it("forwards the fixed long-form runner arguments to the reusable API", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const stubResult = {
      scenario: {
        id: "scenario-300",
        totalEpisodes: 300,
      },
      contradictionValidation: {
        contradiction_count: 0,
      },
      report: {
        run: {
          passed: true,
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
      validationFailed: false,
      artifactPaths: {
        reportFile: "/tmp/verification/validation-report.json",
        acceptanceCriteriaFile: "/tmp/verification/ac-results.json",
      },
    } as never;

    const result = await runLongFormVerificationCli({
      args: [
        "--preset",
        "fast",
        "--out",
        "./tmp/verification",
        "--budget",
        "12.5",
        "--scenario",
        "./fixtures/scenario.json",
        "--quiet",
      ],
      runVerification: async (options) => {
        calls.push(options as Record<string, unknown>);
        return stubResult;
      },
    });

    expect(result).toBe(stubResult);
    expect(calls).toEqual([
      expect.objectContaining({
        preset: "fast",
        outDir: "./tmp/verification",
        budget: 12.5,
        scenarioPath: "./fixtures/scenario.json",
        verbose: false,
      }),
    ]);
  });

  it("executes a representative 300-episode validation run and writes ledger plus contradiction artifacts", async () => {
    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "verify-long-form-cli-300-"),
    );
    const scenarioPath = path.join(outDir, "scenario.json");
    const scenario = createDeterministicLongFormValidationScenario();
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2), "utf-8");

    const chapters = Array.from(
      { length: scenario.totalEpisodes },
      (_, index) => {
        const chapterNumber = index + 1;
        const chapter = createPassingChapterResult(chapterNumber);

        if (chapterNumber === 247 || chapterNumber === 248) {
          return {
            ...chapter,
            verification: createSimulationValidationVerdict({
              passed: true,
              checkedMemories: 0,
              checkedBeliefs: 1,
              checkedUtterances: 0,
              issues: [],
              mismatches: [createAllowedMismatch(chapterNumber)],
              objectiveStateChecks: [],
            }),
          };
        }

        return chapter;
      },
    );
    const causalLedger = buildSimulationCausalLedger(
      Array.from({ length: scenario.totalEpisodes }, (_, index) =>
        buildRunEvent(index + 1)
      ),
    );
    const calls: Array<Record<string, unknown>> = [];

    const result = await runLongFormVerificationCli({
      args: [
        "--preset",
        "fast",
        "--scenario",
        scenarioPath,
        "--out",
        outDir,
        "--quiet",
      ],
      io: {
        log: () => {},
        error: () => {},
      },
      runVerification: async (options) => {
        calls.push(options as Record<string, unknown>);

        return runLongFormVerification({
          ...options,
          createHarness: () => ({
            runToCompletion: async () => ({
              ok: true as const,
              result: {
                config: "test",
                chapters,
                totalUsage: {
                  prompt_tokens: 3000,
                  completion_tokens: 1500,
                  total_tokens: 4500,
                  cost_usd: 3,
                },
                totalDurationMs: 3000,
                totalCostUsd: 3,
                verification: chapters[chapters.length - 1]?.verification,
                canonicalValidationFailures: [],
                causalLedger,
              },
            }),
          }) as never,
          resolveConfig: () => createHarnessConfig(),
        });
      },
    });

    expect(calls).toEqual([
      expect.objectContaining({
        preset: "fast",
        outDir,
        scenarioPath,
        verbose: false,
      }),
    ]);
    expect(result.report.run).toMatchObject({
      totalEpisodes: 300,
      generatedEpisodes: 300,
      chapterCoverageComplete: true,
      causalLedgerValidationPassed: true,
      contradictionValidationPassed: true,
      passed: true,
    });

    const savedReport = LongFormVerificationReportSchema.parse(
      JSON.parse(fs.readFileSync(result.artifactPaths.reportFile, "utf-8")),
    );
    const savedResult = JSON.parse(
      fs.readFileSync(result.artifactPaths.resultFile, "utf-8"),
    ) as {
      scenario: {
        id: string;
        totalEpisodes: number;
      };
      causalLedgerAggregation: unknown;
      causalLedgerValidation: {
        passed: boolean;
        issueCount: number;
        majorPlotActionCount: number;
      };
      contradictionValidation: {
        passed: boolean;
        contradiction_count: number;
        totalViolationCount: number;
        counts: {
          belief: number;
          memory: number;
          utterance: number;
          continuity: number;
        };
        episodeDiagnostics: unknown[];
      };
      chapters: Array<{
        chapterNumber: number;
        verification?: {
          mismatchCausationLedger?: unknown;
        };
      }>;
    };
    const savedAggregation = SimulationCausalLedgerAggregationSchema.parse(
      savedResult.causalLedgerAggregation,
    );
    const emittedMismatchRecords = savedResult.chapters.flatMap((chapter) => {
      if (!chapter.verification?.mismatchCausationLedger) {
        return [];
      }

      return CharacterMismatchCausationLedgerSchema.parse(
        chapter.verification.mismatchCausationLedger,
      ).records;
    });
    const invalidExplicitCauseRecords = emittedMismatchRecords.filter((record) =>
      record.causeStatus !== "recorded"
      || !record.explicitCause
      || Boolean(record.validationFailure)
      || record.provenance?.causeType === "uncaused_mismatch"
      || record.explicitCause.kind !== record.provenance?.causeType
      || record.explicitCause.sourceEventId !== record.sourceEvent?.eventId,
    );

    expect(savedReport.scenario).toMatchObject({
      id: scenario.id,
      totalEpisodes: 300,
    });
    expect(savedReport.run.expectedMismatchAttributionCount).toBe(
      scenario.groundTruthCausalEvents.reduce(
        (count, record) => count + record.expectedMismatchAttributions.length,
        0,
      ),
    );
    expect(savedReport.mismatchSummary.detectedMismatchCount).toBeGreaterThan(0);
    expect(savedReport.mismatchSummary.byCauseType.uncaused_mismatch ?? 0).toBe(0);
    expect(savedReport.mismatchCauseLinks).toEqual([
      expect.objectContaining({
        characterId: "haeon",
        recordId: "belief:eclipse-saboteur",
        firstDetectedChapter: 247,
        lastDetectedChapter: 248,
        detectionCount: 2,
        cause: expect.objectContaining({
          causeId: "cause:bias:eclipse-saboteur",
          causeType: "bias",
          sourceEventId: "evt_247",
        }),
      }),
    ]);
    expect(savedResult.scenario).toMatchObject({
      id: scenario.id,
      totalEpisodes: 300,
    });
    expect(savedAggregation).toMatchObject({
      totalEventCount: 300,
      totalEpisodeCount: 300,
      episodeSpan: {
        start: 1,
        end: 300,
      },
      crossEpisode: {
        totalLinkCount: 598,
        resolvedLinkCount: 598,
        unresolvedLinkCount: 0,
      },
    });
    expect(savedAggregation.perEpisode[0]).toMatchObject({
      episode: 1,
      firstEventId: "evt_001",
      lastEventId: "evt_001",
    });
    expect(savedAggregation.perEpisode[299]).toMatchObject({
      episode: 300,
      firstEventId: "evt_300",
      lastEventId: "evt_300",
    });
    expect(savedResult.causalLedgerValidation).toMatchObject({
      passed: true,
      issueCount: 0,
      majorPlotActionCount: 0,
    });
    expect(savedResult.contradictionValidation).toMatchObject({
      passed: true,
      contradiction_count: 0,
      totalViolationCount: 0,
      counts: {
        belief: 0,
        memory: 0,
        utterance: 0,
        continuity: 0,
      },
      episodeDiagnostics: [],
    });
    expect(emittedMismatchRecords).toHaveLength(2);
    expect(invalidExplicitCauseRecords).toEqual([]);
    expect(savedResult.chapters).toHaveLength(300);
    expect(savedResult.chapters[0]?.chapterNumber).toBe(1);
    expect(savedResult.chapters[299]?.chapterNumber).toBe(300);
    expect(fs.existsSync(result.artifactPaths.scenarioSeedFile)).toBe(true);
    expect(fs.existsSync(path.join(outDir, "chapter-001.txt"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "chapter-300.summary.json"))).toBe(true);
  });

  it("prints contradiction_count and episode diagnostics in the CLI summary", async () => {
    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "verify-long-form-cli-contradictions-"),
    );
    const stdout: string[] = [];
    const invalidBelief = {
      ...createAllowedMismatch(247),
      validityStatus: "invalid" as const,
      issueCodes: ["unsupported_divergence_cause"],
      explanation:
        "Rejected mismatch: belief persisted after the supporting evidence was disproven.",
    };
    const invalidMemory = {
      ...createAllowedMismatch(248),
      recordType: "memory" as const,
      recordId: "memory:eclipse-saboteur",
      chapter: 248,
      validityStatus: "invalid" as const,
      issueCodes: ["unexpected_divergence_cause"],
      explanation:
        "Rejected mismatch: memory contradicts the canon without a permitted forgetting path.",
    };

    const result = await runLongFormVerificationCli({
      args: ["--preset", "fast", "--out", outDir, "--quiet"],
      io: {
        log: (...args) => stdout.push(args.join(" ")),
        error: () => {},
      },
      runVerification: async (options) =>
        runLongFormVerification({
          ...options,
          createHarness: () => ({
            runToCompletion: async () => ({
              ok: true as const,
              result: {
                config: "test",
                chapters: [
                  {
                    ...createPassingChapterResult(247),
                    verification: createSimulationValidationVerdict({
                      passed: false,
                      checkedMemories: 0,
                      checkedBeliefs: 1,
                      checkedUtterances: 0,
                      issues: [],
                      mismatches: [invalidBelief],
                      objectiveStateChecks: [],
                    }),
                  },
                  {
                    ...createPassingChapterResult(248),
                    verification: createSimulationValidationVerdict({
                      passed: false,
                      checkedMemories: 1,
                      checkedBeliefs: 0,
                      checkedUtterances: 0,
                      issues: [],
                      mismatches: [invalidMemory],
                      objectiveStateChecks: [],
                    }),
                  },
                ],
                totalUsage: {
                  prompt_tokens: 20,
                  completion_tokens: 10,
                  total_tokens: 30,
                  cost_usd: 0.02,
                },
                totalDurationMs: 20,
                totalCostUsd: 0.02,
                verification: createSimulationValidationVerdict({
                  passed: false,
                  checkedMemories: 1,
                  checkedBeliefs: 1,
                  checkedUtterances: 0,
                  issues: [],
                  mismatches: [invalidBelief, invalidMemory],
                  objectiveStateChecks: [],
                }),
                canonicalValidationFailures: [],
                causalLedgerValidation: {
                  passed: false,
                  majorPlotActionCount: 1,
                  issueCount: 1,
                  issues: [
                    {
                      code: "episode_order_violation",
                      eventId: "evt_late_cause",
                      chapter: 248,
                      episode: 248,
                      referencedEventId: "evt_early_effect",
                      message:
                        "Event \"evt_late_cause\" is out of chronology after \"evt_early_effect\".",
                    },
                  ],
                },
              },
            }),
          }) as never,
          resolveConfig: () => createHarnessConfig(),
        }),
    });

    const output = stdout.join("\n");

    expect(result.report.contradictionValidation.contradiction_count).toBe(3);
    expect(output).toContain("contradiction validation: fail (contradiction_count=3)");
    expect(output).toContain(
      "contradiction breakdown: belief=1, memory=1, utterance=0, continuity=1",
    );
    expect(output).toContain("contradiction diagnostics:");
    expect(output).toContain("- ep_247 (episode 247): 1 contradiction(s)");
    expect(output).toContain(
      "[belief/canonical_conflict] haeon/belief:eclipse-saboteur event=evt_trigger_247",
    );
    expect(output).toContain("- ep_248 (episode 248): 2 contradiction(s)");
    expect(output).toContain(
      "[memory/canonical_conflict] haeon/memory:eclipse-saboteur event=evt_trigger_247",
    );
    expect(output).toContain(
      "[continuity/episode_order_violation] event=evt_late_cause referenced=evt_early_effect",
    );
  });

  it("returns a non-zero exit code whenever contradiction_count is not 0", () => {
    expect(getLongFormVerificationCliExitCode({
      report: {
        run: {
          passed: true,
        },
      } as never,
      contradictionValidation: {
        contradiction_count: 1,
      } as never,
    })).toBe(1);

    expect(getLongFormVerificationCliExitCode({
      report: {
        run: {
          passed: true,
        },
      } as never,
      contradictionValidation: {
        contradiction_count: 0,
      } as never,
    })).toBe(0);
  });
});
