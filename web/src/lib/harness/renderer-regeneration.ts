import { createHash } from "node:crypto";

import type { TrackingInjection } from "@/lib/agents/pipeline";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { DirectionDesign } from "@/lib/schema/direction";
import type { ChapterBlueprint } from "@/lib/schema/planning";
import type { ChapterWorldState } from "@/lib/memory/world-state";
import {
  parseSimulationEvent,
  type RetroactiveCorrectionPlan,
  type SimulationCausalLedger,
  type SimulationEvent,
  type SimulationState,
} from "@/lib/sim";
import {
  buildRendererNarrativeStateIdentityManifest,
  type RendererNarrativeStateIdentityManifest,
  type RendererNarrativeStateImmutabilityReport,
} from "./renderer-state-identity";

export interface RendererRegenerationFailureContext {
  summary: string;
  failedText?: string;
  issues?: string[];
  preserve?: string[];
  avoid?: string[];
  notes?: string;
}

export interface RendererSceneTextSnapshot {
  sceneIndex: number;
  sceneId: string;
  text: string;
  sha256: string;
  byteLength: number;
}

export interface RendererScopedSceneRegenerationScope {
  mode: "scoped_scene_patch";
  impactedSceneIds: string[];
  impactedSceneIndexes: number[];
  preservedSceneIds: string[];
  preservedSceneIndexes: number[];
  ledgerEventIds: string[];
  allowChapterRewrite: false;
}

export interface RendererFullChapterRegenerationScope {
  mode: "full_chapter";
  allowChapterRewrite: true;
}

export type RendererRegenerationScope =
  | RendererScopedSceneRegenerationScope
  | RendererFullChapterRegenerationScope;

export interface RendererSceneByteStabilityComparison {
  sceneId: string;
  sceneIndex: number;
  baselineSha256: string;
  finalSha256: string;
  baselineByteLength: number;
  finalByteLength: number;
  byteStable: boolean;
}

export interface RendererProseStabilityReport {
  schemaVersion: "renderer_prose_stability.v1";
  mode: RendererRegenerationScope["mode"];
  byteStable: boolean;
  unrestrictedRewriteBlocked: boolean;
  impactedSceneIds: string[];
  preservedSceneIds: string[];
  preservedSceneComparisons: RendererSceneByteStabilityComparison[];
}

export interface RendererNarrativeStateSnapshot {
  chapterNumber: number;
  blueprint: ChapterBlueprint;
  previousSummaries: Array<{
    chapter: number;
    title: string;
    summary: string;
  }>;
  previousChapterEnding?: string;
  previousSceneState?: ChapterSummary["ending_scene_state"];
  trackingContext?: TrackingInjection;
  directionDesign?: DirectionDesign;
  simulationState: SimulationState;
  worldStateProjection?: ChapterWorldState[];
  stateIdentity?: RendererNarrativeStateIdentityManifest;
  renderedScenes?: RendererSceneTextSnapshot[];
}

export interface RendererRegenerationRequest {
  snapshot: RendererNarrativeStateSnapshot;
  proseFailureContext: RendererRegenerationFailureContext;
  regenerationScope?: RendererRegenerationScope;
  immutabilityReport?: RendererNarrativeStateImmutabilityReport;
  proseStabilityReport?: RendererProseStabilityReport;
}

export interface CreateRendererRegenerationRequestOptions {
  proseFailureContext?: RendererRegenerationFailureContext;
  sceneTexts?: string[];
}

export interface CreateLedgerScopedRendererRegenerationRequestOptions
  extends CreateRendererRegenerationRequestOptions {
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>;
  correctionPlan: Pick<RetroactiveCorrectionPlan, "replayScope">;
}

export function createRendererRegenerationRequest(
  snapshot: RendererNarrativeStateSnapshot,
  options: CreateRendererRegenerationRequestOptions = {},
): RendererRegenerationRequest {
  const snapshotWithIdentity = ensureRendererNarrativeStateSnapshotIdentity({
    ...snapshot,
    renderedScenes: options.sceneTexts
      ? createRendererSceneSnapshots(snapshot.chapterNumber, options.sceneTexts)
      : snapshot.renderedScenes,
  });

  return {
    snapshot: snapshotWithIdentity,
    proseFailureContext: options.proseFailureContext ?? {
      summary: "저장된 narrative state에서 prose만 다시 렌더링합니다.",
      notes:
        "기존 objective facts, memory, belief, utterance, event ledger, continuity projection은 읽기 전용입니다.",
    },
    regenerationScope: buildDefaultRendererRegenerationScope(),
  };
}

