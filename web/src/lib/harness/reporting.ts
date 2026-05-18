import { z } from "zod";

import {
  classifyForeshadowThreadVerdicts,
  summarizeForeshadowThreadVerdicts,
} from "../evolution/evaluators/foreshadowing-usage";
import type { NovelSeed } from "../schema/novel";
import {
  buildForeshadowIntentionalAbandonmentMarker,
  buildForeshadowTerminalState,
  classifyForeshadowResolutionStatus,
  ForeshadowIntentionalAbandonmentMarkerSchema,
  ForeshadowLifecycleStatusSchema,
  ForeshadowResolutionStatusSchema,
  ForeshadowTerminalStateSchema,
  refreshForeshadowVerificationMetadata,
  type Foreshadowing,
} from "../schema/foreshadowing";
import {
  FORESHADOW_RESOLUTION_WINDOW_EPISODES,
  createForeshadowRegistryFromSeed,
  gateEpisodeForeshadowFullResolution,
} from "../sim";

export const ForeshadowVerificationSourceProvenanceSchema = z.object({
  sourceEpisodeIds: z.array(z.string().min(1)),
  sourceSceneIds: z.array(z.string().min(1)),
  sourceOccurrenceCount: z.number().int().nonnegative(),
});

export type ForeshadowVerificationSourceProvenance = z.infer<
  typeof ForeshadowVerificationSourceProvenanceSchema
>;

export const ForeshadowVerificationTerminalStateSummarySchema = z.object({
  status: ForeshadowTerminalStateSchema.shape.status,
  source: ForeshadowTerminalStateSchema.shape.source,
  provenance: ForeshadowVerificationSourceProvenanceSchema,
});

export type ForeshadowVerificationTerminalStateSummary = z.infer<
  typeof ForeshadowVerificationTerminalStateSummarySchema
>;

export const ForeshadowVerificationIntentionalAbandonmentSchema = z.object({
  marker: ForeshadowIntentionalAbandonmentMarkerSchema.shape.marker,
  source: ForeshadowIntentionalAbandonmentMarkerSchema.shape.source,
  provenance: ForeshadowVerificationSourceProvenanceSchema,
});

export type ForeshadowVerificationIntentionalAbandonment = z.infer<
  typeof ForeshadowVerificationIntentionalAbandonmentSchema
>;

export const ForeshadowVerificationExpectedPayoffSchema = z.object({
  promise: z.string().min(1),
  plannedRevealEpisode: z.number().int().positive().nullable(),
  earliestPayoffEpisode: z.number().int().positive().nullable(),
  requiredResolutionStatus: ForeshadowResolutionStatusSchema,
});

export const ForeshadowVerificationCandidateResolutionEventSchema = z.object({
  episodeNumber: z.number().int().positive(),
  episodeId: z.string().min(1),
  action: z.literal("reveal"),
  context: z.string().min(1),
});

export type ForeshadowVerificationCandidateResolutionEvent = z.infer<
  typeof ForeshadowVerificationCandidateResolutionEventSchema
>;

export const ForeshadowVerificationItemSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  plantedAt: z.number().int(),
  revealAt: z.number().int().nullable(),
  lifecycle: ForeshadowLifecycleStatusSchema,
  terminalState: ForeshadowVerificationTerminalStateSummarySchema.nullable(),
  abandonmentReason: z.string().min(1).optional(),
  abandonmentMarker: z.string().min(1).optional(),
  intentionalAbandonment:
    ForeshadowVerificationIntentionalAbandonmentSchema.nullable(),
  sourceEpisodeIds: z.array(z.string().min(1)),
  sourceSceneIds: z.array(z.string().min(1)),
  sourceOccurrenceCount: z.number().int().nonnegative(),
  sharedTargetSummary: z.string(),
});

export type ForeshadowVerificationItemSummary = z.infer<
  typeof ForeshadowVerificationItemSummarySchema
>;

export const ForeshadowResolutionClassificationSchema = z.enum([
  "fully_resolved",
  "unresolved",
]);

export type ForeshadowResolutionClassification = z.infer<
  typeof ForeshadowResolutionClassificationSchema
>;

