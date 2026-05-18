import { z } from "zod";

// --- Enums ---

export const ForeshadowingAction = z.enum(["plant", "hint", "reveal"]);
export type ForeshadowingAction = z.infer<typeof ForeshadowingAction>;

// --- Schemas ---

export const ForeshadowSourceSpanSchema = z
  .object({
    start_offset: z
      .number()
      .int()
      .min(0)
      .describe("Zero-based inclusive start offset within the originating scene source"),
    end_offset: z
      .number()
      .int()
      .positive()
      .describe("Zero-based exclusive end offset within the originating scene source"),
    excerpt: z
      .string()
      .min(1)
      .optional()
      .describe("Optional excerpt copied from the originating scene span"),
  })
  .superRefine((value, ctx) => {
    if (value.end_offset <= value.start_offset) {
      ctx.addIssue({
        code: "custom",
        path: ["end_offset"],
        message: "end_offset must be greater than start_offset",
      });
    }
  });

export type ForeshadowSourceSpan = z.infer<typeof ForeshadowSourceSpanSchema>;

export const ForeshadowOriginSchema = z.object({
  episode_id: z
    .string()
    .min(1)
    .describe("Originating episode identifier where this foreshadowing was registered"),
  scene_id: z
    .string()
    .min(1)
    .describe("Originating scene identifier where this foreshadowing was registered"),
  source_span: ForeshadowSourceSpanSchema.describe(
    "Source span metadata for the originating evidence inside the scene",
  ),
});

export type ForeshadowOrigin = z.infer<typeof ForeshadowOriginSchema>;

export const ForeshadowHintOccurrenceSchema = ForeshadowOriginSchema.describe(
  "Structured provenance for a merged hint occurrence linked to this foreshadowing",
);

export type ForeshadowHintOccurrence = z.infer<
  typeof ForeshadowHintOccurrenceSchema
>;

export const ForeshadowVerificationMetadataSchema = z.object({
  source_episode_ids: z
    .array(z.string().min(1))
    .default([])
    .describe("Unique episode identifiers aggregated from every merged source occurrence"),
  source_scene_ids: z
    .array(z.string().min(1))
    .default([])
    .describe("Unique scene identifiers aggregated from every merged source occurrence"),
  source_occurrence_count: z
    .number()
    .int()
    .nonnegative()
    .default(0)
    .describe("Total number of merged source occurrences represented by this foreshadow item"),
  shared_target_summary: z
    .string()
    .default("")
    .describe("Verification-ready summary of the shared payoff target across merged source occurrences"),
});

export type ForeshadowVerificationMetadata = z.infer<
  typeof ForeshadowVerificationMetadataSchema
>;

export const ForeshadowLifecycleStatusSchema = z.enum([
  "pending",
  "resolved",
  "intentionally_abandoned",
]);
export type ForeshadowLifecycleStatus = z.infer<
  typeof ForeshadowLifecycleStatusSchema
>;

export const ForeshadowTerminalStateStatusSchema = z.enum([
  "resolved",
  "intentionally_abandoned",
]);
export type ForeshadowTerminalStateStatus = z.infer<
  typeof ForeshadowTerminalStateStatusSchema
>;

export const ForeshadowTerminalStateSourceSchema = z.enum([
  "lifecycle",
  "resolution",
  "abandonment_reason",
  "abandonment_marker",
]);
export type ForeshadowTerminalStateSource = z.infer<
  typeof ForeshadowTerminalStateSourceSchema
>;

export const ForeshadowTerminalStateSchema = z.object({
  status: ForeshadowTerminalStateStatusSchema,
  source: ForeshadowTerminalStateSourceSchema,
});
export type ForeshadowTerminalState = z.infer<
  typeof ForeshadowTerminalStateSchema
>;

export const ForeshadowIntentionalAbandonmentMarkerSchema = z.object({
  marker: z.string().min(1),
  source: z.literal("abandonment_marker"),
});
export type ForeshadowIntentionalAbandonmentMarker = z.infer<
  typeof ForeshadowIntentionalAbandonmentMarkerSchema
>;

type ForeshadowVerificationMetadataInput = {
  name?: string;
  description?: string;
  canonical_target?: string;
  origin?: ForeshadowOrigin | null;
  linked_hint_occurrences?: ForeshadowHintOccurrence[];
};

