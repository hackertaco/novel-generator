import { z } from "zod";

import {
  MajorPlotActionLedgerIssueCodeSchema,
  parseSimulationEvent,
  SimulationCausalLedgerSchema,
  type MajorPlotActionLedgerIssueCode,
  type NormalizedSimulationEvent,
  type SimulationCausalLedger,
  type SimulationEvent,
} from "./causal-ledger";

export const CausalFailureReportSourceSchema = z.enum([
  "major_plot_action_validation",
  "long_form_continuity_validation",
]);

export const CausalFailureReportInputSchema = z.object({
  code: MajorPlotActionLedgerIssueCodeSchema,
  eventId: z.string().min(1),
  chapter: z.number().int().positive(),
  episode: z.number().int().positive(),
  message: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  stateKey: z.string().min(1).nullable().optional(),
  episodeId: z.string().min(1).optional(),
  referencedEventId: z.string().min(1).nullable().optional(),
  entityId: z.string().min(1).nullable().optional(),
  prerequisiteId: z.string().min(1).nullable().optional(),
  foreshadowId: z.string().min(1).nullable().optional(),
  source: CausalFailureReportSourceSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.message && !value.summary) {
    ctx.addIssue({
      code: "custom",
      path: ["message"],
      message: "failure report requires either message or summary",
    });
  }
});

export const CausalFailureReportSchema = CausalFailureReportInputSchema.transform(
  (value) => ({
    ...value,
    message: value.message ?? value.summary ?? "",
    source: value.source ?? "major_plot_action_validation",
    stateKey: value.stateKey ?? undefined,
    referencedEventId: value.referencedEventId ?? undefined,
    entityId: value.entityId ?? undefined,
    prerequisiteId: value.prerequisiteId ?? undefined,
    foreshadowId: value.foreshadowId ?? undefined,
  }),
);

export const RETROACTIVE_LEDGER_MUTATION_KINDS = [
  "patch_event_metadata",
  "insert_prerequisite_reference",
  "rewrite_prerequisite_reference",
  "resequence_event_chronology",
  "patch_involved_entities",
  "patch_location_linkage",
  "repair_prerequisite_state",
  "repair_resource_flow",
  "repair_relationship_transition",
  "rewrite_foreshadow_linkage",
  "split_conflicting_outcomes",
  "annotate_state_transition",
  "annotate_state_reversal_enabler",
] as const;

export const RetroactiveLedgerMutationKindSchema = z.enum(
  RETROACTIVE_LEDGER_MUTATION_KINDS,
);

export const RETROACTIVE_LEDGER_MUTATION_OPERATIONS = [
  "set",
  "insert",
  "remove",
  "move",
] as const;

export const RetroactiveLedgerMutationOperationSchema = z.enum(
  RETROACTIVE_LEDGER_MUTATION_OPERATIONS,
);

export const RetroactiveLedgerMutationAllowanceSchema = z.object({
  kind: RetroactiveLedgerMutationKindSchema,
  description: z.string().min(1),
  targetEventIds: z.array(z.string().min(1)).default([]),
  allowedFieldPaths: z.array(z.string().min(1)).default([]),
  allowedOperations: z.array(RetroactiveLedgerMutationOperationSchema).default(
    [],
  ),
});

export const RetroactiveLedgerSpanSchema = z.object({
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  startEventId: z.string().min(1),
  endEventId: z.string().min(1),
  startEpisode: z.number().int().positive(),
  endEpisode: z.number().int().positive(),
  eventIds: z.array(z.string().min(1)).min(1),
  anchorEventIds: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1),
});

export const RetroactiveReplayScopeSchema = z.object({
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  startEventId: z.string().min(1),
  endEventId: z.string().min(1),
  startEpisode: z.number().int().positive(),
  endEpisode: z.number().int().positive(),
  eventIds: z.array(z.string().min(1)).min(1),
  dependentEventIds: z.array(z.string().min(1)).default([]),
  impactedStateKeys: z.array(z.string().min(1)).default([]),
  reason: z.string().min(1),
});

export const RetroactiveCorrectionPlanSchema = z.object({
  failure: CausalFailureReportSchema,
  minimalAffectedSpan: RetroactiveLedgerSpanSchema,
  allowedLedgerMutations: z.array(RetroactiveLedgerMutationAllowanceSchema).min(1),
  replayScope: RetroactiveReplayScopeSchema,
  rationale: z.string().min(1),
});