export const ForeshadowVerificationRegisteredItemSchema =
  ForeshadowVerificationItemSummarySchema.extend({
    registrationEpisode: z.number().int().positive(),
    registrationEpisodeId: z.string().min(1),
    registrationSceneId: z.string().min(1).optional(),
    resolutionDeadlineEpisode: z.number().int().positive(),
    expectedPayoff: ForeshadowVerificationExpectedPayoffSchema,
    resolutionClassification: ForeshadowResolutionClassificationSchema,
    candidateResolutionEvents: z
      .array(ForeshadowVerificationCandidateResolutionEventSchema)
      .default([]),
  });

export type ForeshadowVerificationRegisteredItem = z.infer<
  typeof ForeshadowVerificationRegisteredItemSchema
>;

export const ForeshadowVerificationThreadVerdictClassificationSchema = z.enum([
  "resolved",
  "intentional_non_failure_closure",
  "invalid_payoff_failure",
  "unresolved_failure",
  "non_terminal_failure",
]);

export const ForeshadowVerificationThreadVerdictSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lifecycle: ForeshadowLifecycleStatusSchema,
  classification: ForeshadowVerificationThreadVerdictClassificationSchema,
  countsAsFailure: z.boolean(),
  abandonmentReason: z.string().min(1).optional(),
  abandonmentMarker: z.string().min(1).optional(),
  message: z.string().min(1).nullable(),
});

export type ForeshadowVerificationThreadVerdict = z.infer<
  typeof ForeshadowVerificationThreadVerdictSchema
>;

export const ForeshadowVerificationVerdictSummarySchema = z.object({
  totalThreads: z.number().int().nonnegative(),
  resolvedThreads: z.number().int().nonnegative(),
  failureThreads: z.number().int().nonnegative(),
  intentionalNonFailureClosures: z.number().int().nonnegative(),
  invalidPayoffFailures: z.number().int().nonnegative(),
  unresolvedFailures: z.number().int().nonnegative(),
  nonTerminalFailures: z.number().int().nonnegative(),
  threadVerdicts: z.array(ForeshadowVerificationThreadVerdictSchema),
});

export type ForeshadowVerificationVerdictSummary = z.infer<
  typeof ForeshadowVerificationVerdictSummarySchema
>;

export const ForeshadowResolutionWindowStatusSchema = z.enum([
  "resolved_within_window",
  "pending",
  "missed",
  "expired",
  "intentionally_abandoned",
]);

export type ForeshadowResolutionWindowStatus = z.infer<
  typeof ForeshadowResolutionWindowStatusSchema
>;

export const ForeshadowResolutionWindowItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lifecycle: ForeshadowLifecycleStatusSchema,
  registrationEpisode: z.number().int().positive(),
  resolutionDeadlineEpisode: z.number().int().positive(),
  windowStatus: ForeshadowResolutionWindowStatusSchema,
  resolutionClassification: ForeshadowResolutionClassificationSchema,
  firstResolutionEvent:
    ForeshadowVerificationCandidateResolutionEventSchema.nullable(),
});

export type ForeshadowResolutionWindowItem = z.infer<
  typeof ForeshadowResolutionWindowItemSchema
>;

export const ForeshadowResolutionWindowSummarySchema = z.object({
  resolutionWindowEpisodes: z.number().int().positive(),
  evaluationHorizonEpisode: z.number().int().nonnegative(),
  totals: z.object({
    total: z.number().int().nonnegative(),
    fullyResolved: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    resolvedWithinWindow: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    missed: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    intentionallyAbandoned: z.number().int().nonnegative(),
  }),
  items: z.array(ForeshadowResolutionWindowItemSchema),
});

export type ForeshadowResolutionWindowSummary = z.infer<
  typeof ForeshadowResolutionWindowSummarySchema
>;

export const ForeshadowContinuityExpiryReasoningKindSchema = z.enum([
  "resolved_before_deadline",
  "resolved_after_deadline",
  "deadline_not_reached",
  "deadline_passed_without_resolution",
  "intentionally_abandoned",
]);

export type ForeshadowContinuityExpiryReasoningKind = z.infer<
  typeof ForeshadowContinuityExpiryReasoningKindSchema
>;

