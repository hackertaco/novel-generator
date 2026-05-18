export { createSimulationState } from "./canonical-world";
export {
  applySimulationEventLedgerPatch,
  SimulationEventLedger,
  SimulationEventLedgerPatchBlockedEditSchema,
  SimulationEventLedgerPatchEditSchema,
  SimulationEventLedgerPatchError,
  SimulationEventLedgerPatchReportSchema,
} from "./event-ledger";
export type {
  ApplySimulationEventLedgerPatchOptions,
  SimulationEventLedgerPatchBlockedEdit,
  SimulationEventLedgerPatchEdit,
  SimulationEventLedgerPatchReport,
} from "./event-ledger";
export {
  appendSimulationCausalEvent,
  buildSimulationCausalLedger,
  createSimulationCausalLedgerStore,
  EventBeliefUpdateInputSchema,
  EventMemoryUpdateInputSchema,
  KnowledgeVisibilitySchema,
  loadSimulationCausalLedger,
  MajorPlotActionLedgerIssueCodeSchema,
  MajorPlotActionLedgerIssueSchema,
  MajorPlotActionLedgerValidationSchema,
  parseSimulationEvent,
  querySimulationCausalLedger,
  SimulationCausalLedgerSchema,
  SimulationEventCorrectionEditSchema,
  SimulationEventCorrectionOperationSchema,
  SimulationEventCorrectionRecordSchema,
  SimulationEventCorrectionWindowSchema,
  SimulationCausalLedgerEpisodeRangeSchema,
  SimulationCausalLedgerQueryResultSchema,
  SimulationCausalLedgerQuerySchema,
  SimulationCausalLedgerStore,
  SimulationEventCognitionSchema,
  SimulationEventEntityRoleSchema,
  SimulationEventEntityTypeSchema,
  SimulationEventInvolvedEntitySchema,
  SimulationEventOutcomeSchema,
  SimulationEventOutcomeTypeSchema,
  SimulationEventPrerequisiteSchema,
  SimulationEventPrerequisiteTypeSchema,
  SimulationEventSchema,
  SimulationEventStateChangeSchema,
  SimulationEventStateDomainSchema,
  SimulationEventStateOperationSchema,
  SimulationEventTypeSchema,
  serializeSimulationCausalLedger,
  validateMajorPlotActionLedger,
} from "./causal-ledger";
export type {
  EventBeliefUpdateInput,
  EventMemoryUpdateInput,
  KnowledgeVisibility,
  MajorPlotActionLedgerIssue,
  MajorPlotActionLedgerIssueCode,
  MajorPlotActionLedgerValidation,
  NormalizedSimulationEvent,
  SimulationCausalLedger,
  SimulationCausalLedgerEpisodeRange,
  SimulationCausalLedgerQuery,
  SimulationCausalLedgerQueryResult,
  SimulationEventCorrectionEdit,
  SimulationEventCorrectionOperation,
  SimulationEventCorrectionRecord,
  SimulationEventCorrectionWindow,
  SimulationEvent,
  SimulationEventCognition,
  SimulationEventInvolvedEntity,
  SimulationEventOutcome,
  SimulationEventOutcomeType,
  SimulationEventPrerequisite,
  SimulationEventStateChange,
  SimulationEventStateDomain,
  SimulationEventStateOperation,
  SimulationEventType,
} from "./causal-ledger";
export {
  buildSimulationCausalLedgerAggregation,
  SimulationCausalLedgerAggregationEpisodeSchema,
  SimulationCausalLedgerAggregationLinkKindSchema,
  SimulationCausalLedgerAggregationLinkSchema,
  SimulationCausalLedgerAggregationLinkStatusSchema,
  SimulationCausalLedgerAggregationSchema,
} from "./causal-ledger-aggregation";
export type {
  SimulationCausalLedgerAggregation,
  SimulationCausalLedgerAggregationEpisode,
  SimulationCausalLedgerAggregationLink,
  SimulationCausalLedgerAggregationLinkKind,
  SimulationCausalLedgerAggregationLinkStatus,
} from "./causal-ledger-aggregation";
export {
  SharedWorldStateAuthority,
  createWorldStateAuthority,
  createWorldStateAuthorityFromSnapshot,
} from "./world-state-authority";
export type {
  WorldStateAuthority,
  WorldStateAuthoritySnapshot,
} from "./world-state-authority";
export {
  ContinuityReconciliationReportSchema,
  reconcileSimulationContinuityArtifacts,
} from "./continuity-reconciliation";
export type {
  ContinuityReconciliationReport,
} from "./continuity-reconciliation";
export {
  emitGeneratedChapterSceneLedger,
} from "./pipeline-ledger";
export type {
  GeneratedChapterSceneLedgerInput,
} from "./pipeline-ledger";
export {
  DialogueInteractionDynamicsSchema,
  DialogueSpeechActSchema,
  DialogueTurnSchema,
  RenderableDialogueConstraintsSchema,
  SceneLogSchema,
  ScenePurposeSchema,
} from "./scene-log";
export type {
  DialogueInteractionDynamics,
  DialogueSpeechAct,
  DialogueTurn,
  RenderableDialogueConstraints,
  SceneLog,
  ScenePurpose,
} from "./scene-log";
export {
  CharacterActionLogSchema,
  CharacterActionSimulationDiagnosticsSchema,
  CharacterActionSimulationResultSchema,
  CharacterActionTypeSchema,
  CharacterSimulationProfileSchema,
  InteractionResolutionSchema,
  SimulationClockSchema,
  buildCharacterSimulationProfiles,
  compileActionLogsToSimulationEvents,
  runCharacterActionSimulation,
} from "./character-action-sim";
export type {
  CharacterActionLog,
  CharacterActionSimulationDiagnostics,
  CharacterActionSimulationInput,
  CharacterActionSimulationResult,
  CharacterActionType,
  CharacterSimulationProfile,
  CompileActionLogsToEventsInput,
  InteractionResolution,
  RuntimeMindSnapshot,
  SimulationClock,
} from "./character-action-sim";
export {
  buildWorldBrainFromSeed,
  CharacterMindSchema,
  summarizeWorldBrain,
  WorldBrainActionEconomicsSchema,
  WorldBrainFactionSchema,
  WorldBrainKnowledgeFlowSchema,
  WorldBrainPlanTransitionSchema,
  WorldBrainRailSchema,
  WorldBrainRelationshipModelSchema,
  WorldBrainSchema,
  WorldBrainSecretSchema,
} from "./world-brain";
export type {
  CharacterMind,
  WorldBrain,
  WorldBrainActionEconomics,
  WorldBrainFaction,
  WorldBrainKnowledgeFlow,
  WorldBrainPlanTransition,
  WorldBrainRail,
  WorldBrainRelationshipModel,
  WorldBrainSecret,
} from "./world-brain";
export {
  analyzeWorldModelEndurance,
  DEFAULT_WORLD_MODEL_ENDURANCE_THRESHOLDS,
  WorldModelEnduranceLowActivitySchema,
  WorldModelEnduranceReportSchema,
} from "./world-model-endurance";
export type {
  WorldModelEnduranceLowActivity,
  WorldModelEnduranceReport,
  WorldModelEnduranceThresholds,
} from "./world-model-endurance";
export {
  DEFAULT_WORLD_MODEL_QUALITY_THRESHOLDS,
  WorldModelQualityIssueSchema,
  WorldModelQualityReportSchema,
  evaluateWorldModelQuality,
} from "./world-model-quality";
export type {
  WorldModelQualityIssue,
  WorldModelQualityReport,
  WorldModelQualityThresholds,
} from "./world-model-quality";
export {
  CharacterStateWriter,
  applyGeneratedDialogueScene,
} from "./character-state-writer";
export type {
  DialogueBeliefUpdateInput,
  DialogueMemoryUpdateInput,
  DialogueSceneWriteResult,
  DialogueTurnWriteResult,
  GeneratedDialogueSceneInput,
  GeneratedDialogueTurnInput,
} from "./character-state-writer";
export {
  CharacterBeliefCanonicalAlignmentSchema,
  CharacterDivergenceCauseKindSchema,
  CharacterDivergenceCauseSchema,
} from "./cognitive-dissonance";
export type {
  CharacterBeliefCanonicalAlignment,
  CharacterDivergenceCause,
  CharacterDivergenceCauseKind,
} from "./cognitive-dissonance";
export {
  CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_SCHEMA_NAME,
  CHARACTER_MISMATCH_CAUSATION_PERSISTENCE_VERSION,
  CharacterClaimMismatchTypeSchema,
  CharacterMismatchCauseStatusSchema,
  CharacterMismatchAffectedEntityReferenceSchema,
  CharacterMismatchContradictedFactReferenceSchema,
  CharacterMismatchCausationLedgerSchema,
  CharacterMismatchCausationRecordSchema,
  CharacterMismatchEpisodeSpanSchema,
  CharacterMismatchIntroductionPointSchema,
  CharacterMismatchMissingCauseDescriptorSchema,
  CharacterMismatchProvenanceSchema,
  CharacterMismatchRecordedCauseTypeSchema,
  CharacterMismatchSourceEventReferenceSchema,
  CharacterMismatchTriggeringEventReferenceSchema,
  CharacterMismatchValidationFailureCodeSchema,
  CharacterMismatchValidationFailureContextSchema,
  CharacterMismatchValidationFailureMismatchSchema,
  CharacterMismatchValidationFailureSchema,
  CognitionRecordTypeSchema,
  PersistedCharacterMismatchCausationRecordSchema,
  createCharacterMismatchCausationLedger,
  ensureCharacterMismatchCausationProvenance,
  loadCharacterMismatchCausationLedger,
} from "./mismatch-causation";
export type {
  CharacterClaimMismatchType,
  CharacterMismatchCauseStatus,
  CharacterMismatchAffectedEntityReference,
  CharacterMismatchContradictedFactReference,
  CharacterMismatchCausationLedger,
  CharacterMismatchCausationRecord,
  CharacterMismatchEpisodeSpan,
  CharacterMismatchIntroductionPoint,
  CharacterMismatchMissingCauseDescriptor,
  CharacterMismatchProvenance,
  CharacterMismatchRecordedCauseType,
  CharacterMismatchSourceEventReference,
  CharacterMismatchTriggeringEventReference,
  CharacterMismatchValidationFailure,
  CharacterMismatchValidationFailureCode,
  CharacterMismatchValidationFailureContext,
  CharacterMismatchValidationFailureMismatch,
  CognitionRecordType,
} from "./mismatch-causation";
export {
  filterMismatchClassificationResults,
  classifySimulationStateMismatches,
  listMismatchClassificationsByRecordType,
  listMismatchClassificationsByType,
  MismatchAffectedEntitiesSchema,
  MismatchClassificationReportSchema,
  NormalizedMismatchClassificationResultSchema,
} from "./mismatch-classifier";
export type {
  MismatchAffectedEntities,
  MismatchClassificationReport,
  MismatchClassificationState,
  NormalizedMismatchClassificationResult,
} from "./mismatch-classifier";
export {
  canVerifierAutoCorrectionEditField,
  executeVerifierAutoCorrectionEdits,
  getVerifierAutoCorrectionAllowedFieldPaths,
  inspectVerifierAutoCorrectionEdits,
  VerifierAutoCorrectionBlockedEditSchema,
  VerifierAutoCorrectionEditSchema,
  VerifierAutoCorrectionExecutionReportSchema,
  VerifierAutoCorrectionOperationSchema,
  VerifierAutoCorrectionScopeError,
  VerifierAutoCorrectionScopeErrorDetailsSchema,
  VerifierAutoCorrectionTargetTypeSchema,
} from "./verifier-auto-correction";
export type {
  VerifierAutoCorrectionBlockedEdit,
  VerifierAutoCorrectionEdit,
  VerifierAutoCorrectionExecutionContext,
  VerifierAutoCorrectionExecutionReport,
  VerifierAutoCorrectionOperation,
  VerifierAutoCorrectionScopeErrorDetails,
  VerifierAutoCorrectionTargetType,
} from "./verifier-auto-correction";
export {
  COGNITION_VERIFICATION_ISSUE_CODES,
  CognitionVerificationIssueCodeSchema,
  getPermittedVerifierAutoCorrectionScope,
  resolveVerifierFailureAutoCorrectionRoute,
  SUPPORTED_VERIFIER_FAILURE_CLASSES,
  VERIFIER_AUTO_CORRECTION_SCOPES,
  VERIFIER_FAILURE_CLASS_POLICY_MAP,
  VERIFIER_FAILURE_CLASS_REGISTRY,
  VERIFIER_FAILURE_POLICY_ERROR_CODES,
  VerifierAutoCorrectionScopeSchema,
  VerifierFailurePolicyError,
  VerifierFailurePolicyErrorCandidateSchema,
  VerifierFailurePolicyErrorCodeSchema,
  VerifierFailurePolicyErrorDetailsSchema,
  VerifierFailureClassRegistryEntrySchema,
  VerifierFailureRoutingDecisionSchema,
  VerifierFailureRoutingInputSchema,
  VerifierFailureClassSchema,
  VerifierFailureClassSourceSchema,
} from "./verifier-failure-policy";
export type {
  CognitionVerificationIssueCode,
  VerifierAutoCorrectionScope,
  VerifierFailureClass,
  VerifierFailureClassRegistryEntry,
  VerifierFailurePolicyErrorCandidate,
  VerifierFailurePolicyErrorCode,
  VerifierFailurePolicyErrorDetails,
  VerifierFailureRoutingDecision,
  VerifierFailureRoutingInput,
  VerifierFailureClassSource,
} from "./verifier-failure-policy";
export {
  createSimulationValidationVerdict,
  formatSimulationValidationFailure,
  ObjectiveStateCanonicalTruthValueSchema,
  ObjectiveStateComparisonFieldsSchema,
  ObjectiveStateContradictionCategorySchema,
  ObjectiveStateNormalizedTruthValueSchema,
  ObjectiveStateVerificationRecordSchema,
  SimulationStateVerifier,
  verifyCharacterCognitionConsistency,
} from "./verifier";
export type {
  CanonicalTruthReference,
  CharacterClaimMismatchEvidence,
  CharacterClaimMismatchRecord,
  CharacterMismatchRuleOutcome,
  CharacterMismatchRuleTraceStep,
  CharacterMismatchTraceDimension,
  CharacterMismatchTraceStatus,
  CharacterClaimMismatchValidityStatus,
  CognitionVerificationIssue,
  CognitionVerificationReport,
  CognitionVerifierOptions,
  ObjectiveStateCanonicalTruthValue,
  ObjectiveStateComparisonFields,
  ObjectiveStateContradictionCategory,
  ObjectiveStateNormalizedTruthValue,
  ObjectiveStateVerificationRecord,
  SimulationValidationVerdict,
} from "./verifier";
export {
  recomputeCharacterBeliefsFromMemories,
  recomputeSimulationBeliefsFromMemories,
} from "./belief-recomputation";
export type {
  CharacterBeliefDerivationContext,
  CharacterBeliefRecomputationChapterRange,
  CharacterBeliefRecomputationScope,
  DerivedCharacterBeliefInput,
  RecomputeCharacterBeliefsFromMemoriesOptions,
  RecomputeCharacterBeliefsFromMemoriesResult,
  RecomputeSimulationBeliefsFromMemoriesResult,
} from "./belief-recomputation";
export {
  CharacterBeliefInterpretationInvalidationSchema,
  CharacterBeliefInterpretationRecordSchema,
  CharacterBeliefInterpretationStateSchema,
  CharacterBeliefInterpretationStatusSchema,
  CharacterBeliefInterpretationStoreSchema,
  addCharacterBeliefInterpretation,
  createCharacterBeliefInterpretationStore,
  invalidateCharacterBeliefInterpretations,
  listCharacterBeliefInterpretations,
} from "./belief-interpretation-state";
export {
  buildRetroactiveCorrectionPlan,
  CausalFailureReportInputSchema,
  CausalFailureReportSchema,
  CausalFailureReportSourceSchema,
  RETROACTIVE_LEDGER_MUTATION_KINDS,
  RETROACTIVE_LEDGER_MUTATION_OPERATIONS,
  RetroactiveCorrectionPlanSchema,
  RetroactiveLedgerMutationAllowanceSchema,
  RetroactiveLedgerMutationKindSchema,
  RetroactiveLedgerMutationOperationSchema,
  RetroactiveLedgerSpanSchema,
  RetroactiveReplayScopeSchema,
} from "./retroactive-correction";
export type {
  BuildRetroactiveCorrectionPlanOptions,
  CausalFailureReport,
  CausalFailureReportInput,
  CausalFailureReportSource,
  RetroactiveCorrectionPlan,
  RetroactiveLedgerMutationAllowance,
  RetroactiveLedgerMutationKind,
  RetroactiveLedgerMutationOperation,
  RetroactiveLedgerSpan,
  RetroactiveReplayScope,
} from "./retroactive-correction";
export type {
  CharacterBeliefInterpretationInput,
  CharacterBeliefInterpretationInvalidation,
  CharacterBeliefInterpretationRecord,
  CharacterBeliefInterpretationState,
  CharacterBeliefInterpretationStatus,
  CharacterBeliefInterpretationStore,
  InvalidateCharacterBeliefInterpretationsOptions,
  ListCharacterBeliefInterpretationsOptions,
} from "./belief-interpretation-state";
export {
  CharacterBeliefConfidenceSchema,
  CharacterBeliefKindSchema,
  CharacterBeliefRecordSchema,
  CharacterBeliefReferenceSchema,
  CharacterBeliefStateSchema,
  CharacterBeliefStatusSchema,
  CharacterBeliefStoreSchema,
  addActiveBeliefThread,
  addCharacterBelief,
  adjustCharacterTrust,
  createCharacterBeliefStore,
  listCharacterBeliefs,
  removeActiveBeliefThread,
  setCharacterTrust,
} from "./belief-state";
export type {
  CharacterBeliefConfidence,
  CharacterBeliefKind,
  CharacterBeliefRecord,
  CharacterBeliefReference,
  CharacterBeliefState,
  CharacterBeliefStatus,
  CharacterBeliefStore,
} from "./belief-state";
export {
  ObjectiveFactCategorySchema,
  ObjectiveFactEffectiveRangeSchema,
  ObjectiveFactEntitySchema,
  ObjectiveFactEntityTypeSchema,
  ObjectiveFactHistoryActionSchema,
  ObjectiveFactHistoryEntrySchema,
  ObjectiveFactRecordSchema,
  ObjectiveFactRecordedAtSchema,
  ObjectiveFactRevisionSchema,
  ObjectiveFactScopeSchema,
  ObjectiveFactScopeTypeSchema,
  ObjectiveFactStoreSchema,
  addObjectiveFact,
  closeMatchingObjectiveFacts,
  createObjectiveFactStore,
  listObjectiveFactHistory,
  listObjectiveFacts,
} from "./objective-facts";
export type {
  ObjectiveFactCategory,
  ObjectiveFactEffectiveRange,
  ObjectiveFactEntity,
  ObjectiveFactEntityType,
  ObjectiveFactHistoryAction,
  ObjectiveFactHistoryEntry,
  ObjectiveFactRecord,
  ObjectiveFactRecordedAt,
  ObjectiveFactRevision,
  ObjectiveFactScope,
  ObjectiveFactScopeType,
  ObjectiveFactStore,
} from "./objective-facts";
export {
  ObjectiveStateConflictRuleSchema,
  ObjectiveStateConflictSchema,
  ObjectiveStateQuerySchema,
  ObjectiveStateSnapshotSchema,
  SimulationTimestampRelationSchema,
  SimulationTimestampSchema,
  TemporalObjectiveStateQueryEngine,
  queryObjectiveStateAtTimestamp,
} from "./temporal-query";
export type {
  ObjectiveStateConflict,
  ObjectiveStateConflictRule,
  ObjectiveStateQuery,
  ObjectiveStateSnapshot,
  SimulationTimestamp,
  SimulationTimestampRelation,
} from "./temporal-query";
export {
  FORESHADOW_RESOLUTION_WINDOW_EPISODES,
  ForeshadowPayoffCandidateSchema,
  ForeshadowPayoffConditionKeySchema,
  ForeshadowPayoffConditionsSchema,
  ForeshadowRegistryEntrySchema,
  ForeshadowRegistryStoreSchema,
  addForeshadowRegistryEntry,
  createForeshadowRegistryFromSeed,
  createForeshadowRegistryStore,
  evaluateForeshadowPayoffEligibility,
  gateEpisodeForeshadowFullResolution,
  listForeshadowRegistryEntries,
  registerSeedForeshadowing,
} from "./foreshadow-registry";
export type {
  ForeshadowPayoffCandidate,
  ForeshadowPayoffConditionKey,
  ForeshadowPayoffConditions,
  ForeshadowPayoffEligibilityFailure,
  ForeshadowPayoffEligibilityResult,
  ForeshadowPayoffValidationKey,
  ForeshadowRegistryEntry,
  ForeshadowRegistryStore,
} from "./foreshadow-registry";
export {
  ForeshadowConcreteIntroductionSchema,
  ForeshadowDeferredPayoffSchema,
  ForeshadowPayoffKindSchema,
  ForeshadowRegistrationContractSchema,
  qualifyForeshadowRegistration,
} from "./foreshadow-contract";
export type {
  ForeshadowConcreteIntroduction,
  ForeshadowDeferredPayoff,
  ForeshadowPayoffKind,
  ForeshadowQualificationResult,
  ForeshadowRegistrationContract,
} from "./foreshadow-contract";
export {
  CharacterMemoryAccuracySchema,
  CharacterMemoryKindSchema,
  CharacterMemoryRecordSchema,
  CharacterMemoryReferenceSchema,
  CharacterMemoryStateSchema,
  CharacterMemoryStoreSchema,
  addCharacterMemory,
  createCharacterMemoryStore,
  listCharacterMemories,
} from "./memory-state";
export type {
  CharacterMemoryAccuracy,
  CharacterMemoryKind,
  CharacterMemoryRecord,
  CharacterMemoryReference,
  CharacterMemoryState,
  CharacterMemoryStore,
} from "./memory-state";
export {
  AgentBrainIntentionFrameSchema,
  AgentBrainSnapshotSchema,
  AgentBrainStateSchema,
  applyAgentBrainEvent,
  buildAgentBrainSnapshot,
  cloneAgentBrainState,
  createAgentBrainState,
  recordAgentBrainDecision,
} from "./agent-brain-state";
export type {
  AgentBrainIntentionFrame,
  AgentBrainSnapshot,
  AgentBrainState,
} from "./agent-brain-state";
export {
  CharacterUtteranceMediumSchema,
  CharacterUtteranceProvenanceSchema,
  CharacterUtteranceProvenanceSourceSchema,
  CharacterUtteranceRecordSchema,
  CharacterUtteranceStateSchema,
  CharacterUtteranceStoreSchema,
  addCharacterUtterance,
  createCharacterUtteranceStore,
  listCharacterUtterances,
} from "./utterance-state";
export type {
  CharacterUtteranceCanonicalAlignment,
  CharacterUtteranceMedium,
  CharacterUtteranceProvenance,
  CharacterUtteranceProvenanceSource,
  CharacterUtteranceRecord,
  CharacterUtteranceState,
  CharacterUtteranceStore,
} from "./utterance-state";
export {
  buildActiveSpeakerPromptContext,
  buildFocalCharacterPromptContext,
  buildSimulationPromptContext,
  collectSceneCharacterIds,
} from "./adapter";

