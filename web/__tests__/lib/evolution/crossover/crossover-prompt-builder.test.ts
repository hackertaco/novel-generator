/**
 * Tests for the crossover prompt builder.
 *
 * Verifies:
 *  - extractStrengthWeaknessProfile: correct weakness/strength identification
 *  - buildCrossoverPrompt: prompt contains expected sections and guidance
 *  - Edge cases: no weaknesses, no donor available, all weaknesses have donors
 */
import { describe, it, expect } from "vitest";
import {
  buildCrossoverPrompt,
  extractStrengthWeaknessProfile,
  WEAKNESS_THRESHOLD,
  MIN_IMPROVEMENT_DELTA,
  DIMENSIONS,
  type EvaluatedCandidate,
  type DimensionScores,
} from "@/lib/evolution/crossover/crossover-prompt-builder";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBaseSeed(overrides: Partial<NovelSeed> = {}): NovelSeed {
  return {
    title: "테스트 소설",
    logline: "테스트용 로그라인",
    total_chapters: 100,
    world: {
      name: "테스트 세계",
      genre: "로맨스 판타지",
      sub_genre: "귀족물",
      time_period: "중세",
      magic_system: "마법 시스템",
      key_locations: { 왕궁: "왕국의 중심지" },
      factions: { 황실: "지배 세력" },
      rules: ["마법은 귀족만 사용 가능"],
    },
    characters: [
      {
        id: "mc",
        name: "주인공",
        role: "주인공",
        introduction_chapter: 1,
        voice: {
          tone: "차분한",
          speech_patterns: ["~하겠어"],
          sample_dialogues: ["예시 대사"],
          personality_core: "정의로운",
        },
        backstory: "평민 출신",
        arc_summary: "귀족으로 성장",
        state: {
          level: 1,
          location: "왕궁",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
        },
      },
      {
        id: "heroine",
        name: "히로인",
        role: "히로인",
        introduction_chapter: 2,
        voice: {
          tone: "우아한",
          speech_patterns: ["~이에요"],
          sample_dialogues: ["예시 대사2"],
          personality_core: "고귀한",
        },
        backstory: "귀족 출신",
        arc_summary: "사랑을 찾아가는 여정",
        state: {
          level: null,
          location: "왕궁",
          status: "normal",
          relationships: {},
          inventory: [],
          secrets_known: [],
        },
      },
    ],
    arcs: [
      {
        id: "arc_1",
        name: "1부",
        start_chapter: 1,
        end_chapter: 50,
        summary: "주인공 성장",
        key_events: ["첫 만남", "갈등"],
        climax_chapter: 48,
      },
    ],
    chapter_outlines: [
      {
        chapter_number: 1,
        title: "1화",
        arc_id: "arc_1",
        one_liner: "주인공의 일상",
        key_points: ["평화로운 하루"],
        characters_involved: ["mc"],
        tension_level: 2,
      },
      {
        chapter_number: 2,
        title: "2화",
        arc_id: "arc_1",
        one_liner: "낌새",
        key_points: ["이상한 분위기"],
        characters_involved: ["mc", "heroine"],
        tension_level: 3,
      },
      {
        chapter_number: 3,
        title: "3화",
        arc_id: "arc_1",
        one_liner: "갈등의 씨앗",
        key_points: ["첫 갈등"],
        characters_involved: ["mc"],
        tension_level: 4,
      },
    ],
    foreshadowing: [
      {
        id: "fs_1",
        name: "비밀",
        description: "숨겨진 비밀",
        importance: "critical",
        planted_at: 5,
        hints_at: [15, 30],
        reveal_at: 48,
        status: "planted",
        hint_count: 0,
      },
    ],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [],
    },
    ...overrides,
  };
}

function makeCandidate(
  scores: DimensionScores,
  seedOverrides: Partial<NovelSeed> = {},
): EvaluatedCandidate {
  const overall =
    (scores.pacing_quality +
      scores.character_introduction +
      scores.foreshadowing_usage +
      scores.genre_alignment) /
    4;
  return {
    seed: makeBaseSeed(seedOverrides),
    scores,
    overall_score: overall,
  };
}

