/**
 * Part-level outline generator.
 *
 * Generates lightweight extended outlines (title + one_liner) for an entire Part
 * when the previous Part is ~80% consumed. This avoids generating all 300 chapter
 * outlines at once while ensuring upcoming chapters always have context.
 */

import { getAgent } from "@/lib/agents/llm-agent";
import { ExtendedOutlineSchema, type NovelSeed, type ExtendedOutline } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import { z } from "zod";

const PartOutlineResponseSchema = z.object({
  extended_outlines: z.array(ExtendedOutlineSchema),
});

export interface PartOutlineResult {
  outlines: ExtendedOutline[];
  usage: TokenUsage;
}

/**
 * Determine Part boundaries from the seed's logline roadmap.
 * Default boundaries if not parseable: Part1=1-60, Part2=61-130, Part3=131-200, Part4=201-300
 */
export function getPartBoundaries(seed: NovelSeed): Array<{ part: number; start: number; end: number }> {
  const defaults = [
    { part: 1, start: 1, end: 60 },
    { part: 2, start: 61, end: 130 },
    { part: 3, start: 131, end: 200 },
    { part: 4, start: 201, end: 300 },
  ];

  // Try to parse from logline roadmap
  const roadmapMatch = seed.logline.match(/\[전체 로드맵\]([\s\S]*)/);
  if (!roadmapMatch) return defaults;

  const boundaries: Array<{ part: number; start: number; end: number }> = [];
  const partRegex = /Part(\d+)\((\d+)~(\d+)화\)/g;
  let match;
  while ((match = partRegex.exec(roadmapMatch[1])) !== null) {
    boundaries.push({
      part: parseInt(match[1], 10),
      start: parseInt(match[2], 10),
      end: parseInt(match[3], 10),
    });
  }

  return boundaries.length >= 2 ? boundaries : defaults;
}

/**
 * Check whether a new Part's outlines should be generated based on
 * the current chapter number. Triggers when the current Part is 80% consumed.
 *
 * Returns the next Part number to generate, or null if not needed.
 */
export function shouldGeneratePartOutlines(
  seed: NovelSeed,
  currentChapter: number,
): { partNumber: number; startChapter: number; endChapter: number } | null {
  const boundaries = getPartBoundaries(seed);

  for (let i = 0; i < boundaries.length - 1; i++) {
    const currentPart = boundaries[i];
    const nextPart = boundaries[i + 1];

    // Check if we're in this part and 80%+ through it
    if (currentChapter >= currentPart.start && currentChapter <= currentPart.end) {
      const partLength = currentPart.end - currentPart.start + 1;
      const progress = (currentChapter - currentPart.start + 1) / partLength;

      if (progress >= 0.8) {
        // Check if next part outlines already exist
        const hasNextOutlines = seed.extended_outlines?.some(
          (o) => o.chapter_number >= nextPart.start && o.chapter_number <= nextPart.end,
        );
        if (!hasNextOutlines) {
          return {
            partNumber: nextPart.part,
            startChapter: nextPart.start,
            endChapter: nextPart.end,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Generate extended outlines for a specific Part.
 *
 * @param seed - The novel seed with roadmap and story_threads
 * @param partNumber - Which part to generate (2, 3, or 4)
 * @param startChapter - First chapter of this part
 * @param endChapter - Last chapter of this part
 * @param previousSummaries - Summaries of completed chapters for context
 */
export async function generatePartOutlines(
  seed: NovelSeed,
  partNumber: number,
  startChapter: number,
  endChapter: number,
  previousSummaries: Array<{ chapter: number; title: string; summary: string }>,
): Promise<PartOutlineResult> {
  const agent = getAgent();

  // Build story thread context
  const threadContext = (seed.story_threads || [])
    .map((t) => {
      const timeline = (t.reveal_timeline || [])
        .filter((r) => {
          const rangeMatch = r.chapter_range.match(/(\d+)/);
          if (!rangeMatch) return false;
          const ch = parseInt(rangeMatch[1], 10);
          return ch >= startChapter && ch <= endChapter;
        })
        .map((r) => `  ${r.chapter_range}: [${r.level}] -> ${r.to} (${r.method})`)
        .join("\n");
      return `- ${t.name} (${t.type}): ${t.description}${timeline ? "\n" + timeline : ""}`;
    })
    .join("\n");

  // Recent summaries (last 10 for context)
  const recentSummaries = previousSummaries.slice(-10)
    .map((s) => `- ${s.chapter}화: ${s.summary}`)
    .join("\n");

  // Extract roadmap from logline
  const roadmapMatch = seed.logline.match(/\[전체 로드맵\]([\s\S]*)/);
  const roadmap = roadmapMatch ? roadmapMatch[1].trim() : "";

  const prompt = `당신은 한국 웹소설 기획 전문가입니다. Part${partNumber}(${startChapter}~${endChapter}화)의 전체 아웃라인을 작성해주세요.

## 소설 정보
제목: ${seed.title}
장르: ${seed.world.genre} / ${seed.world.sub_genre}

## 전체 로드맵
${roadmap}

## 스토리 스레드 (이 파트에서 활성화되는 것들)
${threadContext || "없음"}

## 캐릭터
${seed.characters.map((c) => `- ${c.name} (${c.role}): ${c.arc_summary}`).join("\n")}

## 이전 내용 요약 (최근 10화)
${recentSummaries || "없음"}

## 지시사항

${startChapter}화부터 ${endChapter}화까지 각 화에 대해 제목과 한줄 요약만 작성하세요.

규칙:
1. one_liner는 "언제/어디서 누가 무엇을 한다" 형태로 구체적으로 작성
2. story_threads의 reveal_timeline을 참조하여, 해당 화에서 어떤 스레드가 진전되는지 reveals 배열에 thread ID를 넣으세요
3. 아크 구조에 맞게 긴장감의 기복을 반영하세요
4. 매 화에 구체적 사건이 있어야 합니다 — "분위기" "느낌"만의 화는 금지
5. 8~12화 단위로 소아크가 드러나도록 설계하세요

## 출력 형식 (JSON)

\`\`\`json
{
  "extended_outlines": [
    {
      "chapter_number": ${startChapter},
      "title": "제목",
      "one_liner": "한 줄 요약",
      "reveals": ["thread_id"]
    }
  ]
}
\`\`\`

${startChapter}화부터 ${endChapter}화까지 빠짐없이 모두 작성하세요. JSON만 출력하세요.`;

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설의 전체 구조를 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.7,
    maxTokens: 8000,
    schema: PartOutlineResponseSchema,
    format: "json",
    taskId: `part-outlines-${partNumber}`,
  });

  return {
    outlines: result.data.extended_outlines,
    usage: result.usage,
  };
}
