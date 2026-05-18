import { z } from "zod";
import type {
  ObjectiveFactRecord,
  ObjectiveFactStore,
} from "./objective-facts";
import { ObjectiveFactRecordSchema } from "./objective-facts";
import type { SimulationState } from "./types";

export const SimulationTimestampRelationSchema = z.enum([
  "before",
  "after",
]);

export const SimulationTimestampSchema = z.object({
  chapter: z.number().int().min(0),
  eventId: z.string().min(1).optional(),
  relation: SimulationTimestampRelationSchema.optional(),
}).superRefine((value, ctx) => {
  const hasEventId = typeof value.eventId === "string";
  const hasRelation = value.relation !== undefined;

  if (hasEventId && !hasRelation) {
    ctx.addIssue({
      code: "custom",
      path: ["relation"],
      message: "relation is required when eventId is provided",
    });
  }

  if (!hasEventId && hasRelation) {
    ctx.addIssue({
      code: "custom",
      path: ["relation"],
      message: "relation requires an eventId anchor",
    });
  }
});

export const ObjectiveStateConflictRuleSchema = z.enum([
  "later_chapter_wins",
  "later_event_wins",
  "higher_revision_wins",
  "later_timeline_wins",
]);

export const ObjectiveStateConflictSchema = z.object({
  lineId: z.string().min(1),
  winnerFactId: z.string().min(1),
  loserFactIds: z.array(z.string().min(1)).default([]),
  rulesApplied: z.array(ObjectiveStateConflictRuleSchema).min(1),
});

export const ObjectiveStateQuerySchema = z.object({
  timestamp: SimulationTimestampSchema,
  subjectEntityId: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.subjectEntityId && !value.scopeId) {
    ctx.addIssue({
      code: "custom",
      path: ["subjectEntityId"],
      message: "query requires subjectEntityId, scopeId, or both",
    });
  }
});

export const ObjectiveStateSnapshotSchema = z.object({
  timestamp: SimulationTimestampSchema,
  subjectEntityId: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
  facts: z.array(ObjectiveFactRecordSchema),
  conflicts: z.array(ObjectiveStateConflictSchema),
});

export type SimulationTimestamp = z.infer<typeof SimulationTimestampSchema>;
export type SimulationTimestampRelation = z.infer<typeof SimulationTimestampRelationSchema>;
export type ObjectiveStateConflictRule = z.infer<typeof ObjectiveStateConflictRuleSchema>;
export type ObjectiveStateConflict = z.infer<typeof ObjectiveStateConflictSchema>;
export type ObjectiveStateQuery = z.infer<typeof ObjectiveStateQuerySchema>;
export type ObjectiveStateSnapshot = z.infer<typeof ObjectiveStateSnapshotSchema>;

interface EventOrderRecord {
  chapter: number;
  sequence: number;
}

interface QueryClock {
  chapter: number;
  eventId?: string;
  sequence?: number;
  relation?: SimulationTimestampRelation;
}

interface FactOrder {
  chapter: number;
  sequence: number;
  revisionNumber: number;
  timelineIndex: number;
}

export class TemporalObjectiveStateQueryEngine {
  private readonly store: ObjectiveFactStore;
  private readonly eventOrderById = new Map<string, EventOrderRecord>();
  private readonly maxSequenceByChapter = new Map<number, number>();
  private readonly timelineIndexByFactId = new Map<string, number>();

  constructor(private readonly state: Pick<SimulationState, "objectiveFacts" | "eventLog">) {
    this.store = state.objectiveFacts;

    state.eventLog.forEach((event) => {
      const nextSequence = (this.maxSequenceByChapter.get(event.chapter) ?? 0) + 1;
      this.maxSequenceByChapter.set(event.chapter, nextSequence);
      this.eventOrderById.set(event.id, {
        chapter: event.chapter,
        sequence: nextSequence,
      });
    });

    this.store.timeline.forEach((factId, index) => {
      this.timelineIndexByFactId.set(factId, index);
    });
  }

