import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import { runWorldModelFirstSimulation } from "@/lib/sim/world-runner";

function normalize(input: Record<string, unknown>): unknown {
  const foreshadowing = (Array.isArray(input.foreshadowing) ? input.foreshadowing : []).map((item) => {
    const value = { ...(item as Record<string, unknown>) };
    const plantedAt = typeof value.planted_at === "number"
      ? value.planted_at
      : typeof value.plant_chapter === "number" ? value.plant_chapter : 1;
    return {
      ...value,
      name: value.name ?? value.id,
      canonical_target: value.canonical_target ?? value.description,
      planted_at: plantedAt,
      hints_at: value.hints_at ?? value.hint_chapters ?? [],
      reveal_at: typeof value.reveal_at === "number"
        ? value.reveal_at
        : typeof value.reveal_chapter === "number" ? value.reveal_chapter : null,
      origin: value.origin ?? {
        episode_id: `ep_${String(plantedAt).padStart(3, "0")}`,
        scene_id: `scene_${String(plantedAt).padStart(3, "0")}_01`,
        source_span: { start_offset: 0, end_offset: 1, excerpt: String(value.description ?? value.id ?? "f") },
      },
    };
  });
  return { ...input, story_threads: input.story_threads ?? [], extended_outlines: input.extended_outlines ?? [], foreshadowing };
}

/** 역전 시드: scheme 시드에서 chapter_outlines 를 비움. */
function loadInvertedSeed(): NovelSeed {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "seeds/test-romance-fantasy-scheme.json"), "utf8"));
  const normalized = normalize(raw) as Record<string, unknown>;
  normalized.chapter_outlines = [];
  return NovelSeedSchema.parse(normalized);
}

describe("inverted mode (outline 없는 시드 — 줄거리를 발견한다)", () => {
  it("emits ZERO outline-beat events; 사건은 agent-tick에서만 나온다", () => {
    const result = runWorldModelFirstSimulation(loadInvertedSeed(), {
      startChapter: 1, endChapter: 6, characterActionsPerChapter: 4,
    });
    const events = result.ledger.events ?? [];
    // beats 주입 사건(buildWorldEvent 산) 부재 — beat 이벤트는 agent-tick/director/genre/foreshadow/scheme 외의
    // 'world beat' 계열. agent-tick 이벤트는 sourceActionLogIds payload 를 가짐.
    const beatEvents = events.filter((event) => /^evt_world_ch\d+_b\d+$/.test(event.id));
    expect(beatEvents).toHaveLength(0);
    // agent-tick 사건은 존재
    expect(result.actionLogs.length).toBeGreaterThan(0);
  }, 60_000);

  it("meets the event density gate (qualityBar.targetEventsPerChapterMin)", () => {
    const seed = loadInvertedSeed();
    const chapters = 6;
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1, endChapter: chapters, characterActionsPerChapter: 4,
    });
    const minPerChapter = result.brain.qualityBar.targetEventsPerChapterMin;
    const events = result.ledger.events ?? [];
    const perChapter = new Map<number, number>();
    for (const event of events) {
      perChapter.set(event.chapter, (perChapter.get(event.chapter) ?? 0) + 1);
    }
    for (let chapter = 1; chapter <= chapters; chapter += 1) {
      expect(perChapter.get(chapter) ?? 0).toBeGreaterThanOrEqual(minPerChapter);
    }
  }, 60_000);

  it("is deterministic across two runs", () => {
    const options = { startChapter: 1, endChapter: 4, characterActionsPerChapter: 4 };
    const first = runWorldModelFirstSimulation(loadInvertedSeed(), options);
    const second = runWorldModelFirstSimulation(loadInvertedSeed(), options);
    expect(second.actionLogs.map((log) => log.action.type)).toEqual(first.actionLogs.map((log) => log.action.type));
    expect(second.schemeTimeline).toEqual(first.schemeTimeline);
  }, 60_000);

  it("keeps outline seeds on the existing path (역전 분기로 빠지지 않음)", () => {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "seeds/test-romance-fantasy.json"), "utf8"));
    const seed = NovelSeedSchema.parse(normalize(raw));
    expect(seed.chapter_outlines.length).toBeGreaterThan(0); // 판별 조건의 보증
    const result = runWorldModelFirstSimulation(seed, { startChapter: 1, endChapter: 2, characterActionsPerChapter: 2 });
    // outline 경로의 특징: beat 이벤트 존재 (기존 동작 유지)
    const events = result.ledger.events ?? [];
    expect(events.some((event) => /^evt_world_ch\d+_b\d+$/.test(event.id))).toBe(true);
  }, 60_000);
});