export const ForeshadowContinuityExpiryReasoningSchema = z.object({
  kind: ForeshadowContinuityExpiryReasoningKindSchema,
  deadlineEpisode: z.number().int().positive(),
  evaluationHorizonEpisode: z.number().int().nonnegative(),
  resolutionEpisode: z.number().int().positive().nullable(),
  episodesLate: z.number().int().nonnegative().nullable(),
  episodesRemaining: z.number().int().nonnegative().nullable(),
  summary: z.string().min(1),
});

export type ForeshadowContinuityExpiryReasoning = z.infer<
  typeof ForeshadowContinuityExpiryReasoningSchema
>;

export const ForeshadowContinuityVerifierItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lifecycle: ForeshadowLifecycleStatusSchema,
  status: ForeshadowResolutionWindowStatusSchema,
  resolutionClassification: ForeshadowResolutionClassificationSchema,
  threadVerdictClassification:
    ForeshadowVerificationThreadVerdictClassificationSchema,
  countsAsFailure: z.boolean(),
  threadVerdictMessage: z.string().min(1).nullable(),
  registrationEpisode: z.number().int().positive(),
  resolutionDeadlineEpisode: z.number().int().positive(),
  resolutionEpisode: z.number().int().positive().nullable(),
  resolutionEpisodeId: z.string().min(1).nullable(),
  sharedTargetSummary: z.string(),
  expiryReasoning: ForeshadowContinuityExpiryReasoningSchema,
});

export type ForeshadowContinuityVerifierItem = z.infer<
  typeof ForeshadowContinuityVerifierItemSchema
>;

export const ForeshadowContinuityVerifierReportSchema = z.object({
  resolutionWindowEpisodes: z.number().int().positive(),
  evaluationHorizonEpisode: z.number().int().nonnegative(),
  totals: ForeshadowResolutionWindowSummarySchema.shape.totals,
  items: z.array(ForeshadowContinuityVerifierItemSchema),
});

export type ForeshadowContinuityVerifierReport = z.infer<
  typeof ForeshadowContinuityVerifierReportSchema
>;

export const ForeshadowVerificationEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  episodeId: z.string().min(1),
  title: z.string().min(1),
  plotSummary: z.string().min(1),
  cliffhanger: z.string().nullable(),
  endingSceneState: z.object({
    location: z.string().min(1),
    timeOfDay: z.string().min(1),
    charactersPresent: z.array(z.string().min(1)),
    ongoingAction: z.string().min(1),
    unresolvedTension: z.string().min(1),
  }).nullable(),
  foreshadowingTouched: z.array(z.object({
    foreshadowingId: z.string().min(1),
    action: z.string().min(1),
    context: z.string().min(1),
  })),
});

export type ForeshadowVerificationEpisode = z.infer<
  typeof ForeshadowVerificationEpisodeSchema
>;

export const ForeshadowVerificationInputSchema = z.object({
  registeredForeshadowItems: z.array(ForeshadowVerificationRegisteredItemSchema),
  episodeSequence: z.array(ForeshadowVerificationEpisodeSchema),
});

export type ForeshadowVerificationInput = z.infer<
  typeof ForeshadowVerificationInputSchema
>;

function normalizeForeshadowTouchAction(action: string): string {
  return action.trim().toLowerCase().replace(/\s+/g, "_");
}

function buildForeshadowVerificationSourceProvenance(
  normalized: Foreshadowing,
): ForeshadowVerificationSourceProvenance {
  return {
    sourceEpisodeIds: [...normalized.verification_metadata.source_episode_ids],
    sourceSceneIds: [...normalized.verification_metadata.source_scene_ids],
    sourceOccurrenceCount: normalized.verification_metadata.source_occurrence_count,
  };
}

function formatEpisodeId(episodeNumber: number): string {
  return `ep_${String(episodeNumber).padStart(3, "0")}`;
}

function classifyForeshadowResolutionClassification(
  resolutionEpisodeNumber: number | null,
  resolutionDeadlineEpisode: number,
): ForeshadowResolutionClassification {
  return resolutionEpisodeNumber !== null
    && resolutionEpisodeNumber <= resolutionDeadlineEpisode
    ? "fully_resolved"
    : "unresolved";
}

