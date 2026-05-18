import { z } from "zod";

import type { CharacterActionLog } from "@/lib/sim/character-action-sim";
import type { DialogueTurn, SceneLog } from "@/lib/sim/scene-log";

import type { EditorialBeatPlan, EditorialPlan, EditorialSceneSectionRole } from "./editorial-planner";
import type { WorldEpisodeWindow } from "./episode-selector";
import type { WorldLogEditorialMap, WorldLogSceneEditorialDecision } from "./world-log-editorial-map";

const StringListSchema = z.array(z.string());

export const CompressedEpisodePromptBeatSchema = z.object({
  sourceActionLogId: z.string(),
  sceneId: z.string(),
  tick: z.number().int().positive(),
  actorName: z.string(),
  targetNames: StringListSchema,
  actionType: z.string(),
  renderMode: z.string(),
  sectionRole: z.string(),
  editorialWeight: z.number().min(0).max(1),
  visibleBehavior: z.string(),
  effect: z.string(),
  followUpPressure: z.string(),
  relationshipSignal: z.string(),
  dialogueCue: z.string(),
  handling: z.string(),
});

export const CompressedEpisodePromptSceneSchema = z.object({
  sceneId: z.string(),
  chapter: z.number().int().positive(),
  title: z.string(),
  narrativeTreatment: z.string(),
  suggestedWordBudget: z.number().int().positive(),
  treatmentReasons: StringListSchema,
  location: z.string(),
  atmosphere: z.string(),
  sensoryAnchors: StringListSchema,
  sceneOutcome: z.string(),
  sourceActionLogIds: StringListSchema,
  detailedActionLogIds: StringListSchema,
  summarizedActionLogIds: StringListSchema,
  sectionMap: z.array(z.object({
    role: z.string(),
    sourceActionLogIds: StringListSchema,
    instruction: z.string(),
  })),
  dialogueHighlights: StringListSchema,
  detailedBeats: z.array(CompressedEpisodePromptBeatSchema),
  summaryBeats: StringListSchema,
});

export const CompressedEpisodePromptSourceSchema = z.object({
  episodeNumber: z.number().int().positive(),
  sourceSceneIds: StringListSchema,
  sourceActionLogIds: StringListSchema,
  scenes: z.array(CompressedEpisodePromptSceneSchema),
  diagnostics: z.object({
    sourceSceneCount: z.number().int().nonnegative(),
    sourceActionLogCount: z.number().int().nonnegative(),
    detailedActionLogCount: z.number().int().nonnegative(),
    summarizedActionLogCount: z.number().int().nonnegative(),
    coveredActionLogCount: z.number().int().nonnegative(),
    coveredActionLogRatio: z.number().min(0).max(1),
    promptSourceCharacterCount: z.number().int().nonnegative(),
  }),
});

export type CompressedEpisodePromptBeat = z.infer<typeof CompressedEpisodePromptBeatSchema>;
export type CompressedEpisodePromptScene = z.infer<typeof CompressedEpisodePromptSceneSchema>;
export type CompressedEpisodePromptSource = z.infer<typeof CompressedEpisodePromptSourceSchema>;