  query(query: ObjectiveStateQuery): ObjectiveStateSnapshot {
    const parsed = ObjectiveStateQuerySchema.parse(query);
    const clock = this.resolveQueryClock(parsed.timestamp);
    const matchingFactIds = this.collectMatchingFactIds(parsed);
    const effectiveFacts = matchingFactIds
      .map((factId) => this.store.byId[factId])
      .filter((fact): fact is ObjectiveFactRecord => Boolean(fact))
      .filter((fact) => this.isEffectiveAtTimestamp(fact, clock));

    const byLineId = new Map<string, ObjectiveFactRecord[]>();
    for (const fact of effectiveFacts) {
      const facts = byLineId.get(fact.revision.lineId) ?? [];
      facts.push(fact);
      byLineId.set(fact.revision.lineId, facts);
    }

    const resolvedFacts: ObjectiveFactRecord[] = [];
    const conflicts: ObjectiveStateConflict[] = [];

    for (const facts of byLineId.values()) {
      if (facts.length === 1) {
        resolvedFacts.push(facts[0]);
        continue;
      }

      const { winner, losers, rulesApplied } = this.resolveConflict(facts);
      resolvedFacts.push(winner);
      conflicts.push(
        ObjectiveStateConflictSchema.parse({
          lineId: winner.revision.lineId,
          winnerFactId: winner.id,
          loserFactIds: losers.map((fact) => fact.id),
          rulesApplied,
        }),
      );
    }

    resolvedFacts.sort(
      (left, right) =>
        (this.timelineIndexByFactId.get(left.id) ?? -1)
        - (this.timelineIndexByFactId.get(right.id) ?? -1),
    );
    conflicts.sort((left, right) => left.lineId.localeCompare(right.lineId));

    return ObjectiveStateSnapshotSchema.parse({
      timestamp: parsed.timestamp,
      subjectEntityId: parsed.subjectEntityId,
      scopeId: parsed.scopeId,
      facts: resolvedFacts,
      conflicts,
    });
  }

  private collectMatchingFactIds(query: ObjectiveStateQuery): string[] {
    let factIds: string[] | undefined;

    if (query.subjectEntityId) {
      factIds = [...(this.store.bySubjectEntityId[query.subjectEntityId] ?? [])];
    }

    if (query.scopeId) {
      const scopeFactIds = this.store.byScopeId[query.scopeId] ?? [];
      factIds = factIds
        ? factIds.filter((factId) => scopeFactIds.includes(factId))
        : [...scopeFactIds];
    }

    return Array.from(new Set(factIds ?? []));
  }

  private resolveQueryClock(timestamp: SimulationTimestamp): QueryClock {
    const parsed = SimulationTimestampSchema.parse(timestamp);

    if (!parsed.eventId) {
      return {
        chapter: parsed.chapter,
      };
    }

    const eventOrder = this.eventOrderById.get(parsed.eventId);
    if (!eventOrder || eventOrder.chapter !== parsed.chapter) {
      throw new Error(
        `Unknown event anchor for chapter ${parsed.chapter}: ${parsed.eventId}`,
      );
    }

    return {
      chapter: parsed.chapter,
      eventId: parsed.eventId,
      sequence: eventOrder.sequence,
      relation: parsed.relation,
    };
  }

  private isEffectiveAtTimestamp(
    fact: ObjectiveFactRecord,
    clock: QueryClock,
  ): boolean {
    return this.hasStarted(fact, clock) && this.hasNotEnded(fact, clock);
  }

  private hasStarted(
    fact: ObjectiveFactRecord,
    clock: QueryClock,
  ): boolean {
    if (fact.validFromChapter < clock.chapter) {
      return true;
    }

    if (fact.validFromChapter > clock.chapter) {
      return false;
    }

    if (clock.sequence === undefined || clock.relation === undefined) {
      return true;
    }

    const startSequence = this.resolveFactStartSequence(fact);
    if (clock.relation === "before") {
      return startSequence < clock.sequence;
    }

    return startSequence <= clock.sequence;
  }

  private hasNotEnded(
    fact: ObjectiveFactRecord,
    clock: QueryClock,
  ): boolean {
    const endChapter = fact.effectiveRange.toChapter ?? fact.validToChapter;
    if (endChapter === undefined) {
      return true;
    }

    if (endChapter > clock.chapter) {
      return true;
    }

    if (endChapter < clock.chapter) {
      return false;
    }

    if (clock.sequence === undefined || clock.relation === undefined) {
      return false;
    }

    const endSequence = this.resolveFactEndSequence(fact);
    if (endSequence === undefined) {
      return true;
    }

    if (clock.relation === "before") {
      return endSequence >= clock.sequence;
    }

    return endSequence > clock.sequence;
  }

