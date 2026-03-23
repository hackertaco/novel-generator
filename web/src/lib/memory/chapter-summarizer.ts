import { z } from "zod";
import { getAgent } from "@/lib/agents/llm-agent";
import type { NovelSeed } from "@/lib/schema/novel";
import { getArcForChapter, getForeshadowingActions } from "@/lib/schema/novel";
import type { ChapterMemory } from "./hierarchical-memory";

// ---------------------------------------------------------------------------
// Zod schema for LLM response
// ---------------------------------------------------------------------------

const CharacterStateChangeSchema = z.object({
  characterId: z.string().describe("캐릭터 ID"),
  change: z.string().describe("이번 화에서 일어난 변화 (감정, 관계, 상태 등)"),
  relationship_updates: z.record(z.string(), z.string()).default({})
    .describe("다른 캐릭터와의 관계 변화 (예: {'리오넬': '경계 → 호기심'})"),
  emotional_state: z.string().default("neutral")
    .describe("이 화 끝 시점의 감정 상태 (예: '불안', '결의', '혼란')"),
  location: z.string().optional()
    .describe("이 화 끝 시점의 위치 (변경된 경우만)"),
  new_secrets: z.array(z.string()).default([])
    .describe("이번 화에서 새로 알게 된 비밀/정보"),
});

const ChapterMemorySchema = z.object({
  summary: z.string().describe("1-2문장 줄거리 요약"),
  ending_situation: z.string().describe("이 화의 마지막 장면 상황 (다음 화 연결용)"),
  key_events: z.array(z.string()).describe("주요 사건 목록"),
  character_changes: z.array(CharacterStateChangeSchema).default([]),
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

  // Build character ID reference with current known state
  const activeChars = seed.characters
    .filter((c) => c.introduction_chapter <= chapterNumber);
  const charRef = activeChars
    .map((c) => `${c.id}: ${c.name} (${c.role})`)
    .join(", ");
  const charIds = activeChars.map((c) => c.id);

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
  "ending_situation": "마지막 장면의 구체적 상황 (누가 어디서 무엇을 하고 있는지)",
  "key_events": ["사건1", "사건2"],
  "character_changes": [
    {
      "characterId": "캐릭터ID",
      "change": "이번 화에서 일어난 핵심 변화",
      "relationship_updates": {"상대캐릭터id": "이전 관계 → 변화된 관계"},
      "emotional_state": "이 화 끝 시점의 감정 (예: 불안, 결의, 분노, 기대)",
      "location": "이 화 끝 시점의 위치 (변경시만)",
      "new_secrets": ["새로 알게 된 비밀이 있다면"]
    }
  ],
  "active_threads": ["서사 스레드1"],
  "foreshadowing_actions": [
    {"id": "복선ID", "action": "plant|hint|reveal"}
  ]
}
\`\`\`

## ⚠️ 중요 규칙
- **character_changes는 절대 빈 배열이면 안 됩니다!** 이 화에 등장한 캐릭터 전원의 상태를 추적하세요.
- 등장 캐릭터 ID: ${charIds.join(", ")} — 이 중 본문에 등장하는 캐릭터는 반드시 character_changes에 포함
- 변화가 없어 보여도 emotional_state는 반드시 기록 (기본 "neutral")
- relationship_updates: 다른 캐릭터와 상호작용이 있었으면 반드시 기록
- ending_situation: 다음 화 연결을 위해 **마지막 장면**을 구체적으로 (누가 어디서 무엇을 하는 중인지)
- 한국어로 작성`;

  const result = await agent.callStructured({
    prompt,
    system: "당신은 웹소설 요약 전문가입니다. 주어진 본문을 정확하게 구조화된 JSON으로 요약합니다.",
    schema: ChapterMemorySchema,
    format: "json",
    taskId: `chapter-summarize-${chapterNumber}`,
    model,
    temperature: 0.3,
    maxTokens: 2048,
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
