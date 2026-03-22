import { z } from "zod";

// --- Enums ---

export const EventType = z.enum([
  "battle",
  "dialogue",
  "discovery",
  "training",
  "romance",
  "betrayal",
  "death",
  "power_up",
  "flashback",
  "cliffhanger",
]);
export type EventType = z.infer<typeof EventType>;

// --- Schemas ---

export const ChapterEventSchema = z.object({
  type: EventType.describe("Type of event"),
  participants: z.array(z.string()).describe("Character IDs involved"),
  description: z.string().describe("Brief description of what happened"),
  outcome: z.string().nullable().default(null).describe("Result of the event"),
  consequences: z
    .record(z.string(), z.string())
    .default({})
    .describe("Consequences (e.g., {'주인공_부상': '왼팔'})"),
});

export type ChapterEvent = z.infer<typeof ChapterEventSchema>;

export const CharacterChangeSchema = z.object({
  character_id: z.string().describe("Character ID"),
  changes: z
    .record(z.string(), z.string())
    .describe("What changed (e.g., {'level': '5 → 6'})"),
});

export type CharacterChange = z.infer<typeof CharacterChangeSchema>;

export const ForeshadowingTouchSchema = z.object({
  foreshadowing_id: z.string().describe("Foreshadowing ID"),
  action: z.string().describe("plant, hint, or reveal"),
  context: z.string().describe("How it was presented in the chapter"),
});

export type ForeshadowingTouch = z.infer<typeof ForeshadowingTouchSchema>;

export const ChapterSummarySchema = z.object({
  chapter_number: z.number().int().describe("Chapter number"),
  title: z.string().describe("Chapter title"),

  // Structured data - for retrieval
  events: z.array(ChapterEventSchema).default([]),
  character_changes: z.array(CharacterChangeSchema).default([]),
  foreshadowing_touched: z.array(ForeshadowingTouchSchema).default([]),

  // Text summaries - for context injection
  plot_summary: z.string().describe("1-2 sentence plot summary"),
  emotional_beat: z.string().describe("Emotional tone/beat of the chapter"),
  cliffhanger: z
    .string()
    .nullable()
    .default(null)
    .describe("Cliffhanger if any"),

  // Scene state at chapter end — used to enforce continuity in the next chapter
  ending_scene_state: z.object({
    time_of_day: z.string().describe("시간대: 아침/낮/저녁/밤"),
    location: z.string().describe("마지막 장면의 장소"),
    characters_present: z.array(z.string()).describe("마지막 장면에 있던 캐릭터 이름"),
    ongoing_action: z.string().describe("진행 중이던 행동/상황 (예: 쪽지를 꺼내려는 순간)"),
    unresolved_tension: z.string().describe("아직 해소되지 않은 긴장/질문"),
  }).nullable().default(null).describe("화 마지막 시점의 장면 상태 — 다음 화 연속성 보장용"),

  // Validation
  word_count: z
    .number()
    .int()
    .default(0)
    .describe("Actual word count of chapter"),
  style_score: z
    .number()
    .nullable()
    .default(null)
    .describe("Kakao style compliance score 0-1"),
});

export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;