export function normalizeSeedForeshadowing(seed: NovelSeed): NovelSeed {
  const normalizedForeshadowing = (seed.foreshadowing ?? []).map((foreshadowing) =>
    refreshForeshadowVerificationMetadata({ ...foreshadowing }),
  );
  const registry = createForeshadowRegistryFromSeed(normalizedForeshadowing);

  return {
    ...seed,
    foreshadowing: normalizedForeshadowing.map((foreshadowing) =>
      refreshForeshadowVerificationMetadata(
        gateEpisodeForeshadowFullResolution(
          foreshadowing,
          registry.byId[foreshadowing.id],
        ),
      ),
    ),
  };
}

export function buildForeshadowingVerificationItems(
  seed: NovelSeed,
): ForeshadowVerificationItemSummary[] {
  return normalizeSeedForeshadowing(seed).foreshadowing.map((normalized) => {
    const provenance = buildForeshadowVerificationSourceProvenance(normalized);
    const terminalState = buildForeshadowTerminalState(normalized);
    const intentionalAbandonment =
      buildForeshadowIntentionalAbandonmentMarker(normalized);

    return ForeshadowVerificationItemSummarySchema.parse({
      id: normalized.id,
      name: normalized.name,
      plantedAt: normalized.planted_at,
      revealAt: normalized.reveal_at,
      lifecycle: normalized.lifecycle,
      terminalState: terminalState
        ? { ...terminalState, provenance }
        : null,
      abandonmentReason: normalized.abandonment_reason,
      abandonmentMarker: normalized.abandonment_marker,
      intentionalAbandonment: intentionalAbandonment
        ? { ...intentionalAbandonment, provenance }
        : null,
      sourceEpisodeIds: provenance.sourceEpisodeIds,
      sourceSceneIds: provenance.sourceSceneIds,
      sourceOccurrenceCount: provenance.sourceOccurrenceCount,
      sharedTargetSummary: normalized.verification_metadata.shared_target_summary,
    });
  });
}

export function buildForeshadowingVerificationRegisteredItems(
  seed: NovelSeed,
): ForeshadowVerificationRegisteredItem[] {
  const normalizedSeed = normalizeSeedForeshadowing(seed);
  const itemsById = new Map(
    buildForeshadowingVerificationItems(normalizedSeed).map((item) => [item.id, item]),
  );
  const registry = createForeshadowRegistryFromSeed(normalizedSeed.foreshadowing);

  return normalizedSeed.foreshadowing.map((normalized) => {
    const summary = itemsById.get(normalized.id);
    const entry = registry.byId[normalized.id];
    if (!summary || !entry) {
      throw new Error(`Missing foreshadow verification registration for "${normalized.id}"`);
    }
    const seedResolutionStatus = classifyForeshadowResolutionStatus({
      cause: normalized.resolution?.cause,
      identity: normalized.resolution?.identity,
      consequence: normalized.resolution?.consequence,
    });
    const seedResolutionEvents =
      seedResolutionStatus === "full" && summary.revealAt !== null
        ? [
            ForeshadowVerificationCandidateResolutionEventSchema.parse({
              episodeNumber: summary.revealAt,
              episodeId: formatEpisodeId(summary.revealAt),
              action: "reveal",
              context:
                normalized.resolution?.cause.evidence[0]
                ?? normalized.description
                ?? summary.sharedTargetSummary,
            }),
          ]
        : [];
    const resolutionClassification = classifyForeshadowResolutionClassification(
      seedResolutionEvents[0]?.episodeNumber ?? null,
      entry.resolutionDeadlineEpisode,
    );

    return ForeshadowVerificationRegisteredItemSchema.parse({
      ...summary,
      registrationEpisode: entry.registrationEpisode,
      registrationEpisodeId:
        normalized.origin?.episode_id
        ?? formatEpisodeId(entry.registrationEpisode),
      registrationSceneId: entry.registrationSceneId,
      resolutionDeadlineEpisode: entry.resolutionDeadlineEpisode,
      expectedPayoff: {
        promise: entry.expectedPayoffConditions.promise,
        plannedRevealEpisode: entry.expectedPayoffConditions.plannedRevealEpisode,
        earliestPayoffEpisode:
          entry.expectedPayoffConditions.earliestPayoffEpisode ?? null,
        requiredResolutionStatus:
          entry.expectedPayoffConditions.requiredResolutionStatus,
      },
      resolutionClassification,
      candidateResolutionEvents: seedResolutionEvents,
    });
  });
}

