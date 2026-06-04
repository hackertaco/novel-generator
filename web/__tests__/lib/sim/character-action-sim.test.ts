import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import {
  CharacterActionLogSchema,
  buildCharacterSimulationProfiles,
  compileActionLogsToSimulationEvents,
  runCharacterActionSimulation,
} from "@/lib/sim/character-action-sim";
import { buildWorldBrainFromSeed } from "@/lib/sim/world-brain";

function normalizeLegacySeedInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const seed = input as Record<string, unknown>;
  const foreshadowing = Array.isArray(seed.foreshadowing)
    ? seed.foreshadowing.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }

      const value = { ...(item as Record<string, unknown>) };
      const plantedAt = typeof value.planted_at === "number"
        ? value.planted_at
        : typeof value.plant_chapter === "number"
          ? value.plant_chapter
          : 1;
      const revealAt = typeof value.reveal_at === "number"
        ? value.reveal_at
        : typeof value.reveal_chapter === "number"
          ? value.reveal_chapter
          : null;

      return {
        ...value,
        name: value.name ?? value.id,
        canonical_target: value.canonical_target ?? value.description,
        planted_at: plantedAt,
        hints_at: value.hints_at ?? value.hint_chapters ?? [],
        reveal_at: revealAt,
        origin: value.origin ?? {
          episode_id: `ep_${String(plantedAt).padStart(3, "0")}`,
          scene_id: `scene_${String(plantedAt).padStart(3, "0")}_01`,
          source_span: {
            start_offset: 0,
            end_offset: 1,
            excerpt: String(value.description ?? value.id ?? "foreshadowing"),
          },
        },
      };
    })
    : [];

  return {
    ...seed,
    story_threads: seed.story_threads ?? [],
    extended_outlines: seed.extended_outlines ?? [],
    foreshadowing,
  };
}

function loadFixtureSeed(): NovelSeed {
  const raw = readFileSync(
    join(process.cwd(), "seeds/test-romance-fantasy.json"),
    "utf8",
  );
  return NovelSeedSchema.parse(normalizeLegacySeedInput(JSON.parse(raw)));
}

function runtimeFromBrain(brain: ReturnType<typeof buildWorldBrainFromSeed>) {
  return Object.fromEntries(
    Object.values(brain.characterMinds).map((mind) => [
      mind.characterId,
      {
        characterId: mind.characterId,
        currentPlan: mind.currentPlan,
        knownFacts: [...mind.knownFacts],
        recentMemorySummaries: [...mind.memorySeeds],
        trustDeltasByCharacter: {},
      },
    ]),
  );
}

function dialogueOpening(text: string): string {
  return text.split(/[.?!。！？]/u)[0]?.trim() ?? text.trim();
}

