import { z } from "zod";
import type { SimulationState } from "./types";

import {
  CharacterBeliefConfidenceSchema,
  CharacterBeliefKindSchema,
  CharacterBeliefStatusSchema,
} from "./belief-state";
import {
  CharacterBeliefCanonicalAlignmentSchema,
  CharacterDivergenceCauseSchema,
} from "./cognitive-dissonance";
import {
  CharacterMemoryAccuracySchema,
  CharacterMemoryKindSchema,
} from "./memory-state";

export const KnowledgeVisibilitySchema = z.enum([
  "private",
  "shared",
  "audience",
]);

export const SimulationEventTypeSchema = z.enum([
  "plot_action",
  "move",
  "status_change",
  "obtain_item",
  "lose_item",
  "learn_fact",
  "relationship_shift",
  "open_thread",
  "resolve_thread",
]);

export const SimulationEventEntityTypeSchema = z.enum([
  "character",
  "item",
  "location",
  "thread",
  "concept",
  "fact",
  "relationship",
  "scene",
  "world",
]);

export const SimulationEventEntityRoleSchema = z.enum([
  "actor",
  "target",
  "recipient",
  "witness",
  "location",
  "subject",
  "object",
  "affected",
]);

export const SimulationEventPrerequisiteTypeSchema = z.enum([
  "event",
  "objective_fact",
  "memory",
  "belief",
  "utterance",
  "thread",
  "scene_state",
  "world_rule",
]);

export const SimulationEventOutcomeTypeSchema = z.enum([
  "objective_fact_created",
  "objective_fact_closed",
  "memory_recorded",
  "belief_recorded",
  "utterance_recorded",
  "character_state_changed",
  "thread_opened",
  "thread_resolved",
  "knowledge_revealed",
  "inventory_changed",
  "relationship_changed",
]);

export const SimulationEventStateDomainSchema = z.enum([
  "world_model",
  "hidden_truth",
  "objective_facts",
  "character_state",
  "memories",
  "beliefs",
  "utterances",
  "threads",
]);

export const SimulationEventStateOperationSchema = z.enum([
  "create",
  "update",
  "close",
  "record",
  "interpret",
  "reveal",
  "open",
  "resolve",
  "remove",
]);

export const SimulationEventCorrectionOperationSchema = z.enum([
  "set",
  "insert",
  "remove",
  "move",
]);

export const EventMemoryUpdateInputSchema = z.object({
  characterId: z.string().min(1),
  summary: z.string().min(1).optional(),
  kind: CharacterMemoryKindSchema.optional(),
  location: z.string().min(1).nullable().optional(),
  emotionalTone: z.string().min(1).optional(),
  truthAlignment: CharacterMemoryAccuracySchema.optional(),
  cause: z.string().min(1).optional(),
  divergenceCause: CharacterDivergenceCauseSchema.optional(),
  objectiveFactIds: z.array(z.string().min(1)).optional(),
  relatedCharacterIds: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

export const EventBeliefUpdateInputSchema = z.object({
  characterId: z.string().min(1),
  kind: CharacterBeliefKindSchema,
  subject: z.string().min(1),
  belief: z.string().min(1),
  confidence: CharacterBeliefConfidenceSchema.optional(),
  cause: z.string().min(1),
  canonicalAlignment: CharacterBeliefCanonicalAlignmentSchema.optional(),
  divergenceCause: CharacterDivergenceCauseSchema.optional(),
  status: CharacterBeliefStatusSchema.optional(),
  supersededByBeliefId: z.string().min(1).optional(),
  objectiveFactIds: z.array(z.string().min(1)).optional(),
  memoryIds: z.array(z.string().min(1)).optional(),
  relatedCharacterIds: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

export const SimulationEventCognitionSchema = z.object({
  memoryUpdates: z.array(EventMemoryUpdateInputSchema).default([]),
  beliefUpdates: z.array(EventBeliefUpdateInputSchema).default([]),
});

export const SimulationEventInvolvedEntitySchema = z.object({
  entityId: z.string().min(1),
  entityType: SimulationEventEntityTypeSchema,
  role: SimulationEventEntityRoleSchema,
  label: z.string().min(1).optional(),
});

export const SimulationEventPrerequisiteSchema = z.object({
  prerequisiteId: z.string().min(1),
  type: SimulationEventPrerequisiteTypeSchema,
  description: z.string().min(1),
  entityId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  stateKey: z.string().min(1).optional(),
});

export const SimulationEventStateChangeSchema = z.object({
  changeId: z.string().min(1),
  domain: SimulationEventStateDomainSchema,
  operation: SimulationEventStateOperationSchema,
  stateKey: z.string().min(1),
  summary: z.string().min(1),
  entityIds: z.array(z.string().min(1)).default([]),
  resultingRecordId: z.string().min(1).optional(),
  beforeValue: z.unknown().optional(),
  afterValue: z.unknown().optional(),
});

export const SimulationEventOutcomeSchema = z.object({
  outcomeId: z.string().min(1),
  type: SimulationEventOutcomeTypeSchema,
  summary: z.string().min(1),
  stateChangeIds: z.array(z.string().min(1)).default([]),
  resultingRecordIds: z.array(z.string().min(1)).default([]),
  resultingFactIds: z.array(z.string().min(1)).default([]),
});

export const SimulationEventCorrectionWindowSchema = z.object({
  startEventId: z.string().min(1),
  endEventId: z.string().min(1),
  startEpisode: z.number().int().positive(),
  endEpisode: z.number().int().positive(),
  eventIds: z.array(z.string().min(1)).min(1),
});

export const SimulationEventCorrectionEditSchema = z.object({
  mutationKind: z.string().min(1),
  fieldPath: z.string().min(1),
  operation: SimulationEventCorrectionOperationSchema,
  beforeValue: z.unknown().optional(),
  afterValue: z.unknown().optional(),
});

export const SimulationEventCorrectionRecordSchema = z.object({
  correctionId: z.string().min(1),
  source: z.enum([
    "major_plot_action_validation",
    "long_form_continuity_validation",
  ]),
  failureCode: z.string().min(1),
  failureEventId: z.string().min(1),
  referencedEventId: z.string().min(1).optional(),
  prerequisiteId: z.string().min(1).optional(),
  stateKey: z.string().min(1).optional(),
  foreshadowId: z.string().min(1).optional(),
  approvedWindow: SimulationEventCorrectionWindowSchema,
  replayWindow: SimulationEventCorrectionWindowSchema,
  rationale: z.string().min(1),
  edits: z.array(SimulationEventCorrectionEditSchema).min(1),
});

const SimulationEventBaseSchema = z.object({
  id: z.string().min(1),
  episode: z.number().int().positive().optional(),
  chapter: z.number().int().positive(),
  sequence: z.number().int().positive().optional(),
  sceneId: z.string().min(1).optional(),
  type: SimulationEventTypeSchema,
  actorId: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  location: z.string().min(1).nullable().optional(),
  summary: z.string().min(1),
  prerequisites: z.array(SimulationEventPrerequisiteSchema).default([]),
  involvedEntities: z.array(SimulationEventInvolvedEntitySchema).default([]),
  outcomes: z.array(SimulationEventOutcomeSchema).default([]),
  stateChanges: z.array(SimulationEventStateChangeSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),
  payload: z.record(z.string(), z.unknown()).optional(),
  cognition: SimulationEventCognitionSchema.optional(),
  corrections: z.array(SimulationEventCorrectionRecordSchema).default([]),
});

function normalizeIdSegment(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  if (!trimmed) {
    return "unknown";
  }

  return Array.from(trimmed)
    .map((char) => char.codePointAt(0)?.toString(16) ?? "x")
    .join("-");
}

function mergeInvolvedEntities(
  explicit: ReadonlyArray<SimulationEventInvolvedEntity>,
  inferred: ReadonlyArray<SimulationEventInvolvedEntity>,
): SimulationEventInvolvedEntity[] {
  const merged = new Map<string, SimulationEventInvolvedEntity>();

  for (const entity of [...explicit, ...inferred]) {
    const key = `${entity.role}:${entity.entityType}:${entity.entityId}`;
    if (!merged.has(key)) {
      merged.set(key, entity);
    }
  }

  return Array.from(merged.values());
}

function inferInvolvedEntities(
  value: z.input<typeof SimulationEventBaseSchema>,
): SimulationEventInvolvedEntity[] {
  const inferred: SimulationEventInvolvedEntity[] = [];
  const payload = value.payload;

  if (value.actorId) {
    inferred.push({
      entityId: value.actorId,
      entityType: "character",
      role: "actor",
    });
  }

  if (value.targetId) {
    inferred.push({
      entityId: value.targetId,
      entityType: "character",
      role: "target",
    });
  }

  if (typeof value.location === "string" && value.location.length > 0) {
    inferred.push({
      entityId: `location:${normalizeIdSegment(value.location)}`,
      entityType: "location",
      role: "location",
      label: value.location,
    });
  }

  if (Array.isArray(payload?.recipients)) {
    for (const recipient of payload.recipients) {
      inferred.push({
        entityId: String(recipient),
        entityType: "character",
        role: "recipient",
      });
    }
  }

  if (typeof payload?.threadId === "string") {
    inferred.push({
      entityId: payload.threadId,
      entityType: "thread",
      role: "affected",
      label: typeof payload.title === "string" ? payload.title : payload.threadId,
    });
  }

  if (typeof payload?.item === "string") {
    inferred.push({
      entityId: `item:${normalizeIdSegment(payload.item)}`,
      entityType: "item",
      role: "affected",
      label: payload.item,
    });
  }

  if (typeof payload?.subject === "string") {
    inferred.push({
      entityId: `concept:${normalizeIdSegment(payload.subject)}`,
      entityType: "concept",
      role: "subject",
      label: payload.subject,
    });
  }

  if (typeof payload?.object === "string") {
    inferred.push({
      entityId: `concept:${normalizeIdSegment(payload.object)}`,
      entityType: "concept",
      role: "object",
      label: payload.object,
    });
  }

  return inferred;
}

export const SimulationEventSchema = SimulationEventBaseSchema.superRefine(
  (value, ctx) => {
    if (
      value.episode !== undefined
      && value.chapter !== undefined
      && value.episode !== value.chapter
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["episode"],
        message: "episode must match chapter when both are provided",
      });
    }
  },
).transform((value) => {
  const involvedEntities = mergeInvolvedEntities(
    value.involvedEntities,
    inferInvolvedEntities(value),
  );

  return {
    ...value,
    episode: value.episode ?? value.chapter,
    involvedEntities,
  };
});

export const SimulationCausalLedgerSchema = z.object({
  version: z.literal("sim-causal-ledger.v1"),
  events: z.array(SimulationEventSchema),
});

export const SimulationCausalLedgerEpisodeRangeSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
}).superRefine((value, ctx) => {
  if (value.end < value.start) {
    ctx.addIssue({
      code: "custom",
      path: ["end"],
      message: "episodeRange.end must be greater than or equal to start",
    });
  }
});

