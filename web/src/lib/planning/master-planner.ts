import { getAgent } from "@/lib/agents/llm-agent";
import { getMasterPlanPrompt } from "@/lib/prompts/planning-prompts";
import { MasterPlanSchema, type MasterPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

/**
 * Build a minimal fallback MasterPlan from the seed's existing arcs.
 * Used when LLM structured generation fails repeatedly.
 */
function buildFallbackPlan(seed: NovelSeed): MasterPlan {
  console.warn("[master-plan] Using fallback plan from seed arcs");
  return MasterPlanSchema.parse({
    estimated_total_chapters: {
      min: seed.total_chapters,
      max: seed.total_chapters,
    },
    world_complexity: {
      faction_count: Object.keys(seed.world.factions).length,
      location_count: Object.keys(seed.world.key_locations).length,
      power_system_depth: seed.world.magic_system ? "moderate" : "none",
      subplot_count: seed.arcs.length,
    },
    parts: [
      {
        id: "part_1",
        name: "전체",
        start_chapter: 1,
        end_chapter: Math.min(60, seed.total_chapters),
        theme: seed.logline.split("\n")[0].slice(0, 100),
        core_conflict: seed.arcs[0]?.summary || "핵심 갈등",
        resolution_target: "첫 번째 대막 완결",
        estimated_chapter_count: Math.min(60, seed.total_chapters),
        arcs: [],
        transition_to_next: "",
      },
    ],
    global_foreshadowing_timeline: [],
  });
}

export async function generateMasterPlan(
  seed: NovelSeed,
): Promise<{ data: MasterPlan; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getMasterPlanPrompt(seed);

  let result;
  try {
    result = await agent.callStructured({
      prompt,
      system: "당신은 한국 웹소설 전체 구조를 설계하는 전문가입니다. 반드시 유효한 JSON만 출력하세요. 마크다운 코드블록이나 설명 없이 순수 JSON만.",
      temperature: 0.6,
      maxTokens: 16000,
      schema: MasterPlanSchema,
      format: "json",
      taskId: "master-plan",
      retryCount: 5,
    });
  } catch (err: unknown) {
    const agentErr = err as { attempts?: Array<{ error: string; response?: string }> };
    if (agentErr.attempts) {
      for (const [i, attempt] of agentErr.attempts.entries()) {
        console.error(`[master-plan] Attempt ${i + 1}: ${attempt.error}`);
        if (attempt.response) {
          console.error(`[master-plan] Response preview: ${attempt.response.slice(0, 500)}`);
        }
      }
    }

    // Fallback: build a minimal plan from seed data instead of failing
    const fallbackPlan = buildFallbackPlan(seed);
    return {
      data: fallbackPlan,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };
  }

  return { data: result.data, usage: result.usage };
}
