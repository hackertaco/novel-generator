import { describe, expect, it } from "vitest";

import {
  buildSimulationCausalLedgerAggregation,
  SimulationCausalLedgerAggregationSchema,
} from "@/lib/sim";
import type { SimulationEvent } from "@/lib/sim";

function buildRunEvent(episode: number): SimulationEvent {
  const previousEpisode = episode - 1;

  return {
    id: `evt_${String(episode).padStart(3, "0")}`,
    chapter: episode,
    type: "learn_fact",
    actorId: "hero",
    targetId: episode % 10 === 0 ? "ally" : undefined,
    summary: `Episode ${episode} records a new causal beat.`,
    prerequisites: previousEpisode > 0
      ? [
          {
            prerequisiteId: `prior-event:evt_${String(previousEpisode).padStart(3, "0")}`,
            type: "event",
            description: "The previous episode's discovery must already exist.",
            eventId: `evt_${String(previousEpisode).padStart(3, "0")}`,
          },
          {
            prerequisiteId: `carry-state:${previousEpisode}`,
            type: "scene_state",
            description: "The archive-route state carries forward.",
            stateKey: "scene:archive-route:known",
          },
        ]
      : [],
    involvedEntities: [],
    outcomes: episode % 3 === 0
      ? [{
          outcomeId: `evt_${String(episode).padStart(3, "0")}:knowledge`,
          type: "knowledge_revealed",
          summary: "The archive route becomes actionable.",
        }]
      : [],
    stateChanges: [{
      changeId: `evt_${String(episode).padStart(3, "0")}:scene-state`,
      domain: "world_model",
      operation: "update",
      stateKey: "scene:archive-route:known",
      summary: "Carry the archive route state into later episodes.",
    }],
    tags: ["aggregation-test"],
    payload: {
      subject: `archive clue ${episode}`,
      object: `route status ${episode}`,
    },
  };
}

describe("causal ledger aggregation", () => {
  it("groups a 300-episode run into per-episode summaries and cross-episode causal links", () => {
    const events = Array.from({ length: 300 }, (_, index) =>
      buildRunEvent(index + 1)
    );

    const aggregation = buildSimulationCausalLedgerAggregation(events);
    SimulationCausalLedgerAggregationSchema.parse(aggregation);

    expect(aggregation.totalEventCount).toBe(300);
    expect(aggregation.totalEpisodeCount).toBe(300);
    expect(aggregation.episodeSpan).toEqual({ start: 1, end: 300 });
    expect(aggregation.perEpisode).toHaveLength(300);
    expect(aggregation.perEpisode[0]).toMatchObject({
      episode: 1,
      eventCount: 1,
      firstEventId: "evt_001",
      lastEventId: "evt_001",
      prerequisiteCounts: {
        total: 0,
        eventLinked: 0,
        stateLinked: 0,
        unresolved: 0,
      },
    });
    expect(aggregation.perEpisode[1]).toMatchObject({
      episode: 2,
      eventIds: ["evt_002"],
      stateKeysCarriedIn: ["scene:archive-route:known"],
      inboundCrossEpisodeLinkIds: [
        "event:evt_002:prior-event:evt_001:evt_001",
        "state:evt_002:carry-state:1:evt_001:scene-state",
      ],
      prerequisiteCounts: {
        total: 2,
        eventLinked: 1,
        stateLinked: 1,
        unresolved: 0,
      },
    });
    expect(aggregation.perEpisode[299]).toMatchObject({
      episode: 300,
      firstEventId: "evt_300",
      lastEventId: "evt_300",
    });
    expect(aggregation.crossEpisode).toMatchObject({
      totalLinkCount: 598,
      resolvedLinkCount: 598,
      unresolvedLinkCount: 0,
    });
    expect(aggregation.crossEpisode.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "event_prerequisite",
          sourceEpisode: 1,
          targetEpisode: 2,
          sourceEventId: "evt_001",
          targetEventId: "evt_002",
        }),
        expect.objectContaining({
          kind: "state_prerequisite",
          sourceEpisode: 299,
          targetEpisode: 300,
          sourceStateChangeId: "evt_299:scene-state",
          stateKey: "scene:archive-route:known",
          targetEventId: "evt_300",
        }),
      ]),
    );
  });
});