type ForeshadowDerivedStateInput = ForeshadowVerificationMetadataInput & {
  abandonment_marker?: unknown;
  abandonment_reason?: unknown;
  lifecycle?: unknown;
  resolution?: unknown;
};

function normalizeWhitespace(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function collectUniqueStrings(values: string[]): string[] {
  const unique = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

function isForeshadowOccurrenceCandidate(candidate: unknown): candidate is ForeshadowHintOccurrence {
  return Boolean(
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && normalizeWhitespace((candidate as { episode_id?: unknown }).episode_id)
    && normalizeWhitespace((candidate as { scene_id?: unknown }).scene_id),
  );
}

function listForeshadowOccurrences(
  foreshadowing: ForeshadowVerificationMetadataInput,
): ForeshadowHintOccurrence[] {
  const occurrences: ForeshadowHintOccurrence[] = [];

  if (isForeshadowOccurrenceCandidate(foreshadowing.origin)) {
    occurrences.push(foreshadowing.origin);
  }

  if (Array.isArray(foreshadowing.linked_hint_occurrences)) {
    for (const occurrence of foreshadowing.linked_hint_occurrences) {
      if (isForeshadowOccurrenceCandidate(occurrence)) {
        occurrences.push(occurrence);
      }
    }
  }

  return occurrences;
}

function buildSharedTargetSummary(
  foreshadowing: ForeshadowVerificationMetadataInput,
): string {
  return normalizeWhitespace(foreshadowing.description)
    || normalizeWhitespace(foreshadowing.canonical_target)
    || normalizeWhitespace(foreshadowing.name);
}

export function buildForeshadowVerificationMetadata(
  foreshadowing: ForeshadowVerificationMetadataInput,
): ForeshadowVerificationMetadata {
  const occurrences = listForeshadowOccurrences(foreshadowing);

  return {
    source_episode_ids: collectUniqueStrings(
      occurrences.map((occurrence) => occurrence.episode_id),
    ),
    source_scene_ids: collectUniqueStrings(
      occurrences.map((occurrence) => occurrence.scene_id),
    ),
    source_occurrence_count: occurrences.length,
    shared_target_summary: buildSharedTargetSummary(foreshadowing),
  };
}

function normalizeForeshadowLifecycleStatus(
  candidate: unknown,
): ForeshadowLifecycleStatus | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const normalized = candidate.trim().toLowerCase().replace(/\s+/g, "_");
  return ForeshadowLifecycleStatusSchema.options.includes(
    normalized as ForeshadowLifecycleStatus,
  )
    ? (normalized as ForeshadowLifecycleStatus)
    : null;
}

function deriveForeshadowLifecycleStatus(
  foreshadowing: ForeshadowDerivedStateInput,
): ForeshadowLifecycleStatus {
  const explicitLifecycle = normalizeForeshadowLifecycleStatus(
    foreshadowing.lifecycle,
  );
  if (explicitLifecycle) {
    return explicitLifecycle;
  }

  if (hasExplicitAbandonmentMetadata(foreshadowing)) {
    return "intentionally_abandoned";
  }

  const normalizedResolution = normalizeForeshadowResolutionStatus(
    foreshadowing.resolution,
  );
  if (
    normalizedResolution
    && typeof normalizedResolution === "object"
    && !Array.isArray(normalizedResolution)
  ) {
    const resolutionStatus = normalizeWhitespace(
      (normalizedResolution as { status?: unknown }).status,
    ).toLowerCase();
    if (resolutionStatus === "full") {
      return "resolved";
    }
  }

  return "pending";
}

function buildForeshadowDerivedState(
  foreshadowing: ForeshadowDerivedStateInput,
): {
  lifecycle: ForeshadowLifecycleStatus;
  verification_metadata: ForeshadowVerificationMetadata;
} {
  return {
    lifecycle: deriveForeshadowLifecycleStatus(foreshadowing),
    verification_metadata: buildForeshadowVerificationMetadata(foreshadowing),
  };
}

export function refreshForeshadowVerificationMetadata<
  T extends ForeshadowDerivedStateInput,
>(
  foreshadowing: T,
): T & {
  lifecycle: ForeshadowLifecycleStatus;
  verification_metadata: ForeshadowVerificationMetadata;
} {
  return Object.assign(foreshadowing, buildForeshadowDerivedState(foreshadowing));
}

function normalizeForeshadowDerivedMetadata(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const value = raw as Record<string, unknown>;
  return {
    ...value,
    ...buildForeshadowDerivedState(
      value as ForeshadowVerificationMetadataInput,
    ),
  };
}

function hasExplicitAbandonmentMetadata(
  foreshadowing: {
    abandonment_reason?: unknown;
    abandonment_marker?: unknown;
  },
): boolean {
  return Boolean(
    normalizeWhitespace(foreshadowing.abandonment_reason)
    || normalizeWhitespace(foreshadowing.abandonment_marker),
  );
}

function resolveForeshadowTerminalStateSource(
  foreshadowing: ForeshadowDerivedStateInput,
  lifecycle: ForeshadowLifecycleStatus,
): ForeshadowTerminalStateSource | null {
  if (lifecycle === "intentionally_abandoned") {
    if (normalizeWhitespace(foreshadowing.abandonment_marker)) {
      return "abandonment_marker";
    }
    if (normalizeWhitespace(foreshadowing.abandonment_reason)) {
      return "abandonment_reason";
    }
    return "lifecycle";
  }

  if (lifecycle !== "resolved") {
    return null;
  }

  const explicitLifecycle = normalizeForeshadowLifecycleStatus(
    foreshadowing.lifecycle,
  );
  return explicitLifecycle === "resolved" ? "lifecycle" : "resolution";
}

export function isForeshadowingIntentionallyAbandoned(
  foreshadowing: {
    lifecycle?: unknown;
    abandonment_reason?: unknown;
    abandonment_marker?: unknown;
  },
): boolean {
  return normalizeForeshadowLifecycleStatus(foreshadowing.lifecycle) === "intentionally_abandoned"
    || hasExplicitAbandonmentMetadata(foreshadowing);
}

export const ForeshadowResolutionStatusSchema = z.enum([
  "unresolved",
  "partial",
  "full",
]);
export type ForeshadowResolutionStatus = z.infer<
  typeof ForeshadowResolutionStatusSchema
>;

const FORESHADOW_RESOLUTION_STATUS_RANK: Record<ForeshadowResolutionStatus, number> = {
  unresolved: 0,
  partial: 1,
  full: 2,
};

const FORESHADOW_REVEAL_FACET_KEYS = [
  "cause",
  "identity",
  "consequence",
] as const;
type ForeshadowRevealFacetKey = typeof FORESHADOW_REVEAL_FACET_KEYS[number];

function isRevealedFacet(candidate: unknown): boolean {
  return Boolean(
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && (candidate as { revealed?: unknown }).revealed === true,
  );
}

export function classifyForeshadowResolutionStatus(
  resolution: Partial<Record<ForeshadowRevealFacetKey, unknown>>,
): ForeshadowResolutionStatus {
  const revealedCount = FORESHADOW_REVEAL_FACET_KEYS.filter((key) =>
    isRevealedFacet(resolution[key]),
  ).length;

  if (revealedCount === 0) {
    return "unresolved";
  }

  return revealedCount === FORESHADOW_REVEAL_FACET_KEYS.length
    ? "full"
    : "partial";
}

function isForeshadowResolutionStatus(candidate: unknown): candidate is ForeshadowResolutionStatus {
  return typeof candidate === "string"
    && candidate in FORESHADOW_RESOLUTION_STATUS_RANK;
}

function clampForeshadowResolutionStatus(
  derivedStatus: ForeshadowResolutionStatus,
  explicitStatus: unknown,
): ForeshadowResolutionStatus {
  if (!isForeshadowResolutionStatus(explicitStatus)) {
    return derivedStatus;
  }

  return FORESHADOW_RESOLUTION_STATUS_RANK[explicitStatus] < FORESHADOW_RESOLUTION_STATUS_RANK[derivedStatus]
    ? explicitStatus
    : derivedStatus;
}

function normalizeForeshadowResolutionStatus(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const value = raw as Record<string, unknown>;
  const derivedStatus = classifyForeshadowResolutionStatus({
    cause: value.cause,
    identity: value.identity,
    consequence: value.consequence,
  });

  return {
    ...value,
    status: clampForeshadowResolutionStatus(derivedStatus, value.status),
  };
}

export const ForeshadowRevealFacetSchema = z
  .object({
    revealed: z
      .boolean()
      .default(false)
      .describe("Whether this payoff facet has been explicitly revealed on-page"),
    chapter: z
      .number()
      .int()
      .positive()
      .nullable()
      .default(null)
      .describe("Chapter where this payoff facet was revealed, if known"),
    evidence: z
      .array(z.string().min(1))
      .default([])
      .describe("Concrete scene evidence showing how this facet was revealed"),
  })
  .superRefine((value, ctx) => {
    if (value.revealed && value.evidence.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "revealed facets must include at least one evidence entry",
      });
    }

    if (value.revealed && value.chapter === null) {
      ctx.addIssue({
        code: "custom",
        path: ["chapter"],
        message: "revealed facets must record the reveal chapter",
      });
    }

    if (!value.revealed && value.chapter !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["chapter"],
        message: "unrevealed facets cannot record a reveal chapter",
      });
    }
  });

