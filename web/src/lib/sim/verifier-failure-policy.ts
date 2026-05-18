import { z } from "zod";

import { CharacterMismatchValidationFailureCodeSchema } from "./mismatch-causation";

export const COGNITION_VERIFICATION_ISSUE_CODES = [
  "unknown_objective_fact",
  "normalized_value_mismatch",
  "missing_divergence_cause",
  "missing_traceability_link",
  "unsupported_divergence_cause",
  "insufficient_divergence_trace",
  "unexpected_divergence_cause",
] as const;

export const CognitionVerificationIssueCodeSchema = z.enum(
  COGNITION_VERIFICATION_ISSUE_CODES,
);

const VERIFIER_FAILURE_CLASSES = [
  ...COGNITION_VERIFICATION_ISSUE_CODES,
  ...CharacterMismatchValidationFailureCodeSchema.options,
] as const;

export const VerifierFailureClassSchema = z.enum(VERIFIER_FAILURE_CLASSES);

export const VERIFIER_AUTO_CORRECTION_SCOPES = [
  "objective_fact_reference_resolution",
  "claim_normalization",
  "divergence_cause_annotation",
  "traceability_linkage",
  "divergence_cause_policy_alignment",
  "divergence_trace_enrichment",
  "divergence_cause_removal",
] as const;

export const VerifierAutoCorrectionScopeSchema = z.enum(
  VERIFIER_AUTO_CORRECTION_SCOPES,
);

export const VerifierFailureClassSourceSchema = z.enum([
  "verification_issue",
  "validation_failure",
]);

export const VerifierFailureClassRegistryEntrySchema = z.object({
  failureClass: VerifierFailureClassSchema,
  source: VerifierFailureClassSourceSchema,
  permittedAutoCorrectionScope: VerifierAutoCorrectionScopeSchema,
  summary: z.string().min(1),
  policy: z.string().min(1),
});

export const VerifierFailureRoutingInputSchema = z.object({
  code: z.string().min(1),
  source: VerifierFailureClassSourceSchema.optional(),
}).passthrough();

export const VerifierFailureRoutingDecisionSchema = z.object({
  failureClass: VerifierFailureClassSchema,
  source: VerifierFailureClassSourceSchema,
  autoCorrectionScope: VerifierAutoCorrectionScopeSchema,
  summary: z.string().min(1),
  policy: z.string().min(1),
});

export const VERIFIER_FAILURE_POLICY_ERROR_CODES = [
  "unmapped_failure_class",
  "ambiguous_failure_class_mapping",
] as const;

export const VerifierFailurePolicyErrorCodeSchema = z.enum(
  VERIFIER_FAILURE_POLICY_ERROR_CODES,
);

export const VerifierFailurePolicyErrorCandidateSchema = z.object({
  failureClass: VerifierFailureClassSchema,
  source: VerifierFailureClassSourceSchema,
  permittedAutoCorrectionScope: VerifierAutoCorrectionScopeSchema,
});

export const VerifierFailurePolicyErrorDetailsSchema = z.object({
  name: z.literal("VerifierFailurePolicyError"),
  code: VerifierFailurePolicyErrorCodeSchema,
  failureClass: z.string().min(1),
  requestedSource: VerifierFailureClassSourceSchema.nullable(),
  matchCount: z.number().int().nonnegative(),
  candidateMappings: z.array(VerifierFailurePolicyErrorCandidateSchema),
  message: z.string().min(1),
});

export type CognitionVerificationIssueCode = z.infer<
  typeof CognitionVerificationIssueCodeSchema
>;
export type VerifierFailureClass = z.infer<typeof VerifierFailureClassSchema>;
export type VerifierAutoCorrectionScope = z.infer<
  typeof VerifierAutoCorrectionScopeSchema
>;
export type VerifierFailureClassSource = z.infer<
  typeof VerifierFailureClassSourceSchema
>;
export type VerifierFailureClassRegistryEntry = z.infer<
  typeof VerifierFailureClassRegistryEntrySchema
>;
export type VerifierFailureRoutingInput = z.infer<
  typeof VerifierFailureRoutingInputSchema
