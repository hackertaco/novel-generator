import { describe, expect, it } from "vitest";

import { buildRetroactiveCorrectionPlan } from "@/lib/sim";

describe("retroactive correction planning", () => {
  it("bounds a prerequisite-order failure to the conflicting span and its downstream replay window", () => {
    const plan = buildRetroactiveCorrectionPlan({
      ledger: [
        {
          id: "evt-setup",
          chapter: 1,
          type: "plot_action",
          summary: "The archive map is hidden.",
        },
        {
          id: "evt-effect",
          chapter: 2,
          type: "plot_action",
          summary: "The hero acts on a clue before its cause exists.",
          prerequisites: [
            {
              prerequisiteId: "needs-cause",
              type: "event",
              description: "The cause must already have happened.",
              eventId: "evt-cause",
            },
          ],
        },
        {
          id: "evt-cause",
          chapter: 3,
          type: "plot_action",
          summary: "The actual cause is recorded too late.",
        },
        {
          id: "evt-downstream",
          chapter: 4,
          type: "plot_action",
          summary: "A downstream scene depends on the invalid effect event.",
          prerequisites: [
            {
              prerequisiteId: "needs-effect",
              type: "event",
              description: "Depends on the repaired effect event.",
              eventId: "evt-effect",
            },
          ],
        },
      ],
      failureReport: {
        code: "prerequisite_order_violation",
        eventId: "evt-effect",
        chapter: 2,
        episode: 2,
        referencedEventId: "evt-cause",
        prerequisiteId: "needs-cause",
        message:
          "Prerequisite event \"evt-cause\" must appear before \"evt-effect\".",
      },
    });

    expect(plan.minimalAffectedSpan).toMatchObject({
      startEventId: "evt-effect",
      endEventId: "evt-cause",
      startEpisode: 2,
      endEpisode: 3,
      eventIds: ["evt-effect", "evt-cause"],
      anchorEventIds: ["evt-effect", "evt-cause"],
    });
    expect(plan.allowedLedgerMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "rewrite_prerequisite_reference",
          targetEventIds: ["evt-effect"],
        }),
        expect.objectContaining({
          kind: "resequence_event_chronology",
          targetEventIds: ["evt-effect", "evt-cause"],
        }),
      ]),
    );
    expect(plan.replayScope).toMatchObject({
      startEventId: "evt-effect",
      endEventId: "evt-downstream",
      eventIds: ["evt-effect", "evt-cause", "evt-downstream"],
      dependentEventIds: ["evt-downstream"],
    });
  });

  it("anchors an unmet prerequisite state failure to the last writer of the impacted state key", () => {
    const plan = buildRetroactiveCorrectionPlan({
      ledger: [
        {
          id: "evt-rested",
          chapter: 2,
          type: "status_change",
          actorId: "hero",
          summary: "The hero recovers enough to continue.",
          stateChanges: [
            {
              changeId: "evt-rested:status",
              domain: "character_state",
              operation: "update",
              stateKey: "character:hero:status",
              summary: "Hero status updated to rested",
              entityIds: ["hero"],
              afterValue: "rested",
            },
          ],
        },
        {
          id: "evt-assault",
          chapter: 6,
          type: "plot_action",
          actorId: "hero",
          summary: "The hero launches an assault without the required ready-state trace.",
          prerequisites: [
            {
              prerequisiteId: "hero-ready",
              type: "scene_state",
              description: "Hero must be in the rested state first.",
              stateKey: "character:hero:status",
            },
          ],
        },
        {
          id: "evt-fallout",
          chapter: 7,
          type: "plot_action",
          actorId: "hero",
          summary: "A later scene still depends on the same readiness state.",
          prerequisites: [
            {
              prerequisiteId: "hero-ready-again",
              type: "scene_state",
              description: "Later scenes still read the repaired state boundary.",
              stateKey: "character:hero:status",
            },
          ],
        },
      ],
      failureReport: {
        code: "unmet_prerequisite_state",
        eventId: "evt-assault",
        chapter: 6,
        episode: 6,
        stateKey: "character:hero:status",
        message:
          "Event \"evt-assault\" requires a status precondition that is not satisfied in the ledger.",
      },
    });

    expect(plan.minimalAffectedSpan).toMatchObject({
      startEventId: "evt-rested",
      endEventId: "evt-assault",
      eventIds: ["evt-rested", "evt-assault"],
    });
    expect(plan.allowedLedgerMutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "repair_prerequisite_state",
          allowedFieldPaths: expect.arrayContaining([
            "prerequisites.stateKey",
            "prerequisites.eventId",
          ]),
        }),
        expect.objectContaining({
          kind: "annotate_state_transition",
          targetEventIds: ["evt-rested", "evt-assault"],
        }),
      ]),
    );
    expect(plan.replayScope).toMatchObject({
      endEventId: "evt-fallout",
      dependentEventIds: ["evt-fallout"],
      impactedStateKeys: ["character:hero:status"],
    });
  });

  it("accepts long-form continuity-style reports and keeps single-event link fixes local", () => {
    const plan = buildRetroactiveCorrectionPlan({
      ledger: [
        {
          id: "evt-hidden-door",
          chapter: 8,
          type: "plot_action",
          summary: "The hidden door opens but the witness link is missing.",
        },
      ],
      failureReport: {
        code: "missing_entity_link",
        eventId: "evt-hidden-door",
        chapter: 8,
        episode: 8,
        summary: "The event is missing the required witness entity linkage.",
      },
    });

    expect(plan.failure.message).toBe(
      "The event is missing the required witness entity linkage.",
    );
    expect(plan.minimalAffectedSpan).toMatchObject({
      startEventId: "evt-hidden-door",
      endEventId: "evt-hidden-door",
      eventIds: ["evt-hidden-door"],
    });
    expect(plan.allowedLedgerMutations).toEqual([
      expect.objectContaining({
        kind: "patch_involved_entities",
        targetEventIds: ["evt-hidden-door"],
        allowedFieldPaths: expect.arrayContaining([
          "actorId",
          "targetId",
          "involvedEntities",
        ]),
      }),
    ]);
    expect(plan.replayScope).toMatchObject({
      startEventId: "evt-hidden-door",
      endEventId: "evt-hidden-door",
      dependentEventIds: [],
      eventIds: ["evt-hidden-door"],
    });
  });
});
