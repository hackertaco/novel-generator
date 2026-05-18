import { z } from "zod";

import {
  buildSimulationCausalLedger,
  SimulationCausalLedgerSchema,
  SimulationEventPrerequisiteTypeSchema,
  type SimulationCausalLedger,
  type SimulationEvent,
  type NormalizedSimulationEvent,
} from "./causal-ledger";

export const SimulationCausalLedgerAggregationLinkKindSchema = z.enum([
  "event_prerequisite",
  "state_prerequisite",
]);

export const SimulationCausalLedgerAggregationLinkStatusSchema = z.enum([
  "resolved",
  "unresolved",
]);

export const SimulationCausalLedgerAggregationLinkSchema = z.object({
  linkId: z.string().min(1),
  kind: SimulationCausalLedgerAggregationLinkKindSchema,
  status: SimulationCausalLedgerAggregationLinkStatusSchema,
  prerequisiteType: SimulationEventPrerequisiteTypeSchema,
  sourceEpisode: z.number().int().positive().nullable(),
  targetEpisode: z.number().int().positive(),
  sourceEventId: z.string().min(1).nullable(),
  sourceStateChangeId: z.string().min(1).nullable(),
  targetEventId: z.string().min(1),
  targetPrerequisiteId: z.string().min(1),
  stateKey: z.string().min(1).optional(),
  summary: z.string().min(1),
});

export const SimulationCausalLedgerAggregationEpisodeSchema = z.object({
  episode: z.number().int().positive(),
  eventCount: z.number().int().nonnegative(),
  firstEventId: z.string().min(1).nullable(),
  lastEventId: z.string().min(1).nullable(),
  eventIds: z.array(z.string().min(1)),
  eventTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
  actorIds: z.array(z.string().min(1)),
  targetIds: z.array(z.string().min(1)),
  involvedEntityIds: z.array(z.string().min(1)),
  sceneIds: z.array(z.string().min(1)),
  stateDomainCounts: z.record(z.string(), z.number().int().nonnegative()),
  outcomeTypeCounts: z.record(z.string(), z.number().int().nonnegative()),
  prerequisiteCounts: z.object({
    total: z.number().int().nonnegative(),
    eventLinked: z.number().int().nonnegative(),
    stateLinked: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
  }),
  stateKeysWritten: z.array(z.string().min(1)),
  stateKeysCarriedIn: z.array(z.string().min(1)),
  inboundCrossEpisodeLinkIds: z.array(z.string().min(1)),
  outboundCrossEpisodeLinkIds: z.array(z.string().min(1)),
});

export const SimulationCausalLedgerAggregationSchema = z.object({
  version: z.literal("sim-causal-aggregation.v1"),
  totalEventCount: z.number().int().nonnegative(),
  totalEpisodeCount: z.number().int().nonnegative(),
  episodeSpan: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  }).nullable(),
  perEpisode: z.array(SimulationCausalLedgerAggregationEpisodeSchema),
  crossEpisode: z.object({
    totalLinkCount: z.number().int().nonnegative(),
    resolvedLinkCount: z.number().int().nonnegative(),
    unresolvedLinkCount: z.number().int().nonnegative(),
    links: z.array(SimulationCausalLedgerAggregationLinkSchema),
  }),
});

export type SimulationCausalLedgerAggregationLinkKind = z.infer<
  typeof SimulationCausalLedgerAggregationLinkKindSchema
>;
export type SimulationCausalLedgerAggregationLinkStatus = z.infer<
  typeof SimulationCausalLedgerAggregationLinkStatusSchema
>;
export type SimulationCausalLedgerAggregationLink = z.infer<
  typeof SimulationCausalLedgerAggregationLinkSchema
>;
export type SimulationCausalLedgerAggregationEpisode = z.infer<
  typeof SimulationCausalLedgerAggregationEpisodeSchema
>;
export type SimulationCausalLedgerAggregation = z.infer<
  typeof SimulationCausalLedgerAggregationSchema
>;

interface MutableEpisodeAggregation {
  episode: number;
  eventIds: string[];
  eventTypeCounts: Record<string, number>;
  actorIds: Set<string>;
  targetIds: Set<string>;
  involvedEntityIds: Set<string>;
  sceneIds: Set<string>;
  stateDomainCounts: Record<string, number>;
  outcomeTypeCounts: Record<string, number>;
  prerequisiteCounts: {
    total: number;
    eventLinked: number;
    stateLinked: number;
    unresolved: number;
  };
  stateKeysWritten: Set<string>;
  stateKeysCarriedIn: Set<string>;
  inboundCrossEpisodeLinkIds: Set<string>;
  outboundCrossEpisodeLinkIds: Set<string>;
}

interface StateChangeProducer {
  episode: number;
  eventId: string;
  stateChangeId: string;
}

function normalizeSimulationCausalLedgerInput(
  input: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
): SimulationCausalLedger {
  if (Array.isArray(input)) {
    return buildSimulationCausalLedger(input);
  }

  return SimulationCausalLedgerSchema.parse(input);
}