export const SimulationCausalLedgerQuerySchema = z.object({
  episode: z.number().int().positive().optional(),
  episodeRange: SimulationCausalLedgerEpisodeRangeSchema.optional(),
  eventId: z.string().min(1).optional(),
  eventType: SimulationEventTypeSchema.optional(),
  actorId: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  involvedEntityId: z.string().min(1).optional(),
  involvedEntityType: SimulationEventEntityTypeSchema.optional(),
  tag: z.string().min(1).optional(),
  prerequisiteType: SimulationEventPrerequisiteTypeSchema.optional(),
  outcomeType: SimulationEventOutcomeTypeSchema.optional(),
  stateDomain: SimulationEventStateDomainSchema.optional(),
  stateOperation: SimulationEventStateOperationSchema.optional(),
  sceneId: z.string().min(1).optional(),
  limit: z.number().int().positive().optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
}).superRefine((value, ctx) => {
  if (value.episode !== undefined && value.episodeRange) {
    ctx.addIssue({
      code: "custom",
      path: ["episodeRange"],
      message: "query cannot specify both episode and episodeRange",
    });
  }
});

export const SimulationCausalLedgerQueryResultSchema = z.object({
  version: z.literal("sim-causal-ledger.v1"),
  totalEventCount: z.number().int().nonnegative(),
  matchedEventCount: z.number().int().nonnegative(),
  events: z.array(SimulationEventSchema),
});

export const MajorPlotActionLedgerIssueCodeSchema = z.enum([
  "missing_required_field",
  "missing_prerequisite_reference",
  "missing_prerequisite_link",
  "missing_entity_link",
  "missing_location_link",
  "episode_order_violation",
  "prerequisite_order_violation",
  "foreshadow_order_violation",
  "unknown_prerequisite_event",
  "unmet_prerequisite_state",
  "unmet_prerequisite_resource",
  "unmet_prerequisite_relationship",
  "mutually_exclusive_outcome",
  "impossible_state_reversal",
]);

export const MajorPlotActionLedgerIssueSchema = z.object({
  code: MajorPlotActionLedgerIssueCodeSchema,
  eventId: z.string().min(1),
  chapter: z.number().int().positive(),
  episode: z.number().int().positive(),
  message: z.string().min(1),
  field: z.string().min(1).optional(),
  stateKey: z.string().min(1).optional(),
  episodeId: z.string().min(1).optional(),
  referencedEventId: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  prerequisiteId: z.string().min(1).optional(),
  foreshadowId: z.string().min(1).optional(),
});

export const MajorPlotActionLedgerValidationSchema = z.object({
  passed: z.boolean(),
  majorPlotActionCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
  issues: z.array(MajorPlotActionLedgerIssueSchema),
});

export type KnowledgeVisibility = z.infer<typeof KnowledgeVisibilitySchema>;
export type SimulationEventType = z.infer<typeof SimulationEventTypeSchema>;
export type EventMemoryUpdateInput = z.infer<typeof EventMemoryUpdateInputSchema>;
export type EventBeliefUpdateInput = z.infer<typeof EventBeliefUpdateInputSchema>;
export type SimulationEventCognition = z.infer<typeof SimulationEventCognitionSchema>;
export type SimulationEventInvolvedEntity = z.infer<typeof SimulationEventInvolvedEntitySchema>;
export type SimulationEventPrerequisite = z.infer<typeof SimulationEventPrerequisiteSchema>;
export type SimulationEventOutcomeType = z.infer<typeof SimulationEventOutcomeTypeSchema>;
export type SimulationEventOutcome = z.infer<typeof SimulationEventOutcomeSchema>;
export type SimulationEventStateDomain = z.infer<typeof SimulationEventStateDomainSchema>;
export type SimulationEventStateOperation = z.infer<typeof SimulationEventStateOperationSchema>;
export type SimulationEventCorrectionOperation = z.infer<
  typeof SimulationEventCorrectionOperationSchema
>;
export type SimulationEventStateChange = z.infer<typeof SimulationEventStateChangeSchema>;
export type SimulationEvent = z.input<typeof SimulationEventSchema>;
export type NormalizedSimulationEvent = z.output<typeof SimulationEventSchema>;
export type SimulationEventCorrectionWindow = z.infer<
  typeof SimulationEventCorrectionWindowSchema
>;
export type SimulationEventCorrectionEdit = z.infer<
  typeof SimulationEventCorrectionEditSchema
>;
export type SimulationEventCorrectionRecord = z.infer<
  typeof SimulationEventCorrectionRecordSchema
>;
export type SimulationCausalLedger = z.infer<typeof SimulationCausalLedgerSchema>;
export type SimulationCausalLedgerEpisodeRange = z.infer<
  typeof SimulationCausalLedgerEpisodeRangeSchema
>;
export type SimulationCausalLedgerQuery = z.infer<
  typeof SimulationCausalLedgerQuerySchema
>;
export type SimulationCausalLedgerQueryResult = z.infer<
  typeof SimulationCausalLedgerQueryResultSchema
>;
export type MajorPlotActionLedgerIssueCode = z.infer<
  typeof MajorPlotActionLedgerIssueCodeSchema
>;
export type MajorPlotActionLedgerIssue = z.infer<
  typeof MajorPlotActionLedgerIssueSchema
>;
export type MajorPlotActionLedgerValidation = z.infer<
  typeof MajorPlotActionLedgerValidationSchema
>;

