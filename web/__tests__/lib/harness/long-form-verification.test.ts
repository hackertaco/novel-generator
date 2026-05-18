// @vitest-environment node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  type HarnessConfig,
  LongFormAcceptanceCriteriaReportSchema,
  LongFormVerificationReportSchema,
  runLongFormVerification,
} from "@/lib/harness";
import {
  CharacterMismatchCausationLedgerSchema,
  type CognitionVerificationIssueCode,
  createDeterministicLongFormValidationScenario,
  createSimulationValidationVerdict,
  type CharacterClaimMismatchRecord,
} from "@/lib/sim";

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

function createVerification(chapter: number) {
  return createSimulationValidationVerdict({
    passed: true,
    checkedMemories: 0,
    checkedBeliefs: 1,
    checkedUtterances: 0,
    issues: [],
    mismatches: [createAllowedMismatch(chapter)],
    objectiveStateChecks: [],
  });
}

function createChapterResult(chapterNumber: number) {
  return {
    chapterNumber,
    text: `chapter ${chapterNumber}`,
    summary: {
      title: `${chapterNumber}화`,
      plot_summary: `검증용 ${chapterNumber}화`,
      ending_scene_state: {
        location: "회랑",
        time_of_day: "night",
        characters_present: ["haeon"],
        ongoing_action: "검증을 계속한다",
        unresolved_tension: "원인 추적이 유지되는가",
      },
    } as never,
    score: 0.9,
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      cost_usd: 0.01,
    },
    durationMs: 10,
    verification: createVerification(chapterNumber),
  };
}

class FakeLongFormHarness {
  async runToCompletion() {
    const chapters = [createChapterResult(247), createChapterResult(248)];

    return {
      ok: true as const,
      result: {
        config: "test",
        chapters,
        totalUsage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
          cost_usd: 0.02,
        },
        totalDurationMs: 20,
        totalCostUsd: 0.02,
        verification: chapters[1]?.verification,
        canonicalValidationFailures: [],
      },
    };
  }
}