export interface CompressEpisodePromptSourceInput {
  episodeWindow: WorldEpisodeWindow;
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  editorialPlans: EditorialPlan[];
  worldLogEditorialMap?: WorldLogEditorialMap;
  maxDetailedActionLogs?: number;
  safe?: (value: string) => string;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function cleanPromptSurface(value: string): string {
  return value
    .replace(/[^.。\n]{0,30}공기가\s*한\s*박자\s*무겁게\s*가라앉는다/g, "")
    .replace(/[^.。\n]{0,30}공기(?:는|가)?\s*무겁게\s*가라앉는다/g, "")
    .replace(/[^.。\n]{0,30}이\/가\s*[^.。\n]{0,30}에게\s*반응할\s*이유가\s*생긴다/g, "")
    .replace(/[^.。\n]{0,30}은\/는\s*[^.。\n]{0,30}의\s*행동을\s*즉시\s*믿지\s*않고\s*다음\s*반응을\s*준비한다/g, "")
    .replace(/[^.。\n]{0,30}가\s*바로\s*답하지\s*않는\s*짧은\s*침묵/g, "짧은 침묵")
    .replace(/움직임만\s*좇는다/g, "시선을 좇는다")
    .replace(/다음\s*반응을\s*준비한다/g, "대답을 미룬다")
    .replace(/\s+/g, " ")
    .trim();
}

function actionLogsForScene(sceneLog: SceneLog, actionLogs: CharacterActionLog[]): CharacterActionLog[] {
  const sourceIds = new Set(sceneLog.sourceActionLogIds);
  const bySourceIds = actionLogs.filter((log) => sourceIds.has(log.logId));
  if (bySourceIds.length > 0) return bySourceIds;
  return actionLogs.filter((log) => log.chapter === sceneLog.chapter);
}

function dialogueTurnByActionLogId(sceneLog: SceneLog): Map<string, DialogueTurn> {
  const result = new Map<string, DialogueTurn>();
  for (const turn of sceneLog.dialogueTurns) {
    for (const logId of turn.sourceActionLogIds) {
      result.set(logId, turn);
    }
  }
  return result;
}

function beatPlanByActionLogId(editorialPlans: EditorialPlan[]): Map<string, EditorialBeatPlan> {
  const result = new Map<string, EditorialBeatPlan>();
  for (const plan of editorialPlans) {
    for (const beat of plan.beatPlans) {
      result.set(beat.sourceActionLogId, beat);
    }
  }
  return result;
}

function sectionRoleByActionLogId(editorialPlans: EditorialPlan[]): Map<string, EditorialSceneSectionRole> {
  const result = new Map<string, EditorialSceneSectionRole>();
  for (const plan of editorialPlans) {
    for (const section of plan.sceneSections) {
      for (const logId of section.sourceActionLogIds) {
        result.set(logId, section.role);
      }
    }
  }
  return result;
}

function sceneDecisionBySceneId(
  map: WorldLogEditorialMap | undefined,
): Map<string, WorldLogSceneEditorialDecision> {
  return new Map((map?.chapters ?? []).map((chapter) => [chapter.sceneId, chapter]));
}

function relationshipSignal(log: CharacterActionLog): string {
  const entries = Object.entries(log.trustDeltas)
    .filter(([, delta]) => delta !== 0)
    .map(([characterId, delta]) => `${characterId}:${delta > 0 ? "+" : ""}${delta}`);
  return entries.length > 0 ? entries.join(", ") : "변화 없음";
}

function dialogueCue(turn: DialogueTurn | undefined, safe: (value: string) => string): string {
  if (!turn) return "대사 없음: 행동/침묵/시선으로만 처리";
  const hooks = turn.interactionDynamics?.writerHooks;
  const sensoryCue = cleanPromptSurface(hooks?.sensoryCue ?? "");
  return [
    `act=${turn.speechAct}`,
    turn.utterance ? `line=${safe(truncate(cleanPromptSurface(turn.utterance), 36))}` : "",
    hooks?.linePurpose ? `purpose=${safe(truncate(cleanPromptSurface(hooks.linePurpose), 30))}` : "",
    hooks?.gesture ? `gesture=${safe(truncate(cleanPromptSurface(hooks.gesture), 30))}` : "",
    hooks?.silence ? `silence=${safe(truncate(cleanPromptSurface(hooks.silence), 24))}` : "",
    sensoryCue ? `sensory=${safe(truncate(sensoryCue, 24))}` : "",
  ].filter(Boolean).join(" / ");
}

function summaryBeat(log: CharacterActionLog, safe: (value: string) => string): string {
  const effect = cleanPromptSurface(log.actualEffect.targetReaction)
    || cleanPromptSurface(log.actualEffect.followUpActionSeed)
    || "상대가 대답을 미룬다";
  return [
    `[${log.logId}]`,
    `t${log.tick}`,
    `${log.actorName}->${log.targetNames.join(",") || "장면"}`,
    log.action.type,
    `표면=${safe(truncate(cleanPromptSurface(log.visibleBehavior), 34))}`,
    `결과=${safe(truncate(effect, 34))}`,
  ].join(" | ");
}

function detailQuota(totalActionLogCount: number, sceneCount: number, requested?: number): number {
  if (typeof requested === "number") {
    return Math.max(sceneCount, Math.min(totalActionLogCount, requested));
  }
  const ratioQuota = Math.ceil(totalActionLogCount * 0.22);
  const sceneQuota = Math.max(sceneCount * 2, sceneCount);
  return Math.max(sceneCount, Math.min(totalActionLogCount, Math.max(ratioQuota, sceneQuota)));
}

function minimumDetailedCountForScene(decision?: WorldLogSceneEditorialDecision): number {
  if (!decision) return 1;
  if (decision.narrativeTreatment === "full_scene") return 2;
  if (decision.narrativeTreatment === "expanded_scene") return 1;
  if (decision.narrativeTreatment === "compressed_scene") return 1;
  return 1;
}

function selectDetailedActionLogIds(input: {
  sceneLogs: SceneLog[];
  actionLogs: CharacterActionLog[];
  editorialPlans: EditorialPlan[];
  worldLogEditorialMap?: WorldLogEditorialMap;
  maxDetailedActionLogs?: number;
}): Set<string> {
  const quota = detailQuota(input.actionLogs.length, input.sceneLogs.length, input.maxDetailedActionLogs);
  const beatById = beatPlanByActionLogId(input.editorialPlans);
  const roleById = sectionRoleByActionLogId(input.editorialPlans);
  const decisionsBySceneId = sceneDecisionBySceneId(input.worldLogEditorialMap);
  const selected = new Set<string>();

  for (const sceneLog of input.sceneLogs) {
    const sceneActionLogs = actionLogsForScene(sceneLog, input.actionLogs);
    const decision = decisionsBySceneId.get(sceneLog.sceneId);
    const ranked = sceneActionLogs.slice().sort((a, b) => {
      const beatA = beatById.get(a.logId);
      const beatB = beatById.get(b.logId);
      const keyA = decision?.keyActionLogIds.includes(a.logId) ? 0.1 : 0;
      const keyB = decision?.keyActionLogIds.includes(b.logId) ? 0.1 : 0;
      return ((beatB?.editorialWeight ?? 0) + keyB) - ((beatA?.editorialWeight ?? 0) + keyA) || a.tick - b.tick;
    });
    for (const log of ranked.slice(0, minimumDetailedCountForScene(decision))) {
      selected.add(log.logId);
    }
  }

  const priority = input.actionLogs.slice().sort((a, b) => {
    const beatA = beatById.get(a.logId);
    const beatB = beatById.get(b.logId);
    const roleA = roleById.get(a.logId) === "inflection" ? 0.08 : 0;
    const roleB = roleById.get(b.logId) === "inflection" ? 0.08 : 0;
    const scoreA = (beatA?.editorialWeight ?? 0.35) + roleA + (beatA?.dialoguePriority === "high" ? 0.05 : 0);
    const scoreB = (beatB?.editorialWeight ?? 0.35) + roleB + (beatB?.dialoguePriority === "high" ? 0.05 : 0);
    return scoreB - scoreA || a.tick - b.tick || a.logId.localeCompare(b.logId);
  });

  for (const log of priority) {
    if (selected.size >= quota) break;
    const beat = beatById.get(log.logId);
    if (
      beat?.renderMode === "spotlight"
      || beat?.renderMode === "expanded"
      || beat?.dialoguePriority === "high"
      || roleById.get(log.logId) === "inflection"
    ) {
      selected.add(log.logId);
    }
  }

  for (const log of priority) {
    if (selected.size >= quota) break;
    selected.add(log.logId);
  }

  return selected;
}

function formatSource(source: CompressedEpisodePromptSource): string {
  return [
    `coverage:${source.diagnostics.coveredActionLogCount}/${source.diagnostics.sourceActionLogCount}`,
    `detail:${source.diagnostics.detailedActionLogCount},summary:${source.diagnostics.summarizedActionLogCount}`,
      ``,
      ...source.scenes.map((scene) => [
        `## Scene ${scene.sceneId} / ch${scene.chapter} / ${scene.title}`,
      `편집 처리: ${scene.narrativeTreatment}/${scene.suggestedWordBudget}자`,
      `장소: ${scene.location} / ${scene.atmosphere}`,
      `감각: ${scene.sensoryAnchors.join(", ") || "없음"}`,
      `결과: ${scene.sceneOutcome}`,
      `ids: D(${scene.detailedActionLogIds.join(", ") || "없음"}) / S(${scene.summarizedActionLogIds.join(", ") || "없음"})`,
      ``,
      `### Section Map`,
      scene.sectionMap.map((section) =>
        `- ${section.role} [${section.sourceActionLogIds.join(", ")}]: ${section.instruction}`
      ).join("\n") || "- 없음",
      ``,
      `### Detailed Beats`,
      scene.detailedBeats.map((beat) => [
        `- [${beat.sourceActionLogId}] t${beat.tick} ${beat.actorName}->${beat.targetNames.join(", ") || "장면"} / ${beat.actionType}`,
        `  mode=${beat.renderMode}/${beat.sectionRole}/${beat.editorialWeight}`,
        `  표면=${beat.visibleBehavior} / 결과=${beat.effect}`,
        `  압력=${beat.followUpPressure} / 관계=${beat.relationshipSignal}`,
        `  대사=${beat.dialogueCue} / 처리=${beat.handling}`,
      ].join("\n")).join("\n") || "- 없음",
      ``,
      `### Summary Beats`,
      scene.summaryBeats.map((beat) => `- ${beat}`).join("\n") || "- 없음",
      ``,
      `### Dialogue Highlights`,
      scene.dialogueHighlights.map((highlight) => `- ${highlight}`).join("\n") || "- 없음",
    ].join("\n")),
  ].join("\n");
}

export function compressEpisodePromptSource(
  input: CompressEpisodePromptSourceInput,
): CompressedEpisodePromptSource {
  const safe = input.safe ?? ((value: string): string => value);
  const detailedIds = selectDetailedActionLogIds(input);
  const beatById = beatPlanByActionLogId(input.editorialPlans);
  const roleById = sectionRoleByActionLogId(input.editorialPlans);
  const decisionsBySceneId = sceneDecisionBySceneId(input.worldLogEditorialMap);
  const sourceActionLogIds = input.actionLogs.map((log) => log.logId);

  const scenes = input.sceneLogs.map((sceneLog) => {
    const sceneActionLogs = actionLogsForScene(sceneLog, input.actionLogs);
    const turnsByLogId = dialogueTurnByActionLogId(sceneLog);
    const plan = input.editorialPlans.find((candidate) => candidate.sceneId === sceneLog.sceneId);
    const decision = decisionsBySceneId.get(sceneLog.sceneId);
    const detailedBeats = sceneActionLogs
      .filter((log) => detailedIds.has(log.logId))
      .map((log) => {
        const beat = beatById.get(log.logId);
        return CompressedEpisodePromptBeatSchema.parse({
          sourceActionLogId: log.logId,
          sceneId: log.sceneId,
          tick: log.tick,
          actorName: log.actorName,
          targetNames: log.targetNames,
          actionType: log.action.type,
          renderMode: beat?.renderMode ?? "normal",
          sectionRole: roleById.get(log.logId) ?? "unsectioned",
          editorialWeight: clamp(beat?.editorialWeight ?? 0.35),
          visibleBehavior: safe(truncate(cleanPromptSurface(log.visibleBehavior), 46)),
          effect: safe(truncate(cleanPromptSurface(log.actualEffect.targetReaction) || "상대가 대답을 미룬다", 46)),
          followUpPressure: safe(truncate(cleanPromptSurface(log.actualEffect.followUpActionSeed) || "다음 직접 행동을 유발한다", 46)),
          relationshipSignal: relationshipSignal(log),
          dialogueCue: dialogueCue(turnsByLogId.get(log.logId), safe),
          handling: safe(truncate(beat?.handling ?? "원인/결과가 보이게 처리한다.", 30)),
        });
      });
    const summaryBeats = sceneActionLogs
      .filter((log) => !detailedIds.has(log.logId))
      .map((log) => summaryBeat(log, safe));
    const detailedActionLogIds = detailedBeats.map((beat) => beat.sourceActionLogId);
    const summarizedActionLogIds = sceneActionLogs
      .filter((log) => !detailedIds.has(log.logId))
      .map((log) => log.logId);
    const dialogueHighlights = sceneLog.dialogueTurns
      .filter((turn) => turn.sourceActionLogIds.some((logId) => detailedIds.has(logId)))
      .slice(0, 4)
      .map((turn) => dialogueCue(turn, safe));

    return CompressedEpisodePromptSceneSchema.parse({
      sceneId: sceneLog.sceneId,
      chapter: sceneLog.chapter,
      title: safe(truncate(sceneLog.title, 40)),
      narrativeTreatment: decision?.narrativeTreatment ?? "normal",
      suggestedWordBudget: decision?.suggestedWordBudget ?? plan?.totalSuggestedWordBudget ?? 600,
      treatmentReasons: (decision?.reasons ?? ["장면 내부 editorial plan 기준으로 처리"]).map((reason) =>
          safe(truncate(reason, 44))
      ),
      location: safe(truncate(sceneLog.location, 44)),
      atmosphere: safe(truncate(sceneLog.atmosphere, 44)),
      sensoryAnchors: sceneLog.sensoryAnchors.map((anchor) => safe(truncate(anchor, 24))).slice(0, 3),
      sceneOutcome: safe(truncate(cleanPromptSurface(sceneLog.sceneOutcome), 82)),
      sourceActionLogIds: sceneActionLogs.map((log) => log.logId),
      detailedActionLogIds,
      summarizedActionLogIds,
      sectionMap: (plan?.sceneSections ?? []).map((section) => ({
        role: section.role,
        sourceActionLogIds: section.sourceActionLogIds,
        instruction: safe(truncate(section.renderInstruction, 54)),
      })),
      dialogueHighlights: unique(dialogueHighlights).slice(0, 3),
      detailedBeats,
      summaryBeats,
    });
  });

  const coveredIds = unique(scenes.flatMap((scene) => [
    ...scene.detailedActionLogIds,
    ...scene.summarizedActionLogIds,
  ]));
  const sourceWithoutDiagnostics = CompressedEpisodePromptSourceSchema.omit({ diagnostics: true }).parse({
    episodeNumber: input.episodeWindow.episodeNumber,
    sourceSceneIds: input.sceneLogs.map((sceneLog) => sceneLog.sceneId),
    sourceActionLogIds,
    scenes,
  });
  const formatted = formatSource({
    ...sourceWithoutDiagnostics,
    diagnostics: {
      sourceSceneCount: input.sceneLogs.length,
      sourceActionLogCount: sourceActionLogIds.length,
      detailedActionLogCount: sourceActionLogIds.filter((id) => detailedIds.has(id)).length,
      summarizedActionLogCount: sourceActionLogIds.filter((id) => !detailedIds.has(id)).length,
      coveredActionLogCount: coveredIds.length,
      coveredActionLogRatio: clamp(coveredIds.length / Math.max(1, sourceActionLogIds.length)),
      promptSourceCharacterCount: 0,
    },
  });

  return CompressedEpisodePromptSourceSchema.parse({
    ...sourceWithoutDiagnostics,
    diagnostics: {
      sourceSceneCount: input.sceneLogs.length,
      sourceActionLogCount: sourceActionLogIds.length,
      detailedActionLogCount: sourceActionLogIds.filter((id) => detailedIds.has(id)).length,
      summarizedActionLogCount: sourceActionLogIds.filter((id) => !detailedIds.has(id)).length,
      coveredActionLogCount: coveredIds.length,
      coveredActionLogRatio: clamp(coveredIds.length / Math.max(1, sourceActionLogIds.length)),
      promptSourceCharacterCount: formatted.length,
    },
  });
}

export function formatCompressedEpisodePromptSource(source: CompressedEpisodePromptSource): string {
  return formatSource(source);
}
