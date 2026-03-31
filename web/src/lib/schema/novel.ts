import { z } from "zod";

import { CharacterSchema, type Character } from "./character";
import {
  ForeshadowingSchema,
  type Foreshadowing,
  type ForeshadowingAction,
  shouldAct,
} from "./foreshadowing";

// --- Schemas ---

export const PlotArcSchema = z.object({
  id: z.string().describe("Arc identifier (e.g., 'arc_1')"),
  name: z.string().describe("Arc name (e.g., '귀환편')"),
  start_chapter: z.number().int().describe("Starting chapter"),
  end_chapter: z.number().int().describe("Ending chapter"),
  summary: z.string().describe("Arc summary"),
  key_events: z.array(z.string()).describe("Major events in this arc"),
  climax_chapter: z.number().int().describe("Chapter with arc climax"),
  theme: z.string().optional().describe("Thematic summary for this arc"),
  tension_curve: z.array(z.number()).optional().describe("Tension level (1-10) per chapter in this arc"),
});

export type PlotArc = z.infer<typeof PlotArcSchema>;

export const ThreadRelationSchema = z.object({
  target: z.string().describe("Target thread ID"),
  relation: z.enum(["feeds_into", "conflicts_with", "blocked_by", "reveals"]).describe(
    "feeds_into: 이 스레드의 진전이 타겟을 도움. conflicts_with: 이 스레드가 타겟과 충돌. blocked_by: 타겟이 풀려야 이 스레드도 진전. reveals: 이 스레드가 타겟의 숨겨진 면을 드러냄"
  ),
  description: z.string().default("").describe("구체적 연결 (예: '음모 증거가 누명의 핵심 반증이 됨')"),
});

export const StoryThreadSchema = z.object({
  id: z.string().describe("Thread ID (e.g., 'main', 'romance', 'conspiracy')"),
  name: z.string().describe("Thread name (e.g., '암살 누명 벗기', '라시드와의 관계')"),
  type: z.enum(["main", "sub"]).default("sub").describe("Main thread or sub thread"),
  description: z.string().default("").describe("What this thread is about"),
  relations: z.array(ThreadRelationSchema).default([]).describe("이 스레드가 다른 스레드와 어떻게 연결되는지"),
});
export type StoryThread = z.infer<typeof StoryThreadSchema>;

export const PlotPointSchema = z.union([
  z.string(), // backward compat: plain string
  z.object({
    what: z.string().describe("무슨 일이 일어나는가"),
    why: z.string().default("").describe("왜 그런 일이 일어나는가 (내부 동기/원인)"),
    reveal: z.enum(["immediate", "delayed", "implicit"]).default("immediate").describe(
      "immediate: 독자에게 바로 설명. delayed: 숨기고 나중에 밝힘 (서스펜스). implicit: 힌트만 주고 추론하게 함"
    ),
    reveal_at: z.number().int().optional().describe("delayed일 때, 몇 화에서 밝히는지"),
    prerequisite: z.string().optional().describe("이 사건이 일어나려면 독자가 미리 알아야 할 전제 (예: '에단에게 마력이 있다')"),
  }),
]);

export const ChapterOutlineSchema = z.object({
  chapter_number: z.number().int(),
  title: z.string(),
  arc_id: z.string(),
  one_liner: z.string().describe("One sentence description"),
  opening_context: z.string().optional().describe("1화 전용: 독자에게 알려줄 초기 맥락 (배경, 시간, 장소, 주인공 처지)"),
  advances_thread: z.array(z.string()).default([]).describe("Which story_threads this chapter advances (IDs)"),
  key_points: z.array(PlotPointSchema).default([]).describe("Key plot points with what/why/reveal timing"),
  characters_involved: z.array(z.string()).default([]),
  tension_level: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Tension level 1-10"),
});

export type ChapterOutline = z.infer<typeof ChapterOutlineSchema>;

export const StyleGuideSchema = z.object({
  max_paragraph_length: z
    .number()
    .int()
    .default(3)
    .describe("Max sentences per paragraph"),
  dialogue_ratio: z
    .number()
    .min(0)
    .max(1)
    .default(0.6)
    .describe("Target dialogue ratio"),
  sentence_style: z
    .string()
    .default("short")
    .describe("Sentence style: short, punchy"),
  hook_ending: z
    .boolean()
    .default(true)
    .describe("Each chapter ends with hook"),
  pov: z.string().default("1인칭").describe("Point of view"),
  tense: z.string().default("과거형").describe("Tense"),
  formatting_rules: z.array(z.string()).default([
    "문단은 3문장 이하로",
    "대사 후 긴 지문 금지",
    "클리셰 표현 사용 가능 (장르 특성)",
    "매 회차 끝은 궁금증 유발",
  ]),
});

