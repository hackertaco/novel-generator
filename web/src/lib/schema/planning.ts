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

/**
 * Regex that checks for at least one Korean proper-noun-like pattern:
 * 2+ consecutive Hangul characters followed by a subject/object particle.
 * This catches names like "이수련이", "레온을", "서연에게" etc.
 */
const KOREAN_NAME_PATTERN = /[가-힣]{2,}[이가은는을를에의과와]/;

export const SceneSpecSchema = z.object({
  purpose: z.string()
    .min(20, "씬 purpose는 20자 이상이어야 합니다 (구체적으로 쓰세요)")
    .describe("What this scene accomplishes — must include character names and specific actions"),
  type: SceneTypeEnum,
  characters: z.array(z.string()).default([]).describe("Character IDs in scene"),
  estimated_chars: z.number().int().default(1000).describe("Estimated character count"),
  emotional_tone: z.string().default("neutral").describe("Emotional tone of scene"),
  must_reveal: z.array(z.string()).default([]).describe("독자가 이 씬에서 반드시 알게 되어야 할 구체적 팩트 (예: '사형 서류에 서명이 누락됨', '범인은 북회랑에 있었음')"),
});
export type SceneSpec = z.infer<typeof SceneSpecSchema>;

// --- Foreshadowing action reference ---

export const ForeshadowingActionRefSchema = z.object({
  id: z.string(),
  action: z.string().transform((v) => {
    const valid = ["plant", "hint", "reveal"];
    return valid.includes(v) ? v : "hint";
  }) as unknown as z.ZodType<"plant" | "hint" | "reveal">,
});

// --- Chapter Blueprint (replaces ChapterOutline) ---

export const ArcRoleEnum = z.string().transform((val) => {
  const valid = ["setup", "rising_action", "midpoint", "escalation", "climax", "falling_action", "resolution", "transition"];
  return valid.includes(val) ? val : "rising_action"; // fallback for LLM typos like "development"
}) as unknown as z.ZodType<"setup" | "rising_action" | "midpoint" | "escalation" | "climax" | "falling_action" | "resolution" | "transition">;
export type ArcRole = z.infer<typeof ArcRoleEnum>;

export const ChapterBlueprintSchema = z
  .object({
    chapter_number: z.number().int(),
    title: z.string(),
    arc_id: z.string(),
    one_liner: z.string().describe("One sentence description"),
    role_in_arc: ArcRoleEnum.default("rising_action"),
    scenes: z.array(SceneSpecSchema).default([]),
    dependencies: z.array(z.union([z.string(), z.number().transform(String)])).default([]).describe("What this chapter needs from prior chapters"),
    target_word_count: z.number().int().optional().describe("Target char count; derived from scenes if omitted"),
    emotional_arc: z.string().default("").describe("e.g. 긴장→갈등→충격"),
    key_points: z.array(z.union([
      z.string(),
      z.object({ what: z.string(), why: z.string().optional(), reveal: z.string().optional() }).transform((o) => o.what),
    ])).default([]),
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
  id: z.string().default("arc_unknown"),
  name: z.string().default(""),
  part_id: z.string().default(""),
  start_chapter: z.number().int().default(1),
  end_chapter: z.number().int().default(10),
  summary: z.string().default(""),
  theme: z.string().default(""),
  key_events: z.array(z.string()).default([]),
  climax_chapter: z.number().int().default(5),
  tension_curve: z.array(z.number()).default([]).describe("Tension per chapter in this arc"),
  chapter_blueprints: z.array(ChapterBlueprintSchema).default([]),
});
export type ArcPlan = z.infer<typeof ArcPlanSchema>;

// --- Part Plan (50-70 chapters) ---

export const PartPlanSchema = z.object({
  id: z.string().default("part_unknown"),
  name: z.string().default(""),
  start_chapter: z.number().int().default(1),
  end_chapter: z.number().int().default(60),
  theme: z.string().default(""),
  core_conflict: z.string().default(""),
  resolution_target: z.string().default(""),
  estimated_chapter_count: z.number().int().default(60),
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
    min: z.number().int().default(60),
    max: z.number().int().default(200),
  }).default({ min: 60, max: 200 }),
  world_complexity: WorldComplexitySchema,
  parts: z.array(PartPlanSchema),
  global_foreshadowing_timeline: z.array(GlobalForeshadowingSchema).default([]),
});
export type MasterPlan = z.infer<typeof MasterPlanSchema>;
