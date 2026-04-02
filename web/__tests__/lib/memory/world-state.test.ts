import { describe, it, expect } from "vitest";
import {
  WorldFactSchema,
  CharacterStateSchema,
  ChapterWorldStateSchema,
} from "@/lib/memory/world-state";

describe("WorldFact schema", () => {
  it("parses a valid fact", () => {
    const result = WorldFactSchema.safeParse({
      subject: "리에나",
      action: "감금됨",
      object: "북궁 별관",
      chapter: 2,
    });
    expect(result.success).toBe(true);
  });

  it("parses a fact with valid_until and negated_by", () => {
    const result = WorldFactSchema.safeParse({
      subject: "리에나",
      action: "감금됨",
      object: "북궁 별관",
      chapter: 2,
      valid_until: 5,
      negated_by: "fact-42",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid_until).toBe(5);
      expect(result.data.negated_by).toBe("fact-42");
    }
  });

  it("rejects missing required fields", () => {
    const result = WorldFactSchema.safeParse({
      subject: "리에나",
      // missing action, object, chapter
    });
    expect(result.success).toBe(false);
  });
});

describe("CharacterState schema", () => {
  it("parses a valid character state", () => {
    const result = CharacterStateSchema.safeParse({
      name: "리에나",
      location: "북궁 별관",
      physical: "족쇄 자국",
      emotional: "경계심",
      knows: ["처형이 중단됨"],
      relationships: [{ with: "테오", status: "보호 본능" }],
    });
    expect(result.success).toBe(true);
  });

  it("allows empty arrays", () => {
    const result = CharacterStateSchema.safeParse({
      name: "테오",
      location: "왕궁",
      physical: "정상",
      emotional: "평온",
      knows: [],
      relationships: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("ChapterWorldState schema", () => {
  it("parses a complete chapter world state", () => {
    const result = ChapterWorldStateSchema.safeParse({
      chapter: 3,
      facts: [
        { subject: "리에나", action: "탈출함", object: "북궁", chapter: 3 },
      ],
      character_states: [
        {
          name: "리에나",
          location: "숲",
          physical: "상처",
          emotional: "공포",
          knows: ["탈출 경로"],
          relationships: [],
        },
      ],
      summary: "리에나가 북궁에서 탈출했다.",
    });
    expect(result.success).toBe(true);
  });

  it("parses with empty arrays", () => {
    const result = ChapterWorldStateSchema.safeParse({
      chapter: 1,
      facts: [],
      character_states: [],
      summary: "시작",
    });
    expect(result.success).toBe(true);
  });
});
