import { z } from "zod";

// --- Enums ---

export const ForeshadowingAction = z.enum(["plant", "hint", "reveal"]);
export type ForeshadowingAction = z.infer<typeof ForeshadowingAction>;

// --- Schemas ---

export const ForeshadowingSchema = z.object({
  id: z.string().describe("Unique foreshadowing identifier"),
  name: z.string().describe("Short name for reference"),
  description: z.string().describe("What this foreshadowing is about"),
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

  // State tracking
  status: z.string().default("pending").describe("pending, planted, revealed"),
  hint_count: z.number().int().default(0).describe("Number of hints given so far"),
});

export type Foreshadowing = z.infer<typeof ForeshadowingSchema>;

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
