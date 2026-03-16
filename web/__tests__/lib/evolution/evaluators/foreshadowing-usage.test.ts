/**
 * Tests for the foreshadowing usage evaluator (arc evolution loop).
 *
 * Verifies:
 *  - 아크당 최소 1개 복선 심기(plant) 있는지
 *  - 아크당 최소 1개 복선 회수(reveal) 있는지
 */
import { describe, it, expect } from "vitest";
import {
  evaluateForeshadowingUsage,
  MIN_PLANTS_PER_ARC,
  MIN_REVEALS_PER_ARC,
} from "@/lib/evolution/evaluators/foreshadowing-usage";
import type { NovelSeed } from "@/lib/schema/novel";
import type { Foreshadowing } from "@/lib/schema/foreshadowing";
import type { PlotArc } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArc(
  id: string,
  name: string,
  startChapter: number,
  endChapter: number,
): PlotArc {
  return {
    id,
    name,
    start_chapter: startChapter,
    end_chapter: endChapter,
    summary: `${name} 요약`,
    key_events: [],
    climax_chapter: Math.floor((startChapter + endChapter) / 2),
  };
}

function makeForeshadowing(
  id: string,
  plantedAt: number,
  revealAt: number | null = null,
): Foreshadowing {
  return {
    id,
    name: `복선-${id}`,
    description: `${id} 복선 설명`,
    importance: "normal",
    planted_at: plantedAt,
    hints_at: [],
    reveal_at: revealAt,
    status: "pending",
    hint_count: 0,
  };
}

