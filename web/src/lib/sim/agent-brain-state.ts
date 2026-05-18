import { z } from "zod";

const StringListSchema = z.array(z.string());

export const AgentBrainIntentionFrameSchema = z.object({
  intentionId: z.string(),
  currentPlan: z.string(),
  objective: z.string(),
  targetIds: StringListSchema,
  status: z.enum(["active", "blocked", "abandoned", "completed"]),
});

export const AgentBrainGoalStatusSchema = z.enum([
  "active",
  "pressured",
  "blocked",
  "satisfied",
  "abandoned",
]);

export const AgentBrainGoalHorizonSchema = z.enum(["long", "arc", "scene"]);

export const AgentBrainGoalSchema = z.object({
  goalId: z.string(),
  summary: z.string(),
  horizon: AgentBrainGoalHorizonSchema,
  priority: z.number().min(0).max(1),
  status: AgentBrainGoalStatusSchema,
  pressure: z.number().min(0).max(1),
  linkedIntentionIds: StringListSchema,
  updatedAtChapter: z.number().int().nonnegative(),
});

const AgentBrainDesireStoreSchema = z.object({
  surfaceGoal: z.string(),
  hiddenGoal: z.string(),
  need: z.string(),
  fears: StringListSchema,
  taboos: StringListSchema,
  activeGoalId: z.string(),
  goalHierarchy: z.array(AgentBrainGoalSchema),
});

export const AgentBrainSnapshotSchema = z.object({
  beliefStore: z.object({
    knownFactCount: z.number().int().nonnegative(),
    activeBeliefSummaries: StringListSchema,
    trustByCharacter: z.record(z.string(), z.number()),
  }),
  desireStore: AgentBrainDesireStoreSchema,
  memoryStore: z.object({
    retrievedMemoryIds: StringListSchema,
    episodicMemory: StringListSchema,
    semanticMemory: StringListSchema,
    recentMemorySummaries: StringListSchema,
    proceduralMemory: StringListSchema,
  }),
  intentionStack: z.array(AgentBrainIntentionFrameSchema).min(1),
  reflection: z.object({
    notes: StringListSchema,
    actionFatigueByType: z.record(z.string(), z.number()),
  }),
});

export const AgentBrainStateSchema = z.object({
  characterId: z.string(),
  beliefStore: z.object({
    knownFacts: StringListSchema,
    activeBeliefSummaries: StringListSchema,
    trustByCharacter: z.record(z.string(), z.number()),
  }),
  desireStore: AgentBrainSnapshotSchema.shape.desireStore,
  memoryStore: z.object({
    episodicMemory: StringListSchema,
    semanticMemory: StringListSchema,
    proceduralMemory: StringListSchema,
    retrievedMemoryIds: StringListSchema,
  }),
  intentionStack: z.array(AgentBrainIntentionFrameSchema).default([]),
  reflection: AgentBrainSnapshotSchema.shape.reflection,
});

export type AgentBrainIntentionFrame = z.infer<typeof AgentBrainIntentionFrameSchema>;
export type AgentBrainGoal = z.infer<typeof AgentBrainGoalSchema>;
export type AgentBrainSnapshot = z.infer<typeof AgentBrainSnapshotSchema>;
export type AgentBrainState = z.infer<typeof AgentBrainStateSchema>;

function compact(values: Array<string | null | undefined>, limit?: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return limit === undefined ? result : result.slice(-limit);
}

function initialGoalHierarchy(input: {
  characterId: string;
  surfaceGoal: string;
  hiddenGoal: string;
  need: string;
}): AgentBrainGoal[] {
  return [
    {
      goalId: `goal:${input.characterId}:hidden`,
      summary: input.hiddenGoal,
      horizon: "long",
      priority: 1,
      status: "active",
      pressure: 0.65,
      linkedIntentionIds: [`intention:${input.characterId}:initial`],
      updatedAtChapter: 0,
    },
    {
      goalId: `goal:${input.characterId}:surface`,
      summary: input.surfaceGoal,
      horizon: "arc",
      priority: 0.75,
      status: "active",
      pressure: 0.45,
      linkedIntentionIds: [`intention:${input.characterId}:initial`],
      updatedAtChapter: 0,
    },
    {
      goalId: `goal:${input.characterId}:need`,
      summary: input.need,
      horizon: "arc",
      priority: 0.65,
      status: "active",
      pressure: 0.5,
      linkedIntentionIds: [],
      updatedAtChapter: 0,
    },
  ];
}

