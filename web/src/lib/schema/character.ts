import { z } from "zod";

// --- Schemas ---

export const CharacterVoiceSchema = z.object({
  tone: z.string().describe("Overall tone (e.g., '냉소적, 하지만 속정 있음')"),
  speech_patterns: z
    .array(z.string())
    .default([])
    .describe("Characteristic speech patterns (e.g., '~하지', '...그래서?')"),
  sample_dialogues: z
    .array(z.string())
    .default([])
    .describe("Representative dialogue samples (5-10 examples)"),
  personality_core: z
    .string()
    .describe("Core personality description for consistency"),
});

export type CharacterVoice = z.infer<typeof CharacterVoiceSchema>;

export const CharacterStateSchema = z.object({
  level: z
    .preprocess((v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const match = v.match(/\d+/);
        return match ? parseInt(match[0], 10) : null;
      }
      return null;
    }, z.number().int().nullable())
    .default(null)
    .describe("Power level if applicable"),
  location: z.string().nullable().default(null).describe("Current location"),
  status: z
    .string()
    .default("normal")
    .describe("Current status (normal, injured, etc.)"),
  relationships: z
    .preprocess((v) => {
      if (Array.isArray(v)) {
        const record: Record<string, string> = {};
        for (const item of v) {
          if (typeof item === "string") {
            const [key, ...rest] = item.split(/[:：]\s*/);
            record[key.trim()] = rest.join(":").trim() || "관계";
          } else if (typeof item === "object" && item !== null) {
            const obj = item as Record<string, unknown>;
            const name = String(obj.name || obj.id || Object.values(obj)[0] || "");
            const desc = String(obj.description || obj.status || obj.relation || Object.values(obj)[1] || name);
            if (name) record[name] = desc;
          }
        }
        return record;
      }
      return v;
    }, z.record(z.string(), z.string()))
    .default({})
    .describe("Relationships with other characters (name -> status)"),
  inventory: z
    .array(z.string())
    .default([])
    .describe("Important items held"),
  secrets_known: z
    .array(z.string())
    .default([])
    .describe("Secrets this character knows"),
  realization_stage: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe(
      "내면 깨달음 단계. 1=모름, 2=의심, 3=단서 포착, 4=거의 확신, 5=완전 자각. " +
      "internal_arc.misbelief를 뒤집는 과정을 추적. " +
      "이미 높은 단계에 도달했으면 Writer가 재서술/재발견 금지.",
    ),
});

export type CharacterState = z.infer<typeof CharacterStateSchema>;

export const CharacterSchema = z.object({
  id: z.string().describe("Unique character identifier"),
  name: z.string().describe("Character name"),
  role: z.string().describe("Role in story (주인공, 히로인, 악역, etc.)"),
  gender: z
    .enum(["male", "female", "other"])
    .optional()
    .describe("Character gender — controls pronouns (그/그녀) and honorifics. Defaults to 'male' if omitted."),
  social_rank: z
    .enum(["royal", "noble", "gentry", "commoner", "servant", "slave", "outcast"])
    .default("commoner")
    .describe("사회적 신분 — 대화/행동 제약을 결정. royal: 왕족, noble: 귀족, gentry: 사대부/기사, commoner: 평민, servant: 하인/시녀, slave: 노예, outcast: 추방자"),
  introduction_chapter: z
    .preprocess((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const match = v.match(/\d+/);
        return match ? parseInt(match[0], 10) : 1;
      }
      return 1;
    }, z.number().int())
    .describe("Chapter where character first appears"),

  // Fixed - never compressed
  voice: CharacterVoiceSchema.describe("Speech patterns and personality"),
  backstory: z.string().describe("Character backstory"),
  arc_summary: z
    .string()
    .describe("Character's growth arc throughout the story"),
  internal_arc: z
    .object({
      want: z
        .string()
        .describe(
          "외부 목표. 캐릭터가 명시적으로 원한다고 말하는 것 (예: '황위 탈환', '북부로 도주', '복수'). " +
          "플롯의 엔진이 되는 외부 goal.",
        ),
      need: z
        .string()
        .describe(
          "내면 진실. 캐릭터가 진짜 성장하려면 받아들여야 할 것 (예: '약함을 인정하기', '타인에게 의지해도 됨'). " +
          "want와 보통 충돌.",
        ),
      misbelief: z
        .string()
        .describe(
          "캐릭터가 붙잡은 잘못된 믿음. 이게 want를 낳고, 클라이맥스에서 깨져야 need가 드러남 " +
          "(예: '혼자 버텨야만 살아남는다', '도움은 늘 대가를 요구한다').",
        ),
      aha_chapter: z
        .number()
        .int()
        .optional()
        .describe("misbelief가 완전히 뒤집히는 목표 회차. 없어도 됨."),
    })
    .optional()
    .describe(
      "Character Arc의 내면 구조. Want vs Need + Misbelief. " +
      "Lisa Cron의 Story Genius 방식. 매 씬은 misbelief를 한 번씩 흔들거나 강화해야 함. " +
      "없어도 됨(주연만 권장).",
    ),

  // Mutable - updated each chapter
  state: CharacterStateSchema.default({
    level: null,
    location: null,
    status: "normal",
    relationships: {},
    inventory: [],
    secrets_known: [],
    realization_stage: 1,
  }),
});

export type Character = z.infer<typeof CharacterSchema>;

function normalizeCharacterRef(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCharacterRefNoSpace(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * Character references in prompts/blueprints are not consistently emitted as IDs.
 * Accept common human-facing variants such as full name and first token.
 */
export function getCharacterReferenceVariants(
  character: Pick<Character, "id" | "name">,
): string[] {
  const variants = new Set<string>();
  const fullName = normalizeCharacterRef(character.name);

  variants.add(normalizeCharacterRef(character.id));
  variants.add(fullName);

  const compactName = normalizeCharacterRefNoSpace(fullName);
  if (compactName && compactName !== fullName) {
    variants.add(compactName);
  }

  const firstToken = fullName.split(/\s+/)[0];
  if (firstToken && firstToken.length >= 2) {
    variants.add(firstToken);
  }

  return [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
}

export function resolveCharacterReference<T extends Pick<Character, "id" | "name">>(
  reference: string,
  characters: T[],
): T | undefined {
  const normalized = normalizeCharacterRef(reference);
  const compact = normalizeCharacterRefNoSpace(reference);

  return characters.find((character) =>
    getCharacterReferenceVariants(character).some((variant) =>
      variant === normalized || normalizeCharacterRefNoSpace(variant) === compact
    )
  );
}