>;
export type VerifierFailureRoutingDecision = z.infer<
  typeof VerifierFailureRoutingDecisionSchema
>;
export type VerifierFailurePolicyErrorCode = z.infer<
  typeof VerifierFailurePolicyErrorCodeSchema
>;
export type VerifierFailurePolicyErrorCandidate = z.infer<
  typeof VerifierFailurePolicyErrorCandidateSchema
>;
export type VerifierFailurePolicyErrorDetails = z.infer<
  typeof VerifierFailurePolicyErrorDetailsSchema
>;

export const SUPPORTED_VERIFIER_FAILURE_CLASSES = [
  ...VerifierFailureClassSchema.options,
] as const satisfies readonly VerifierFailureClass[];

const VERIFIER_FAILURE_CLASS_REGISTRY_INPUT = [
  {
    failureClass: "unknown_objective_fact",
    source: "verification_issue",
    permittedAutoCorrectionScope: "objective_fact_reference_resolution",
    summary: "A cognition record points at a canonical fact id the world model does not contain.",
    policy: "Auto-correction may only repair or create the canonical fact reference in the objective fact layer.",
  },
  {
    failureClass: "normalized_value_mismatch",
    source: "verification_issue",
    permittedAutoCorrectionScope: "claim_normalization",
    summary: "Observed claim text still conflicts with canonical truth after normalization.",
    policy: "Auto-correction may only rewrite the normalized claim surface, not alter canonical truth or cause metadata.",
  },
  {
    failureClass: "missing_divergence_cause",
    source: "verification_issue",
    permittedAutoCorrectionScope: "divergence_cause_annotation",
    summary: "A canonical conflict is present without an explicit divergence cause.",
    policy: "Auto-correction may only annotate an explicit divergence cause on the offending cognition record.",
  },
  {
    failureClass: "missing_traceability_link",
    source: "verification_issue",
    permittedAutoCorrectionScope: "traceability_linkage",
    summary: "The verifier cannot trace a divergence back to recorded simulation history.",
    policy: "Auto-correction may only restore or attach missing event, memory, or utterance linkage.",
  },
  {
    failureClass: "unsupported_divergence_cause",
    source: "verification_issue",
    permittedAutoCorrectionScope: "divergence_cause_policy_alignment",
    summary: "A divergence cause exists but is not permitted for the record type.",
    policy: "Auto-correction may only realign the divergence cause to the allowed policy set for that record type.",
  },
  {
    failureClass: "insufficient_divergence_trace",
    source: "verification_issue",
    permittedAutoCorrectionScope: "divergence_trace_enrichment",
    summary: "A divergence cause exists but lacks the evidence trail required by the verifier rule set.",
    policy: "Auto-correction may only enrich the missing trace dimensions that justify the recorded divergence.",
  },
  {
    failureClass: "unexpected_divergence_cause",
    source: "verification_issue",
    permittedAutoCorrectionScope: "divergence_cause_removal",
    summary: "A divergence cause was recorded even though the claim does not contradict canonical truth.",
    policy: "Auto-correction may only remove the spurious divergence cause from the cognition record.",
  },
  {
    failureClass: "uncaused_mismatch",
    source: "validation_failure",
    permittedAutoCorrectionScope: "divergence_cause_annotation",
    summary: "The mismatch causation ledger persisted a contradiction without any explicit cause.",
    policy: "Auto-correction may only add the missing explicit divergence cause to the persisted mismatch record.",
  },
] as const;

function buildVerifierFailureClassPolicyMap(
  registry: readonly VerifierFailureClassRegistryEntry[],
): Record<VerifierFailureClass, VerifierAutoCorrectionScope> {
  const expected = new Set<VerifierFailureClass>(SUPPORTED_VERIFIER_FAILURE_CLASSES);
  const seen = new Set<VerifierFailureClass>();
  const map = {} as Record<VerifierFailureClass, VerifierAutoCorrectionScope>;

  for (const entry of registry) {
    if (seen.has(entry.failureClass)) {
      throw new Error(
        `duplicate verifier failure class policy for ${entry.failureClass}`,
      );
    }

    seen.add(entry.failureClass);
    map[entry.failureClass] = entry.permittedAutoCorrectionScope;
  }

  const missing = Array.from(expected).filter((failureClass) => !seen.has(failureClass));
  if (missing.length > 0) {
    throw new Error(
      `missing verifier failure policy coverage for ${missing.join(", ")}`,
    );
  }

  return map;
}

