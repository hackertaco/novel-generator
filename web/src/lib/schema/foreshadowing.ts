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
  if (chapter === fs.planted_at && fs.status === "pending") {
    return "plant";
  }
  if (fs.reveal_at && chapter === fs.reveal_at && fs.status === "planted") {
    return "reveal";
  }
  if (fs.hints_at.includes(chapter) && fs.status === "planted") {
    return "hint";
  }
  return null;
}
