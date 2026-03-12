import { z } from "zod";

// --- Scene within a chapter ---

export const SceneTypeEnum = z.enum([
  "action",
  "dialogue",
  "introspection",
  "exposition",
  "hook",
  "flashback",
  "transition",
]);
export type SceneType = z.infer<typeof SceneTypeEnum>;

export const SceneSpecSchema = z.object({
  purpose: z.string().describe("What this scene accomplishes"),
  type: SceneTypeEnum,
  characters: z.array(z.string()).default([]).describe("Character IDs in scene"),
  estimated_chars: z.number().int().default(1000).describe("Estimated character count"),
  emotional_tone: z.string().default("neutral").describe("Emotional tone of scene"),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

// --- Foreshadowing action reference ---

export const ForeshadowingActionRefSchema = z.object({
  id: z.string(),
  action: z.enum(["plant", "hint", "reveal"]),
});

// --- Chapter Blueprint (replaces ChapterOutline) ---

export const ArcRoleEnum = z.enum([
  "setup",
  "rising_action",
  "midpoint",
  "escalation",
  "climax",
  "falling_action",
  "resolution",
  "transition",
]);
export type ArcRole = z.infer<typeof ArcRoleEnum>;

export const ChapterBlueprintSchema = z
  .object({
    chapter_number: z.number().int(),
    title: z.string(),
    arc_id: z.string(),
    one_liner: z.string().describe("One sentence description"),
    role_in_arc: ArcRoleEnum.default("rising_action"),
    scenes: z.array(SceneSpecSchema).default([]),
    dependencies: z.array(z.string()).default([]).describe("What this chapter needs from prior chapters"),
    target_word_count: z.number().int().optional().describe("Target char count; derived from scenes if omitted"),
    emotional_arc: z.string().default("").describe("e.g. 긴장→갈등→충격"),
    key_points: z.array(z.string()).default([]),
    characters_involved: z.array(z.string()).default([]),
    tension_level: z.number().int().min(1).max(10).default(5),
    foreshadowing_actions: z.array(ForeshadowingActionRefSchema).default([]),
  })
  .transform((data) => ({
    ...data,
    target_word_count:
      data.target_word_count ??
      (data.scenes.length > 0
        ? data.scenes.reduce((sum, s) => sum + s.estimated_chars, 0)
        : 3000),
  }));
export type ChapterBlueprint = z.infer<typeof ChapterBlueprintSchema>;

// --- Arc Plan (10-15 chapters) ---

export const ArcPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  part_id: z.string().default(""),
  start_chapter: z.number().int(),
  end_chapter: z.number().int(),
  summary: z.string(),
  theme: z.string().default(""),
  key_events: z.array(z.string()).default([]),
  climax_chapter: z.number().int(),
  tension_curve: z.array(z.number()).default([]).describe("Tension per chapter in this arc"),
  chapter_blueprints: z.array(ChapterBlueprintSchema).default([]),
});
export type ArcPlan = z.infer<typeof ArcPlanSchema>;

// --- Part Plan (50-70 chapters) ---

export const PartPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_chapter: z.number().int(),
  end_chapter: z.number().int(),
  theme: z.string(),
  core_conflict: z.string(),
  resolution_target: z.string().default(""),
  estimated_chapter_count: z.number().int(),
  arcs: z.array(ArcPlanSchema).default([]),
  transition_to_next: z.string().default("").describe("How this part hands off to the next"),
});
export type PartPlan = z.infer<typeof PartPlanSchema>;

// --- World Complexity Assessment ---

export const WorldComplexitySchema = z.object({
  faction_count: z.number().int().default(0),
  location_count: z.number().int().default(0),
  power_system_depth: z.enum(["shallow", "moderate", "deep"]).default("moderate"),
  subplot_count: z.number().int().default(0),
});
export type WorldComplexity = z.infer<typeof WorldComplexitySchema>;

// --- Global Foreshadowing ---

export const GlobalForeshadowingSchema = z.object({
  id: z.string(),
  plant_part: z.string(),
  reveal_part: z.string(),
  description: z.string(),
});

// --- Master Plan (top level) ---

export const MasterPlanSchema = z.object({
  estimated_total_chapters: z.object({
    min: z.number().int(),
    max: z.number().int(),
  }),
  world_complexity: WorldComplexitySchema,
  parts: z.array(PartPlanSchema),
  global_foreshadowing_timeline: z.array(GlobalForeshadowingSchema).default([]),
});
export type MasterPlan = z.infer<typeof MasterPlanSchema>;
