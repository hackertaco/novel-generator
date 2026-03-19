import { NextRequest } from "next/server";
import { Orchestrator } from "@/lib/agents/orchestrator";
import type { NovelSeed } from "@/lib/schema/novel";
import type { MasterPlan } from "@/lib/schema/planning";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { seed, chapterNumber, previousSummaries, previousChapterEnding, options, batch, masterPlan } = body as {
      seed: NovelSeed;
      chapterNumber: number;
      previousSummaries: Array<{
        chapter: number;
        title: string;
        summary: string;
        cliffhanger?: string | null;
      }>;
      previousChapterEnding?: string;
      options?: {
        qualityThreshold?: number;
        maxAttempts?: number;
        budgetUsd?: number;
      };
      batch?: { startChapter: number; endChapter: number };
      masterPlan?: MasterPlan;
    };

    console.log(`[orchestrate] 요청: ${chapterNumber}화 생성 (${new Date().toISOString()})`);

    if (!seed || !chapterNumber) {
      return new Response(
        JSON.stringify({ error: "시드와 챕터 번호가 필요합니다" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const orchestrator = new Orchestrator({
      budgetUsd: options?.budgetUsd,
      qualityThreshold: options?.qualityThreshold,
      maxAttemptsPerChapter: options?.maxAttempts,
      masterPlan,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          const events = batch
            ? orchestrator.generateBatch(
                seed,
                batch.startChapter,
                batch.endChapter,
                previousSummaries || [],
              )
            : orchestrator.generateChapter(
                seed,
                chapterNumber,
                previousSummaries || [],
                previousChapterEnding,
              );

          for await (const event of events) {
            send(event as Record<string, unknown>);
          }
        } catch (err) {
          send({
            type: "error",
            message:
              err instanceof Error ? err.message : "오케스트레이션 실패",
          });
        }

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
        error:
          err instanceof Error ? err.message : "오케스트레이션 실패",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