export type CausalFailureReportSource = z.infer<
  typeof CausalFailureReportSourceSchema
>;
export type CausalFailureReportInput = z.input<
  typeof CausalFailureReportInputSchema
>;
export type CausalFailureReport = z.output<typeof CausalFailureReportSchema>;
export type RetroactiveLedgerMutationKind = z.infer<
  typeof RetroactiveLedgerMutationKindSchema
>;
export type RetroactiveLedgerMutationOperation = z.infer<
  typeof RetroactiveLedgerMutationOperationSchema
>;
export type RetroactiveLedgerMutationAllowance = z.infer<
  typeof RetroactiveLedgerMutationAllowanceSchema
>;
export type RetroactiveLedgerSpan = z.infer<
  typeof RetroactiveLedgerSpanSchema
>;
export type RetroactiveReplayScope = z.infer<
  typeof RetroactiveReplayScopeSchema
>;
export type RetroactiveCorrectionPlan = z.infer<
  typeof RetroactiveCorrectionPlanSchema
>;

export interface BuildRetroactiveCorrectionPlanOptions {
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>;
  failureReport: CausalFailureReportInput;
}

function normalizeLedgerInput(
  input: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
): NormalizedSimulationEvent[] {
  if (Array.isArray(input)) {
    return input.map((event) => parseSimulationEvent(event));
  }

  return SimulationCausalLedgerSchema.parse(input).events.map((event) =>
    parseSimulationEvent(event)
  );
}

function collectStringScalars(value: unknown, depth = 0): string[] {
  if (value === null || value === undefined || depth > 4) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringScalars(entry, depth + 1));
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((entry) =>
      collectStringScalars(entry, depth + 1)
    );
  }

  return [];
}

function buildEventIndex(events: ReadonlyArray<NormalizedSimulationEvent>): Map<string, number> {
  return new Map(events.map((event, index) => [event.id, index]));
}

function getEventByIndex(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  index: number,
): NormalizedSimulationEvent {
  const event = events[index];
  if (!event) {
    throw new Error(`Ledger event index "${index}" is out of bounds.`);
  }
  return event;
}

function findLastStateWriterIndex(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  stateKey: string,
  maxIndexExclusive: number,
): number | undefined {
  for (let index = maxIndexExclusive - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.stateChanges.some((change) => change.stateKey === stateKey)) {
      return index;
    }
  }
  return undefined;
}

function eventMentionsForeshadowId(
  event: NormalizedSimulationEvent,
  foreshadowId: string,
): boolean {
  const lowered = foreshadowId.trim().toLowerCase();
  if (!lowered) {
    return false;
  }

  return [
    event.id,
    event.summary,
    event.sceneId,
    ...event.tags,
    ...collectStringScalars(event.payload),
  ].some((value) =>
    typeof value === "string" && value.toLowerCase().includes(lowered)
  );
}

function findForeshadowAnchorIndices(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  foreshadowId: string,
): number[] {
  const indices: number[] = [];

  events.forEach((event, index) => {
    if (eventMentionsForeshadowId(event, foreshadowId)) {
      indices.push(index);
    }
  });

  return indices;
}

function buildAnchorIndices(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  failure: CausalFailureReport,
): number[] {
  const eventIndex = buildEventIndex(events);
  const failingEventIndex = eventIndex.get(failure.eventId);
  if (failingEventIndex === undefined) {
    throw new Error(
      `Causal failure references unknown event "${failure.eventId}".`,
    );
  }

  const anchors = new Set<number>([failingEventIndex]);

  if (failure.referencedEventId) {
    const referencedIndex = eventIndex.get(failure.referencedEventId);
    if (referencedIndex !== undefined) {
      anchors.add(referencedIndex);
    }
  }

  if (failure.stateKey) {
    const stateWriterIndex = findLastStateWriterIndex(
      events,
      failure.stateKey,
      failingEventIndex,
    );
    if (stateWriterIndex !== undefined) {
      anchors.add(stateWriterIndex);
    }
  }

  if (failure.foreshadowId) {
    for (const index of findForeshadowAnchorIndices(events, failure.foreshadowId)) {
      anchors.add(index);
    }
  }

  return [...anchors].sort((left, right) => left - right);
}

