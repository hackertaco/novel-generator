/**
 * Post-chapter fact extraction using LLM.
 *
 * Extracts world facts (subject-action-object triples) and character states
 * from a completed chapter text. Uses gpt-4o-mini for cost efficiency.
 *
 * Uses plain text call (not structured/JSON mode) for robustness,
 * with manual JSON parsing and graceful fallback.
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
  "summary": "1-2문장 요약",
  "key_dialogues": [{"speaker":"화자이름","line":"실제 대사 원문","context":"상황 설명"}],
  "key_actions": [{"character":"캐릭터이름","action":"핵심 행동 설명"}]
}

규칙:
- 사실 5-15개 추출 (주어-행동-대상 형식)
- 기존 사실과 모순되면 valid_until: ${chapterNumber} 추가
- 등장한 캐릭터만 character_states에 포함
- 이 화에서 가장 인상적인 대사 3-5개를 key_dialogues에 추출하세요 (실제 대사 원문 그대로)
- 이 화에서 핵심 행동 3-5개를 key_actions에 추출하세요 (캐릭터의 중요한 물리적/감정적 행동)
- JSON만 출력`;

  try {
    // Use plain text call instead of structured call for robustness
    const result = await agent.call({
      prompt,
      system: "소설 텍스트에서 사실을 추출하는 분석기입니다. JSON만 출력하세요.",
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 4000,
      taskId: `fact-extract-ch${chapterNumber}`,
    });

    // Manually parse JSON from the response
    const raw = result.data.trim();
    const parsed = parseJsonFromText(raw);

    if (parsed) {
      // Validate with schema, but use parsed data even if validation is loose
      const validated = ChapterWorldStateSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      // Schema validation failed but we have parsed JSON — use it with defaults
      return {
        chapter: parsed.chapter ?? chapterNumber,
        facts: Array.isArray(parsed.facts) ? parsed.facts : [],
        character_states: Array.isArray(parsed.character_states) ? parsed.character_states : [],
        summary: typeof parsed.summary === "string" ? parsed.summary : `${chapterNumber}화`,
        key_dialogues: Array.isArray(parsed.key_dialogues) ? parsed.key_dialogues : undefined,
        key_actions: Array.isArray(parsed.key_actions) ? parsed.key_actions : undefined,
      };
    }

    // JSON parsing failed entirely — extract a simple summary only
    console.warn(
      `[fact-extractor] ${chapterNumber}화 JSON 파싱 실패, 요약만 추출`,
    );
    const summaryMatch = raw.match(/"summary"\s*:\s*"([^"]+)"/);
    return {
      chapter: chapterNumber,
      facts: [],
      character_states: [],
      summary: summaryMatch ? summaryMatch[1] : `${chapterNumber}화`,
    };
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

/**
 * Try to parse JSON from LLM text response.
 * Handles markdown code blocks, leading/trailing text, etc.
 */
function parseJsonFromText(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Try finding first { to last }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  return null;
}