function goalStatusForPlanStatus(status: AgentBrainIntentionFrame["status"]): AgentBrainGoal["status"] {
  if (status === "blocked") return "blocked";
  if (status === "abandoned") return "abandoned";
  if (status === "completed") return "satisfied";
  return "active";
}

function pressureForGoalStatus(status: AgentBrainGoal["status"]): number {
  if (status === "blocked") return 0.9;
  if (status === "abandoned") return 0.75;
  if (status === "satisfied") return 0.3;
  if (status === "pressured") return 0.8;
  return 0.6;
}

function durableGoalStatusForPlanStatus(
  goal: AgentBrainGoal,
  planStatus: AgentBrainIntentionFrame["status"],
): AgentBrainGoal["status"] {
  if (planStatus === "completed") {
    return goal.horizon === "arc" ? "satisfied" : "active";
  }
  if (planStatus === "blocked") {
    return goal.horizon === "long" ? "pressured" : "blocked";
  }
  if (planStatus === "abandoned") {
    return goal.horizon === "long" ? "pressured" : "abandoned";
  }
  if (goal.status === "blocked" || goal.status === "abandoned" || goal.status === "satisfied") {
    return "pressured";
  }
  return goal.status;
}

function mergeGoalHierarchy(goals: AgentBrainGoal[], next: AgentBrainGoal): AgentBrainGoal[] {
  const byId = new Map<string, AgentBrainGoal>();
  for (const goal of goals) {
    byId.set(goal.goalId, {
      ...goal,
      linkedIntentionIds: [...goal.linkedIntentionIds],
    });
  }
  byId.set(next.goalId, {
    ...next,
    linkedIntentionIds: [...next.linkedIntentionIds],
  });
  const values = Array.from(byId.values());
  const durableGoals = values
    .filter((goal) => goal.horizon !== "scene")
    .sort((left, right) => right.priority - left.priority || left.goalId.localeCompare(right.goalId));
  const recentSceneGoals = values
    .filter((goal) => goal.horizon === "scene" && goal.goalId !== next.goalId)
    .slice(-8);

  return next.horizon === "scene"
    ? [...durableGoals, ...recentSceneGoals, next].slice(-12)
    : [...durableGoals, ...recentSceneGoals].slice(-12);
}

export function createAgentBrainState(input: {
  characterId: string;
  currentPlan: string;
  surfaceGoal: string;
  hiddenGoal: string;
  need: string;
  fears: string[];
  taboos: string[];
  knownFacts: string[];
  memorySeeds: string[];
  trustByCharacter: Record<string, number>;
}): AgentBrainState {
  return AgentBrainStateSchema.parse({
    characterId: input.characterId,
    beliefStore: {
      knownFacts: compact(input.knownFacts),
      activeBeliefSummaries: compact(input.knownFacts, 8),
      trustByCharacter: input.trustByCharacter,
    },
    desireStore: {
      surfaceGoal: input.surfaceGoal,
      hiddenGoal: input.hiddenGoal,
      need: input.need,
      fears: compact(input.fears, 8),
      taboos: compact(input.taboos, 8),
      activeGoalId: `goal:${input.characterId}:hidden`,
      goalHierarchy: initialGoalHierarchy(input),
    },
    memoryStore: {
      episodicMemory: compact(input.memorySeeds, 8),
      semanticMemory: compact(input.knownFacts, 8),
      proceduralMemory: [],
      retrievedMemoryIds: [],
    },
    intentionStack: [{
      intentionId: `intention:${input.characterId}:initial`,
      currentPlan: input.currentPlan,
      objective: input.surfaceGoal,
      targetIds: [],
      status: "active",
    }],
    reflection: {
      notes: [],
      actionFatigueByType: {},
    },
  });
}