export const VERIFIER_FAILURE_CLASS_REGISTRY = VERIFIER_FAILURE_CLASS_REGISTRY_INPUT.map(
  (entry) => VerifierFailureClassRegistryEntrySchema.parse(entry),
);

export const VERIFIER_FAILURE_CLASS_POLICY_MAP = buildVerifierFailureClassPolicyMap(
  VERIFIER_FAILURE_CLASS_REGISTRY,
);

function buildVerifierFailurePolicyError(
  failureClass: string,
  requestedSource: VerifierFailureClassSource | undefined,
  matches: readonly VerifierFailureClassRegistryEntry[],
): VerifierFailurePolicyError {
  const code = matches.length === 0
    ? "unmapped_failure_class"
    : "ambiguous_failure_class_mapping";
  const details = VerifierFailurePolicyErrorDetailsSchema.parse({
    name: "VerifierFailurePolicyError",
    code,
    failureClass,
    requestedSource: requestedSource ?? null,
    matchCount: matches.length,
    candidateMappings: matches.map((entry) => ({
      failureClass: entry.failureClass,
      source: entry.source,
      permittedAutoCorrectionScope: entry.permittedAutoCorrectionScope,
    })),
    message: matches.length === 0
      ? `No verifier failure policy maps failure class "${failureClass}"${requestedSource ? ` for source "${requestedSource}"` : ""}.`
      : `Verifier failure class "${failureClass}" matched ${matches.length} auto-correction policies${requestedSource ? ` for source "${requestedSource}"` : ""}.`,
  });

  return new VerifierFailurePolicyError(details);
}

export function getPermittedVerifierAutoCorrectionScope(
  failureClass: VerifierFailureClass,
): VerifierAutoCorrectionScope {
  return VERIFIER_FAILURE_CLASS_POLICY_MAP[failureClass];
}

export class VerifierFailurePolicyError extends Error {
  override readonly name = "VerifierFailurePolicyError";
  readonly code: VerifierFailurePolicyErrorCode;
  readonly failureClass: string;
  readonly requestedSource: VerifierFailureClassSource | null;
  readonly matchCount: number;
  readonly candidateMappings: VerifierFailurePolicyErrorCandidate[];

  constructor(details: VerifierFailurePolicyErrorDetails) {
    super(details.message);
    this.code = details.code;
    this.failureClass = details.failureClass;
    this.requestedSource = details.requestedSource;
    this.matchCount = details.matchCount;
    this.candidateMappings = details.candidateMappings;
  }

  toJSON(): VerifierFailurePolicyErrorDetails {
    return {
      name: this.name,
      code: this.code,
      failureClass: this.failureClass,
      requestedSource: this.requestedSource,
      matchCount: this.matchCount,
      candidateMappings: this.candidateMappings,
      message: this.message,
    };
  }
}

export function resolveVerifierFailureAutoCorrectionRoute(
  failure: VerifierFailureRoutingInput,
  registry: readonly VerifierFailureClassRegistryEntry[] = VERIFIER_FAILURE_CLASS_REGISTRY,
): VerifierFailureRoutingDecision {
  const parsedFailure = VerifierFailureRoutingInputSchema.parse(failure);
  const matches = registry.filter((entry) =>
    entry.failureClass === parsedFailure.code
    && (!parsedFailure.source || entry.source === parsedFailure.source)
  );

  if (matches.length !== 1) {
    throw buildVerifierFailurePolicyError(
      parsedFailure.code,
      parsedFailure.source,
      matches,
    );
  }

  const [entry] = matches;

  return VerifierFailureRoutingDecisionSchema.parse({
    failureClass: entry.failureClass,
    source: entry.source,
    autoCorrectionScope: entry.permittedAutoCorrectionScope,
    summary: entry.summary,
    policy: entry.policy,
  });
}
