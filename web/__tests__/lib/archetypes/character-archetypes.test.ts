import { describe, it, expect } from "vitest";
import {
  MALE_LEAD_ARCHETYPES,
  FEMALE_LEAD_ARCHETYPES,
  GENRE_ARCHETYPE_POOLS,
  getMaleArchetype,
  getFemaleArchetype,
  getGenrePool,
  pickArchetypePair,
  getArchetypeGuidance,
} from "@/lib/archetypes/character-archetypes";

describe("character-archetypes", () => {
  describe("archetype data integrity", () => {
    it("has 6 male lead archetypes", () => {
      expect(MALE_LEAD_ARCHETYPES).toHaveLength(6);
    });

    it("has 7 female lead archetypes", () => {
      expect(FEMALE_LEAD_ARCHETYPES).toHaveLength(7);
    });

    it("every male archetype has unique id", () => {
      const ids = MALE_LEAD_ARCHETYPES.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every female archetype has unique id", () => {
      const ids = FEMALE_LEAD_ARCHETYPES.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every male archetype has at least 2 compatible female types", () => {
      for (const male of MALE_LEAD_ARCHETYPES) {
        expect(male.compatible_with.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("compatible_with references valid female archetype ids", () => {
      const femaleIds = new Set(FEMALE_LEAD_ARCHETYPES.map((a) => a.id));
      for (const male of MALE_LEAD_ARCHETYPES) {
        for (const fId of male.compatible_with) {
          expect(femaleIds.has(fId)).toBe(true);
        }
      }
    });

    it("every archetype has at least 3 sample_dialogues", () => {
      for (const a of [...MALE_LEAD_ARCHETYPES, ...FEMALE_LEAD_ARCHETYPES]) {
        expect(a.sample_dialogues.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("genre pools", () => {
    it("has pools for 7 genres", () => {
      expect(Object.keys(GENRE_ARCHETYPE_POOLS)).toHaveLength(7);
    });

    it("every pool references valid archetype ids", () => {
      const maleIds = new Set(MALE_LEAD_ARCHETYPES.map((a) => a.id));
      const femaleIds = new Set(FEMALE_LEAD_ARCHETYPES.map((a) => a.id));

      for (const [, pool] of Object.entries(GENRE_ARCHETYPE_POOLS)) {
        for (const id of pool.male_leads) {
          expect(maleIds.has(id)).toBe(true);
        }
        for (const id of pool.female_leads) {
          expect(femaleIds.has(id)).toBe(true);
        }
      }
    });
  });

  describe("lookup helpers", () => {
    it("getMaleArchetype finds by id", () => {
      const result = getMaleArchetype("obsessive");
      expect(result).toBeDefined();
      expect(result!.name).toBe("집착광공");
    });

    it("getFemaleArchetype finds by id", () => {
      const result = getFemaleArchetype("strong_willed");
      expect(result).toBeDefined();
      expect(result!.name).toBe("사이다 여주");
    });

    it("getGenrePool returns matching pool", () => {
      const pool = getGenrePool("로맨스 판타지");
      expect(pool.male_leads[0]).toBe("obsessive");
    });

    it("getGenrePool returns default for unknown genre", () => {
      const pool = getGenrePool("알 수 없는 장르");
      expect(pool.male_leads).toContain("sweet");
    });
  });

  describe("pickArchetypePair", () => {
    it("returns compatible pair for 로맨스 판타지", () => {
      const { male, female } = pickArchetypePair("로맨스 판타지", 0);
      expect(male.id).toBe("obsessive");
      expect(male.compatible_with).toContain(female.id);
    });

    it("returns different pairs for different indices", () => {
      const pair0 = pickArchetypePair("로맨스 판타지", 0);
      const pair1 = pickArchetypePair("로맨스 판타지", 1);
      expect(pair0.male.id).not.toBe(pair1.male.id);
    });
  });

  describe("getArchetypeGuidance", () => {
    it("generates prompt text with genre-specific archetypes", () => {
      const guidance = getArchetypeGuidance("로맨스 판타지");
      expect(guidance).toContain("집착광공형");
      expect(guidance).toContain("사이다형");
      expect(guidance).toContain("캐릭터 아키타입 가이드");
    });

    it("includes personality instructions", () => {
      const guidance = getArchetypeGuidance("현대 로맨스");
      expect(guidance).toContain("personality_core");
      expect(guidance).toContain("sample_dialogues");
    });
  });
});
