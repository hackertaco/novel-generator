import { z } from "zod";

const StringListSchema = z.array(z.string());

export const DialogueSpeechActSchema = z.enum([
  "probe",
  "deflect",
  "request_help",
  "request_access",
  "maintain_mask",
  "threaten_softly",
  "confess_partial",
  "reassure",
  "withhold",
]);

export const ScenePurposeSchema = z.enum([
  "establish_state",
  "advance_plot",
  "relationship_probe",
  "secret_pressure",
  "information_discovery",
  "foreshadowing",
  "aftermath",
]);

export const NarrativeDirectorPressureSchema = z.object({
  pressureId: z.string(),
  targetScenePurpose: ScenePurposeSchema.optional(),
  type: z.enum([
    "environment_event",
    "constraint",
    "opportunity",
    "deadline",
    "rumor",
    "resource_scarcity",
  ]),
  summary: z.string(),
  targetThreadIds: StringListSchema,
  source: z.literal("narrative_director"),
});

export const RenderableDialogueConstraintsSchema = z.object({
  allowedRevealedFacts: StringListSchema,
  forbiddenExplicitFacts: StringListSchema,
  voiceRequirements: StringListSchema,
  requiredSubtext: StringListSchema,
  sourceEventId: z.string(),
});

export const DialogueInteractionDynamicsSchema = z.object({
  utteranceCandidate: z.string(),
  surfaceMeaning: z.string(),
  hiddenIntention: z.string(),
  targetInterpretations: z.array(z.object({
    characterId: z.string(),
    interpretedAs: z.string(),
    emotionalResponse: z.string(),
  })),
  emotionalShift: z.object({
    actorBefore: z.string(),
    actorAfter: z.string(),
    targetBefore: z.string().nullable(),
    targetAfter: z.string().nullable(),
    intensityDelta: z.number().int(),
  }),
  powerShift: z.object({
    axis: z.string(),
    fromCharacterId: z.string().nullable(),
    toCharacterId: z.string(),
    delta: z.number().int(),
    reason: z.string(),
  }),
  relationshipShift: z.object({
    sourceCharacterId: z.string(),
    targetCharacterId: z.string().nullable(),
    trustDelta: z.number().int(),
    suspicionDelta: z.number().int(),
    dependencyDelta: z.number().int(),
    hostilityDelta: z.number().int(),
    reason: z.string(),
  }),
  writerHooks: z.object({
    gesture: z.string(),
    silence: z.string(),
    sensoryCue: z.string(),
    linePurpose: z.string(),
  }),
});

export const DialogueTurnSchema = z.object({
  turnId: z.string(),
  sourceEventId: z.string(),
  speakerId: z.string(),
  speakerName: z.string(),
  listenerIds: StringListSchema,
  listenerNames: StringListSchema,
  utterance: z.string().nullable(),
  draftStatus: z.enum(["intent_only", "drafted"]),
  speechAct: DialogueSpeechActSchema,
  voiceGuidance: StringListSchema,
  renderableConstraints: RenderableDialogueConstraintsSchema,
  sourceActionLogIds: StringListSchema.default([]),
  spokenIntent: z.string(),
  hiddenIntent: z.string(),
  informationRevealed: StringListSchema,
  informationWithheld: StringListSchema,
  listenerInterpretation: z.string(),
  relationshipEffect: z.string(),
  interactionDynamics: DialogueInteractionDynamicsSchema.optional(),
});

export const SceneLogSchema = z.object({
  sceneId: z.string(),
  chapter: z.number().int().positive(),
  title: z.string(),
  scenePurpose: ScenePurposeSchema,
  location: z.string(),
  atmosphere: z.string(),
  sensoryAnchors: StringListSchema,
  sourceEventIds: StringListSchema,
  sourceActionLogIds: StringListSchema.default([]),
  participantIds: StringListSchema,
  participantNames: StringListSchema,
  dialogueTurns: z.array(DialogueTurnSchema),
  emotionalArc: z.object({
    start: z.string(),
    turn: z.string(),
    end: z.string(),
  }),
  sceneOutcome: z.string(),
  sceneOutcomeDeltaIds: StringListSchema.default([]),
  narrativeDirectorPressures: z.array(NarrativeDirectorPressureSchema).default([]),
  rendererGuidance: StringListSchema,
});

export type DialogueSpeechAct = z.infer<typeof DialogueSpeechActSchema>;
export type ScenePurpose = z.infer<typeof ScenePurposeSchema>;
export type NarrativeDirectorPressure = z.infer<typeof NarrativeDirectorPressureSchema>;
export type RenderableDialogueConstraints = z.infer<typeof RenderableDialogueConstraintsSchema>;
export type DialogueInteractionDynamics = z.infer<typeof DialogueInteractionDynamicsSchema>;
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
export type SceneLog = z.infer<typeof SceneLogSchema>;
