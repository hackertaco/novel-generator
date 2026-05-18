import { z } from "zod";

export const ObjectiveFactCategorySchema = z.enum([
  "world_rule",
  "location",
  "faction",
  "character_location",
  "character_status",
  "character_inventory",
  "relationship",
  "discovery",
]);

export const ObjectiveFactEntityTypeSchema = z.enum([
  "world",
  "character",
  "location",
  "faction",
  "item",
  "relationship",
  "concept",
]);

export const ObjectiveFactScopeTypeSchema = z.enum([
  "global",
  "character",
  "location",
  "faction",
  "relationship",
  "inventory",
  "knowledge",
]);

export const ObjectiveFactEntitySchema = z.object({
  entityId: z.string().min(1),
  entityType: ObjectiveFactEntityTypeSchema,
  label: z.string().min(1),
});

export const ObjectiveFactScopeSchema = z.object({
  scopeId: z.string().min(1),
  scopeType: ObjectiveFactScopeTypeSchema,
  entityIds: z.array(z.string()).default([]),
});

export const ObjectiveFactRecordedAtSchema = z.object({
  chapter: z.number().int().min(0),
  eventId: z.string().min(1).optional(),
});

export const ObjectiveFactEffectiveRangeSchema = z.object({
  fromChapter: z.number().int().min(0),
  fromEventId: z.string().min(1).optional(),
  toChapter: z.number().int().min(0).optional(),
  toEventId: z.string().min(1).optional(),
});

