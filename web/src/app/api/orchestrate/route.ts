import { NextRequest } from "next/server";
/** @deprecated Legacy Orchestrator — kept for backward compatibility, no longer used in this route */
import { Orchestrator as _DeprecatedOrchestrator } from "@/lib/agents/orchestrator";
import { NovelHarness, getDefaultConfig, getBudgetConfig, getFastConfig } from "@/lib/harness";
import type { NovelSeed } from "@/lib/schema/novel";
import type { MasterPlan } from "@/lib/schema/planning";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      seed,
      chapterNumber,
      previousSummaries,
      previousChapterEnding,
      options,
      batch,
      masterPlan,
      preset,
    } = body as {
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
      /** Harness preset: "default" | "budget" | "fast" */
      preset?: string;
    };

    // Default to "default" preset — legacy orchestrator is deprecated
    const resolvedPreset = preset || "default";

    console.log(`[orchestrate] 요청: ${chapterNumber}화 생성 (preset: ${resolvedPreset}, ${new Date().toISOString()})`);

    if (!seed || !chapterNumber) {
      return new Response(
        JSON.stringify({ error: "시드와 챕터 번호가 필요합니다" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          // --- Harness mode (legacy Orchestrator branch removed) ---
          const configMap: Record<string, () => ReturnType<typeof getDefaultConfig>> = {
            default: getDefaultConfig,
            budget: getBudgetConfig,
            fast: getFastConfig,
          };
          const config = (configMap[resolvedPreset] || getDefaultConfig)();

          // Apply user overrides
          if (options?.qualityThreshold) config.qualityThreshold = options.qualityThreshold;
          if (options?.maxAttempts) config.maxAttempts = options.maxAttempts;
          if (options?.budgetUsd) config.budgetUsd = options.budgetUsd;
          config.output = { mode: "stream", verbose: false };

          const harness = new NovelHarness(config);

          const startCh = batch?.startChapter ?? chapterNumber;
          const endCh = batch?.endChapter ?? chapterNumber;

          for await (const event of harness.run(seed, startCh, endCh, {
            masterPlan,
            previousSummaries,
            previousChapterEnding,
          })) {
            switch (event.type) {
              case "chapter_start":
                send({ type: "pipeline_stage", stage: "generating_chapter" });
                break;
              case "pipeline_event":
                // Forward lifecycle events directly to client
                send(event.event as Record<string, unknown>);
                break;
              case "chapter_complete":
                send({
                  type: "complete",
                  summary: event.result.summary,
                  final_score: event.result.score,
                });
                send({ type: "usage", ...event.result.usage });
                break;
              case "plan_generated":
                send({ type: "plan_update", plan: event.plan });
                break;
              case "plausibility_check":
                send({ type: "plausibility_check", passed: event.passed, issues: event.issues });
                break;
              case "plausibility_fixed":
                send({ type: "plausibility_fixed", fixes: event.fixes });
                break;
              case "error":
                send({ type: "error", message: event.message });
                break;
              case "done":
                send({
                  type: "harness_done",
                  config: event.result.config,
                  totalCostUsd: event.result.totalCostUsd,
                  totalTokens: event.result.totalUsage.total_tokens,
                  totalDurationMs: event.result.totalDurationMs,
                });
                break;
            }
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
