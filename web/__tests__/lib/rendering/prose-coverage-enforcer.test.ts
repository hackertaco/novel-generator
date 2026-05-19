import { describe, expect, it } from "vitest";
import { enforceProseCoverage } from "@/lib/rendering";
import type { NovelSeed } from "@/lib/schema/novel";

function makeRegressionSeed(): NovelSeed {
  return {
    title: "결정적 게이트 시드",
    logline: "회귀자가 자각한다.",
    total_chapters: 10,
    world: {
      name: "제국",
      genre: "로맨스 판타지",
      sub_genre: "회귀",
      time_period: "제국 시대",
      magic_system: null,
      key_locations: { 공작가: "" },
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "hero",
        name: "엘리시아",
        role: "주인공",
        social_rank: "noble",
        introduction_chapter: 1,
        voice: {
          tone: "차분함",
          speech_patterns: [],
          sample_dialogues: ["..."],
          personality_core: "냉정",
        },
        backstory: "회귀자",
        arc_summary: "복수를 결심한다",
        genre_origin: {
          kind: "regression",
          past_life_summary: "약혼식 다음 날 은잔의 독으로 죽었다",
          trigger: "독배를 마시고 눈을 뜨니 1년 전 약혼식 아침이었다",
          awareness_chapter: 1,
          must_understand: [
            "엘리시아는 회귀자다",
            "전생에 약혼식 직후 독살당했다",
          ],
          fallback_lines: {
            realization:
              "엘리시아는 자신이 회귀자임을 분명히 깨달았다.",
            flashback:
              "엘리시아는 전생에 약혼식 직후 독살당했던 자신을 떠올렸다.",
          },
        },
        state: {
          level: null,
          location: "공작가",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
          realization_stage: 1,
        },
      },
    ],
    arcs: [],
    chapter_outlines: [],
    extended_outlines: [],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "3인칭",
      tense: "과거형",
      formatting_rules: [],
    },
    story_threads: [],
  };
}

describe("enforceProseCoverage", () => {
  it("inserts fallback lines for missing must_understand items on regression chapter 1", () => {
    const seed = makeRegressionSeed();
    const result = enforceProseCoverage({
      text: "응접실은 너무 조용했다. 은잔만 차갑게 남아 있었다.",
      seed,
      chapter: 1,
    });

    expect(result.mustUnderstand).toEqual([
      "엘리시아는 회귀자다",
      "전생에 약혼식 직후 독살당했다",
    ]);
    expect(result.applied).toHaveLength(2);
    expect(result.applied.every((entry) => entry.source === "genre_convention")).toBe(true);
    expect(result.residualMissing).toEqual([]);
    expect(result.text).toContain("엘리시아는 자신이 회귀자임을 분명히 깨달았다.");
    expect(result.text).toContain("엘리시아는 전생에 약혼식 직후 독살당했던 자신을 떠올렸다.");
  });

  it("is a no-op when the text already covers every must_understand item", () => {
    const seed = makeRegressionSeed();
    const text =
      "엘리시아는 손끝의 통증으로 자신이 회귀했음을 깨달았다. 전생의 약혼식 직후 독살당했던 자신을 다시 떠올렸다.";
    const result = enforceProseCoverage({ text, seed, chapter: 1 });

    expect(result.applied).toEqual([]);
    expect(result.residualMissing).toEqual([]);
    expect(result.text).toBe(text);
  });

  it("is a no-op when no character has a genre_origin", () => {
    const seed = makeRegressionSeed();
    seed.characters[0] = {
      ...seed.characters[0],
      genre_origin: undefined,
    };
    const result = enforceProseCoverage({
      text: "응접실은 너무 조용했다.",
      seed,
      chapter: 1,
    });

    expect(result.mustUnderstand).toEqual([]);
    expect(result.applied).toEqual([]);
    expect(result.text).toBe("응접실은 너무 조용했다.");
  });

  it("is a no-op on chapters past awareness_chapter", () => {
    const seed = makeRegressionSeed();
    const result = enforceProseCoverage({
      text: "응접실은 너무 조용했다.",
      seed,
      chapter: 5,
    });

    expect(result.mustUnderstand).toEqual([]);
    expect(result.applied).toEqual([]);
    expect(result.text).toBe("응접실은 너무 조용했다.");
  });
});
