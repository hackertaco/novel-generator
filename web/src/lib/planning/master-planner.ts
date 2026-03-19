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

  // Validate: must have at least 3 parts
  const plan = result.data;
  if (plan.parts.length < 3) {
    console.warn(`[master-plan] 대막이 ${plan.parts.length}개만 생성됨, 자동 보완`);
    const totalChapters = plan.estimated_total_chapters.max || seed.total_chapters;
    const existingEnd = plan.parts[plan.parts.length - 1]?.end_chapter || 60;

    // Fill remaining parts
    const remaining = totalChapters - existingEnd;
    if (remaining > 0) {
      const partsNeeded = Math.max(2, Math.ceil(remaining / 70));
      const perPart = Math.ceil(remaining / partsNeeded);
      for (let i = 0; i < partsNeeded; i++) {
        const start = existingEnd + 1 + i * perPart;
        const end = Math.min(start + perPart - 1, totalChapters);
        plan.parts.push({
          id: `part_${plan.parts.length + 1}`,
          name: `${plan.parts.length + 1}부`,
          start_chapter: start,
          end_chapter: end,
          theme: "자동 생성된 대막 (아크 플래닝 시 상세 설계)",
          core_conflict: "",
          resolution_target: "",
          estimated_chapter_count: end - start + 1,
          arcs: [],
          transition_to_next: "",
        });
      }
    }
  }

  return { data: plan, usage: result.usage };
}