describe("long-form verification runner", () => {
  it("writes a machine-readable report with deduplicated mismatch cause links", async () => {
    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "long-form-verification-"),
    );

    const result = await runLongFormVerification({
      outDir,
      preset: "fast",
      io: {
        log: () => {},
        error: () => {},
      },
      createHarness: () => new FakeLongFormHarness() as never,
      resolveConfig: () => createHarnessConfig(),
    });

    expect(result.report.run.chapterCoverageComplete).toBe(false);
    expect(result.validationFailed).toBe(true);
    expect(result.report.mismatchSummary.detectedMismatchCount).toBe(2);
    expect(result.report.mismatchSummary.uniqueMismatchCauseLinkCount).toBe(1);
    expect(result.contradictionValidation).toMatchObject({
      passed: true,
      contradiction_count: 0,
      totalViolationCount: 0,
      episodeDiagnostics: [],
    });
    expect(result.report.causalLedgerValidation).toMatchObject({
      passed: true,
      majorPlotActionCount: 0,
      issueCount: 0,
    });
    expect(result.report.contradictionValidation).toMatchObject({
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
    expect(result.report.mismatchCauseLinks).toEqual([
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
    expect(
      result.report.expectedMismatchAttributions.some(
        (mismatch) => mismatch.mismatchId === "mm_247_haeon_belief",
      ),
    ).toBe(true);

    const savedReport = LongFormVerificationReportSchema.parse(
      JSON.parse(
        fs.readFileSync(result.artifactPaths.reportFile, "utf-8"),
      ),
    );
    const savedAcceptanceCriteria = LongFormAcceptanceCriteriaReportSchema.parse(
      JSON.parse(
        fs.readFileSync(result.artifactPaths.acceptanceCriteriaFile, "utf-8"),
      ),
    );
    const savedResult = JSON.parse(
      fs.readFileSync(result.artifactPaths.resultFile, "utf-8"),
    ) as {
      acceptanceCriteria?: {
        schemaVersion: string;
        summary: {
          totalCount: number;
        };
      };
      canonicalValidationFailures?: unknown[];
      contradictionValidation?: {
        passed: boolean;
        contradiction_count: number;
        totalViolationCount: number;
        episodeDiagnostics?: unknown[];
      };
      chapters?: Array<{
        verification?: {
          mismatchCausationLedger?: unknown;
        };
      }>;
    };
    const emittedMismatchRecords = (savedResult.chapters ?? []).flatMap((chapter) => {
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

    expect(savedReport.mismatchCauseLinks[0]?.detectionCount).toBe(2);
    expect(savedReport.run.causalLedgerValidationPassed).toBe(true);
    expect(savedReport.run.contradictionValidationPassed).toBe(true);
    expect(savedReport.mismatchSummary.byCauseType.uncaused_mismatch ?? 0).toBe(0);
    expect(savedReport.canonicalValidationFailures).toEqual([]);
    expect(savedReport.causalLedgerValidation.issueCount).toBe(0);
    expect(savedReport.contradictionValidation.contradiction_count).toBe(0);
    expect(savedReport.contradictionValidation.totalViolationCount).toBe(0);
    expect(savedAcceptanceCriteria.schemaVersion).toBe("long_form_acceptance_criteria.v1");
    expect(savedAcceptanceCriteria.summary.totalCount).toBe(11);
    expect(
      savedAcceptanceCriteria.criteria.some(
        (criterion) => criterion.id === "AC-03-zero-uncaused-mismatch",
      ),
    ).toBe(true);
    expect(savedResult.acceptanceCriteria?.summary.totalCount).toBe(11);
    expect(savedResult.canonicalValidationFailures ?? []).toEqual([]);
    expect(savedResult.contradictionValidation).toMatchObject({
      passed: true,
      contradiction_count: 0,
      totalViolationCount: 0,
      episodeDiagnostics: [],
    });
    expect(emittedMismatchRecords).toHaveLength(2);
    expect(invalidExplicitCauseRecords).toEqual([]);
    expect(fs.existsSync(result.artifactPaths.scenarioSeedFile)).toBe(true);
    expect(fs.existsSync(result.artifactPaths.acceptanceCriteriaFile)).toBe(true);
    expect(fs.existsSync(result.artifactPaths.resultFile)).toBe(true);
    expect(fs.existsSync(path.join(outDir, "chapter-247.txt"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "chapter-248.summary.json"))).toBe(true);
    expect(result.artifactBundle).toMatchObject({
      workflow: "long_form_verification",
      outDir,
      reportFile: {
        relativePath: "validation-report.json",
        serialization: "json_pretty",
      },
      resultFile: {
        relativePath: "result.json",
        serialization: "json_pretty",
      },
      scenarioSeedFile: {
        relativePath: "scenario.seed.json",
        serialization: "json_pretty",
      },
      acceptanceCriteriaFile: {
        relativePath: "ac-results.json",
        serialization: "json_pretty",
      },
    });
    expect(result.artifactBundle.chapterTexts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        chapterNumber: 247,
        relativePath: "chapter-247.txt",
        serialization: "utf8_text",
      }),
    ]));
    expect(result.artifactBundle.chapterSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        chapterNumber: 248,
        relativePath: "chapter-248.summary.json",
        serialization: "json_pretty",
      }),
    ]));
  });

  it("loads a scenario from disk and runs the declared episode span through the reusable API", async () => {
    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "long-form-verification-scenario-"),
    );
    const scenarioPath = path.join(outDir, "scenario.json");
    const baseScenario = createDeterministicLongFormValidationScenario();
    const scenario = {
      ...baseScenario,
      id: "custom-astral-court-002",
      totalEpisodes: 2,
      seed: {
        ...baseScenario.seed,
        total_chapters: 2,
      },
      groundTruthCausalEvents: baseScenario.groundTruthCausalEvents.slice(0, 2),
      continuityCheckpoints: baseScenario.continuityCheckpoints.filter(
        (checkpoint) => checkpoint.chapter <= 2,
      ),
    };
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2), "utf-8");

    const calls: Array<{ start: number; end: number; seedTitle: string }> = [];
    const createCleanChapterResult = (chapterNumber: number) => ({
      chapterNumber,
      text: `chapter ${chapterNumber}`,
      summary: {
        title: `${chapterNumber}화`,
        plot_summary: `검증용 ${chapterNumber}화`,
        ending_scene_state: {
          location: "회랑",
          time_of_day: "night",
          characters_present: ["haeon"],
          ongoing_action: "검증을 계속한다",
          unresolved_tension: "시나리오 입력이 유지되는가",
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
    });

    const result = await runLongFormVerification({
      outDir,
      scenarioPath,
      io: {
        log: () => {},
        error: () => {},
      },
      createHarness: () => ({
        runToCompletion: async (
          seed: typeof scenario.seed,
          startChapter: number,
          endChapter: number,
        ) => {
          calls.push({
            start: startChapter,
            end: endChapter,
            seedTitle: seed.title,
          });

          const chapters = [createCleanChapterResult(1), createCleanChapterResult(2)];

          return {
            ok: true as const,
            result: {
              config: "test",
              chapters,
              totalUsage: {
                prompt_tokens: 20,
                completion_tokens: 10,
                total_tokens: 30,
                cost_usd: 0.02,
              },
              totalDurationMs: 20,
              totalCostUsd: 0.02,
              verification: chapters[1]?.verification,
              canonicalValidationFailures: [],
            },
          };
        },
      }) as never,
      resolveConfig: () => createHarnessConfig(),
    });

    expect(calls).toEqual([
      {
        start: 1,
        end: 2,
        seedTitle: scenario.seed.title,
      },
    ]);
    expect(result.scenario.id).toBe("custom-astral-court-002");
    expect(result.report.run.totalEpisodes).toBe(2);
    expect(result.report.run.generatedEpisodes).toBe(2);
    expect(result.report.run.chapterCoverageComplete).toBe(true);
    expect(result.validationFailed).toBe(false);
    expect(result.contradictionValidation).toMatchObject({
      passed: true,
      contradiction_count: 0,
      episodeDiagnostics: [],
    });
  });

  it("aggregates contradiction violations from chapter verdicts and the causal ledger", async () => {
    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "long-form-verification-contradictions-"),
    );
    const invalidBelief = {
      ...createAllowedMismatch(247),
      validityStatus: "invalid" as const,
      issueCodes: ["unsupported_divergence_cause"] as CognitionVerificationIssueCode[],
      explanation:
        "Rejected mismatch: belief persisted after the supporting evidence was disproven.",
    };
    const invalidMemory = {
      ...createAllowedMismatch(248),
      recordType: "memory" as const,
      recordId: "memory:eclipse-saboteur",
      chapter: 248,
      issueCodes: ["unexpected_divergence_cause"] as CognitionVerificationIssueCode[],
      validityStatus: "invalid" as const,
      explanation:
        "Rejected mismatch: memory contradicts the canon without a permitted forgetting path.",
    };

    const result = await runLongFormVerification({
      outDir,
      io: {
        log: () => {},
        error: () => {},
      },
      createHarness: () => ({
        runToCompletion: async () => ({
          ok: true as const,
          result: {
            config: "test",
            chapters: [
              {
                ...createChapterResult(247),
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
                ...createChapterResult(248),
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
    });

    expect(result.report.contradictionValidation).toMatchObject({
      passed: false,
      contradiction_count: 3,
      totalViolationCount: 3,
      detectedCognitionViolationCount: 2,
      counts: {
        belief: 1,
        memory: 1,
        utterance: 0,
        continuity: 1,
      },
      beliefViolations: [
        expect.objectContaining({
          recordId: "belief:eclipse-saboteur",
          detectionCount: 1,
        }),
      ],
      memoryViolations: [
        expect.objectContaining({
          recordId: "memory:eclipse-saboteur",
          detectionCount: 1,
        }),
      ],
      continuityViolations: [
        expect.objectContaining({
          code: "episode_order_violation",
          eventId: "evt_late_cause",
        }),
      ],
      episodeDiagnostics: [
        expect.objectContaining({
          episode: 247,
          episodeId: "ep_247",
          contradictionCount: 1,
          details: [
            expect.objectContaining({
              sourceType: "belief",
              contradictionType: "canonical_conflict",
              characterId: "haeon",
              recordId: "belief:eclipse-saboteur",
            }),
          ],
        }),
        expect.objectContaining({
          episode: 248,
          episodeId: "ep_248",
          contradictionCount: 2,
          details: expect.arrayContaining([
            expect.objectContaining({
              sourceType: "memory",
              contradictionType: "canonical_conflict",
              characterId: "haeon",
              recordId: "memory:eclipse-saboteur",
            }),
            expect.objectContaining({
              sourceType: "continuity",
              contradictionType: "episode_order_violation",
              eventId: "evt_late_cause",
              referencedEventId: "evt_early_effect",
            }),
          ]),
        }),
      ],
    });
    expect(result.contradictionValidation).toEqual(
      result.report.contradictionValidation,
    );
    expect(result.report.run.contradictionValidationPassed).toBe(false);
    expect(result.validationFailed).toBe(true);
  });
});
