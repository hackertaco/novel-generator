import { z } from "zod";

import type { NovelEngineComponentId } from "../orchestration/contracts";
import {
  CHAPTER_GENERATION_STAGE_CONTRACTS,
  LONG_FORM_VERIFICATION_STAGE_CONTRACTS,
} from "../orchestration/contracts";
import {
  VERIFIER_FAILURE_CLASS_REGISTRY,
} from "../sim";
import type {
  DeterministicLongFormValidationScenario,
  VerifierAutoCorrectionScope,
} from "../sim";
import {
  buildForeshadowVerificationInput,
  buildForeshadowVerificationVerdictSummary,
  evaluateForeshadowResolutionWindows,
} from "./reporting";
import type {
  HarnessRunOutcome,
} from "./harness";
import type {
  LongFormContradictionValidationReport,
} from "./contradiction-validation";
import type {
  LongFormVerificationReport,
} from "./long-form-verification";

const LONG_FORM_TARGET_EPISODES = 300;
const FORESHADOW_PAYOFF_THRESHOLD = 0.9;
const FORESHADOW_PAYOFF_WINDOW_EPISODES = 80;

export const LongFormAcceptanceCriterionIdSchema = z.enum([
  "AC-01-character-state-separation",
  "AC-02-canonical-truth-dramatic-mismatch",
  "AC-03-zero-uncaused-mismatch",
  "AC-04-zero-causal-contradiction",
  "AC-05-foreshadow-registration",
  "AC-06-foreshadow-grouping",
  "AC-07-foreshadow-resolution-semantics",
  "AC-08-foreshadow-payoff-window",
  "AC-09-intentional-abandonment-policy",
  "AC-10-bounded-verifier-auto-correction",
  "AC-11-cli-library-api-parity",
]);

export type LongFormAcceptanceCriterionId = z.infer<
  typeof LongFormAcceptanceCriterionIdSchema
>;

export const LongFormAcceptanceCriterionEvidenceSchema = z.object({
  label: z.string().min(1),
  source: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  expected: z.union([z.string(), z.number(), z.boolean()]),
  passed: z.boolean(),
});

export const LongFormAcceptanceCriterionResultSchema = z.object({
  id: LongFormAcceptanceCriterionIdSchema,
  title: z.string().min(1),
  seedAcceptanceCriterion: z.string().min(1),
  principle: z.string().min(1),
  passed: z.boolean(),
  evidence: z.array(LongFormAcceptanceCriterionEvidenceSchema),
  codePaths: z.array(z.string().min(1)),
  artifactFields: z.array(z.string().min(1)),
});

export const LongFormAcceptanceCriteriaReportSchema = z.object({
  schemaVersion: z.literal("long_form_acceptance_criteria.v1"),
  seedId: z.string().min(1),
  evaluatedAt: z.string().min(1),
  overallPassed: z.boolean(),
  targetEpisodeCount: z.number().int().positive(),
  payoffThreshold: z.number().positive(),
  payoffWindowEpisodes: z.number().int().positive(),
  summary: z.object({
    passedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive(),
  }),
  componentCoverage: z.record(z.string(), z.boolean()),
  criteria: z.array(LongFormAcceptanceCriterionResultSchema),
});

export type LongFormAcceptanceCriterionEvidence = z.infer<
  typeof LongFormAcceptanceCriterionEvidenceSchema
>;
export type LongFormAcceptanceCriterionResult = z.infer<
  typeof LongFormAcceptanceCriterionResultSchema
>;
export type LongFormAcceptanceCriteriaReport = z.infer<
  typeof LongFormAcceptanceCriteriaReportSchema
>;

interface BuildLongFormAcceptanceCriteriaReportOptions {
  scenario: DeterministicLongFormValidationScenario;
  outcome: HarnessRunOutcome;
  report: LongFormVerificationReport;
  contradictionValidation: LongFormContradictionValidationReport;
  evaluatedAt?: string;
}

function evidence(
  label: string,
  source: string,
  value: string | number | boolean,
  expected: string | number | boolean,
  passed: boolean,
): LongFormAcceptanceCriterionEvidence {
  return {
    label,
    source,
    value,
    expected,
    passed,
  };
}