export type ForeshadowRevealFacet = z.infer<typeof ForeshadowRevealFacetSchema>;

export const ForeshadowResolutionSchema = z.preprocess(
  normalizeForeshadowResolutionStatus,
  z
    .object({
      status: ForeshadowResolutionStatusSchema.default("unresolved").describe(
        "Resolution state for this foreshadow thread: unresolved, partial, or full",
      ),
      cause: ForeshadowRevealFacetSchema.default({
        revealed: false,
        chapter: null,
        evidence: [],
      }),
      identity: ForeshadowRevealFacetSchema.default({
        revealed: false,
        chapter: null,
        evidence: [],
      }),
      consequence: ForeshadowRevealFacetSchema.default({
        revealed: false,
        chapter: null,
        evidence: [],
      }),
    })
    .superRefine((value, ctx) => {
      const revealedCount = [
        value.cause.revealed,
        value.identity.revealed,
        value.consequence.revealed,
      ].filter(Boolean).length;

      if (value.status === "unresolved" && revealedCount > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "unresolved foreshadowing cannot mark payoff facets as revealed",
        });
      }

      if (value.status === "partial" && revealedCount === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "partial foreshadow resolution must reveal at least one payoff facet",
        });
      }

      if (value.status === "full" && revealedCount !== 3) {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "full foreshadow resolution requires cause, identity, and consequence to all be revealed",
        });
      }
    }),
);