function scanCandidateResolutionEventsByForeshadowId(
  episodeSequence: ForeshadowVerificationEpisode[],
): Map<string, ForeshadowVerificationCandidateResolutionEvent[]> {
  const eventsByForeshadowId = new Map<
    string,
    ForeshadowVerificationCandidateResolutionEvent[]
  >();
  const seenEventKeysByForeshadowId = new Map<string, Set<string>>();

  for (const episode of episodeSequence) {
    for (const touch of episode.foreshadowingTouched) {
      if (normalizeForeshadowTouchAction(touch.action) !== "reveal") {
        continue;
      }

      const foreshadowId = touch.foreshadowingId.trim();
      const context = touch.context.trim();
      if (!foreshadowId || !context) {
        continue;
      }

      const seenKeys = seenEventKeysByForeshadowId.get(foreshadowId) ?? new Set<string>();
      seenEventKeysByForeshadowId.set(foreshadowId, seenKeys);

      const eventKey = `${episode.episodeId}\u0000${episode.episodeNumber}\u0000${context}`;
      if (seenKeys.has(eventKey)) {
        continue;
      }
      seenKeys.add(eventKey);

      const candidateEvent = ForeshadowVerificationCandidateResolutionEventSchema.parse({
        episodeNumber: episode.episodeNumber,
        episodeId: episode.episodeId,
        action: "reveal",
        context,
      });

      const existing = eventsByForeshadowId.get(foreshadowId) ?? [];
      existing.push(candidateEvent);
      eventsByForeshadowId.set(foreshadowId, existing);
    }
  }

  return eventsByForeshadowId;
}

function attachCandidateResolutionEvents(
  registeredItems: ForeshadowVerificationRegisteredItem[],
  episodeSequence: ForeshadowVerificationEpisode[],
): ForeshadowVerificationRegisteredItem[] {
  const eventsByForeshadowId =
    scanCandidateResolutionEventsByForeshadowId(episodeSequence);

  return registeredItems.map((item) => {
    const candidateResolutionEvents = [
      ...item.candidateResolutionEvents,
      ...(eventsByForeshadowId.get(item.id) ?? []),
    ];

    return ForeshadowVerificationRegisteredItemSchema.parse({
      ...item,
      resolutionClassification: classifyForeshadowResolutionClassification(
        sortCandidateResolutionEvents(candidateResolutionEvents)[0]?.episodeNumber ?? null,
        item.resolutionDeadlineEpisode,
      ),
      candidateResolutionEvents,
    });
  });
}

type EndingSceneStateLike = {
  location?: string;
  time_of_day?: string;
  characters_present?: string[];
  ongoing_action?: string;
  unresolved_tension?: string;
};

type ForeshadowTouchLike = {
  foreshadowing_id?: string;
  action?: string;
  context?: string;
};

type ChapterResultLike = {
  chapterNumber?: number;
  chapter_number?: number;
  episode_id?: string;
  title?: string;
  plot_summary?: string;
  cliffhanger?: string | null;
  ending_scene_state?: EndingSceneStateLike | null;
  foreshadowing_touched?: ForeshadowTouchLike[];
  summary?: {
    title?: string;
    plot_summary?: string;
    cliffhanger?: string | null;
    ending_scene_state?: EndingSceneStateLike | null;
    foreshadowing_touched?: ForeshadowTouchLike[];
  };
};

