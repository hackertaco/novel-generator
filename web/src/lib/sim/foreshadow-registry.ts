import { z } from "zod";
import {
  classifyForeshadowResolutionStatus,
  ForeshadowResolutionStatusSchema,
  type Foreshadowing,
} from "@/lib/schema/foreshadowing";

export const FORESHADOW_RESOLUTION_WINDOW_EPISODES = 80;

export const ForeshadowPayoffConditionsSchema = z.object({
  promise: z.string().min(1),
  canonicalTarget: z.string().min(1).optional(),
  earliestPayoffEpisode: z.number().int().positive().optional(),
  plannedRevealEpisode: z.number().int().positive().nullable().default(null),
  requiredResolutionStatus: ForeshadowResolutionStatusSchema.default("full"),
});

export const ForeshadowPayoffConditionKeySchema = z.enum([
  "promise",
  "canonicalTarget",
  "earliestPayoffEpisode",
  "plannedRevealEpisode",
  "requiredResolutionStatus",
]);

export const ForeshadowRegistryEntrySchema = z.object({
  id: z.string().min(1),
  registrationEpisode: z.number().int().positive(),
  registrationSceneId: z.string().min(1).optional(),
  expectedPayoffConditions: ForeshadowPayoffConditionsSchema,
  resolutionDeadlineEpisode: z.number().int().positive(),
});

export const ForeshadowRegistryStoreSchema = z.object({
  byId: z.record(z.string(), ForeshadowRegistryEntrySchema),
  timeline: z.array(z.string()),
});

export const ForeshadowPayoffCandidateSchema = z.object({
  eventId: z.string().min(1),
  foreshadowId: z
    .string()
    .min(1)
    .describe("Explicit backlink to the originating foreshadow registry id"),
  chapter: z.number().int().positive(),
  promise: z.string().min(1),
  canonicalTarget: z.string().min(1).optional(),
  resolutionStatus: ForeshadowResolutionStatusSchema,
  explicitlySatisfiedConditions: z
    .array(ForeshadowPayoffConditionKeySchema)
    .default([]),
});

export type ForeshadowPayoffConditions = z.infer<
  typeof ForeshadowPayoffConditionsSchema
>;
export type ForeshadowPayoffConditionKey = z.infer<
  typeof ForeshadowPayoffConditionKeySchema
>;
export type ForeshadowRegistryEntry = z.infer<
  typeof ForeshadowRegistryEntrySchema
>;
export type ForeshadowRegistryStore = z.infer<
  typeof ForeshadowRegistryStoreSchema
>;
export type ForeshadowPayoffCandidate = z.infer<
  typeof ForeshadowPayoffCandidateSchema
>;
export type ForeshadowPayoffValidationKey =
  | ForeshadowPayoffConditionKey
  | "foreshadowId";

export interface ForeshadowPayoffEligibilityFailure {
  condition: ForeshadowPayoffValidationKey;
  reason: string;
}

export interface ForeshadowPayoffEligibilityResult {
  eligibleForClosure: boolean;
  checkedConditions: ForeshadowPayoffConditionKey[];
  missingConditions: ForeshadowPayoffConditionKey[];
  failedConditions: ForeshadowPayoffEligibilityFailure[];
}

type EpisodeForeshadowResolutionCandidateCarrier = {
  id: string;
  lifecycle?: unknown;
  resolution?: unknown;
  payoff_candidate?: unknown;
  payoffCandidate?: unknown;
};

export interface ForeshadowRegistryEntryInput {
  id: string;
  registrationEpisode: number;
  registrationSceneId?: string;
  expectedPayoffConditions: {
    promise: string;
    canonicalTarget?: string;
    earliestPayoffEpisode?: number;
    plannedRevealEpisode?: number | null;
    requiredResolutionStatus?: ForeshadowPayoffConditions["requiredResolutionStatus"];
  };
}

