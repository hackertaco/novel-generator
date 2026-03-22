import type {
  ChapterSummary,
  ChapterEvent,
  CharacterChange,
  ForeshadowingTouch,
} from "../schema/chapter";
import type { NovelSeed } from "../schema/novel";

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
    ending_scene_state: extractEndingSceneState(content),
    word_count: content.length,
    style_score: null,
  };
}

/**
 * Extract the scene state from the ending portion of a chapter.
 * Used to enforce continuity in the next chapter.
 */
function extractEndingSceneState(
  content: string,
  seed?: NovelSeed,
): ChapterSummary["ending_scene_state"] {
  // Use the last ~1000 chars for scene state extraction
  const ending = content.slice(-1000);

  // Time detection
  const timePatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /아침|새벽|해가 뜨|기상|아침 식사|조식|아침 햇/, label: "아침" },
    { pattern: /점심|낮|오후|한낮|정오/, label: "낮" },
    { pattern: /저녁|해질|석양|만찬|저녁 식사|석식|저녁 수프/, label: "저녁" },
    { pattern: /밤|야간|달빛|어둠|자정|취침|잠|촛불/, label: "밤" },
  ];
  let timeOfDay = "불명";
  for (const { pattern, label } of timePatterns) {
    if (pattern.test(ending)) {
      timeOfDay = label;
      break;
    }
  }

  // Location detection
  let location = "불명";
  const locationWords = [
    "식당", "서재", "침실", "복도", "정원", "거리", "광장", "성문",
    "숲", "마차", "객실", "연회장", "무도회장", "궁", "왕좌", "식탁",
    "방", "홀", "탑", "지하", "창고", "부엌", "발코니", "테라스",
  ];
  if (seed?.world.key_locations) {
    for (const [name] of Object.entries(seed.world.key_locations)) {
      if (ending.includes(name)) {
        location = name;
        break;
      }
    }
  }
  if (location === "불명") {
    for (const word of locationWords) {
      if (ending.includes(word)) {
        location = word;
        break;
      }
    }
  }

  // Characters present in ending
  const charactersPresent: string[] = [];
  if (seed) {
    for (const char of seed.characters) {
      if (ending.includes(char.name)) {
        charactersPresent.push(char.name);
      }
    }
  }

  // Ongoing action: last 2 paragraphs summarized
  const paragraphs = content.split("\n\n").filter((p) => p.trim());
  const lastParas = paragraphs.slice(-2).join(" ").slice(0, 200);

  // Unresolved tension: use cliffhanger detection
  const lastPara = paragraphs[paragraphs.length - 1] || "";
  const tensionIndicators = ["그때", "그런데", "하지만", "그 순간", "갑자기", "문이", "소리가"];
  const hasTension = tensionIndicators.some((t) => lastPara.includes(t));
  const unresolved = hasTension ? lastPara.slice(0, 150) : "특별한 긴장 없이 마무리";

  return {
    time_of_day: timeOfDay,
    location,
    characters_present: charactersPresent,
    ongoing_action: lastParas,
    unresolved_tension: unresolved,
  };
}

export function extractSummaryRuleBased(
  chapterNumber: number,
  title: string,
  content: string,
  seed?: NovelSeed,
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
      ? paragraphs[paragraphs.length - 1].slice(0, 200)
      : null;

  // Build a summary that captures beginning, middle, and end of the chapter
  const sentences = content.split(/[.!?。]\s+/).filter((s) => s.trim().length > 10);
  const summaryParts: string[] = [];
  // Beginning (first 2 sentences)
  if (sentences.length > 0) summaryParts.push(sentences.slice(0, 2).join(". "));
  // End (last 2 sentences — critical for continuity with next chapter)
  if (sentences.length > 4) {
    summaryParts.push("... " + sentences.slice(-2).join(". "));
  } else if (sentences.length > 2) {
    summaryParts.push("... " + sentences[sentences.length - 1]);
  }
  const plotSummary = summaryParts.join("").slice(0, 400) + ".";

  return {
    chapter_number: chapterNumber,
    title,
    events: events.slice(0, 3),
    character_changes: [],
    foreshadowing_touched: [],
    plot_summary: plotSummary,
    emotional_beat: "unknown",
    cliffhanger,
    ending_scene_state: extractEndingSceneState(content, seed),
    word_count: content.length,
    style_score: null,
  };
}
