import { describe, expect, it } from "vitest";

import {
  applySimulationEventLedgerPatch,
  buildRetroactiveCorrectionPlan,
  SimulationEventLedgerPatchError,
} from "@/lib/sim";

describe("simulation event ledger patching", () => {
  it("applies approved ledger edits and preserves correction provenance on the patched event", () => {
    const plan = buildRetroactiveCorrectionPlan({
      ledger: [
        {
          id: "evt-hidden-door",
          chapter: 8,
          type: "plot_action",
          summary: "The hidden door opens but required ledger metadata is incomplete.",
          payload: {
            subject: "hidden door",
            predicate: "major_action",
            object: "The hidden door opens.",
            canonicalFact: "The hidden door opens.",
            canonicalSummary: "The hidden door opens.",
            triggeredBy: "A seal key turns inside the archive lock.",
            leadsTo: "The hero enters the sealed annex.",
          },
        },
      ],
      failureReport: {
        code: "missing_required_field",
        eventId: "evt-hidden-door",
        chapter: 8,
        episode: 8,
        message: "The event is missing the required scene id metadata.",
      },
    });

    const result = applySimulationEventLedgerPatch(
      plan.replayScope.eventIds.map((eventId) => {
        if (eventId !== "evt-hidden-door") {
          throw new Error("unexpected event id in replay scope");
        }

        return {
          id: "evt-hidden-door",
          chapter: 8,
          type: "plot_action",
          summary: "The hidden door opens but required ledger metadata is incomplete.",
          payload: {
            subject: "hidden door",
            predicate: "major_action",
            object: "The hidden door opens.",
            canonicalFact: "The hidden door opens.",
            canonicalSummary: "The hidden door opens.",
            triggeredBy: "A seal key turns inside the archive lock.",
            leadsTo: "The hero enters the sealed annex.",
          },
        };
      }),
      plan,
      [
        {
          mutationKind: "patch_event_metadata",
          targetEventId: "evt-hidden-door",
          fieldPath: "sceneId",
          operation: "set",
          value: "scene_008_02",
        },
        {
          mutationKind: "patch_event_metadata",
          targetEventId: "evt-hidden-door",
          fieldPath: "actorId",
          operation: "set",
          value: "hero",
        },
      ],
      { correctionId: "corr-hidden-door-1" },
    );

    expect(result.report).toMatchObject({
      correctionId: "corr-hidden-door-1",
      attemptedEditCount: 2,
      appliedEditCount: 2,
      blockedEditCount: 0,
      patchedEventIds: ["evt-hidden-door"],
    });

    const patchedEvent = result.ledger.events[0];
    expect(patchedEvent?.sceneId).toBe("scene_008_02");
    expect(patchedEvent?.actorId).toBe("hero");
    expect(patchedEvent?.corrections).toEqual([
      expect.objectContaining({
        correctionId: "corr-hidden-door-1",
        failureCode: "missing_required_field",
        failureEventId: "evt-hidden-door",
        approvedWindow: expect.objectContaining({
          eventIds: ["evt-hidden-door"],
        }),
        replayWindow: expect.objectContaining({
          eventIds: ["evt-hidden-door"],
        }),
        edits: [
          expect.objectContaining({
            mutationKind: "patch_event_metadata",
            fieldPath: "sceneId",
            operation: "set",
            beforeValue: undefined,
            afterValue: "scene_008_02",
          }),
          expect.objectContaining({
            mutationKind: "patch_event_metadata",
            fieldPath: "actorId",
            operation: "set",
            beforeValue: undefined,
            afterValue: "hero",
          }),
        ],
      }),
    ]);
  });

  it("rejects edits that target events not approved for the selected mutation kind", () => {
    const ledger = [
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
      },
    ] as const;

    const plan = buildRetroactiveCorrectionPlan({
      ledger,
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

    expect(() =>
      applySimulationEventLedgerPatch(ledger, plan, [
        {
          mutationKind: "rewrite_prerequisite_reference",
          targetEventId: "evt-cause",
          fieldPath: "prerequisites.0.eventId",
          operation: "set",
          value: "evt-setup",
        },
      ])
    ).toThrowError(SimulationEventLedgerPatchError);

    try {
      applySimulationEventLedgerPatch(ledger, plan, [
        {
          mutationKind: "rewrite_prerequisite_reference",
          targetEventId: "evt-cause",
          fieldPath: "prerequisites.0.eventId",
          operation: "set",
          value: "evt-setup",
        },
      ]);
    } catch (error) {
      const patchError = error as SimulationEventLedgerPatchError;
      expect(patchError.report.appliedEditCount).toBe(0);
      expect(patchError.report.blockedEdits).toEqual([
        expect.objectContaining({
          targetEventId: "evt-cause",
          mutationKind: "rewrite_prerequisite_reference",
          approvedTargetEventIds: ["evt-effect"],
          reason: expect.stringContaining("not an approved target"),
        }),
      ]);
    }
  });

  it("rejects edits outside the declared correction window and leaves the ledger unchanged", () => {
    const ledger = [
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
        sceneId: "scene_004_01",
      },
    ] as const;

    const plan = buildRetroactiveCorrectionPlan({
      ledger,
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

    expect(() =>
      applySimulationEventLedgerPatch(ledger, plan, [
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-downstream",
          fieldPath: "sceneId",
          operation: "set",
          value: "scene_003_99",
        },
      ])
    ).toThrowError(SimulationEventLedgerPatchError);

    expect(ledger[2]?.sceneId).toBe("scene_004_01");

    try {
      applySimulationEventLedgerPatch(ledger, plan, [
        {
          mutationKind: "resequence_event_chronology",
          targetEventId: "evt-downstream",
          fieldPath: "sceneId",
          operation: "set",
          value: "scene_003_99",
        },
      ]);
    } catch (error) {
      const patchError = error as SimulationEventLedgerPatchError;
      expect(patchError.report.appliedEditCount).toBe(0);
      expect(patchError.report.blockedEdits).toEqual([
        expect.objectContaining({
          targetEventId: "evt-downstream",
          correctionWindowEventIds: ["evt-effect", "evt-cause"],
          reason: expect.stringContaining("outside the declared correction window"),
        }),
      ]);
    }
  });
});
