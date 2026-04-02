import { z } from "zod";

export const WorldFactSchema = z.object({
  subject: z.string(),          // "리에나"
  action: z.string(),           // "감금됨"
  object: z.string(),           // "북궁 별관"
  chapter: z.number(),          // 2
  valid_until: z.number().optional(), // null = still true
  negated_by: z.string().optional(),  // fact ID that invalidated this
});

export const CharacterStateSchema = z.object({
  name: z.string(),
  location: z.string(),
  physical: z.string(),         // "옆구리 상처, 족쇄 자국"
  emotional: z.string(),        // "경계심, 테오에 대한 보호 본능"
  knows: z.array(z.string()),   // ["처형이 중단됨", "테오가 자신을 엄마라 부름"]
  relationships: z.array(z.object({
    with: z.string(),
    status: z.string(),         // "경계+의존", "적대", "신뢰"
  })),
});

export const ChapterWorldStateSchema = z.object({
  chapter: z.number(),
  facts: z.array(WorldFactSchema),
  character_states: z.array(CharacterStateSchema),
  summary: z.string(),          // 1-2 sentence chapter summary
});

export type WorldFact = z.infer<typeof WorldFactSchema>;
export type CharacterState = z.infer<typeof CharacterStateSchema>;
export type ChapterWorldState = z.infer<typeof ChapterWorldStateSchema>;
