import {
  createSimulationValidationVerdict,
  listCharacterBeliefInterpretations,
  listCharacterMemories,
  verifyCharacterCognitionConsistency,
  type CharacterBeliefInterpretationRecord,
  type CharacterBeliefRecord,
  type SimulationValidationVerdict,
  type WorldStateAuthority,
} from "../sim";

type BeliefFailureRecord = {
  characterId: string;
  recordId: string;
  issueCodes: string[];
};

type RecoveryTemplate = Pick<
  CharacterBeliefRecord,
  | "chapter"
  | "kind"
  | "subject"
  | "belief"
  | "confidence"
  | "cause"
  | "canonicalAlignment"
  | "divergenceCause"
  | "references"
  | "tags"
>;

interface CharacterRecoveryPlan {
  characterId: string;
  targetedBeliefIds: string[];
  selectedMemoryIds: string[];
  templatesByMemoryId: Map<string, RecoveryTemplate[]>;
}

export type BeliefInterpretationRecoveryStatus =
  | "not_needed"
  | "skipped"
  | "recovered"
  | "partial"
  | "failed";

export interface BeliefInterpretationRecoveryCheckpoint {
  passed: boolean;
  issueCount: number;
  invalidContradictionCount: number;
  targetedIssueCount: number;
  targetedInvalidContradictionCount: number;
}

export interface BeliefInterpretationRecoveryRecomputeRecord {
  characterId: string;
  targetedBeliefIds: string[];
  selectedMemoryIds: string[];
  removedBeliefIds: string[];
  invalidatedInterpretationIds: string[];
  createdBeliefIds: string[];
  createdInterpretationIds: string[];
}

export interface BeliefInterpretationRecoveryReport {
  chapter: number;
  attempted: boolean;
  status: BeliefInterpretationRecoveryStatus;
  triggerIssueCodes: string[];
  targetedBeliefIds: string[];
  targetedCharacterIds: string[];
  selectedMemoryIds: string[];
  recomputations: BeliefInterpretationRecoveryRecomputeRecord[];
  before: BeliefInterpretationRecoveryCheckpoint;
  after: BeliefInterpretationRecoveryCheckpoint;
  recoveredBeliefIds: string[];
  unresolvedBeliefIds: string[];
  message: string;
}