function parseEpisodeId(episodeId: string | undefined): number | undefined {
  if (!episodeId) return undefined;

  const match = /^ep_(\d+)$/i.exec(episodeId.trim());
  if (!match) return undefined;

  const value = Number.parseInt(match[1] || "0", 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function inferRequiredResolutionStatus(
  foreshadowing: Foreshadowing,
): ForeshadowPayoffConditions["requiredResolutionStatus"] {
  return foreshadowing.importance === "minor" ? "partial" : "full";
}

const FORESHADOW_RESOLUTION_STATUS_RANK: Record<
  ForeshadowPayoffConditions["requiredResolutionStatus"],
  number
> = {
  unresolved: 0,
  partial: 1,
  full: 2,
};

function isForeshadowResolutionStatus(
  candidate: unknown,
): candidate is ForeshadowPayoffConditions["requiredResolutionStatus"] {
  return typeof candidate === "string"
    && candidate in FORESHADOW_RESOLUTION_STATUS_RANK;
}

function normalizeConditionText(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function listRegisteredPayoffConditions(
  conditions: ForeshadowPayoffConditions,
): ForeshadowPayoffConditionKey[] {
  const keys: ForeshadowPayoffConditionKey[] = [
    "promise",
    "requiredResolutionStatus",
  ];

  if (conditions.canonicalTarget) {
    keys.push("canonicalTarget");
  }
  if (conditions.earliestPayoffEpisode !== undefined) {
    keys.push("earliestPayoffEpisode");
  }
  if (conditions.plannedRevealEpisode !== null) {
    keys.push("plannedRevealEpisode");
  }

  return keys;
}

export function createForeshadowRegistryStore(): ForeshadowRegistryStore {
  return ForeshadowRegistryStoreSchema.parse({
    byId: {},
    timeline: [],
  });
}

export function cloneForeshadowRegistryStore(
  store: ForeshadowRegistryStore,
): ForeshadowRegistryStore {
  return {
    byId: Object.fromEntries(
      Object.entries(store.byId).map(([id, entry]) => [
        id,
        {
          ...entry,
          expectedPayoffConditions: {
            ...entry.expectedPayoffConditions,
          },
        },
      ]),
    ),
    timeline: [...store.timeline],
  };
}

export function addForeshadowRegistryEntry(
  store: ForeshadowRegistryStore,
  input: ForeshadowRegistryEntryInput,
): ForeshadowRegistryEntry {
  if (store.byId[input.id]) {
    throw new Error(`Foreshadow registry entry "${input.id}" already exists`);
  }

  const entry = ForeshadowRegistryEntrySchema.parse({
    id: input.id,
    registrationEpisode: input.registrationEpisode,
    registrationSceneId: input.registrationSceneId,
    expectedPayoffConditions: {
      promise: input.expectedPayoffConditions.promise,
      canonicalTarget: input.expectedPayoffConditions.canonicalTarget,
      earliestPayoffEpisode: input.expectedPayoffConditions.earliestPayoffEpisode,
      plannedRevealEpisode: input.expectedPayoffConditions.plannedRevealEpisode ?? null,
      requiredResolutionStatus:
        input.expectedPayoffConditions.requiredResolutionStatus ?? "full",
    },
    resolutionDeadlineEpisode:
      input.registrationEpisode + FORESHADOW_RESOLUTION_WINDOW_EPISODES,
  });

  store.byId[entry.id] = entry;
  store.timeline.push(entry.id);
  return entry;
}

export function registerSeedForeshadowing(
  store: ForeshadowRegistryStore,
  foreshadowing: Foreshadowing,
): ForeshadowRegistryEntry {
  const registrationEpisode = parseEpisodeId(foreshadowing.origin?.episode_id)
    ?? foreshadowing.planted_at;

  return addForeshadowRegistryEntry(store, {
    id: foreshadowing.id,
    registrationEpisode,
    registrationSceneId: foreshadowing.origin?.scene_id,
    expectedPayoffConditions: {
      promise: foreshadowing.description,
      canonicalTarget: foreshadowing.canonical_target,
      earliestPayoffEpisode: foreshadowing.reveal_at ?? undefined,
      plannedRevealEpisode: foreshadowing.reveal_at ?? null,
      requiredResolutionStatus: inferRequiredResolutionStatus(foreshadowing),
    },
  });
}

export function createForeshadowRegistryFromSeed(
  foreshadowingItems: Foreshadowing[] = [],
): ForeshadowRegistryStore {
  const store = createForeshadowRegistryStore();

  for (const foreshadowing of foreshadowingItems) {
    registerSeedForeshadowing(store, foreshadowing);
  }

  return store;
}

export function listForeshadowRegistryEntries(
  store: ForeshadowRegistryStore,
): ForeshadowRegistryEntry[] {
  return store.timeline
    .map((id) => store.byId[id])
    .filter((entry): entry is ForeshadowRegistryEntry => Boolean(entry));
}

export function evaluateForeshadowPayoffEligibility(
  entry: ForeshadowRegistryEntry,
  candidate: ForeshadowPayoffCandidate,
): ForeshadowPayoffEligibilityResult {
  const parsedCandidate = ForeshadowPayoffCandidateSchema.parse(candidate);
  const checkedConditions = listRegisteredPayoffConditions(
    entry.expectedPayoffConditions,
  );
  const explicitConditions = new Set(parsedCandidate.explicitlySatisfiedConditions);
  const missingConditions: ForeshadowPayoffConditionKey[] = [];
  const failedConditions: ForeshadowPayoffEligibilityFailure[] = [];

  if (parsedCandidate.foreshadowId !== entry.id) {
    failedConditions.push({
      condition: "foreshadowId",
      reason: "payoff backlink does not match the originating foreshadow id",
    });
  }

  for (const condition of checkedConditions) {
    if (!explicitConditions.has(condition)) {
      missingConditions.push(condition);
      continue;
    }

    switch (condition) {
      case "promise": {
        const expected = normalizeConditionText(
          entry.expectedPayoffConditions.promise,
        );
        const actual = normalizeConditionText(parsedCandidate.promise);
        if (!expected || expected !== actual) {
          failedConditions.push({
            condition,
            reason: "payoff promise does not explicitly match the registered promise",
          });
        }
        break;
      }

      case "canonicalTarget": {
        const expected = normalizeConditionText(
          entry.expectedPayoffConditions.canonicalTarget,
        );
        const actual = normalizeConditionText(parsedCandidate.canonicalTarget);
        if (!expected || expected !== actual) {
          failedConditions.push({
            condition,
            reason:
              "payoff canonical target does not explicitly match the registered target",
          });
        }
        break;
      }

      case "earliestPayoffEpisode": {
        const earliest = entry.expectedPayoffConditions.earliestPayoffEpisode;
        if (
          earliest !== undefined
          && parsedCandidate.chapter < earliest
        ) {
          failedConditions.push({
            condition,
            reason:
              "payoff occurs before the registered earliest payoff episode",
          });
        }
        break;
      }

      case "plannedRevealEpisode": {
        const planned = entry.expectedPayoffConditions.plannedRevealEpisode;
        if (
          planned !== null
          && parsedCandidate.chapter < planned
        ) {
          failedConditions.push({
            condition,
            reason:
              "payoff occurs before the registered planned reveal episode",
          });
        }
        break;
      }

      case "requiredResolutionStatus": {
        const requiredRank = FORESHADOW_RESOLUTION_STATUS_RANK[
          entry.expectedPayoffConditions.requiredResolutionStatus
        ];
        const actualRank = FORESHADOW_RESOLUTION_STATUS_RANK[
          parsedCandidate.resolutionStatus
        ];

        if (actualRank < requiredRank) {
          failedConditions.push({
            condition,
            reason:
              "payoff resolution status does not satisfy the registered closure requirement",
          });
        }
        break;
      }
    }
  }

  return {
    eligibleForClosure:
      missingConditions.length === 0 && failedConditions.length === 0,
    checkedConditions,
    missingConditions,
    failedConditions,
  };
}

function extractEpisodePayoffCandidate(
  foreshadowing: EpisodeForeshadowResolutionCandidateCarrier,
): ForeshadowPayoffCandidate | null {
  const rawCandidate = foreshadowing.payoff_candidate ?? foreshadowing.payoffCandidate;
  if (!rawCandidate) {
    return null;
  }

  const parsedCandidate = ForeshadowPayoffCandidateSchema.safeParse(rawCandidate);
  return parsedCandidate.success ? parsedCandidate.data : null;
}

export function gateEpisodeForeshadowFullResolution<
  T extends EpisodeForeshadowResolutionCandidateCarrier,
>(
  foreshadowing: T,
  entry?: ForeshadowRegistryEntry,
): T {
  const resolution = foreshadowing.resolution;
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) {
    return foreshadowing;
  }

  const derivedStatus = classifyForeshadowResolutionStatus({
    cause: (resolution as { cause?: unknown }).cause,
    identity: (resolution as { identity?: unknown }).identity,
    consequence: (resolution as { consequence?: unknown }).consequence,
  });
  if (derivedStatus !== "full") {
    return foreshadowing;
  }

  const candidate = extractEpisodePayoffCandidate(foreshadowing);
  const eligibility = entry && candidate
    ? evaluateForeshadowPayoffEligibility(entry, candidate)
    : null;
  if (eligibility?.eligibleForClosure) {
    const currentStatus = (resolution as { status?: unknown }).status;
    const nextStatus = isForeshadowResolutionStatus(currentStatus)
      ? currentStatus
      : "full";
    return {
      ...foreshadowing,
      lifecycle: nextStatus === "full" ? "resolved" : "pending",
      resolution: {
        ...(resolution as Record<string, unknown>),
        status: nextStatus,
      },
    };
  }

  const currentStatus = (resolution as { status?: unknown }).status;
  const nextStatus =
    isForeshadowResolutionStatus(currentStatus)
    && FORESHADOW_RESOLUTION_STATUS_RANK[currentStatus] < FORESHADOW_RESOLUTION_STATUS_RANK.partial
      ? currentStatus
      : "partial";

  return {
    ...foreshadowing,
    lifecycle: "pending",
    resolution: {
      ...(resolution as Record<string, unknown>),
      status: nextStatus,
    },
  };
}