/** All-pass scores — every dimension above WEAKNESS_THRESHOLD */
const HIGH_SCORES: DimensionScores = {
  pacing_quality: 0.9,
  character_introduction: 0.85,
  foreshadowing_usage: 0.8,
  genre_alignment: 0.95,
};

/** All-fail scores — every dimension below WEAKNESS_THRESHOLD */
const LOW_SCORES: DimensionScores = {
  pacing_quality: 0.4,
  character_introduction: 0.3,
  foreshadowing_usage: 0.5,
  genre_alignment: 0.2,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("WEAKNESS_THRESHOLD is 0.7", () => {
    expect(WEAKNESS_THRESHOLD).toBe(0.7);
  });

  it("MIN_IMPROVEMENT_DELTA is 0.1", () => {
    expect(MIN_IMPROVEMENT_DELTA).toBe(0.1);
  });

  it("DIMENSIONS has exactly 4 entries", () => {
    expect(DIMENSIONS).toHaveLength(4);
    expect(DIMENSIONS).toContain("pacing_quality");
    expect(DIMENSIONS).toContain("character_introduction");
    expect(DIMENSIONS).toContain("foreshadowing_usage");
    expect(DIMENSIONS).toContain("genre_alignment");
  });
});

// ---------------------------------------------------------------------------
// extractStrengthWeaknessProfile
// ---------------------------------------------------------------------------

