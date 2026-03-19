import { getAgent } from "@/lib/agents/llm-agent";
import { getMasterPlanPrompt } from "@/lib/prompts/planning-prompts";
import { MasterPlanSchema, type MasterPlan } from "@/lib/schema/planning";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";

export async function generateMasterPlan(
  seed: NovelSeed,
): Promise<{ data: MasterPlan; usage: TokenUsage }> {
  const agent = getAgent();
  const prompt = getMasterPlanPrompt(seed);

  let result;
  try {
    result = await agent.callStructured({
      prompt,
      system: "당신은 한국 웹소설 전체 구조를 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
      temperature: 0.7,
      maxTokens: 16000,
      schema: MasterPlanSchema,
      format: "json",
      taskId: "master-plan",
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
    throw err;
  }

  return { data: result.data, usage: result.usage };
}
