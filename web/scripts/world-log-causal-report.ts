#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";

interface CliOptions {
  runDir: string;
  startChapter: number;
  endChapter: number;
  outDir: string;
}

interface ActionLog {
  logId: string;
  chapter: number;
  tick?: number;
  actorId: string;
  actorName?: string;
  observed?: string[];
  targetIds?: string[];
  targetNames?: string[];
  visibleBehavior?: string;
  intendedEffect?: string;
  privateState?: {
    activeObjective?: string;
    activeIntentionId?: string;
    retrievedMemoryIds?: string[];
    agentBrain?: unknown;
  };
  action?: {
    type?: string;
    intent?: string;
    rationale?: string;
    speechActHint?: string;
    operator?: {
      status?: string;
      statusReason?: string;
      failedPreconditions?: string[];
      checkedPreconditions?: string[];
    };
  };
  planLifecycle?: {
    previousStatus?: string;
    nextStatus?: string;
    reason?: string;
    linkedFollowUpActionSeed?: string;
  };
  actualEffect?: {
    targetReaction?: string;
    followUpActionSeed?: string;
    scenePressureDelta?: number;
    stateDeltas?: StateDelta[];
    worldGameMaster?: {
      status?: string;
      reason?: string;
      failedPreconditions?: string[];
      newAffordances?: string[];
      stateDeltaIds?: string[];
    };
  };
  memoryUpdates?: unknown[];
  beliefUpdates?: unknown[];
  trustDeltas?: Record<string, number>;
}

interface StateDelta {
  deltaId?: string;
  domain?: string;
  operation?: string;
  summary?: string;
  cause?: string;
}

interface InteractionResolution {
  resolutionId: string;
  chapter: number;
  tick?: number;
  sourceActionLogIds?: string[];
  speechDraft?: {
    speakerName?: string;
    targetNames?: string[];
    utteranceCandidate?: string;
    speechAct?: string;
    surfaceMeaning?: string;
    hiddenIntention?: string;
    subtext?: string;
  };
  targetInterpretations?: Array<{
    characterName?: string;
    interpretedAs?: string;
    emotionalResponse?: string;
  }>;
  emotionalShift?: {
    actorAfter?: string;
    targetAfter?: string;
    intensityDelta?: number;
    reason?: string;
  };
  powerShift?: {
    axis?: string;
    delta?: number;
    reason?: string;
  };
  relationshipShift?: {
    trustDelta?: number;
    suspicionDelta?: number;
    dependencyDelta?: number;
    hostilityDelta?: number;
    reason?: string;
  };
  misunderstandings?: string[];
  newSharedFacts?: string[];
  nextActionSeeds?: string[];
  writerHooks?: {
    linePurpose?: string;
  };
}

interface SceneLog {
  sceneId: string;
  chapter: number;
  title?: string;
  scenePurpose?: string;
  location?: string;
  atmosphere?: string;
  sourceActionLogIds?: string[];
  dialogueTurns?: Array<{
    speakerName?: string;
    utterance?: string;
    hiddenIntent?: string;
    sourceActionLogIds?: string[];
  }>;
}

interface RuntimeMindState {
  characterId?: string;
  currentPlan?: string;
  knownFacts?: string[];
  recentMemorySummaries?: string[];
  recentVisibleBehaviors?: string[];
  recentUtterances?: string[];
  reflectionNotes?: string[];
  proceduralMemory?: string[];
  trustDeltasByCharacter?: Record<string, number>;
}

interface RuntimeContinuityReport {
  available: boolean;
  verdict: "pass" | "warn";
  characterCount: number;
  charactersWithKnownFacts: number;
  charactersWithRecentMemory: number;
  charactersWithCurrentPlan: number;
  charactersWithTrustDeltas: number;
  totalKnownFacts: number;
  totalRecentMemories: number;
  averageKnownFacts: number;
  averageRecentMemories: number;
  minKnownFacts: number;
  minRecentMemories: number;
  maxKnownFacts: number;
  maxRecentMemories: number;
  uniqueCurrentPlans: number;
  uniqueRecentMemorySignatures: number;
  recentMemorySignatureDiversity: number;
  notes: string[];
  characters: Array<{
    characterId: string;
    currentPlan: string;
    knownFactCount: number;
    recentMemoryCount: number;
    visibleBehaviorCount: number;
    utteranceCount: number;
    reflectionCount: number;
    proceduralMemoryCount: number;
    trustDeltaTargetCount: number;
    recentMemorySignature: string;
    sampleKnownFacts: string[];
    sampleRecentMemories: string[];
  }>;
}

interface ActionAuditRow {
  logId: string;
  chapter: number;
  tick: number | null;
  actor: string;
  targets: string[];
  actionType: string;
  gmStatus: string;
  planStatus: string;
  hasBrain: boolean;
  hasResolution: boolean;
  hasScene: boolean;
  hasStateDeltas: boolean;
  hasFollowUp: boolean;
  nextPressureCarried: boolean | null;
  stateDeltaDomains: string[];
  intent: string;
  visibleBehavior: string;
  targetReaction: string;
  followUp: string;
  utterance: string;
  narrativeHeat: NarrativeHeatScore;
  interactionDynamics: InteractionDynamicsScore;
}

interface NarrativeHeatScore {
  score: number;
  eventDensity: number;
  emotionalDensity: number;
  reversalPotential: number;
  socialSubtext: number;
  evidence: string[];
}

interface InteractionDynamicsScore {
  score: number;
  agency: number;
  consequence: number;
  renderability: number;
  socialFeedback: number;
  evidence: string[];
}

interface RepeatedTextItem {
  text: string;
  count: number;
  rate: number;
}

interface InteractionVarietyReport {
  verdict: "pass" | "warn";
  totalEmotionalResponses: number;
  uniqueEmotionalResponses: number;
  topEmotionalResponseRate: number;
  totalLinePurposes: number;
  uniqueLinePurposes: number;
  topLinePurposeRate: number;
  totalIntentPatterns: number;
  uniqueIntentPatterns: number;
  topIntentPatternRate: number;
  topEmotionalResponses: RepeatedTextItem[];
  topLinePurposes: RepeatedTextItem[];
  topIntentPatterns: RepeatedTextItem[];
  notes: string[];
}

interface ArcProgressionReport {
  verdict: "pass" | "warn";
  windowSize: number;
  windowCount: number;
  distinctScenePurposeCount: number;
  scenePurposeTransitionCount: number;
  scenePurposeCyclePeriod: number | null;
  scenePurposeCycleRate: number;
  dominantWindowPurpose: string;
  dominantWindowPurposeCount: number;
  dominantWindowPurposeRate: number;
  distinctLocationCount: number;
  highHeatChapterCount: number;
  weakWindowCount: number;
  windows: Array<{
    startChapter: number;
    endChapter: number;
    dominantScenePurpose: string;
    distinctScenePurposeCount: number;
    distinctLocationCount: number;
    averageHeat: number;
    averageInteraction: number;
    reciprocalPairRatio: number;
    verdict: "pass" | "warn";
    notes: string[];
  }>;
  notes: string[];
}

interface PressureLifecycleReport {
  verdict: "pass" | "warn";
  totalFollowUps: number;
  completedInOriginCount: number;
  carryCandidateCount: number;
  carriedCount: number;
  stalledCarryCount: number;
  openAtRangeEndCount: number;
  carryRate: number;
  completedOrCarriedRate: number;
  topStalledPressures: RepeatedTextItem[];
  topOpenPressures: RepeatedTextItem[];
  notes: string[];
}

interface TextRepetitionReport {
  verdict: "pass" | "warn";
  utteranceDuplicateCount: number;
  utteranceDuplicateRate: number;
  followUpDuplicateCount: number;
  followUpDuplicateRate: number;
  visibleBehaviorDuplicateCount: number;
  visibleBehaviorDuplicateRate: number;
  targetReactionDuplicateCount: number;
  targetReactionDuplicateRate: number;
  topUtterances: RepeatedTextItem[];
  topFollowUps: RepeatedTextItem[];
  topVisibleBehaviors: RepeatedTextItem[];
  topTargetReactions: RepeatedTextItem[];
  notes: string[];
}

interface LanguageIntegrityIssue {
  text: string;
  reason: string;
  count: number;
}

interface LanguageIntegrityReport {
  verdict: "pass" | "warn";
  scannedTextCount: number;
  particleIssueCount: number;
  topParticleIssues: LanguageIntegrityIssue[];
  notes: string[];
}

interface ReportJson {
  sourceRunDir: string;
  chapters: { start: number; end: number; count: number };
  generatedAt: string;
  summary: {
    actionCount: number;
    resolutionCount: number;
    sceneCount: number;
    missingResolutionCount: number;
    missingSceneCount: number;
    missingBrainCount: number;
    missingStateDeltaCount: number;
    missingFollowUpCount: number;
    checkedNextPressureCount: number;
    carriedNextPressureCount: number;
    uniqueActorTargetPairs: number;
    gmStatusCounts: Record<string, number>;
    actionTypeCounts: Record<string, number>;
    narrativeHeat: {
      averageScore: number;
      minChapterScore: number;
      maxChapterScore: number;
      hotActionCount: number;
      coldActionCount: number;
    };
    worldLogReadiness: {
      averageScore: number;
      minChapterScore: number;
      dynamicActionRate: number;
      reciprocalPairRatio: number;
      weakChapterCount: number;
      verdict: "pass" | "warn";
    };
    runtimeContinuity: RuntimeContinuityReport;
    interactionVariety: InteractionVarietyReport;
    pressureLifecycle: PressureLifecycleReport;
    textRepetition: TextRepetitionReport;
    arcProgression: ArcProgressionReport;
    languageIntegrity: LanguageIntegrityReport;
  };
  rows: ActionAuditRow[];
  chaptersDetail: Array<{
    chapter: number;
    title: string;
    scenePurpose: string;
    actionCount: number;
    narrativeHeatScore: number;
    interactionScore: number;
    reciprocalPairRatio: number;
    hotActionCount: number;
    coldActionCount: number;
    dynamicActionCount: number;
    weakDynamicActionCount: number;
    verdict: "pass" | "warn";
    notes: string[];
  }>;
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/world-log-causal-report.ts --run ./output/world-model-renderer-30ch-check-20260518-v3 --chapters 1-3",
    "",
    "Options:",
    "  --run <dir>         Simulation output directory containing action-logs.json",
    "  --chapters <range>  Chapter range, e.g. 1-3 or 7",
    "  --out <dir>         Output directory (default: same as --run)",
  ].join("\n");
}

