import { z } from "zod";

export const WorldFactSchema = z.object({
  subject: z.string(),          // "리에나"
  action: z.string(),           // "감금됨"
  object: z.string(),           // "북궁 별관"
  chapter: z.number(),          // 2
  valid_until: z.number().optional(), // null = still true
  negated_by: z.string().optional(),  // fact ID that invalidated this
});

// ---------------------------------------------------------------------------
// Relationship — enriched with first-met, trust, knowledge asymmetry
// ---------------------------------------------------------------------------

export const RelationshipDetailSchema = z.object({
  a: z.string(),                 // "세아"
  b: z.string(),                 // "에드윈"
  firstMetChapter: z.number(),   // 처음 만난 화 번호
  trust: z.number().min(-2).max(2), // -2 적대 ~ +2 신뢰 (한 화당 ±1 제약)
  status: z.string(),            // "감사관-피조사인", "비즈니스 파트너"
  aKnowsAboutB: z.array(z.string()), // A가 B에 대해 아는 것
  bKnowsAboutA: z.array(z.string()), // B가 A에 대해 아는 것
  tension: z.string().optional(), // 현재 긴장 요소: "에드윈이 세아를 조사 중"
});

// ---------------------------------------------------------------------------
// Audience-revealed fact — prevents info repetition across chapters
// ---------------------------------------------------------------------------

export const RevealedFactSchema = z.object({
  content: z.string(),           // "창고 하단이 비 올 때마다 젖어 반복 손실 발생"
  revealedInChapter: z.number(), // 독자에게 공개된 화 번호
  type: z.enum(["evidence", "secret", "backstory", "relationship", "worldbuilding"]),
  revealedTo: z.array(z.string()).optional(), // 어떤 캐릭터에게 공개됐는지 (없으면 독자만)
});

export const CharacterStateSchema = z.object({
  name: z.string(),
  location: z.string(),
  physical: z.string(),         // "옆구리 상처, 족쇄 자국"
  emotional: z.string(),        // "경계심, 테오에 대한 보호 본능"
  knows: z.array(z.string()),   // ["처형이 중단됨", "테오가 자신을 엄마라 부름"]
  companions: z.array(z.string()).optional(), // ["테오", "시녀"] — 현재 함께 있는 인물
  relationships: z.array(z.object({
    with: z.string(),
    status: z.string(),         // "경계+의존", "적대", "신뢰"
  })),
});

export const KeyDialogueSchema = z.object({
  speaker: z.string(),
  line: z.string(),              // actual dialogue text
  context: z.string(),           // brief context
});

export const KeyActionSchema = z.object({
  character: z.string(),
  action: z.string(),            // e.g. "테오가 리에나 옷자락을 붙잡음"
});

export const PendingSituationSchema = z.object({
  characters: z.array(z.string()),   // involved character names
  situation: z.string(),             // "라시드가 문을 닫고 세레나를 가둠"
  location: z.string(),             // where it's happening
  unresolved: z.string(),           // what's unresolved: "세레나가 어떻게 빠져나가는지"
});

export const ChapterWorldStateSchema = z.object({
  chapter: z.number(),
  facts: z.array(WorldFactSchema),
  character_states: z.array(CharacterStateSchema),
  summary: z.string(),          // 1-2 sentence chapter summary
  key_dialogues: z.array(KeyDialogueSchema).optional(),
  key_actions: z.array(KeyActionSchema).optional(),
  pending_situations: z.array(PendingSituationSchema).optional(),
  revealed_facts: z.array(RevealedFactSchema).optional(),
  relationship_updates: z.array(RelationshipDetailSchema).optional(),
});

export type WorldFact = z.infer<typeof WorldFactSchema>;
export type CharacterState = z.infer<typeof CharacterStateSchema>;
export type KeyDialogue = z.infer<typeof KeyDialogueSchema>;
export type KeyAction = z.infer<typeof KeyActionSchema>;
export type PendingSituation = z.infer<typeof PendingSituationSchema>;
export type RevealedFact = z.infer<typeof RevealedFactSchema>;
export type RelationshipDetail = z.infer<typeof RelationshipDetailSchema>;
export type ChapterWorldState = z.infer<typeof ChapterWorldStateSchema>;
