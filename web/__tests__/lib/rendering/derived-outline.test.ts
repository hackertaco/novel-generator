import { describe, expect, it } from "vitest";

import {
  cullDerivedOutline,
  labelDerivedOutline,
  type DerivedOutline,
} from "@/lib/rendering/derived-outline";

type SceneStub = { sceneId: string; chapter: number; eventIds: string[]; pressurePeak: number };
type EventStub = { id: string; chapter: number; tags: string[]; summary: string };

function makeScenes(count: number): SceneStub[] {
  return Array.from({ length: count }, (_, index) => ({
    sceneId: `scene_${String(index + 1).padStart(3, "0")}`,
    chapter: index + 1,
    eventIds: [`evt_${index + 1}_a`, `evt_${index + 1}_b`],
    pressurePeak: 3,
  }));
}

function eventsFor(scenes: SceneStub[], extra: EventStub[] = []): EventStub[] {
  const base = scenes.flatMap((scene) =>
    scene.eventIds.map((id) => ({ id, chapter: scene.chapter, tags: [], summary: `사건 ${id}` })),
  );
  return [...base, ...extra];
}

describe("derived outline (솎기 — 결정적 골격)", () => {
  it("places chapter boundaries right after scheme-transition events (최고 가중)", () => {
    const scenes = makeScenes(6);
    // scene 2와 scene 4 끝에 scheme 전환 이벤트
    const events = eventsFor(scenes, [
      { id: "evt_scheme_t1", chapter: 2, tags: ["scheme-transition", "cut-point-candidate"], summary: "음모 전환 1" },
      { id: "evt_scheme_t2", chapter: 4, tags: ["scheme-transition", "cut-point-candidate"], summary: "음모 전환 2" },
    ]);
    scenes[1]!.eventIds.push("evt_scheme_t1");
    scenes[3]!.eventIds.push("evt_scheme_t2");

    const outline = cullDerivedOutline({ scenes, events, totalChapters: 3 });
    expect(outline.chapters).toHaveLength(3);
    // 경계가 scene2/scene4 직후 → 화 구성 [1-2, 3-4, 5-6]
    expect(outline.chapters[0]!.sourceSceneIds).toEqual(["scene_001", "scene_002"]);
    expect(outline.chapters[1]!.sourceSceneIds).toEqual(["scene_003", "scene_004"]);
    expect(outline.chapters[2]!.sourceSceneIds).toEqual(["scene_005", "scene_006"]);
    // 절단점 = 그 화의 마지막 사건 (전환 이벤트)
    expect(outline.chapters[0]!.endsOn).toBe("evt_scheme_t1");
  });

  it("respects requested chapter count and balances volume without candidates (균등 폴백)", () => {
    const scenes = makeScenes(12);
    const outline = cullDerivedOutline({ scenes, events: eventsFor(scenes), totalChapters: 4 });
    expect(outline.chapters).toHaveLength(4);
    for (const chapter of outline.chapters) {
      expect(chapter.sourceSceneIds.length).toBe(3); // 12/4 균등
    }
  });

  it("is deterministic", () => {
    const scenes = makeScenes(9);
    const events = eventsFor(scenes, [
      { id: "evt_s", chapter: 5, tags: ["scheme-transition"], summary: "전환" },
    ]);
    scenes[4]!.eventIds.push("evt_s");
    const first = cullDerivedOutline({ scenes, events, totalChapters: 3 });
    const second = cullDerivedOutline({ scenes, events, totalChapters: 3 });
    expect(second).toEqual(first);
  });

  it("handles M >= scene count (화당 1장면, 초과분 없음)", () => {
    const scenes = makeScenes(2);
    const outline = cullDerivedOutline({ scenes, events: eventsFor(scenes), totalChapters: 5 });
    expect(outline.chapters).toHaveLength(2);
    expect(outline.totalChapters).toBe(2);
  });
});

describe("derived outline labels (LLM 이름표 — 주입형, 골격 불변)", () => {
  function smallOutline(): DerivedOutline {
    const scenes = makeScenes(4);
    return cullDerivedOutline({ scenes, events: eventsFor(scenes), totalChapters: 2 });
  }

  it("falls back to deterministic labels without a labelWriter", async () => {
    const outline = smallOutline();
    const labeled = await labelDerivedOutline({ outline, eventSummariesById: {} });
    expect(labeled.chapters[0]!.title).toBe("1화");
    expect(labeled.chapters[0]!.oneLiner.length).toBeGreaterThan(0);
  });

  it("applies labelWriter titles but cannot change the skeleton", async () => {
    const outline = smallOutline();
    const labeled = await labelDerivedOutline({
      outline,
      eventSummariesById: {},
      labelWriter: async (chapter) => ({
        title: `멋진 ${chapter.number}화`,
        oneLiner: "한 줄 소개",
      }),
    });
    expect(labeled.chapters[1]!.title).toBe("멋진 2화");
    expect(labeled.chapters[1]!.oneLiner).toBe("한 줄 소개");
    // 골격 불변
    expect(labeled.chapters.map((c) => c.sourceSceneIds)).toEqual(outline.chapters.map((c) => c.sourceSceneIds));
    expect(labeled.chapters.map((c) => c.endsOn)).toEqual(outline.chapters.map((c) => c.endsOn));
  });
});