export interface MajorPlotActionLedgerValidationOptions {
  initialState?: Pick<
    SimulationState,
    "characters" | "objectiveFacts" | "beliefs" | "memories" | "utterances" | "threads"
  >;
  foreshadowingItems?: ReadonlyArray<{
    id: string;
    name?: string;
    plantedAt?: number | null;
    sourceEpisodeIds?: ReadonlyArray<string>;
    sourceSceneIds?: ReadonlyArray<string>;
  }>;
  foreshadowEpisodeSequence?: ReadonlyArray<{
    episodeNumber: number;
    episodeId?: string;
    foreshadowingTouched?: ReadonlyArray<{
      foreshadowingId: string;
      action: string;
      context?: string;
    }>;
  }>;
}

interface ForeshadowSetupBeat {
  foreshadowId: string;
  foreshadowName: string;
  episode: number;
  episodeId?: string;
}

interface ForeshadowPayoffBeat {
  foreshadowId: string;
  episode: number;
  episodeId?: string;
}

export function parseSimulationEvent(
  event: SimulationEvent,
): NormalizedSimulationEvent {
  return SimulationEventSchema.parse(event);
}

export function buildSimulationCausalLedger(
  events: ReadonlyArray<SimulationEvent>,
): SimulationCausalLedger {
  return SimulationCausalLedgerSchema.parse({
    version: "sim-causal-ledger.v1",
    events: [...events],
  });
}

function normalizeSimulationCausalLedgerInput(
  input: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
): SimulationCausalLedger {
  if (Array.isArray(input)) {
    return buildSimulationCausalLedger(input);
  }

  return SimulationCausalLedgerSchema.parse(input);
}

const REQUIRED_MAJOR_PLOT_ACTION_FIELDS = [
  "sceneId",
  "actorId",
  "payload.subject",
  "payload.predicate",
  "payload.object",
  "payload.canonicalFact",
  "payload.canonicalSummary",
  "payload.triggeredBy",
  "payload.leadsTo",
] as const;

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeAssertionText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeAssertionText(entry) ?? String(entry)).join("|");
  }

  return JSON.stringify(value);
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function textContainsAnyMarker(
  value: string,
  markers: ReadonlyArray<string>,
): boolean {
  const normalized = normalizeSearchText(value);
  return markers.some((marker) => normalized.includes(normalizeSearchText(marker)));
}

function getNestedValue(
  source: unknown,
  path: string,
): unknown {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function parseSceneIndex(sceneId: string | undefined): number | undefined {
  if (!sceneId) {
    return undefined;
  }

  const match = /scene_\d+_(\d+)$/.exec(sceneId);
  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[1] ?? "", 10);
}

function parseEpisodeId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^ep_(\d+)$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const episode = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(episode) && episode > 0 ? episode : undefined;
}

function normalizeForeshadowTouchAction(action: string | undefined): string {
  return (action ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function collectForeshadowSetupBeats(
  items: MajorPlotActionLedgerValidationOptions["foreshadowingItems"],
): ForeshadowSetupBeat[] {
  if (!items) {
    return [];
  }

  const beats: ForeshadowSetupBeat[] = [];

  for (const item of items) {
    const seenEpisodes = new Set<number>();
    const sourceEpisodeIds = item.sourceEpisodeIds ?? [];

    for (const episodeId of sourceEpisodeIds) {
      const episode = parseEpisodeId(episodeId);
      if (!episode || seenEpisodes.has(episode)) {
        continue;
      }

      seenEpisodes.add(episode);
      beats.push({
        foreshadowId: item.id,
        foreshadowName: item.name?.trim() || item.id,
        episode,
        episodeId,
      });
    }

    if (
      seenEpisodes.size === 0
      && typeof item.plantedAt === "number"
      && Number.isFinite(item.plantedAt)
      && item.plantedAt > 0
    ) {
      beats.push({
        foreshadowId: item.id,
        foreshadowName: item.name?.trim() || item.id,
        episode: item.plantedAt,
        episodeId: `ep_${String(item.plantedAt).padStart(3, "0")}`,
      });
    }
  }

  return beats;
}

function collectForeshadowPayoffBeats(
  episodeSequence: MajorPlotActionLedgerValidationOptions["foreshadowEpisodeSequence"],
): ForeshadowPayoffBeat[] {
  if (!episodeSequence) {
    return [];
  }

  const beats: ForeshadowPayoffBeat[] = [];
  const seenKeys = new Set<string>();

  for (const episode of episodeSequence) {
    const touches = episode.foreshadowingTouched ?? [];
    for (const touch of touches) {
      if (normalizeForeshadowTouchAction(touch.action) !== "reveal") {
        continue;
      }

      const foreshadowId = touch.foreshadowingId.trim();
      if (!foreshadowId) {
        continue;
      }

      const beatKey = `${foreshadowId}\u0000${episode.episodeNumber}\u0000${episode.episodeId ?? ""}`;
      if (seenKeys.has(beatKey)) {
        continue;
      }

      seenKeys.add(beatKey);
      beats.push({
        foreshadowId,
        episode: episode.episodeNumber,
        episodeId: episode.episodeId,
      });
    }
  }

  return beats;
}

function detectLedgerChronologyIssues(
  events: ReadonlyArray<NormalizedSimulationEvent>,
): MajorPlotActionLedgerIssue[] {
  const issues: MajorPlotActionLedgerIssue[] = [];
  let previousEvent: NormalizedSimulationEvent | undefined;

  for (const event of events) {
    if (!previousEvent) {
      previousEvent = event;
      continue;
    }

    const previousSceneIndex = parseSceneIndex(previousEvent.sceneId);
    const currentSceneIndex = parseSceneIndex(event.sceneId);
    const sceneOrderRegressed =
      previousEvent.episode === event.episode
      && previousSceneIndex !== undefined
      && currentSceneIndex !== undefined
      && currentSceneIndex < previousSceneIndex;
    const sequenceOrderRegressed =
      previousEvent.episode === event.episode
      && previousEvent.sequence !== undefined
      && event.sequence !== undefined
      && event.sequence <= previousEvent.sequence;

    if (
      event.episode < previousEvent.episode
      || sceneOrderRegressed
      || sequenceOrderRegressed
    ) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "episode_order_violation",
        `Event "${event.id}" is out of chronology after "${previousEvent.id}".`,
        {
          referencedEventId: previousEvent.id,
          field: sceneOrderRegressed
            ? "sceneId"
            : sequenceOrderRegressed
              ? "sequence"
              : "episode",
        },
      ));
    }

    previousEvent = event;
  }

  return issues;
}

function validateEventPrerequisiteReferences(
  event: NormalizedSimulationEvent,
  events: ReadonlyArray<NormalizedSimulationEvent>,
  eventIndexById: Map<string, number>,
): MajorPlotActionLedgerIssue[] {
  const issues: MajorPlotActionLedgerIssue[] = [];
  const currentIndex = eventIndexById.get(event.id) ?? -1;

  for (const prerequisite of event.prerequisites) {
    if (prerequisite.type !== "event" && !hasNonEmptyString(prerequisite.eventId)) {
      continue;
    }

    if (!hasNonEmptyString(prerequisite.eventId)) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "missing_prerequisite_link",
        `Prerequisite "${prerequisite.prerequisiteId}" must reference an earlier event id.`,
        {
          prerequisiteId: prerequisite.prerequisiteId,
          field: "prerequisites.eventId",
        },
      ));
      continue;
    }

    const referencedIndex = eventIndexById.get(prerequisite.eventId);
    if (referencedIndex === undefined) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "unknown_prerequisite_event",
        `Prerequisite event "${prerequisite.eventId}" does not exist in the ledger.`,
        {
          prerequisiteId: prerequisite.prerequisiteId,
          referencedEventId: prerequisite.eventId,
        },
      ));
      continue;
    }

    const referencedEvent = events[referencedIndex];
    if (
      referencedIndex >= currentIndex
      || referencedEvent.episode > event.episode
    ) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "prerequisite_order_violation",
        `Prerequisite event "${prerequisite.eventId}" must appear before "${event.id}".`,
        {
          prerequisiteId: prerequisite.prerequisiteId,
          referencedEventId: prerequisite.eventId,
        },
      ));
    }
  }

  return issues;
}