export function createLedgerScopedRendererRegenerationRequest(
  snapshot: RendererNarrativeStateSnapshot,
  options: CreateLedgerScopedRendererRegenerationRequestOptions,
): RendererRegenerationRequest {
  const baseRequest = createRendererRegenerationRequest(snapshot, options);
  return {
    ...baseRequest,
    regenerationScope: buildScopedRendererRegenerationScope(
      baseRequest.snapshot,
      collectImpactedSceneIdsFromLedger(
        snapshot.chapterNumber,
        options.ledger,
        options.correctionPlan,
      ),
      options.correctionPlan.replayScope.eventIds,
    ),
  };
}

export function ensureRendererNarrativeStateSnapshotIdentity(
  snapshot: RendererNarrativeStateSnapshot,
): RendererNarrativeStateSnapshot {
  return {
    ...snapshot,
    stateIdentity: snapshot.stateIdentity
      ?? buildRendererNarrativeStateIdentityManifest({
        simulationState: snapshot.simulationState,
        worldStateProjection: snapshot.worldStateProjection,
      }),
  };
}

export function createRendererSceneSnapshots(
  chapterNumber: number,
  sceneTexts: ReadonlyArray<string>,
): RendererSceneTextSnapshot[] {
  return sceneTexts.map((text, sceneIndex) => {
    const normalizedText = text.trim();
    return {
      sceneIndex,
      sceneId: buildRendererSceneId(chapterNumber, sceneIndex),
      text: normalizedText,
      sha256: hashRendererSceneText(normalizedText),
      byteLength: Buffer.byteLength(normalizedText, "utf8"),
    };
  });
}

export function attachRendererSceneSnapshots(
  request: RendererRegenerationRequest,
  sceneTexts: ReadonlyArray<string>,
): RendererRegenerationRequest {
  const snapshot = ensureRendererNarrativeStateSnapshotIdentity({
    ...request.snapshot,
    renderedScenes: createRendererSceneSnapshots(
      request.snapshot.chapterNumber,
      sceneTexts,
    ),
  });

  const regenerationScope = request.regenerationScope
    ? normalizeRendererRegenerationScope(request.regenerationScope, snapshot)
    : buildDefaultRendererRegenerationScope();

  return {
    ...request,
    snapshot,
    regenerationScope,
  };
}

export function normalizeRendererRegenerationRequest(
  request: RendererRegenerationRequest,
): RendererRegenerationRequest {
  const snapshot = ensureRendererNarrativeStateSnapshotIdentity(request.snapshot);

  return {
    ...request,
    snapshot,
    regenerationScope: request.regenerationScope
      ? normalizeRendererRegenerationScope(request.regenerationScope, snapshot)
      : buildDefaultRendererRegenerationScope(),
  };
}

export function formatRendererRegenerationCorrectionContext(
  failureContext: RendererRegenerationFailureContext,
): string {
  const lines: string[] = [
    "## 렌더러 재생성 지시",
    "- 이 요청은 prose 렌더링 실패 수정 전용입니다. 플롯, 블루프린트, 사건 순서, 캐논 상태를 다시 계획하거나 바꾸지 마세요.",
    `- 실패 요약: ${failureContext.summary}`,
  ];

  if (failureContext.issues?.length) {
    lines.push("- 해결해야 할 prose 문제:");
    for (const issue of failureContext.issues) {
      lines.push(`  - ${issue}`);
    }
  }

  if (failureContext.preserve?.length) {
    lines.push("- 반드시 보존할 요소:");
    for (const item of failureContext.preserve) {
      lines.push(`  - ${item}`);
    }
  }

  if (failureContext.avoid?.length) {
    lines.push("- 이번 재생성에서 피할 것:");
    for (const item of failureContext.avoid) {
      lines.push(`  - ${item}`);
    }
  }

  if (failureContext.notes) {
    lines.push(`- 추가 메모: ${failureContext.notes}`);
  }

  if (failureContext.failedText) {
    lines.push("- 실패한 기존 prose는 참고만 하세요. 같은 문장을 반복하지 말고 더 나은 표현으로 다시 쓰세요.");
    lines.push("");
    lines.push("### 실패한 기존 prose");
    lines.push(failureContext.failedText);
  }

  return lines.join("\n");
}

