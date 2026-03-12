import { describe, it, expect } from "vitest";
import { LazyScheduler } from "@/lib/planning/lazy-scheduler";
import type { MasterPlan } from "@/lib/schema/planning";

describe("LazyScheduler", () => {
  const masterPlan: MasterPlan = {
    estimated_total_chapters: { min: 200, max: 280 },
    world_complexity: {
      faction_count: 3,
      location_count: 8,
      power_system_depth: "moderate",
      subplot_count: 2,
    },
    parts: [
      {
        id: "part_1",
        name: "각성편",
        start_chapter: 1,
        end_chapter: 60,
        theme: "각성",
        core_conflict: "생존",
        resolution_target: "위기 극복",
        estimated_chapter_count: 60,
        arcs: [
          {
            id: "arc_1_1",
            name: "시작",
            part_id: "part_1",
            start_chapter: 1,
            end_chapter: 10,
            summary: "시작",
            theme: "발견",
            key_events: [],
            climax_chapter: 9,
            tension_curve: [3, 4, 5, 5, 6, 7, 6, 8, 9, 7],
            chapter_blueprints: [],
          },
          {
            id: "arc_1_2",
            name: "성장",
            part_id: "part_1",
            start_chapter: 11,
            end_chapter: 20,
            summary: "성장",
            theme: "훈련",
            key_events: [],
            climax_chapter: 19,
            tension_curve: [],
            chapter_blueprints: [],
          },
        ],
        transition_to_next: "",
      },
      {
        id: "part_2",
        name: "성장편",
        start_chapter: 61,
        end_chapter: 120,
        theme: "성장",
        core_conflict: "경쟁",
        resolution_target: "승리",
        estimated_chapter_count: 60,
        arcs: [],
        transition_to_next: "",
      },
    ],
    global_foreshadowing_timeline: [],
  };

  it("identifies which arc a chapter belongs to", () => {
    const scheduler = new LazyScheduler(masterPlan);
    expect(scheduler.getArcForChapter(5)?.id).toBe("arc_1_1");
    expect(scheduler.getArcForChapter(15)?.id).toBe("arc_1_2");
    expect(scheduler.getArcForChapter(65)).toBeUndefined();
  });

  it("identifies which part a chapter belongs to", () => {
    const scheduler = new LazyScheduler(masterPlan);
    expect(scheduler.getPartForChapter(5)?.id).toBe("part_1");
    expect(scheduler.getPartForChapter(65)?.id).toBe("part_2");
    expect(scheduler.getPartForChapter(999)).toBeUndefined();
  });

  it("detects when arc planning is needed", () => {
    const scheduler = new LazyScheduler(masterPlan);
    expect(scheduler.needsArcPlanning(65)).toBe(true);
    expect(scheduler.needsArcPlanning(5)).toBe(false);
  });

  it("detects when chapter blueprint is needed", () => {
    const scheduler = new LazyScheduler(masterPlan);
    expect(scheduler.needsChapterBlueprint(5)).toBe(true);
  });

  it("returns false when blueprint exists", () => {
    const planWithBlueprints = structuredClone(masterPlan);
    planWithBlueprints.parts[0].arcs[0].chapter_blueprints = [
      {
        chapter_number: 5,
        title: "test",
        arc_id: "arc_1_1",
        one_liner: "test",
        role_in_arc: "rising_action",
        scenes: [],
        dependencies: [],
        target_word_count: 3000,
        emotional_arc: "",
        key_points: [],
        characters_involved: [],
        tension_level: 5,
        foreshadowing_actions: [],
      },
    ];
    const scheduler = new LazyScheduler(planWithBlueprints);
    expect(scheduler.needsChapterBlueprint(5)).toBe(false);
  });

  it("gets blueprint for a chapter", () => {
    const planWithBlueprints = structuredClone(masterPlan);
    planWithBlueprints.parts[0].arcs[0].chapter_blueprints = [
      {
        chapter_number: 5,
        title: "test",
        arc_id: "arc_1_1",
        one_liner: "test",
        role_in_arc: "rising_action",
        scenes: [],
        dependencies: [],
        target_word_count: 3000,
        emotional_arc: "",
        key_points: [],
        characters_involved: [],
        tension_level: 5,
        foreshadowing_actions: [],
      },
    ];
    const scheduler = new LazyScheduler(planWithBlueprints);
    expect(scheduler.getBlueprint(5)?.chapter_number).toBe(5);
    expect(scheduler.getBlueprint(99)).toBeUndefined();
  });
});