function resolveEventIdForEpisode(
  eventIdsByEpisode: Map<number, string>,
  episode: number,
  fallback: string,
): string {
  return eventIdsByEpisode.get(episode) ?? fallback;
}

function detectForeshadowChronologyIssues(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  options: MajorPlotActionLedgerValidationOptions,
): MajorPlotActionLedgerIssue[] {
  const setupBeats = collectForeshadowSetupBeats(options.foreshadowingItems);
  const payoffBeats = collectForeshadowPayoffBeats(options.foreshadowEpisodeSequence);
  if (setupBeats.length === 0 || payoffBeats.length === 0) {
    return [];
  }

  const issues: MajorPlotActionLedgerIssue[] = [];
  const eventIdsByEpisode = new Map<number, string>();

  for (const event of events) {
    if (!eventIdsByEpisode.has(event.episode)) {
      eventIdsByEpisode.set(event.episode, event.id);
    }
  }

  const setupByForeshadowId = new Map<string, ForeshadowSetupBeat[]>();
  for (const beat of setupBeats) {
    setupByForeshadowId.set(beat.foreshadowId, [
      ...(setupByForeshadowId.get(beat.foreshadowId) ?? []),
      beat,
    ]);
  }

  const earliestPayoffByForeshadowId = new Map<string, ForeshadowPayoffBeat>();
  for (const beat of payoffBeats) {
    const existing = earliestPayoffByForeshadowId.get(beat.foreshadowId);
    if (!existing || beat.episode < existing.episode) {
      earliestPayoffByForeshadowId.set(beat.foreshadowId, beat);
    }
  }

  for (const [foreshadowId, payoffBeat] of earliestPayoffByForeshadowId) {
    const setupForItem = setupByForeshadowId.get(foreshadowId) ?? [];
    for (const setupBeat of setupForItem) {
      if (setupBeat.episode <= payoffBeat.episode) {
        continue;
      }

      const syntheticEventId = `foreshadow:${foreshadowId}:setup:ep_${String(setupBeat.episode).padStart(3, "0")}`;
      issues.push(MajorPlotActionLedgerIssueSchema.parse({
        code: "foreshadow_order_violation",
        eventId: resolveEventIdForEpisode(
          eventIdsByEpisode,
          setupBeat.episode,
          syntheticEventId,
        ),
        chapter: setupBeat.episode,
        episode: setupBeat.episode,
        episodeId: setupBeat.episodeId,
        referencedEventId: resolveEventIdForEpisode(
          eventIdsByEpisode,
          payoffBeat.episode,
          `foreshadow:${foreshadowId}:payoff:${payoffBeat.episodeId ?? payoffBeat.episode}`,
        ),
        foreshadowId,
        message:
          `Foreshadow "${setupBeat.foreshadowName}" records a setup beat in episode `
          + `${setupBeat.episode} after its payoff appears in episode ${payoffBeat.episode}.`,
      }));
    }
  }

  return issues;
}

function isCloseLikeStateOperation(operation: SimulationEventStateOperation): boolean {
  return operation === "close" || operation === "remove" || operation === "resolve";
}

function isSingularCharacterStateKey(stateKey: string): boolean {
  return stateKey.endsWith(":location")
    || stateKey.endsWith(":status")
    || stateKey.startsWith("relationship:");
}

function isTrackedStateReversalKey(
  change: SimulationEventStateChange,
): boolean {
  if (change.domain === "character_state") {
    return change.stateKey.endsWith(":status");
  }

  if (change.domain === "world_model" || change.domain === "hidden_truth") {
    return change.stateKey.endsWith(":status")
      || change.stateKey.includes(":status:")
      || normalizeSearchText(change.summary).includes("status");
  }

  return false;
}

function buildEventExclusiveKey(
  change: SimulationEventStateChange,
): string | undefined {
  if (change.domain === "character_state" && isSingularCharacterStateKey(change.stateKey)) {
    return `character-state:${change.stateKey}`;
  }

  if (change.domain === "threads") {
    return `thread:${change.stateKey}`;
  }

  return undefined;
}

function buildTrackedStateReversalSignal(
  change: SimulationEventStateChange,
): TrackedStateReversalSignal | undefined {
  if (!isTrackedStateReversalKey(change)) {
    return undefined;
  }

  const valueKey = normalizeAssertionText(change.afterValue);
  if (!valueKey) {
    return undefined;
  }

  return {
    trackingKey: `${change.domain}:${change.stateKey}`,
    stateKey: change.stateKey,
    label: change.summary,
    valueKey,
    entityId: change.entityIds[0],
  };
}

function collectStringScalars(
  value: unknown,
  limit = 64,
  depth = 0,
): string[] {
  if (limit <= 0 || depth > 5 || value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim().length > 0 ? [value] : [];
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => collectStringScalars(entry, limit, depth + 1))
      .slice(0, limit);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .flatMap((entry) => collectStringScalars(entry, limit, depth + 1))
      .slice(0, limit);
  }

  return [];
}

function inferRequiredStateReversalEnablers(
  valueKey: string,
): StateReversalEnablerKind[] {
  const required = new Set<StateReversalEnablerKind>();

  for (const [kind, markers] of Object.entries(STATE_REVERSAL_REQUIRED_MARKERS) as Array<
    [StateReversalEnablerKind, string[]]
  >) {
    if (markers.length > 0 && textContainsAnyMarker(valueKey, markers)) {
      required.add(kind);
    }
  }

  if (required.size === 0) {
    return [];
  }

  required.add("restoration");
  return Array.from(required);
}

function eventHasStateReversalEnabler(
  event: NormalizedSimulationEvent,
  requiredKinds: ReadonlyArray<StateReversalEnablerKind>,
): boolean {
  const fragments = [
    event.summary,
    ...event.tags,
    ...event.prerequisites.flatMap((prerequisite) => [
      prerequisite.prerequisiteId,
      prerequisite.description,
      prerequisite.stateKey,
      prerequisite.eventId,
    ]),
    ...collectStringScalars(event.payload),
  ];

  return fragments.some((fragment) =>
    typeof fragment === "string"
    && requiredKinds.some((kind) =>
      textContainsAnyMarker(
        fragment,
        STATE_REVERSAL_ENABLER_MARKERS[kind] ?? [],
      )
    )
  );
}

function createStateReversalHistory(
  initialState: MajorPlotActionLedgerValidationOptions["initialState"],
): Map<string, StateReversalHistoryEntry[]> {
  const history = new Map<string, StateReversalHistoryEntry[]>();

  if (!initialState) {
    return history;
  }

  for (const character of Object.values(initialState.characters)) {
    const status = normalizeAssertionText(character.status);
    if (!status) {
      continue;
    }

    history.set(`character_state:character:${character.characterId}:status`, [{
      trackingKey: `character_state:character:${character.characterId}:status`,
      stateKey: `character:${character.characterId}:status`,
      label: `${character.name} initial status`,
      valueKey: status,
      entityId: character.characterId,
      eventId: "__initial__",
    }]);
  }

  return history;
}

function detectImpossibleStateReversalIssues(
  events: ReadonlyArray<NormalizedSimulationEvent>,
  initialState: MajorPlotActionLedgerValidationOptions["initialState"],
): MajorPlotActionLedgerIssue[] {
  const issues: MajorPlotActionLedgerIssue[] = [];
  const history = createStateReversalHistory(initialState);

  for (const event of events) {
    for (const change of event.stateChanges) {
      const signal = buildTrackedStateReversalSignal(change);
      if (!signal) {
        continue;
      }

      const entries = history.get(signal.trackingKey) ?? [];
      const previous = entries.at(-1);
      if (!previous) {
        history.set(signal.trackingKey, [{
          ...signal,
          eventId: event.id,
        }]);
        continue;
      }

      if (previous.valueKey === signal.valueKey) {
        continue;
      }

      const earlierMatchingValue = [...entries]
        .reverse()
        .find((entry) => entry.valueKey === signal.valueKey);
      const requiredKinds = inferRequiredStateReversalEnablers(previous.valueKey);

      if (
        earlierMatchingValue
        && requiredKinds.length > 0
        && !eventHasStateReversalEnabler(event, requiredKinds)
      ) {
        issues.push(buildMajorPlotActionIssue(
          event,
          "impossible_state_reversal",
          `State "${signal.stateKey}" reverts from "${previous.valueKey}" back to "${signal.valueKey}" without an explicit ${requiredKinds.join("/")} enabling event.`,
          {
            entityId: signal.entityId,
            stateKey: signal.stateKey,
            referencedEventId: previous.eventId !== "__initial__"
              ? previous.eventId
              : earlierMatchingValue.eventId !== "__initial__"
                ? earlierMatchingValue.eventId
                : undefined,
            field: "stateChanges.afterValue",
          },
        ));
      }

      entries.push({
        ...signal,
        eventId: event.id,
      });
      history.set(signal.trackingKey, entries);
    }
  }

  return issues;
}