describe("character action simulation", () => {
  it("builds deterministic MiroFish-style action logs and resolutions", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const profiles = buildCharacterSimulationProfiles(brain);
    const input = {
      seed,
      brain,
      chapter: 1,
      sceneId: "scene_test_001",
      title: "두 번째 아침",
      oneLiner: "회귀 자각",
      characterIds: ["elysia", "serena", "marian"],
      location: "크레센트 공작가",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 4,
    };

    const first = runCharacterActionSimulation(input);
    const second = runCharacterActionSimulation(input);

    expect(profiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        characterId: "elysia",
        agentRole: "protagonist",
        roleMission: expect.stringContaining("자기 주도"),
        targetPolicy: "threat_first",
      }),
      expect.objectContaining({
        characterId: "serena",
        agentRole: "villain",
        targetPolicy: "protagonist_pressure",
      }),
      expect.objectContaining({
        characterId: "marian",
        agentRole: "ally",
        targetPolicy: "protect_anchor",
      }),
    ]));
    expect(second.actionLogs).toEqual(first.actionLogs);
    expect(first.actionLogs).toHaveLength(4);
    expect(first.interactionResolutions).toHaveLength(4);
    expect(first.diagnostics.reactionCoverage).toBe(1);
    expect(first.diagnostics.memoryUpdateRate).toBeGreaterThanOrEqual(1);
    expect(first.actionLogs[0]).toEqual(expect.objectContaining({
      chapter: 1,
      sceneId: "scene_test_001",
      actorId: expect.any(String),
      observed: expect.any(Array),
      privateState: expect.objectContaining({
        agentRole: expect.any(String),
        roleMission: expect.any(String),
        activeObjective: expect.any(String),
        activeIntentionId: expect.stringMatching(/^intention:/),
        decisionPriorities: expect.any(Array),
        autonomyRule: expect.any(String),
        retrievedMemoryIds: expect.any(Array),
      }),
      action: expect.objectContaining({
        type: expect.any(String),
        operator: expect.objectContaining({
          id: expect.any(String),
          category: expect.stringMatching(/social|physical|information|magic|political/),
          preconditions: expect.any(Array),
          expectedEffects: expect.any(Array),
          status: expect.stringMatching(/accepted|blocked|partial|backfired/),
        }),
        intent: expect.any(String),
      }),
      planLifecycle: expect.objectContaining({
        planId: expect.any(String),
        previousStatus: "active",
        nextStatus: expect.stringMatching(/active|blocked|abandoned|completed/),
        activeIntention: expect.any(String),
        linkedFollowUpActionSeed: expect.any(String),
      }),
      actualEffect: expect.objectContaining({
        targetReaction: expect.any(String),
        followUpActionSeed: expect.any(String),
        stateDeltas: expect.any(Array),
        worldGameMaster: expect.objectContaining({
          status: expect.stringMatching(/accepted|blocked|partial|backfired/),
          checkedPreconditions: expect.any(Array),
          stateDeltaIds: expect.any(Array),
          witnessCharacterIds: expect.any(Array),
          newAffordances: expect.any(Array),
        }),
      }),
    }));
    expect(first.interactionResolutions[0]).toEqual(expect.objectContaining({
      speechDraft: expect.objectContaining({
        utteranceCandidate: expect.any(String),
        surfaceMeaning: expect.any(String),
        hiddenIntention: expect.any(String),
        subtext: expect.any(String),
      }),
      targetInterpretations: expect.arrayContaining([
        expect.objectContaining({
          interpretedAs: expect.any(String),
          emotionalResponse: expect.any(String),
        }),
      ]),
      emotionalShift: expect.objectContaining({
        actorAfter: expect.any(String),
        intensityDelta: expect.any(Number),
      }),
      powerShift: expect.objectContaining({
        axis: expect.any(String),
        toCharacterId: expect.any(String),
      }),
      relationshipShift: expect.objectContaining({
        suspicionDelta: expect.any(Number),
        reason: expect.any(String),
      }),
      writerHooks: expect.objectContaining({
        gesture: expect.any(String),
        sensoryCue: expect.any(String),
      }),
    }));
    expect(first.interactionResolutions.every((resolution) =>
      !resolution.writerHooks.sensoryCue.includes("공기가 한 박자 무겁게 가라앉는다")
    )).toBe(true);
    expect(first.actionLogs.every((log) => log.privateState.retrievedMemoryIds.length > 0)).toBe(true);
    expect(first.actionLogs.every((log) =>
      log.action.rationale.includes(log.privateState.activeIntentionId)
    )).toBe(true);
    expect(first.actionLogs.flatMap((log) =>
      log.actualEffect.stateDeltas.map((delta) => delta.summary)
    )).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/마리안와/u),
      ]),
    );
  });

  it("compiles action logs into character-action SimulationEvents with provenance", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const simulation = runCharacterActionSimulation({
      seed,
      brain,
      chapter: 1,
      sceneId: "scene_test_001",
      title: "두 번째 아침",
      oneLiner: "회귀 자각",
      characterIds: ["elysia", "serena", "marian"],
      location: "크레센트 공작가",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 4,
    });
    const events = compileActionLogsToSimulationEvents({
      actionLogs: simulation.actionLogs,
      interactionResolutions: simulation.interactionResolutions,
      brain,
      chapter: 1,
      startBeatIndex: 3,
      title: "두 번째 아침",
      location: "크레센트 공작가",
      threadIds: ["main"],
    });

    expect(events).toHaveLength(4);
    for (const [index, event] of events.entries()) {
      expect(event.tags).toEqual(expect.arrayContaining([
        "character-action",
        "agent-tick",
        `operator:${simulation.actionLogs[index]!.action.operator.id}`,
        `operator-category:${simulation.actionLogs[index]!.action.operator.category}`,
        `plan-status:${simulation.actionLogs[index]!.planLifecycle.nextStatus}`,
      ]));
      expect(event.stateChanges.length).toBeGreaterThanOrEqual(1);
      expect(event.outcomes.length).toBeGreaterThanOrEqual(1);
      expect(event.payload?.sourceActionLogIds).toEqual([
        simulation.actionLogs[index]?.logId,
      ]);
      expect(event.payload?.speechDraft).toEqual(expect.objectContaining({
        utteranceCandidate: expect.any(String),
        hiddenIntention: expect.any(String),
      }));
      expect(event.payload?.interactionResolution).toEqual(expect.objectContaining({
        sourceActionLogIds: [simulation.actionLogs[index]?.logId],
      }));
      expect(event.cognition?.memoryUpdates.length).toBeGreaterThanOrEqual(1);
      expect(event.cognition?.beliefUpdates.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses the world game master to vary outcomes by location constraints and record witnesses", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const baseInput = {
      seed,
      brain,
      chapter: 1,
      title: "접근권",
      oneLiner: "황실 접근권을 시험한다",
      characterIds: ["kaizen", "elysia", "rael"],
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 5,
      priorityCharacterIds: ["kaizen", "elysia", "rael"],
    };
    const publicRun = runCharacterActionSimulation({
      ...baseInput,
      sceneId: "scene_public_access",
      location: "공개 정원",
    });
    const restrictedRun = runCharacterActionSimulation({
      ...baseInput,
      sceneId: "scene_restricted_access",
      location: "봉인된 황실 서고",
    });

    const publicAccess = publicRun.actionLogs.find((log) => log.action.type === "request_access");
    const restrictedAccess = restrictedRun.actionLogs.find((log) => log.action.type === "request_access");

    expect(publicAccess?.action.operator.status).toBe("accepted");
    expect(restrictedAccess?.action.operator.status).toBe("partial");
    expect(restrictedAccess?.actualEffect.worldGameMaster.reason).toContain("restricted location");
    expect(restrictedAccess?.actualEffect.worldGameMaster.witnessCharacterIds.length).toBeLessThanOrEqual(1);
    expect(restrictedAccess?.actualEffect.worldGameMaster.witnessCharacterIds.length).toBeGreaterThan(0);
    expect(restrictedAccess?.memoryUpdates.some((memory) =>
      restrictedAccess.actualEffect.worldGameMaster.witnessCharacterIds.includes(memory.characterId)
    )).toBe(true);
    expect(restrictedAccess?.memoryUpdates.length).toBeLessThanOrEqual(3);
  });

  it("generates character-specific utterance candidates from voice and relationship rules", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const simulation = runCharacterActionSimulation({
      seed,
      brain,
      chapter: 1,
      sceneId: "scene_voice_001",
      title: "목소리",
      oneLiner: "각자가 자기 방식으로 상대를 떠본다",
      characterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
      location: "크레센트 공작가",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 5,
      priorityCharacterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
    });
    const utterancesByActor = new Map(
      simulation.interactionResolutions.map((resolution) => [
        resolution.speechDraft.speakerId,
        resolution.speechDraft.utteranceCandidate,
      ]),
    );

    expect(utterancesByActor.get("elysia")).toMatch(/언니|전하|제가|실수|이야기|끝내죠|확인|믿지/);
    expect(utterancesByActor.get("kaizen")).toMatch(/재밌|공작 영애|혼자|표정|명분|침묵|제가 보기엔|허락/);
    expect(utterancesByActor.get("serena")).toMatch(/언니|걱정|그저|괜찮|무서워|오해|물러|경계|보이게/);
    expect(utterancesByActor.get("rael")).toMatch(/약속|걱정|정리|어울리지|처리|나서|말만|절차|감정/);
    expect(utterancesByActor.get("marian")).toMatch(/아가씨|혼자|무리|제가 조용히|맡겠습니다/);
    expect(new Set(utterancesByActor.values()).size).toBeGreaterThanOrEqual(4);
  });

  it("varies world-condition speech tails instead of reusing mechanical deadlines", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const simulation = runCharacterActionSimulation({
      seed,
      brain,
      chapter: 15,
      sceneId: "scene_world_condition_voice",
      title: "교대 전의 문서",
      oneLiner: "감시 교대와 문서 봉쇄가 동시에 압박한다",
      characterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
      location: "크레센트 공작가",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 8,
      priorityCharacterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
      worldConditionPressures: [
        "별궁 하인 명단과 밤 경비 사이에 한 시각만 비는 틈이 생겨 닫힌 기록을 확인할 수 있다",
        "서류 봉쇄와 감시 교대가 동시에 장면 압력을 만든다",
      ],
    });
    const text = simulation.interactionResolutions
      .map((resolution) => resolution.speechDraft.utteranceCandidate)
      .join("\n");

    expect(text).not.toContain("문가의 시선이 돌아오기 전에요");
    expect(text).not.toContain("서류가 다른 손으로 넘어가기 전에요");
    expect(text).not.toContain("서명이 넘어가기 전에요");
    expect(text).not.toContain("명단이 다시 쓰이기 전에요");
    expect(text).not.toContain("명단의 빈칸이 채워지면 늦습니다");
    expect(text).not.toContain("복도 쪽 발소리가 멎기 전에요");
    expect(new Set(simulation.interactionResolutions.map((resolution) =>
      resolution.speechDraft.utteranceCandidate
    )).size).toBeGreaterThanOrEqual(6);
  });

  it("uses contextual pressure and recent speech memory to avoid cloned dialogue", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const simulation = runCharacterActionSimulation({
      seed,
      brain,
      chapter: 42,
      sceneId: "scene_contextual_dialogue_variety",
      title: "비어 있는 명단",
      oneLiner: "하인 명단과 경비 교대가 각 인물의 계산을 바꾼다",
      characterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
      location: "황궁 아우레아",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 12,
      priorityCharacterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
      worldConditionPressures: [
        "별궁 하인 명단과 밤 경비 사이에 한 시각만 비는 틈이 생겨 닫힌 기록을 확인할 수 있다",
        "서류 봉쇄와 감시 교대가 동시에 장면 압력을 만든다",
      ],
    });
    const utterances = simulation.interactionResolutions.map((resolution) =>
      resolution.speechDraft.utteranceCandidate
    );
    const openings = utterances.map(dialogueOpening);

    expect(new Set(utterances).size).toBeGreaterThanOrEqual(10);
    expect(new Set(openings).size).toBeGreaterThanOrEqual(8);
    expect(utterances.join("\n")).toMatch(/명단|경비|기록/);
    expect(utterances.join("\n")).not.toMatch(/전에요\s+(?:지금|말은|같은|그 표정|다음 말)/);
    expect(Math.max(
      ...utterances.map((line) => utterances.filter((other) => other === line).length),
    )).toBe(1);
  });

  it("varies target emotional responses by action dynamics", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const simulation = runCharacterActionSimulation({
      seed,
      brain,
      chapter: 18,
      sceneId: "scene_emotional_response_variety",
      title: "흔들린 반응",
      oneLiner: "각 인물이 서로 다른 목적과 방어선으로 반응한다",
      characterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
      location: "황궁 아우레아",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 8,
      priorityCharacterIds: ["elysia", "kaizen", "serena", "rael", "marian"],
    });
    const responses = simulation.interactionResolutions.flatMap((resolution) =>
      resolution.targetInterpretations.map((interpretation) => interpretation.emotionalResponse)
    );

    expect(new Set(responses).size).toBeGreaterThanOrEqual(5);
    expect(responses.filter((response) =>
      response === "겉으로는 받아들이되 속으로 의도를 재본다"
    )).toHaveLength(0);
  });

  it("fires explicit plot-beat actions at the peak tick with material state deltas, and is opt-in", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    const base = {
      seed,
      brain,
      chapter: 1,
      sceneId: "scene_plot_beat",
      title: "정면",
      oneLiner: "회귀 자각",
      characterIds: ["elysia", "serena", "marian"],
      location: "크레센트 공작가",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 5,
      priorityCharacterIds: ["elysia", "serena", "marian"],
    };

    // 기본(plotBeat 없음): 사건(plot-level) 행동은 전혀 나오지 않는다 — 기존 동작 불변.
    const plain = runCharacterActionSimulation(base);
    expect(plain.actionLogs.some((log) =>
      ["confront", "sabotage", "take_physical", "awaken_magic"].includes(log.action.type)
    )).toBe(false);

    // confront plotBeat: peak tick(4)에서 protagonist(elysia)가 실행, 두 번 돌려도 동일(결정적).
    const confrontInput = { ...base, plotBeat: { action: "confront" as const } };
    const first = runCharacterActionSimulation(confrontInput);
    const second = runCharacterActionSimulation(confrontInput);
    expect(second.actionLogs).toEqual(first.actionLogs);

    const confrontLog = first.actionLogs.find((log) => log.action.type === "confront");
    expect(confrontLog).toBeDefined();
    expect(confrontLog!.tick).toBe(4);
    expect(confrontLog!.privateState.agentRole).toBe("protagonist");
    expect(confrontLog!.action.operator.category).toBe("social");
    // 물질적 사건: 큰 장면 압력 + 강한 신뢰 이동 + 관계 delta가 남는다.
    expect(confrontLog!.actualEffect.scenePressureDelta).toBe(3);
    expect(Object.values(confrontLog!.trustDeltas)).toContain(-2);
    expect(
      confrontLog!.actualEffect.stateDeltas.some((delta) => delta.domain === "relationship"),
    ).toBe(true);

    const confrontResolution = first.interactionResolutions.find((resolution) =>
      resolution.sourceActionLogIds.includes(confrontLog!.logId)
    );
    expect(confrontResolution?.speechDraft.speechAct).toBe("threaten_softly");
    expect(confrontResolution?.powerShift.delta).toBe(3);

    // compile → SimulationEvent 로 사건이 provenance 와 함께 보존된다.
    const events = compileActionLogsToSimulationEvents({
      actionLogs: first.actionLogs,
      interactionResolutions: first.interactionResolutions,
      brain,
      chapter: 1,
      startBeatIndex: 0,
      title: "정면",
      location: "크레센트 공작가",
      threadIds: ["main"],
    });
    const confrontEvent = events.find((event) =>
      event.tags?.includes(`operator:${confrontLog!.action.operator.id}`)
    );
    expect(confrontEvent).toBeDefined();
    expect(confrontEvent!.stateChanges.length).toBeGreaterThanOrEqual(1);
  });

  it("gates plot beats by instigator role (ally does not instigate by default, but can via override)", () => {
    const seed = loadFixtureSeed();
    const brain = buildWorldBrainFromSeed(seed);
    // ticksPerScene 4 -> peak tick 3 -> actor is marian (ally).
    const base = {
      seed,
      brain,
      chapter: 1,
      sceneId: "scene_plot_beat_gate",
      title: "정면",
      oneLiner: "회귀 자각",
      characterIds: ["elysia", "serena", "marian"],
      location: "크레센트 공작가",
      runtimeMindStates: runtimeFromBrain(brain),
      threadIds: ["main"],
      ticksPerScene: 4,
      priorityCharacterIds: ["elysia", "serena", "marian"],
    };

    // 기본 instigator 역할(ally 제외) → confront 발생 안 함.
    const defaultRun = runCharacterActionSimulation({ ...base, plotBeat: { action: "confront" as const } });
    expect(defaultRun.actionLogs.some((log) => log.action.type === "confront")).toBe(false);

    // instigatorRoles 로 ally 를 허용하면 peak tick 에서 marian 이 confront 를 실행.
    const overrideRun = runCharacterActionSimulation({
      ...base,
      plotBeat: { action: "confront" as const, instigatorRoles: ["ally"] },
    });
    const allyConfront = overrideRun.actionLogs.find((log) => log.action.type === "confront");
    expect(allyConfront).toBeDefined();
    expect(allyConfront!.privateState.agentRole).toBe("ally");
    expect(allyConfront!.tick).toBe(3);
  });

  it("rejects malformed action logs without actor and tick", () => {
    const result = CharacterActionLogSchema.safeParse({
      logId: "bad",
      chapter: 1,
      sceneId: "scene",
    });

    expect(result.success).toBe(false);
  });
});
