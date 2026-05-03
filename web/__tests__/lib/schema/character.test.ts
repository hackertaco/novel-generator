// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  CharacterVoiceSchema,
  CharacterStateSchema,
  CharacterSchema,
  getCharacterReferenceVariants,
  resolveCharacterReference,
  getAddressHintForPair,
  getRelationshipFactForPair,
  inferRelationTaxonomies,
  getDialoguePlaybookForPair,
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


  it("parses address hints and resolves pair-specific hint lookup", () => {
    const character = CharacterSchema.parse({
      id: "elysia",
      name: "엘리시아 크레센트",
      role: "주인공",
      address_hints: [
        { to: "marian", relation: "served_by", address: "마리안", speech_level: "casual" },
        { to: "세레나 크레센트", relation: "younger_sibling", address: "언니", speech_level: "polite" },
      ],
      introduction_chapter: 1,
      voice: {
        tone: "냉정함",
        speech_patterns: [],
        sample_dialogues: [],
        personality_core: "냉정함",
      },
      backstory: "배경",
      arc_summary: "아크",
    });

    const marianHint = getAddressHintForPair(character, { id: "marian", name: "마리안" });
    const serenaHint = getAddressHintForPair(character, { id: "serena", name: "세레나 크레센트" });

    expect(marianHint?.address).toBe("마리안");
    expect(marianHint?.speech_level).toBe("casual");
    expect(serenaHint?.address).toBe("언니");
    expect(serenaHint?.speech_level).toBe("polite");
  });



  it("infers broad relation taxonomy and dialogue playbook from hierarchy and relationship text", () => {
    const mistress = CharacterSchema.parse({
      id: "elysia",
      name: "엘리시아",
      role: "주인공",
      social_rank: "noble",
      introduction_chapter: 1,
      voice: { tone: "차갑다", speech_patterns: [], sample_dialogues: [], personality_core: "차갑다" },
      backstory: "배경",
      arc_summary: "아크",
      state: { level: 1, status: "normal", relationships: { marian: "신뢰하는 시녀" }, inventory: [], secrets_known: [] },
    });
    const maid = CharacterSchema.parse({
      id: "marian",
      name: "마리안",
      role: "시녀",
      social_rank: "servant",
      introduction_chapter: 1,
      voice: { tone: "다정하다", speech_patterns: [], sample_dialogues: [], personality_core: "다정하다" },
      backstory: "배경",
      arc_summary: "아크",
      state: { level: 1, status: "normal", relationships: { elysia: "모시는 아가씨" }, inventory: [], secrets_known: [] },
    });

    const taxonomies = inferRelationTaxonomies(maid, mistress);
    const playbook = getDialoguePlaybookForPair(maid, mistress);

    expect(taxonomies).toContain("servant_to_mistress");
    expect(taxonomies).toContain("trusted_attendant");
    expect(playbook.forbiddenPhrases).toContain("왜 그래");
    expect(playbook.preferredPatterns).toContain("왜 그러세요");
  });



  it("parses structured relationship/access/intent truth", () => {
    const character = CharacterSchema.parse({
      id: "elysia",
      name: "엘리시아 크레센트",
      role: "주인공",
      gender: "female",
      social_rank: "noble",
      house: "크레센트 공작가",
      faction: "황태자파",
      public_title: "크레센트 공작 영애",
      court_position: "공작가 적녀",
      introduction_chapter: 1,
      voice: { tone: "차갑다", speech_patterns: [], sample_dialogues: [], personality_core: "차갑다" },
      backstory: "배경",
      arc_summary: "아크",
      relationship_facts: [
        {
          target: "serena",
          kinship: "elder_sibling",
          service: "none",
          romance_role: "rival",
          public_face: "warm",
          private_truth: "hostile",
          trust_level: -2,
          address_default: "언니",
          speech_mode_default: "polite",
          preferred_register: "부드럽지만 선 긋는 자매 존대",
          forbidden_register: ["배려는 감사히 받되"],
          preferred_patterns: ["언니가 신경 써 주는 건 고마워요"],
        }
      ],
      masking_habit: "미소로 적의를 가린다",
      intent_profile: {
        surface_goal: "완벽한 적녀로 보이기",
        hidden_goal: "복수 준비",
        core_fear: "같은 방식으로 또 죽는 것",
        leverage_points: ["가문 체면"],
        taboo_actions: ["공개 파혼 선언"],
      },
      access_profile: {
        knowledge_domains: ["가문 예법"],
        forbidden_knowledge: ["황실 밀약 전문"],
        access_rights: ["자신의 방"],
        surveillance_risk: ["안색이 무너지는 것"],
      },
      state: { level: 1, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
    });

    expect(character.relationship_facts?.[0].address_default).toBe("언니");
    expect(character.intent_profile?.hidden_goal).toBe("복수 준비");
    expect(character.access_profile?.access_rights).toContain("자신의 방");
    expect(getRelationshipFactForPair(character, { id: "serena", name: "세레나 크레센트" })?.private_truth).toBe("hostile");
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