export const ObjectiveFactRevisionSchema = z.object({
  lineId: z.string().min(1),
  revisionNumber: z.number().int().min(1),
  previousFactId: z.string().min(1).optional(),
  closedByFactId: z.string().min(1).optional(),
  closedByEventId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

export const ObjectiveFactHistoryActionSchema = z.enum([
  "recorded",
  "linked",
  "closed",
]);

export const ObjectiveFactRecordSchema = z.object({
  id: z.string().min(1),
  chapter: z.number().int().min(0),
  subject: z.string().min(1),
  predicate: z.string().min(1),
  object: z.string().min(1),
  category: ObjectiveFactCategorySchema,
  summary: z.string().min(1),
  subjectEntity: ObjectiveFactEntitySchema,
  objectEntity: ObjectiveFactEntitySchema.optional(),
  scope: ObjectiveFactScopeSchema,
  recordedAt: ObjectiveFactRecordedAtSchema,
  effectiveRange: ObjectiveFactEffectiveRangeSchema,
  revision: ObjectiveFactRevisionSchema,
  validFromChapter: z.number().int().min(0),
  validToChapter: z.number().int().min(0).optional(),
  sourceEventId: z.string().min(1).optional(),
  tags: z.array(z.string()).default([]),
});

export const ObjectiveFactHistoryEntrySchema = z.object({
  id: z.string().min(1),
  factId: z.string().min(1),
  lineId: z.string().min(1),
  action: ObjectiveFactHistoryActionSchema,
  chapter: z.number().int().min(0),
  eventId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  snapshot: ObjectiveFactRecordSchema,
});

export const ObjectiveFactStoreSchema = z.object({
  byId: z.record(z.string(), ObjectiveFactRecordSchema),
  timeline: z.array(z.string()),
  activeIds: z.array(z.string()),
  bySubjectEntityId: z.record(z.string(), z.array(z.string())),
  byScopeId: z.record(z.string(), z.array(z.string())),
  byLineId: z.record(z.string(), z.array(z.string())),
  revisionLog: z.array(ObjectiveFactHistoryEntrySchema),
});

export type ObjectiveFactCategory = z.infer<typeof ObjectiveFactCategorySchema>;
export type ObjectiveFactEntityType = z.infer<typeof ObjectiveFactEntityTypeSchema>;
export type ObjectiveFactScopeType = z.infer<typeof ObjectiveFactScopeTypeSchema>;
export type ObjectiveFactEntity = z.infer<typeof ObjectiveFactEntitySchema>;
export type ObjectiveFactScope = z.infer<typeof ObjectiveFactScopeSchema>;
export type ObjectiveFactRecordedAt = z.infer<typeof ObjectiveFactRecordedAtSchema>;
export type ObjectiveFactEffectiveRange = z.infer<typeof ObjectiveFactEffectiveRangeSchema>;
export type ObjectiveFactRevision = z.infer<typeof ObjectiveFactRevisionSchema>;
export type ObjectiveFactHistoryAction = z.infer<typeof ObjectiveFactHistoryActionSchema>;
export type ObjectiveFactHistoryEntry = z.infer<typeof ObjectiveFactHistoryEntrySchema>;
export type ObjectiveFactRecord = z.infer<typeof ObjectiveFactRecordSchema>;
export type ObjectiveFactStore = z.infer<typeof ObjectiveFactStoreSchema>;

export interface ObjectiveFactEntityInput {
  entityId: string;
  entityType: ObjectiveFactEntityType;
  label?: string;
}

export interface ObjectiveFactScopeInput {
  scopeId: string;
  scopeType: ObjectiveFactScopeType;
  entityIds?: string[];
}

export interface ObjectiveFactInput {
  chapter: number;
  subject: string;
  predicate: string;
  object: string;
  category: ObjectiveFactCategory;
  summary?: string;
  sourceEventId?: string;
  subjectEntity?: ObjectiveFactEntityInput;
  objectEntity?: ObjectiveFactEntityInput;
  scope?: ObjectiveFactScopeInput;
  factLineId?: string;
  revisesFactId?: string;
  revisionReason?: string;
  tags?: string[];
}

export interface ObjectiveFactMatcher {
  subject?: string;
  predicate?: string;
  object?: string;
  category?: ObjectiveFactCategory;
  subjectEntityId?: string;
  scopeId?: string;
  lineId?: string;
  tag?: string;
}

export interface ObjectiveFactClosureMetadata {
  effectiveToEventId?: string;
  closedByEventId?: string;
  reason?: string;
}

export interface ObjectiveFactHistoryMatcher {
  factId?: string;
  lineId?: string;
  action?: ObjectiveFactHistoryAction;
}

function normalizeIdSegment(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed
    .trim()
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

function appendIndex(
  index: Record<string, string[]>,
  key: string,
  value: string,
): void {
  if (!index[key]) {
    index[key] = [];
  }
  index[key].push(value);
}

function inferEntityType(category: ObjectiveFactCategory): ObjectiveFactEntityType {
  switch (category) {
    case "world_rule":
      return "world";
    case "location":
      return "location";
    case "faction":
      return "faction";
    case "character_location":
    case "character_status":
    case "character_inventory":
      return "character";
    case "relationship":
      return "relationship";
    case "discovery":
      return "concept";
  }
}

function inferSubjectEntity(
  input: ObjectiveFactInput,
): ObjectiveFactEntity {
  if (input.subjectEntity) {
    return ObjectiveFactEntitySchema.parse({
      entityId: input.subjectEntity.entityId,
      entityType: input.subjectEntity.entityType,
      label: input.subjectEntity.label ?? input.subject,
    });
  }

  const characterTag = input.tags?.find((tag) => tag.startsWith("character:"));
  const entityId = characterTag
    ? characterTag.slice("character:".length)
    : `${inferEntityType(input.category)}:${normalizeIdSegment(input.subject)}`;

  const entityType = characterTag ? "character" : inferEntityType(input.category);
  return ObjectiveFactEntitySchema.parse({
    entityId,
    entityType,
    label: input.subject,
  });
}

function inferObjectEntity(
  input: ObjectiveFactInput,
): ObjectiveFactEntity | undefined {
  if (!input.objectEntity) {
    return undefined;
  }

  return ObjectiveFactEntitySchema.parse({
    entityId: input.objectEntity.entityId,
    entityType: input.objectEntity.entityType,
    label: input.objectEntity.label ?? input.object,
  });
}

function inferScope(
  input: ObjectiveFactInput,
  subjectEntity: ObjectiveFactEntity,
): ObjectiveFactScope {
  if (input.scope) {
    return ObjectiveFactScopeSchema.parse({
      scopeId: input.scope.scopeId,
      scopeType: input.scope.scopeType,
      entityIds: input.scope.entityIds ?? [],
    });
  }

  switch (input.category) {
    case "character_location":
    case "character_status":
      return ObjectiveFactScopeSchema.parse({
        scopeId: `scope:character:${subjectEntity.entityId}`,
        scopeType: "character",
        entityIds: [subjectEntity.entityId],
      });
    case "character_inventory":
      return ObjectiveFactScopeSchema.parse({
        scopeId: `scope:inventory:${subjectEntity.entityId}`,
        scopeType: "inventory",
        entityIds: [subjectEntity.entityId],
      });
    case "relationship":
      return ObjectiveFactScopeSchema.parse({
        scopeId: `scope:relationship:${normalizeIdSegment(input.subject)}`,
        scopeType: "relationship",
        entityIds: [subjectEntity.entityId],
      });
    case "location":
      return ObjectiveFactScopeSchema.parse({
        scopeId: `scope:location:${subjectEntity.entityId}`,
        scopeType: "location",
        entityIds: [subjectEntity.entityId],
      });
    case "faction":
      return ObjectiveFactScopeSchema.parse({
        scopeId: `scope:faction:${subjectEntity.entityId}`,
        scopeType: "faction",
        entityIds: [subjectEntity.entityId],
      });
    case "discovery":
      return ObjectiveFactScopeSchema.parse({
        scopeId: `scope:knowledge:${subjectEntity.entityId}`,
        scopeType: "knowledge",
        entityIds: [subjectEntity.entityId],
      });
    case "world_rule":
      return ObjectiveFactScopeSchema.parse({
        scopeId: `scope:global:${subjectEntity.entityId}`,
        scopeType: "global",
        entityIds: [subjectEntity.entityId],
      });
  }
}

function inferFactLineId(
  input: ObjectiveFactInput,
  subjectEntity: ObjectiveFactEntity,
  scope: ObjectiveFactScope,
): string {
  if (input.factLineId) {
    return input.factLineId;
  }

  return [
    input.category,
    scope.scopeId,
    subjectEntity.entityId,
    input.predicate,
    normalizeIdSegment(input.object),
  ].join(":");
}

function linkRecordIntoStore(
  store: ObjectiveFactStore,
  record: ObjectiveFactRecord,
): void {
  store.byId[record.id] = record;
  store.timeline.push(record.id);

  if (record.validToChapter === undefined && record.effectiveRange.toChapter === undefined) {
    store.activeIds.push(record.id);
  }

  appendIndex(store.bySubjectEntityId, record.subjectEntity.entityId, record.id);
  appendIndex(store.byScopeId, record.scope.scopeId, record.id);
  appendIndex(store.byLineId, record.revision.lineId, record.id);
}

function replaceRecordInStore(
  store: ObjectiveFactStore,
  record: ObjectiveFactRecord,
): void {
  store.byId[record.id] = record;
  const isActive = record.validToChapter === undefined && record.effectiveRange.toChapter === undefined;
  const hasActiveId = store.activeIds.includes(record.id);

  if (isActive && !hasActiveId) {
    store.activeIds.push(record.id);
    return;
  }

  if (!isActive && hasActiveId) {
    store.activeIds = store.activeIds.filter((factId) => factId !== record.id);
  }
}

function appendHistoryEntry(
  store: ObjectiveFactStore,
  record: ObjectiveFactRecord,
  action: ObjectiveFactHistoryAction,
  chapter: number,
  eventId?: string,
  reason?: string,
): void {
  store.revisionLog.push(
    ObjectiveFactHistoryEntrySchema.parse({
      id: `${record.id}:history:${store.revisionLog.length + 1}`,
      factId: record.id,
      lineId: record.revision.lineId,
      action,
      chapter,
      eventId,
      reason,
      snapshot: {
        ...record,
        subjectEntity: { ...record.subjectEntity },
        objectEntity: record.objectEntity ? { ...record.objectEntity } : undefined,
        scope: {
          ...record.scope,
          entityIds: [...record.scope.entityIds],
        },
        recordedAt: { ...record.recordedAt },
        effectiveRange: { ...record.effectiveRange },
        revision: { ...record.revision },
        tags: [...record.tags],
      },
    }),
  );
}

export function createObjectiveFactStore(
  facts: ObjectiveFactRecord[] = [],
): ObjectiveFactStore {
  const store: ObjectiveFactStore = {
    byId: {},
    timeline: [],
    activeIds: [],
    bySubjectEntityId: {},
    byScopeId: {},
    byLineId: {},
    revisionLog: [],
  };

  for (const fact of facts) {
    const parsed = ObjectiveFactRecordSchema.parse(fact);
    linkRecordIntoStore(store, parsed);
    appendHistoryEntry(
      store,
      parsed,
      "recorded",
      parsed.recordedAt.chapter,
      parsed.recordedAt.eventId,
      parsed.revision.reason,
    );
  }

  return ObjectiveFactStoreSchema.parse(store);
}

export function cloneObjectiveFactStore(
  store: ObjectiveFactStore,
): ObjectiveFactStore {
  return {
    byId: Object.fromEntries(
      Object.entries(store.byId).map(([id, fact]) => [
        id,
        {
          ...fact,
          subjectEntity: { ...fact.subjectEntity },
          objectEntity: fact.objectEntity ? { ...fact.objectEntity } : undefined,
          scope: {
            ...fact.scope,
            entityIds: [...fact.scope.entityIds],
          },
          recordedAt: { ...fact.recordedAt },
          effectiveRange: { ...fact.effectiveRange },
          revision: { ...fact.revision },
          tags: [...fact.tags],
        },
      ]),
    ),
    timeline: [...store.timeline],
    activeIds: [...store.activeIds],
    bySubjectEntityId: Object.fromEntries(
      Object.entries(store.bySubjectEntityId).map(([entityId, factIds]) => [
        entityId,
        [...factIds],
      ]),
    ),
    byScopeId: Object.fromEntries(
      Object.entries(store.byScopeId).map(([scopeId, factIds]) => [
        scopeId,
        [...factIds],
      ]),
    ),
    byLineId: Object.fromEntries(
      Object.entries(store.byLineId).map(([lineId, factIds]) => [
        lineId,
        [...factIds],
      ]),
    ),
    revisionLog: store.revisionLog.map((entry) => ({
      ...entry,
      snapshot: {
        ...entry.snapshot,
        subjectEntity: { ...entry.snapshot.subjectEntity },
        objectEntity: entry.snapshot.objectEntity ? { ...entry.snapshot.objectEntity } : undefined,
        scope: {
          ...entry.snapshot.scope,
          entityIds: [...entry.snapshot.scope.entityIds],
        },
        recordedAt: { ...entry.snapshot.recordedAt },
        effectiveRange: { ...entry.snapshot.effectiveRange },
        revision: { ...entry.snapshot.revision },
        tags: [...entry.snapshot.tags],
      },
    })),
  };
}

export function addObjectiveFact(
  store: ObjectiveFactStore,
  input: ObjectiveFactInput,
): ObjectiveFactRecord {
  const subjectEntity = inferSubjectEntity(input);
  const objectEntity = inferObjectEntity(input);
  const scope = inferScope(input, subjectEntity);
  const lineId = inferFactLineId(input, subjectEntity, scope);
  const priorFactIds = store.byLineId[lineId] ?? [];
  const previousFactId = input.revisesFactId ?? priorFactIds.at(-1);
  const idBase = input.sourceEventId ?? "fact";
  const record = ObjectiveFactRecordSchema.parse({
    id: `${idBase}:${store.timeline.length + 1}`,
    chapter: input.chapter,
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    category: input.category,
    summary: input.summary ?? `${input.subject} ${input.predicate} ${input.object}`,
    subjectEntity,
    objectEntity,
    scope,
    recordedAt: {
      chapter: input.chapter,
      eventId: input.sourceEventId,
    },
    effectiveRange: {
      fromChapter: input.chapter,
      fromEventId: input.sourceEventId,
    },
    revision: {
      lineId,
      revisionNumber: priorFactIds.length + 1,
      previousFactId,
      reason: input.revisionReason,
    },
    validFromChapter: input.chapter,
    sourceEventId: input.sourceEventId,
    tags: input.tags ?? [],
  });

  linkRecordIntoStore(store, record);
  appendHistoryEntry(
    store,
    record,
    "recorded",
    input.chapter,
    input.sourceEventId,
    input.revisionReason,
  );

  if (previousFactId) {
    const previousFact = store.byId[previousFactId];
    if (previousFact) {
      const updatedPreviousFact = ObjectiveFactRecordSchema.parse({
        ...previousFact,
        revision: {
          ...previousFact.revision,
          closedByFactId: record.id,
        },
      });
      replaceRecordInStore(store, updatedPreviousFact);
      appendHistoryEntry(
        store,
        updatedPreviousFact,
        "linked",
        input.chapter,
        input.sourceEventId,
        input.revisionReason ?? `Superseded by ${record.id}`,
      );
    }
  }

  return record;
}

function matchesFact(
  fact: ObjectiveFactRecord,
  matcher: ObjectiveFactMatcher,
): boolean {
  if (matcher.subject && fact.subject !== matcher.subject) return false;
  if (matcher.predicate && fact.predicate !== matcher.predicate) return false;
  if (matcher.object && fact.object !== matcher.object) return false;
  if (matcher.category && fact.category !== matcher.category) return false;
  if (matcher.subjectEntityId && fact.subjectEntity.entityId !== matcher.subjectEntityId) return false;
  if (matcher.scopeId && fact.scope.scopeId !== matcher.scopeId) return false;
  if (matcher.lineId && fact.revision.lineId !== matcher.lineId) return false;
  if (matcher.tag && !fact.tags.includes(matcher.tag)) return false;
  return true;
}

export function closeMatchingObjectiveFacts(
  store: ObjectiveFactStore,
  matcher: ObjectiveFactMatcher,
  validToChapter: number,
  metadata: ObjectiveFactClosureMetadata = {},
): ObjectiveFactRecord[] {
  const closed: ObjectiveFactRecord[] = [];

  for (const factId of store.timeline) {
    const fact = store.byId[factId];
    if (!fact || fact.validToChapter !== undefined) continue;
    if (!matchesFact(fact, matcher)) continue;
    const updatedFact = ObjectiveFactRecordSchema.parse({
      ...fact,
      validToChapter,
      effectiveRange: {
        ...fact.effectiveRange,
        toChapter: validToChapter,
        toEventId: metadata.effectiveToEventId,
      },
      revision: {
        ...fact.revision,
        closedByEventId: metadata.closedByEventId,
        reason: metadata.reason ?? fact.revision.reason,
      },
    });
    replaceRecordInStore(store, updatedFact);
    appendHistoryEntry(
      store,
      updatedFact,
      "closed",
      validToChapter,
      metadata.closedByEventId,
      metadata.reason,
    );
    closed.push(updatedFact);
  }

  return closed;
}

export interface ListObjectiveFactsOptions extends ObjectiveFactMatcher {
  activeOnly?: boolean;
  limit?: number;
}

export function listObjectiveFacts(
  store: ObjectiveFactStore,
  options: ListObjectiveFactsOptions = {},
): ObjectiveFactRecord[] {
  const {
    activeOnly = false,
    limit,
    ...matcher
  } = options;

  const results = store.timeline
    .map((factId) => store.byId[factId])
    .filter((fact): fact is ObjectiveFactRecord => {
      if (!fact) return false;
      if (activeOnly && fact.effectiveRange.toChapter !== undefined) return false;
      return matchesFact(fact, matcher);
    });

  return limit ? results.slice(-limit) : results;
}

export function listObjectiveFactHistory(
  store: ObjectiveFactStore,
  matcher: ObjectiveFactHistoryMatcher = {},
): ObjectiveFactHistoryEntry[] {
  return store.revisionLog.filter((entry) => {
    if (matcher.factId && entry.factId !== matcher.factId) return false;
    if (matcher.lineId && entry.lineId !== matcher.lineId) return false;
    if (matcher.action && entry.action !== matcher.action) return false;
    return true;
  });
}
