// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  evaluateCharacterDensity,
  EP1_MAX_CHARACTERS,
  MAX_NEW_PER_CHAPTER,
} from "@/lib/evaluators/character-density";
import type { Character } from "@/lib/schema/character";

/** Minimal character fixture */
function makeChar(
  id: string,
  introduction_chapter: number,
): Pick<Character, "introduction_chapter"> {
  return { introduction_chapter };
}

describe("evaluateCharacterDensity", () => {
  describe("constants", () => {
    it("EP1_MAX_CHARACTERS is 2", () => {
      expect(EP1_MAX_CHARACTERS).toBe(2);
    });

    it("MAX_NEW_PER_CHAPTER is 1", () => {
      expect(MAX_NEW_PER_CHAPTER).toBe(1);
    });
  });

  describe("ep1_character_count", () => {
    it("passes when chapter 1 has exactly 2 characters", () => {
      const chars = [makeChar("a", 1), makeChar("b", 1)];
      const result = evaluateCharacterDensity(chars);

      expect(result.ep1_character_count.count).toBe(2);
      expect(result.ep1_character_count.limit).toBe(2);
      expect(result.ep1_character_count.score).toBe(1.0);
      expect(result.ep1_character_count.pass).toBe(true);
    });

    it("passes when chapter 1 has 1 character", () => {
      const chars = [makeChar("a", 1), makeChar("b", 2)];
      const result = evaluateCharacterDensity(chars);

      expect(result.ep1_character_count.count).toBe(1);
      expect(result.ep1_character_count.pass).toBe(true);
      expect(result.ep1_character_count.score).toBe(1.0);
    });

    it("passes when chapter 1 has 0 characters (empty)", () => {
      const chars: Pick<Character, "introduction_chapter">[] = [];
      const result = evaluateCharacterDensity(chars);

      expect(result.ep1_character_count.count).toBe(0);
      expect(result.ep1_character_count.pass).toBe(true);
      expect(result.ep1_character_count.score).toBe(1.0);
    });

    it("fails when chapter 1 has 3 characters", () => {
      const chars = [makeChar("a", 1), makeChar("b", 1), makeChar("c", 1)];
      const result = evaluateCharacterDensity(chars);

      expect(result.ep1_character_count.count).toBe(3);
      expect(result.ep1_character_count.pass).toBe(false);
      // 1 extra → score = 1.0 - 0.3 = 0.7
      expect(result.ep1_character_count.score).toBeCloseTo(0.7);
    });

    it("fails with lower score when chapter 1 has 4 characters", () => {
      const chars = [
        makeChar("a", 1),
        makeChar("b", 1),
        makeChar("c", 1),
        makeChar("d", 1),
      ];
      const result = evaluateCharacterDensity(chars);

      expect(result.ep1_character_count.count).toBe(4);
      expect(result.ep1_character_count.pass).toBe(false);
      // 2 extra → score = 1.0 - 0.6 = 0.4
      expect(result.ep1_character_count.score).toBeCloseTo(0.4);
    });

    it("score floors at 0 even with many extra characters", () => {
      // 7 characters in chapter 1 → 5 over limit → penalty 1.5 → capped at 0
      const chars = Array.from({ length: 7 }, (_, i) => makeChar(`c${i}`, 1));
      const result = evaluateCharacterDensity(chars);

      expect(result.ep1_character_count.score).toBe(0);
      expect(result.ep1_character_count.pass).toBe(false);
    });
  });

  describe("new_per_chapter", () => {
    it("passes when each later chapter introduces exactly 1 new character", () => {
      const chars = [
        makeChar("a", 1),
        makeChar("b", 2),
        makeChar("c", 3),
        makeChar("d", 4),
      ];
      const result = evaluateCharacterDensity(chars);

      expect(result.new_per_chapter.violations).toHaveLength(0);
      expect(result.new_per_chapter.pass).toBe(true);
      expect(result.new_per_chapter.score).toBe(1.0);
    });

    it("detects violation when chapter 2 introduces 2 new characters", () => {
      const chars = [
        makeChar("a", 1),
        makeChar("b", 2),
        makeChar("c", 2), // violation: 2 new in ch2
      ];
      const result = evaluateCharacterDensity(chars);

      expect(result.new_per_chapter.violations).toHaveLength(1);
      expect(result.new_per_chapter.violations[0]).toEqual({
        chapter: 2,
        new_count: 2,
        limit: 1,
      });
      expect(result.new_per_chapter.pass).toBe(false);
    });

    it("detects multiple violations across chapters", () => {
      const chars = [
        makeChar("a", 1),
        makeChar("b", 2),
        makeChar("c", 2), // violation ch2: 2 new
        makeChar("d", 3),
        makeChar("e", 3), // violation ch3: 2 new
        makeChar("f", 4), // ok
      ];
      const result = evaluateCharacterDensity(chars);

      expect(result.new_per_chapter.violations).toHaveLength(2);
      expect(result.new_per_chapter.total_chapters_checked).toBe(3); // ch2, ch3, ch4
    });

    it("score is 0 when all later chapters violate the rule", () => {
      const chars = [
        makeChar("a", 2),
        makeChar("b", 2), // ch2: 2 new → violation
        makeChar("c", 3),
        makeChar("d", 3), // ch3: 2 new → violation
      ];
      const result = evaluateCharacterDensity(chars);

      // 2 violations out of 2 chapters → ratio 1.0 → score 0
      expect(result.new_per_chapter.score).toBe(0);
      expect(result.new_per_chapter.pass).toBe(false);
    });

    it("score decreases proportionally with violation ratio", () => {
      // 2 chapters checked (ch2, ch3, ch4), 1 violation → ratio = 1/3
      const chars = [
        makeChar("a", 1),
        makeChar("b", 2),
        makeChar("c", 2), // ch2: 2 new → violation
        makeChar("d", 3), // ch3: ok
        makeChar("e", 4), // ch4: ok
      ];
      const result = evaluateCharacterDensity(chars);

      expect(result.new_per_chapter.violations).toHaveLength(1);
      expect(result.new_per_chapter.total_chapters_checked).toBe(3);
      // score = 1 - 1/3 ≈ 0.667
      expect(result.new_per_chapter.score).toBeCloseTo(0.667, 2);
    });

    it("passes with no later chapters (all characters in ch1)", () => {
      const chars = [makeChar("a", 1), makeChar("b", 1)];
      const result = evaluateCharacterDensity(chars);

      expect(result.new_per_chapter.total_chapters_checked).toBe(0);
      expect(result.new_per_chapter.violations).toHaveLength(0);
      expect(result.new_per_chapter.score).toBe(1.0);
      expect(result.new_per_chapter.pass).toBe(true);
    });
  });

  describe("overall_score", () => {
    it("is 1.0 for a perfectly distributed character introduction", () => {
      // ch1: 2, ch2: 1, ch3: 1, ch4: 1
      const chars = [
        makeChar("a", 1),
        makeChar("b", 1),
        makeChar("c", 2),
        makeChar("d", 3),
        makeChar("e", 4),
      ];
      const result = evaluateCharacterDensity(chars);

      expect(result.overall_score).toBe(1.0);
    });

    it("is between 0 and 1 for any input", () => {
      const chars = [
        makeChar("a", 1),
        makeChar("b", 1),
        makeChar("c", 1), // ep1 violation
        makeChar("d", 2),
        makeChar("e", 2), // ch2 violation
      ];
      const result = evaluateCharacterDensity(chars);

      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(1);
    });

    it("is lower when ep1 has too many characters", () => {
      const perfect = [makeChar("a", 1), makeChar("b", 2)];
      const violating = [makeChar("a", 1), makeChar("b", 1), makeChar("c", 1)];

      const perfectResult = evaluateCharacterDensity(perfect);
      const violatingResult = evaluateCharacterDensity(violating);

      expect(violatingResult.overall_score).toBeLessThan(perfectResult.overall_score);
    });

    it("uses 40% ep1 + 60% new_per_chapter weighting", () => {
      // ep1: 3 chars → score = 0.7 (1 extra, -0.3)
      // new_per_chapter: no later chapters → score = 1.0
      // overall = 0.7 * 0.4 + 1.0 * 0.6 = 0.28 + 0.6 = 0.88
      const chars = [makeChar("a", 1), makeChar("b", 1), makeChar("c", 1)];
      const result = evaluateCharacterDensity(chars);

      expect(result.overall_score).toBeCloseTo(0.88, 2);
    });
  });
});