describe("extractStrengthWeaknessProfile", () => {
  describe("when rank 1 passes all dimensions", () => {
    it("has no weaknesses", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.weaknesses).toHaveLength(0);
    });

    it("lists all 4 dimensions as strengths", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.strengths).toHaveLength(4);
      for (const dim of DIMENSIONS) {
        expect(profile.strengths).toContain(dim);
      }
    });

    it("has no actionable improvements", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.actionable_improvements).toHaveLength(0);
    });
  });

  describe("when rank 1 fails all dimensions", () => {
    it("lists all 4 dimensions as weaknesses", () => {
      const best = makeCandidate(LOW_SCORES);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.weaknesses).toHaveLength(4);
    });

    it("has no strengths", () => {
      const best = makeCandidate(LOW_SCORES);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.strengths).toHaveLength(0);
    });

    it("marks all weaknesses as has_donor=true when rank 2 is much higher", () => {
      const best = makeCandidate(LOW_SCORES);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      for (const entry of profile.weaknesses) {
        expect(entry.has_donor).toBe(true);
      }
    });

    it("has 4 actionable improvements", () => {
      const best = makeCandidate(LOW_SCORES);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.actionable_improvements).toHaveLength(4);
    });
  });

  describe("weakness threshold boundary", () => {
    it("score exactly at WEAKNESS_THRESHOLD (0.7) is NOT a weakness", () => {
      const scores: DimensionScores = {
        pacing_quality: WEAKNESS_THRESHOLD,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      };
      const best = makeCandidate(scores);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.weaknesses.find((w) => w.dimension === "pacing_quality")).toBeUndefined();
      expect(profile.strengths).toContain("pacing_quality");
    });

    it("score just below WEAKNESS_THRESHOLD (0.699) IS a weakness", () => {
      const scores: DimensionScores = {
        pacing_quality: 0.699,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      };
      const best = makeCandidate(scores);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      const entry = profile.weaknesses.find((w) => w.dimension === "pacing_quality");
      expect(entry).toBeDefined();
    });
  });

  describe("donor identification (MIN_IMPROVEMENT_DELTA)", () => {
    it("has_donor=true when rank2_score >= rank1_score + MIN_IMPROVEMENT_DELTA", () => {
      const best = makeCandidate({
        pacing_quality: 0.5,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const runnerUp = makeCandidate({
        pacing_quality: 0.5 + MIN_IMPROVEMENT_DELTA, // exactly at threshold
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      const entry = profile.weaknesses.find((w) => w.dimension === "pacing_quality");
      expect(entry?.has_donor).toBe(true);
    });

    it("has_donor=false when rank2_score < rank1_score + MIN_IMPROVEMENT_DELTA", () => {
      const best = makeCandidate({
        pacing_quality: 0.5,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const runnerUp = makeCandidate({
        pacing_quality: 0.5 + MIN_IMPROVEMENT_DELTA - 0.001, // just under threshold
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      const entry = profile.weaknesses.find((w) => w.dimension === "pacing_quality");
      expect(entry?.has_donor).toBe(false);
    });

    it("has_donor=false when rank 2 is equal to rank 1", () => {
      const scores: DimensionScores = {
        pacing_quality: 0.5,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      };
      const best = makeCandidate(scores);
      const runnerUp = makeCandidate(scores);
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      const entry = profile.weaknesses.find((w) => w.dimension === "pacing_quality");
      expect(entry?.has_donor).toBe(false);
    });

    it("has_donor=false when rank 2 is worse than rank 1", () => {
      const best = makeCandidate({
        pacing_quality: 0.5,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const runnerUp = makeCandidate({
        pacing_quality: 0.3, // rank 2 is worse
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      const entry = profile.weaknesses.find((w) => w.dimension === "pacing_quality");
      expect(entry?.has_donor).toBe(false);
    });
  });

  describe("score values in WeaknessEntry", () => {
    it("records correct rank1_score and rank2_score", () => {
      const best = makeCandidate({
        pacing_quality: 0.45,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const runnerUp = makeCandidate({
        pacing_quality: 0.75,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      const entry = profile.weaknesses.find((w) => w.dimension === "pacing_quality")!;
      expect(entry.rank1_score).toBe(0.45);
      expect(entry.rank2_score).toBe(0.75);
    });
  });

  describe("actionable_improvements subset", () => {
    it("actionable_improvements is a subset of weaknesses where has_donor=true", () => {
      const best = makeCandidate({
        pacing_quality: 0.4,      // weak — rank 2 helps
        character_introduction: 0.5, // weak — rank 2 doesn't help enough
        foreshadowing_usage: 0.8,  // strong
        genre_alignment: 0.8,      // strong
      });
      const runnerUp = makeCandidate({
        pacing_quality: 0.8,       // much better → donor
        character_introduction: 0.51, // barely better → no donor
        foreshadowing_usage: 0.8,
        genre_alignment: 0.8,
      });
      const profile = extractStrengthWeaknessProfile(best, runnerUp);
      expect(profile.actionable_improvements).toContain("pacing_quality");
      expect(profile.actionable_improvements).not.toContain("character_introduction");
    });
  });
});

// ---------------------------------------------------------------------------
// buildCrossoverPrompt — prompt structure tests
// ---------------------------------------------------------------------------

describe("buildCrossoverPrompt", () => {
  const originalRequest = "장르: 로맨스 판타지, 줄거리: 평민이 귀족이 되는 이야기";

  describe("return shape", () => {
    it("returns an object with prompt string and profile", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      expect(typeof result.prompt).toBe("string");
      expect(result.profile).toBeDefined();
    });

    it("profile matches extractStrengthWeaknessProfile output", () => {
      const best = makeCandidate(LOW_SCORES);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      const expected = extractStrengthWeaknessProfile(best, runnerUp);
      expect(result.profile).toEqual(expected);
    });
  });

  describe("prompt always contains", () => {
    it("includes the original request text", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      expect(result.prompt).toContain(originalRequest);
    });

    it("includes a YAML block with rank 1 seed", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      expect(result.prompt).toContain("```yaml");
      expect(result.prompt).toContain("테스트 소설"); // title from base seed
    });

    it("includes a score table with all 4 dimension labels", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      expect(result.prompt).toContain("초반 페이싱");
      expect(result.prompt).toContain("캐릭터 등장 분산");
      expect(result.prompt).toContain("복선 활용");
      expect(result.prompt).toContain("장르 일치");
    });

    it("includes output instructions", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      expect(result.prompt).toContain("출력 지침");
    });
  });

  describe("when rank 1 has weaknesses and rank 2 can help", () => {
    const weakBest = makeCandidate({
      pacing_quality: 0.4,
      character_introduction: 0.3,
      foreshadowing_usage: 0.5,
      genre_alignment: 0.8,
    });
    const strongRunnerUp = makeCandidate(HIGH_SCORES);

    it("prompt includes '개선 지침' section", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("개선 지침");
    });

    it("prompt includes fix guidance for pacing_quality weakness", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      // pacing_quality is weak and rank 2 has better score
      expect(result.prompt).toContain("초반 페이싱");
      expect(result.prompt).toContain("tension_level");
    });

    it("prompt includes fix guidance for character_introduction weakness", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("캐릭터 등장 분산");
      expect(result.prompt).toContain("introduction_chapter");
    });

    it("prompt includes fix guidance for foreshadowing_usage weakness", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("복선 활용");
      expect(result.prompt).toContain("planted_at");
    });

    it("prompt includes donor content for pacing weakness (early chapter outlines)", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      // Donor content for pacing should include chapter_outlines
      expect(result.prompt).toContain("chapter_outlines");
    });

    it("prompt includes '유지해야 할 강점' section for genre_alignment", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("유지해야 할 강점");
      expect(result.prompt).toContain("장르 일치");
    });

    it("score table marks weak dimensions with ⚠️", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("⚠️");
    });

    it("score table marks strong dimensions with ✅", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("✅");
    });
  });

  describe("when rank 1 has weaknesses but rank 2 cannot help", () => {
    const weakBest = makeCandidate({
      pacing_quality: 0.4,
      character_introduction: 0.8,
      foreshadowing_usage: 0.8,
      genre_alignment: 0.8,
    });
    const alsoWeakRunnerUp = makeCandidate({
      pacing_quality: 0.41, // barely better, below MIN_IMPROVEMENT_DELTA
      character_introduction: 0.8,
      foreshadowing_usage: 0.8,
      genre_alignment: 0.8,
    });

    it("prompt includes improvement guidance without donor reference", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: alsoWeakRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("개선 지침");
      // Still shows the fix guidance even without a donor
      expect(result.prompt).toContain("초반 페이싱");
    });

    it("marks the weakness with '참고 없음'", () => {
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: alsoWeakRunnerUp,
        original_request: originalRequest,
      });
      expect(result.prompt).toContain("참고 없음");
    });
  });

  describe("when rank 1 passes all dimensions", () => {
    it("prompt indicates all metrics passed", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      expect(result.prompt).toContain("모든 지표 통과");
    });

    it("prompt does not contain a weaknesses section", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(HIGH_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      // Should NOT show the "개선 지침" weakness header
      expect(result.prompt).not.toContain("1위 약점 → 2위 강점으로 보완");
    });
  });

  describe("donor content extraction", () => {
    it("includes foreshadowing ids in donor content for foreshadowing_usage weakness", () => {
      const weakBest = makeCandidate({
        pacing_quality: 0.8,
        character_introduction: 0.8,
        foreshadowing_usage: 0.4,
        genre_alignment: 0.8,
      });
      const strongRunnerUp = makeCandidate(HIGH_SCORES);
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      // Donor content for foreshadowing should include foreshadowing list
      expect(result.prompt).toContain("foreshadowing");
    });

    it("includes world settings in donor content for genre_alignment weakness", () => {
      const weakBest = makeCandidate({
        pacing_quality: 0.8,
        character_introduction: 0.8,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.4,
      });
      const strongRunnerUp = makeCandidate(HIGH_SCORES);
      const result = buildCrossoverPrompt({
        best: weakBest,
        runner_up: strongRunnerUp,
        original_request: originalRequest,
      });
      // Donor content for genre_alignment should include world settings
      expect(result.prompt).toContain("world");
    });
  });

  describe("score formatting", () => {
    it("formats scores as percentages in the score table", () => {
      const best = makeCandidate({
        pacing_quality: 0.9,
        character_introduction: 0.85,
        foreshadowing_usage: 0.8,
        genre_alignment: 0.95,
      });
      const runnerUp = makeCandidate(LOW_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      // 0.9 → "90%", 0.4 → "40%"
      expect(result.prompt).toContain("90%");
      expect(result.prompt).toContain("40%");
    });
  });

  describe("score table format", () => {
    it("includes overall score row", () => {
      const best = makeCandidate(HIGH_SCORES);
      const runnerUp = makeCandidate(LOW_SCORES);
      const result = buildCrossoverPrompt({ best, runner_up: runnerUp, original_request: originalRequest });
      expect(result.prompt).toContain("종합");
    });
  });
});