export type {
  ActiveSpeakerPromptOptions,
  FocalCharacterPromptOptions,
} from "./adapter";

export type {
  SimulationAdapterOptions,
  SimulationBootstrap,
  SimulationCharacterState,
  SimulationState,
  SimulationThread,
} from "./types";
export {
  createDeterministicLongFormValidationScenario,
  LONG_FORM_VALIDATION_SCENARIO_ID,
  LONG_FORM_VALIDATION_TOTAL_EPISODES,
} from "./validation-scenario";
export type {
  DeterministicLongFormValidationScenario,
  ValidationScenarioBeliefExpectation,
  ValidationScenarioCheckpoint,
  ValidationScenarioEventRecord,
  ValidationScenarioFactSnapshot,
  ValidationScenarioForeshadowExpectation,
  ValidationScenarioMemoryExpectation,
  ValidationScenarioMismatchAttribution,
  ValidationScenarioRecordType,
  ValidationScenarioUtteranceExpectation,
} from "./validation-scenario";
export {
  LongFormValidationScenarioSchema,
  loadLongFormValidationScenarioFromFile,
  parseLongFormValidationScenario,
  resolveLongFormValidationScenario,
} from "./validation-scenario-io";
export type {
  ResolveLongFormValidationScenarioOptions,
} from "./validation-scenario-io";
