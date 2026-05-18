import { NextRequest } from "next/server";
import {
  getBudgetConfig,
  getDefaultConfig,
  getFastConfig,
} from "@/lib/harness";
import type {
  HarnessEvent,
  RendererRegenerationRequest,
} from "@/lib/harness";
import {
  buildChapterGenerationProgrammaticRunResponse,
  createChapterGenerationProgrammaticRunRequest,
  runEndToEndChapterGeneration,
} from "@/lib/orchestration";
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
      mode,
      rendererRegeneration,
    } = body as {
      seed: NovelSeed;
      chapterNumber?: number;
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
        outDir?: string;
      };
      batch?: { startChapter: number; endChapter: number };
      masterPlan?: MasterPlan;
      preset?: string;
      mode?: "generate" | "renderer_regeneration";
      rendererRegeneration?: RendererRegenerationRequest;
    };

    const resolvedChapterNumber =
      rendererRegeneration?.snapshot.chapterNumber ?? chapterNumber;
    const resolvedMode = mode
      ?? (rendererRegeneration ? "renderer_regeneration" : "generate");
    const resolvedPreset = preset || "default";

    console.log(
      `[orchestrate] 요청: ${resolvedChapterNumber}화 ${resolvedMode} `
      + `(preset: ${resolvedPreset}, ${new Date().toISOString()})`,
    );

    if (!seed || !resolvedChapterNumber) {
      return new Response(
        JSON.stringify({ error: "시드와 챕터 번호가 필요합니다" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (resolvedMode === "renderer_regeneration" && !rendererRegeneration) {
      return new Response(
        JSON.stringify({ error: "renderer regeneration 요청 본문이 필요합니다" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      rendererRegeneration
      && chapterNumber
      && chapterNumber !== rendererRegeneration.snapshot.chapterNumber
    ) {
      return new Response(
        JSON.stringify({
          error:
            "chapterNumber must match rendererRegeneration.snapshot.chapterNumber",
        }),
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
          const configMap: Record<
            string,
            () => ReturnType<typeof getDefaultConfig>
          > = {
            default: getDefaultConfig,
            budget: getBudgetConfig,
            fast: getFastConfig,
          };

          const startChapter = resolvedMode === "renderer_regeneration"
            ? resolvedChapterNumber
            : (batch?.startChapter ?? resolvedChapterNumber);
          const endChapter = resolvedMode === "renderer_regeneration"
            ? resolvedChapterNumber
            : (batch?.endChapter ?? resolvedChapterNumber);
          const workflowInput = {
            workflow: "chapter_generation" as const,
            seed,
            startChapter,
            endChapter,
            preset: resolvedPreset,
            budgetUsd: options?.budgetUsd,
            masterPlan,
            previousSummaries,
            previousChapterEnding,
            rendererRegeneration,
          };
          const contractRequest = createChapterGenerationProgrammaticRunRequest({
            input: workflowInput,
            preset: resolvedPreset,
            outDir: options?.outDir,
            verbose: false,
            budgetUsd: options?.budgetUsd ?? null,
            qualityThreshold: options?.qualityThreshold,
            maxAttempts: options?.maxAttempts,
          });

          const execution = await runEndToEndChapterGeneration({
            outDir: options?.outDir,
            input: workflowInput,
            resolveConfig: (selectedPreset) => {
              const config = (configMap[selectedPreset] || getDefaultConfig)();
              if (options?.qualityThreshold) {
                config.qualityThreshold = options.qualityThreshold;
              }
              if (options?.maxAttempts) {
                config.maxAttempts = options.maxAttempts;
              }
              if (options?.budgetUsd) {
                config.budgetUsd = options.budgetUsd;
              }
              config.output = { mode: "stream", verbose: false };
              return config;
            },
            onLifecycleEvent: async (event) => {
              if (event.type !== "source_event" || event.source !== "harness") {
                return;
              }

              const harnessEvent = event.payload as HarnessEvent;
              switch (harnessEvent.type) {
                case "chapter_start":
                  send({ type: "pipeline_stage", stage: "generating_chapter" });
                  break;
                case "pipeline_event":
                  send(harnessEvent.event as Record<string, unknown>);
                  break;
                case "chapter_complete":
                  send({
                    type: "complete",
                    text: harnessEvent.result.text,
                    summary: harnessEvent.result.summary,
                    final_score: harnessEvent.result.score,
                    verification: harnessEvent.result.verification,
                    beliefInterpretationRecovery:
                      harnessEvent.result.beliefInterpretationRecovery,
                    rendererRegenerationRequest:
                      harnessEvent.result.rendererRegenerationRequest,
                  });
                  send({ type: "usage", ...harnessEvent.result.usage });
                  break;
                case "plan_generated":
                  send({ type: "plan_update", plan: harnessEvent.plan });
                  break;
                case "plausibility_check":
                  send({
                    type: "plausibility_check",
                    passed: harnessEvent.passed,
                    issues: harnessEvent.issues,
                  });
                  break;
                case "plausibility_fixed":
                  send({ type: "plausibility_fixed", fixes: harnessEvent.fixes });
                  break;
                case "error":
                  send({
                    type: "error",
                    message: harnessEvent.message,
                    code: harnessEvent.code,
                    canonicalValidationFailure:
                      harnessEvent.canonicalValidationFailure,
                    beliefInterpretationRecovery:
                      harnessEvent.beliefInterpretationRecovery,
                  });
                  break;
                case "done": {
                  break;
                }
              }
            },
          });

          send({
            type: "harness_done",
            run: buildChapterGenerationProgrammaticRunResponse({
              request: contractRequest,
              result: execution,
            }),
            ...execution.report,
          });

          if (!execution.workflowResult.ok && !execution.workflowResult.payload) {
            send({
              type: "error",
              message:
                execution.workflowResult.errors[0]?.message ?? "오케스트레이션 실패",
              code: execution.workflowResult.errors[0]?.code,
            });
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