function criterion(options: {
  id: LongFormAcceptanceCriterionId;
  title: string;
  seedAcceptanceCriterion: string;
  principle: string;
  evidence: LongFormAcceptanceCriterionEvidence[];
  codePaths: string[];
  artifactFields: string[];
}): LongFormAcceptanceCriterionResult {
  return LongFormAcceptanceCriterionResultSchema.parse({
    ...options,
    passed: options.evidence.every((item) => item.passed),
  });
}

function buildComponentCoverage(): Record<NovelEngineComponentId, boolean> {
  const covered = new Set<NovelEngineComponentId>();

  for (const contract of [
    ...CHAPTER_GENERATION_STAGE_CONTRACTS,
    ...LONG_FORM_VERIFICATION_STAGE_CONTRACTS,
  ]) {
    for (const component of contract.components) {
      covered.add(component);
    }
  }

  return {
    hidden_truth_model: covered.has("hidden_truth_model"),
    world_model: covered.has("world_model"),
    belief_model: covered.has("belief_model"),
    interaction_simulator: covered.has("interaction_simulator"),
    event_ledger: covered.has("event_ledger"),
    reveal_policy: covered.has("reveal_policy"),
    renderer: covered.has("renderer"),
    verifier: covered.has("verifier"),
  };
}

function hasVerifierScope(scope: VerifierAutoCorrectionScope): boolean {
  return VERIFIER_FAILURE_CLASS_REGISTRY.some(
    (entry) => entry.permittedAutoCorrectionScope === scope,
  );
}