function ensureEpisodeAggregation(
  episodes: Map<number, MutableEpisodeAggregation>,
  episode: number,
): MutableEpisodeAggregation {
  const existing = episodes.get(episode);
  if (existing) {
    return existing;
  }

  const created: MutableEpisodeAggregation = {
    episode,
    eventIds: [],
    eventTypeCounts: {},
    actorIds: new Set<string>(),
    targetIds: new Set<string>(),
    involvedEntityIds: new Set<string>(),
    sceneIds: new Set<string>(),
    stateDomainCounts: {},
    outcomeTypeCounts: {},
    prerequisiteCounts: {
      total: 0,
      eventLinked: 0,
      stateLinked: 0,
      unresolved: 0,
    },
    stateKeysWritten: new Set<string>(),
    stateKeysCarriedIn: new Set<string>(),
    inboundCrossEpisodeLinkIds: new Set<string>(),
    outboundCrossEpisodeLinkIds: new Set<string>(),
  };

  episodes.set(episode, created);
  return created;
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function toSortedArray(values: Set<string>): string[] {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function addCrossEpisodeLink(
  links: Map<string, SimulationCausalLedgerAggregationLink>,
  episodes: Map<number, MutableEpisodeAggregation>,
  link: SimulationCausalLedgerAggregationLink,
): void {
  if (links.has(link.linkId)) {
    return;
  }

  links.set(link.linkId, link);
  const targetEpisode = ensureEpisodeAggregation(episodes, link.targetEpisode);
  targetEpisode.inboundCrossEpisodeLinkIds.add(link.linkId);

  if (link.sourceEpisode) {
    const sourceEpisode = ensureEpisodeAggregation(episodes, link.sourceEpisode);
    sourceEpisode.outboundCrossEpisodeLinkIds.add(link.linkId);
  }
}

function buildEventPrerequisiteLink(
  event: NormalizedSimulationEvent,
  prerequisiteId: string,
  prerequisiteType: z.infer<typeof SimulationEventPrerequisiteTypeSchema>,
  sourceEvent: NormalizedSimulationEvent | undefined,
): SimulationCausalLedgerAggregationLink {
  const sourceEpisode = sourceEvent?.episode ?? null;
  const sourceEventId = sourceEvent?.id ?? null;
  const status = sourceEvent ? "resolved" : "unresolved";
  const resolvedMessage = sourceEvent
    ? `Episode ${event.episode} event "${event.id}" depends on episode ${sourceEvent.episode} event "${sourceEvent.id}".`
    : `Episode ${event.episode} event "${event.id}" references missing prerequisite event "${prerequisiteId}".`;

  return SimulationCausalLedgerAggregationLinkSchema.parse({
    linkId: `event:${event.id}:${prerequisiteId}:${sourceEventId ?? "missing"}`,
    kind: "event_prerequisite",
    status,
    prerequisiteType,
    sourceEpisode,
    targetEpisode: event.episode,
    sourceEventId,
    sourceStateChangeId: null,
    targetEventId: event.id,
    targetPrerequisiteId: prerequisiteId,
    summary: resolvedMessage,
  });
}

function buildStatePrerequisiteLink(
  event: NormalizedSimulationEvent,
  prerequisiteId: string,
  prerequisiteType: z.infer<typeof SimulationEventPrerequisiteTypeSchema>,
  stateKey: string,
  producer: StateChangeProducer | undefined,
): SimulationCausalLedgerAggregationLink {
  const sourceEpisode = producer?.episode ?? null;
  const sourceEventId = producer?.eventId ?? null;
  const sourceStateChangeId = producer?.stateChangeId ?? null;
  const status = producer ? "resolved" : "unresolved";
  const resolvedMessage = producer
    ? `Episode ${event.episode} event "${event.id}" carries state "${stateKey}" from episode ${producer.episode} event "${producer.eventId}".`
    : `Episode ${event.episode} event "${event.id}" requires state "${stateKey}" without a recorded earlier producer.`;

  return SimulationCausalLedgerAggregationLinkSchema.parse({
    linkId: `state:${event.id}:${prerequisiteId}:${sourceStateChangeId ?? "missing"}`,
    kind: "state_prerequisite",
    status,
    prerequisiteType,
    sourceEpisode,
    targetEpisode: event.episode,
    sourceEventId,
    sourceStateChangeId,
    targetEventId: event.id,
    targetPrerequisiteId: prerequisiteId,
    stateKey,
    summary: resolvedMessage,
  });
}

export function buildSimulationCausalLedgerAggregation(
  input: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
): SimulationCausalLedgerAggregation {
  const normalized = normalizeSimulationCausalLedgerInput(input);
  const episodes = new Map<number, MutableEpisodeAggregation>();
  const links = new Map<string, SimulationCausalLedgerAggregationLink>();
  const eventById = new Map(
    normalized.events.map((event) => [event.id, event] as const),
  );
  const stateProducerByKey = new Map<string, StateChangeProducer>();

  for (const event of normalized.events) {
    const episode = ensureEpisodeAggregation(episodes, event.episode);
    episode.eventIds.push(event.id);
    incrementCount(episode.eventTypeCounts, event.type);

    if (event.actorId) {
      episode.actorIds.add(event.actorId);
    }

    if (event.targetId) {
      episode.targetIds.add(event.targetId);
    }

    if (event.sceneId) {
      episode.sceneIds.add(event.sceneId);
    }

    for (const entity of event.involvedEntities) {
      episode.involvedEntityIds.add(entity.entityId);
    }

    for (const prerequisite of event.prerequisites) {
      episode.prerequisiteCounts.total += 1;

      if (prerequisite.eventId) {
        episode.prerequisiteCounts.eventLinked += 1;
        const sourceEvent = eventById.get(prerequisite.eventId);

        if (!sourceEvent) {
          episode.prerequisiteCounts.unresolved += 1;
        }

        if (!sourceEvent || sourceEvent.episode !== event.episode) {
          addCrossEpisodeLink(
            links,
            episodes,
            buildEventPrerequisiteLink(
              event,
              prerequisite.prerequisiteId,
              prerequisite.type,
              sourceEvent,
            ),
          );
        }

        continue;
      }

      if (prerequisite.stateKey) {
        episode.prerequisiteCounts.stateLinked += 1;
        const producer = stateProducerByKey.get(prerequisite.stateKey);

        if (producer && producer.episode !== event.episode) {
          episode.stateKeysCarriedIn.add(prerequisite.stateKey);
          addCrossEpisodeLink(
            links,
            episodes,
            buildStatePrerequisiteLink(
              event,
              prerequisite.prerequisiteId,
              prerequisite.type,
              prerequisite.stateKey,
              producer,
            ),
          );
        }
      }
    }

    for (const stateChange of event.stateChanges) {
      incrementCount(episode.stateDomainCounts, stateChange.domain);
      episode.stateKeysWritten.add(stateChange.stateKey);
      stateProducerByKey.set(stateChange.stateKey, {
        episode: event.episode,
        eventId: event.id,
        stateChangeId: stateChange.changeId,
      });
    }

    for (const outcome of event.outcomes) {
      incrementCount(episode.outcomeTypeCounts, outcome.type);
    }
  }

  const perEpisode = Array.from(episodes.values())
    .sort((left, right) => left.episode - right.episode)
    .map((episode) =>
      SimulationCausalLedgerAggregationEpisodeSchema.parse({
        episode: episode.episode,
        eventCount: episode.eventIds.length,
        firstEventId: episode.eventIds[0] ?? null,
        lastEventId: episode.eventIds.at(-1) ?? null,
        eventIds: episode.eventIds,
        eventTypeCounts: episode.eventTypeCounts,
        actorIds: toSortedArray(episode.actorIds),
        targetIds: toSortedArray(episode.targetIds),
        involvedEntityIds: toSortedArray(episode.involvedEntityIds),
        sceneIds: toSortedArray(episode.sceneIds),
        stateDomainCounts: episode.stateDomainCounts,
        outcomeTypeCounts: episode.outcomeTypeCounts,
        prerequisiteCounts: episode.prerequisiteCounts,
        stateKeysWritten: toSortedArray(episode.stateKeysWritten),
        stateKeysCarriedIn: toSortedArray(episode.stateKeysCarriedIn),
        inboundCrossEpisodeLinkIds: toSortedArray(
          episode.inboundCrossEpisodeLinkIds,
        ),
        outboundCrossEpisodeLinkIds: toSortedArray(
          episode.outboundCrossEpisodeLinkIds,
        ),
      }),
    );

  const crossEpisodeLinks = Array.from(links.values()).sort((left, right) =>
    left.targetEpisode - right.targetEpisode
    || (left.sourceEpisode ?? 0) - (right.sourceEpisode ?? 0)
    || left.targetEventId.localeCompare(right.targetEventId)
    || left.linkId.localeCompare(right.linkId),
  );
  const resolvedLinkCount = crossEpisodeLinks.filter((link) =>
    link.status === "resolved"
  ).length;
  const firstEpisode = perEpisode[0]?.episode ?? null;
  const lastEpisode = perEpisode.at(-1)?.episode ?? null;

  return SimulationCausalLedgerAggregationSchema.parse({
    version: "sim-causal-aggregation.v1",
    totalEventCount: normalized.events.length,
    totalEpisodeCount: perEpisode.length,
    episodeSpan:
      firstEpisode && lastEpisode
        ? {
            start: firstEpisode,
            end: lastEpisode,
          }
        : null,
    perEpisode,
    crossEpisode: {
      totalLinkCount: crossEpisodeLinks.length,
      resolvedLinkCount,
      unresolvedLinkCount: crossEpisodeLinks.length - resolvedLinkCount,
      links: crossEpisodeLinks,
    },
  });
}