function describeSpanReason(
  failure: CausalFailureReport,
  anchorEventIds: ReadonlyArray<string>,
): string {
  switch (failure.code) {
    case "prerequisite_order_violation":
    case "unknown_prerequisite_event":
    case "missing_prerequisite_link":
      return `Span covers the failing event and its prerequisite anchors: ${anchorEventIds.join(", ")}.`;
    case "episode_order_violation":
      return `Span covers the chronology conflict between ${anchorEventIds.join(" and ")}.`;
    case "unmet_prerequisite_state":
    case "impossible_state_reversal":
      return `Span begins at the last state writer for "${failure.stateKey ?? "unknown"}" and ends at the failing event.`;
    case "foreshadow_order_violation":
      return `Span covers the setup/payoff ordering anchors for foreshadow "${failure.foreshadowId ?? "unknown"}".`;
    default:
      return `Span is limited to the smallest contiguous ledger section that contains the failure anchors: ${anchorEventIds.join(", ")}.`;
  }
}

function buildMinimalAffectedSpan(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  failure: CausalFailureReport,
): RetroactiveLedgerSpan {
  const anchorIndices = buildAnchorIndices(events, failure);
  const startIndex = anchorIndices[0] ?? 0;
  const endIndex = anchorIndices[anchorIndices.length - 1] ?? startIndex;
  const startEvent = getEventByIndex(events, startIndex);
  const endEvent = getEventByIndex(events, endIndex);
  const eventIds = events
    .slice(startIndex, endIndex + 1)
    .map((event) => event.id);
  const anchorEventIds = anchorIndices.map((index) => getEventByIndex(events, index).id);

  return RetroactiveLedgerSpanSchema.parse({
    startIndex,
    endIndex,
    startEventId: startEvent.id,
    endEventId: endEvent.id,
    startEpisode: startEvent.episode,
    endEpisode: endEvent.episode,
    eventIds,
    anchorEventIds,
    reason: describeSpanReason(failure, anchorEventIds),
  });
}

function eventDependsOnContext(
  event: NormalizedSimulationEvent,
  context: {
    affectedEventIds: Set<string>;
    impactedStateKeys: Set<string>;
    foreshadowIds: Set<string>;
  },
): string[] {
  const reasons: string[] = [];

  if (
    event.prerequisites.some(
      (prerequisite) =>
        prerequisite.eventId && context.affectedEventIds.has(prerequisite.eventId),
    )
  ) {
    reasons.push("references an affected prerequisite event");
  }

  if (
    event.prerequisites.some(
      (prerequisite) =>
        prerequisite.stateKey && context.impactedStateKeys.has(prerequisite.stateKey),
    )
  ) {
    reasons.push("depends on an impacted prerequisite state");
  }

  if (
    event.stateChanges.some((change) => context.impactedStateKeys.has(change.stateKey))
  ) {
    reasons.push("mutates an impacted state key");
  }

  if (
    [...context.foreshadowIds].some((foreshadowId) =>
      eventMentionsForeshadowId(event, foreshadowId),
    )
  ) {
    reasons.push("touches the same foreshadow track");
  }

  return reasons;
}

function buildReplayScope(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  failure: CausalFailureReport,
  span: RetroactiveLedgerSpan,
): RetroactiveReplayScope {
  const impactedStateKeys = new Set<string>();
  if (failure.stateKey) {
    impactedStateKeys.add(failure.stateKey);
  }

  for (const event of events.slice(span.startIndex, span.endIndex + 1)) {
    for (const change of event.stateChanges) {
      if (failure.stateKey && change.stateKey === failure.stateKey) {
        impactedStateKeys.add(change.stateKey);
      }
    }
  }

  const foreshadowIds = new Set<string>();
  if (failure.foreshadowId) {
    foreshadowIds.add(failure.foreshadowId);
  }

  const affectedEventIds = new Set(span.eventIds);
  const dependentEventIds: string[] = [];
  let replayEndIndex = span.endIndex;

  for (let index = span.endIndex + 1; index < events.length; index += 1) {
    const event = events[index];
    if (!event) {
      continue;
    }

    const reasons = eventDependsOnContext(event, {
      affectedEventIds,
      impactedStateKeys,
      foreshadowIds,
    });

    if (reasons.length === 0) {
      if (
        failure.code === "episode_order_violation"
        && event.episode === getEventByIndex(events, span.endIndex).episode
      ) {
        dependentEventIds.push(event.id);
        affectedEventIds.add(event.id);
        replayEndIndex = index;
      }
      continue;
    }

    dependentEventIds.push(event.id);
    affectedEventIds.add(event.id);
    replayEndIndex = index;
  }

  const replayEvents = events
    .slice(span.startIndex, replayEndIndex + 1)
    .map((event) => event.id);
  const replayEndEvent = getEventByIndex(events, replayEndIndex);

  const reason = dependentEventIds.length > 0
    ? `Replay extends through downstream dependents: ${dependentEventIds.join(", ")}.`
    : "Replay is bounded to the minimal affected span because no downstream dependencies were detected.";

  return RetroactiveReplayScopeSchema.parse({
    startIndex: span.startIndex,
    endIndex: replayEndIndex,
    startEventId: span.startEventId,
    endEventId: replayEndEvent.id,
    startEpisode: span.startEpisode,
    endEpisode: replayEndEvent.episode,
    eventIds: replayEvents,
    dependentEventIds,
    impactedStateKeys: [...impactedStateKeys],
    reason,
  });
}

