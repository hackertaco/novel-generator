import { createHash } from "node:crypto";

import type { ChapterWorldState } from "@/lib/memory/world-state";
import type { SimulationState } from "@/lib/sim";

export type RendererNarrativeStateIdentitySegmentName =
  | "beliefs"
  | "events"
  | "continuity";

export interface RendererNarrativeStateIdentitySource {
  simulationState: Pick<SimulationState, "beliefs" | "eventLog">;
  worldStateProjection?: ChapterWorldState[];
}

export interface RendererNarrativeStateIdentitySegment {
  segment: RendererNarrativeStateIdentitySegmentName;
  sha256: string;
  byteLength: number;
  recordCount: number;
  firstRecordIdentity: string | null;
  lastRecordIdentity: string | null;
}

export interface RendererNarrativeStateIdentityManifest {
  schemaVersion: "renderer_narrative_state_identity.v1";
  canonicalization: "stable-json-v1";
  overallSha256: string;
  segments: Record<
    RendererNarrativeStateIdentitySegmentName,
    RendererNarrativeStateIdentitySegment
  >;
}

export interface RendererNarrativeStateIdentitySegmentComparison {
  segment: RendererNarrativeStateIdentitySegmentName;
  baseline: RendererNarrativeStateIdentitySegment;
  rehydrated: RendererNarrativeStateIdentitySegment;
  postRender: RendererNarrativeStateIdentitySegment;
  rehydratedMatchesBaseline: boolean;
  postRenderMatchesBaseline: boolean;
}

export interface RendererNarrativeStateImmutabilityReport {
  schemaVersion: "renderer_narrative_state_immutability.v1";
  byteEquivalent: boolean;
  rehydratedMatchesBaseline: boolean;
  postRenderMatchesBaseline: boolean;
  baseline: RendererNarrativeStateIdentityManifest;
  rehydrated: RendererNarrativeStateIdentityManifest;
  postRender: RendererNarrativeStateIdentityManifest;
  segmentComparisons: Record<
    RendererNarrativeStateIdentitySegmentName,
    RendererNarrativeStateIdentitySegmentComparison
  >;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }

  return value;
}

function toCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function toSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildSegment(
  segment: RendererNarrativeStateIdentitySegmentName,
  payload: unknown,
  recordIdentities: string[],
): RendererNarrativeStateIdentitySegment {
  const canonicalJson = toCanonicalJson(payload);

  return {
    segment,
    sha256: toSha256(canonicalJson),
    byteLength: Buffer.byteLength(canonicalJson, "utf8"),
    recordCount: recordIdentities.length,
    firstRecordIdentity: recordIdentities[0] ?? null,
    lastRecordIdentity: recordIdentities.at(-1) ?? null,
  };
}

function listBeliefRecordIdentities(
  beliefs: SimulationState["beliefs"],
): string[] {
  return Object.keys(beliefs)
    .sort()
    .flatMap((characterId) => beliefs[characterId]?.timeline ?? []);
}

function listEventRecordIdentities(
  eventLog: SimulationState["eventLog"],
): string[] {
  return eventLog.map((event) => event.id);
}

function listContinuityRecordIdentities(
  worldStateProjection: ChapterWorldState[] | undefined,
): string[] {
  return (worldStateProjection ?? []).map((chapterState) =>
    `chapter:${chapterState.chapter}`,
  );
}

export function buildRendererNarrativeStateIdentityManifest(
  source: RendererNarrativeStateIdentitySource,
): RendererNarrativeStateIdentityManifest {
  const beliefsPayload = source.simulationState.beliefs;
  const eventsPayload = source.simulationState.eventLog;
  const continuityPayload = source.worldStateProjection ?? [];

  const segments = {
    beliefs: buildSegment(
      "beliefs",
      beliefsPayload,
      listBeliefRecordIdentities(beliefsPayload),
    ),
    events: buildSegment(
      "events",
      eventsPayload,
      listEventRecordIdentities(eventsPayload),
    ),
    continuity: buildSegment(
      "continuity",
      continuityPayload,
      listContinuityRecordIdentities(source.worldStateProjection),
    ),
  } satisfies RendererNarrativeStateIdentityManifest["segments"];

  return {
    schemaVersion: "renderer_narrative_state_identity.v1",
    canonicalization: "stable-json-v1",
    overallSha256: toSha256(toCanonicalJson({
      beliefs: beliefsPayload,
      events: eventsPayload,
      continuity: continuityPayload,
    })),
    segments,
  };
}

function buildSegmentComparison(
  segment: RendererNarrativeStateIdentitySegmentName,
  baseline: RendererNarrativeStateIdentitySegment,
  rehydrated: RendererNarrativeStateIdentitySegment,
  postRender: RendererNarrativeStateIdentitySegment,
): RendererNarrativeStateIdentitySegmentComparison {
  return {
    segment,
    baseline,
    rehydrated,
    postRender,
    rehydratedMatchesBaseline:
      baseline.sha256 === rehydrated.sha256
      && baseline.byteLength === rehydrated.byteLength,
    postRenderMatchesBaseline:
      baseline.sha256 === postRender.sha256
      && baseline.byteLength === postRender.byteLength,
  };
}

export function buildRendererNarrativeStateImmutabilityReport(input: {
  baseline: RendererNarrativeStateIdentityManifest;
  rehydrated: RendererNarrativeStateIdentityManifest;
  postRender: RendererNarrativeStateIdentityManifest;
}): RendererNarrativeStateImmutabilityReport {
  const segmentComparisons = {
    beliefs: buildSegmentComparison(
      "beliefs",
      input.baseline.segments.beliefs,
      input.rehydrated.segments.beliefs,
      input.postRender.segments.beliefs,
    ),
    events: buildSegmentComparison(
      "events",
      input.baseline.segments.events,
      input.rehydrated.segments.events,
      input.postRender.segments.events,
    ),
    continuity: buildSegmentComparison(
      "continuity",
      input.baseline.segments.continuity,
      input.rehydrated.segments.continuity,
      input.postRender.segments.continuity,
    ),
  } satisfies RendererNarrativeStateImmutabilityReport["segmentComparisons"];

  const rehydratedMatchesBaseline = input.baseline.overallSha256 === input.rehydrated.overallSha256
    && Object.values(segmentComparisons).every((comparison) =>
      comparison.rehydratedMatchesBaseline
    );
  const postRenderMatchesBaseline = input.baseline.overallSha256 === input.postRender.overallSha256
    && Object.values(segmentComparisons).every((comparison) =>
      comparison.postRenderMatchesBaseline
    );

  return {
    schemaVersion: "renderer_narrative_state_immutability.v1",
    byteEquivalent: rehydratedMatchesBaseline && postRenderMatchesBaseline,
    rehydratedMatchesBaseline,
    postRenderMatchesBaseline,
    baseline: input.baseline,
    rehydrated: input.rehydrated,
    postRender: input.postRender,
    segmentComparisons,
  };
}

export function formatRendererNarrativeStateImmutabilityFailures(
  report: RendererNarrativeStateImmutabilityReport,
): string[] {
  const failures: string[] = [];

  for (const comparison of Object.values(report.segmentComparisons)) {
    if (!comparison.rehydratedMatchesBaseline) {
      failures.push(
        `rehydrated ${comparison.segment} changed`
        + ` (${comparison.baseline.sha256} -> ${comparison.rehydrated.sha256})`,
      );
    }

    if (!comparison.postRenderMatchesBaseline) {
      failures.push(
        `post-render ${comparison.segment} changed`
        + ` (${comparison.baseline.sha256} -> ${comparison.postRender.sha256})`,
      );
    }
  }

  return failures;
}