export function formatRendererScopedRegenerationContext(
  snapshot: RendererNarrativeStateSnapshot,
  scope: RendererScopedSceneRegenerationScope,
): string {
  const lines = [
    "## 씬 범위 고정",
    `- 이번 재생성에서 다시 쓸 수 있는 씬: ${scope.impactedSceneIds.join(", ")}`,
    `- 바꾸면 안 되는 보존 씬: ${scope.preservedSceneIds.length > 0 ? scope.preservedSceneIds.join(", ") : "(없음)"}`,
    "- 허용된 씬만 다시 쓰고, 나머지 씬은 문장 하나도 건드리지 않습니다.",
    "- 장면 순서를 바꾸거나 새 씬을 추가하지 마세요.",
  ];

  if (snapshot.renderedScenes?.length) {
    const precedingScene = scope.impactedSceneIndexes[0] !== undefined
      ? snapshot.renderedScenes[scope.impactedSceneIndexes[0] - 1]
      : undefined;
    const followingScene = scope.impactedSceneIndexes.at(-1) !== undefined
      ? snapshot.renderedScenes[(scope.impactedSceneIndexes.at(-1) ?? 0) + 1]
      : undefined;

    if (precedingScene) {
      lines.push(`- 직전 보존 씬 ${precedingScene.sceneId} 말미 흐름: ${truncateRendererSceneText(precedingScene.text)}`);
    }

    if (followingScene) {
      lines.push(`- 직후 보존 씬 ${followingScene.sceneId} 시작 흐름: ${truncateRendererSceneText(followingScene.text)}`);
    }
  }

  return lines.join("\n");
}

export function buildRendererProseStabilityReport(input: {
  baselineScenes: ReadonlyArray<RendererSceneTextSnapshot>;
  finalSceneTexts: ReadonlyArray<string>;
  regenerationScope: RendererRegenerationScope;
}): RendererProseStabilityReport {
  if (input.regenerationScope.mode === "full_chapter") {
    return {
      schemaVersion: "renderer_prose_stability.v1",
      mode: "full_chapter",
      byteStable: true,
      unrestrictedRewriteBlocked: false,
      impactedSceneIds: [],
      preservedSceneIds: [],
      preservedSceneComparisons: [],
    };
  }

  const finalScenes = createRendererSceneSnapshots(
    inferChapterNumberFromSceneSnapshots(input.baselineScenes),
    input.finalSceneTexts,
  );
  const finalById = new Map(finalScenes.map((scene) => [scene.sceneId, scene]));
  const comparisons = input.regenerationScope.preservedSceneIds.map((sceneId) => {
    const baseline = input.baselineScenes.find((scene) => scene.sceneId === sceneId);
    const final = finalById.get(sceneId);
    return {
      sceneId,
      sceneIndex: baseline?.sceneIndex ?? -1,
      baselineSha256: baseline?.sha256 ?? "",
      finalSha256: final?.sha256 ?? "",
      baselineByteLength: baseline?.byteLength ?? 0,
      finalByteLength: final?.byteLength ?? 0,
      byteStable: Boolean(
        baseline
        && final
        && baseline.sha256 === final.sha256
        && baseline.byteLength === final.byteLength
        && baseline.text === final.text
      ),
    };
  });

  return {
    schemaVersion: "renderer_prose_stability.v1",
    mode: "scoped_scene_patch",
    byteStable: comparisons.every((comparison) => comparison.byteStable),
    unrestrictedRewriteBlocked: true,
    impactedSceneIds: [...input.regenerationScope.impactedSceneIds],
    preservedSceneIds: [...input.regenerationScope.preservedSceneIds],
    preservedSceneComparisons: comparisons,
  };
}

