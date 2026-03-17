import { describe, it, expect } from "vitest";
import {
  SceneSpecSchema,
  ChapterBlueprintSchema,
  ArcPlanSchema,
  PartPlanSchema,
  MasterPlanSchema,
} from "@/lib/schema/planning";

describe("SceneSpec", () => {
  it("validates a complete scene spec", () => {
    const scene = SceneSpecSchema.parse({
      purpose: "이준혁이 던전 입구에서 수상한 기운을 감지한다",
      type: "action",
      characters: ["mc", "companion_1"],
      estimated_chars: 1500,
      emotional_tone: "긴장",
    });
    expect(scene.purpose).toBe("이준혁이 던전 입구에서 수상한 기운을 감지한다");
    expect(scene.type).toBe("action");
    expect(scene.estimated_chars).toBe(1500);
  });

  it("provides defaults for optional fields", () => {
    const scene = SceneSpecSchema.parse({
      purpose: "이준혁이 강서연에게 던전 정보를 전달하는 대화 장면",
      type: "dialogue",
    });
    expect(scene.characters).toEqual([]);
    expect(scene.estimated_chars).toBe(1000);
    expect(scene.emotional_tone).toBe("neutral");
  });
});

describe("ChapterBlueprint", () => {
  it("validates a full chapter blueprint", () => {
    const blueprint = ChapterBlueprintSchema.parse({
      chapter_number: 5,
      title: "어둠 속의 빛",
      arc_id: "arc_1_2",
      one_liner: "던전 깊숙이 진입하며 첫 보스와 조우",
      role_in_arc: "rising_action",
      scenes: [
        { purpose: "이준혁이 던전 입구에서 마나 감지기가 오작동하는 것을 발견한다", type: "action", estimated_chars: 1200 },
        { purpose: "강서연이 이준혁에게 '이 패턴은 3년 전과 같다'고 경고한다", type: "dialogue", estimated_chars: 1000 },
        { purpose: "던전 안에서 사망한 형 이도현의 목소리가 들려온다", type: "hook", estimated_chars: 800 },
      ],
      dependencies: ["ch4에서 얻은 열쇠 사용"],
      target_word_count: 3000,
      emotional_arc: "긴장→갈등→충격",
      key_points: ["첫 보스 조우", "파티 내 의견 충돌"],
      characters_involved: ["mc", "companion_1"],
      tension_level: 7,
      foreshadowing_actions: [{ id: "fs_1", action: "hint" }],
    });
    expect(blueprint.scenes).toHaveLength(3);
    expect(blueprint.target_word_count).toBe(3000);
    expect(blueprint.role_in_arc).toBe("rising_action");
  });

  it("computes target_word_count from scenes if not provided", () => {
    const blueprint = ChapterBlueprintSchema.parse({
      chapter_number: 1,
      title: "시작",
      arc_id: "arc_1",
      one_liner: "이야기의 시작",
      scenes: [
        { purpose: "이준혁이 평범한 아침을 보내며 학교에 가는 오프닝 장면", type: "action", estimated_chars: 1500 },
        { purpose: "이준혁이 교실 창문 너머로 하늘에 균열이 생기는 것을 목격한다", type: "hook", estimated_chars: 500 },
      ],
    });
    expect(blueprint.target_word_count).toBe(2000);
  });
});

describe("ArcPlan", () => {
  it("validates an arc plan", () => {
    const arc = ArcPlanSchema.parse({
      id: "arc_1_2",
      name: "첫 동료",
      part_id: "part_1",
      start_chapter: 11,
      end_chapter: 20,
      summary: "주인공이 첫 동료를 만나고 신뢰를 쌓아간다",
      theme: "신뢰와 배신",
      key_events: ["동료 합류", "첫 공동 전투", "배신 의심"],
      climax_chapter: 19,
      tension_curve: [3, 4, 5, 5, 6, 7, 6, 8, 9, 7],
      chapter_blueprints: [],
    });
    expect(arc.theme).toBe("신뢰와 배신");
    expect(arc.tension_curve).toHaveLength(10);
  });
});

describe("PartPlan", () => {
  it("validates a part plan", () => {
    const part = PartPlanSchema.parse({
      id: "part_1",
      name: "각성편",
      start_chapter: 1,
      end_chapter: 60,
      theme: "평범한 일상에서 비범한 세계로",
      core_conflict: "자신의 능력을 받아들이고 살아남기",
      resolution_target: "첫 번째 대규모 위기를 넘기고 동료를 얻는다",
      estimated_chapter_count: 60,
      arcs: [],
      transition_to_next: "새로운 세력의 등장으로 더 큰 세계가 열린다",
    });
    expect(part.estimated_chapter_count).toBe(60);
  });
});

describe("MasterPlan", () => {
  it("validates a master plan", () => {
    const plan = MasterPlanSchema.parse({
      estimated_total_chapters: { min: 200, max: 280 },
      world_complexity: {
        faction_count: 5,
        location_count: 12,
        power_system_depth: "deep",
        subplot_count: 4,
      },
      parts: [
        {
          id: "part_1",
          name: "각성편",
          start_chapter: 1,
          end_chapter: 60,
          theme: "각성",
          core_conflict: "생존",
          resolution_target: "첫 위기 극복",
          estimated_chapter_count: 60,
          arcs: [],
        },
      ],
      global_foreshadowing_timeline: [
        { id: "fs_1", plant_part: "part_1", reveal_part: "part_3", description: "주인공의 진짜 정체" },
      ],
    });
    expect(plan.estimated_total_chapters.min).toBe(200);
    expect(plan.world_complexity.faction_count).toBe(5);
  });
});