function makeSeed(
  arcs: PlotArc[],
  foreshadowing: Foreshadowing[],
): NovelSeed {
  return {
    title: "테스트 소설",
    logline: "테스트용 로그라인",
    total_chapters: 100,
    world: {
      name: "테스트 세계",
      genre: "현대 판타지",
      sub_genre: "헌터물",
      time_period: "현대",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    arcs,
    chapter_outlines: [],
    foreshadowing,
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

describe("exported constants", () => {
  it("MIN_PLANTS_PER_ARC is 1", () => {
    expect(MIN_PLANTS_PER_ARC).toBe(1);
  });

  it("MIN_REVEALS_PER_ARC is 1", () => {
    expect(MIN_REVEALS_PER_ARC).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases: no arcs / no foreshadowing
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("returns pass=true with score 1.0 when no arcs are defined", () => {
    const seed = makeSeed([], []);
    const result = evaluateForeshadowingUsage(seed);
    expect(result.pass).toBe(true);
    expect(result.overall_score).toBe(1.0);
    expect(result.arc_details).toHaveLength(0);
    expect(result.issues).toHaveLength(0);
  });

  it("returns pass=false when arc exists but no foreshadowing at all", () => {
    const seed = makeSeed([makeArc("arc_1", "1부", 1, 10)], []);
    const result = evaluateForeshadowingUsage(seed);
    expect(result.pass).toBe(false);
    expect(result.plant_coverage.pass).toBe(false);
    expect(result.reveal_coverage.pass).toBe(false);
  });

  it("handles seed with arcs but foreshadowing list is empty gracefully", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "도입부", 1, 5), makeArc("arc_2", "전개부", 6, 15)],
      [],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.arc_details).toHaveLength(2);
    expect(result.plant_coverage.missing_arcs).toHaveLength(2);
    expect(result.reveal_coverage.missing_arcs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// plant_coverage (복선 심기)
// ---------------------------------------------------------------------------

describe("plant_coverage", () => {
  it("passes when each arc has at least 1 foreshadowing planted in its range", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [
        makeForeshadowing("fs_1", 3),  // planted in arc_1
        makeForeshadowing("fs_2", 12), // planted in arc_2
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.plant_coverage.pass).toBe(true);
    expect(result.plant_coverage.score).toBe(1.0);
    expect(result.plant_coverage.covered_arcs).toContain("arc_1");
    expect(result.plant_coverage.covered_arcs).toContain("arc_2");
    expect(result.plant_coverage.missing_arcs).toHaveLength(0);
  });

  it("fails when one arc has no planted foreshadowing", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [
        makeForeshadowing("fs_1", 3), // planted only in arc_1
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.plant_coverage.pass).toBe(false);
    expect(result.plant_coverage.covered_arcs).toContain("arc_1");
    expect(result.plant_coverage.missing_arcs).toContain("arc_2");
  });

  it("score is 0.5 when exactly half the arcs have a plant", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [makeForeshadowing("fs_1", 5)], // only arc_1 covered
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.plant_coverage.score).toBe(0.5);
  });

  it("score is 0.0 when no arc has a plant", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.plant_coverage.score).toBe(0.0);
  });

  it("correctly identifies planted_ids per arc", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [
        makeForeshadowing("fs_a", 2),
        makeForeshadowing("fs_b", 8),
        makeForeshadowing("fs_c", 11), // outside arc_1
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    const arcDetail = result.arc_details[0];
    expect(arcDetail.planted_ids).toContain("fs_a");
    expect(arcDetail.planted_ids).toContain("fs_b");
    expect(arcDetail.planted_ids).not.toContain("fs_c");
  });

  it("foreshadowing planted exactly at arc start/end boundary counts", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 5, 10)],
      [
        makeForeshadowing("fs_start", 5),  // exactly at start
        makeForeshadowing("fs_end", 10),   // exactly at end
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    const arcDetail = result.arc_details[0];
    expect(arcDetail.planted_ids).toContain("fs_start");
    expect(arcDetail.planted_ids).toContain("fs_end");
    expect(arcDetail.has_plant).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reveal_coverage (복선 회수)
// ---------------------------------------------------------------------------

describe("reveal_coverage", () => {
  it("passes when each arc has at least 1 foreshadowing revealed in its range", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [
        makeForeshadowing("fs_1", 2, 9),   // revealed in arc_1
        makeForeshadowing("fs_2", 3, 15),  // revealed in arc_2
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.reveal_coverage.pass).toBe(true);
    expect(result.reveal_coverage.score).toBe(1.0);
    expect(result.reveal_coverage.covered_arcs).toContain("arc_1");
    expect(result.reveal_coverage.covered_arcs).toContain("arc_2");
  });

  it("fails when reveal_at is null (foreshadowing never resolved)", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [
        makeForeshadowing("fs_1", 2, null), // planted but never revealed
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.reveal_coverage.pass).toBe(false);
    expect(result.reveal_coverage.missing_arcs).toContain("arc_1");
  });

  it("fails when reveal_at falls outside all arc ranges", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [
        makeForeshadowing("fs_1", 2, 50), // revealed far after arc_1
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.reveal_coverage.pass).toBe(false);
    expect(result.reveal_coverage.missing_arcs).toContain("arc_1");
  });

  it("score is 0.5 when exactly half the arcs have a reveal", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [makeForeshadowing("fs_1", 2, 8)], // only arc_1 revealed
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.reveal_coverage.score).toBe(0.5);
  });

  it("correctly identifies revealed_ids per arc", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [
        makeForeshadowing("fs_a", 2, 5),   // revealed in arc_1
        makeForeshadowing("fs_b", 3, 11),  // revealed in arc_2 (outside arc_1)
        makeForeshadowing("fs_c", 4, null), // never revealed
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    const arcDetail = result.arc_details[0];
    expect(arcDetail.revealed_ids).toContain("fs_a");
    expect(arcDetail.revealed_ids).not.toContain("fs_b");
    expect(arcDetail.revealed_ids).not.toContain("fs_c");
  });

  it("foreshadowing revealed exactly at arc boundaries counts", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 5, 10)],
      [
        makeForeshadowing("fs_1", 3, 5),  // revealed at start boundary
        makeForeshadowing("fs_2", 4, 10), // revealed at end boundary
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    const arcDetail = result.arc_details[0];
    expect(arcDetail.revealed_ids).toContain("fs_1");
    expect(arcDetail.revealed_ids).toContain("fs_2");
    expect(arcDetail.has_reveal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Overall score
// ---------------------------------------------------------------------------

describe("overall_score", () => {
  it("is 1.0 when all arcs have both plant and reveal", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [makeForeshadowing("fs_1", 2, 8)],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.overall_score).toBe(1.0);
    expect(result.pass).toBe(true);
  });

  it("is 0.5 when plant is fully covered but reveal is 0", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [makeForeshadowing("fs_1", 2, null)], // planted but no reveal
    );
    const result = evaluateForeshadowingUsage(seed);
    // plant_score = 1.0, reveal_score = 0.0
    expect(result.overall_score).toBeCloseTo(0.5, 2);
    expect(result.pass).toBe(false);
  });

  it("is 0.5 when reveal is fully covered but plant is 0", () => {
    // foreshadowing planted outside the arc, but revealed inside
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 5, 10)],
      [makeForeshadowing("fs_1", 2, 7)], // planted before arc_1, revealed inside
    );
    const result = evaluateForeshadowingUsage(seed);
    // plant_score = 0.0 (planted_at=2 < arc start 5), reveal_score = 1.0
    expect(result.overall_score).toBeCloseTo(0.5, 2);
    expect(result.pass).toBe(false);
  });

  it("is 0.0 when no arc has plant or reveal", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.overall_score).toBe(0.0);
    expect(result.pass).toBe(false);
  });

  it("is weighted 50% plant + 50% reveal", () => {
    // 2 arcs: arc_1 has plant only, arc_2 has both → plant=0.5+0.5=1, reveal=0+0.5...
    // Let's make: arc_1 covered in plant+reveal, arc_2 missing both
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [makeForeshadowing("fs_1", 3, 8)], // only arc_1 covered
    );
    const result = evaluateForeshadowingUsage(seed);
    // plant_score = 0.5, reveal_score = 0.5
    const expected = 0.5 * 0.5 + 0.5 * 0.5; // = 0.5
    expect(result.overall_score).toBeCloseTo(expected, 2);
  });

  it("overall_score is always in [0, 1]", () => {
    const cases = [
      makeSeed([], []),
      makeSeed([makeArc("arc_1", "1부", 1, 10)], []),
      makeSeed(
        [makeArc("arc_1", "1부", 1, 10)],
        [makeForeshadowing("fs_1", 2, 8)],
      ),
    ];
    for (const seed of cases) {
      const result = evaluateForeshadowingUsage(seed);
      expect(result.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.overall_score).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// arc_details breakdown
// ---------------------------------------------------------------------------

describe("arc_details breakdown", () => {
  it("returns one detail entry per arc", () => {
    const seed = makeSeed(
      [
        makeArc("arc_1", "1부", 1, 10),
        makeArc("arc_2", "2부", 11, 20),
        makeArc("arc_3", "3부", 21, 30),
      ],
      [],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.arc_details).toHaveLength(3);
  });

  it("detail contains arc metadata correctly", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "서막", 1, 8)],
      [],
    );
    const result = evaluateForeshadowingUsage(seed);
    const detail = result.arc_details[0];
    expect(detail.arc_id).toBe("arc_1");
    expect(detail.arc_name).toBe("서막");
    expect(detail.start_chapter).toBe(1);
    expect(detail.end_chapter).toBe(8);
  });

  it("has_plant and has_reveal flags are correctly set", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [makeForeshadowing("fs_1", 2, 9)],
    );
    const result = evaluateForeshadowingUsage(seed);
    const detail = result.arc_details[0];
    expect(detail.has_plant).toBe(true);
    expect(detail.has_reveal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// issues text
// ---------------------------------------------------------------------------

describe("issues text", () => {
  it("includes issue for arc missing a plant", () => {
    const seed = makeSeed(
      [makeArc("arc_2", "2부", 11, 20)],
      [makeForeshadowing("fs_1", 2, 15)], // planted outside arc_2, revealed inside
    );
    const result = evaluateForeshadowingUsage(seed);
    const plantIssue = result.issues.find((i) => i.includes("복선 심기(plant) 없음"));
    expect(plantIssue).toBeDefined();
    expect(plantIssue).toContain("arc_2");
  });

  it("includes issue for arc missing a reveal", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [makeForeshadowing("fs_1", 3, null)], // planted in arc_1, never revealed
    );
    const result = evaluateForeshadowingUsage(seed);
    const revealIssue = result.issues.find((i) => i.includes("복선 회수(reveal) 없음"));
    expect(revealIssue).toBeDefined();
    expect(revealIssue).toContain("arc_1");
  });

  it("issues list is empty when all arcs pass", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10), makeArc("arc_2", "2부", 11, 20)],
      [
        makeForeshadowing("fs_1", 3, 8),
        makeForeshadowing("fs_2", 12, 18),
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.issues).toHaveLength(0);
  });

  it("issues list has one entry per missing arc (plant + reveal separately)", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 10)],
      [], // nothing planted or revealed
    );
    const result = evaluateForeshadowingUsage(seed);
    // Should have 2 issues: one for missing plant, one for missing reveal
    expect(result.issues).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Multi-arc integration