  private resolveFactStartSequence(fact: ObjectiveFactRecord): number {
    const eventId = fact.effectiveRange.fromEventId
      ?? fact.recordedAt.eventId
      ?? fact.sourceEventId;

    return this.resolveFactSequence(fact.validFromChapter, eventId, {
      whenUnknown: "after_known_events",
      whenMissing: "chapter_baseline",
    });
  }

  private resolveFactEndSequence(fact: ObjectiveFactRecord): number | undefined {
    const endChapter = fact.effectiveRange.toChapter ?? fact.validToChapter;
    if (endChapter === undefined) {
      return undefined;
    }

    const eventId = fact.effectiveRange.toEventId ?? fact.revision.closedByEventId;
    if (!eventId) {
      return undefined;
    }

    return this.resolveFactSequence(endChapter, eventId, {
      whenUnknown: "after_known_events",
      whenMissing: "chapter_baseline",
    });
  }

  private resolveFactSequence(
    chapter: number,
    eventId: string | undefined,
    options: {
      whenUnknown: "after_known_events";
      whenMissing: "chapter_baseline";
    },
  ): number {
    if (!eventId) {
      return options.whenMissing === "chapter_baseline" ? 0 : 1;
    }

    const eventOrder = this.eventOrderById.get(eventId);
    if (eventOrder && eventOrder.chapter === chapter) {
      return eventOrder.sequence;
    }

    return (this.maxSequenceByChapter.get(chapter) ?? 0) + 1;
  }

  private resolveConflict(
    facts: ObjectiveFactRecord[],
  ): {
    winner: ObjectiveFactRecord;
    losers: ObjectiveFactRecord[];
    rulesApplied: ObjectiveStateConflictRule[];
  } {
    const ordered = [...facts].sort((left, right) => this.compareFactPrecedence(left, right));
    const winner = ordered[ordered.length - 1];
    const losers = ordered.slice(0, -1);
    const runnerUp = losers[losers.length - 1];
    const rulesApplied: ObjectiveStateConflictRule[] = runnerUp
      ? this.describeResolutionRules(runnerUp, winner)
      : ["later_timeline_wins"];

    return {
      winner,
      losers,
      rulesApplied,
    };
  }

  private compareFactPrecedence(
    left: ObjectiveFactRecord,
    right: ObjectiveFactRecord,
  ): number {
    const leftOrder = this.buildFactOrder(left);
    const rightOrder = this.buildFactOrder(right);

    if (leftOrder.chapter !== rightOrder.chapter) {
      return leftOrder.chapter - rightOrder.chapter;
    }

    if (leftOrder.sequence !== rightOrder.sequence) {
      return leftOrder.sequence - rightOrder.sequence;
    }

    if (leftOrder.revisionNumber !== rightOrder.revisionNumber) {
      return leftOrder.revisionNumber - rightOrder.revisionNumber;
    }

    return leftOrder.timelineIndex - rightOrder.timelineIndex;
  }

  private buildFactOrder(fact: ObjectiveFactRecord): FactOrder {
    return {
      chapter: fact.validFromChapter,
      sequence: this.resolveFactStartSequence(fact),
      revisionNumber: fact.revision.revisionNumber,
      timelineIndex: this.timelineIndexByFactId.get(fact.id) ?? -1,
    };
  }

  private describeResolutionRules(
    loser: ObjectiveFactRecord,
    winner: ObjectiveFactRecord,
  ): ObjectiveStateConflictRule[] {
    const rules: ObjectiveStateConflictRule[] = [];
    const loserOrder = this.buildFactOrder(loser);
    const winnerOrder = this.buildFactOrder(winner);

    if (winnerOrder.chapter !== loserOrder.chapter) {
      rules.push("later_chapter_wins");
    }

    if (winnerOrder.chapter === loserOrder.chapter && winnerOrder.sequence !== loserOrder.sequence) {
      rules.push("later_event_wins");
    }

    if (
      winnerOrder.chapter === loserOrder.chapter
      && winnerOrder.sequence === loserOrder.sequence
      && winnerOrder.revisionNumber !== loserOrder.revisionNumber
    ) {
      rules.push("higher_revision_wins");
    }

    if (rules.length === 0) {
      rules.push("later_timeline_wins");
    }

    return rules;
  }
}

export function queryObjectiveStateAtTimestamp(
  state: Pick<SimulationState, "objectiveFacts" | "eventLog">,
  query: ObjectiveStateQuery,
): ObjectiveStateSnapshot {
  return new TemporalObjectiveStateQueryEngine(state).query(query);
}