function createMutationAllowance(
  kind: RetroactiveLedgerMutationKind,
  description: string,
  targetEventIds: ReadonlyArray<string>,
  allowedFieldPaths: ReadonlyArray<string>,
  allowedOperations: ReadonlyArray<RetroactiveLedgerMutationOperation>,
): RetroactiveLedgerMutationAllowance {
  return RetroactiveLedgerMutationAllowanceSchema.parse({
    kind,
    description,
    targetEventIds,
    allowedFieldPaths,
    allowedOperations,
  });
}

function buildAllowedLedgerMutations(
  failure: CausalFailureReport,
  span: RetroactiveLedgerSpan,
): RetroactiveLedgerMutationAllowance[] {
  const failingEventIds = [failure.eventId];
  const spanEventIds = span.eventIds;
  const field = failure.field ? [failure.field] : [];

  switch (failure.code as MajorPlotActionLedgerIssueCode) {
    case "missing_required_field":
      return [
        createMutationAllowance(
          "patch_event_metadata",
          "Patch only the missing required ledger metadata on the failing event.",
          failingEventIds,
          field.length > 0
            ? field
            : [
              "sceneId",
              "actorId",
              "targetId",
              "payload.subject",
              "payload.predicate",
              "payload.object",
              "payload.canonicalFact",
              "payload.canonicalSummary",
              "payload.triggeredBy",
              "payload.leadsTo",
            ],
          ["set"],
        ),
      ];
    case "missing_prerequisite_reference":
      return [
        createMutationAllowance(
          "insert_prerequisite_reference",
          "Add the missing prerequisite record without changing unrelated outcomes.",
          failingEventIds,
          ["prerequisites"],
          ["insert"],
        ),
      ];
    case "missing_prerequisite_link":
    case "unknown_prerequisite_event":
      return [
        createMutationAllowance(
          "rewrite_prerequisite_reference",
          "Retarget or remove the broken prerequisite event reference on the failing event.",
          failingEventIds,
          ["prerequisites", "prerequisites.eventId"],
          ["set", "remove", "insert"],
        ),
      ];
    case "prerequisite_order_violation":
      return [
        createMutationAllowance(
          "rewrite_prerequisite_reference",
          "Repair the prerequisite edge if the wrong predecessor is linked.",
          failingEventIds,
          ["prerequisites", "prerequisites.eventId"],
          ["set", "insert", "remove"],
        ),
        createMutationAllowance(
          "resequence_event_chronology",
          "Resequence only the events inside the affected span when chronology is correct but ordering is not.",
          spanEventIds,
          ["episode", "chapter", "sequence", "sceneId"],
          ["set", "move"],
        ),
      ];
    case "missing_entity_link":
      return [
        createMutationAllowance(
          "patch_involved_entities",
          "Repair only the event/entity linkage metadata.",
          failingEventIds,
          ["actorId", "targetId", "involvedEntities", "payload.recipients"],
          ["set", "insert", "remove"],
        ),
      ];
    case "missing_location_link":
      return [
        createMutationAllowance(
          "patch_location_linkage",
          "Repair only the location field and its derived involved-entity link.",
          failingEventIds,
          ["location", "involvedEntities"],
          ["set", "insert", "remove"],
        ),
      ];
    case "episode_order_violation":
      return [
        createMutationAllowance(
          "resequence_event_chronology",
          "Adjust chronology fields only inside the conflicting span.",
          spanEventIds,
          ["episode", "chapter", "sequence", "sceneId"],
          ["set", "move"],
        ),
      ];
    case "foreshadow_order_violation":
      return [
        createMutationAllowance(
          "resequence_event_chronology",
          "Move the setup/payoff chronology into a valid order within the affected span.",
          spanEventIds,
          ["episode", "chapter", "sequence", "sceneId"],
          ["set", "move"],
        ),
        createMutationAllowance(
          "rewrite_foreshadow_linkage",
          "Retarget only foreshadow linkage fields that anchor setup/payoff provenance.",
          spanEventIds,
          ["payload.triggeredBy", "payload.leadsTo", "tags", "sceneId"],
          ["set", "insert", "remove"],
        ),
      ];
    case "unmet_prerequisite_state":
      return [
        createMutationAllowance(
          "repair_prerequisite_state",
          "Repair only the prerequisite state edge and supporting state-key reference.",
          spanEventIds,
          ["prerequisites", "prerequisites.stateKey", "prerequisites.eventId"],
          ["set", "insert", "remove"],
        ),
        createMutationAllowance(
          "annotate_state_transition",
          "Amend only state-change metadata needed to expose the prerequisite transition in the ledger.",
          spanEventIds,
          ["stateChanges", "outcomes", "tags"],
          ["set", "insert", "remove"],
        ),
      ];
    case "unmet_prerequisite_resource":
      return [
        createMutationAllowance(
          "repair_resource_flow",
          "Repair only resource prerequisites and the matching inventory/outcome trace.",
          spanEventIds,
          ["prerequisites", "stateChanges", "outcomes", "payload.item"],
          ["set", "insert", "remove"],
        ),
      ];
    case "unmet_prerequisite_relationship":
      return [
        createMutationAllowance(
          "repair_relationship_transition",
          "Repair only relationship prerequisite links and the matching ledger state transitions.",
          spanEventIds,
          ["prerequisites", "stateChanges", "outcomes"],
          ["set", "insert", "remove"],
        ),
      ];
    case "mutually_exclusive_outcome":
      return [
        createMutationAllowance(
          "split_conflicting_outcomes",
          "Resolve only the conflicting outcomes/state changes on the failing event or split them into separate events inside the span.",
          spanEventIds,
          ["outcomes", "stateChanges", "payload"],
          ["set", "insert", "remove", "move"],
        ),
      ];
    case "impossible_state_reversal":
      return [
        createMutationAllowance(
          "annotate_state_reversal_enabler",
          "Add only the missing restoration or reversal enabler trace around the affected state change.",
          spanEventIds,
          ["prerequisites", "payload.triggeredBy", "tags", "stateChanges", "outcomes"],
          ["set", "insert", "remove"],
        ),
        createMutationAllowance(
          "resequence_event_chronology",
          "If the reversal is valid but misordered, resequence only the affected span.",
          spanEventIds,
          ["episode", "chapter", "sequence", "sceneId"],
          ["set", "move"],
        ),
      ];
    default:
      return [
        createMutationAllowance(
          "patch_event_metadata",
          "Default to a narrow metadata-only correction on the failing event.",
          failingEventIds,
          field.length > 0 ? field : ["tags"],
          ["set", "insert", "remove"],
        ),
      ];
  }
}

export function buildRetroactiveCorrectionPlan(
  options: BuildRetroactiveCorrectionPlanOptions,
): RetroactiveCorrectionPlan {
  const failure = CausalFailureReportSchema.parse(options.failureReport);
  const events = normalizeLedgerInput(options.ledger);
  const minimalAffectedSpan = buildMinimalAffectedSpan(events, failure);
  const replayScope = buildReplayScope(events, failure, minimalAffectedSpan);
  const allowedLedgerMutations = buildAllowedLedgerMutations(
    failure,
    minimalAffectedSpan,
  );

  const rationale =
    `${failure.message} The correction plan is constrained to `
    + `${minimalAffectedSpan.startEventId}..${minimalAffectedSpan.endEventId} `
    + `with replay through ${replayScope.endEventId}.`;

  return RetroactiveCorrectionPlanSchema.parse({
    failure,
    minimalAffectedSpan,
    allowedLedgerMutations,
    replayScope,
    rationale,
  });
}