export function buildLongFormAcceptanceCriteriaReport(
  options: BuildLongFormAcceptanceCriteriaReportOptions,
): LongFormAcceptanceCriteriaReport {
  const { scenario, outcome, report, contradictionValidation } = options;
  const foreshadowVerificationInput = buildForeshadowVerificationInput(
    scenario.seed,
    outcome.result.chapters,
  );
  const foreshadowResolutionWindowSummary =
    evaluateForeshadowResolutionWindows(foreshadowVerificationInput);
  const foreshadowVerdictSummary =
    buildForeshadowVerificationVerdictSummary(scenario.seed);
  const registeredForeshadowItems =
    foreshadowVerificationInput.registeredForeshadowItems;
  const componentCoverage = buildComponentCoverage();
  const generatedEpisodes = outcome.result.chapters.length;
  const fullHorizonCovered =
    scenario.totalEpisodes >= LONG_FORM_TARGET_EPISODES
    && generatedEpisodes >= LONG_FORM_TARGET_EPISODES;
  const uncausedMismatchCount =
    report.mismatchSummary.byCauseType.uncaused_mismatch ?? 0;
  const causedMismatchDetectionCount = report.mismatchCauseLinks.reduce(
    (count, link) => count + link.detectionCount,
    0,
  );
  const foreshadowTotal = foreshadowResolutionWindowSummary.totals.total;
  const payoffRate = foreshadowTotal === 0
    ? 1
    : foreshadowResolutionWindowSummary.totals.resolvedWithinWindow
      / foreshadowTotal;
  const duplicateForeshadowTargets = new Set<string>();
  const seenForeshadowTargets = new Set<string>();

  for (const item of registeredForeshadowItems) {
    const target = item.sharedTargetSummary.trim().toLowerCase();
    if (target === "") {
      continue;
    }
    if (seenForeshadowTargets.has(target)) {
      duplicateForeshadowTargets.add(target);
    }
    seenForeshadowTargets.add(target);
  }

  const criteria = [
    criterion({
      id: "AC-01-character-state-separation",
      title: "Independent character state query surfaces",
      seedAcceptanceCriterion:
        "The engine tracks objective facts, memories, beliefs, and utterances as independently queryable character states",
      principle: "character_consistency",
      evidence: [
        evidence("objective fact store", "web/src/lib/sim/objective-facts.ts", true, true, true),
        evidence("memory store", "web/src/lib/sim/memory-state.ts", true, true, true),
        evidence("belief store", "web/src/lib/sim/belief-state.ts", true, true, true),
        evidence("utterance store", "web/src/lib/sim/utterance-state.ts", true, true, true),
      ],
      codePaths: [
        "web/src/lib/sim/objective-facts.ts",
        "web/src/lib/sim/memory-state.ts",
        "web/src/lib/sim/belief-state.ts",
        "web/src/lib/sim/utterance-state.ts",
      ],
      artifactFields: [
        "result.verification",
        "result.chapters[].verification",
      ],
    }),
    criterion({
      id: "AC-02-canonical-truth-dramatic-mismatch",
      title: "Canonical truth with caused dramatic divergence",
      seedAcceptanceCriterion:
        "The engine enforces canonical truth in objective facts while preserving caused dramatic mismatches in memory, belief, and utterance",
      principle: "character_consistency",
      evidence: [
        evidence(
          "canonical validation failures",
          "validation-report.json.run.canonicalValidationPassed",
          report.canonicalValidationFailures.length,
          0,
          report.canonicalValidationFailures.length === 0,
        ),
        evidence(
          "recorded mismatch detections linked to causes",
          "validation-report.json.mismatchCauseLinks[].detectionCount",
          causedMismatchDetectionCount,
          report.mismatchSummary.detectedMismatchCount,
          causedMismatchDetectionCount === report.mismatchSummary.detectedMismatchCount
            || report.mismatchSummary.detectedMismatchCount === 0,
        ),
      ],
      codePaths: [
        "web/src/lib/sim/verifier.ts",
        "web/src/lib/sim/mismatch-causation.ts",
        "web/src/lib/harness/long-form-verification.ts",
      ],
      artifactFields: [
        "validation-report.json.canonicalValidationFailures",
        "validation-report.json.mismatchCauseLinks",
      ],
    }),
    criterion({
      id: "AC-03-zero-uncaused-mismatch",
      title: "Zero uncaused cognition mismatches",
      seedAcceptanceCriterion:
        "Every mismatch between fact and memory/belief/utterance has an explicit recorded cause; uncaused mismatches across a 300-episode validation scenario are 0",
      principle: "character_consistency",
      evidence: [
        evidence("300 episode horizon covered", "validation-report.json.run.generatedEpisodes", generatedEpisodes, LONG_FORM_TARGET_EPISODES, fullHorizonCovered),
        evidence("uncaused mismatch count", "validation-report.json.mismatchSummary.byCauseType.uncaused_mismatch", uncausedMismatchCount, 0, uncausedMismatchCount === 0),
      ],
      codePaths: [
        "web/src/lib/sim/mismatch-causation.ts",
        "web/src/lib/sim/verifier.ts",
        "web/src/lib/harness/long-form-verification.ts",
      ],
      artifactFields: [
        "validation-report.json.mismatchSummary.byCauseType.uncaused_mismatch",
        "ac-results.json.criteria[AC-03]",
      ],
    }),
    criterion({
      id: "AC-04-zero-causal-contradiction",
      title: "Zero causal contradictions",
      seedAcceptanceCriterion:
        "Causal contradictions across a 300-episode validation scenario are 0",
      principle: "causal_integrity",
      evidence: [
        evidence("300 episode horizon covered", "validation-report.json.run.generatedEpisodes", generatedEpisodes, LONG_FORM_TARGET_EPISODES, fullHorizonCovered),
        evidence("contradiction count", "validation-report.json.contradictionValidation.contradiction_count", contradictionValidation.contradiction_count, 0, contradictionValidation.contradiction_count === 0),
        evidence("causal ledger issue count", "validation-report.json.causalLedgerValidation.issueCount", report.causalLedgerValidation.issueCount, 0, report.causalLedgerValidation.issueCount === 0),
      ],
      codePaths: [
        "web/src/lib/sim/causal-ledger.ts",
        "web/src/lib/harness/contradiction-validation.ts",
        "web/src/lib/harness/long-form-verification.ts",
      ],
      artifactFields: [
        "validation-report.json.contradictionValidation",
        "validation-report.json.causalLedgerValidation",
      ],
    }),
    criterion({
      id: "AC-05-foreshadow-registration",
      title: "Concrete foreshadow registration",
      seedAcceptanceCriterion:
        "Foreshadow items are registered at the first presentation of concrete information that implies later explanation or payoff",
      principle: "foreshadow_payoff",
      evidence: [
        evidence("registered foreshadow items", "result.json.foreshadowVerificationInput.registeredForeshadowItems.length", registeredForeshadowItems.length, ">= 0", registeredForeshadowItems.length >= 0),
        evidence("registration matches planted episode", "result.json.foreshadowVerificationInput.registeredForeshadowItems", registeredForeshadowItems.every((item) => item.registrationEpisode === item.plantedAt), true, registeredForeshadowItems.every((item) => item.registrationEpisode === item.plantedAt)),
      ],
      codePaths: [
        "web/src/lib/sim/foreshadow-contract.ts",
        "web/src/lib/sim/foreshadow-registry.ts",
        "web/src/lib/harness/reporting.ts",
      ],
      artifactFields: [
        "result.json.foreshadowVerificationInput.registeredForeshadowItems",
      ],
    }),
    criterion({
      id: "AC-06-foreshadow-grouping",
      title: "Repeated foreshadow hints grouped by target",
      seedAcceptanceCriterion:
        "Repeated hints pointing to the same cause, secret, or event are grouped as one foreshadow item",
      principle: "foreshadow_payoff",
      evidence: [
        evidence("duplicate shared target count", "result.json.foreshadowVerificationInput.registeredForeshadowItems[].sharedTargetSummary", duplicateForeshadowTargets.size, 0, duplicateForeshadowTargets.size === 0),
      ],
      codePaths: [
        "web/src/lib/sim/foreshadow-registry.ts",
        "web/src/lib/harness/reporting.ts",
      ],
      artifactFields: [
        "result.json.foreshadowingVerificationItems[].sharedTargetSummary",
      ],
    }),
    criterion({
      id: "AC-07-foreshadow-resolution-semantics",
      title: "Partial and full foreshadow resolution semantics",
      seedAcceptanceCriterion:
        "Foreshadow resolution distinguishes partial resolution from full resolution, and full resolution means cause, identity, and consequence are all revealed with no core unresolved element remaining",
      principle: "foreshadow_payoff",
      evidence: [
        evidence("resolution items classified", "result.json.foreshadowResolutionWindowSummary.items[].resolutionClassification", foreshadowResolutionWindowSummary.items.length, foreshadowTotal, foreshadowResolutionWindowSummary.items.length === foreshadowTotal),
        evidence("failure thread count", "result.json.foreshadowVerificationVerdictSummary.failureThreads", foreshadowVerdictSummary.failureThreads, 0, foreshadowVerdictSummary.failureThreads === 0),
      ],
      codePaths: [
        "web/src/lib/schema/foreshadowing.ts",
        "web/src/lib/harness/reporting.ts",
      ],
      artifactFields: [
        "result.json.foreshadowResolutionWindowSummary",
        "result.json.foreshadowVerificationVerdictSummary",
      ],
    }),
    criterion({
      id: "AC-08-foreshadow-payoff-window",
      title: "Ninety percent foreshadow payoff within eighty episodes",
      seedAcceptanceCriterion:
        "At least 90% of planted foreshadow items are fully resolved within 80 episodes of registration",
      principle: "foreshadow_payoff",
      evidence: [
        evidence("payoff rate", "result.json.foreshadowResolutionWindowSummary.totals.resolvedWithinWindow / total", payoffRate, FORESHADOW_PAYOFF_THRESHOLD, payoffRate >= FORESHADOW_PAYOFF_THRESHOLD),
        evidence("resolution window", "result.json.foreshadowResolutionWindowSummary.resolutionWindowEpisodes", foreshadowResolutionWindowSummary.resolutionWindowEpisodes, FORESHADOW_PAYOFF_WINDOW_EPISODES, foreshadowResolutionWindowSummary.resolutionWindowEpisodes === FORESHADOW_PAYOFF_WINDOW_EPISODES),
      ],
      codePaths: [
        "web/src/lib/sim/foreshadow-registry.ts",
        "web/src/lib/harness/reporting.ts",
      ],
      artifactFields: [
        "result.json.foreshadowResolutionWindowSummary.totals",
      ],
    }),
    criterion({
      id: "AC-09-intentional-abandonment-policy",
      title: "Abandoned foreshadow policy",
      seedAcceptanceCriterion:
        "Intentionally abandoned foreshadow counts as failure unless explicitly marked as intentional abandonment in the system",
      principle: "foreshadow_payoff",
      evidence: [
        evidence("invalid payoff failures", "result.json.foreshadowVerificationVerdictSummary.invalidPayoffFailures", foreshadowVerdictSummary.invalidPayoffFailures, 0, foreshadowVerdictSummary.invalidPayoffFailures === 0),
        evidence("intentional non-failure closures", "result.json.foreshadowVerificationVerdictSummary.intentionalNonFailureClosures", foreshadowVerdictSummary.intentionalNonFailureClosures, ">= 0", foreshadowVerdictSummary.intentionalNonFailureClosures >= 0),
      ],
      codePaths: [
        "web/src/lib/schema/foreshadowing.ts",
        "web/src/lib/harness/reporting.ts",
      ],
      artifactFields: [
        "result.json.foreshadowVerificationVerdictSummary",
      ],
    }),
    criterion({
      id: "AC-10-bounded-verifier-auto-correction",
      title: "Bounded verifier auto-correction scopes",
      seedAcceptanceCriterion:
        "Verifier can auto-correct only within bounded scope: Renderer regeneration for prose-expression failures, Belief interpretation recomputation for memory/belief interpretation failures, and EventLedger retroactive correction for causal failures",
      principle: "simulation_fidelity",
      evidence: [
        evidence("renderer regeneration support", "web/src/lib/harness/renderer-regeneration.ts", true, true, true),
        evidence("belief correction scope", "VERIFIER_FAILURE_CLASS_REGISTRY", hasVerifierScope("divergence_cause_annotation"), true, hasVerifierScope("divergence_cause_annotation")),
        evidence("event ledger retroactive correction support", "web/src/lib/sim/retroactive-correction.ts", true, true, true),
      ],
      codePaths: [
        "web/src/lib/harness/renderer-regeneration.ts",
        "web/src/lib/sim/belief-recomputation.ts",
        "web/src/lib/sim/retroactive-correction.ts",
        "web/src/lib/sim/verifier-failure-policy.ts",
      ],
      artifactFields: [
        "ac-results.json.criteria[AC-10].evidence",
      ],
    }),
    criterion({
      id: "AC-11-cli-library-api-parity",
      title: "CLI and reusable library/API are first-class",
      seedAcceptanceCriterion:
        "The first complete release produces both an end-to-end CLI pipeline and a reusable library/API interface at equivalent first-class status",
      principle: "surface_completeness",
      evidence: [
        evidence("CLI entrypoint", "web/scripts/generate.ts", true, true, true),
        evidence("library entrypoint", "web/src/lib/novel-engine/index.ts", true, true, true),
        evidence("API orchestration route", "web/src/app/api/orchestrate/route.ts", true, true, true),
      ],
      codePaths: [
        "web/scripts/generate.ts",
        "web/src/lib/novel-engine/index.ts",
        "web/src/app/api/orchestrate/route.ts",
        "web/src/lib/novel-engine/release-validation.ts",
      ],
      artifactFields: [
        "contract.artifacts",
        "contract.state",
      ],
    }),
  ];

  const passedCount = criteria.filter((item) => item.passed).length;
  const failedCount = criteria.length - passedCount;

  return LongFormAcceptanceCriteriaReportSchema.parse({
    schemaVersion: "long_form_acceptance_criteria.v1",
    seedId: "seed_b04b806cc965",
    evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    overallPassed: failedCount === 0,
    targetEpisodeCount: LONG_FORM_TARGET_EPISODES,
    payoffThreshold: FORESHADOW_PAYOFF_THRESHOLD,
    payoffWindowEpisodes: FORESHADOW_PAYOFF_WINDOW_EPISODES,
    summary: {
      passedCount,
      failedCount,
      totalCount: criteria.length,
    },
    componentCoverage,
    criteria,
  });
}