export function normalizeForeshadowVerificationEpisodeOutputs(
  chapterResults: ChapterResultLike[],
): ForeshadowVerificationEpisode[] {
  return chapterResults
    .map((result) => {
      const episodeNumber = result.chapterNumber ?? result.chapter_number ?? 0;
      const endingSceneState =
        result.summary?.ending_scene_state ?? result.ending_scene_state;
      const foreshadowingTouched =
        result.summary?.foreshadowing_touched ?? result.foreshadowing_touched ?? [];

      return ForeshadowVerificationEpisodeSchema.parse({
        episodeNumber,
        episodeId: result.episode_id ?? formatEpisodeId(episodeNumber),
        title: result.summary?.title ?? result.title ?? "",
        plotSummary: result.summary?.plot_summary ?? result.plot_summary ?? "",
        cliffhanger:
          result.summary?.cliffhanger
          ?? result.cliffhanger
          ?? null,
        endingSceneState: endingSceneState
          ? {
              location: endingSceneState.location ?? "",
              timeOfDay: endingSceneState.time_of_day ?? "",
              charactersPresent: endingSceneState.characters_present ?? [],
              ongoingAction: endingSceneState.ongoing_action ?? "",
              unresolvedTension: endingSceneState.unresolved_tension ?? "",
            }
          : null,
        foreshadowingTouched: foreshadowingTouched.map((touch) => ({
          foreshadowingId: touch.foreshadowing_id ?? "",
          action: touch.action ?? "",
          context: touch.context ?? "",
        })),
      });
    })
    .sort((left, right) => left.episodeNumber - right.episodeNumber);
}

export function buildForeshadowVerificationInput(
  seed: NovelSeed,
  chapterResults: ChapterResultLike[],
): ForeshadowVerificationInput {
  const episodeSequence =
    normalizeForeshadowVerificationEpisodeOutputs(chapterResults);

  return ForeshadowVerificationInputSchema.parse({
    registeredForeshadowItems: attachCandidateResolutionEvents(
      buildForeshadowingVerificationRegisteredItems(seed),
      episodeSequence,
    ),
    episodeSequence,
  });
}

export function buildForeshadowVerificationVerdictSummary(
  seed: NovelSeed,
): ForeshadowVerificationVerdictSummary {
  const threadVerdicts = classifyForeshadowThreadVerdicts(seed.foreshadowing ?? []);
  const summary = summarizeForeshadowThreadVerdicts(threadVerdicts);

  return ForeshadowVerificationVerdictSummarySchema.parse({
    totalThreads: summary.total_threads,
    resolvedThreads: summary.resolved_threads,
    failureThreads: summary.failure_threads,
    intentionalNonFailureClosures: summary.intentional_non_failure_closures,
    invalidPayoffFailures: summary.invalid_payoff_failures,
    unresolvedFailures: summary.unresolved_failures,
    nonTerminalFailures: summary.non_terminal_failures,
    threadVerdicts: threadVerdicts.map((verdict) => ({
      id: verdict.id,
      name: verdict.name,
      lifecycle: verdict.lifecycle,
      classification: verdict.classification,
      countsAsFailure: verdict.counts_as_failure,
      abandonmentReason: verdict.abandonment_reason,
      abandonmentMarker: verdict.abandonment_marker,
      message: verdict.message ?? null,
    })),
  });
}

function sortCandidateResolutionEvents(
  candidateResolutionEvents: ForeshadowVerificationCandidateResolutionEvent[],
): ForeshadowVerificationCandidateResolutionEvent[] {
  return [...candidateResolutionEvents].sort((left, right) => (
    left.episodeNumber - right.episodeNumber
    || left.episodeId.localeCompare(right.episodeId)
    || left.context.localeCompare(right.context)
  ));
}

function getFirstCandidateResolutionEvent(
  item: Pick<
    ForeshadowVerificationRegisteredItem,
    "candidateResolutionEvents"
  >,
): ForeshadowVerificationCandidateResolutionEvent | null {
  return sortCandidateResolutionEvents(item.candidateResolutionEvents)[0] ?? null;
}

function classifyForeshadowResolutionWindowStatus(
  item: ForeshadowVerificationRegisteredItem,
  evaluationHorizonEpisode: number,
): ForeshadowResolutionWindowStatus {
  if (item.lifecycle === "intentionally_abandoned") {
    return "intentionally_abandoned";
  }

  const firstResolutionEvent = getFirstCandidateResolutionEvent(item);

  if (firstResolutionEvent) {
    return firstResolutionEvent.episodeNumber <= item.resolutionDeadlineEpisode
      ? "resolved_within_window"
      : "expired";
  }

  return evaluationHorizonEpisode >= item.resolutionDeadlineEpisode
    ? "missed"
    : "pending";
}