function parseArgs(args = process.argv.slice(2)): CliOptions {
  let runDir: string | undefined;
  let startChapter = 1;
  let endChapter = 3;
  let outDir: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const next = args[index + 1];
    switch (token) {
      case "--run":
        if (!next) throw new Error("--run requires a directory");
        runDir = next;
        index += 1;
        break;
      case "--chapters": {
        if (!next) throw new Error("--chapters requires a range");
        const range = parseChapterRange(next);
        startChapter = range.startChapter;
        endChapter = range.endChapter;
        index += 1;
        break;
      }
      case "--out":
        if (!next) throw new Error("--out requires a directory");
        outDir = next;
        index += 1;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${token}\n\n${usage()}`);
    }
  }

  if (!runDir) {
    throw new Error(`Missing --run\n\n${usage()}`);
  }

  return {
    runDir,
    startChapter,
    endChapter,
    outDir: outDir ?? runDir,
  };
}

function parseChapterRange(value: string): { startChapter: number; endChapter: number } {
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid --chapters range: ${value}`);
  const startChapter = Number.parseInt(match[1]!, 10);
  const endChapter = Number.parseInt(match[2] ?? match[1]!, 10);
  if (startChapter <= 0 || endChapter < startChapter) {
    throw new Error(`Invalid --chapters range: ${value}`);
  }
  return { startChapter, endChapter };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readSceneLogs(runDir: string): SceneLog[] {
  const sceneDir = path.join(runDir, "scene-logs");
  if (fs.existsSync(sceneDir)) {
    const fileNames = fs.readdirSync(sceneDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    if (fileNames.length > 0) {
      return fileNames.map((name) => readJson<SceneLog>(path.join(sceneDir, name)));
    }
  }

  const sceneLogsPath = path.join(runDir, "scene-logs.json");
  if (fs.existsSync(sceneLogsPath)) return readJson<SceneLog[]>(sceneLogsPath);
  return [];
}

function readRuntimeMindStates(runDir: string): Record<string, RuntimeMindState> | undefined {
  const filePath = path.join(runDir, "runtime-mind-states.json");
  if (!fs.existsSync(filePath)) return undefined;
  const parsed = readJson<unknown>(filePath);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, RuntimeMindState>;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function clean(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function shorten(value: unknown, limit = 92): string {
  const text = clean(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function escapeTableCell(value: unknown): string {
  return shorten(value).replace(/\|/g, "\\|");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function hasBatchim(text: string): boolean {
  const lastChar = text.trim().at(-1);
  if (!lastChar) return false;
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minOrZero(values: number[]): number {
  return values.length === 0 ? 0 : Math.min(...values);
}

function maxOrZero(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function pressureTag(seed: string): string | undefined {
  return /\[pressure:([^\]]+)\]/u.exec(seed)?.[1];
}

function hasPressureCarry(action: ActionLog, seed: string, nextAction?: ActionLog): boolean | null {
  if (action.planLifecycle?.nextStatus === "completed") return null;
  const tag = pressureTag(seed);
  if (!tag || !nextAction) return null;
  return (nextAction.observed ?? []).some((entry) => entry.includes(tag));
}

function actionIntent(action: ActionLog): string {
  return clean(
    action.action?.intent
    || action.privateState?.activeObjective
    || action.intendedEffect
  );
}

function actionStatus(action: ActionLog): string {
  return clean(
    action.actualEffect?.worldGameMaster?.status
    || action.action?.operator?.status
    || "unknown"
  );
}

function findResolution(
  resolutionsByActionId: Map<string, InteractionResolution>,
  actionId: string,
): InteractionResolution | undefined {
  return resolutionsByActionId.get(actionId);
}

function scoreNarrativeHeat(action: ActionLog, resolution?: InteractionResolution): NarrativeHeatScore {
  const gmStatus = actionStatus(action);
  const stateDeltaDomains = new Set((action.actualEffect?.stateDeltas ?? []).map((delta) =>
    clean(delta.domain || "unknown")
  ));
  const planStatus = action.planLifecycle?.nextStatus ?? "unknown";
  const emotionDelta = Math.abs(resolution?.emotionalShift?.intensityDelta ?? 0);
  const powerDelta = Math.abs(resolution?.powerShift?.delta ?? 0);
  const relationshipShift = resolution?.relationshipShift;
  const relationshipDelta = Math.abs(relationshipShift?.trustDelta ?? 0)
    + Math.abs(relationshipShift?.suspicionDelta ?? 0)
    + Math.abs(relationshipShift?.dependencyDelta ?? 0)
    + Math.abs(relationshipShift?.hostilityDelta ?? 0);
  const misunderstandingCount = resolution?.misunderstandings?.length ?? 0;
  const newFactCount = resolution?.newSharedFacts?.length ?? 0;
  const hasHiddenIntention = clean(resolution?.speechDraft?.hiddenIntention).length > 0;
  const hasSubtext = clean(resolution?.speechDraft?.subtext).length > 0;
  const hasTargetReaction = clean(action.actualEffect?.targetReaction).length > 0;
  const isFriction = gmStatus === "partial" || gmStatus === "backfired";
  const isPlanBent = planStatus === "blocked" || planStatus === "abandoned";

  const eventDensity = clamp(
    (action.actualEffect?.stateDeltas?.length ?? 0) / 5 * 0.45
    + (hasTargetReaction ? 0.2 : 0)
    + (action.actualEffect?.followUpActionSeed ? 0.2 : 0)
    + (stateDeltaDomains.has("relationship") ? 0.15 : 0),
  );
  const emotionalDensity = clamp((emotionDelta / 3) * 0.55 + Math.min(relationshipDelta, 4) / 4 * 0.45);
  const reversalPotential = clamp(
    (gmStatus === "backfired" ? 0.45 : gmStatus === "partial" ? 0.25 : 0.05)
    + (isPlanBent ? 0.25 : 0)
    + Math.min(powerDelta, 3) / 3 * 0.2
    + Math.min(misunderstandingCount, 2) / 2 * 0.1,
  );
  const socialSubtext = clamp(
    (hasHiddenIntention ? 0.25 : 0)
    + (hasSubtext ? 0.25 : 0)
    + Math.min(misunderstandingCount, 2) / 2 * 0.25
    + Math.min(newFactCount, 2) / 2 * 0.25,
  );
  const score = round2(
    eventDensity * 0.28
    + emotionalDensity * 0.26
    + reversalPotential * 0.24
    + socialSubtext * 0.22,
  );
  const evidence = [
    `${gmStatus}${isFriction ? " friction" : ""}`,
    `plan=${planStatus}`,
    `emotion=${emotionDelta}`,
    `power=${powerDelta}`,
    `relationship=${relationshipDelta}`,
    `facts=${newFactCount}`,
  ];

  return {
    score,
    eventDensity: round2(eventDensity),
    emotionalDensity: round2(emotionalDensity),
    reversalPotential: round2(reversalPotential),
    socialSubtext: round2(socialSubtext),
    evidence,
  };
}

function scoreInteractionDynamics(action: ActionLog, resolution?: InteractionResolution): InteractionDynamicsScore {
  const stateDeltaDomains = new Set((action.actualEffect?.stateDeltas ?? []).map((delta) =>
    clean(delta.domain || "unknown")
  ));
  const hasIntent = actionIntent(action).length > 0;
  const hasVisibleBehavior = clean(action.visibleBehavior).length > 0;
  const hasActionType = clean(action.action?.type).length > 0;
  const hasPlanLifecycle = Boolean(action.planLifecycle?.nextStatus);
  const hasBrain = Boolean(action.privateState?.agentBrain && action.privateState.activeObjective);
  const hasTargetReaction = clean(action.actualEffect?.targetReaction).length > 0;
  const hasFollowUp = clean(action.actualEffect?.followUpActionSeed || action.planLifecycle?.linkedFollowUpActionSeed).length > 0;
  const hasUtterance = clean(resolution?.speechDraft?.utteranceCandidate).length > 0;
  const hasHiddenIntention = clean(resolution?.speechDraft?.hiddenIntention).length > 0;
  const hasSubtext = clean(resolution?.speechDraft?.subtext).length > 0;
  const hasSpeechAct = clean(resolution?.speechDraft?.speechAct || action.action?.speechActHint).length > 0;
  const emotionDelta = Math.abs(resolution?.emotionalShift?.intensityDelta ?? 0);
  const powerDelta = Math.abs(resolution?.powerShift?.delta ?? 0);
  const relationshipShift = resolution?.relationshipShift;
  const relationshipDelta = Math.abs(relationshipShift?.trustDelta ?? 0)
    + Math.abs(relationshipShift?.suspicionDelta ?? 0)
    + Math.abs(relationshipShift?.dependencyDelta ?? 0)
    + Math.abs(relationshipShift?.hostilityDelta ?? 0);
  const trustDelta = Object.values(action.trustDeltas ?? {}).reduce((sum, value) => sum + Math.abs(value), 0);
  const targetInterpretationCount = resolution?.targetInterpretations?.length ?? 0;

  const agency = clamp(
    (hasBrain ? 0.3 : 0)
    + (hasIntent ? 0.25 : 0)
    + (hasVisibleBehavior ? 0.2 : 0)
    + (hasActionType ? 0.15 : 0)
    + (hasPlanLifecycle ? 0.1 : 0),
  );
  const consequence = clamp(
    Math.min(action.actualEffect?.stateDeltas?.length ?? 0, 5) / 5 * 0.35
    + (hasTargetReaction ? 0.2 : 0)
    + (hasFollowUp ? 0.2 : 0)
    + (stateDeltaDomains.has("relationship") ? 0.15 : 0)
    + Math.min(emotionDelta, 3) / 3 * 0.1,
  );
  const renderability = clamp(
    (hasUtterance ? 0.3 : 0)
    + (hasVisibleBehavior ? 0.25 : 0)
    + (hasTargetReaction ? 0.2 : 0)
    + (hasHiddenIntention || hasSubtext ? 0.15 : 0)
    + (hasSpeechAct ? 0.1 : 0),
  );
  const socialFeedback = clamp(
    ((action.targetIds?.length ?? 0) > 0 || (action.targetNames?.length ?? 0) > 0 ? 0.2 : 0)
    + Math.min(targetInterpretationCount, 1) * 0.2
    + Math.min(trustDelta, 2) / 2 * 0.2
    + Math.min(relationshipDelta, 4) / 4 * 0.2
    + Math.min(powerDelta, 3) / 3 * 0.2,
  );
  const score = round2(
    agency * 0.25
    + consequence * 0.35
    + renderability * 0.25
    + socialFeedback * 0.15,
  );
  const evidence = [
    `agency=${round2(agency)}`,
    `deltas=${action.actualEffect?.stateDeltas?.length ?? 0}`,
    `emotion=${emotionDelta}`,
    `relationship=${relationshipDelta}`,
    `power=${powerDelta}`,
    `utterance=${hasUtterance ? "yes" : "no"}`,
  ];

  return {
    score,
    agency: round2(agency),
    consequence: round2(consequence),
    renderability: round2(renderability),
    socialFeedback: round2(socialFeedback),
    evidence,
  };
}

function buildRows(input: {
  selectedActions: ActionLog[];
  allActions: ActionLog[];
  resolutionsByActionId: Map<string, InteractionResolution>;
  sceneActionIds: Set<string>;
}): ActionAuditRow[] {
  const allIndexById = new Map(input.allActions.map((action, index) => [action.logId, index]));

  return input.selectedActions.map((action) => {
    const seed = action.actualEffect?.followUpActionSeed
      || action.planLifecycle?.linkedFollowUpActionSeed
      || "";
    const actionIndex = allIndexById.get(action.logId);
    const nextAction = actionIndex == null ? undefined : input.allActions[actionIndex + 1];
    const resolution = findResolution(input.resolutionsByActionId, action.logId);
    const stateDeltas = action.actualEffect?.stateDeltas ?? [];

    return {
      logId: action.logId,
      chapter: action.chapter,
      tick: action.tick ?? null,
      actor: clean(action.actorName || action.actorId),
      targets: action.targetNames?.length ? action.targetNames : (action.targetIds ?? []),
      actionType: clean(action.action?.type || "unknown"),
      gmStatus: actionStatus(action),
      planStatus: clean(action.planLifecycle?.nextStatus || "unknown"),
      hasBrain: Boolean(action.privateState?.agentBrain && action.privateState.activeObjective),
      hasResolution: Boolean(resolution),
      hasScene: input.sceneActionIds.has(action.logId),
      hasStateDeltas: stateDeltas.length > 0,
      hasFollowUp: clean(seed).length > 0,
      nextPressureCarried: hasPressureCarry(action, seed, nextAction),
      stateDeltaDomains: [...new Set(stateDeltas.map((delta) => clean(delta.domain || "unknown")))],
      intent: actionIntent(action),
      visibleBehavior: clean(action.visibleBehavior),
      targetReaction: clean(action.actualEffect?.targetReaction),
      followUp: clean(seed),
      utterance: clean(resolution?.speechDraft?.utteranceCandidate),
      narrativeHeat: scoreNarrativeHeat(action, resolution),
      interactionDynamics: scoreInteractionDynamics(action, resolution),
    };
  });
}

function reciprocalPairRatio(rows: ActionAuditRow[]): number {
  const directionalPairs = new Set<string>();
  const unorderedPairs = new Set<string>();
  for (const row of rows) {
    for (const target of row.targets) {
      if (!target || row.actor === target) continue;
      directionalPairs.add(`${row.actor}->${target}`);
      unorderedPairs.add([row.actor, target].sort().join("<->"));
    }
  }
  if (unorderedPairs.size === 0) return 0;
  const reciprocalCount = [...unorderedPairs].filter((pair) => {
    const [left, right] = pair.split("<->");
    return directionalPairs.has(`${left}->${right}`) && directionalPairs.has(`${right}->${left}`);
  }).length;
  return round2(reciprocalCount / unorderedPairs.size);
}

function chapterVerdict(rows: ActionAuditRow[]): { verdict: "pass" | "warn"; notes: string[] } {
  const notes: string[] = [];
  const missingResolution = rows.filter((row) => !row.hasResolution).length;
  const missingScene = rows.filter((row) => !row.hasScene).length;
  const missingDeltas = rows.filter((row) => !row.hasStateDeltas).length;
  const missingFollowUp = rows.filter((row) => !row.hasFollowUp).length;
  const brokenCarry = rows.filter((row) => row.nextPressureCarried === false).length;
  const lowHeatActions = rows.filter((row) => row.narrativeHeat.score < 0.45).length;
  const weakDynamicActions = rows.filter((row) => row.interactionDynamics.score < 0.55).length;
  const averageInteraction = average(rows.map((row) => row.interactionDynamics.score));
  const reciprocity = reciprocalPairRatio(rows);

  if (missingResolution > 0) notes.push(`resolution 누락 ${missingResolution}건`);
  if (missingScene > 0) notes.push(`scene 반영 누락 ${missingScene}건`);
  if (missingDeltas > 0) notes.push(`state delta 누락 ${missingDeltas}건`);
  if (missingFollowUp > 0) notes.push(`follow-up seed 누락 ${missingFollowUp}건`);
  if (brokenCarry > 0) notes.push(`다음 행동 carry 누락 ${brokenCarry}건`);
  if (lowHeatActions > Math.max(1, rows.length * 0.4)) {
    notes.push(`narrative heat 낮은 행동 ${lowHeatActions}건`);
  }
  if (weakDynamicActions > Math.max(1, rows.length * 0.25)) {
    notes.push(`동적 상호작용 약한 행동 ${weakDynamicActions}건`);
  }
  if (rows.length > 0 && averageInteraction < 0.65) {
    notes.push(`interaction score 낮음 ${round2(averageInteraction)}`);
  }
  if (rows.length >= 4 && reciprocity < 0.25) {
    notes.push(`왕복 상호작용 부족 ${reciprocity}`);
  }

  return {
    verdict: notes.length === 0 ? "pass" : "warn",
    notes: notes.length === 0 ? ["모든 행동이 resolution/scene/state delta/follow-up으로 연결됨"] : notes,
  };
}

function topRepeatedTexts(values: string[], limit = 5): RepeatedTextItem[] {
  const counts = countBy(values.filter(Boolean), (value) => value);
  const total = values.filter(Boolean).length;
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([text, count]) => ({
      text,
      count,
      rate: total === 0 ? 0 : round2(count / total),
    }));
}

function topDuplicatedTexts(values: string[], limit = 5): RepeatedTextItem[] {
  return topRepeatedTexts(values, Math.max(limit * 3, limit))
    .filter((item) => item.count > 1)
    .slice(0, limit);
}

function duplicateTextCount(values: string[]): number {
  const counts = countBy(values.filter(Boolean), (value) => value);
  return Object.values(counts)
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function duplicateRate(values: string[]): number {
  const total = values.filter(Boolean).length;
  return total === 0 ? 0 : round2(duplicateTextCount(values) / total);
}

function topRate(items: RepeatedTextItem[]): number {
  return items[0]?.rate ?? 0;
}

function normalizeIntentPattern(value: unknown): string {
  return clean(value)
    .replace(/\s*\[pressure:[^\]]+\]/gu, "")
    .replace(/\d+화/gu, "{chapter}화")
    .replace(/act_ch\d+_\d+_[a-z]+/giu, "{actionId}");
}

function buildInteractionVarietyReport(input: {
  rows: ActionAuditRow[];
  resolutions: InteractionResolution[];
}): InteractionVarietyReport {
  const emotionalResponses = input.resolutions.flatMap((resolution) =>
    (resolution.targetInterpretations ?? [])
      .map((interpretation) => clean(interpretation.emotionalResponse))
      .filter(Boolean)
  );
  const linePurposes = input.resolutions
    .map((resolution) => clean(resolution.writerHooks?.linePurpose || resolution.speechDraft?.surfaceMeaning))
    .filter(Boolean);
  const intentPatterns = input.rows
    .map((row) => normalizeIntentPattern(row.intent))
    .filter(Boolean);

  const topEmotionalResponses = topRepeatedTexts(emotionalResponses);
  const topLinePurposes = topRepeatedTexts(linePurposes);
  const topIntentPatterns = topRepeatedTexts(intentPatterns);
  const topEmotionalResponseRate = topRate(topEmotionalResponses);
  const topLinePurposeRate = topRate(topLinePurposes);
  const topIntentPatternRate = topRate(topIntentPatterns);
  const notes: string[] = [];

  if (emotionalResponses.length > 0 && topEmotionalResponseRate >= 0.35) {
    notes.push(`감정 반응 최빈값 비중 높음 ${topEmotionalResponseRate}`);
  }
  if (linePurposes.length > 0 && topLinePurposeRate >= 0.25) {
    notes.push(`linePurpose 최빈값 비중 높음 ${topLinePurposeRate}`);
  }
  if (intentPatterns.length > 0 && topIntentPatternRate >= 0.12) {
    notes.push(`행동 목적 패턴 최빈값 비중 높음 ${topIntentPatternRate}`);
  }
  const expectedEmotionalVariety = Math.min(16, Math.max(4, new Set(input.rows.map((row) => row.actionType)).size * 2));
  if (emotionalResponses.length >= 20 && new Set(emotionalResponses).size < expectedEmotionalVariety) {
    notes.push(`감정 반응 종류 부족 ${new Set(emotionalResponses).size}/${emotionalResponses.length}`);
  }

  return {
    verdict: notes.length === 0 ? "pass" : "warn",
    totalEmotionalResponses: emotionalResponses.length,
    uniqueEmotionalResponses: new Set(emotionalResponses).size,
    topEmotionalResponseRate,
    totalLinePurposes: linePurposes.length,
    uniqueLinePurposes: new Set(linePurposes).size,
    topLinePurposeRate,
    totalIntentPatterns: intentPatterns.length,
    uniqueIntentPatterns: new Set(intentPatterns).size,
    topIntentPatternRate,
    topEmotionalResponses,
    topLinePurposes,
    topIntentPatterns,
    notes: notes.length === 0
      ? ["상호작용 문장/반응 패턴의 최빈값 쏠림이 허용 범위 안에 있음"]
      : notes,
  };
}

function buildPressureLifecycleReport(rows: ActionAuditRow[]): PressureLifecycleReport {
  const followUpRows = rows.filter((row) => row.hasFollowUp);
  const completedInOriginRows = followUpRows.filter((row) => row.planStatus === "completed");
  const carryCandidateRows = followUpRows.filter((row) => row.nextPressureCarried != null);
  const carriedRows = carryCandidateRows.filter((row) => row.nextPressureCarried);
  const stalledRows = carryCandidateRows.filter((row) => row.nextPressureCarried === false);
  const openAtRangeEndRows = followUpRows.filter((row) =>
    row.planStatus !== "completed" && row.nextPressureCarried == null
  );
  const carryRate = carryCandidateRows.length === 0
    ? 1
    : round2(carriedRows.length / carryCandidateRows.length);
  const completedOrCarriedRate = followUpRows.length === 0
    ? 1
    : round2((completedInOriginRows.length + carriedRows.length) / followUpRows.length);
  const notes: string[] = [];

  if (stalledRows.length > 0) notes.push(`다음 행동으로 이어지지 않은 pressure ${stalledRows.length}건`);
  if (carryCandidateRows.length > 0 && carryRate < 0.8) notes.push(`pressure carry rate 낮음 ${carryRate}`);
  if (openAtRangeEndRows.length > 0) {
    notes.push(`범위 끝에 열린 pressure ${openAtRangeEndRows.length}건: 다음 범위로 이어질 수 있음`);
  }

  return {
    verdict: stalledRows.length === 0 && carryRate >= 0.8 ? "pass" : "warn",
    totalFollowUps: followUpRows.length,
    completedInOriginCount: completedInOriginRows.length,
    carryCandidateCount: carryCandidateRows.length,
    carriedCount: carriedRows.length,
    stalledCarryCount: stalledRows.length,
    openAtRangeEndCount: openAtRangeEndRows.length,
    carryRate,
    completedOrCarriedRate,
    topStalledPressures: topDuplicatedTexts(stalledRows.map((row) => row.followUp)),
    topOpenPressures: topRepeatedTexts(openAtRangeEndRows.map((row) => row.followUp)),
    notes: notes.length === 0
      ? ["모든 열린 pressure가 다음 행동으로 carry되거나 같은 행동에서 완료됨"]
      : notes,
  };
}

function buildTextRepetitionReport(rows: ActionAuditRow[]): TextRepetitionReport {
  const utterances = rows.map((row) => row.utterance).filter(Boolean);
  const followUps = rows.map((row) => normalizeIntentPattern(row.followUp)).filter(Boolean);
  const visibleBehaviors = rows.map((row) => row.visibleBehavior).filter(Boolean);
  const targetReactions = rows.map((row) => normalizeIntentPattern(row.targetReaction)).filter(Boolean);
  const utteranceDuplicateRate = duplicateRate(utterances);
  const followUpDuplicateRate = duplicateRate(followUps);
  const visibleBehaviorDuplicateRate = duplicateRate(visibleBehaviors);
  const targetReactionDuplicateRate = duplicateRate(targetReactions);
  const topUtterances = topDuplicatedTexts(utterances);
  const topFollowUps = topDuplicatedTexts(followUps);
  const topVisibleBehaviors = topDuplicatedTexts(visibleBehaviors);
  const topTargetReactions = topDuplicatedTexts(targetReactions);
  const notes: string[] = [];

  if (utteranceDuplicateRate > 0.08) notes.push(`대사 exact repetition 높음 ${utteranceDuplicateRate}`);
  if (topUtterances.some((item) => item.count >= 6)) notes.push(`같은 대사 6회 이상 반복`);
  if (followUpDuplicateRate > 0.35) notes.push(`follow-up pressure 패턴 반복 높음 ${followUpDuplicateRate}`);
  if (visibleBehaviorDuplicateRate >= 0.3) notes.push(`표면 행동 패턴 반복 높음 ${visibleBehaviorDuplicateRate}`);
  if (topVisibleBehaviors.some((item) => item.count >= 10)) notes.push("같은 표면 행동 10회 이상 반복");
  if (targetReactionDuplicateRate > 0.35) notes.push(`상대 반응 패턴 반복 높음 ${targetReactionDuplicateRate}`);

  return {
    verdict: notes.length === 0 ? "pass" : "warn",
    utteranceDuplicateCount: duplicateTextCount(utterances),
    utteranceDuplicateRate,
    followUpDuplicateCount: duplicateTextCount(followUps),
    followUpDuplicateRate,
    visibleBehaviorDuplicateCount: duplicateTextCount(visibleBehaviors),
    visibleBehaviorDuplicateRate,
    targetReactionDuplicateCount: duplicateTextCount(targetReactions),
    targetReactionDuplicateRate,
    topUtterances,
    topFollowUps,
    topVisibleBehaviors,
    topTargetReactions,
    notes: notes.length === 0
      ? ["정확히 같은 대사/행동/반응 반복은 허용 범위 안에 있음"]
      : notes,
  };
}

function dominantValue(values: string[]): string {
  const [first, second] = topRepeatedTexts(values, 2);
  if (first && second && first.count === second.count) return "-";
  return first?.text ?? "-";
}

function bestShortCycle(values: string[], maxPeriod = 12): { period: number | null; rate: number } {
  const sequence = values.map(clean).filter((value) => value && value !== "-");
  if (sequence.length < 12) return { period: null, rate: 0 };
  let bestPeriod: number | null = null;
  let bestRate = 0;
  const periodLimit = Math.min(maxPeriod, Math.floor(sequence.length / 2));
  for (let period = 2; period <= periodLimit; period += 1) {
    let comparable = 0;
    let matched = 0;
    for (let index = period; index < sequence.length; index += 1) {
      comparable += 1;
      if (sequence[index] === sequence[index - period]) matched += 1;
    }
    const rate = comparable === 0 ? 0 : matched / comparable;
    if (rate > bestRate) {
      bestRate = rate;
      bestPeriod = period;
    }
  }
  return {
    period: bestRate >= 0.6 ? bestPeriod : null,
    rate: round2(bestRate),
  };
}

function buildArcProgressionReport(input: {
  chaptersDetail: ReportJson["chaptersDetail"];
  scenes: SceneLog[];
  rows: ActionAuditRow[];
  windowSize?: number;
}): ArcProgressionReport {
  const windowSize = input.windowSize ?? 25;
  const chapters = [...input.chaptersDetail].sort((left, right) => left.chapter - right.chapter);
  const scenePurposesByChapter = new Map(input.scenes.map((scene) => [
    scene.chapter,
    clean(scene.scenePurpose || "-"),
  ]));
  const locationsByChapter = new Map(input.scenes.map((scene) => [
    scene.chapter,
    clean(scene.location || "-"),
  ]));
  const distinctScenePurposes = new Set([...scenePurposesByChapter.values()].filter((value) => value !== "-"));
  const distinctLocations = new Set([...locationsByChapter.values()].filter((value) => value !== "-"));
  let scenePurposeTransitionCount = 0;
  let previousPurpose = "";
  for (const chapter of chapters) {
    const purpose = scenePurposesByChapter.get(chapter.chapter) ?? "";
    if (previousPurpose && purpose && purpose !== previousPurpose) scenePurposeTransitionCount += 1;
    if (purpose) previousPurpose = purpose;
  }
  const scenePurposeCycle = bestShortCycle(
    chapters.map((chapter) => scenePurposesByChapter.get(chapter.chapter) ?? "-"),
  );

  const windows: ArcProgressionReport["windows"] = [];
  for (let index = 0; index < chapters.length; index += windowSize) {
    const chunk = chapters.slice(index, index + windowSize);
    if (chunk.length === 0) continue;
    const chapterNumbers = new Set(chunk.map((chapter) => chapter.chapter));
    const windowRows = input.rows.filter((row) => chapterNumbers.has(row.chapter));
    const purposes = chunk.map((chapter) => scenePurposesByChapter.get(chapter.chapter) ?? "-").filter(Boolean);
    const locations = chunk.map((chapter) => locationsByChapter.get(chapter.chapter) ?? "-").filter(Boolean);
    const distinctPurposeCount = new Set(purposes.filter((value) => value !== "-")).size;
    const distinctLocationCount = new Set(locations.filter((value) => value !== "-")).size;
    const averageHeat = round2(average(chunk.map((chapter) => chapter.narrativeHeatScore)));
    const averageInteraction = round2(average(chunk.map((chapter) => chapter.interactionScore)));
    const reciprocity = reciprocalPairRatio(windowRows);
    const notes: string[] = [];

    if (distinctPurposeCount < 3 && chunk.length >= Math.min(windowSize, 10)) {
      notes.push(`목적 변화 부족 ${distinctPurposeCount}`);
    }
    if (distinctLocationCount < 2 && chunk.length >= Math.min(windowSize, 10)) {
      notes.push(`장소 변화 부족 ${distinctLocationCount}`);
    }
    if (averageHeat < 0.6) notes.push(`평균 heat 낮음 ${averageHeat}`);
    if (averageInteraction < 0.65) notes.push(`interaction 낮음 ${averageInteraction}`);
    if (reciprocity < 0.25) notes.push(`왕복 상호작용 낮음 ${reciprocity}`);

    windows.push({
      startChapter: chunk[0]!.chapter,
      endChapter: chunk[chunk.length - 1]!.chapter,
      dominantScenePurpose: dominantValue(purposes),
      distinctScenePurposeCount: distinctPurposeCount,
      distinctLocationCount,
      averageHeat,
      averageInteraction,
      reciprocalPairRatio: reciprocity,
      verdict: notes.length === 0 ? "pass" : "warn",
      notes: notes.length === 0 ? ["구간 안에서 목적/장소/상호작용 변화가 유지됨"] : notes,
    });
  }

  const weakWindowCount = windows.filter((window) => window.verdict === "warn").length;
  const highHeatChapterCount = chapters.filter((chapter) => chapter.narrativeHeatScore >= 0.7).length;
  const dominantWindowPurposeItems = topRepeatedTexts(
    windows.map((window) => window.dominantScenePurpose).filter((purpose) => purpose !== "-"),
    2,
  );
  const hasSingleDominantWindowPurpose =
    Boolean(dominantWindowPurposeItems[0])
    && (dominantWindowPurposeItems[0]?.count ?? 0) > (dominantWindowPurposeItems[1]?.count ?? 0);
  const dominantWindowPurpose = hasSingleDominantWindowPurpose ? dominantWindowPurposeItems[0]!.text : "-";
  const dominantWindowPurposeCount = hasSingleDominantWindowPurpose ? dominantWindowPurposeItems[0]!.count : 0;
  const dominantWindowPurposeRate = hasSingleDominantWindowPurpose ? dominantWindowPurposeItems[0]!.rate : 0;
  const notes: string[] = [];
  if (distinctScenePurposes.size < 4 && chapters.length >= 20) {
    notes.push(`전체 scenePurpose 종류 부족 ${distinctScenePurposes.size}`);
  }
  if (scenePurposeTransitionCount < Math.max(3, Math.floor(chapters.length / 20)) && chapters.length >= 20) {
    notes.push(`scenePurpose 전환 부족 ${scenePurposeTransitionCount}`);
  }
  if (
    chapters.length >= 30
    && scenePurposeCycle.period != null
    && scenePurposeCycle.rate >= 0.85
    && distinctScenePurposes.size >= 4
  ) {
    notes.push(`scenePurpose가 ${scenePurposeCycle.period}화 주기로 기계적으로 반복됨 ${scenePurposeCycle.rate}`);
  }
  if (distinctLocations.size < 3 && chapters.length >= 20) {
    notes.push(`전체 장소 변화 부족 ${distinctLocations.size}`);
  }
  if (windows.length >= 4 && dominantWindowPurposeRate >= 0.75) {
    notes.push(`장기 구간 주요 목적 쏠림 ${dominantWindowPurpose} ${dominantWindowPurposeCount}/${windows.length}`);
  }
  if (weakWindowCount > Math.max(0, Math.floor(windows.length * 0.25))) {
    notes.push(`약한 장기 구간 ${weakWindowCount}/${windows.length}`);
  }

  return {
    verdict: notes.length === 0 ? "pass" : "warn",
    windowSize,
    windowCount: windows.length,
    distinctScenePurposeCount: distinctScenePurposes.size,
    scenePurposeTransitionCount,
    scenePurposeCyclePeriod: scenePurposeCycle.period,
    scenePurposeCycleRate: scenePurposeCycle.rate,
    dominantWindowPurpose,
    dominantWindowPurposeCount,
    dominantWindowPurposeRate,
    distinctLocationCount: distinctLocations.size,
    highHeatChapterCount,
    weakWindowCount,
    windows,
    notes: notes.length === 0
      ? ["장기 구간에서 목적/장소/열감/왕복 상호작용의 변화가 확인됨"]
      : notes,
  };
}

function buildRuntimeContinuityReport(
  runtimeMindStates: Record<string, RuntimeMindState> | undefined,
): RuntimeContinuityReport {
  if (!runtimeMindStates) {
    return {
      available: false,
      verdict: "warn",
      characterCount: 0,
      charactersWithKnownFacts: 0,
      charactersWithRecentMemory: 0,
      charactersWithCurrentPlan: 0,
      charactersWithTrustDeltas: 0,
      totalKnownFacts: 0,
      totalRecentMemories: 0,
      averageKnownFacts: 0,
      averageRecentMemories: 0,
      minKnownFacts: 0,
      minRecentMemories: 0,
      maxKnownFacts: 0,
      maxRecentMemories: 0,
      uniqueCurrentPlans: 0,
      uniqueRecentMemorySignatures: 0,
      recentMemorySignatureDiversity: 0,
      notes: ["runtime-mind-states.json 없음: 장기 기억 누적을 확인하지 못함"],
      characters: [],
    };
  }

  const characters = Object.entries(runtimeMindStates).map(([fallbackId, state]) => {
    const knownFacts = state.knownFacts ?? [];
    const recentMemories = state.recentMemorySummaries ?? [];
    const trustDeltas = state.trustDeltasByCharacter ?? {};
    const recentMemorySignature = recentMemories.slice(-3).map(clean).filter(Boolean).join(" || ");
    return {
      characterId: clean(state.characterId || fallbackId),
      currentPlan: clean(state.currentPlan),
      knownFactCount: knownFacts.length,
      recentMemoryCount: recentMemories.length,
      visibleBehaviorCount: state.recentVisibleBehaviors?.length ?? 0,
      utteranceCount: state.recentUtterances?.length ?? 0,
      reflectionCount: state.reflectionNotes?.length ?? 0,
      proceduralMemoryCount: state.proceduralMemory?.length ?? 0,
      trustDeltaTargetCount: Object.keys(trustDeltas).length,
      recentMemorySignature,
      sampleKnownFacts: knownFacts.slice(-3).map((fact) => shorten(fact, 120)),
      sampleRecentMemories: recentMemories.slice(-3).map((memory) => shorten(memory, 120)),
    };
  });
  const knownFactCounts = characters.map((character) => character.knownFactCount);
  const recentMemoryCounts = characters.map((character) => character.recentMemoryCount);
  const charactersWithKnownFacts = characters.filter((character) => character.knownFactCount > 0).length;
  const charactersWithRecentMemory = characters.filter((character) => character.recentMemoryCount > 0).length;
  const charactersWithCurrentPlan = characters.filter((character) => character.currentPlan.length > 0).length;
  const charactersWithTrustDeltas = characters.filter((character) => character.trustDeltaTargetCount > 0).length;
  const uniqueCurrentPlans = new Set(characters.map((character) => character.currentPlan).filter(Boolean)).size;
  const recentMemorySignatures = characters.map((character) => character.recentMemorySignature).filter(Boolean);
  const uniqueRecentMemorySignatures = new Set(recentMemorySignatures).size;
  const recentMemorySignatureDiversity = characters.length === 0
    ? 0
    : round2(uniqueRecentMemorySignatures / characters.length);
  const notes: string[] = [];
  if (characters.length === 0) notes.push("runtime mind state 인물 0명");
  if (charactersWithKnownFacts < characters.length) {
    notes.push(`knownFacts 없는 인물 ${characters.length - charactersWithKnownFacts}명`);
  }
  if (charactersWithRecentMemory < characters.length) {
    notes.push(`recentMemorySummaries 없는 인물 ${characters.length - charactersWithRecentMemory}명`);
  }
  if (charactersWithCurrentPlan < characters.length) {
    notes.push(`currentPlan 없는 인물 ${characters.length - charactersWithCurrentPlan}명`);
  }
  if (characters.length >= 2 && charactersWithTrustDeltas === 0) {
    notes.push("trust delta 누적 인물 0명");
  }
  if (characters.length >= 3 && recentMemorySignatureDiversity < 0.6) {
    notes.push(`인물별 최근 기억 다양성 낮음 ${recentMemorySignatureDiversity}`);
  }

  return {
    available: true,
    verdict: notes.length === 0 ? "pass" : "warn",
    characterCount: characters.length,
    charactersWithKnownFacts,
    charactersWithRecentMemory,
    charactersWithCurrentPlan,
    charactersWithTrustDeltas,
    totalKnownFacts: knownFactCounts.reduce((sum, count) => sum + count, 0),
    totalRecentMemories: recentMemoryCounts.reduce((sum, count) => sum + count, 0),
    averageKnownFacts: round2(average(knownFactCounts)),
    averageRecentMemories: round2(average(recentMemoryCounts)),
    minKnownFacts: minOrZero(knownFactCounts),
    minRecentMemories: minOrZero(recentMemoryCounts),
    maxKnownFacts: maxOrZero(knownFactCounts),
    maxRecentMemories: maxOrZero(recentMemoryCounts),
    uniqueCurrentPlans,
    uniqueRecentMemorySignatures,
    recentMemorySignatureDiversity,
    notes: notes.length === 0
      ? ["모든 runtime mind state가 knownFacts/recentMemory/currentPlan을 보유하고 최근 기억 관점도 분리됨"]
      : notes,
    characters,
  };
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    const text = clean(value);
    if (text) output.push(text);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }
  for (const item of Object.values(value)) collectStrings(item, output);
  return output;
}

function particleIssueReason(stem: string, particle: string): string | null {
  const batchim = hasBatchim(stem);
  if (particle === "은" && !batchim) return "받침 없는 말 뒤에는 '는'이 자연스러움";
  if (particle === "는" && batchim) return "받침 있는 말 뒤에는 '은'이 자연스러움";
  if (particle === "이" && !batchim) return "받침 없는 말 뒤에는 '가'가 자연스러움";
  if (particle === "가" && batchim) return "받침 있는 말 뒤에는 '이'가 자연스러움";
  if (particle === "을" && !batchim) return "받침 없는 말 뒤에는 '를'이 자연스러움";
  if (particle === "를" && batchim) return "받침 있는 말 뒤에는 '을'이 자연스러움";
  if (particle === "과" && !batchim) return "받침 없는 말 뒤에는 '와'가 자연스러움";
  if (particle === "와" && batchim) return "받침 있는 말 뒤에는 '과'가 자연스러움";
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function characterParticleStems(input: {
  actions: ActionLog[];
  resolutions: InteractionResolution[];
  scenes: SceneLog[];
  runtimeMindStates?: Record<string, RuntimeMindState>;
}): string[] {
  const stems = new Set<string>();
  const addName = (name: unknown) => {
    const text = clean(name);
    if (!text || !/[가-힣]/u.test(text)) return;
    stems.add(text);
    const firstToken = text.split(/\s+/u)[0];
    if (firstToken && firstToken.length >= 2) stems.add(firstToken);
  };

  for (const action of input.actions) {
    addName(action.actorName);
    for (const name of action.targetNames ?? []) addName(name);
  }
  for (const resolution of input.resolutions) {
    addName(resolution.speechDraft?.speakerName);
    for (const name of resolution.speechDraft?.targetNames ?? []) addName(name);
    for (const interpretation of resolution.targetInterpretations ?? []) {
      addName(interpretation.characterName);
    }
  }
  for (const scene of input.scenes) {
    for (const turn of scene.dialogueTurns ?? []) addName(turn.speakerName);
  }
  for (const state of Object.values(input.runtimeMindStates ?? {})) {
    addName(state.characterId);
  }

  return [...stems].sort((left, right) => right.length - left.length);
}

function detectParticleIssues(text: string, stems: string[]): LanguageIntegrityIssue[] {
  const issues = new Map<string, LanguageIntegrityIssue>();
  for (const stem of stems) {
    for (const particle of ["은", "는", "이", "가", "을", "를", "과", "와"]) {
      const reason = particleIssueReason(stem, particle);
      if (!reason) continue;
      const pattern = new RegExp(`${escapeRegex(stem)}${particle}(?=[\\s,.;:!?()[\\]{}'"“”‘’]|$)`, "gu");
      const matches = text.match(pattern);
      if (!matches?.length) continue;
      const phrase = `${stem}${particle}`;
      const key = `${phrase}|${reason}`;
      const previous = issues.get(key);
      if (previous) {
        previous.count += matches.length;
      } else {
        issues.set(key, { text: phrase, reason, count: matches.length });
      }
    }
  }
  return [...issues.values()];
}

function buildLanguageIntegrityReport(input: {
  actions: ActionLog[];
  resolutions: InteractionResolution[];
  scenes: SceneLog[];
  runtimeMindStates?: Record<string, RuntimeMindState>;
}): LanguageIntegrityReport {
  const strings = [
    ...collectStrings(input.actions),
    ...collectStrings(input.resolutions),
    ...collectStrings(input.scenes),
    ...collectStrings(input.runtimeMindStates),
  ];
  const stems = characterParticleStems(input);
  const issueCounts = new Map<string, LanguageIntegrityIssue>();
  for (const text of strings) {
    for (const issue of detectParticleIssues(text, stems)) {
      const key = `${issue.text}|${issue.reason}`;
      const previous = issueCounts.get(key);
      if (previous) {
        previous.count += issue.count;
      } else {
        issueCounts.set(key, { ...issue });
      }
    }
  }
  const topParticleIssues = [...issueCounts.values()]
    .sort((left, right) => right.count - left.count || left.text.localeCompare(right.text, "ko"))
    .slice(0, 12);
  const particleIssueCount = topParticleIssues.reduce((sum, issue) => sum + issue.count, 0);

  return {
    verdict: particleIssueCount === 0 ? "pass" : "warn",
    scannedTextCount: strings.length,
    particleIssueCount,
    topParticleIssues,
    notes: particleIssueCount === 0
      ? ["내부 로그 문자열에서 기본 조사 오류가 발견되지 않음"]
      : [`내부 로그 문자열에서 기본 조사 오류 ${particleIssueCount}건 발견`],
  };
}

function buildMarkdown(report: ReportJson): string {
  const lines: string[] = [];
  const summary = report.summary;

  lines.push(`# 월드 로그 인과 사슬 리포트`);
  lines.push("");
  lines.push(`- 원본: \`${report.sourceRunDir}\``);
  lines.push(`- 범위: ${report.chapters.start}-${report.chapters.end}화 (${report.chapters.count}화)`);
  lines.push(`- 생성 시각: ${report.generatedAt}`);
  lines.push(`- LLM/API 비용: 0원 (기존 JSON만 분석)`);
  lines.push("");
  lines.push(`## 전체 판정`);
  lines.push("");
  lines.push(`- 행동 로그: ${summary.actionCount}개`);
  lines.push(`- 상호작용 해석: ${summary.resolutionCount}개`);
  lines.push(`- 장면 로그: ${summary.sceneCount}개`);
  lines.push(`- 누락: resolution ${summary.missingResolutionCount}, scene ${summary.missingSceneCount}, brain ${summary.missingBrainCount}, stateDelta ${summary.missingStateDeltaCount}, followUp ${summary.missingFollowUpCount}`);
  lines.push(`- 다음 행동 carry: ${summary.carriedNextPressureCount}/${summary.checkedNextPressureCount}`);
  lines.push(`- actor-target pair: ${summary.uniqueActorTargetPairs}개`);
  lines.push(`- GM 상태: ${Object.entries(summary.gmStatusCounts).map(([key, count]) => `${key} ${count}`).join(", ")}`);
  lines.push(`- 행동 타입: ${Object.entries(summary.actionTypeCounts).map(([key, count]) => `${key} ${count}`).join(", ")}`);
  lines.push(`- narrative heat: 평균 ${summary.narrativeHeat.averageScore}, 화별 최소 ${summary.narrativeHeat.minChapterScore}, 화별 최대 ${summary.narrativeHeat.maxChapterScore}, hot ${summary.narrativeHeat.hotActionCount}, cold ${summary.narrativeHeat.coldActionCount}`);
  lines.push(`- world-log readiness: ${summary.worldLogReadiness.verdict}, 평균 ${summary.worldLogReadiness.averageScore}, 화별 최소 ${summary.worldLogReadiness.minChapterScore}, dynamic action ${(summary.worldLogReadiness.dynamicActionRate * 100).toFixed(0)}%, reciprocal pair ${(summary.worldLogReadiness.reciprocalPairRatio * 100).toFixed(0)}%, weak chapter ${summary.worldLogReadiness.weakChapterCount}`);
  lines.push(`- runtime memory: ${summary.runtimeContinuity.verdict}, 인물 ${summary.runtimeContinuity.characterCount}명, knownFacts 평균 ${summary.runtimeContinuity.averageKnownFacts}, recentMemory 평균 ${summary.runtimeContinuity.averageRecentMemories}, 기억 다양성 ${(summary.runtimeContinuity.recentMemorySignatureDiversity * 100).toFixed(0)}%, currentPlan ${summary.runtimeContinuity.charactersWithCurrentPlan}/${summary.runtimeContinuity.characterCount}`);
  lines.push(`- interaction variety: ${summary.interactionVariety.verdict}, 감정 최빈 ${(summary.interactionVariety.topEmotionalResponseRate * 100).toFixed(0)}%, linePurpose 최빈 ${(summary.interactionVariety.topLinePurposeRate * 100).toFixed(0)}%, 목적 최빈 ${(summary.interactionVariety.topIntentPatternRate * 100).toFixed(0)}%`);
  lines.push(`- pressure lifecycle: ${summary.pressureLifecycle.verdict}, carry ${summary.pressureLifecycle.carriedCount}/${summary.pressureLifecycle.carryCandidateCount}, stalled ${summary.pressureLifecycle.stalledCarryCount}, open-end ${summary.pressureLifecycle.openAtRangeEndCount}`);
  lines.push(`- exact repetition: ${summary.textRepetition.verdict}, 대사 ${(summary.textRepetition.utteranceDuplicateRate * 100).toFixed(0)}%, follow-up ${(summary.textRepetition.followUpDuplicateRate * 100).toFixed(0)}%, 행동 ${(summary.textRepetition.visibleBehaviorDuplicateRate * 100).toFixed(0)}%, 반응 ${(summary.textRepetition.targetReactionDuplicateRate * 100).toFixed(0)}%`);
  lines.push(`- arc progression: ${summary.arcProgression.verdict}, 목적 ${summary.arcProgression.distinctScenePurposeCount}종/${summary.arcProgression.scenePurposeTransitionCount}전환, 주기 ${summary.arcProgression.scenePurposeCyclePeriod ?? "-"}화/${(summary.arcProgression.scenePurposeCycleRate * 100).toFixed(0)}%, 주요 목적 ${summary.arcProgression.dominantWindowPurpose} ${summary.arcProgression.dominantWindowPurposeCount}/${summary.arcProgression.windowCount}, 장소 ${summary.arcProgression.distinctLocationCount}종, 약한 구간 ${summary.arcProgression.weakWindowCount}/${summary.arcProgression.windowCount}`);
  lines.push(`- language integrity: ${summary.languageIntegrity.verdict}, 조사 오류 ${summary.languageIntegrity.particleIssueCount}건, 스캔 문자열 ${summary.languageIntegrity.scannedTextCount}개`);
  lines.push("");
  lines.push(`## 월드 로그 작동성`);
  lines.push("");
  lines.push(`이 점수는 로그가 단순히 시간순으로 연결됐는지가 아니라, 각 인물이 자기 목표로 행동하고 상대가 반응하며 그 결과가 기억/믿음/관계/계획 변화로 남는지를 봅니다.`);
  lines.push("");
  lines.push(`| 항목 | 값 | 의미 |`);
  lines.push(`| --- | ---: | --- |`);
  lines.push(`| 평균 interaction score | ${summary.worldLogReadiness.averageScore} | agency + consequence + renderability + social feedback 평균 |`);
  lines.push(`| 최저 화 interaction score | ${summary.worldLogReadiness.minChapterScore} | 가장 약한 화의 동적 상호작용 점수 |`);
  lines.push(`| dynamic action rate | ${(summary.worldLogReadiness.dynamicActionRate * 100).toFixed(0)}% | 상호작용 점수 0.65 이상 행동 비율 |`);
  lines.push(`| reciprocal pair ratio | ${(summary.worldLogReadiness.reciprocalPairRatio * 100).toFixed(0)}% | 화별 A→B/B→A 왕복 관계 비율의 평균 |`);
  lines.push(`| weak chapter | ${summary.worldLogReadiness.weakChapterCount} | interaction score 0.65 미만 또는 왕복성 낮은 화 수 |`);
  lines.push("");
  lines.push(`## 압력 생명주기`);
  lines.push("");
  lines.push(`이 항목은 follow-up pressure가 그냥 쌓이기만 하는지, 아니면 다음 행동의 관찰/판단으로 carry되는지 봅니다. 범위 마지막의 open pressure는 다음 범위로 이어질 수 있으므로 별도로 표시합니다.`);
  lines.push("");
  lines.push(`| 항목 | 값 | 의미 |`);
  lines.push(`| --- | ---: | --- |`);
  lines.push(`| verdict | ${summary.pressureLifecycle.verdict} | pressure carry 판정 |`);
  lines.push(`| total follow-up | ${summary.pressureLifecycle.totalFollowUps} | 다음 행동을 유발한 pressure 수 |`);
  lines.push(`| completed in origin | ${summary.pressureLifecycle.completedInOriginCount} | 같은 행동 안에서 plan이 완료된 수 |`);
  lines.push(`| carried | ${summary.pressureLifecycle.carriedCount}/${summary.pressureLifecycle.carryCandidateCount} | 다음 행동 observed로 넘어간 pressure 수 |`);
  lines.push(`| carry rate | ${(summary.pressureLifecycle.carryRate * 100).toFixed(0)}% | carry 후보 중 실제 carry 비율 |`);
  lines.push(`| completed or carried | ${(summary.pressureLifecycle.completedOrCarriedRate * 100).toFixed(0)}% | 완료 또는 다음 행동 carry로 처리된 비율 |`);
  lines.push(`| stalled carry | ${summary.pressureLifecycle.stalledCarryCount} | carry되어야 했는데 다음 행동에서 사라진 pressure |`);
  lines.push(`| open at range end | ${summary.pressureLifecycle.openAtRangeEndCount} | 리포트 범위 끝에 남은 열린 pressure |`);
  lines.push("");
  lines.push(`메모: ${summary.pressureLifecycle.notes.map((note) => escapeTableCell(note)).join("; ")}`);
  lines.push("");
  lines.push(`| 종류 | 반복 | 비율 | pressure |`);
  lines.push(`| --- | ---: | ---: | --- |`);
  for (const item of summary.pressureLifecycle.topStalledPressures) {
    lines.push(`| stalled | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  for (const item of summary.pressureLifecycle.topOpenPressures) {
    lines.push(`| open-end | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  if (
    summary.pressureLifecycle.topStalledPressures.length === 0
    && summary.pressureLifecycle.topOpenPressures.length === 0
  ) {
    lines.push(`| - | 0 | 0% | 없음 |`);
  }
  lines.push("");
  lines.push(`## 정확 반복 검출`);
  lines.push("");
  lines.push(`이 항목은 의미 패턴이 아니라, 실제로 같은 대사/행동/반응 문장이 반복되는지 봅니다. 정확 반복이 낮으면 월드 로그가 최소한 같은 문장을 복붙하듯 돌지는 않는다는 뜻입니다.`);
  lines.push("");
  lines.push(`| 항목 | 중복 | 비율 |`);
  lines.push(`| --- | ---: | ---: |`);
  lines.push(`| utterance | ${summary.textRepetition.utteranceDuplicateCount} | ${(summary.textRepetition.utteranceDuplicateRate * 100).toFixed(0)}% |`);
  lines.push(`| follow-up pressure | ${summary.textRepetition.followUpDuplicateCount} | ${(summary.textRepetition.followUpDuplicateRate * 100).toFixed(0)}% |`);
  lines.push(`| visible behavior | ${summary.textRepetition.visibleBehaviorDuplicateCount} | ${(summary.textRepetition.visibleBehaviorDuplicateRate * 100).toFixed(0)}% |`);
  lines.push(`| target reaction | ${summary.textRepetition.targetReactionDuplicateCount} | ${(summary.textRepetition.targetReactionDuplicateRate * 100).toFixed(0)}% |`);
  lines.push("");
  lines.push(`메모: ${summary.textRepetition.notes.map((note) => escapeTableCell(note)).join("; ")}`);
  lines.push("");
  lines.push(`| 종류 | 반복 | 비율 | 문장 |`);
  lines.push(`| --- | ---: | ---: | --- |`);
  for (const item of summary.textRepetition.topUtterances) {
    lines.push(`| utterance | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  for (const item of summary.textRepetition.topFollowUps) {
    lines.push(`| followUp | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  for (const item of summary.textRepetition.topVisibleBehaviors) {
    lines.push(`| visible | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  for (const item of summary.textRepetition.topTargetReactions) {
    lines.push(`| reaction | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  if (
    summary.textRepetition.topUtterances.length === 0
    && summary.textRepetition.topFollowUps.length === 0
    && summary.textRepetition.topVisibleBehaviors.length === 0
    && summary.textRepetition.topTargetReactions.length === 0
  ) {
    lines.push(`| - | 0 | 0% | 없음 |`);
  }
  lines.push("");
  lines.push(`## 상호작용 다양성`);
  lines.push("");
  lines.push(`이 항목은 세계가 논리적으로 이어지는 것과 별개로, 인물 반응/대화 목적/행동 목적이 너무 같은 문장으로 반복되는지 봅니다.`);
  lines.push("");
  lines.push(`| 항목 | 값 | 의미 |`);
  lines.push(`| --- | ---: | --- |`);
  lines.push(`| verdict | ${summary.interactionVariety.verdict} | 반복 쏠림 판정 |`);
  lines.push(`| emotional response unique | ${summary.interactionVariety.uniqueEmotionalResponses}/${summary.interactionVariety.totalEmotionalResponses} | 상대 감정 반응 종류/전체 |`);
  lines.push(`| top emotional response rate | ${(summary.interactionVariety.topEmotionalResponseRate * 100).toFixed(0)}% | 가장 많이 반복된 감정 반응 비율 |`);
  lines.push(`| linePurpose unique | ${summary.interactionVariety.uniqueLinePurposes}/${summary.interactionVariety.totalLinePurposes} | 대사 목적 종류/전체 |`);
  lines.push(`| top linePurpose rate | ${(summary.interactionVariety.topLinePurposeRate * 100).toFixed(0)}% | 가장 많이 반복된 대사 목적 비율 |`);
  lines.push(`| intent pattern unique | ${summary.interactionVariety.uniqueIntentPatterns}/${summary.interactionVariety.totalIntentPatterns} | 행동 목적 패턴 종류/전체 |`);
  lines.push(`| top intent pattern rate | ${(summary.interactionVariety.topIntentPatternRate * 100).toFixed(0)}% | 가장 많이 반복된 행동 목적 비율 |`);
  lines.push("");
  lines.push(`메모: ${summary.interactionVariety.notes.map((note) => escapeTableCell(note)).join("; ")}`);
  lines.push("");
  lines.push(`| 종류 | 반복 | 비율 | 문장 |`);
  lines.push(`| --- | ---: | ---: | --- |`);
  for (const item of summary.interactionVariety.topEmotionalResponses) {
    lines.push(`| emotionalResponse | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  for (const item of summary.interactionVariety.topLinePurposes) {
    lines.push(`| linePurpose | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  for (const item of summary.interactionVariety.topIntentPatterns) {
    lines.push(`| intentPattern | ${item.count} | ${(item.rate * 100).toFixed(0)}% | ${escapeTableCell(item.text)} |`);
  }
  lines.push("");
  lines.push(`## 장기 국면 진행`);
  lines.push("");
  lines.push(`이 항목은 300화 로그가 같은 종류의 장면을 반복하는지, 아니면 구간별로 목적/장소/열감/왕복성이 바뀌는지 봅니다.`);
  lines.push("");
  lines.push(`| 항목 | 값 | 의미 |`);
  lines.push(`| --- | ---: | --- |`);
  lines.push(`| verdict | ${summary.arcProgression.verdict} | 장기 진행 판정 |`);
  lines.push(`| window size | ${summary.arcProgression.windowSize}화 | 구간 평가 단위 |`);
  lines.push(`| scenePurpose 종류 | ${summary.arcProgression.distinctScenePurposeCount} | 전체 장면 목적 종류 |`);
  lines.push(`| scenePurpose 전환 | ${summary.arcProgression.scenePurposeTransitionCount} | 이전 화와 목적이 달라진 횟수 |`);
  lines.push(`| scenePurpose 주기성 | ${summary.arcProgression.scenePurposeCyclePeriod ?? "-"}화 / ${(summary.arcProgression.scenePurposeCycleRate * 100).toFixed(0)}% | 짧은 주기로 목적이 기계적으로 반복되는지 |`);
  lines.push(`| dominant window purpose | ${summary.arcProgression.dominantWindowPurposeCount}/${summary.arcProgression.windowCount} | 25화 구간의 주요 목적이 같은 비율: ${summary.arcProgression.dominantWindowPurpose} ${(summary.arcProgression.dominantWindowPurposeRate * 100).toFixed(0)}% |`);
  lines.push(`| location 종류 | ${summary.arcProgression.distinctLocationCount} | 전체 장소 종류 |`);
  lines.push(`| high heat chapter | ${summary.arcProgression.highHeatChapterCount} | heat 0.7 이상 화 수 |`);
  lines.push(`| weak window | ${summary.arcProgression.weakWindowCount}/${summary.arcProgression.windowCount} | 목적/장소/열감/왕복성이 약한 구간 |`);
  lines.push("");
  lines.push(`메모: ${summary.arcProgression.notes.map((note) => escapeTableCell(note)).join("; ")}`);
  lines.push("");
  lines.push(`| 구간 | 주요 목적 | 목적 종류 | 장소 종류 | heat | interaction | reciprocal | 판정 | 메모 |`);
  lines.push(`| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |`);
  for (const window of summary.arcProgression.windows) {
    lines.push([
      `| ${window.startChapter}-${window.endChapter}`,
      escapeTableCell(window.dominantScenePurpose),
      window.distinctScenePurposeCount,
      window.distinctLocationCount,
      window.averageHeat,
      window.averageInteraction,
      window.reciprocalPairRatio,
      window.verdict,
      escapeTableCell(window.notes.join("; ")),
    ].join(" | ") + " |");
  }
  lines.push("");
  lines.push(`## 언어 무결성`);
  lines.push("");
  lines.push(`이 항목은 내부 로그가 소설 문장으로 넘어가기 전에, 인물명에 붙은 기본 조사 오류 같은 기계적 잔재가 남는지 봅니다.`);
  lines.push("");
  lines.push(`| 항목 | 값 | 의미 |`);
  lines.push(`| --- | ---: | --- |`);
  lines.push(`| verdict | ${summary.languageIntegrity.verdict} | 내부 문자열 언어 무결성 판정 |`);
  lines.push(`| scanned text | ${summary.languageIntegrity.scannedTextCount} | 검사한 로그 문자열 수 |`);
  lines.push(`| particle issue | ${summary.languageIntegrity.particleIssueCount} | 인물명 기준 기본 조사 오류 수 |`);
  lines.push("");
  lines.push(`메모: ${summary.languageIntegrity.notes.map((note) => escapeTableCell(note)).join("; ")}`);
  lines.push("");
  lines.push(`| 표현 | 반복 | 이유 |`);
  lines.push(`| --- | ---: | --- |`);
  for (const issue of summary.languageIntegrity.topParticleIssues) {
    lines.push(`| ${escapeTableCell(issue.text)} | ${issue.count} | ${escapeTableCell(issue.reason)} |`);
  }
  if (summary.languageIntegrity.topParticleIssues.length === 0) {
    lines.push(`| - | 0 | 없음 |`);
  }
  lines.push("");
  lines.push(`## 장기 기억 작동성`);
  lines.push("");
  lines.push(`이 항목은 \`runtime-mind-states.json\`에 인물별 기억/믿음/현재 계획이 실제로 누적됐는지를 봅니다. \`simulation-state.json\`의 기본 memory store와 별개로, 현재 월드 모델의 행동 결정에 직접 들어가는 런타임 기억 저장소입니다.`);
  lines.push("");
  lines.push(`| 항목 | 값 | 의미 |`);
  lines.push(`| --- | ---: | --- |`);
  lines.push(`| verdict | ${summary.runtimeContinuity.verdict} | runtime mind state 누적 판정 |`);
  lines.push(`| character count | ${summary.runtimeContinuity.characterCount} | 추적 중인 인물 수 |`);
  lines.push(`| characters with knownFacts | ${summary.runtimeContinuity.charactersWithKnownFacts} | 의미 기억이 있는 인물 수 |`);
  lines.push(`| characters with recentMemory | ${summary.runtimeContinuity.charactersWithRecentMemory} | 최근 사건 기억이 있는 인물 수 |`);
  lines.push(`| characters with currentPlan | ${summary.runtimeContinuity.charactersWithCurrentPlan} | 현재 계획이 남은 인물 수 |`);
  lines.push(`| characters with trustDeltas | ${summary.runtimeContinuity.charactersWithTrustDeltas} | 관계 변화 누적이 있는 인물 수 |`);
  lines.push(`| avg knownFacts | ${summary.runtimeContinuity.averageKnownFacts} | 인물당 평균 의미 기억 수 |`);
  lines.push(`| avg recentMemory | ${summary.runtimeContinuity.averageRecentMemories} | 인물당 평균 최근 기억 수 |`);
  lines.push(`| unique currentPlans | ${summary.runtimeContinuity.uniqueCurrentPlans} | 인물별 현재 계획 다양성 |`);
  lines.push(`| unique recent memory signatures | ${summary.runtimeContinuity.uniqueRecentMemorySignatures} | 최근 3개 기억 묶음의 인물별 고유 패턴 수 |`);
  lines.push(`| recent memory diversity | ${(summary.runtimeContinuity.recentMemorySignatureDiversity * 100).toFixed(0)}% | 인물별 최근 기억이 서로 다르게 누적되는 비율 |`);
  lines.push("");
  lines.push(`메모: ${summary.runtimeContinuity.notes.map((note) => escapeTableCell(note)).join("; ")}`);
  lines.push("");
  lines.push(`| 인물 | currentPlan | knownFacts | recentMemory | trustTargets | memorySignature | 기억 샘플 |`);
  lines.push(`| --- | --- | ---: | ---: | ---: | --- | --- |`);
  for (const character of summary.runtimeContinuity.characters) {
    lines.push([
      `| ${escapeTableCell(character.characterId)}`,
      escapeTableCell(character.currentPlan),
      character.knownFactCount,
      character.recentMemoryCount,
      character.trustDeltaTargetCount,
      escapeTableCell(shorten(character.recentMemorySignature, 120)),
      escapeTableCell(character.sampleRecentMemories.join(" / ") || character.sampleKnownFacts.join(" / ")),
    ].join(" | ") + " |");
  }
  lines.push("");
  lines.push(`## 화별 요약`);
  lines.push("");
  lines.push(`| 화 | 제목 | 목적 | 행동 | heat | interaction | reciprocal | hot/cold | dynamic/weak | 판정 | 메모 |`);
  lines.push(`| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |`);
  for (const chapter of report.chaptersDetail) {
    lines.push([
      `| ${chapter.chapter}`,
      escapeTableCell(chapter.title),
      escapeTableCell(chapter.scenePurpose),
      chapter.actionCount,
      chapter.narrativeHeatScore,
      chapter.interactionScore,
      chapter.reciprocalPairRatio,
      `${chapter.hotActionCount}/${chapter.coldActionCount}`,
      `${chapter.dynamicActionCount}/${chapter.weakDynamicActionCount}`,
      chapter.verdict,
      escapeTableCell(chapter.notes.join("; ")),
    ].join(" | ") + " |");
  }
  lines.push("");
  lines.push(`## 재미 밀도 상위 행동`);
  lines.push("");
  lines.push(`| heat | 화/틱 | 주체 -> 대상 | 행동/GM | 근거 |`);
  lines.push(`| ---: | --- | --- | --- | --- |`);
  for (const row of [...report.rows].sort((left, right) => right.narrativeHeat.score - left.narrativeHeat.score).slice(0, 10)) {
    lines.push([
      `| ${row.narrativeHeat.score}`,
      `${row.chapter}/${row.tick ?? "-"}`,
      escapeTableCell(`${row.actor} -> ${row.targets.join(", ") || "-"}`),
      escapeTableCell(`${row.actionType}/${row.gmStatus}`),
      escapeTableCell(row.narrativeHeat.evidence.join(", ")),
    ].join(" | ") + " |");
  }
  lines.push("");
  lines.push(`## 재미 밀도 하위 행동`);
  lines.push("");
  lines.push(`| heat | 화/틱 | 주체 -> 대상 | 행동/GM | 보강 방향 |`);
  lines.push(`| ---: | --- | --- | --- | --- |`);
  for (const row of [...report.rows].sort((left, right) => left.narrativeHeat.score - right.narrativeHeat.score).slice(0, 10)) {
    const suggestions = [
      row.narrativeHeat.emotionalDensity < 0.45 ? "감정 변화" : undefined,
      row.narrativeHeat.reversalPotential < 0.35 ? "저항/반전" : undefined,
      row.narrativeHeat.socialSubtext < 0.55 ? "숨은 의도/오해" : undefined,
    ].filter(Boolean).join(", ");
    lines.push([
      `| ${row.narrativeHeat.score}`,
      `${row.chapter}/${row.tick ?? "-"}`,
      escapeTableCell(`${row.actor} -> ${row.targets.join(", ") || "-"}`),
      escapeTableCell(`${row.actionType}/${row.gmStatus}`),
      escapeTableCell(suggestions || "유지"),
    ].join(" | ") + " |");
  }
  lines.push("");
  lines.push(`## 상호작용 약한 행동`);
  lines.push("");
  lines.push(`| score | 화/틱 | 주체 -> 대상 | 행동/GM | 약한 지점 |`);
  lines.push(`| ---: | --- | --- | --- | --- |`);
  for (const row of [...report.rows].sort((left, right) => left.interactionDynamics.score - right.interactionDynamics.score).slice(0, 10)) {
    const suggestions = [
      row.interactionDynamics.agency < 0.75 ? "주체 의도/두뇌" : undefined,
      row.interactionDynamics.consequence < 0.65 ? "결과 변화" : undefined,
      row.interactionDynamics.renderability < 0.65 ? "소설화 단서" : undefined,
      row.interactionDynamics.socialFeedback < 0.55 ? "상대 반응" : undefined,
    ].filter(Boolean).join(", ");
    lines.push([
      `| ${row.interactionDynamics.score}`,
      `${row.chapter}/${row.tick ?? "-"}`,
      escapeTableCell(`${row.actor} -> ${row.targets.join(", ") || "-"}`),
      escapeTableCell(`${row.actionType}/${row.gmStatus}`),
      escapeTableCell(suggestions || "유지"),
    ].join(" | ") + " |");
  }
  lines.push("");
  lines.push(`## 행동별 인과 사슬`);
  lines.push("");
  lines.push(`| 화/틱 | heat | interaction | 주체 -> 대상 | 행동/GM | 의도 | 표면 행동 | 결과/다음 압력 | carry |`);
  lines.push(`| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |`);
  for (const row of report.rows) {
    const carry = row.nextPressureCarried == null ? "-" : (row.nextPressureCarried ? "yes" : "no");
    lines.push([
      `| ${row.chapter}/${row.tick ?? "-"}`,
      row.narrativeHeat.score,
      row.interactionDynamics.score,
      escapeTableCell(`${row.actor} -> ${row.targets.join(", ") || "-"}`),
      escapeTableCell(`${row.actionType}/${row.gmStatus}`),
      escapeTableCell(row.intent),
      escapeTableCell(row.visibleBehavior),
      escapeTableCell(`${row.targetReaction} / 다음: ${row.followUp}`),
      carry,
    ].join(" | ") + " |");
  }
  lines.push("");
  lines.push(`## 대사/해석 샘플`);
  lines.push("");
  for (const row of report.rows.slice(0, 12)) {
    lines.push(`- ${row.logId}: "${shorten(row.utterance, 120)}"`);
    lines.push(`  - 목적: ${shorten(row.intent, 120)}`);
    lines.push(`  - 상태 변화: ${row.stateDeltaDomains.join(", ") || "없음"}`);
  }
  lines.push("");
  lines.push(`## 읽는 법`);
  lines.push("");
  lines.push(`- carry가 yes면 이전 행동의 follow-up pressure가 다음 행동의 observed에 들어갔다는 뜻입니다.`);
  lines.push(`- completed plan은 이미 그 행동 안에서 해소된 것으로 보아 carry 분모에서 제외합니다.`);
  lines.push(`- GM 상태가 partial/backfired면 세계 조건이나 전제 조건 때문에 행동이 그대로 성공하지 않았다는 뜻입니다.`);
  lines.push(`- stateDelta가 있어야 로그가 단순 묘사가 아니라 기억/믿음/계획/관계/압력 변화로 남습니다.`);
  lines.push(`- narrative heat는 사건 밀도, 감정 변화, 반전 가능성, 숨은 의도/오해를 합친 검수용 점수입니다.`);
  lines.push(`- interaction score는 인물의 자율적 의도, 행동 결과, 소설화 가능한 단서, 상대 반응을 합친 월드 모델 작동성 점수입니다.`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const runDir = path.resolve(options.runDir);
  const outDir = path.resolve(options.outDir);
  const actions = readJson<ActionLog[]>(path.join(runDir, "action-logs.json"));
  const resolutions = readJson<InteractionResolution[]>(path.join(runDir, "interaction-resolutions.json"));
  const scenes = readSceneLogs(runDir);
  const runtimeMindStates = readRuntimeMindStates(runDir);
  const runtimeContinuity = buildRuntimeContinuityReport(runtimeMindStates);
  const selectedActions = actions.filter((action) =>
    action.chapter >= options.startChapter && action.chapter <= options.endChapter
  );
  const selectedResolutions = resolutions.filter((resolution) =>
    resolution.chapter >= options.startChapter && resolution.chapter <= options.endChapter
  );
  const selectedScenes = scenes.filter((scene) =>
    scene.chapter >= options.startChapter && scene.chapter <= options.endChapter
  );

  const resolutionsByActionId = new Map<string, InteractionResolution>();
  for (const resolution of resolutions) {
    for (const logId of resolution.sourceActionLogIds ?? []) {
      resolutionsByActionId.set(logId, resolution);
    }
  }
  const sceneActionIds = new Set(scenes.flatMap((scene) => scene.sourceActionLogIds ?? []));
  const rows = buildRows({ selectedActions, allActions: actions, resolutionsByActionId, sceneActionIds });
  const checkedCarryRows = rows.filter((row) => row.nextPressureCarried != null);
  const actorTargetPairs = new Set(rows.flatMap((row) =>
    row.targets.map((target) => `${row.actor}->${target}`)
  ));

  const chaptersDetail = selectedScenes.map((scene) => {
    const chapterRows = rows.filter((row) => row.chapter === scene.chapter);
    const verdict = chapterVerdict(chapterRows);
    return {
      chapter: scene.chapter,
      title: clean(scene.title || `chapter-${scene.chapter}`),
      scenePurpose: clean(scene.scenePurpose || "-"),
      actionCount: chapterRows.length,
      narrativeHeatScore: round2(average(chapterRows.map((row) => row.narrativeHeat.score))),
      interactionScore: round2(average(chapterRows.map((row) => row.interactionDynamics.score))),
      reciprocalPairRatio: reciprocalPairRatio(chapterRows),
      hotActionCount: chapterRows.filter((row) => row.narrativeHeat.score >= 0.7).length,
      coldActionCount: chapterRows.filter((row) => row.narrativeHeat.score < 0.45).length,
      dynamicActionCount: chapterRows.filter((row) => row.interactionDynamics.score >= 0.65).length,
      weakDynamicActionCount: chapterRows.filter((row) => row.interactionDynamics.score < 0.55).length,
      verdict: verdict.verdict,
      notes: verdict.notes,
    };
  });
  const chapterHeatScores = chaptersDetail.map((chapter) => chapter.narrativeHeatScore);
  const chapterInteractionScores = chaptersDetail.map((chapter) => chapter.interactionScore);
  const weakChapterCount = chaptersDetail.filter((chapter) =>
    chapter.interactionScore < 0.65 || (chapter.actionCount >= 4 && chapter.reciprocalPairRatio < 0.25)
  ).length;
  const dynamicActionRate = rows.length === 0
    ? 0
    : round2(rows.filter((row) => row.interactionDynamics.score >= 0.65).length / rows.length);
  const averageChapterReciprocalPairRatio = round2(average(chaptersDetail.map((chapter) =>
    chapter.reciprocalPairRatio
  )));
  const averageInteractionScore = round2(average(rows.map((row) => row.interactionDynamics.score)));
  const worldLogReadinessVerdict: "pass" | "warn" =
    averageInteractionScore >= 0.65
    && weakChapterCount === 0
    && averageChapterReciprocalPairRatio >= 0.25
      ? "pass"
      : "warn";
  const interactionVariety = buildInteractionVarietyReport({
    rows,
    resolutions: selectedResolutions,
  });
  const pressureLifecycle = buildPressureLifecycleReport(rows);
  const textRepetition = buildTextRepetitionReport(rows);
  const arcProgression = buildArcProgressionReport({
    chaptersDetail,
    scenes: selectedScenes,
    rows,
  });
  const languageIntegrity = buildLanguageIntegrityReport({
    actions: selectedActions,
    resolutions: selectedResolutions,
    scenes: selectedScenes,
    runtimeMindStates,
  });

  const report: ReportJson = {
    sourceRunDir: runDir,
    chapters: {
      start: options.startChapter,
      end: options.endChapter,
      count: options.endChapter - options.startChapter + 1,
    },
    generatedAt: new Date().toISOString(),
    summary: {
      actionCount: rows.length,
      resolutionCount: selectedResolutions.length,
      sceneCount: selectedScenes.length,
      missingResolutionCount: rows.filter((row) => !row.hasResolution).length,
      missingSceneCount: rows.filter((row) => !row.hasScene).length,
      missingBrainCount: rows.filter((row) => !row.hasBrain).length,
      missingStateDeltaCount: rows.filter((row) => !row.hasStateDeltas).length,
      missingFollowUpCount: rows.filter((row) => !row.hasFollowUp).length,
      checkedNextPressureCount: checkedCarryRows.length,
      carriedNextPressureCount: checkedCarryRows.filter((row) => row.nextPressureCarried).length,
      uniqueActorTargetPairs: actorTargetPairs.size,
      gmStatusCounts: countBy(rows, (row) => row.gmStatus),
      actionTypeCounts: countBy(rows, (row) => row.actionType),
      narrativeHeat: {
        averageScore: round2(average(rows.map((row) => row.narrativeHeat.score))),
        minChapterScore: round2(minOrZero(chapterHeatScores)),
        maxChapterScore: round2(maxOrZero(chapterHeatScores)),
        hotActionCount: rows.filter((row) => row.narrativeHeat.score >= 0.7).length,
        coldActionCount: rows.filter((row) => row.narrativeHeat.score < 0.45).length,
      },
      worldLogReadiness: {
        averageScore: averageInteractionScore,
        minChapterScore: round2(minOrZero(chapterInteractionScores)),
        dynamicActionRate,
        reciprocalPairRatio: averageChapterReciprocalPairRatio,
        weakChapterCount,
        verdict: worldLogReadinessVerdict,
      },
      runtimeContinuity,
      interactionVariety,
      pressureLifecycle,
      textRepetition,
      arcProgression,
      languageIntegrity,
    },
    rows,
    chaptersDetail,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const rangeSlug = `${String(options.startChapter).padStart(3, "0")}-${String(options.endChapter).padStart(3, "0")}`;
  const jsonPath = path.join(outDir, `causal-chain-report-${rangeSlug}.json`);
  const markdownPath = path.join(outDir, `causal-chain-report-${rangeSlug}.md`);
  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, buildMarkdown(report), "utf8");

  const hasBlockingGap = report.summary.missingResolutionCount > 0
    || report.summary.missingSceneCount > 0
    || report.summary.missingBrainCount > 0
    || report.summary.missingStateDeltaCount > 0
    || report.summary.missingFollowUpCount > 0;

  console.log("World log causal report complete");
  console.log(`  chapters: ${options.startChapter}-${options.endChapter}`);
  console.log(`  actions: ${report.summary.actionCount}`);
  console.log(`  missing: resolution=${report.summary.missingResolutionCount}, scene=${report.summary.missingSceneCount}, brain=${report.summary.missingBrainCount}, stateDelta=${report.summary.missingStateDeltaCount}, followUp=${report.summary.missingFollowUpCount}`);
  console.log(`  carry: ${report.summary.carriedNextPressureCount}/${report.summary.checkedNextPressureCount}`);
  console.log(`  readiness: ${report.summary.worldLogReadiness.verdict} score=${report.summary.worldLogReadiness.averageScore} dynamic=${report.summary.worldLogReadiness.dynamicActionRate} reciprocal=${report.summary.worldLogReadiness.reciprocalPairRatio}`);
  console.log(`  runtime memory: ${report.summary.runtimeContinuity.verdict} characters=${report.summary.runtimeContinuity.characterCount} avgKnown=${report.summary.runtimeContinuity.averageKnownFacts} avgRecent=${report.summary.runtimeContinuity.averageRecentMemories} diversity=${report.summary.runtimeContinuity.recentMemorySignatureDiversity}`);
  console.log(`  variety: ${report.summary.interactionVariety.verdict} emotionalTop=${report.summary.interactionVariety.topEmotionalResponseRate} lineTop=${report.summary.interactionVariety.topLinePurposeRate} intentTop=${report.summary.interactionVariety.topIntentPatternRate}`);
  console.log(`  pressure: ${report.summary.pressureLifecycle.verdict} carry=${report.summary.pressureLifecycle.carriedCount}/${report.summary.pressureLifecycle.carryCandidateCount} stalled=${report.summary.pressureLifecycle.stalledCarryCount} openEnd=${report.summary.pressureLifecycle.openAtRangeEndCount}`);
  console.log(`  exact repeats: ${report.summary.textRepetition.verdict} utterance=${report.summary.textRepetition.utteranceDuplicateRate} followUp=${report.summary.textRepetition.followUpDuplicateRate} visible=${report.summary.textRepetition.visibleBehaviorDuplicateRate} reaction=${report.summary.textRepetition.targetReactionDuplicateRate}`);
  console.log(`  arc: ${report.summary.arcProgression.verdict} purposes=${report.summary.arcProgression.distinctScenePurposeCount} transitions=${report.summary.arcProgression.scenePurposeTransitionCount} cycle=${report.summary.arcProgression.scenePurposeCyclePeriod ?? "-"}:${report.summary.arcProgression.scenePurposeCycleRate} dominant=${report.summary.arcProgression.dominantWindowPurpose}:${report.summary.arcProgression.dominantWindowPurposeCount}/${report.summary.arcProgression.windowCount} locations=${report.summary.arcProgression.distinctLocationCount} weakWindows=${report.summary.arcProgression.weakWindowCount}/${report.summary.arcProgression.windowCount}`);
  console.log(`  language: ${report.summary.languageIntegrity.verdict} particleIssues=${report.summary.languageIntegrity.particleIssueCount} scanned=${report.summary.languageIntegrity.scannedTextCount}`);
  console.log(`  markdown: ${markdownPath}`);
  console.log(`  json: ${jsonPath}`);

  if (hasBlockingGap) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
