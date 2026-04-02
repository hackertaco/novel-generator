/**
 * Post-chapter fact extraction using LLM.
 *
 * Extracts world facts (subject-action-object triples) and character states
 * from a completed chapter text. Uses gpt-4o-mini for cost efficiency.
 */

import { getAgent } from "../agents/llm-agent";
import { ChapterWorldStateSchema } from "./world-state";
import type { ChapterWorldState, WorldFact } from "./world-state";
import type { NovelSeed } from "../schema/novel";

/**
 * Extract facts and character states from a completed chapter.
 */
export async function extractChapterFacts(
  text: string,
  seed: NovelSeed,
  chapterNumber: number,
  previousFacts: WorldFact[],
): Promise<ChapterWorldState> {
  const agent = getAgent();

  // Build concise previous facts context (only active ones, limited)
  const activeFacts = previousFacts
    .filter((f) => !f.valid_until)
    .slice(-20);
  const prevFactsStr = activeFacts.length > 0
    ? `\n기존 사실:\n${activeFacts.map((f) => `- ${f.subject} ${f.action} ${f.object} (${f.chapter}화)`).join("\n")}`
    : "";

  // Character names from seed for reference
  const charNames = seed.characters.map((c) => c.name).join(", ");

  const prompt = `${chapterNumber}화 텍스트에서 사실과 캐릭터 상태를 추출하세요.

등장인물: ${charNames}
${prevFactsStr}

## 텍스트
${text.slice(0, 4000)}

## 출력 (JSON)
{
  "chapter": ${chapterNumber},
  "facts": [{"subject":"주어","action":"행동","object":"대상","chapter":${chapterNumber}}],
  "character_states": [{"name":"이름","location":"위치","physical":"신체상태","emotional":"감정","knows":["알고있는것"],"relationships":[{"with":"상대","status":"관계"}]}],
  "summary": "1-2문장 요약"
}

규칙:
- 사실 5-15개 추출 (주어-행동-대상 형식)
- 기존 사실과 모순되면 valid_until: ${chapterNumber} 추가
- 등장한 캐릭터만 character_states에 포함
- JSON만 출력`;

  try {
    const result = await agent.callStructured({
      prompt,
      system: "소설 텍스트에서 사실을 추출하는 분석기입니다. JSON만 출력하세요.",
      schema: ChapterWorldStateSchema,
      format: "json",
      model: "gpt-4o-mini",
      taskId: `fact-extract-ch${chapterNumber}`,
      retryCount: 2,
    });

    return result.data;
  } catch (err) {
    console.warn(
      `[fact-extractor] ${chapterNumber}화 사실 추출 실패:`,
      err instanceof Error ? err.message : err,
    );
    // Return minimal fallback
    return {
      chapter: chapterNumber,
      facts: [],
      character_states: [],
      summary: `${chapterNumber}화`,
    };
  }
}
