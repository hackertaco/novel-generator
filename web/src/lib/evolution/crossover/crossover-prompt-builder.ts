/**
 * Crossover prompt builder for the arc evolution loop.
 *
 * Takes the best (rank 1) and runner-up (rank 2) evaluated candidates and
 * constructs a crossover prompt that instructs the LLM to:
 *   1. Use rank 1 as the base blueprint
 *   2. Fix rank 1's weak dimensions by referencing rank 2's approach
 *   3. Preserve rank 1's strong dimensions unchanged
 *
 * Zero LLM calls — purely code-based analysis.
 */

import * as yaml from "js-yaml";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Dimension definitions
// ---------------------------------------------------------------------------

/** All evaluation dimensions used in the evolution loop. */
export const DIMENSIONS = [
  "pacing_quality",
  "character_introduction",
  "foreshadowing_usage",
  "genre_alignment",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

// ---------------------------------------------------------------------------
// Score / candidate types
// ---------------------------------------------------------------------------

/** Per-dimension scores (0–1 each) for a single candidate. */
export interface DimensionScores {
  pacing_quality: number;
  character_introduction: number;
  foreshadowing_usage: number;
  genre_alignment: number;
}

/** A NovelSeed candidate that has been evaluated. */
export interface EvaluatedCandidate {
  seed: NovelSeed;
  scores: DimensionScores;
  /** Weighted overall score 0–1 */
  overall_score: number;
}

// ---------------------------------------------------------------------------
// Profile types
// ---------------------------------------------------------------------------

/** Score below this is treated as a "weakness". */
export const WEAKNESS_THRESHOLD = 0.7;

/**
 * Minimum score gap by which rank 2 must outperform rank 1 on a dimension
 * for rank 2 to be considered a meaningful "donor" for that dimension.
 */
export const MIN_IMPROVEMENT_DELTA = 0.1;

export interface WeaknessEntry {
  dimension: Dimension;
  /** Rank 1's score on this dimension */
  rank1_score: number;
  /** Rank 2's score on this dimension */
  rank2_score: number;
  /**
   * True when rank 2 is meaningfully better:
   *   rank2_score >= rank1_score + MIN_IMPROVEMENT_DELTA
   */
  has_donor: boolean;
}

export interface StrengthWeaknessProfile {
  /** Dimensions where rank 1 scored below WEAKNESS_THRESHOLD */
  weaknesses: WeaknessEntry[];
  /** Dimensions where rank 1 scored at or above WEAKNESS_THRESHOLD */
  strengths: Dimension[];
  /** Subset of weaknesses where rank 2 can meaningfully help */
  actionable_improvements: Dimension[];
}

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface CrossoverPromptInput {
  /** Rank 1 candidate (base blueprint) */
  best: EvaluatedCandidate;
  /** Rank 2 candidate (donor for weak dimensions) */
  runner_up: EvaluatedCandidate;
  /** Original request text forwarded to the crossover generation */
  original_request: string;
}

export interface CrossoverPromptResult {
  /** Ready-to-send prompt string for the LLM crossover call */
  prompt: string;
  /** Extracted strength/weakness profile used to build the prompt */
  profile: StrengthWeaknessProfile;
}

// ---------------------------------------------------------------------------
// Korean labels & guidance
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<Dimension, string> = {
  pacing_quality: "초반 페이싱",
  character_introduction: "캐릭터 등장 분산",
  foreshadowing_usage: "복선 활용",
  genre_alignment: "장르 일치",
};

const DIMENSION_FIX_GUIDANCE: Record<Dimension, string> = {
  pacing_quality:
    "1화 key_points를 1개 이하로 줄이고, 1~3화의 tension_level을 4 이하로 낮춰 " +
    "초반 페이싱이 자연스럽게 흘러가도록 조정하세요. " +
    "독자가 주인공과 친해질 시간을 확보하는 것이 핵심입니다.",
  character_introduction:
    "1화 등장 캐릭터(introduction_chapter=1)를 최대 2명으로 제한하고, " +
    "이후 화에서는 화당 신규 캐릭터를 1명씩만 순차적으로 소개하세요.",
  foreshadowing_usage:
    "각 아크마다 planted_at이 해당 아크 챕터 범위에 포함된 복선을 최소 1개, " +
    "reveal_at이 해당 아크 챕터 범위에 포함된 복선을 최소 1개 배치하세요.",
  genre_alignment:
    "장르 핵심 키워드와 소재를 적극 활용하고, 다른 장르를 연상시키는 " +
    "부적절한 키워드나 소재는 제거하거나 장르에 맞게 변환하세요.",
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Build a crossover prompt that merges rank 1's base with rank 2's strengths.
 *
 * @param input  Two evaluated candidates + original request text.
 * @returns      A ready-to-send prompt string and the extracted profile.
 */
export function buildCrossoverPrompt(
  input: CrossoverPromptInput,
): CrossoverPromptResult {
  const profile = extractStrengthWeaknessProfile(input.best, input.runner_up);
  const prompt = buildPromptString(input, profile);
  return { prompt, profile };
}

// ---------------------------------------------------------------------------
// Profile extraction
// ---------------------------------------------------------------------------

/**
 * Compare rank 1 and rank 2 scores to extract weaknesses and strengths.
 */
export function extractStrengthWeaknessProfile(
  best: EvaluatedCandidate,
  runnerUp: EvaluatedCandidate,
): StrengthWeaknessProfile {
  const weaknesses: WeaknessEntry[] = [];
  const strengths: Dimension[] = [];
  const actionableImprovements: Dimension[] = [];

  for (const dim of DIMENSIONS) {
    const r1Score = best.scores[dim];
    const r2Score = runnerUp.scores[dim];

    if (r1Score < WEAKNESS_THRESHOLD) {
      const hasDonor = r2Score >= r1Score + MIN_IMPROVEMENT_DELTA;
      weaknesses.push({
        dimension: dim,
        rank1_score: r1Score,
        rank2_score: r2Score,
        has_donor: hasDonor,
      });
      if (hasDonor) {
        actionableImprovements.push(dim);
      }
    } else {
      strengths.push(dim);
    }
  }

  return {
    weaknesses,
    strengths,
    actionable_improvements: actionableImprovements,
  };
}

// ---------------------------------------------------------------------------
// Prompt string builder
// ---------------------------------------------------------------------------

/**
 * Assemble the full crossover prompt from the profile and candidate data.
 */
function buildPromptString(
  input: CrossoverPromptInput,
  profile: StrengthWeaknessProfile,
): string {
  const { best, runner_up, original_request } = input;

  const rank1Yaml = serializeSeedToYaml(best.seed);
  const parts: string[] = [];

  parts.push("# 교배(Crossover) 생성 요청\n");
  parts.push(
    "다음은 진화 루프의 1위 후보(기반 설계)입니다. " +
      "이를 기반으로, 아래에 나열된 **약점**을 2위 후보의 강점을 참고하여 보완한 " +
      "새로운 NovelSeed를 생성해주세요.\n",
  );

  // --- Original request context ---
  parts.push("## 원본 요청\n");
  parts.push(original_request + "\n");

  // --- Rank 1 base seed ---
  parts.push("## 1위 후보 (기반 설계)\n");
  parts.push("```yaml");
  parts.push(rank1Yaml);
  parts.push("```\n");

  // --- Scores summary ---
  parts.push("## 평가 점수 요약\n");
  parts.push(buildScoreTable(best, runner_up));

  // --- Weakness guidance ---
  if (profile.actionable_improvements.length > 0) {
    parts.push("## 개선 지침 (1위 약점 → 2위 강점으로 보완)\n");
    for (const entry of profile.weaknesses) {
      if (!entry.has_donor) continue;
      const label = DIMENSION_LABELS[entry.dimension];
      const guidance = DIMENSION_FIX_GUIDANCE[entry.dimension];
      const donorContent = extractDonorContent(runner_up.seed, entry.dimension);
      parts.push(
        `### ${label} (1위 점수: ${formatScore(entry.rank1_score)} → 2위 점수: ${formatScore(entry.rank2_score)})\n`,
      );
      parts.push(`**개선 방향**: ${guidance}\n`);
      if (donorContent) {
        parts.push(`**2위 후보 참고 내용**:\n\`\`\`yaml\n${donorContent}\n\`\`\`\n`);
      }
    }
  } else if (profile.weaknesses.length > 0) {
    // Weaknesses exist but rank 2 is not a better donor — note without reference
    parts.push("## 개선 지침 (참고 후보 없음)\n");
    for (const entry of profile.weaknesses) {
      const label = DIMENSION_LABELS[entry.dimension];
      const guidance = DIMENSION_FIX_GUIDANCE[entry.dimension];
      parts.push(`### ${label} (1위 점수: ${formatScore(entry.rank1_score)})\n`);
      parts.push(`**개선 방향**: ${guidance}\n`);
    }
  } else {
    parts.push(
      "## 평가 결과: 모든 지표 통과\n\n" +
        "1위 후보가 모든 지표에서 충분히 높은 점수를 받았습니다. " +
        "기반 설계를 유지하면서 세부 완성도를 높이는 방향으로 재생성하세요.\n",
    );
  }

  // --- Strengths to preserve ---
  if (profile.strengths.length > 0) {
    parts.push("## 유지해야 할 강점\n");
    parts.push(
      "다음 지표는 1위 후보에서 이미 잘 구현되었습니다. **변경하지 마세요**:\n",
    );
    for (const dim of profile.strengths) {
      const label = DIMENSION_LABELS[dim];
      const score = best.scores[dim];
      parts.push(`- **${label}** (점수: ${formatScore(score)})`);
    }
    parts.push("");
  }

  // --- Output instructions ---
  parts.push("## 출력 지침\n");
  parts.push(
    "- 위 1위 후보의 기본 설정(제목, 세계관 핵심, 캐릭터 성격)은 최대한 유지하세요\n" +
      "- **개선 지침**에 나열된 항목만 선택적으로 수정하세요\n" +
      "- **유지해야 할 강점** 항목에 해당하는 부분은 1위 후보를 그대로 따르세요\n" +
      "- 출력은 동일한 YAML 구조(NovelSeed 형식)를 유지하세요\n" +
      "- YAML 블록(\`\`\`yaml ... \`\`\`) 안에만 내용을 담아주세요\n",
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Helper: score table
// ---------------------------------------------------------------------------

function buildScoreTable(
  best: EvaluatedCandidate,
  runnerUp: EvaluatedCandidate,
): string {
  const lines: string[] = [
    "| 지표 | 1위 점수 | 2위 점수 | 판정 |",
    "| ---- | -------- | -------- | ---- |",
  ];
  for (const dim of DIMENSIONS) {
    const r1 = best.scores[dim];
    const r2 = runnerUp.scores[dim];
    const label = DIMENSION_LABELS[dim];
    const verdict =
      r1 < WEAKNESS_THRESHOLD
        ? r2 >= r1 + MIN_IMPROVEMENT_DELTA
          ? "⚠️ 약점 (보완 가능)"
          : "⚠️ 약점 (참고 없음)"
        : "✅ 강점";
    lines.push(
      `| ${label} | ${formatScore(r1)} | ${formatScore(r2)} | ${verdict} |`,
    );
  }
  lines.push(
    `| **종합** | **${formatScore(best.overall_score)}** | **${formatScore(runnerUp.overall_score)}** | |`,
  );
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Helper: extract dimension-relevant content from donor seed
// ---------------------------------------------------------------------------

/**
 * Extract the portion of rank 2's seed that is most relevant to the given
 * dimension.  Returns a YAML string or null if there is nothing notable.
 */
function extractDonorContent(
  donorSeed: NovelSeed,
  dimension: Dimension,
): string | null {
  switch (dimension) {
    case "pacing_quality": {
      const earlyChapters = donorSeed.chapter_outlines
        .filter((ch) => ch.chapter_number <= 3)
        .sort((a, b) => a.chapter_number - b.chapter_number);
      if (earlyChapters.length === 0) return null;
      return yaml.dump({ chapter_outlines: earlyChapters }, { indent: 2, lineWidth: 120 }).trim();
    }

    case "character_introduction": {
      const charList = donorSeed.characters.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        introduction_chapter: c.introduction_chapter,
      }));
      const earlyChapters = donorSeed.chapter_outlines
        .filter((ch) => ch.chapter_number <= 5)
        .map((ch) => ({
          chapter_number: ch.chapter_number,
          characters_involved: ch.characters_involved,
        }));
      return yaml
        .dump(
          { characters: charList, early_chapter_characters: earlyChapters },
          { indent: 2, lineWidth: 120 },
        )
        .trim();
    }

    case "foreshadowing_usage": {
      const fsList = donorSeed.foreshadowing.map((fs) => ({
        id: fs.id,
        name: fs.name,
        planted_at: fs.planted_at,
        reveal_at: fs.reveal_at,
      }));
      const arcList = donorSeed.arcs.map((a) => ({
        id: a.id,
        name: a.name,
        start_chapter: a.start_chapter,
        end_chapter: a.end_chapter,
      }));
      return yaml
        .dump({ foreshadowing: fsList, arcs: arcList }, { indent: 2, lineWidth: 120 })
        .trim();
    }

    case "genre_alignment": {
      const world = {
        name: donorSeed.world.name,
        genre: donorSeed.world.genre,
        sub_genre: donorSeed.world.sub_genre,
        magic_system: donorSeed.world.magic_system,
        rules: donorSeed.world.rules,
        key_locations: donorSeed.world.key_locations,
      };
      return yaml.dump({ world }, { indent: 2, lineWidth: 120 }).trim();
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function serializeSeedToYaml(seed: NovelSeed): string {
  return yaml.dump(seed, { indent: 2, lineWidth: 120 });
}

function formatScore(score: number): string {
  return (score * 100).toFixed(0) + "%";
}