export interface BeliefInterpretationRecoveryResult {
  report: BeliefInterpretationRecoveryReport;
  verification: SimulationValidationVerdict;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function mergeRecoveryTemplate(
  belief: CharacterBeliefRecord,
  interpretation: CharacterBeliefInterpretationRecord | undefined,
): RecoveryTemplate {
  return {
    chapter: interpretation?.chapter ?? belief.chapter,
    kind: interpretation?.kind ?? belief.kind,
    subject: interpretation?.subject ?? belief.subject,
    belief: interpretation?.belief ?? belief.belief,
    confidence: interpretation?.confidence ?? belief.confidence,
    cause: interpretation?.cause ?? belief.cause,
    canonicalAlignment:
      interpretation?.canonicalAlignment ?? belief.canonicalAlignment,
    divergenceCause:
      interpretation?.divergenceCause ?? belief.divergenceCause,
    references: {
      eventId: interpretation?.references.eventId ?? belief.references.eventId,
      objectiveFactIds: uniqueStrings([
        ...belief.references.objectiveFactIds,
        ...(interpretation?.references.objectiveFactIds ?? []),
      ]),
      memoryIds: uniqueStrings([
        ...belief.references.memoryIds,
        ...(interpretation?.references.memoryIds ?? []),
      ]),
      utteranceIds: uniqueStrings([
        ...belief.references.utteranceIds,
        ...(interpretation?.references.utteranceIds ?? []),
      ]),
      relatedCharacterIds: uniqueStrings([
        ...belief.references.relatedCharacterIds,
        ...(interpretation?.references.relatedCharacterIds ?? []),
      ]),
    },
    tags: uniqueStrings([
      ...belief.tags,
      ...(interpretation?.tags ?? []),
      "belief:recovered-from-memory",
    ]),
  };
}

function collectBeliefFailures(
  verdict: SimulationValidationVerdict,
): BeliefFailureRecord[] {
  const byRecordId = new Map<string, BeliefFailureRecord>();

  for (const issue of verdict.issues) {
    if (issue.recordType !== "belief") {
      continue;
    }

    const current = byRecordId.get(issue.recordId) ?? {
      characterId: issue.characterId,
      recordId: issue.recordId,
      issueCodes: [],
    };
    current.issueCodes.push(issue.code);
    byRecordId.set(issue.recordId, current);
  }

  for (const mismatch of verdict.invalidContradictions) {
    if (mismatch.recordType !== "belief") {
      continue;
    }

    const current = byRecordId.get(mismatch.recordId) ?? {
      characterId: mismatch.characterId,
      recordId: mismatch.recordId,
      issueCodes: [],
    };
    current.issueCodes.push(...mismatch.issueCodes);
    byRecordId.set(mismatch.recordId, current);
  }

  return Array.from(byRecordId.values()).map((record) => ({
    ...record,
    issueCodes: uniqueStrings(record.issueCodes),
  }));
}

function buildCharacterRecoveryPlans(
  authority: WorldStateAuthority,
  failures: BeliefFailureRecord[],
): CharacterRecoveryPlan[] {
  const state = authority.getSimulationState();
  const byCharacter = new Map<string, CharacterRecoveryPlan>();

  for (const failure of failures) {
    const belief = state.beliefs[failure.characterId]?.byId[failure.recordId];
    if (!belief) {
      continue;
    }
    const knownMemoryIds = new Set(
      listCharacterMemories(state.memories, failure.characterId).map(
        (memory) => memory.id,
      ),
    );

    const interpretations = listCharacterBeliefInterpretations(
      state.beliefInterpretations,
      failure.characterId,
      {
        producedBeliefIds: [failure.recordId],
      },
    );
    const memoryIds = uniqueStrings([
      ...belief.references.memoryIds.filter((memoryId) =>
        knownMemoryIds.has(memoryId)
      ),
      ...interpretations.flatMap((interpretation) => interpretation.sourceMemoryIds),
    ]);

    const plan = byCharacter.get(failure.characterId) ?? {
      characterId: failure.characterId,
      targetedBeliefIds: [],
      selectedMemoryIds: [],
      templatesByMemoryId: new Map<string, RecoveryTemplate[]>(),
    };
    plan.targetedBeliefIds.push(failure.recordId);

    const fallbackTemplate = mergeRecoveryTemplate(
      belief,
      interpretations.at(-1),
    );
    for (const memoryId of memoryIds) {
      plan.selectedMemoryIds.push(memoryId);
      const scopedInterpretations = interpretations.filter((interpretation) =>
        interpretation.sourceMemoryIds.includes(memoryId)
      );
      const templates = scopedInterpretations.length > 0
        ? scopedInterpretations.map((interpretation) =>
            mergeRecoveryTemplate(belief, interpretation)
          )
        : [fallbackTemplate];
      const existingTemplates = plan.templatesByMemoryId.get(memoryId) ?? [];
      plan.templatesByMemoryId.set(memoryId, [
        ...existingTemplates,
        ...templates,
      ]);
    }

    byCharacter.set(failure.characterId, plan);
  }

  return Array.from(byCharacter.values()).map((plan) => ({
    ...plan,
    targetedBeliefIds: uniqueStrings(plan.targetedBeliefIds),
    selectedMemoryIds: uniqueStrings(plan.selectedMemoryIds),
    templatesByMemoryId: new Map(
      Array.from(plan.templatesByMemoryId.entries()).map(([memoryId, templates]) => [
        memoryId,
        templates,
      ]),
    ),
  }));
}

function countIssuesForBeliefIds(
  verdict: SimulationValidationVerdict,
  beliefIds: Set<string>,
): number {
  return verdict.issues.filter(
    (issue) => issue.recordType === "belief" && beliefIds.has(issue.recordId),
  ).length;
}

function countInvalidContradictionsForBeliefIds(
  verdict: SimulationValidationVerdict,
  beliefIds: Set<string>,
): number {
  return verdict.invalidContradictions.filter(
    (mismatch) =>
      mismatch.recordType === "belief" && beliefIds.has(mismatch.recordId),
  ).length;
}

function buildCheckpoint(
  verdict: SimulationValidationVerdict,
  targetedBeliefIds: Set<string>,
): BeliefInterpretationRecoveryCheckpoint {
  return {
    passed: verdict.passed,
    issueCount: verdict.issueCount,
    invalidContradictionCount: verdict.invalidContradictionCount,
    targetedIssueCount: countIssuesForBeliefIds(verdict, targetedBeliefIds),
    targetedInvalidContradictionCount: countInvalidContradictionsForBeliefIds(
      verdict,
      targetedBeliefIds,
    ),
  };
}

function executeCharacterRecoveryPlan(
  authority: WorldStateAuthority,
  plan: CharacterRecoveryPlan,
): BeliefInterpretationRecoveryRecomputeRecord {
  const state = authority.getSimulationState();
  const knownEventIds = new Set(state.eventLog.map((event) => event.id));
  const beliefState = state.beliefs[plan.characterId];
  const manuallyRemovedBeliefIds: string[] = [];
  if (beliefState) {
    const targetedBeliefIdSet = new Set(plan.targetedBeliefIds);
    beliefState.timeline = beliefState.timeline.filter((beliefId) => {
      if (!targetedBeliefIdSet.has(beliefId)) {
        return true;
      }
      manuallyRemovedBeliefIds.push(beliefId);
      delete beliefState.byId[beliefId];
      return false;
    });
  }

  const recomputation = authority.recomputeBeliefsFromMemories({
    characterId: plan.characterId,
    scope: {
      memoryIds: plan.selectedMemoryIds,
    },
    deriveBeliefs: ({ memory }) => {
      const templates = plan.templatesByMemoryId.get(memory.id) ?? [];
      return templates.map((template) => ({
        chapter: template.chapter,
        kind: template.kind,
        subject: template.subject,
        belief: template.belief,
        confidence: template.confidence,
        cause: template.cause,
        canonicalAlignment: template.canonicalAlignment,
        divergenceCause: template.divergenceCause
          ? {
            ...template.divergenceCause,
            sourceEventId:
              template.divergenceCause.sourceEventId
              ?? (memory.references.eventId
                && knownEventIds.has(memory.references.eventId)
                ? memory.references.eventId
                : undefined),
          }
          : undefined,
        references: {
          ...template.references,
          memoryIds: template.references.memoryIds.filter((memoryId) =>
            plan.selectedMemoryIds.includes(memoryId)
          ),
        },
        tags: template.tags,
      }));
    },
  });

  return {
    characterId: plan.characterId,
    targetedBeliefIds: plan.targetedBeliefIds,
    selectedMemoryIds: plan.selectedMemoryIds,
    removedBeliefIds: uniqueStrings([
      ...manuallyRemovedBeliefIds,
      ...recomputation.removedBeliefIds,
    ]),
    invalidatedInterpretationIds: recomputation.invalidatedInterpretationIds,
    createdBeliefIds: recomputation.createdBeliefs.map((belief) => belief.id),
    createdInterpretationIds: recomputation.createdInterpretations.map(
      (interpretation) => interpretation.id,
    ),
  };
}

export function recoverBeliefInterpretationFailures(
  authority: WorldStateAuthority,
  chapter: number,
  verification: SimulationValidationVerdict,
): BeliefInterpretationRecoveryResult {
  const failures = collectBeliefFailures(verification);
  const targetedBeliefIds = new Set(failures.map((failure) => failure.recordId));
  const before = buildCheckpoint(verification, targetedBeliefIds);

  if (failures.length === 0) {
    return {
      report: {
        chapter,
        attempted: false,
        status: "not_needed",
        triggerIssueCodes: [],
        targetedBeliefIds: [],
        targetedCharacterIds: [],
        selectedMemoryIds: [],
        recomputations: [],
        before,
        after: before,
        recoveredBeliefIds: [],
        unresolvedBeliefIds: [],
        message: "No belief interpretation failures were detected for recovery.",
      },
      verification,
    };
  }

  const plans = buildCharacterRecoveryPlans(authority, failures).filter(
    (plan) => plan.selectedMemoryIds.length > 0,
  );

  if (plans.length === 0) {
    return {
      report: {
        chapter,
        attempted: false,
        status: "skipped",
        triggerIssueCodes: uniqueStrings(
          failures.flatMap((failure) => failure.issueCodes),
        ),
        targetedBeliefIds: Array.from(targetedBeliefIds),
        targetedCharacterIds: uniqueStrings(
          failures.map((failure) => failure.characterId),
        ),
        selectedMemoryIds: [],
        recomputations: [],
        before,
        after: before,
        recoveredBeliefIds: [],
        unresolvedBeliefIds: Array.from(targetedBeliefIds),
        message:
          "Belief interpretation recovery was skipped because no source memories were linked to the failing beliefs.",
      },
      verification,
    };
  }

  const recomputations = plans.map((plan) =>
    executeCharacterRecoveryPlan(authority, plan)
  );
  const updatedVerification = createSimulationValidationVerdict(
    verifyCharacterCognitionConsistency(authority.getSimulationState()),
  );
  const relevantBeliefIds = new Set([
    ...targetedBeliefIds,
    ...recomputations.flatMap((recompute) => recompute.createdBeliefIds),
  ]);
  const after = buildCheckpoint(updatedVerification, relevantBeliefIds);
  const unresolvedBeliefIds = uniqueStrings([
    ...updatedVerification.issues
      .filter(
        (issue) =>
          issue.recordType === "belief" && relevantBeliefIds.has(issue.recordId),
      )
      .map((issue) => issue.recordId),
    ...updatedVerification.invalidContradictions
      .filter(
        (mismatch) =>
          mismatch.recordType === "belief"
          && relevantBeliefIds.has(mismatch.recordId),
      )
      .map((mismatch) => mismatch.recordId),
  ]);
  const recoveredBeliefIds = Array.from(targetedBeliefIds).filter(
    (beliefId) => !unresolvedBeliefIds.includes(beliefId),
  );
  const beforeTargetedCount =
    before.targetedIssueCount + before.targetedInvalidContradictionCount;
  const afterTargetedCount =
    after.targetedIssueCount + after.targetedInvalidContradictionCount;
  const status: BeliefInterpretationRecoveryStatus =
    afterTargetedCount === 0
      ? "recovered"
      : afterTargetedCount < beforeTargetedCount
        ? "partial"
        : "failed";

  return {
    report: {
      chapter,
      attempted: true,
      status,
      triggerIssueCodes: uniqueStrings(
        failures.flatMap((failure) => failure.issueCodes),
      ),
      targetedBeliefIds: Array.from(targetedBeliefIds),
      targetedCharacterIds: uniqueStrings(
        failures.map((failure) => failure.characterId),
      ),
      selectedMemoryIds: uniqueStrings(
        recomputations.flatMap((recompute) => recompute.selectedMemoryIds),
      ),
      recomputations,
      before,
      after,
      recoveredBeliefIds,
      unresolvedBeliefIds,
      message:
        status === "recovered"
          ? "Belief interpretation recovery rebuilt the failing belief set from existing memories."
          : status === "partial"
            ? "Belief interpretation recovery reduced, but did not eliminate, the targeted belief failures."
            : "Belief interpretation recovery reran from existing memories but the targeted belief failures remain.",
    },
    verification: updatedVerification,
  };
}