export function evaluateForeshadowResolutionWindows(
  input: ForeshadowVerificationInput,
): ForeshadowResolutionWindowSummary {
  const evaluationHorizonEpisode = input.episodeSequence.reduce(
    (maxEpisode, episode) => Math.max(maxEpisode, episode.episodeNumber),
    0,
  );

  const items = input.registeredForeshadowItems.map((item) => {
    const firstResolutionEvent = getFirstCandidateResolutionEvent(item);

    return ForeshadowResolutionWindowItemSchema.parse({
      id: item.id,
      name: item.name,
      lifecycle: item.lifecycle,
      registrationEpisode: item.registrationEpisode,
      resolutionDeadlineEpisode: item.resolutionDeadlineEpisode,
      windowStatus: classifyForeshadowResolutionWindowStatus(
        item,
        evaluationHorizonEpisode,
      ),
      resolutionClassification: item.resolutionClassification,
      firstResolutionEvent,
    });
  });

  const totals = {
    total: items.length,
    fullyResolved: 0,
    unresolved: 0,
    resolvedWithinWindow: 0,
    pending: 0,
    missed: 0,
    expired: 0,
    intentionallyAbandoned: 0,
  };

  for (const item of items) {
    if (item.resolutionClassification === "fully_resolved") {
      totals.fullyResolved += 1;
    } else {
      totals.unresolved += 1;
    }

    switch (item.windowStatus) {
      case "resolved_within_window":
        totals.resolvedWithinWindow += 1;
        break;
      case "pending":
        totals.pending += 1;
        break;
      case "missed":
        totals.missed += 1;
        break;
      case "expired":
        totals.expired += 1;
        break;
      case "intentionally_abandoned":
        totals.intentionallyAbandoned += 1;
        break;
    }
  }

  return ForeshadowResolutionWindowSummarySchema.parse({
    resolutionWindowEpisodes: FORESHADOW_RESOLUTION_WINDOW_EPISODES,
    evaluationHorizonEpisode,
    totals,
    items,
  });
}

function buildForeshadowContinuityExpiryReasoning(
  item: ForeshadowResolutionWindowItem,
  evaluationHorizonEpisode: number,
): ForeshadowContinuityExpiryReasoning {
  const resolutionEpisode = item.firstResolutionEvent?.episodeNumber ?? null;

  switch (item.windowStatus) {
    case "resolved_within_window":
      return ForeshadowContinuityExpiryReasoningSchema.parse({
        kind: "resolved_before_deadline",
        deadlineEpisode: item.resolutionDeadlineEpisode,
        evaluationHorizonEpisode,
        resolutionEpisode,
        episodesLate: null,
        episodesRemaining:
          resolutionEpisode === null
            ? null
            : item.resolutionDeadlineEpisode - resolutionEpisode,
        summary:
          resolutionEpisode === null
            ? `Resolved within the deadline window before episode ${item.resolutionDeadlineEpisode}.`
            : `Resolved in episode ${resolutionEpisode} before the deadline episode ${item.resolutionDeadlineEpisode}.`,
      });
    case "expired":
      return ForeshadowContinuityExpiryReasoningSchema.parse({
        kind: "resolved_after_deadline",
        deadlineEpisode: item.resolutionDeadlineEpisode,
        evaluationHorizonEpisode,
        resolutionEpisode,
        episodesLate:
          resolutionEpisode === null
            ? Math.max(
                0,
                evaluationHorizonEpisode - item.resolutionDeadlineEpisode,
              )
            : Math.max(0, resolutionEpisode - item.resolutionDeadlineEpisode),
        episodesRemaining: null,
        summary:
          resolutionEpisode === null
            ? `Deadline episode ${item.resolutionDeadlineEpisode} passed without an on-time resolution before evaluation horizon episode ${evaluationHorizonEpisode}.`
            : `Resolved in episode ${resolutionEpisode}, which is ${Math.max(0, resolutionEpisode - item.resolutionDeadlineEpisode)} episode(s) after the deadline episode ${item.resolutionDeadlineEpisode}.`,
      });
    case "missed":
      return ForeshadowContinuityExpiryReasoningSchema.parse({
        kind: "deadline_passed_without_resolution",
        deadlineEpisode: item.resolutionDeadlineEpisode,
        evaluationHorizonEpisode,
        resolutionEpisode,
        episodesLate: Math.max(
          0,
          evaluationHorizonEpisode - item.resolutionDeadlineEpisode,
        ),
        episodesRemaining: null,
        summary: `No resolution was recorded by evaluation horizon episode ${evaluationHorizonEpisode} after the deadline episode ${item.resolutionDeadlineEpisode} passed.`,
      });
    case "pending":
      return ForeshadowContinuityExpiryReasoningSchema.parse({
        kind: "deadline_not_reached",
        deadlineEpisode: item.resolutionDeadlineEpisode,
        evaluationHorizonEpisode,
        resolutionEpisode,
        episodesLate: null,
        episodesRemaining: Math.max(
          0,
          item.resolutionDeadlineEpisode - evaluationHorizonEpisode,
        ),
        summary: `Evaluation horizon episode ${evaluationHorizonEpisode} has not yet reached the deadline episode ${item.resolutionDeadlineEpisode}.`,
      });
    case "intentionally_abandoned":
      return ForeshadowContinuityExpiryReasoningSchema.parse({
        kind: "intentionally_abandoned",
        deadlineEpisode: item.resolutionDeadlineEpisode,
        evaluationHorizonEpisode,
        resolutionEpisode,
        episodesLate: null,
        episodesRemaining: null,
        summary: `Thread was intentionally abandoned, so deadline episode ${item.resolutionDeadlineEpisode} is treated as a non-failure closure boundary.`,
      });
  }
}

