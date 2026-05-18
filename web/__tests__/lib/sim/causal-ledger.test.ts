import { describe, expect, it } from "vitest";

import type { NovelSeed } from "@/lib/schema/novel";
import {
  createSimulationCausalLedgerStore,
  buildSimulationCausalLedger,
  createSimulationState,
  loadSimulationCausalLedger,
  parseSimulationEvent,
  querySimulationCausalLedger,
  serializeSimulationCausalLedger,
  SimulationCausalLedgerSchema,
  SimulationEventLedger,
  validateMajorPlotActionLedger,
} from "@/lib/sim";

function makeSeed(): NovelSeed {
  return {
    title: "Causal Ledger Test",
    logline: "Machine-readable causal ledger validation.",
    total_chapters: 12,
    world: {
      name: "Archive Court",
      genre: "fantasy",
      sub_genre: "mystery",
      time_period: "late empire",
      magic_system: null,
      key_locations: {
        Archive: "Records chamber",
        Corridor: "Outer hall",
      },
      factions: {},
      rules: ["Objective facts update before character interpretation."],
    },
    characters: [
      {
        id: "hero",
        name: "Ha-eon",
        role: "Archivist",
        social_rank: "gentry",
        introduction_chapter: 1,
        voice: {
          tone: "measured",
          speech_patterns: ["I need the record first."],
          sample_dialogues: ["The ledger decides."],
          personality_core: "precise",
        },
        backstory: "Survived an archive fire.",
        arc_summary: "Learns to separate truth from interpretation.",
        state: {
          level: null,
          location: "Archive",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
      {
        id: "ally",
        name: "Ji-su",
        role: "Investigator",
        social_rank: "commoner",
        introduction_chapter: 1,
        voice: {
          tone: "direct",
          speech_patterns: ["Move first."],
          sample_dialogues: ["We can verify it later."],
          personality_core: "fast",
        },
        backstory: "Tracks routes through the palace.",
        arc_summary: "Supports the archivist.",
        state: {
          level: null,
          location: "Archive",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
    ],
    arcs: [],
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.5,
      sentence_style: "short",
      hook_ending: true,
      pov: "3rd",
      tense: "past",
      formatting_rules: [],
    },
    story_threads: [],
  };
}

describe("causal ledger contract", () => {
  it("normalizes a chapter-indexed plot action into an episode-indexed causal event", () => {
    const parsed = parseSimulationEvent({
      id: "evt_007",
      chapter: 7,
      type: "learn_fact",
      actorId: "hero",
      targetId: "ally",
      summary: "The hidden vault map is recovered.",
      payload: {
        recipients: ["hero", "ally"],
        subject: "vault map",
        object: "river passage",
      },
    });

    expect(parsed.episode).toBe(7);
    expect(parsed.chapter).toBe(7);
    expect(parsed.involvedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "hero", entityType: "character", role: "actor" }),
        expect.objectContaining({ entityId: "ally", entityType: "character", role: "target" }),
        expect.objectContaining({ entityId: "ally", entityType: "character", role: "recipient" }),
        expect.objectContaining({ entityType: "concept", role: "subject", label: "vault map" }),
        expect.objectContaining({ entityType: "concept", role: "object", label: "river passage" }),
      ]),
    );
    expect(parsed.prerequisites).toEqual([]);
    expect(parsed.outcomes).toEqual([]);
    expect(parsed.stateChanges).toEqual([]);
  });

  it("records prerequisites, state changes, outcomes, and involved entities in the event log", () => {
    const ledger = new SimulationEventLedger();
    const state = createSimulationState(makeSeed());

    const next = ledger.applyEvent(state, {
      id: "evt_002",
      chapter: 2,
      type: "move",
      actorId: "hero",
      targetId: "ally",
      location: "Corridor",
      summary: "Ha-eon moves to the outer corridor.",
    });

    const stored = next.eventLog[0];
    const causalLedger = buildSimulationCausalLedger(next.eventLog);
    SimulationCausalLedgerSchema.parse(causalLedger);

    expect(stored?.episode).toBe(2);
    expect(stored?.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prerequisiteId: "character:hero:exists",
          stateKey: "character:hero",
        }),
        expect.objectContaining({
          prerequisiteId: "character:ally:exists",
          stateKey: "character:ally",
        }),
      ]),
    );
    expect(stored?.involvedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: "hero", role: "actor" }),
        expect.objectContaining({ entityId: "ally", role: "target" }),
        expect.objectContaining({ entityType: "location", role: "location", label: "Corridor" }),
      ]),
    );
    expect(stored?.stateChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "character_state",
          operation: "update",
          stateKey: "character:hero:location",
        }),
        expect.objectContaining({
          domain: "objective_facts",
          operation: "create",
        }),
        expect.objectContaining({
          domain: "memories",
          operation: "record",
        }),
      ]),
    );
    expect(stored?.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "character_state_changed" }),
        expect.objectContaining({ type: "objective_fact_created" }),
        expect.objectContaining({ type: "memory_recorded" }),
      ]),
    );
  });

  it("captures thread resolution prerequisites as causal ledger metadata", () => {
    const ledger = new SimulationEventLedger();
    const initial = createSimulationState(makeSeed());
    const opened = ledger.applyEvent(initial, {
      id: "evt_003",
      chapter: 3,
      type: "open_thread",
      actorId: "hero",
      summary: "A hidden-route question is opened.",
      payload: {
        threadId: "thread:hidden-route",
        title: "Hidden Route",
      },
    });

    const resolved = ledger.applyEvent(opened, {
      id: "evt_004",
      chapter: 4,
      type: "resolve_thread",
      actorId: "hero",
      summary: "The hidden-route question is resolved.",
      payload: {
        threadId: "thread:hidden-route",
      },
    });

    const resolution = resolved.eventLog.at(-1);

    expect(resolution?.prerequisites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prerequisiteId: "thread:thread:hidden-route:open",
          type: "thread",
          stateKey: "thread:thread:hidden-route",
        }),
      ]),
    );
    expect(resolution?.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "thread_resolved",
        }),
      ]),
    );
    expect(resolution?.stateChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "threads",
          operation: "resolve",
          stateKey: "thread:thread:hidden-route",
        }),
      ]),
    );
  });

  it("appends, serializes, loads, and queries causal records across a 300-episode run", () => {
    const runtimeLedger = new SimulationEventLedger();
    const persistedLedger = createSimulationCausalLedgerStore();
    let state = createSimulationState(makeSeed());

    for (let episode = 1; episode <= 300; episode++) {
      state = runtimeLedger.applyEvent(state, episode % 2 === 0
        ? {
          id: `evt-${episode}`,
          chapter: episode,
          type: "learn_fact",
          actorId: "hero",
          targetId: episode % 5 === 0 ? "ally" : undefined,
          summary: `Episode ${episode} reveals a new archive clue.`,
          payload: {
            recipients: ["hero"],
            subject: `archive clue ${episode}`,
            object: `vault answer ${episode}`,
          },
        }
        : {
          id: `evt-${episode}`,
          chapter: episode,
          type: "move",
          actorId: "hero",
          targetId: episode % 5 === 0 ? "ally" : undefined,
          location: `Corridor ${episode}`,
          summary: `Episode ${episode} moves Ha-eon deeper into the archive.`,
        });

      persistedLedger.append(state.eventLog.at(-1)!);
    }

    expect(persistedLedger.size).toBe(300);

    const serialized = serializeSimulationCausalLedger(persistedLedger.list());
    const loaded = loadSimulationCausalLedger(serialized);
    SimulationCausalLedgerSchema.parse(loaded);

    expect(loaded.events).toHaveLength(300);
    expect(loaded.events[0]?.episode).toBe(1);
    expect(loaded.events.at(-1)?.episode).toBe(300);

    const middleRange = querySimulationCausalLedger(loaded, {
      episodeRange: { start: 101, end: 200 },
      actorId: "hero",
    });
    expect(middleRange.totalEventCount).toBe(300);
    expect(middleRange.matchedEventCount).toBe(100);
    expect(middleRange.events[0]?.episode).toBe(101);
    expect(middleRange.events.at(-1)?.episode).toBe(200);

    const allyTouchpoints = querySimulationCausalLedger(loaded, {
      involvedEntityId: "ally",
      limit: 3,
    });
    expect(allyTouchpoints.matchedEventCount).toBe(60);
    expect(allyTouchpoints.events).toHaveLength(3);
    expect(allyTouchpoints.events.every((event) => event.involvedEntities.some((entity) => entity.entityId === "ally"))).toBe(true);
  }, 10_000);

  it("flags incomplete or incoherent major plot actions in the ledger", () => {
    const validation = validateMajorPlotActionLedger([
      {
        id: "evt_plot_002",
        chapter: 2,
        episode: 2,
        type: "plot_action",
        sceneId: "scene_002_02",
        actorId: "hero",
        summary: "A later action is recorded before its prerequisite.",
        prerequisites: [{
          prerequisiteId: "prior-event:evt_plot_003",
          type: "event",
          description: "Should reference an earlier scene.",
          eventId: "evt_plot_003",
        }],
        involvedEntities: [{
          entityId: "ally",
          entityType: "character",
          role: "witness",
        }],
        outcomes: [],
        stateChanges: [],
        tags: ["major-plot-action"],
        payload: {
          predicate: "major_action",
          object: "북회랑 안쪽 수색을 시작한다.",
          canonicalSummary: "북회랑 안쪽 수색을 시작한다.",
          sceneCharacterIds: ["hero", "ally"],
          leadsTo: "다음 장면에서 봉인실에 도달한다.",
        },
      },
      {
        id: "evt_plot_003",
        chapter: 1,
        episode: 1,
        type: "plot_action",
        sceneId: "scene_001_01",
        summary: "An earlier action is recorded after the later one.",
        prerequisites: [],
        involvedEntities: [],
        outcomes: [],
        stateChanges: [],
        tags: ["major-plot-action"],
        payload: {
          subject: "누군가가 북회랑에 먼저 들어갔다.",
          predicate: "major_action",
          object: "누군가가 북회랑에 먼저 들어갔다.",
          canonicalFact: "누군가가 북회랑에 먼저 들어갔다.",
          canonicalSummary: "누군가가 북회랑에 먼저 들어갔다.",
          triggeredBy: "전 화에서 장부의 행방이 북회랑으로 좁혀졌다.",
          leadsTo: "수색을 시작한다.",
          sceneCharacterIds: ["hero"],
        },
      },
    ]);

    expect(validation.passed).toBe(false);
    expect(validation.majorPlotActionCount).toBe(2);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_plot_002",
          code: "missing_required_field",
          field: "payload.subject",
        }),
        expect.objectContaining({
          eventId: "evt_plot_002",
          code: "missing_required_field",
          field: "payload.canonicalFact",
        }),
        expect.objectContaining({
          eventId: "evt_plot_002",
          code: "missing_required_field",
          field: "payload.triggeredBy",
        }),
        expect.objectContaining({
          eventId: "evt_plot_002",
          code: "prerequisite_order_violation",
          referencedEventId: "evt_plot_003",
        }),
        expect.objectContaining({
          eventId: "evt_plot_003",
          code: "missing_required_field",
          field: "actorId",
        }),
        expect.objectContaining({
          eventId: "evt_plot_003",
          code: "missing_prerequisite_reference",
        }),
        expect.objectContaining({
          eventId: "evt_plot_003",
          code: "missing_entity_link",
          entityId: "hero",
          field: "payload.sceneCharacterIds",
        }),
        expect.objectContaining({
          eventId: "evt_plot_003",
          code: "episode_order_violation",
          referencedEventId: "evt_plot_002",
        }),
      ]),
    );
  });

  it("flags cause-after-effect and chronology regressions for non-plot events too", () => {
    const validation = validateMajorPlotActionLedger([
      {
        id: "evt_effect_first",
        chapter: 2,
        type: "learn_fact",
        actorId: "hero",
        summary: "Ha-eon reacts before the underlying cause is logged.",
        prerequisites: [{
          prerequisiteId: "cause:evt_cause_later",
          type: "event",
          description: "The cause should already exist.",
          eventId: "evt_cause_later",
        }],
        payload: {
          fact: "The vault alarm is already ringing.",
          recipients: ["hero"],
        },
      },
      {
        id: "evt_cause_later",
        chapter: 1,
        type: "learn_fact",
        actorId: "ally",
        summary: "Ji-su actually triggers the vault alarm here.",
        payload: {
          fact: "Ji-su triggered the vault alarm.",
          recipients: ["ally"],
        },
      },
    ]);

    expect(validation.majorPlotActionCount).toBe(0);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_effect_first",
          code: "prerequisite_order_violation",
          referencedEventId: "evt_cause_later",
        }),
        expect.objectContaining({
          eventId: "evt_cause_later",
          code: "episode_order_violation",
          referencedEventId: "evt_effect_first",
        }),
      ]),
    );
  });

  it("flags foreshadow setup beats that appear after a payoff episode", () => {
    const validation = validateMajorPlotActionLedger([
      {
        id: "evt_payoff_archive_key",
        chapter: 8,
        type: "learn_fact",
        actorId: "hero",
        summary: "The archive key's purpose is fully revealed.",
        payload: {
          fact: "The archive key unlocks the submerged vault.",
          recipients: ["hero"],
        },
      },
      {
        id: "evt_late_archive_key_setup",
        chapter: 10,
        type: "learn_fact",
        actorId: "ally",
        summary: "A delayed setup beat for the same key appears too late.",
        payload: {
          fact: "Ji-su notices the archive key glinting under moonlight.",
          recipients: ["ally"],
        },
      },
    ], {
      foreshadowingItems: [{
        id: "fs_archive_key",
        name: "Archive Key",
        plantedAt: 10,
        sourceEpisodeIds: ["ep_010"],
      }],
      foreshadowEpisodeSequence: [{
        episodeNumber: 8,
        episodeId: "ep_008",
        foreshadowingTouched: [{
          foreshadowingId: "fs_archive_key",
          action: "reveal",
          context: "The key unlocks the submerged vault.",
        }],
      }],
    });

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "foreshadow_order_violation",
          foreshadowId: "fs_archive_key",
          eventId: "evt_late_archive_key_setup",
          referencedEventId: "evt_payoff_archive_key",
          episode: 10,
          chapter: 10,
        }),
      ]),
    );
  });

  it("flags unmet prerequisite state, resource, relationship, and thread dependencies", () => {
    const seed = makeSeed();
    const runtimeLedger = new SimulationEventLedger();
    let state = createSimulationState(seed);

    state = runtimeLedger.applyEvent(state, {
      id: "evt_missing_actor",
      chapter: 2,
      type: "move",
      actorId: "ghost",
      location: "Corridor",
      summary: "An unknown actor moves through the corridor.",
    });

    state = runtimeLedger.applyEvent(state, {
      id: "evt_missing_resource",
      chapter: 2,
      type: "lose_item",
      actorId: "ally",
      summary: "Ji-su drops a seal key she never had.",
      payload: {
        item: "seal key",
      },
    });

    state = runtimeLedger.applyEvent(state, {
      id: "evt_missing_relationship",
      chapter: 2,
      type: "learn_fact",
      actorId: "hero",
      summary: "Ha-eon shares a guarded lead.",
      prerequisites: [{
        prerequisiteId: "relationship:hero:ally:trust",
        type: "scene_state",
        description: "Ha-eon must already trust Ji-su before confiding.",
        stateKey: "relationship:ally:hero",
      }],
      payload: {
        fact: "The archive seal was forged.",
        recipients: ["hero"],
      },
    });

    state = runtimeLedger.applyEvent(state, {
      id: "evt_missing_thread",
      chapter: 2,
      type: "resolve_thread",
      actorId: "hero",
      summary: "Ha-eon resolves a thread that was never opened.",
      payload: {
        threadId: "hidden-route",
      },
    });

    const validation = validateMajorPlotActionLedger(state.eventLog, {
      initialState: createSimulationState(seed),
    });

    expect(validation.passed).toBe(false);
    expect(validation.majorPlotActionCount).toBe(0);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_missing_actor",
          code: "unmet_prerequisite_state",
          prerequisiteId: "character:ghost:exists",
        }),
        expect.objectContaining({
          eventId: "evt_missing_resource",
          code: "unmet_prerequisite_resource",
          prerequisiteId: "character:ally:inventory:seal-key",
        }),
        expect.objectContaining({
          eventId: "evt_missing_relationship",
          code: "unmet_prerequisite_relationship",
          prerequisiteId: "relationship:hero:ally:trust",
        }),
        expect.objectContaining({
          eventId: "evt_missing_thread",
          code: "unmet_prerequisite_state",
          prerequisiteId: "thread:hidden-route:open",
        }),
      ]),
    );
  });

  it("flags character status reversals that restore an impossible state without an enabling event", () => {
    const seed = makeSeed();
    const validation = validateMajorPlotActionLedger([
      {
        id: "evt_hero_falls",
        chapter: 3,
        type: "status_change",
        actorId: "hero",
        summary: "Ha-eon dies in the archive collapse.",
        stateChanges: [{
          changeId: "evt_hero_falls:status",
          domain: "character_state",
          operation: "update",
          stateKey: "character:hero:status",
          summary: "Ha-eon status updated",
          entityIds: ["hero"],
          beforeValue: "normal",
          afterValue: "dead",
        }],
      },
      {
        id: "evt_hero_returns",
        chapter: 4,
        type: "status_change",
        actorId: "hero",
        summary: "Ha-eon is suddenly back on his feet.",
        stateChanges: [{
          changeId: "evt_hero_returns:status",
          domain: "character_state",
          operation: "update",
          stateKey: "character:hero:status",
          summary: "Ha-eon status updated",
          entityIds: ["hero"],
          beforeValue: "dead",
          afterValue: "normal",
        }],
      },
    ], {
      initialState: createSimulationState(seed),
    });

    expect(validation.passed).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_hero_returns",
          code: "impossible_state_reversal",
          stateKey: "character:hero:status",
          referencedEventId: "evt_hero_falls",
        }),
      ]),
    );
  });

  it("accepts a status reversal when the event explicitly records a resurrection prerequisite", () => {
    const seed = makeSeed();
    const validation = validateMajorPlotActionLedger([
      {
        id: "evt_hero_falls",
        chapter: 3,
        type: "status_change",
        actorId: "hero",
        summary: "Ha-eon dies in the archive collapse.",
        stateChanges: [{
          changeId: "evt_hero_falls:status",
          domain: "character_state",
          operation: "update",
          stateKey: "character:hero:status",
          summary: "Ha-eon status updated",
          entityIds: ["hero"],
          beforeValue: "normal",
          afterValue: "dead",
        }],
      },
      {
        id: "evt_resurrection_rite",
        chapter: 4,
        type: "learn_fact",
        actorId: "ally",
        summary: "Ji-su completes the resurrection rite.",
        payload: {
          fact: "The resurrection rite is complete.",
          recipients: ["hero", "ally"],
        },
      },
      {
        id: "evt_hero_revived",
        chapter: 5,
        type: "status_change",
        actorId: "hero",
        summary: "Ha-eon returns to normal after the rite.",
        prerequisites: [{
          prerequisiteId: "resurrection:evt_resurrection_rite",
          type: "event",
          description: "The resurrection rite was completed beforehand.",
          eventId: "evt_resurrection_rite",
        }],
        stateChanges: [{
          changeId: "evt_hero_revived:status",
          domain: "character_state",
          operation: "update",
          stateKey: "character:hero:status",
          summary: "Ha-eon status updated",
          entityIds: ["hero"],
          beforeValue: "dead",
          afterValue: "normal",
        }],
      },
    ], {
      initialState: createSimulationState(seed),
    });

    expect(validation.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_hero_revived",
          code: "impossible_state_reversal",
        }),
      ]),
    );
  });

  it("flags world-state reversals that skip an explicit repair or restoration event", () => {
    const validation = validateMajorPlotActionLedger([
      {
        id: "evt_bridge_intact",
        chapter: 1,
        type: "status_change",
        summary: "The sky bridge is intact.",
        stateChanges: [{
          changeId: "evt_bridge_intact:world-status",
          domain: "world_model",
          operation: "update",
          stateKey: "world:sky-bridge:status",
          summary: "Sky bridge status updated",
          entityIds: ["world:sky-bridge"],
          afterValue: "intact",
        }],
      },
      {
        id: "evt_bridge_broken",
        chapter: 2,
        type: "status_change",
        summary: "The sky bridge is broken.",
        stateChanges: [{
          changeId: "evt_bridge_broken:world-status",
          domain: "world_model",
          operation: "update",
          stateKey: "world:sky-bridge:status",
          summary: "Sky bridge status updated",
          entityIds: ["world:sky-bridge"],
          beforeValue: "intact",
          afterValue: "broken",
        }],
      },
      {
        id: "evt_bridge_restored_without_cause",
        chapter: 3,
        type: "status_change",
        summary: "The sky bridge is intact again.",
        stateChanges: [{
          changeId: "evt_bridge_restored_without_cause:world-status",
          domain: "world_model",
          operation: "update",
          stateKey: "world:sky-bridge:status",
          summary: "Sky bridge status updated",
          entityIds: ["world:sky-bridge"],
          beforeValue: "broken",
          afterValue: "intact",
        }],
      },
    ]);

    expect(validation.passed).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_bridge_restored_without_cause",
          code: "impossible_state_reversal",
          stateKey: "world:sky-bridge:status",
          referencedEventId: "evt_bridge_broken",
        }),
      ]),
    );
  });

  it("flags mutually exclusive world-state assertions that stay active in the same continuity window", () => {
    const seed = makeSeed();
    const runtimeLedger = new SimulationEventLedger();
    let state = createSimulationState(seed);

    state = runtimeLedger.applyEvent(state, {
      id: "evt_vault_sealed",
      chapter: 3,
      type: "learn_fact",
      actorId: "hero",
      summary: "The royal vault is sealed.",
      payload: {
        fact: "The royal vault is sealed.",
        recipients: ["hero"],
        visibility: "shared",
        subject: "Royal Vault",
        predicate: "status",
        object: "sealed",
      },
    });

    state = runtimeLedger.applyEvent(state, {
      id: "evt_vault_open",
      chapter: 4,
      type: "learn_fact",
      actorId: "hero",
      summary: "The royal vault is open.",
      payload: {
        fact: "The royal vault is open.",
        recipients: ["hero"],
        visibility: "shared",
        subject: "Royal Vault",
        predicate: "status",
        object: "open",
      },
    });

    const validation = validateMajorPlotActionLedger(state.eventLog, {
      initialState: createSimulationState(seed),
    });

    expect(validation.passed).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_vault_open",
          code: "mutually_exclusive_outcome",
          referencedEventId: "evt_vault_sealed",
          field: "stateChanges.afterValue",
        }),
      ]),
    );
  });

  it("flags mutually exclusive singular outcomes recorded inside one event", () => {
    const validation = validateMajorPlotActionLedger([
      {
        id: "evt_thread_conflict",
        chapter: 5,
        type: "plot_action",
        actorId: "hero",
        sceneId: "scene_005_01",
        summary: "One event tries to both open and resolve the same thread.",
        prerequisites: [],
        involvedEntities: [{
          entityId: "thread:hidden-route",
          entityType: "thread",
          role: "affected",
        }],
        outcomes: [],
        stateChanges: [
          {
            changeId: "evt_thread_conflict:thread-open",
            domain: "threads",
            operation: "open",
            stateKey: "thread:hidden-route",
            summary: "Hidden route opens.",
            entityIds: ["thread:hidden-route"],
            afterValue: "open",
          },
          {
            changeId: "evt_thread_conflict:thread-resolve",
            domain: "threads",
            operation: "resolve",
            stateKey: "thread:hidden-route",
            summary: "Hidden route resolves.",
            entityIds: ["thread:hidden-route"],
            afterValue: "resolved",
          },
        ],
        tags: ["major-plot-action"],
        payload: {
          subject: "Hidden route",
          predicate: "major_action",
          object: "The hidden route paradoxically opens and closes.",
          canonicalFact: "The hidden route paradoxically opens and closes.",
          canonicalSummary: "The hidden route paradoxically opens and closes.",
          triggeredBy: "A contradictory report arrives.",
          leadsTo: "The verifier should reject the scene ledger.",
          sceneCharacterIds: ["hero"],
        },
      },
    ]);

    expect(validation.passed).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "evt_thread_conflict",
          code: "mutually_exclusive_outcome",
          stateKey: "thread:hidden-route",
          field: "stateChanges.afterValue",
        }),
      ]),
    );
  });
});
