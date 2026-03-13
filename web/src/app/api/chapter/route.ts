import { NextRequest } from "next/server";
import { getAgent } from "@/lib/agents/llm-agent";
import { buildChapterContext } from "@/lib/context/builder";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import { evaluateStyle } from "@/lib/evaluators/style";
import { extractSummaryRuleBased } from "@/lib/evaluators/summary";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { seed, chapterNumber, previousSummaries } = (await request.json()) as {
      seed: NovelSeed;
      chapterNumber: number;
      previousSummaries: Array<{ chapter: number; title: string; summary: string }>;
    };

    if (!seed || !chapterNumber) {
      return new Response(
        JSON.stringify({ error: "시드와 챕터 번호가 필요합니다" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build context
    const context = buildChapterContext(seed, chapterNumber, previousSummaries || []);

    // Select model tier
    const tier = selectModelTier(seed, chapterNumber);
    const model = getModelForTier(tier);

    const prompt = `${context}

---

위 설정과 맥락을 바탕으로 ${chapterNumber}화를 작성해주세요.

요구사항:
1. 반드시 3000자~5000자 분량 (절대 1500자 이하 금지. 장면과 대화를 충분히 전개하세요)
2. 짧은 문단 (3문장 이하)
3. 대사 비중 60% 이상
4. 마지막은 다음 화가 궁금해지는 후킹 엔딩
5. 캐릭터 목소리 일관성 유지
6. 장면 묘사, 감정 표현, 내면 독백을 풍부하게

출력: 소설 본문만 (메타 정보 없이)`;

    // Stream response via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };

        let fullText = "";

        try {
          const agent = getAgent();
          const llmStream = agent.callStream({
            prompt,
            system:
              "당신은 한국 웹소설 전문 작가입니다. 카카오페이지 스타일의 몰입감 있는 소설을 씁니다.",
            model,
            temperature: 0.7,
            maxTokens: 12000,
            taskId: `chapter-${chapterNumber}`,
          });

          // Manually iterate to capture the generator return value (TokenUsage)
          let usage: TokenUsage | undefined;
          let result = await llmStream.next();
          while (!result.done) {
            fullText += result.value;
            send({ type: "chunk", content: result.value });
            result = await llmStream.next();
          }
          // result.done is true, result.value is the return value (TokenUsage)
          usage = result.value;

          // Send usage event
          if (usage) {
            send({ type: "usage", ...usage });
          }

          // Evaluate style
          const styleResult = evaluateStyle(fullText, seed.style);
          send({ type: "evaluation", result: { style: styleResult } });

          // Extract summary (rule-based)
          const outline = seed.chapter_outlines.find(
            (o) => o.chapter_number === chapterNumber,
          );
          const title = outline?.title || `${chapterNumber}화`;
          const summary = extractSummaryRuleBased(chapterNumber, title, fullText);
          send({ type: "complete", summary });
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "생성 실패",
          });
        }

        send({ type: "done" });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "챕터 생성 실패",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
