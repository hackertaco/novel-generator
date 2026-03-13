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
});

export type CharacterState = z.infer<typeof CharacterStateSchema>;

export const CharacterSchema = z.object({
  id: z.string().describe("Unique character identifier"),
  name: z.string().describe("Character name"),
  role: z.string().describe("Role in story (주인공, 히로인, 악역, etc.)"),
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

  // Mutable - updated each chapter
  state: CharacterStateSchema.default({
    level: null,
    location: null,
    status: "normal",
    relationships: {},
    inventory: [],
    secrets_known: [],
  }),
});

export type Character = z.infer<typeof CharacterSchema>;
