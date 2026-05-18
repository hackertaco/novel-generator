import { describe, expect, it } from "vitest";

import {
  CharacterMismatchValidationFailureCodeSchema,
  COGNITION_VERIFICATION_ISSUE_CODES,
  getPermittedVerifierAutoCorrectionScope,
  resolveVerifierFailureAutoCorrectionRoute,
  SUPPORTED_VERIFIER_FAILURE_CLASSES,
  VERIFIER_FAILURE_CLASS_POLICY_MAP,
  VERIFIER_FAILURE_CLASS_REGISTRY,
  VerifierFailureClassRegistryEntrySchema,
  VerifierFailurePolicyError,
} from "@/lib/sim";

describe("verifier failure policy registry", () => {
  it("covers every supported verifier failure class exactly once", () => {
    const registryClasses = VERIFIER_FAILURE_CLASS_REGISTRY.map(
      (entry) => entry.failureClass,
    );

    expect(new Set(registryClasses).size).toBe(registryClasses.length);
    expect([...registryClasses].sort()).toEqual(
      [...SUPPORTED_VERIFIER_FAILURE_CLASSES].sort(),
    );
  });

  it("assigns exactly one permitted auto-correction scope to each failure class", () => {
    expect(Object.keys(VERIFIER_FAILURE_CLASS_POLICY_MAP).sort()).toEqual(
      [...SUPPORTED_VERIFIER_FAILURE_CLASSES].sort(),
    );

    for (const failureClass of SUPPORTED_VERIFIER_FAILURE_CLASSES) {
      const registryEntry = VERIFIER_FAILURE_CLASS_REGISTRY.find(
        (entry) => entry.failureClass === failureClass,
      );

      expect(registryEntry).toBeDefined();
      expect(getPermittedVerifierAutoCorrectionScope(failureClass)).toBe(
        registryEntry?.permittedAutoCorrectionScope,
      );
    }
  });

  it("keeps verification issue and validation failure classes in sync with the registry", () => {
    expect([...SUPPORTED_VERIFIER_FAILURE_CLASSES].sort()).toEqual(
      [
        ...COGNITION_VERIFICATION_ISSUE_CODES,
        ...CharacterMismatchValidationFailureCodeSchema.options,
      ].sort(),
    );
  });

  it("locks the canonical correction paths for high-risk mismatch classes", () => {
    expect(getPermittedVerifierAutoCorrectionScope("missing_divergence_cause")).toBe(
      "divergence_cause_annotation",
    );
    expect(getPermittedVerifierAutoCorrectionScope("uncaused_mismatch")).toBe(
      "divergence_cause_annotation",
    );
    expect(getPermittedVerifierAutoCorrectionScope("missing_traceability_link")).toBe(
      "traceability_linkage",
    );
    expect(getPermittedVerifierAutoCorrectionScope("unexpected_divergence_cause")).toBe(
      "divergence_cause_removal",
    );
  });

  it("routes verification issues to exactly one auto-correction path", () => {
    const route = resolveVerifierFailureAutoCorrectionRoute({
      code: "missing_traceability_link",
      recordType: "memory",
      characterId: "hero",
      recordId: "memory:1",
      chapter: 12,
      factIds: ["fact:route"],
      severity: "error",
      message: "Traceability is missing.",
    });

    expect(route).toEqual({
      failureClass: "missing_traceability_link",
      source: "verification_issue",
      autoCorrectionScope: "traceability_linkage",
      summary: expect.any(String),
      policy: expect.any(String),
    });
  });

  it("routes validation failures to exactly one auto-correction path", () => {
    const route = resolveVerifierFailureAutoCorrectionRoute({
      code: "uncaused_mismatch",
      message: "No explicit cause is recorded.",
      mismatch: {
        recordType: "belief",
        recordId: "belief:1",
        characterId: "hero",
        chapter: 19,
        mismatchType: "canonical_conflict",
        factIds: ["fact:1"],
      },
      missingCause: {
        path: "divergenceCause",
        required: "explicit_divergence_cause",
        allowedKinds: ["misunderstanding"],
      },
      failureContext: {
        objectiveFactIds: ["fact:1"],
        traceabilityAnchors: ["event:1"],
        unresolvedTraceabilityReferences: [],
      },
    });

    expect(route).toEqual({
      failureClass: "uncaused_mismatch",
      source: "validation_failure",
      autoCorrectionScope: "divergence_cause_annotation",
      summary: expect.any(String),
      policy: expect.any(String),
    });
  });

  it("uses the requested source to disambiguate duplicate failure-class entries", () => {
    const mixedSourceRegistry = [
      ...VERIFIER_FAILURE_CLASS_REGISTRY,
      VerifierFailureClassRegistryEntrySchema.parse({
        failureClass: "missing_divergence_cause",
        source: "validation_failure",
        permittedAutoCorrectionScope: "divergence_trace_enrichment",
        summary: "Persisted mismatch record is missing its explicit cause annotation.",
        policy: "Auto-correction may only add the missing persisted trace evidence for this validation failure.",
      }),
    ];

    expect(
      resolveVerifierFailureAutoCorrectionRoute(
        {
          code: "missing_divergence_cause",
          source: "verification_issue",
        },
        mixedSourceRegistry,
      ),
    ).toEqual({
      failureClass: "missing_divergence_cause",
      source: "verification_issue",
      autoCorrectionScope: "divergence_cause_annotation",
      summary: expect.any(String),
      policy: expect.any(String),
    });

    expect(
      resolveVerifierFailureAutoCorrectionRoute(
        {
          code: "missing_divergence_cause",
          source: "validation_failure",
        },
        mixedSourceRegistry,
      ),
    ).toEqual({
      failureClass: "missing_divergence_cause",
      source: "validation_failure",
      autoCorrectionScope: "divergence_trace_enrichment",
      summary: expect.any(String),
      policy: expect.any(String),
    });
  });

  it("raises a structured policy error for unmapped verifier failures", () => {
    expect.assertions(4);

    try {
      resolveVerifierFailureAutoCorrectionRoute({
        code: "invented_failure_class",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(VerifierFailurePolicyError);
      expect(error).toMatchObject({
        code: "unmapped_failure_class",
        failureClass: "invented_failure_class",
        requestedSource: null,
        matchCount: 0,
      });
      expect((error as VerifierFailurePolicyError).candidateMappings).toEqual([]);
      expect((error as VerifierFailurePolicyError).toJSON()).toMatchObject({
        name: "VerifierFailurePolicyError",
        code: "unmapped_failure_class",
        failureClass: "invented_failure_class",
        requestedSource: null,
        matchCount: 0,
        candidateMappings: [],
      });
    }
  });

  it("raises a structured policy error when a known class has no route for the requested source", () => {
    expect.assertions(4);

    try {
      resolveVerifierFailureAutoCorrectionRoute({
        code: "missing_traceability_link",
        source: "validation_failure",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(VerifierFailurePolicyError);
      expect(error).toMatchObject({
        code: "unmapped_failure_class",
        failureClass: "missing_traceability_link",
        requestedSource: "validation_failure",
        matchCount: 0,
      });
      expect((error as VerifierFailurePolicyError).candidateMappings).toEqual([]);
      expect((error as VerifierFailurePolicyError).toJSON()).toMatchObject({
        name: "VerifierFailurePolicyError",
        code: "unmapped_failure_class",
        failureClass: "missing_traceability_link",
        requestedSource: "validation_failure",
      });
    }
  });

  it("raises a structured policy error when multiple policies match one failure class", () => {
    const ambiguousRegistry = [
      ...VERIFIER_FAILURE_CLASS_REGISTRY,
      VerifierFailureClassRegistryEntrySchema.parse({
        failureClass: "missing_divergence_cause",
        source: "validation_failure",
        permittedAutoCorrectionScope: "divergence_trace_enrichment",
        summary: "Ambiguous duplicate route used to verify resolver safeguards.",
        policy: "This duplicate entry should never be selected automatically.",
      }),
    ];

    expect.assertions(4);

    try {
      resolveVerifierFailureAutoCorrectionRoute(
        {
          code: "missing_divergence_cause",
        },
        ambiguousRegistry,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(VerifierFailurePolicyError);
      expect(error).toMatchObject({
        code: "ambiguous_failure_class_mapping",
        failureClass: "missing_divergence_cause",
        requestedSource: null,
        matchCount: 2,
      });
      expect((error as VerifierFailurePolicyError).candidateMappings).toEqual([
        {
          failureClass: "missing_divergence_cause",
          source: "verification_issue",
          permittedAutoCorrectionScope: "divergence_cause_annotation",
        },
        {
          failureClass: "missing_divergence_cause",
          source: "validation_failure",
          permittedAutoCorrectionScope: "divergence_trace_enrichment",
        },
      ]);
      expect((error as VerifierFailurePolicyError).toJSON()).toMatchObject({
        name: "VerifierFailurePolicyError",
        code: "ambiguous_failure_class_mapping",
        failureClass: "missing_divergence_cause",
        requestedSource: null,
        matchCount: 2,
      });
    }
  });
});
