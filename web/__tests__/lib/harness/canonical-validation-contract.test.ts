// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  collectHarnessRunOutcome,
  NovelHarness,
} from "@/lib/harness";
import type {
  CanonicalValidationFailureReport,
  HarnessEvent,
} from "@/lib/harness";
import type { NovelSeed } from "@/lib/schema/novel";

function createCanonicalValidationFailure(): CanonicalValidationFailureReport {
  return {
    code: "simulation_validation_failed",
    chapter: 12,
    summary: "12화에서 belief 상태가 canonical truth와 충돌했지만 explicit cause가 없습니다.",
    invalidContradictionCount: 1,
    allowedExceptionCount: 0,
    issueCount: 1,
    mismatchCount: 1,
    uncausedMismatchFailures: [
      {
        code: "uncaused_mismatch",
        message:
          "No explicit recorded cause was available for belief:belief:missing-cause (canonical_conflict).",
        mismatch: {
          recordType: "belief",
          recordId: "belief:missing-cause",
          characterId: "hero",
          chapter: 12,
          mismatchType: "canonical_conflict",
          factIds: ["fact:sealed-gate"],
        },
        missingCause: {
          path: "divergenceCause",
          required: "explicit_divergence_cause",
          allowedKinds: ["misinterpretation", "lack_of_information"],
        },
        failureContext: {
          triggeringEventId: "evt-sealed-gate",
          contradictedFactId: "fact:sealed-gate",
          objectiveFactIds: ["fact:sealed-gate"],
          traceabilityAnchors: [],
          unresolvedTraceabilityReferences: [],
        },
      },
    ],
  };
}

function createDoneEvent(): HarnessEvent {
  return {
    type: "done",
    result: {
      config: "test",
      chapters: [],
      totalUsage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
      },
      totalDurationMs: 1,
      totalCostUsd: 0,
      canonicalValidationFailures: [],
      beliefInterpretationRecoveries: [],
    },
  };
}

describe("harness canonical validation contract", () => {
  it("returns canonical mismatch failures through the reusable result/error contract", async () => {
    const report = createCanonicalValidationFailure();

    async function* createEvents(): AsyncGenerator<HarnessEvent> {
      yield {
        type: "error",
        chapter: report.chapter,
        message: report.summary,
        code: report.code,
        canonicalValidationFailure: report,
      };
      yield createDoneEvent();
    }

    const outcome = await collectHarnessRunOutcome(createEvents());

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error("Expected a canonical validation failure outcome.");
    }

    expect(outcome.error).toEqual({
      code: "simulation_validation_failed",
      message: "Canonical simulation validation failed for chapter(s): 12",
      reports: [report],
    });
    expect(outcome.result.canonicalValidationFailures).toEqual([report]);
  });

  it("exposes the same canonical mismatch failures via NovelHarness.runToCompletion", async () => {
    const report = createCanonicalValidationFailure();

    const harness = Object.create(NovelHarness.prototype) as NovelHarness;
    harness.run = async function* run(): AsyncGenerator<HarnessEvent> {
      yield {
        type: "error",
        chapter: report.chapter,
        message: report.summary,
        code: report.code,
        canonicalValidationFailure: report,
      };
      yield createDoneEvent();
    };
    const outcome = await harness.runToCompletion({} as NovelSeed, 1, 1);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      throw new Error("Expected a canonical validation failure outcome.");
    }

    expect(outcome.error.reports).toEqual([report]);
    expect(outcome.result.canonicalValidationFailures).toEqual([report]);
  });
});