const MUTUALLY_EXCLUSIVE_OBJECTIVE_PREDICATES = new Set([
  "status",
  "is",
  "is_at",
  "is_hidden_in",
  "located_in",
  "relationship",
]);

interface ObjectiveAssertionSignal {
  assertionKey: string;
  valueKey: string;
  label: string;
  lineId: string;
  entityId?: string;
}

interface ActiveObjectiveAssertion extends ObjectiveAssertionSignal {
  eventId: string;
}

type StateReversalEnablerKind =
  | "recovery"
  | "resurrection"
  | "repair"
  | "unlock"
  | "restoration";

interface TrackedStateReversalSignal {
  trackingKey: string;
  stateKey: string;
  label: string;
  valueKey: string;
  entityId?: string;
}

interface StateReversalHistoryEntry extends TrackedStateReversalSignal {
  eventId: string;
}

const STATE_REVERSAL_ENABLER_MARKERS: Record<StateReversalEnablerKind, string[]> = {
  recovery: [
    "recover",
    "recovered",
    "recovery",
    "heal",
    "healed",
    "healing",
    "cure",
    "cured",
    "stabilized",
    "rescued",
    "released",
    "freed",
    "awake",
    "awakened",
    "회복",
    "치유",
    "치료",
    "구출",
    "안정",
    "해방",
  ],
  resurrection: [
    "resurrect",
    "resurrected",
    "resurrection",
    "revive",
    "revived",
    "revival",
    "brought back to life",
    "부활",
    "소생",
    "되살",
  ],
  repair: [
    "repair",
    "repaired",
    "repairing",
    "fix",
    "fixed",
    "mend",
    "mended",
    "rebuild",
    "rebuilt",
    "patched",
    "수리",
    "복구",
    "재건",
    "보수",
  ],
  unlock: [
    "unlock",
    "unlocked",
    "unseal",
    "unsealed",
    "reactivate",
    "reactivated",
    "restart",
    "restarted",
    "reboot",
    "rebooted",
    "dispel",
    "dispelled",
    "해제",
    "봉인 해제",
    "재가동",
    "재활성화",
  ],
  restoration: [
    "restore",
    "restored",
    "restoration",
    "state reversal",
    "state restore",
    "allow state reversal",
    "enabled reversal",
    "정상화",
    "원상복구",
    "복원",
  ],
};

const STATE_REVERSAL_REQUIRED_MARKERS: Record<StateReversalEnablerKind, string[]> = {
  recovery: [
    "injured",
    "wounded",
    "sick",
    "ill",
    "poisoned",
    "cursed",
    "unconscious",
    "missing",
    "captured",
    "trapped",
    "stunned",
    "부상",
    "상처",
    "병",
    "중독",
    "저주",
    "의식불명",
    "실종",
    "포획",
    "구금",
    "기절",
  ],
  resurrection: [
    "dead",
    "deceased",
    "killed",
    "slain",
    "lifeless",
    "death",
    "사망",
    "죽음",
    "죽은",
    "전사",
    "시신",
  ],
  repair: [
    "broken",
    "damaged",
    "destroyed",
    "ruined",
    "shattered",
    "collapsed",
    "burned",
    "burnt",
    "wrecked",
    "cracked",
    "offline",
    "disabled",
    "고장",
    "파손",
    "붕괴",
    "소실",
    "비활성",
    "정지",
  ],
  unlock: [
    "sealed",
    "locked",
    "closed",
    "hidden",
    "suppressed",
    "blocked",
    "봉인",
    "잠김",
    "폐쇄",
    "은폐",
    "차단",
  ],
  restoration: [],
};

function buildObjectiveAssertionLabel(
  event: NormalizedSimulationEvent,
  fallbackStateKey: string,
): string {
  const subject = normalizeAssertionText(getNestedValue(event.payload, "subject"));
  const predicate = normalizeAssertionText(getNestedValue(event.payload, "predicate"));

  if (subject && predicate) {
    return `${subject} ${predicate}`;
  }

  return fallbackStateKey;
}

function deriveObjectiveAssertionKey(
  event: NormalizedSimulationEvent,
  lineId: string,
): string | undefined {
  if (
    lineId.startsWith("fact-line:character-location:")
    || lineId.startsWith("fact-line:character-status:")
    || lineId.startsWith("fact-line:relationship:")
    || lineId.startsWith("fact-line:character-inventory:")
  ) {
    return lineId;
  }

  if (!lineId.startsWith("fact-line:discovery:")) {
    return undefined;
  }

  const subject = normalizeAssertionText(getNestedValue(event.payload, "subject"));
  const predicate = normalizeAssertionText(getNestedValue(event.payload, "predicate"));
  if (!subject || !predicate) {
    return undefined;
  }

  if (!MUTUALLY_EXCLUSIVE_OBJECTIVE_PREDICATES.has(predicate)) {
    return undefined;
  }

  return [
    "fact-assertion:discovery",
    normalizeIdSegment(subject),
    normalizeIdSegment(predicate),
  ].join(":");
}

function buildObjectiveAssertionSignal(
  event: NormalizedSimulationEvent,
  change: SimulationEventStateChange,
): ObjectiveAssertionSignal | undefined {
  if (change.domain !== "objective_facts" || isCloseLikeStateOperation(change.operation)) {
    return undefined;
  }

  const assertionKey = deriveObjectiveAssertionKey(event, change.stateKey);
  if (!assertionKey) {
    return undefined;
  }

  const valueKey = normalizeAssertionText(change.afterValue);
  if (!valueKey) {
    return undefined;
  }

  return {
    assertionKey,
    valueKey,
    label: buildObjectiveAssertionLabel(event, change.stateKey),
    lineId: change.stateKey,
    entityId: change.entityIds[0],
  };
}

function detectEventScopedMutuallyExclusiveOutcomeIssues(
  event: NormalizedSimulationEvent,
): MajorPlotActionLedgerIssue[] {
  const byKey = new Map<string, Array<{
    valueKey: string;
    label: string;
    stateKey: string;
    entityId?: string;
  }>>();

  for (const change of event.stateChanges) {
    const eventKey = buildEventExclusiveKey(change);
    const normalizedValue = normalizeAssertionText(change.afterValue);
    if (eventKey && normalizedValue) {
      byKey.set(eventKey, [
        ...(byKey.get(eventKey) ?? []),
        {
          valueKey: normalizedValue,
          label: change.summary,
          stateKey: change.stateKey,
          entityId: change.entityIds[0],
        },
      ]);
    }

    const objectiveAssertion = buildObjectiveAssertionSignal(event, change);
    if (objectiveAssertion) {
      byKey.set(objectiveAssertion.assertionKey, [
        ...(byKey.get(objectiveAssertion.assertionKey) ?? []),
        {
          valueKey: objectiveAssertion.valueKey,
          label: objectiveAssertion.label,
          stateKey: change.stateKey,
          entityId: objectiveAssertion.entityId,
        },
      ]);
    }
  }

  const issues: MajorPlotActionLedgerIssue[] = [];

  for (const signals of byKey.values()) {
    const distinctValues = Array.from(new Set(signals.map((signal) => signal.valueKey)));
    if (distinctValues.length <= 1) {
      continue;
    }

    const first = signals[0];
    issues.push(buildMajorPlotActionIssue(
      event,
      "mutually_exclusive_outcome",
      `Event "${event.id}" records mutually exclusive outcomes for "${first.label}" (${distinctValues.join(" vs ")}).`,
      {
        entityId: first.entityId,
        field: "stateChanges.afterValue",
        stateKey: first.stateKey,
      },
    ));
  }

  return issues;
}

