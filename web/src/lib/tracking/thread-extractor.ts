import { z } from "zod";
import { getAgent } from "@/lib/agents/llm-agent";
import type { NarrativeThread, NewThreadInput } from "./thread-tracker";

// ---------------------------------------------------------------------------
// Schema for LLM response
// ---------------------------------------------------------------------------

const ExtractedThreadSchema = z.object({
  id: z.string(),
  planted_chapter: z.number().int(),
  content: z.string(),
  type: z.enum(["encounter", "question", "promise", "mystery", "conflict"]),
  characters_involved: z.array(z.string()).default([]),
  must_mention_by: z.number().int(),
  mention_interval: z.number().int().default(5),
});

const ExtractionResultSchema = z.object({
  new_threads: z.array(ExtractedThreadSchema).default([]),
  resolved_thread_ids: z.array(z.string()).default([]),
  progressed_thread_ids: z.array(z.string()).default([]),
});

type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ThreadExtractionResult {
  newThreads: NewThreadInput[];
  resolvedThreadIds: string[];
  progressedThreadIds: string[];
}

/**
 * After a chapter is written, use an LLM call to:
 * 1. Identify new narrative threads introduced in the chapter
 * 2. Identify which existing threads were referenced/advanced
 * 3. Identify which threads were resolved
 */
export async function extractThreads(
  chapterText: string,
  chapterNumber: number,
  existingThreads: NarrativeThread[],
  model?: string,
): Promise<ThreadExtractionResult> {
  const agent = getAgent();

  const existingList =
    existingThreads.length > 0
      ? existingThreads
          .map(
            (t) =>
              `- [${t.id}] (${t.type}, ${t.status}) ${t.content}`,
          )
          .join("\n")
      : "(없음)";

  const system = `당신은 한국 웹소설의 서사 분석 전문가입니다.
주어진 회차 본문을 읽고, 서사 스레드(narrative thread)를 추출하세요.

서사 스레드란 복선(foreshadowing)과는 다릅니다. 복선은 별도로 관리됩니다.
서사 스레드는 다음과 같은 것들입니다:
- encounter: 새로운 인물과의 조우, 중요한 만남
- question: 독자나 인물이 품게 되는 의문
- promise: 약속, 맹세, 다짐
- mystery: 미스터리, 풀리지 않은 수수께끼
- conflict: 갈등, 대립 구도

응답은 반드시 아래 JSON 형식으로만 출력하세요:
{
  "new_threads": [
    {
      "id": "thread_<번호>_<간단한영문키워드>",
      "planted_chapter": <회차번호>,
      "content": "<한국어로 스레드 내용 요약>",
      "type": "<encounter|question|promise|mystery|conflict>",
      "characters_involved": ["<캐릭터ID>"],
      "must_mention_by": <이 스레드가 반드시 다시 언급되어야 할 회차>,
      "mention_interval": <몇 회차마다 언급 권장, 기본 5>
    }
  ],
  "resolved_thread_ids": ["<해결된 기존 스레드 ID>"],
  "progressed_thread_ids": ["<진행된 기존 스레드 ID>"]
}`;

  const prompt = `## ${chapterNumber}회차 본문

${chapterText}

## 기존 서사 스레드 목록
${existingList}

위 본문을 분석하여:
1. 이 회차에서 새로 등장한 서사 스레드를 식별하세요
2. 기존 스레드 중 이 회차에서 언급/진행된 것을 식별하세요
3. 기존 스레드 중 이 회차에서 해결된 것을 식별하세요

JSON으로 응답하세요.`;

  const result = await agent.callStructured<ExtractionResult>({
    prompt,
    system,
    schema: ExtractionResultSchema,
    format: "json",
    model,
    taskId: `thread-extract-ch${chapterNumber}`,
    temperature: 0.3,
    maxTokens: 2048,
  });

  const data = result.data;

  return {
    newThreads: data.new_threads.map((t) => ({
      ...t,
      planted_chapter: chapterNumber,
    })),
    resolvedThreadIds: data.resolved_thread_ids,
    progressedThreadIds: data.progressed_thread_ids,
  };
}
