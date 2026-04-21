// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  CharacterVoiceSchema,
  CharacterStateSchema,
  CharacterSchema,
  getCharacterReferenceVariants,
  resolveCharacterReference,
} from "@/lib/schema/character";

describe("CharacterVoiceSchema", () => {
  it("parses valid data", () => {
    const data = {
      tone: "냉소적",
      speech_patterns: ["~하지", "...그래서?"],
      sample_dialogues: ["대사 1", "대사 2"],
      personality_core: "냉소적 성격",
    };

    const result = CharacterVoiceSchema.parse(data);

    expect(result.tone).toBe("냉소적");
    expect(result.speech_patterns).toEqual(["~하지", "...그래서?"]);
    expect(result.sample_dialogues).toEqual(["대사 1", "대사 2"]);
    expect(result.personality_core).toBe("냉소적 성격");
  });
});

describe("CharacterStateSchema", () => {
  it("handles level as number", () => {
    const data = {
      level: 10,
      status: "normal",
      relationships: {},
      inventory: [],
      secrets_known: [],
    };

    const result = CharacterStateSchema.parse(data);
    expect(result.level).toBe(10);
  });

  describe("level z.preprocess", () => {
    it('parses string "5" to number 5', () => {
      const data = {
        level: "5",
        status: "normal",
        relationships: {},
        inventory: [],
        secrets_known: [],
      };

      const result = CharacterStateSchema.parse(data);
      expect(result.level).toBe(5);
    });

    it('parses "레벨 3" to number 3', () => {
      const data = {
        level: "레벨 3",
        status: "normal",
        relationships: {},
        inventory: [],
        secrets_known: [],
      };

      const result = CharacterStateSchema.parse(data);
      expect(result.level).toBe(3);
    });

    it("null stays null", () => {
      const data = {
        level: null,
        status: "normal",
        relationships: {},
        inventory: [],
        secrets_known: [],
      };

      const result = CharacterStateSchema.parse(data);
      expect(result.level).toBeNull();
    });
  });
});

describe("CharacterSchema", () => {
  it("parses valid character", () => {
    const data = {
      id: "mc",
      name: "강현우",
      role: "주인공",
      introduction_chapter: 1,
      voice: {
        tone: "냉소적",
        speech_patterns: ["~하지"],
        sample_dialogues: ["대사 1"],
        personality_core: "냉소적 성격",
      },
      backstory: "배경 이야기",
      arc_summary: "성장 아크",
      state: {
        level: 1,
        status: "normal",
        relationships: {},
        inventory: [],
        secrets_known: [],
      },
    };

    const result = CharacterSchema.parse(data);

    expect(result.id).toBe("mc");
    expect(result.name).toBe("강현우");
    expect(result.role).toBe("주인공");
    expect(result.introduction_chapter).toBe(1);
    expect(result.voice.tone).toBe("냉소적");
    expect(result.backstory).toBe("배경 이야기");
    expect(result.arc_summary).toBe("성장 아크");
    expect(result.state.level).toBe(1);
  });

  describe("introduction_chapter z.preprocess", () => {
    it('parses string "3화" to 3', () => {
      const data = {
        id: "mc",
        name: "강현우",
        role: "주인공",
        introduction_chapter: "3화",
        voice: {
          tone: "냉소적",
          speech_patterns: [],
          sample_dialogues: [],
          personality_core: "냉소적 성격",
        },
        backstory: "배경 이야기",
        arc_summary: "성장 아크",
      };

      const result = CharacterSchema.parse(data);
      expect(result.introduction_chapter).toBe(3);
    });

    it("defaults to 1 for non-numeric string", () => {
      const data = {
        id: "mc",
        name: "강현우",
        role: "주인공",
        introduction_chapter: "첫 등장",
        voice: {
          tone: "냉소적",
          speech_patterns: [],
          sample_dialogues: [],
          personality_core: "냉소적 성격",
        },
        backstory: "배경 이야기",
        arc_summary: "성장 아크",
      };

      const result = CharacterSchema.parse(data);
      expect(result.introduction_chapter).toBe(1);
    });
  });
});

describe("character reference helpers", () => {
  const characters = [
    {
      id: "mc",
      name: "세라핀 에델",
    },
    {
      id: "leon",
      name: "레온 발테르 크레바스",
    },
  ];

  it("builds full-name and short-name variants", () => {
    expect(getCharacterReferenceVariants(characters[0])).toEqual([
      "세라핀 에델",
      "세라핀에델",
      "세라핀",
      "mc",
    ]);
  });

  it("resolves first-token references back to the canonical character", () => {
    expect(resolveCharacterReference("세라핀", characters)?.id).toBe("mc");
    expect(resolveCharacterReference("레온", characters)?.id).toBe("leon");
  });

  it("resolves full names and ids as well", () => {
    expect(resolveCharacterReference("세라핀 에델", characters)?.id).toBe("mc");
    expect(resolveCharacterReference("leon", characters)?.id).toBe("leon");
  });
});