function doesContinuityVerifierItemCountAsFailure(
  windowStatus: ForeshadowResolutionWindowStatus,
  threadVerdictClassification: ForeshadowVerificationThreadVerdict["classification"],
): boolean {
  if (threadVerdictClassification === "invalid_payoff_failure") {
    return true;
  }

  return windowStatus === "expired" || windowStatus === "missed";
}

export function buildForeshadowContinuityVerifierReport(
  seed: NovelSeed,
  chapterResults: ChapterResultLike[],
): ForeshadowContinuityVerifierReport {
  const verificationInput = buildForeshadowVerificationInput(seed, chapterResults);
  const windowSummary =
    evaluateForeshadowResolutionWindows(verificationInput);
  const verdictSummary = buildForeshadowVerificationVerdictSummary(seed);
  const windowItemsById = new Map(
    windowSummary.items.map((item) => [item.id, item]),
  );
  const verdictsById = new Map(
    verdictSummary.threadVerdicts.map((verdict) => [verdict.id, verdict]),
  );

  const items = verificationInput.registeredForeshadowItems.map((item) => {
    const windowItem = windowItemsById.get(item.id);
    const verdict = verdictsById.get(item.id);

    if (!windowItem || !verdict) {
      throw new Error(
        `Missing continuity verifier data for foreshadow item "${item.id}"`,
      );
    }

    return ForeshadowContinuityVerifierItemSchema.parse({
      id: item.id,
      name: item.name,
      lifecycle: item.lifecycle,
      status: windowItem.windowStatus,
      resolutionClassification: windowItem.resolutionClassification,
      threadVerdictClassification: verdict.classification,
      countsAsFailure: doesContinuityVerifierItemCountAsFailure(
        windowItem.windowStatus,
        verdict.classification,
      ),
      threadVerdictMessage: verdict.message,
      registrationEpisode: item.registrationEpisode,
      resolutionDeadlineEpisode: item.resolutionDeadlineEpisode,
      resolutionEpisode: windowItem.firstResolutionEvent?.episodeNumber ?? null,
      resolutionEpisodeId: windowItem.firstResolutionEvent?.episodeId ?? null,
      sharedTargetSummary: item.sharedTargetSummary,
      expiryReasoning: buildForeshadowContinuityExpiryReasoning(
        windowItem,
        windowSummary.evaluationHorizonEpisode,
      ),
    });
  });

  return ForeshadowContinuityVerifierReportSchema.parse({
    resolutionWindowEpisodes: windowSummary.resolutionWindowEpisodes,
    evaluationHorizonEpisode: windowSummary.evaluationHorizonEpisode,
    totals: windowSummary.totals,
    items,
  });
}
