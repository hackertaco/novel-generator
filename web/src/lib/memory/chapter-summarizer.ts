import { z } from "zod";
import { getAgent } from "@/lib/agents/llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import { getArcForChapter, getForeshadowingActions } from "@/lib/schema/novel";
import type { ChapterMemory } from "./hierarchical-memory";

// ---------------------------------------------------------------------------
// Zod schema for LLM response
// ---------------------------------------------------------------------------

const ChapterMemorySchema = z.object({
  summary: z.string().describe("1-2문장 줄거리 요약"),
  key_events: z.array(z.string()).describe("주요 사건 목록"),
  character_changes: z.array(
    z.object({
      characterId: z.string(),
      change: z.string(),
    }),
  ).default([]),
  active_threads: z.array(z.string()).default([]).describe("이번 화에서 진행된 서사 스레드"),
  foreshadowing_actions: z.array(
    z.object({
      id: z.string(),
      action: z.enum(["plant", "hint", "reveal"]),
    }),
  ).default([]),
});

// ---------------------------------------------------------------------------
// summarizeChapter
// ---------------------------------------------------------------------------

/**
 * After a chapter is written, make ONE LLM call to extract a structured
 * ChapterMemory for the hierarchical memory system.
 */
export async function summarizeChapter(
  chapterText: string,
  chapterNumber: number,
  seed: NovelSeed,
  model?: string,
): Promise<ChapterMemory> {
  const agent = getAgent();

  const arc = getArcForChapter(seed, chapterNumber);
  const fsActions = getForeshadowingActions(seed, chapterNumber);

  // Build context about what foreshadowing IDs were expected
  const expectedFs = fsActions.map(
    ({ foreshadowing: fs, action }) => `${fs.id} (${action}): ${fs.name}`,
  );

  // Build character ID reference
  const charRef = seed.characters
    .filter((c) => c.introduction_chapter <= chapterNumber)
    .map((c) => `${c.id}: ${c.name}`)
    .join(", ");

  const prompt = `다음은 웹소설 ${chapterNumber}화 본문입니다. 구조화된 요약을 JSON으로 생성하세요.

## 아크 정보
- 현재 아크: ${arc?.name ?? "불명"} (${arc?.start_chapter ?? "?"}화~${arc?.end_chapter ?? "?"}화)

## 캐릭터 ID 참조
${charRef}

## 이번 화 예정 복선
${expectedFs.length > 0 ? expectedFs.join("\n") : "없음"}

## 본문
${chapterText.slice(0, 8000)}

## 출력 형식 (JSON)
\`\`\`json
{
  "summary": "1-2문장 줄거리 요약",
  "key_events": ["사건1", "사건2"],
  "character_changes": [
    {"characterId": "캐릭터ID", "change": "변화 설명"}
  ],
  "active_threads": ["서사 스레드1"],
  "foreshadowing_actions": [
    {"id": "복선ID", "action": "plant|hint|reveal"}
  ]
}
\`\`\`

규칙:
- summary는 반드시 1-2문장으로 핵심만
- character_changes의 characterId는 위 캐릭터 ID 참조에서 사용
- foreshadowing_actions는 본문에서 실제로 다뤄진 복선만 포함
- 한국어로 작성`;

  const result = await agent.callStructured({
    prompt,
    system: "당신은 웹소설 요약 전문가입니다. 주어진 본문을 정확하게 구조화된 JSON으로 요약합니다.",
    schema: ChapterMemorySchema,
    format: "json",
    taskId: `chapter-summarize-${chapterNumber}`,
    model,
    temperature: 0.3,
    maxTokens: 1024,
  });

  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNumber,
  );

  return {
    chapter: chapterNumber,
    title: outline?.title ?? `${chapterNumber}화`,
    ...result.data,
  };
}
