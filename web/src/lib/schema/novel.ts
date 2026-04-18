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
  relation: z.string().default("feeds_into").describe(
    "feeds_into/conflicts_with/blocked_by/reveals"
  ),
  description: z.string().default("").describe("구체적 연결"),
});

export const RevealTimelineEntrySchema = z.object({
  chapter_range: z.string().describe("챕터 범위 (예: '1-10', '15', '40-60')"),
  to: z.string().default("reader").describe(
    "reader/protagonist/love_interest/public/specific"
  ),
  to_name: z.string().optional().describe("to가 'specific'일 때, 어떤 캐릭터에게 공개되는지"),
  level: z.string().default("hidden").describe(
    "hidden/hinted/partial/revealed"
  ),
  method: z.string().describe("공개 방법 (예: '독백', '문서 발견', '대화 중 실수', '목격')"),
});

export type RevealTimelineEntry = z.infer<typeof RevealTimelineEntrySchema>;

export const StoryThreadSchema = z.object({
  id: z.string().describe("Thread ID (e.g., 'main', 'romance', 'conspiracy')"),
  name: z.string().describe("Thread name (e.g., '암살 누명 벗기', '라시드와의 관계')"),
  type: z.string().default("sub").describe(
    "main/sub/secret/emotion/plot_twist/relationship"
  ),
  owner: z.string().optional().describe("이 스레드를 소유한 캐릭터 이름 (비밀/감정 스레드인 경우)"),
  description: z.string().default("").describe("What this thread is about"),
  relations: z.array(ThreadRelationSchema).default([]).describe("이 스레드가 다른 스레드와 어떻게 연결되는지"),
  reveal_timeline: z.array(RevealTimelineEntrySchema).default([]).describe(
    "공개 타임라인 — 이 스레드의 정보가 언제, 누구에게, 어떻게 공개되는지"
  ),
});
export type StoryThread = z.infer<typeof StoryThreadSchema>;