function buildDefaultRendererRegenerationScope(): RendererFullChapterRegenerationScope {
  return {
    mode: "full_chapter",
    allowChapterRewrite: true,
  };
}

function buildScopedRendererRegenerationScope(
  snapshot: RendererNarrativeStateSnapshot,
  impactedSceneIds: ReadonlyArray<string>,
  ledgerEventIds: ReadonlyArray<string>,
): RendererScopedSceneRegenerationScope {
  const renderedScenes = snapshot.renderedScenes ?? [];
  if (renderedScenes.length === 0) {
    throw new Error(
      "Scoped renderer regeneration requires rendered scene snapshots in the narrative snapshot.",
    );
  }

  const renderedSceneIds = new Set(renderedScenes.map((scene) => scene.sceneId));
  const normalizedImpactedSceneIds = Array.from(new Set(impactedSceneIds))
    .filter((sceneId) => renderedSceneIds.has(sceneId));
  if (normalizedImpactedSceneIds.length === 0) {
    throw new Error(
      `Scoped renderer regeneration could not map any impacted scenes for chapter ${snapshot.chapterNumber}.`,
    );
  }

  const impactedSceneIndexes = normalizedImpactedSceneIds
    .map((sceneId) => renderedScenes.find((scene) => scene.sceneId === sceneId)?.sceneIndex)
    .filter((sceneIndex): sceneIndex is number => sceneIndex !== undefined)
    .sort((left, right) => left - right);
  const impactedIndexSet = new Set(impactedSceneIndexes);
  const preservedScenes = renderedScenes.filter((scene) => !impactedIndexSet.has(scene.sceneIndex));

  return {
    mode: "scoped_scene_patch",
    impactedSceneIds: impactedSceneIndexes.map((sceneIndex) =>
      renderedScenes[sceneIndex]!.sceneId
    ),
    impactedSceneIndexes,
    preservedSceneIds: preservedScenes.map((scene) => scene.sceneId),
    preservedSceneIndexes: preservedScenes.map((scene) => scene.sceneIndex),
    ledgerEventIds: Array.from(new Set(ledgerEventIds.filter(Boolean))),
    allowChapterRewrite: false,
  };
}

function normalizeRendererRegenerationScope(
  scope: RendererRegenerationScope,
  snapshot: RendererNarrativeStateSnapshot,
): RendererRegenerationScope {
  if (scope.mode === "full_chapter") {
    return buildDefaultRendererRegenerationScope();
  }

  return buildScopedRendererRegenerationScope(
    snapshot,
    scope.impactedSceneIds,
    scope.ledgerEventIds,
  );
}

function collectImpactedSceneIdsFromLedger(
  chapterNumber: number,
  ledger: SimulationCausalLedger | ReadonlyArray<SimulationEvent>,
  correctionPlan: Pick<RetroactiveCorrectionPlan, "replayScope">,
): string[] {
  const replayEventIds = new Set(correctionPlan.replayScope.eventIds);
  const sourceEvents = Array.isArray(ledger)
    ? ledger
    : ("events" in ledger ? ledger.events : []);
  const events = sourceEvents.map((event) => parseSimulationEvent(event));

  return Array.from(new Set(
    events
      .filter((event) =>
        replayEventIds.has(event.id)
        && event.chapter === chapterNumber
        && typeof event.sceneId === "string"
        && event.sceneId.trim().length > 0
      )
      .map((event) => event.sceneId!.trim()),
  ));
}

function buildRendererSceneId(chapterNumber: number, sceneIndex: number): string {
  return `scene_${String(chapterNumber).padStart(3, "0")}_${String(sceneIndex + 1).padStart(2, "0")}`;
}

function hashRendererSceneText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function truncateRendererSceneText(text: string, maxLength = 140): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function inferChapterNumberFromSceneSnapshots(
  scenes: ReadonlyArray<RendererSceneTextSnapshot>,
): number {
  const firstSceneId = scenes[0]?.sceneId;
  const match = firstSceneId ? /^scene_(\d+)_\d+$/.exec(firstSceneId) : null;
  return match ? Number.parseInt(match[1]!, 10) : 1;
}