export function cloneAgentBrainState(state: AgentBrainState): AgentBrainState {
  return AgentBrainStateSchema.parse({
    characterId: state.characterId,
    beliefStore: {
      knownFacts: [...state.beliefStore.knownFacts],
      activeBeliefSummaries: [...state.beliefStore.activeBeliefSummaries],
      trustByCharacter: { ...state.beliefStore.trustByCharacter },
    },
    desireStore: {
      surfaceGoal: state.desireStore.surfaceGoal,
      hiddenGoal: state.desireStore.hiddenGoal,
      need: state.desireStore.need,
      fears: [...state.desireStore.fears],
      taboos: [...state.desireStore.taboos],
      activeGoalId: state.desireStore.activeGoalId,
      goalHierarchy: state.desireStore.goalHierarchy.map((goal) => ({
        ...goal,
        linkedIntentionIds: [...goal.linkedIntentionIds],
      })),
    },
    memoryStore: {
      episodicMemory: [...state.memoryStore.episodicMemory],
      semanticMemory: [...state.memoryStore.semanticMemory],
      proceduralMemory: [...state.memoryStore.proceduralMemory],
      retrievedMemoryIds: [...state.memoryStore.retrievedMemoryIds],
    },
    intentionStack: state.intentionStack.map((frame) => ({ ...frame, targetIds: [...frame.targetIds] })),
    reflection: {
      notes: [...state.reflection.notes],
      actionFatigueByType: { ...state.reflection.actionFatigueByType },
    },
  });
}

export function recordAgentBrainDecision(
  state: AgentBrainState,
  input: {
    activeIntentionId: string;
    currentPlan: string;
    objective: string;
    targetIds: string[];
    planStatus: AgentBrainIntentionFrame["status"];
    retrievedMemoryIds: string[];
    chapter?: number;
  },
): void {
  const updatedAtChapter = input.chapter ?? 0;
  const status = goalStatusForPlanStatus(input.planStatus);
  const sceneGoalId = `goal:${state.characterId}:scene:${input.activeIntentionId}`;
  state.memoryStore.retrievedMemoryIds = compact(input.retrievedMemoryIds, 12);
  state.intentionStack = [
    ...state.intentionStack.filter((frame) => frame.intentionId !== input.activeIntentionId),
    {
      intentionId: input.activeIntentionId,
      currentPlan: input.currentPlan,
      objective: input.objective,
      targetIds: input.targetIds,
      status: input.planStatus,
    },
  ].slice(-8);
  state.desireStore.activeGoalId = sceneGoalId;
  const linkedBaseGoals = state.desireStore.goalHierarchy.map((goal) => {
    if (goal.horizon === "scene") return goal;
    const nextStatus = durableGoalStatusForPlanStatus(goal, input.planStatus);
    return {
      ...goal,
      status: nextStatus,
      pressure: Math.min(1, Math.max(goal.pressure + 0.03, pressureForGoalStatus(nextStatus))),
      linkedIntentionIds: compact([...goal.linkedIntentionIds, input.activeIntentionId], 8),
      updatedAtChapter,
    };
  });
  state.desireStore.goalHierarchy = mergeGoalHierarchy(linkedBaseGoals, {
    goalId: sceneGoalId,
    summary: input.objective,
    horizon: "scene",
    priority: 0.55,
    status,
    pressure: pressureForGoalStatus(status),
    linkedIntentionIds: [input.activeIntentionId],
    updatedAtChapter,
  });
}