export type ForeshadowResolution = z.infer<typeof ForeshadowResolutionSchema>;

const DEFAULT_FORESHADOW_RESOLUTION: ForeshadowResolution = {
  status: "unresolved",
  cause: {
    revealed: false,
    chapter: null,
    evidence: [],
  },
  identity: {
    revealed: false,
    chapter: null,
    evidence: [],
  },
  consequence: {
    revealed: false,
    chapter: null,
    evidence: [],
  },
};

export const ForeshadowingSchema = z.preprocess(
  normalizeForeshadowDerivedMetadata,
  z
    .object({
      id: z.string().describe("Unique foreshadowing identifier"),
      name: z.string().describe("Short name for reference"),
      description: z.string().describe("What this foreshadowing is about"),
      canonical_target: z
        .string()
        .min(1)
        .optional()
        .describe("Normalized target representing the hidden truth, cause, or future event this foreshadowing points to"),
      importance: z
        .string()
        .default("normal")
        .describe("Importance level: critical (must resolve), normal, minor"),

      // Timeline - set during Phase 0 plot approval
      planted_at: z.preprocess(
        (v) => (typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 1 : 1),
        z.number().int(),
      ).describe("Chapter where foreshadowing is planted"),
      hints_at: z
        .array(z.preprocess((v) => (typeof v === "number" ? v : parseInt(String(v), 10) || 0), z.number().int()))
        .default([])
        .describe("Chapters where hints are dropped"),
      reveal_at: z.preprocess(
        (v) => (typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || null : null),
        z.number().int().nullable(),
      ).default(null).describe("Chapter where foreshadowing is revealed"),

      origin: ForeshadowOriginSchema.optional().describe(
        "Structured provenance for the episode/scene/span that first introduced this foreshadowing",
      ),
      linked_hint_occurrences: z
        .array(ForeshadowHintOccurrenceSchema)
        .default([])
        .describe(
          "Ordered merged hint occurrence references with full provenance preserved, including same-chapter duplicates",
        ),
      verification_metadata: ForeshadowVerificationMetadataSchema.describe(
        "Pre-aggregated verification metadata for merged foreshadow items, including source episodes/scenes and the shared payoff target summary",
      ),
      lifecycle: ForeshadowLifecycleStatusSchema.default("pending").describe(
        "Foreshadow lifecycle state: pending until payoff closes, resolved when fully paid off, or intentionally_abandoned when explicitly retired without payoff",
      ),
      abandonment_reason: z
        .string()
        .min(1)
        .optional()
        .describe("Explicit reason explaining why this foreshadow thread was intentionally abandoned"),
      abandonment_marker: z
        .string()
        .min(1)
        .optional()
        .describe("Explicit marker or tag showing that this foreshadow thread was intentionally abandoned"),

      // State tracking
      status: z.string().default("pending").describe("pending, planted, revealed"),
      hint_count: z.number().int().default(0).describe("Number of hints given so far"),
      resolution: ForeshadowResolutionSchema.default(DEFAULT_FORESHADOW_RESOLUTION).describe(
        "Structured payoff tracking for partial/full resolution plus cause, identity, and consequence reveal evidence",
      ),
    })
    .superRefine((value, ctx) => {
      if (
        value.lifecycle === "intentionally_abandoned"
        && !hasExplicitAbandonmentMetadata(value)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["abandonment_reason"],
          message: "intentionally abandoned foreshadowing must include an abandonment reason or abandonment marker",
        });
      }
    }),
);

