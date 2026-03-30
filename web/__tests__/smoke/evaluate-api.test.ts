// @vitest-environment node
import { describe, it, expect } from "vitest";
import { evaluateStyle } from "@/lib/evaluators/style";
import { evaluateConsistency } from "@/lib/evaluators/consistency";

describe("/api/evaluate smoke test", () => {
  const testContent = `"이게 뭐야?" 현우가 물었다.

서연이 웃었다. "비밀이야."

"알아서 해." 현우가 돌아섰다.

그때, 뒤에서 거대한 폭발음이 들렸다...`;

  const testSeed = {
    title: "테스트",
    logline: "테스트",
    total_chapters: 100,
    world: { name: "세계", genre: "현대 판타지", sub_genre: "회귀", time_period: "현대", magic_system: null, key_locations: {}, factions: {}, rules: [] },
    characters: [{
      id: "mc", name: "현우", role: "주인공", social_rank: "commoner" as const, introduction_chapter: 1,
      voice: { tone: "냉소적", speech_patterns: ["~하지", "알아서 해"], sample_dialogues: ["대사"], personality_core: "냉소적" },
      backstory: "배경", arc_summary: "성장", state: { level: 1, location: null, status: "normal", relationships: {}, inventory: [], secrets_known: [] },
    }],
    arcs: [{ id: "arc_1", name: "1부", start_chapter: 1, end_chapter: 50, summary: "요약", key_events: [], climax_chapter: 48 }],
    chapter_outlines: [],
    story_threads: [],
    foreshadowing: [],
    style: { max_paragraph_length: 3, dialogue_ratio: 0.6, sentence_style: "short", hook_ending: true, pov: "1인칭", tense: "과거형", formatting_rules: [] },
  };

  it("should return style evaluation with all fields", () => {
    const result = evaluateStyle(testContent, testSeed.style);

    expect(result).toHaveProperty("dialogue_ratio");
    expect(result).toHaveProperty("paragraph_length");
    expect(result).toHaveProperty("sentence_length");
    expect(result).toHaveProperty("hook_ending");
    expect(result).toHaveProperty("overall_score");
    expect(result.overall_score).toBeGreaterThanOrEqual(0);
    expect(result.overall_score).toBeLessThanOrEqual(1);
  });

  it("should return consistency evaluation with all fields", () => {
    const result = evaluateConsistency(testSeed, 1, testContent);

    expect(result).toHaveProperty("character_voice");
    expect(result).toHaveProperty("foreshadowing");
    expect(result).toHaveProperty("world_rules");
    expect(result).toHaveProperty("continuity");
  });

  it("should detect hook ending in test content", () => {
    const result = evaluateStyle(testContent, testSeed.style);
    expect(result.hook_ending.has_hook).toBe(true);
  });
});