// ---------------------------------------------------------------------------

describe("multi-arc integration", () => {
  it("correctly evaluates 3 arcs with mixed foreshadowing", () => {
    // arc_1: ch1-10  → fs_1 planted ch3, revealed ch9   → pass/pass
    // arc_2: ch11-20 → fs_2 planted ch12, no reveal      → pass/fail
    // arc_3: ch21-30 → no plant, fs_3 revealed ch25      → fail/pass
    const seed = makeSeed(
      [
        makeArc("arc_1", "도입", 1, 10),
        makeArc("arc_2", "전개", 11, 20),
        makeArc("arc_3", "결말", 21, 30),
      ],
      [
        makeForeshadowing("fs_1", 3, 9),   // arc_1 plant+reveal
        makeForeshadowing("fs_2", 12, null), // arc_2 plant only
        makeForeshadowing("fs_3", 2, 25),   // arc_3 reveal only (planted in arc_1)
      ],
    );
    const result = evaluateForeshadowingUsage(seed);

    // plant: arc_1 ✓, arc_2 ✓, arc_3 ✗ → 2/3
    expect(result.plant_coverage.score).toBeCloseTo(2 / 3, 2);
    expect(result.plant_coverage.covered_arcs).toContain("arc_1");
    expect(result.plant_coverage.covered_arcs).toContain("arc_2");
    expect(result.plant_coverage.missing_arcs).toContain("arc_3");

    // reveal: arc_1 ✓, arc_2 ✗, arc_3 ✓ → 2/3
    expect(result.reveal_coverage.score).toBeCloseTo(2 / 3, 2);
    expect(result.reveal_coverage.covered_arcs).toContain("arc_1");
    expect(result.reveal_coverage.missing_arcs).toContain("arc_2");
    expect(result.reveal_coverage.covered_arcs).toContain("arc_3");

    // overall = 0.5 * (2/3) + 0.5 * (2/3) = 2/3
    expect(result.overall_score).toBeCloseTo(2 / 3, 2);
    expect(result.pass).toBe(false);
  });

  it("fully passing scenario with 2 arcs and multiple foreshadowings", () => {
    const seed = makeSeed(
      [makeArc("arc_1", "1부", 1, 15), makeArc("arc_2", "2부", 16, 30)],
      [
        makeForeshadowing("fs_1", 2, 14),
        makeForeshadowing("fs_2", 5, 12),
        makeForeshadowing("fs_3", 17, 28),
        makeForeshadowing("fs_4", 20, 29),
      ],
    );
    const result = evaluateForeshadowingUsage(seed);
    expect(result.pass).toBe(true);
    expect(result.overall_score).toBe(1.0);
    expect(result.issues).toHaveLength(0);
  });
});
