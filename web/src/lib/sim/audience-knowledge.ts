import { z } from "zod";

export const AudienceKnowledgeKindSchema = z.enum([
  "fact_revealed",
  "hint_planted",
  "misdirection",
  "must_understand",
]);

export const AudienceKnowledgeStatusSchema = z.enum([
  "pending",
  "revealed",
  "resolved",
  "subverted",
]);

export const AudienceKnowledgeSourceSchema = z.enum([
  "dialogue",
  "action",
  "monologue",
  "exposition",
  "flashback",
  "editorial",
]);

export const AudienceKnowledgeReferenceSchema = z.object({
  eventId: z.string().min(1).optional(),
  objectiveFactIds: z.array(z.string()).default([]),
  characterBeliefIds: z.array(z.string()).default([]),
  utteranceIds: z.array(z.string()).default([]),
});

export const AudienceKnowledgeRecordSchema = z.object({
  id: z.string().min(1),
  chapter: z.number().int().min(0),
  kind: AudienceKnowledgeKindSchema,
  subject: z.string().min(1),
  summary: z.string().min(1),
  status: AudienceKnowledgeStatusSchema.default("revealed"),
  source: AudienceKnowledgeSourceSchema.default("action"),
  plantedAtChapter: z.number().int().min(0).optional(),
  resolvedAtChapter: z.number().int().min(0).optional(),
  references: AudienceKnowledgeReferenceSchema,
  tags: z.array(z.string()).default([]),
});

export const AudienceKnowledgeStoreSchema = z.object({
  byId: z.record(z.string(), AudienceKnowledgeRecordSchema),
  timeline: z.array(z.string()),
  bySummary: z.record(z.string(), z.string()),
});

export type AudienceKnowledgeKind = z.infer<typeof AudienceKnowledgeKindSchema>;
export type AudienceKnowledgeStatus = z.infer<typeof AudienceKnowledgeStatusSchema>;
export type AudienceKnowledgeSource = z.infer<typeof AudienceKnowledgeSourceSchema>;
export type AudienceKnowledgeReference = z.infer<typeof AudienceKnowledgeReferenceSchema>;
export type AudienceKnowledgeRecord = z.infer<typeof AudienceKnowledgeRecordSchema>;
export type AudienceKnowledgeStore = z.infer<typeof AudienceKnowledgeStoreSchema>;

export interface AudienceKnowledgeInput {
  chapter: number;
  kind: AudienceKnowledgeKind;
  subject: string;
  summary: string;
  status?: AudienceKnowledgeStatus;
  source?: AudienceKnowledgeSource;
  plantedAtChapter?: number;
  resolvedAtChapter?: number;
  references?: Partial<AudienceKnowledgeReference>;
  tags?: string[];
}

export interface ListAudienceKnowledgeOptions {
  kinds?: AudienceKnowledgeKind[];
  statuses?: AudienceKnowledgeStatus[];
  uptoChapter?: number;
  limit?: number;
}

export function createAudienceKnowledgeStore(): AudienceKnowledgeStore {
  return AudienceKnowledgeStoreSchema.parse({
    byId: {},
    timeline: [],
    bySummary: {},
  });
}

export function cloneAudienceKnowledgeStore(
  store: AudienceKnowledgeStore,
): AudienceKnowledgeStore {
  return {
    byId: Object.fromEntries(
      Object.entries(store.byId).map(([id, record]) => [
        id,
        {
          ...record,
          references: {
            eventId: record.references.eventId,
            objectiveFactIds: [...record.references.objectiveFactIds],
            characterBeliefIds: [...record.references.characterBeliefIds],
            utteranceIds: [...record.references.utteranceIds],
          },
          tags: [...record.tags],
        },
      ]),
    ),
    timeline: [...store.timeline],
    bySummary: { ...store.bySummary },
  };
}

function normalizeSummaryKey(summary: string): string {
  return summary.trim().toLowerCase();
}

export function hasAudienceKnowledgeSummary(
  store: AudienceKnowledgeStore,
  summary: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    store.bySummary,
    normalizeSummaryKey(summary),
  );
}

export function getAudienceKnowledgeBySummary(
  store: AudienceKnowledgeStore,
  summary: string,
): AudienceKnowledgeRecord | undefined {
  const id = store.bySummary[normalizeSummaryKey(summary)];
  return id ? store.byId[id] : undefined;
}

function nextAudienceKnowledgeIndex(store: AudienceKnowledgeStore): number {
  let maxIndex = 0;
  for (const id of store.timeline) {
    const parsed = Number.parseInt(id.split(":").at(-1) ?? "", 10);
    if (Number.isFinite(parsed) && parsed > maxIndex) {
      maxIndex = parsed;
    }
  }
  return maxIndex + 1;
}

export function addAudienceKnowledge(
  store: AudienceKnowledgeStore,
  input: AudienceKnowledgeInput,
): AudienceKnowledgeRecord {
  const summaryKey = normalizeSummaryKey(input.summary);
  const existingId = store.bySummary[summaryKey];
  if (existingId && store.byId[existingId]) {
    return store.byId[existingId];
  }

  const nextIndex = nextAudienceKnowledgeIndex(store);
  const id = `audience:${nextIndex}`;

  const record = AudienceKnowledgeRecordSchema.parse({
    id,
    chapter: input.chapter,
    kind: input.kind,
    subject: input.subject,
    summary: input.summary,
    status: input.status ?? (input.kind === "must_understand" ? "pending" : "revealed"),
    source: input.source ?? "action",
    plantedAtChapter: input.plantedAtChapter,
    resolvedAtChapter: input.resolvedAtChapter,
    references: {
      eventId: input.references?.eventId,
      objectiveFactIds: input.references?.objectiveFactIds ?? [],
      characterBeliefIds: input.references?.characterBeliefIds ?? [],
      utteranceIds: input.references?.utteranceIds ?? [],
    },
    tags: input.tags ?? [],
  });

  store.byId[id] = record;
  store.timeline.push(id);
  store.bySummary[summaryKey] = id;
  return record;
}

export function listAudienceKnowledge(
  store: AudienceKnowledgeStore,
  options: ListAudienceKnowledgeOptions = {},
): AudienceKnowledgeRecord[] {
  const { kinds, statuses, uptoChapter, limit } = options;
  const kindFilter = kinds ? new Set(kinds) : undefined;
  const statusFilter = statuses ? new Set(statuses) : undefined;

  const records = store.timeline
    .map((id) => store.byId[id])
    .filter((record): record is AudienceKnowledgeRecord => {
      if (!record) return false;
      if (uptoChapter !== undefined && record.chapter > uptoChapter) return false;
      if (kindFilter && !kindFilter.has(record.kind)) return false;
      if (statusFilter && !statusFilter.has(record.status)) return false;
      return true;
    });

  return limit ? records.slice(-limit) : records;
}

export function updateAudienceKnowledgeStatus(
  store: AudienceKnowledgeStore,
  id: string,
  status: AudienceKnowledgeStatus,
  resolvedAtChapter?: number,
): AudienceKnowledgeRecord | undefined {
  const record = store.byId[id];
  if (!record) return undefined;

  const next: AudienceKnowledgeRecord = {
    ...record,
    status,
    resolvedAtChapter: resolvedAtChapter ?? record.resolvedAtChapter,
  };
  store.byId[id] = next;
  return next;
}