function detectCrossEventMutuallyExclusiveObjectiveAssertions(
  events: ReadonlyArray<NormalizedSimulationEvent>,
): MajorPlotActionLedgerIssue[] {
  const issues: MajorPlotActionLedgerIssue[] = [];
  const activeByAssertionKey = new Map<string, ActiveObjectiveAssertion>();
  const activeByLineId = new Map<string, ActiveObjectiveAssertion>();

  for (const event of events) {
    for (const change of event.stateChanges) {
      if (change.domain !== "objective_facts") {
        continue;
      }

      if (isCloseLikeStateOperation(change.operation)) {
        const active = activeByLineId.get(change.stateKey);
        if (active) {
          activeByLineId.delete(change.stateKey);
          if (activeByAssertionKey.get(active.assertionKey)?.lineId === change.stateKey) {
            activeByAssertionKey.delete(active.assertionKey);
          }
        }
        continue;
      }

      const signal = buildObjectiveAssertionSignal(event, change);
      if (!signal) {
        continue;
      }

      const active = activeByAssertionKey.get(signal.assertionKey);
      if (active && active.valueKey !== signal.valueKey) {
        issues.push(buildMajorPlotActionIssue(
          event,
          "mutually_exclusive_outcome",
          `Objective assertion "${signal.label}" remains active from "${active.eventId}" with "${active.valueKey}", but "${event.id}" asserts "${signal.valueKey}" in the same continuity window.`,
          {
            referencedEventId: active.eventId,
            entityId: signal.entityId,
            field: "stateChanges.afterValue",
            stateKey: change.stateKey,
          },
        ));
      }

      const nextActive: ActiveObjectiveAssertion = {
        ...signal,
        eventId: event.id,
      };
      activeByAssertionKey.set(signal.assertionKey, nextActive);
      activeByLineId.set(signal.lineId, nextActive);
    }
  }

  return issues;
}

function buildMajorPlotActionIssue(
  event: NormalizedSimulationEvent,
  code: MajorPlotActionLedgerIssueCode,
  message: string,
  extras: Omit<
    Partial<MajorPlotActionLedgerIssue>,
    "code" | "eventId" | "chapter" | "episode" | "message"
  > = {},
): MajorPlotActionLedgerIssue {
  return MajorPlotActionLedgerIssueSchema.parse({
    code,
    eventId: event.id,
    chapter: event.chapter,
    episode: event.episode,
    message,
    ...extras,
  });
}

interface LedgerDependencySnapshot {
  characterIds: Set<string>;
  inventoryByCharacterId: Map<string, Set<string>>;
  knowledgeByCharacterId: Map<string, Set<string>>;
  relationshipKeys: Set<string>;
  activeObjectiveFactLineIds: Set<string>;
  activeMemoryStateKeys: Set<string>;
  activeBeliefStateKeys: Set<string>;
  activeUtteranceStateKeys: Set<string>;
  existingThreadIds: Set<string>;
  openThreadIds: Set<string>;
}

function buildRelationshipStateKey(a: string, b: string): string {
  return `relationship:${[a, b].sort().join(":")}`;
}

function normalizeDependencyStateSegment(value: string): string {
  return normalizeIdSegment(value);
}

function createLedgerDependencySnapshot(
  initialState: MajorPlotActionLedgerValidationOptions["initialState"],
): LedgerDependencySnapshot {
  const snapshot: LedgerDependencySnapshot = {
    characterIds: new Set(),
    inventoryByCharacterId: new Map(),
    knowledgeByCharacterId: new Map(),
    relationshipKeys: new Set(),
    activeObjectiveFactLineIds: new Set(),
    activeMemoryStateKeys: new Set(),
    activeBeliefStateKeys: new Set(),
    activeUtteranceStateKeys: new Set(),
    existingThreadIds: new Set(),
    openThreadIds: new Set(),
  };

  if (!initialState) {
    return snapshot;
  }

  for (const character of Object.values(initialState.characters)) {
    snapshot.characterIds.add(character.characterId);
    snapshot.inventoryByCharacterId.set(
      character.characterId,
      new Set(character.inventory.map(normalizeDependencyStateSegment)),
    );
    snapshot.knowledgeByCharacterId.set(
      character.characterId,
      new Set(character.secretsKnown.map(normalizeDependencyStateSegment)),
    );

    for (const relatedCharacterId of Object.keys(character.relationships)) {
      snapshot.relationshipKeys.add(
        buildRelationshipStateKey(character.characterId, relatedCharacterId),
      );
    }
  }

  for (const factId of initialState.objectiveFacts.activeIds) {
    const fact = initialState.objectiveFacts.byId[factId];
    if (fact) {
      snapshot.activeObjectiveFactLineIds.add(fact.revision.lineId);
    }
  }

  for (const [characterId, store] of Object.entries(initialState.memories)) {
    for (const memoryId of store.timeline) {
      if (store.byId[memoryId]) {
        snapshot.activeMemoryStateKeys.add(`memory:${characterId}:${memoryId}`);
      }
    }
  }

  for (const [characterId, store] of Object.entries(initialState.beliefs)) {
    for (const beliefId of store.timeline) {
      if (store.byId[beliefId]) {
        snapshot.activeBeliefStateKeys.add(`belief:${characterId}:${beliefId}`);
      }
    }
  }

  for (const [characterId, store] of Object.entries(initialState.utterances)) {
    for (const utteranceId of store.timeline) {
      if (store.byId[utteranceId]) {
        snapshot.activeUtteranceStateKeys.add(`utterance:${characterId}:${utteranceId}`);
      }
    }
  }

  for (const thread of Object.values(initialState.threads)) {
    snapshot.existingThreadIds.add(thread.id);
    if (thread.status === "open") {
      snapshot.openThreadIds.add(thread.id);
    }
  }

  return snapshot;
}

function syncLedgerDependencySnapshot(
  snapshot: LedgerDependencySnapshot,
  event: NormalizedSimulationEvent,
): void {
  for (const change of event.stateChanges) {
    if (change.domain === "objective_facts") {
      if (change.operation === "create") {
        snapshot.activeObjectiveFactLineIds.add(change.stateKey);
      }
      if (change.operation === "close" || change.operation === "remove") {
        snapshot.activeObjectiveFactLineIds.delete(change.stateKey);
      }
      continue;
    }

    if (change.domain === "memories" && change.operation === "record") {
      snapshot.activeMemoryStateKeys.add(change.stateKey);
      continue;
    }

    if (change.domain === "beliefs" && change.operation === "interpret") {
      snapshot.activeBeliefStateKeys.add(change.stateKey);
      continue;
    }

    if (change.domain === "utterances" && change.operation === "record") {
      snapshot.activeUtteranceStateKeys.add(change.stateKey);
      continue;
    }

    if (change.domain === "threads") {
      const threadId = change.stateKey.replace(/^thread:/, "");
      if (change.operation === "open") {
        snapshot.existingThreadIds.add(threadId);
        snapshot.openThreadIds.add(threadId);
      }
      if (change.operation === "resolve" || change.operation === "close") {
        snapshot.existingThreadIds.add(threadId);
        snapshot.openThreadIds.delete(threadId);
      }
    }
  }

  if (event.type === "obtain_item") {
    const item = typeof event.payload?.item === "string"
      ? normalizeDependencyStateSegment(event.payload.item)
      : undefined;
    if (event.actorId && item) {
      if (!snapshot.inventoryByCharacterId.has(event.actorId)) {
        snapshot.inventoryByCharacterId.set(event.actorId, new Set());
      }
      snapshot.inventoryByCharacterId.get(event.actorId)!.add(item);
    }
  }

  if (event.type === "lose_item") {
    const item = typeof event.payload?.item === "string"
      ? normalizeDependencyStateSegment(event.payload.item)
      : undefined;
    if (event.actorId && item) {
      snapshot.inventoryByCharacterId.get(event.actorId)?.delete(item);
    }
  }

  if (event.type === "learn_fact") {
    const fact = typeof event.payload?.fact === "string"
      ? normalizeDependencyStateSegment(event.payload.fact)
      : undefined;
    const recipients = Array.isArray(event.payload?.recipients)
      ? event.payload.recipients.filter((value): value is string => hasNonEmptyString(value))
      : [];
    if (fact) {
      for (const recipientId of recipients.length > 0
        ? recipients
        : (event.actorId ? [event.actorId] : [])) {
        if (!snapshot.knowledgeByCharacterId.has(recipientId)) {
          snapshot.knowledgeByCharacterId.set(recipientId, new Set());
        }
        snapshot.knowledgeByCharacterId.get(recipientId)!.add(fact);
      }
    }
  }

  if (event.type === "relationship_shift" && event.actorId && event.targetId) {
    snapshot.relationshipKeys.add(
      buildRelationshipStateKey(event.actorId, event.targetId),
    );
  }
}

