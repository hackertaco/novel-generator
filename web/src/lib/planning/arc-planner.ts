import { getAgent } from "@/lib/agents/llm-agent";
import { getArcPlanPrompt } from "@/lib/prompts/planning-prompts";
import { ArcPlanSchema, type ArcPlan, type PartPlan } from "@/lib/schema/planning";
import { CharacterSchema, type Character } from "@/lib/schema/character";
import type { NovelSeed } from "@/lib/schema/novel";
import type { TokenUsage } from "@/lib/agents/types";
import { z } from "zod";

const ArcPlanResponseSchema = z.object({
  arcs: z.array(ArcPlanSchema),
  new_characters: z.array(CharacterSchema).default([]),
});

export interface ArcPlanResult {
  data: ArcPlan[];
  newCharacters: Character[];
  usage: TokenUsage;
}

export async function generateArcPlans(
  seed: NovelSeed,
  part: PartPlan,
  previousPartSummary?: string,
): Promise<ArcPlanResult> {
  const agent = getAgent();
  const prompt = getArcPlanPrompt(seed, part, previousPartSummary);

  const result = await agent.callStructured({
    prompt,
    system: "당신은 한국 웹소설 아크 구조를 설계하는 전문가입니다. JSON 형식으로 출력하세요.",
    temperature: 0.7,
    maxTokens: 6000,
    schema: ArcPlanResponseSchema,
    format: "json",
    taskId: `arc-plan-${part.id}`,
  });

  // Filter out characters that already exist in seed
  const existingIds = new Set(seed.characters.map((c) => c.id));
  const newCharacters = result.data.new_characters.filter(
    (c) => !existingIds.has(c.id),
  );

  return {
    data: result.data.arcs,
    newCharacters,
    usage: result.usage,
  };
}
