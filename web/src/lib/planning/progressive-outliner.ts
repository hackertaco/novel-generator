/**
 * Progressive Detailed Outliner
 *
 * Generates detailed chapter outlines (with key_points) from one-liner
 * extended outlines, using accumulated world state as context.
 * Triggered when chapters 11+ are about to be generated and only one-liners exist.
 */

import { z } from "zod";
import { getAgent } from "../agents/llm-agent";
import type { NovelSeed, ChapterOutline } from "../schema/novel";
import { ChapterOutlineSchema } from "../schema/novel";
import type { WorldStateManager } from "../memory/world-state-manager";

const DetailedOutlinesResponseSchema = z.object({
  outlines: z.array(ChapterOutlineSchema),
});

export interface ProgressiveOutlinerInput {
  seed: NovelSeed;
  startChapter: number;
  endChapter: number;
  worldState?: WorldStateManager;
  previousSummaries: Array<{ chapter: number; summary: string }>;
}

/**
 * Generate detailed chapter outlines from one-liners for a range of chapters.
 * Uses world state (facts + character states) and previous summaries as context.
 */
export async function generateDetailedOutlines(
  input: ProgressiveOutlinerInput,
): Promise<ChapterOutline[]> {
  const { seed, startChapter, endChapter, worldState, previousSummaries } = input;
  const agent = getAgent();

  // Collect one-liners for the range from extended_outlines
  const extOutlines = (seed.extended_outlines || []).filter(
    (o) => o.chapter_number >= startChapter && o.chapter_number <= endChapter,
  );

  if (extOutlines.length === 0) {
    console.warn(`[progressive-outliner] ${startChapter}~${endChapter}화 extended_outlines 없음`);
    return [];
  }

  // Build context from world state
  const worldContext = worldState
    ? worldState.formatForWriter(startChapter)
    : "";

  // Recent summaries (last 5)
  const recentSummaries = previousSummaries.slice(-5);
  const summaryBlock = recentSummaries.length > 0
    ? recentSummaries.map((s) => `${s.chapter}화: ${s.summary}`).join("\n")
    : "";

  // One-liners for the target range
  const oneLinerBlock = extOutlines
    .map((o) => `${o.chapter_number}화: ${o.title} — ${o.one_liner}`)
    .join("\n");

  // Character list
  const charBlock = seed.characters
    .map((c) => `${c.name}(${c.role}): ${c.voice.personality_core}`)
    .join("\n");

  const prompt = `다음 원라이너를 상세 아웃라인으로 확장하세요.

# 소설 정보
제목: ${seed.title} | 장르: ${seed.world.genre}
로그라인: ${seed.logline}

# 캐릭터
${charBlock}

# 이전 요약
${summaryBlock}

${worldContext ? `# 세계 상태\n${worldContext}\n` : ""}

# 확장할 원라이너 (${startChapter}~${endChapter}화)
${oneLinerBlock}

# 출력 (JSON)
각 화에 대해:
- chapter_number, title, arc_id (빈 문자열 가능)
- one_liner (기존 유지)
- key_points: 2-4개 핵심 사건 (문자열 배열)
- characters_involved: 등장 캐릭터 ID 배열
- tension_level: 1-10
- advances_thread: 관련 스레드 ID 배열 (없으면 빈 배열)

{"outlines": [...]}

규칙:
- 세계 상태와 모순되지 않도록
- 이전 요약에서 이어지는 자연스러운 전개
- key_points는 구체적 사건 (추상적 표현 금지)
- 같은 캐릭터가 비슷한 상황을 반복할 때, 이전 화와 어떻게 달라야 하는지 명시하세요 (예: "3화에서는 울며 매달렸지만, 이번에는 말없이 손만 잡는다")
- **인과관계 필수**: key_points를 문자열이 아닌 객체(what/why/caused_by/consequence/prerequisite)로 작성하세요:
  - caused_by: 이전 화의 어떤 사건이 이것을 일으켰는가?
  - consequence: 이 사건 때문에 무엇이 바뀌는가?
  - prerequisite: 독자가 이 사건을 납득하려면 사전에 무엇을 알아야 하는가?
  ❌ 갑자기 일어나는 사건 (원인 없음), 아무 결과 없는 사건 (결과 없음)
  ✅ 이전 화 사건 → 이번 화 사건 → 다음 화에 영향 (인과 사슬)
- JSON만 출력`;

  try {
    const result = await agent.callStructured({
      prompt,
      system: "소설 플래닝 전문가. 원라이너를 상세 아웃라인으로 확장합니다. JSON만 출력.",
      schema: DetailedOutlinesResponseSchema,
      format: "json",
      model: "gpt-4o-mini",
      taskId: `progressive-outline-${startChapter}-${endChapter}`,
      retryCount: 2,
    });

    return result.data.outlines;
  } catch (err) {
    console.warn(
      `[progressive-outliner] ${startChapter}~${endChapter}화 상세 아웃라인 생성 실패:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Check if a chapter needs detailed outline generation.
 * Returns true if chapter > 10 and only has a one-liner (no key_points in chapter_outlines).
 */
export function needsDetailedOutline(
  seed: NovelSeed,
  chapterNumber: number,
): boolean {
  // Only for chapters beyond the initial detailed range
  if (chapterNumber <= 10) return false;

  // Check if detailed outline already exists
  const existing = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNumber,
  );
  if (existing && existing.key_points.length > 0) return false;

  // Check if there's at least an extended outline (one-liner) to expand from
  const extOutline = (seed.extended_outlines || []).find(
    (o) => o.chapter_number === chapterNumber,
  );
  return !!extOutline;
}