export const PlotPointSchema = z.union([
  z.string(), // backward compat: plain string
  z.object({
    what: z.string().describe("무슨 일이 일어나는가"),
    why: z.string().default("").describe("왜 그런 일이 일어나는가 (내부 동기/원인)"),
    caused_by: z.string().optional().describe("이전 화의 어떤 사건이 이것을 일으켰는가 (예: '1화에서 족쇄가 깨진 충격')"),
    consequence: z.string().optional().describe("이 사건 때문에 무엇이 바뀌는가 (예: '이후 칼리언이 리에나를 더 가까이 두려 함')"),
    reveal: z.enum(["immediate", "delayed", "implicit"]).default("immediate").describe(
      "immediate: 독자에게 바로 설명. delayed: 숨기고 나중에 밝힘 (서스펜스). implicit: 힌트만 주고 추론하게 함"
    ),
    reveal_at: z.number().int().optional().describe("delayed일 때, 몇 화에서 밝히는지"),
    prerequisite: z.string().optional().describe("이 사건이 일어나려면 독자가 미리 알아야 할 전제 (예: '에단에게 마력이 있다')"),
    different_from_prev: z.string().optional().describe("이전 화와 비슷한 상황이 반복될 때, 어떻게 달라야 하는지 (예: '3화에서는 울며 매달렸지만, 이번에는 말없이 손만 잡는다')"),
    requires_items: z.array(z.string()).optional().describe("이 사건에 필요한 소품/물건 (예: ['자수 조각', '봉인 장부']). 이전 화에서 등장한 물건이면 반드시 재활용."),
    returning_character: z.string().optional().describe("이 사건에서 재등장하는 기존 인물과 이유 (예: '마르타 — 세탁실 인맥을 통해 명단 루트 제공')"),
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
  new_info_for_reader: z.string().optional().describe("이 화에서 독자에게 새로 주는 핵심 정보 1~2개 (예: '자수 조각의 숫자가 장부 좌표임을 알게 됨'). 이것 외의 정보는 보류."),
  recurring_items: z.array(z.string()).optional().describe("이전 화에서 등장했고 이번 화에서 다시 쓰이는 소품 (예: ['자수 조각', '봉인 열쇠'])"),
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

export const ExtendedOutlineSchema = z.object({
  chapter_number: z.number().int(),
  title: z.string(),
  one_liner: z.string(),
  reveals: z.array(z.string()).default([]).describe("Which story_thread IDs get advanced this chapter"),
});

export type ExtendedOutline = z.infer<typeof ExtendedOutlineSchema>;

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

  // Extended outlines — lightweight (title + one_liner) for chapters beyond the initial 10
  extended_outlines: z.array(ExtendedOutlineSchema).default([]).describe(
    "Part-level outlines for chapters beyond the initial detailed 10. Generated per-Part as needed."
  ),

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

// --- Reveal Timeline Helpers ---

/**
 * Parse a chapter_range string (e.g., "1-10", "15", "40-60") and check
 * whether a given chapter number falls within it.
 */
function chapterInRange(chapterRange: string, chapter: number): boolean {
  const trimmed = chapterRange.trim();
  if (trimmed.includes("-")) {
    const [startStr, endStr] = trimmed.split("-");
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end)) return false;
    return chapter >= start && chapter <= end;
  }
  const single = parseInt(trimmed, 10);
  return !isNaN(single) && chapter === single;
}

export interface ActiveThreadReveal {
  thread: StoryThread;
  /** The reveal level for this chapter (the last matching entry wins) */
  level: "hidden" | "hinted" | "partial" | "revealed";
  /** Who the reveal targets */
  to: string;
  to_name?: string;
  /** How the reveal happens */
  method: string;
}

/**
 * Get all story threads that have a reveal_timeline entry covering the
 * given chapter, along with their current reveal level.
 *
 * If a thread has no reveal_timeline, it is skipped.
 * If multiple entries match, the last matching entry wins (most specific).
 */
export function getActiveThreadsForChapter(
  threads: StoryThread[],
  chapterNumber: number,
): ActiveThreadReveal[] {
  const results: ActiveThreadReveal[] = [];
  for (const thread of threads) {
    if (!thread.reveal_timeline || thread.reveal_timeline.length === 0) continue;
    // Find the last matching entry for this chapter
    let matched: RevealTimelineEntry | null = null;
    for (const entry of thread.reveal_timeline) {
      if (chapterInRange(entry.chapter_range, chapterNumber)) {
        matched = entry;
      }
    }
    if (matched) {
      results.push({
        thread,
        level: matched.level,
        to: matched.to,
        to_name: matched.to_name,
        method: matched.method,
      });
    }
  }
  return results;
}

/**
 * Format active thread reveals into a Korean-language guide string
 * for use in writer/blueprint prompts.
 */
export function formatThreadRevealsForPrompt(
  reveals: ActiveThreadReveal[],
): string {
  if (reveals.length === 0) return "";
  const lines = reveals.map((r) => {
    const ownerStr = r.thread.owner ? `${r.thread.owner}의 ` : "";
    const targetStr = r.to === "specific" && r.to_name
      ? `→ ${r.to_name}에게`
      : `→ ${r.to}에게`;
    const levelInstructions: Record<string, string> = {
      hidden: "절대 드러내지 마세요. 행동으로만 간접 암시.",
      hinted: "독자가 '뭔가 있다'고 느끼게만 하세요. 직접 언급 금지.",
      partial: "부분적으로 드러내세요. 전체 그림은 아직 숨기세요.",
      revealed: "완전히 공개하세요. 독자와 해당 캐릭터가 확실히 알게 하세요.",
    };
    return `- ${ownerStr}${r.thread.name}: [${r.level}] ${targetStr} — ${levelInstructions[r.level] || ""}\n  방법: ${r.method}`;
  });
  return lines.join("\n");
}