function validatePrerequisiteAgainstSnapshot(
  event: NormalizedSimulationEvent,
  prerequisite: SimulationEventPrerequisite,
  snapshot: LedgerDependencySnapshot,
): MajorPlotActionLedgerIssue | undefined {
  if (!hasNonEmptyString(prerequisite.stateKey)) {
    return undefined;
  }

  const stateKey = prerequisite.stateKey;

  if (stateKey.startsWith("character:")) {
    const segments = stateKey.split(":");
    const characterId = segments[1];
    if (!characterId) {
      return undefined;
    }

    if (segments.length === 2 && !snapshot.characterIds.has(characterId)) {
      return buildMajorPlotActionIssue(
        event,
        "unmet_prerequisite_state",
        `Prerequisite "${prerequisite.prerequisiteId}" requires character "${characterId}" to exist before "${event.id}".`,
        {
          prerequisiteId: prerequisite.prerequisiteId,
          entityId: characterId,
          field: "prerequisites.stateKey",
        },
      );
    }

    if (segments[2] === "inventory") {
      const itemKey = segments.slice(3).join(":");
      if (
        itemKey
        && !snapshot.inventoryByCharacterId.get(characterId)?.has(itemKey)
      ) {
        return buildMajorPlotActionIssue(
          event,
          "unmet_prerequisite_resource",
          `Prerequisite "${prerequisite.prerequisiteId}" requires character "${characterId}" to already hold "${itemKey}" before "${event.id}".`,
          {
            prerequisiteId: prerequisite.prerequisiteId,
            entityId: characterId,
            field: "prerequisites.stateKey",
          },
        );
      }
    }

    if (segments[2] === "knowledge") {
      const knowledgeKey = segments.slice(3).join(":");
      if (
        knowledgeKey
        && !snapshot.knowledgeByCharacterId.get(characterId)?.has(knowledgeKey)
      ) {
        return buildMajorPlotActionIssue(
          event,
          "unmet_prerequisite_state",
          `Prerequisite "${prerequisite.prerequisiteId}" requires character "${characterId}" to already know "${knowledgeKey}" before "${event.id}".`,
          {
            prerequisiteId: prerequisite.prerequisiteId,
            entityId: characterId,
            field: "prerequisites.stateKey",
          },
        );
      }
    }

    return undefined;
  }

  if (stateKey.startsWith("relationship:")) {
    if (!snapshot.relationshipKeys.has(stateKey)) {
      return buildMajorPlotActionIssue(
        event,
        "unmet_prerequisite_relationship",
        `Prerequisite "${prerequisite.prerequisiteId}" requires relationship state "${stateKey}" before "${event.id}".`,
        {
          prerequisiteId: prerequisite.prerequisiteId,
          field: "prerequisites.stateKey",
        },
      );
    }
    return undefined;
  }

  if (stateKey.startsWith("thread:")) {
    const threadId = stateKey.replace(/^thread:/, "");
    if (prerequisite.prerequisiteId.endsWith(":create")) {
      return undefined;
    }
    const threadIsRequiredOpen = prerequisite.type === "thread"
      || prerequisite.prerequisiteId.endsWith(":open");
    const isSatisfied = threadIsRequiredOpen
      ? snapshot.openThreadIds.has(threadId)
      : snapshot.existingThreadIds.has(threadId);

    if (!isSatisfied) {
      return buildMajorPlotActionIssue(
        event,
        "unmet_prerequisite_state",
        threadIsRequiredOpen
          ? `Prerequisite "${prerequisite.prerequisiteId}" requires thread "${threadId}" to already be open before "${event.id}".`
          : `Prerequisite "${prerequisite.prerequisiteId}" requires thread "${threadId}" to already exist before "${event.id}".`,
        {
          prerequisiteId: prerequisite.prerequisiteId,
          field: "prerequisites.stateKey",
        },
      );
    }
    return undefined;
  }

  if (prerequisite.type === "objective_fact") {
    if (!snapshot.activeObjectiveFactLineIds.has(stateKey)) {
      return buildMajorPlotActionIssue(
        event,
        "unmet_prerequisite_state",
        `Prerequisite "${prerequisite.prerequisiteId}" requires active objective fact "${stateKey}" before "${event.id}".`,
        {
          prerequisiteId: prerequisite.prerequisiteId,
          field: "prerequisites.stateKey",
        },
      );
    }
    return undefined;
  }

  if (prerequisite.type === "memory" && !snapshot.activeMemoryStateKeys.has(stateKey)) {
    return buildMajorPlotActionIssue(
      event,
      "unmet_prerequisite_state",
      `Prerequisite "${prerequisite.prerequisiteId}" requires memory state "${stateKey}" before "${event.id}".`,
      {
        prerequisiteId: prerequisite.prerequisiteId,
        field: "prerequisites.stateKey",
      },
    );
  }

  if (prerequisite.type === "belief" && !snapshot.activeBeliefStateKeys.has(stateKey)) {
    return buildMajorPlotActionIssue(
      event,
      "unmet_prerequisite_state",
      `Prerequisite "${prerequisite.prerequisiteId}" requires belief state "${stateKey}" before "${event.id}".`,
      {
        prerequisiteId: prerequisite.prerequisiteId,
        field: "prerequisites.stateKey",
      },
    );
  }

  if (prerequisite.type === "utterance" && !snapshot.activeUtteranceStateKeys.has(stateKey)) {
    return buildMajorPlotActionIssue(
      event,
      "unmet_prerequisite_state",
      `Prerequisite "${prerequisite.prerequisiteId}" requires utterance state "${stateKey}" before "${event.id}".`,
      {
        prerequisiteId: prerequisite.prerequisiteId,
        field: "prerequisites.stateKey",
      },
    );
  }

  return undefined;
}

