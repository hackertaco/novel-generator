import { z } from "zod";

// ---------------------------------------------------------------------------
// Direction Design Schema — 연출 설계
//
// Sits between seed generation and blueprint generation.
// Provides narrative direction metadata that guides how the story is told.
// ---------------------------------------------------------------------------

export const AddressEntrySchema = z.object({
  from: z.string().describe("화자 (speaker)"),
  to: z.string().describe("상대 (addressee)"),
  address: z.string().describe("호칭 — '공작님', '레오나', '아가씨' 등"),
  speech_level: z.enum(["formal", "polite", "casual", "intimate"]).describe(
    "formal: 격식체, polite: 존댓말, casual: 반말, intimate: 아주 친밀한 반말"
  ),
  note: z.string().optional().describe("조건부 규칙 — '공식 석상에서만 존대', '둘이 있을 때만 이름' 등"),
});

export type AddressEntry = z.infer<typeof AddressEntrySchema>;

export const InfoBudgetSchema = z.object({
  chapter_range: z.string().describe("챕터 범위 — '1-3', '4-10', '11-30'"),
  new_characters_max: z.number().int().describe("이 구간에서 새로 등장 가능한 캐릭터 수"),
  new_concepts_max: z.number().int().describe("이 구간에서 새로 도입 가능한 개념/설정 수"),
  worldbuilding_style: z.enum(["action_only", "brief_aside", "narration_ok"]).describe(
    "action_only: 행동 속에서만. brief_aside: 짧은 곁들임 가능. narration_ok: 서술 허용"
  ),
  backstory_allowed: z.enum(["none", "one_sentence", "brief_flashback", "full_scene"]).describe(
    "none: 과거 회상 금지. one_sentence: 한 문장. brief_flashback: 짧은 회상. full_scene: 회상 씬 가능"
  ),
  info_priority: z.array(z.string()).describe("이 구간에서 공개할 정보 우선순위 (순서대로)"),
});

export type InfoBudget = z.infer<typeof InfoBudgetSchema>;

export const EmotionTargetSchema = z.object({
  chapter_range: z.string().describe("챕터 범위"),
  primary_emotion: z.string().describe("주된 감정 — '궁금', '긴장', '카타르시스', '분노', '설렘' 등"),
  tension_range: z.string().describe("긴장도 변화 — '3→7' 또는 'steady 5'"),
  reader_question: z.string().describe("독자가 가져야 할 핵심 질문 — '이 남자의 진짜 목적은?'"),
});

export type EmotionTarget = z.infer<typeof EmotionTargetSchema>;

export const HookStrategySchema = z.object({
  opening_scene: z.string().describe("1화 오프닝 장면 — '독화살이 날아오는 혼례식 한가운데'"),
  reader_knows_in_3_paragraphs: z.array(z.string()).describe(
    "3문단 안에 독자가 알아야 할 것 — ['주인공은 적국 공주', '정략 결혼', '누군가 황제를 죽이려 함']"
  ),
  reader_must_NOT_know: z.array(z.string()).describe(
    "1화에서 절대 공개하면 안 되는 것 — ['황제가 이미 알고 있었다는 사실']"
  ),
  emotional_hook: z.string().describe("감정적 후킹 포인트 — '죽을 수도 있는 상황에서 냉정한 주인공의 매력'"),
});

export type HookStrategy = z.infer<typeof HookStrategySchema>;

export const DirectionDesignSchema = z.object({
  address_matrix: z.array(AddressEntrySchema).default([]),
  info_budget: z.array(InfoBudgetSchema).default([]),
  emotion_curve: z.array(EmotionTargetSchema).default([]),
  hook_strategy: HookStrategySchema.optional(),
});

export type DirectionDesign = z.infer<typeof DirectionDesignSchema>;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Parse a chapter_range string and check if a chapter falls within it.
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

/**
 * Get address entries relevant to a set of character names.
 */
export function getAddressEntriesForCharacters(
  design: DirectionDesign,
  characterNames: string[],
): AddressEntry[] {
  const nameSet = new Set(characterNames);
  return design.address_matrix.filter(
    (e) => nameSet.has(e.from) || nameSet.has(e.to),
  );
}

/**
 * Get the info budget for a given chapter number.
 * Returns the most specific matching budget (last match wins).
 */
export function getInfoBudgetForChapter(
  design: DirectionDesign,
  chapterNumber: number,
): InfoBudget | undefined {
  let matched: InfoBudget | undefined;
  for (const budget of design.info_budget) {
    if (chapterInRange(budget.chapter_range, chapterNumber)) {
      matched = budget;
    }
  }
  return matched;
}

/**
 * Get the emotion target for a given chapter number.
 */
export function getEmotionTargetForChapter(
  design: DirectionDesign,
  chapterNumber: number,
): EmotionTarget | undefined {
  let matched: EmotionTarget | undefined;
  for (const target of design.emotion_curve) {
    if (chapterInRange(target.chapter_range, chapterNumber)) {
      matched = target;
    }
  }
  return matched;
}

/**
 * Format address entries into a Korean-language guide string for writer prompts.
 */
export function formatAddressMatrixForPrompt(entries: AddressEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => {
    const noteStr = e.note ? ` (${e.note})` : "";
    const levelLabels: Record<string, string> = {
      formal: "격식체",
      polite: "존댓말",
      casual: "반말",
      intimate: "친밀한 반말",
    };
    return `- ${e.from}→${e.to}: "${e.address}" [${levelLabels[e.speech_level] || e.speech_level}]${noteStr}`;
  });
  return lines.join("\n");
}

/**
 * Format info budget into a Korean-language guide string for prompts.
 */
export function formatInfoBudgetForPrompt(budget: InfoBudget): string {
  const styleLabels: Record<string, string> = {
    action_only: "행동으로만 전달",
    brief_aside: "짧은 설명 허용",
    narration_ok: "서술 허용",
  };
  const backstoryLabels: Record<string, string> = {
    none: "과거 회상 금지",
    one_sentence: "한 문장 회상만",
    brief_flashback: "짧은 회상 가능",
    full_scene: "회상 씬 가능",
  };

  const lines: string[] = [
    `새 캐릭터: 최대 ${budget.new_characters_max}명`,
    `새 개념/설정: 최대 ${budget.new_concepts_max}개`,
    `세계관 전달: ${styleLabels[budget.worldbuilding_style] || budget.worldbuilding_style}`,
    `과거 회상: ${backstoryLabels[budget.backstory_allowed] || budget.backstory_allowed}`,
  ];

  if (budget.info_priority.length > 0) {
    lines.push(`공개 우선순위: ${budget.info_priority.join(" → ")}`);
  }

  return lines.join("\n");
}

/**
 * Format emotion target into a Korean-language guide string for prompts.
 */
export function formatEmotionTargetForPrompt(target: EmotionTarget): string {
  return `감정: ${target.primary_emotion} | 긴장도: ${target.tension_range} | 독자 질문: "${target.reader_question}"`;
}

/**
 * Format hook strategy into a Korean-language guide string for chapter 1 prompts.
 */
export function formatHookStrategyForPrompt(hook: HookStrategy): string {
  const lines: string[] = [
    `오프닝: ${hook.opening_scene}`,
    `3문단 안에 독자가 알 것: ${hook.reader_knows_in_3_paragraphs.join(", ")}`,
    `절대 공개 금지: ${hook.reader_must_NOT_know.join(", ")}`,
    `감정 훅: ${hook.emotional_hook}`,
  ];
  return lines.join("\n");
}
