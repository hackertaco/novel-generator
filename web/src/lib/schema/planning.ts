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
  purpose: z.string()
    .min(20, "씬 purpose는 20자 이상이어야 합니다 (구체적으로 쓰세요)")
    .describe("What this scene accomplishes — must include character names and specific actions"),
  type: SceneTypeEnum,
  characters: z.array(z.string()).default([]).describe("Character IDs in scene"),
  estimated_chars: z.number().int().default(1000).describe("Estimated character count"),
  emotional_tone: z.string().default("neutral").describe("Emotional tone of scene"),
  must_reveal: z.array(z.string()).default([]).describe("독자가 이 씬에서 반드시 알게 되어야 할 구체적 팩트 (예: '사형 서류에 서명이 누락됨', '범인은 북회랑에 있었음')"),
  triggered_by: z.string().optional().describe("이 씬이 시작되는 원인 — 직전 씬의 어떤 결과가 이 씬을 일으켰는가 (예: '조항 분석에서 루시안 없이는 못 버틴다는 결론')"),
  leads_to: z.string().optional().describe("이 씬의 결과가 다음 씬에 어떤 영향을 주는가 (예: '거래 조건 합의 → 장부 수거 계획')"),
  // 5W1H (육하원칙) fields for scene context
  who: z.string().optional().describe("주체 → 상대 (예: '레오나 → 카시안')"),
  when: z.string().optional().describe("시간적 맥락 (예: '계약 종료일 오후, 해가 지기 직전')"),
  where_detail: z.string().optional().describe("구체적 장소 묘사 (예: '헤르츠 공작저 서재. 벽면 전체가 장부철, 창밖으로 겨울 정원')"),
  how: z.string().optional().describe("행동 시퀀스 (예: '레오나가 서명 거부 → 청혼서를 증거로 가져감 → 연회 참석 선언')"),
  dialogue_turns: z.array(
    z.object({
      speaker: z.string().describe("화자 이름 또는 character_id"),
      intent: z.string().describe("이 턴의 의도 (예: '시간 벌기', '진실 떠보기', '결심 표명')"),
    })
  ).optional().describe(
    "이 씬의 대사 순서. 등장 캐릭터가 2명 이상이면 필수. " +
    "Writer는 이 순서대로 대사 작성하고 화자 태그를 누락해선 안 됨. " +
    "빈 배열이면 대사 없는 씬."
  ),
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

export const CliffhangerTypeEnum = z.string().transform((val) => {
  const valid = ["question", "crisis", "revelation", "twist"];
  return valid.includes(val) ? val : "question";
}) as unknown as z.ZodType<"question" | "crisis" | "revelation" | "twist">;
export type CliffhangerType = z.infer<typeof CliffhangerTypeEnum>;

export const ChapterSceneTypeEnum = z.string().transform((val) => {
  const valid = ["confrontation", "chase", "discovery", "negotiation", "escape", "infiltration", "revelation"];
  return valid.includes(val) ? val : "discovery";
}) as unknown as z.ZodType<"confrontation" | "chase" | "discovery" | "negotiation" | "escape" | "infiltration" | "revelation">;
export type ChapterSceneType = z.infer<typeof ChapterSceneTypeEnum>;

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
    /** 이 챕터에서 열 호기심 질문 */
    curiosity_hook: z.string().optional().describe("이 챕터에서 독자가 궁금해할 핵심 질문 1개"),
    /** 감정 피크 위치 (0-1, 기본 0.7) */
    emotional_peak_position: z.number().min(0).max(1).optional().describe("감정 피크 위치 (0-1, 기본 0.7)"),
    /** 챕터 끝 타입 */
    cliffhanger_type: CliffhangerTypeEnum.optional().describe("챕터 끝 타입: question, crisis, revelation, twist"),
    /** 시점 (1인칭/3인칭) */
    pov: z.string().optional().transform((val) => {
      if (!val) return undefined;
      return val === "first" ? "first" : "third";
    }).describe("시점: first(1인칭) or third(3인칭). 기본값 third") as unknown as z.ZodOptional<z.ZodType<"first" | "third">>,
    /** 시점 인물 (1인칭일 때 화자, 3인칭일 때 초점 인물) */
    pov_character: z.string().optional().describe("시점 인물 이름"),
    /** 챕터 씬 타입 (구조 다양성 확보용) */
    scene_type: ChapterSceneTypeEnum.optional().describe("챕터 핵심 씬 타입: confrontation, chase, discovery, negotiation, escape, infiltration, revelation"),
    /** 주인공 능동적 행동 (수동 금지) */
    protagonist_action: z.string().optional().describe("주인공이 ~한다 형태의 능동적 행동 (예: '리아가 비밀문을 통해 에단을 안고 도주한다')"),
    /** 긴장 장치 (연속 2챕터 같은 장치 금지) */
    tension_device: z.string().optional().transform((val) => {
      if (!val) return undefined;
      const valid = ["door_threat", "document", "deadline", "witness", "betrayal", "discovery", "confrontation"];
      return valid.includes(val) ? val : undefined;
    }).describe("이 챕터의 핵심 긴장 장치") as unknown as z.ZodOptional<z.ZodType<"door_threat" | "document" | "deadline" | "witness" | "betrayal" | "discovery" | "confrontation">>,
    /** 핵심 물리적 행동 */
    action_beat: z.string().optional().describe("이 챕터의 핵심 물리적 행동 (예: '리세가 시종 통로로 도주한다')"),
    /** 이 회차의 내적 시간 범위 */
    internal_time_span: z.object({
      start: z.string().describe("시작 시점 (예: '새벽 5시', '축제 전날 저녁', '2화 마지막 장면 직후')"),
      end: z.string().describe("종료 시점 (예: '오전 10시', '자정', '다음날 새벽')"),
      duration_hours: z.number().optional().describe("대략 시간 (단위: 시간). 하루 이상이면 24 * days"),
    }).optional().describe(
      "이 회차가 담는 소설 내 시간 범위. 명시하지 않으면 Writer가 시간을 끝없이 늘림. " +
      "Part/Arc 시간 배분의 기본 단위."
    ),
    /** 이 화 기준 이미 확립된 사실 (서사 루프 방지용) */
    already_established: z.array(z.string()).optional().describe(
      "이전 화들에서 이미 독자가 알게 된 핵심 사실 리스트. " +
      "Writer는 이 사실을 '재발견/재설명'하지 않아야 함. " +
      "FactLedger로부터 자동 주입 가능."
    ),
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
  power_system_depth: z.string().default("moderate").transform((val) => {
    const valid = ["shallow", "moderate", "deep"];
    return valid.includes(val) ? val : "moderate";
  }) as unknown as z.ZodType<"shallow" | "moderate" | "deep">,
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