export function validateMajorPlotActionLedger(
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
  options: MajorPlotActionLedgerValidationOptions = {},
): MajorPlotActionLedgerValidation {
  const normalized = normalizeSimulationCausalLedgerInput(ledger);
  const plotEvents = normalized.events.filter((event) =>
    event.type === "plot_action" || event.tags.includes("major-plot-action")
  );
  const issues = [
    ...detectCrossEventMutuallyExclusiveObjectiveAssertions(normalized.events),
    ...detectImpossibleStateReversalIssues(normalized.events, options.initialState),
    ...detectLedgerChronologyIssues(normalized.events),
    ...detectForeshadowChronologyIssues(normalized.events, options),
  ];
  const eventIndexById = new Map(
    normalized.events.map((event, index) => [event.id, index] as const),
  );
  const dependencySnapshot = options.initialState
    ? createLedgerDependencySnapshot(options.initialState)
    : undefined;

  if (dependencySnapshot) {
    for (const event of normalized.events) {
      for (const prerequisite of event.prerequisites) {
        const dependencyIssue = validatePrerequisiteAgainstSnapshot(
          event,
          prerequisite,
          dependencySnapshot,
        );
        if (dependencyIssue) {
          issues.push(dependencyIssue);
        }
      }

      syncLedgerDependencySnapshot(dependencySnapshot, event);
    }
  }

  for (const event of normalized.events) {
    issues.push(...detectEventScopedMutuallyExclusiveOutcomeIssues(event));
    issues.push(
      ...validateEventPrerequisiteReferences(
        event,
        normalized.events,
        eventIndexById,
      ),
    );
  }

  for (const event of plotEvents) {
    const payload = event.payload;

    for (const field of REQUIRED_MAJOR_PLOT_ACTION_FIELDS) {
      const root = field.startsWith("payload.") ? payload : event;
      const relativeField = field.startsWith("payload.")
        ? field.replace(/^payload\./, "")
        : field;
      const value = getNestedValue(root, relativeField);
      if (!hasNonEmptyString(value)) {
        issues.push(buildMajorPlotActionIssue(
          event,
          "missing_required_field",
          `Major plot action is missing required field "${field}".`,
          { field },
        ));
      }
    }

    if (!Array.isArray(payload?.sceneCharacterIds) || payload.sceneCharacterIds.length === 0) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "missing_required_field",
        "Major plot action must record at least one scene character id.",
        { field: "payload.sceneCharacterIds" },
      ));
    }

    if (event.prerequisites.length === 0) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "missing_prerequisite_reference",
        "Major plot action must include at least one prerequisite reference.",
      ));
    }

    for (const prerequisite of event.prerequisites) {
      const hasLink = hasNonEmptyString(prerequisite.eventId)
        || hasNonEmptyString(prerequisite.stateKey)
        || hasNonEmptyString(prerequisite.entityId);

      if (!hasLink) {
        issues.push(buildMajorPlotActionIssue(
          event,
          "missing_prerequisite_link",
          `Prerequisite "${prerequisite.prerequisiteId}" is missing a traceable link.`,
          {
            prerequisiteId: prerequisite.prerequisiteId,
          },
        ));
      }

      // Event-order prerequisite validation runs for every ledger event above.
    }

    if (
      event.actorId
      && !event.involvedEntities.some((entity) =>
        entity.entityType === "character"
        && entity.role === "actor"
        && entity.entityId === event.actorId
      )
    ) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "missing_entity_link",
        `Actor "${event.actorId}" is not linked in involvedEntities.`,
        {
          field: "actorId",
          entityId: event.actorId,
        },
      ));
    }

    if (
      event.targetId
      && !event.involvedEntities.some((entity) =>
        entity.entityType === "character"
        && entity.role === "target"
        && entity.entityId === event.targetId
      )
    ) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "missing_entity_link",
        `Target "${event.targetId}" is not linked in involvedEntities.`,
        {
          field: "targetId",
          entityId: event.targetId,
        },
      ));
    }

    const sceneCharacterIds = Array.isArray(payload?.sceneCharacterIds)
      ? payload.sceneCharacterIds.filter(hasNonEmptyString)
      : [];
    for (const sceneCharacterId of sceneCharacterIds) {
      if (!event.involvedEntities.some((entity) =>
        entity.entityType === "character" && entity.entityId === sceneCharacterId
      )) {
        issues.push(buildMajorPlotActionIssue(
          event,
          "missing_entity_link",
          `Scene character "${sceneCharacterId}" is not linked in involvedEntities.`,
          {
            field: "payload.sceneCharacterIds",
            entityId: sceneCharacterId,
          },
        ));
      }
    }

    if (
      hasNonEmptyString(event.location)
      && !event.involvedEntities.some((entity) =>
        entity.entityType === "location" && entity.role === "location"
      )
    ) {
      issues.push(buildMajorPlotActionIssue(
        event,
        "missing_location_link",
        `Location "${event.location}" is not linked in involvedEntities.`,
        {
          field: "location",
        },
      ));
    }

  }

  return MajorPlotActionLedgerValidationSchema.parse({
    passed: issues.length === 0,
    majorPlotActionCount: plotEvents.length,
    issueCount: issues.length,
    issues,
  });
}

export class SimulationCausalLedgerStore {
  private readonly events: NormalizedSimulationEvent[];

  constructor(initialEvents: ReadonlyArray<SimulationEvent> = []) {
    this.events = initialEvents.map((event) => parseSimulationEvent(event));
  }

  get size(): number {
    return this.events.length;
  }

  list(): NormalizedSimulationEvent[] {
    return [...this.events];
  }

  append(event: SimulationEvent): NormalizedSimulationEvent {
    const normalized = parseSimulationEvent(event);
    this.events.push(normalized);
    return normalized;
  }

  appendMany(events: ReadonlyArray<SimulationEvent>): NormalizedSimulationEvent[] {
    return events.map((event) => this.append(event));
  }

  getById(eventId: string): NormalizedSimulationEvent | undefined {
    return this.events.find((event) => event.id === eventId);
  }

  toJSON(): SimulationCausalLedger {
    return buildSimulationCausalLedger(this.events);
  }

  serialize(space = 2): string {
    return JSON.stringify(this.toJSON(), null, space);
  }

  query(
    query: Partial<SimulationCausalLedgerQuery> = {},
  ): SimulationCausalLedgerQueryResult {
    const parsed = SimulationCausalLedgerQuerySchema.parse(query);
    const orderedEvents = parsed.order === "desc"
      ? [...this.events].reverse()
      : [...this.events];
    const matchedEvents = orderedEvents.filter((event) => {
      if (parsed.episode !== undefined && event.episode !== parsed.episode) {
        return false;
      }

      if (
        parsed.episodeRange
        && (event.episode < parsed.episodeRange.start || event.episode > parsed.episodeRange.end)
      ) {
        return false;
      }

      if (parsed.eventId && event.id !== parsed.eventId) {
        return false;
      }

      if (parsed.eventType && event.type !== parsed.eventType) {
        return false;
      }

      if (parsed.actorId && event.actorId !== parsed.actorId) {
        return false;
      }

      if (parsed.targetId && event.targetId !== parsed.targetId) {
        return false;
      }

      if (parsed.sceneId && event.sceneId !== parsed.sceneId) {
        return false;
      }

      if (parsed.tag && !event.tags.includes(parsed.tag)) {
        return false;
      }

      if (
        parsed.involvedEntityId
        && !event.involvedEntities.some((entity) => entity.entityId === parsed.involvedEntityId)
      ) {
        return false;
      }

      if (
        parsed.involvedEntityType
        && !event.involvedEntities.some(
          (entity) => entity.entityType === parsed.involvedEntityType,
        )
      ) {
        return false;
      }

      if (
        parsed.prerequisiteType
        && !event.prerequisites.some(
          (prerequisite) => prerequisite.type === parsed.prerequisiteType,
        )
      ) {
        return false;
      }

      if (
        parsed.outcomeType
        && !event.outcomes.some((outcome) => outcome.type === parsed.outcomeType)
      ) {
        return false;
      }

      if (
        parsed.stateDomain
        && !event.stateChanges.some((change) => change.domain === parsed.stateDomain)
      ) {
        return false;
      }

      if (
        parsed.stateOperation
        && !event.stateChanges.some((change) => change.operation === parsed.stateOperation)
      ) {
        return false;
      }

      return true;
    });
    const limitedEvents = parsed.limit
      ? matchedEvents.slice(0, parsed.limit)
      : matchedEvents;

    return SimulationCausalLedgerQueryResultSchema.parse({
      version: "sim-causal-ledger.v1",
      totalEventCount: this.events.length,
      matchedEventCount: matchedEvents.length,
      events: limitedEvents,
    });
  }
}

export function createSimulationCausalLedgerStore(
  events: ReadonlyArray<SimulationEvent> = [],
): SimulationCausalLedgerStore {
  return new SimulationCausalLedgerStore(events);
}

export function appendSimulationCausalEvent(
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
  event: SimulationEvent,
): SimulationCausalLedger {
  const store = createSimulationCausalLedgerStore(
    normalizeSimulationCausalLedgerInput(ledger).events,
  );
  store.append(event);
  return store.toJSON();
}

export function serializeSimulationCausalLedger(
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
  space = 2,
): string {
  return JSON.stringify(normalizeSimulationCausalLedgerInput(ledger), null, space);
}

export function loadSimulationCausalLedger(
  data: unknown,
): SimulationCausalLedger {
  const parsed = typeof data === "string"
    ? JSON.parse(data)
    : data;
  return SimulationCausalLedgerSchema.parse(parsed);
}

export function querySimulationCausalLedger(
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
  query: Partial<SimulationCausalLedgerQuery> = {},
): SimulationCausalLedgerQueryResult {
  const normalized = normalizeSimulationCausalLedgerInput(ledger);
  return createSimulationCausalLedgerStore(normalized.events).query(query);
}