export type Foreshadowing = z.infer<typeof ForeshadowingSchema>;

export function buildForeshadowTerminalState(
  foreshadowing: ForeshadowDerivedStateInput,
): ForeshadowTerminalState | null {
  const lifecycle = deriveForeshadowLifecycleStatus(foreshadowing);
  if (lifecycle === "pending") {
    return null;
  }

  const source = resolveForeshadowTerminalStateSource(foreshadowing, lifecycle);
  if (!source) {
    return null;
  }

  return {
    status: lifecycle,
    source,
  };
}

export function buildForeshadowIntentionalAbandonmentMarker(
  foreshadowing: {
    abandonment_marker?: unknown;
  },
): ForeshadowIntentionalAbandonmentMarker | null {
  const marker = normalizeWhitespace(foreshadowing.abandonment_marker);
  if (!marker) {
    return null;
  }

  return {
    marker,
    source: "abandonment_marker",
  };
}

// --- Helper Functions ---

/**
 * Determine what action to take for this foreshadowing at the given chapter.
 */
export function shouldAct(
  fs: Foreshadowing,
  chapter: number,
): ForeshadowingAction | null {
  const legacy = fs as Foreshadowing & {
    plant_chapter?: number;
    hint_chapters?: number[];
    reveal_chapter?: number | null;
  };
  if (isForeshadowingIntentionallyAbandoned(legacy)) {
    return null;
  }
  const plantedAt = typeof legacy.planted_at === "number"
    ? legacy.planted_at
    : typeof legacy.plant_chapter === "number"
      ? legacy.plant_chapter
      : 1;
  const revealAt = typeof legacy.reveal_at === "number"
    ? legacy.reveal_at
    : typeof legacy.reveal_chapter === "number"
      ? legacy.reveal_chapter
      : null;
  const hintsAt = Array.isArray(legacy.hints_at)
    ? legacy.hints_at
    : Array.isArray(legacy.hint_chapters)
      ? legacy.hint_chapters
      : [];
  const status = typeof legacy.status === "string"
    ? legacy.status
    : "pending";

  if (chapter === plantedAt && status === "pending") {
    return "plant";
  }
  if (revealAt && chapter === revealAt && status === "planted") {
    return "reveal";
  }
  if (hintsAt.includes(chapter) && status === "planted") {
    return "hint";
  }
  return null;
}