export function applyAgentBrainEvent(
  state: AgentBrainState,
  input: {
    gainedKnowledge?: string[];
    memorySummaries?: string[];
    beliefSummaries?: string[];
    currentPlan?: string;
    reflectionNote?: string;
    proceduralNote?: string;
    actionType?: string;
    fatigueDelta?: number;
    trustDeltas?: Record<string, number>;
    chapter?: number;
  },
): void {
  state.beliefStore.knownFacts = compact([
    ...state.beliefStore.knownFacts,
    ...(input.gainedKnowledge ?? []),
  ]);
  state.beliefStore.activeBeliefSummaries = compact([
    ...state.beliefStore.activeBeliefSummaries,
    ...(input.beliefSummaries ?? []),
    ...(input.gainedKnowledge ?? []),
  ], 40);
  state.memoryStore.episodicMemory = compact([
    ...state.memoryStore.episodicMemory,
    ...(input.memorySummaries ?? []),
  ], 40);
  state.memoryStore.semanticMemory = compact([
    ...state.memoryStore.semanticMemory,
    ...(input.gainedKnowledge ?? []),
  ], 40);

  for (const [targetId, delta] of Object.entries(input.trustDeltas ?? {})) {
    state.beliefStore.trustByCharacter[targetId] = (state.beliefStore.trustByCharacter[targetId] ?? 0) + delta;
  }

  if (input.currentPlan && state.intentionStack.length > 0) {
    const currentPlan = input.currentPlan;
    state.intentionStack[state.intentionStack.length - 1]!.currentPlan = input.currentPlan;
    state.desireStore.goalHierarchy = state.desireStore.goalHierarchy.map((goal) =>
      goal.goalId === state.desireStore.activeGoalId
        ? {
          ...goal,
          summary: currentPlan,
          status: goal.status === "active" ? "pressured" : goal.status,
          pressure: Math.min(1, goal.pressure + 0.1),
          updatedAtChapter: input.chapter ?? goal.updatedAtChapter,
        }
        : goal
    );
  }
  state.reflection.notes = compact([
    ...state.reflection.notes,
    input.reflectionNote,
  ], 40);
  state.memoryStore.proceduralMemory = compact([
    ...state.memoryStore.proceduralMemory,
    input.proceduralNote,
  ], 40);

  if (input.actionType) {
    for (const [actionType, fatigue] of Object.entries(state.reflection.actionFatigueByType)) {
      state.reflection.actionFatigueByType[actionType] = Math.max(0, fatigue - 0.25);
    }
    const current = state.reflection.actionFatigueByType[input.actionType] ?? 0;
    state.reflection.actionFatigueByType[input.actionType] = Math.max(0, current + (input.fatigueDelta ?? 0));
  }
}

export function buildAgentBrainSnapshot(input: {
  agentBrainState?: AgentBrainState;
  activeIntentionId: string;
  currentPlan: string;
  objective: string;
  targetIds: string[];
  planStatus: AgentBrainIntentionFrame["status"];
  knownFacts: string[];
  retrievedMemoryIds: string[];
  recentMemorySummaries?: string[];
  reflectionNotes?: string[];
  proceduralMemory?: string[];
  actionFatigueByType?: Record<string, number>;
  trustByCharacter: Record<string, number>;
}): AgentBrainSnapshot {
  const state = input.agentBrainState;
  return AgentBrainSnapshotSchema.parse({
    beliefStore: {
      knownFactCount: state?.beliefStore.knownFacts.length ?? input.knownFacts.length,
      activeBeliefSummaries: compact(state?.beliefStore.activeBeliefSummaries ?? input.knownFacts, 6),
      trustByCharacter: state?.beliefStore.trustByCharacter ?? input.trustByCharacter,
    },
    desireStore: state?.desireStore ?? {
      surfaceGoal: "",
      hiddenGoal: "",
      need: "",
      fears: [],
      taboos: [],
      activeGoalId: "",
      goalHierarchy: [],
    },
    memoryStore: {
      retrievedMemoryIds: compact(input.retrievedMemoryIds, 8),
      episodicMemory: compact(state?.memoryStore.episodicMemory ?? input.recentMemorySummaries ?? [], 8),
      semanticMemory: compact(state?.memoryStore.semanticMemory ?? input.knownFacts, 8),
      recentMemorySummaries: compact(input.recentMemorySummaries ?? [], 8),
      proceduralMemory: compact(state?.memoryStore.proceduralMemory ?? input.proceduralMemory ?? [], 8),
    },
    intentionStack: compactIntentionStack([
      ...(state?.intentionStack ?? []),
      {
      intentionId: input.activeIntentionId,
      currentPlan: input.currentPlan,
      objective: input.objective,
      targetIds: input.targetIds,
      status: input.planStatus,
      },
    ]),
    reflection: {
      notes: compact(state?.reflection.notes ?? input.reflectionNotes ?? [], 8),
      actionFatigueByType: state?.reflection.actionFatigueByType ?? input.actionFatigueByType ?? {},
    },
  });
}

function compactIntentionStack(frames: AgentBrainIntentionFrame[]): AgentBrainIntentionFrame[] {
  const byId = new Map<string, AgentBrainIntentionFrame>();
  for (const frame of frames) {
    byId.set(frame.intentionId, {
      ...frame,
      targetIds: [...frame.targetIds],
    });
  }
  return Array.from(byId.values()).slice(-8);
}
