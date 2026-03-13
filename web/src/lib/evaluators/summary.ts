import type {
  ChapterSummary,
  ChapterEvent,
  CharacterChange,
  ForeshadowingTouch,
} from "../schema/chapter";

const EVENT_KEYWORDS: Record<string, string[]> = {
  battle: ["싸움", "전투", "공격", "방어", "검", "마법"],
  dialogue: ["말했다", "물었다", "대답했다", "속삭였다"],
  discovery: ["발견", "알게", "깨달", "비밀"],
  romance: ["심장", "두근", "사랑", "고백"],
};

export function extractSummaryFromLLM(
  chapterNumber: number,
  title: string,
  content: string,
  llmSummary: Record<string, unknown>,
): ChapterSummary {
  const events: ChapterEvent[] = [];
  for (const evt of (llmSummary.events as Array<Record<string, unknown>>) ||
    []) {
    events.push({
      type: ((evt.type as string) || "dialogue") as ChapterEvent["type"],
      participants: (evt.participants as string[]) || [],
      description: (evt.description as string) || "",
      outcome: (evt.outcome as string) || null,
      consequences: (evt.consequences as Record<string, string>) || {},
    });
  }

  const characterChanges: CharacterChange[] = [];
  for (const change of (llmSummary.character_changes as Array<
    Record<string, unknown>
  >) || []) {
    characterChanges.push({
      character_id: (change.character_id as string) || "",
      changes: (change.changes as Record<string, string>) || {},
    });
  }

  const foreshadowingTouched: ForeshadowingTouch[] = [];
  for (const fs of (llmSummary.foreshadowing_touched as Array<
    Record<string, unknown>
  >) || []) {
    foreshadowingTouched.push({
      foreshadowing_id: (fs.foreshadowing_id as string) || "",
      action: (fs.action as string) || "hint",
      context: (fs.context as string) || "",
    });
  }

  return {
    chapter_number: chapterNumber,
    title,
    events,
    character_changes: characterChanges,
    foreshadowing_touched: foreshadowingTouched,
    plot_summary: (llmSummary.plot_summary as string) || "",
    emotional_beat: (llmSummary.emotional_beat as string) || "",
    cliffhanger: (llmSummary.cliffhanger as string) || null,
    word_count: content.length,
    style_score: null,
  };
}

export function extractSummaryRuleBased(
  chapterNumber: number,
  title: string,
  content: string,
): ChapterSummary {
  const events: ChapterEvent[] = [];
  for (const [eventType, keywords] of Object.entries(EVENT_KEYWORDS)) {
    if (keywords.some((kw) => content.includes(kw))) {
      events.push({
        type: eventType as ChapterEvent["type"],
        participants: [],
        description: `Detected ${eventType} event`,
        outcome: null,
        consequences: {},
      });
    }
  }

  const paragraphs = content.split("\n\n").filter((p) => p.trim());
  const cliffhanger =
    paragraphs.length > 0
      ? paragraphs[paragraphs.length - 1].slice(0, 100)
      : null;
  const sentences = content.split(/[.!?]\s+/);
  const plotSummary = sentences.slice(0, 2).join(". ").slice(0, 200) + ".";

  return {
    chapter_number: chapterNumber,
    title,
    events: events.slice(0, 3),
    character_changes: [],
    foreshadowing_touched: [],
    plot_summary: plotSummary,
    emotional_beat: "unknown",
    cliffhanger,
    word_count: content.length,
    style_score: null,
  };
}