export type StyleGuide = z.infer<typeof StyleGuideSchema>;

// Helper: convert array to record when LLM outputs wrong format
function arrayToRecord(v: unknown): unknown {
  if (Array.isArray(v)) {
    const record: Record<string, string> = {};
    for (const item of v) {
      if (typeof item === "string") {
        const [key, ...rest] = item.split(/[:：]\s*/);
        record[key.trim()] = rest.join(":").trim() || key.trim();
      } else if (typeof item === "object" && item !== null) {
        // Handle [{name: "x", description: "y"}] format
        const obj = item as Record<string, unknown>;
        const name = String(obj.name || obj.id || obj.key || Object.values(obj)[0] || "");
        const desc = String(obj.description || obj.desc || obj.value || Object.values(obj)[1] || name);
        if (name) record[name] = desc;
      }
    }
    return record;
  }
  return v;
}

export const WorldSettingSchema = z.object({
  name: z.string().describe("World/setting name"),
  genre: z.string().describe("Genre (판타지, 현대, 무협, etc.)"),
  sub_genre: z.string().describe("Sub-genre (회귀, 빙의, 헌터, etc.)"),
  time_period: z.string().describe("Time period or era"),
  magic_system: z
    .string()
    .nullable()
    .default(null)
    .describe("Magic/power system"),
  key_locations: z
    .preprocess(arrayToRecord, z.record(z.string(), z.string()))
    .default({})
    .describe("Important locations"),
  factions: z
    .preprocess(arrayToRecord, z.record(z.string(), z.string()))
    .default({})
    .describe("Important groups/factions"),
  rules: z
    .array(z.string())
    .default([])
    .describe("World rules and constraints"),
});

export type WorldSetting = z.infer<typeof WorldSettingSchema>;

export const NovelSeedSchema = z.object({
  // Meta
  title: z.string().describe("Novel title"),
  logline: z.string().describe("One-sentence premise"),
  total_chapters: z.number().int().describe("Target total chapters"),

  // World
  world: WorldSettingSchema,

  // Characters (fixed, never compressed)
  characters: z.array(CharacterSchema).default([]),

  // Story threads (main plot + sub plots)
  story_threads: z.array(StoryThreadSchema).default([]).describe("메인 스레드 + 서브 스레드. 각 화는 최소 1개 스레드를 진전시켜야 함"),

  // Plot structure
  arcs: z.array(PlotArcSchema).default([]),
  chapter_outlines: z.array(ChapterOutlineSchema).default([]),

  // Foreshadowing (timeline set here)
  foreshadowing: z.array(ForeshadowingSchema).default([]),

  // Style (fixed)
  style: StyleGuideSchema.default({
    max_paragraph_length: 3,
    dialogue_ratio: 0.3,
    sentence_style: "short",
    hook_ending: true,
    pov: "1인칭",
    tense: "과거형",
    formatting_rules: [
      "문단은 3문장 이하로",
      "대사 후 긴 지문 금지",
      "클리셰 표현 사용 가능 (장르 특성)",
      "매 회차 끝은 궁금증 유발",
    ],
  }),
});

export type NovelSeed = z.infer<typeof NovelSeedSchema>;

// --- Helper Functions ---

/**
 * Get character by ID from the novel seed.
 */
export function getCharacter(
  seed: NovelSeed,
  characterId: string,
): Character | undefined {
  return seed.characters.find((char) => char.id === characterId);
}

/**
 * Get the arc that contains the given chapter.
 */
export function getArcForChapter(
  seed: NovelSeed,
  chapter: number,
): PlotArc | undefined {
  return seed.arcs.find(
    (arc) => arc.start_chapter <= chapter && chapter <= arc.end_chapter,
  );
}

/**
 * Get all foreshadowing actions needed for the given chapter.
 */
export function getForeshadowingActions(
  seed: NovelSeed,
  chapter: number,
): { foreshadowing: Foreshadowing; action: ForeshadowingAction }[] {
  const results: { foreshadowing: Foreshadowing; action: ForeshadowingAction }[] = [];
  for (const fs of seed.foreshadowing) {
    const action = shouldAct(fs, chapter);
    if (action !== null) {
      results.push({ foreshadowing: fs, action });
    }
  }
  return results;
}
