import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { formatRunSummary, runQuickRerun } from "../../scripts/quick-rerun";
import type { NovelSeed } from "../../src/lib/schema/novel";
import type { HarnessEvent } from "../../src/lib/harness";
import type { MasterPlan } from "../../src/lib/schema/planning";

class FakeHarness {
  public calls: Array<{ chapter: number; options?: Record<string, unknown> }> = [];
  private attempts = new Map<number, number>();
  private masterPlan?: MasterPlan;

  getState() {
    return { masterPlan: this.masterPlan };
  }

  getWorldStateSnapshot() {
    return [{ chapter: 1, facts: [] }];
  }

  async *run(
    _seed: NovelSeed,
    startChapter: number,
    _endChapter: number,
    options?: Record<string, unknown>,
  ): AsyncGenerator<HarnessEvent> {
    this.calls.push({ chapter: startChapter, options });
    const attempt = (this.attempts.get(startChapter) || 0) + 1;
    this.attempts.set(startChapter, attempt);

    if (!this.masterPlan) {
      this.masterPlan = {
        estimated_total_chapters: { min: 2, max: 2 },
        world_complexity: {
          faction_count: 0,
          location_count: 1,
          power_system_depth: "shallow",
          subplot_count: 0,
        },
        parts: [],
        global_foreshadowing_timeline: [],
      } as unknown as MasterPlan;
      yield { type: "plan_generated", plan: this.masterPlan };
    }

    yield { type: "chapter_start", chapter: startChapter };

    if (startChapter === 1 && attempt === 1) {
      yield { type: "error", chapter: 1, message: "OpenAI Connection error" };
      return;
    }

    yield {
      type: "blueprint_generated",
      chapter: startChapter,
      blueprint: { chapter_number: startChapter, title: `${startChapter}화 블루프린트` } as never,
    };
    yield {
      type: "pipeline_event",
      chapter: startChapter,
      event: { type: "stage_change", stage: "write" } as never,
    };
    yield {
      type: "chapter_complete",
      result: {
        chapterNumber: startChapter,
        text: `${startChapter}화 본문. 세라핀이 말했다. "이번엔 성공이야?" 레온이 고개를 끄덕였다.\n\n그리고 문이 열렸다...`,
        summary: {
          title: `${startChapter}화 제목`,
          plot_summary: `${startChapter}화 요약`,
          ending_scene_state: {
            location: "회랑",
            time_of_day: "밤",
            characters_present: ["seraphine", "leon"],
            ongoing_action: "문을 밀어 연다",
            unresolved_tension: "문 뒤의 정체",
          },
        } as never,
        score: 0.81,
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 },
        durationMs: 25,
      },
    };
  }
}

function createSeed(): NovelSeed {
  return {
    title: "retry smoke",
    logline: "세라핀과 레온이 미지의 문을 연다.",
    total_chapters: 2,
    world: {
      name: "회랑 세계",
      genre: "fantasy",
      sub_genre: "romantasy",
      time_period: "중세풍",
      magic_system: "문양 마법",
      key_locations: {
        회랑: "낡은 석조 회랑",
      },
      factions: {},
      rules: [],
    },
    characters: [
      {
        id: "seraphine",
        name: "세라핀",
        role: "protagonist",
        description: "주인공",
        introduction_chapter: 1,
        traits: [],
        speech_style: { formality: "plain", quirk: "", vocabulary: [] },
        state: {
          status: "긴장",
          location: "회랑",
          relationships: {},
          secrets_known: [],
        },
      },
      {
        id: "leon",
        name: "레온",
        role: "supporting",
        description: "조력자",
        introduction_chapter: 1,
        traits: [],
        speech_style: { formality: "formal", quirk: "", vocabulary: [] },
        state: {
          status: "침착",
          location: "회랑",
          relationships: {},
          secrets_known: [],
        },
      },
    ],
    story_threads: [],
    arcs: [],
    foreshadowing: [],
    chapter_outlines: [],
    extended_outlines: [],
    style: {
      tone: "긴장감 있는 로맨스 판타지",
      prose_guidelines: [],
      banned: [],
    },
  } as unknown as NovelSeed;
}

describe("quick-rerun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats a final summary with failed chapter list", () => {
    expect(formatRunSummary([
      { chapter: 1, success: true, attempts: 1, errorMessages: [] },
      { chapter: 2, success: false, attempts: 4, errorMessages: ["boom"] },
      { chapter: 3, success: true, attempts: 2, errorMessages: [] },
    ], 3)).toBe("3화 중 2화 성공, 2화 실패");
  });

  it("retries a failed chapter, persists logs, and continues subsequent chapters", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-rerun-test-"));
    const harness = new FakeHarness();
    const sleep = vi.fn(async () => {});

    const result = await runQuickRerun({
      harness,
      seed: createSeed(),
      maxChapters: 2,
      outDir,
      retryDelaysMs: [0],
      sleep,
    });

    expect(result.statuses).toEqual([
      expect.objectContaining({ chapter: 1, success: true, attempts: 2 }),
      expect.objectContaining({ chapter: 2, success: true, attempts: 1 }),
    ]);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(0);

    expect(fs.existsSync(path.join(outDir, "chapters", "ch01.txt"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "chapters", "ch02.txt"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "blueprints", "ch01.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "blueprints", "ch02.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "world-state.json"))).toBe(true);

    const progressLog = fs.readFileSync(path.join(outDir, "progress.log"), "utf-8");
    const chapterLog = fs.readFileSync(path.join(outDir, "quick-rerun.log"), "utf-8");
    expect(progressLog).toContain("ch1 retry scheduled in 0s");
    expect(progressLog).toContain("[rerun] 2화 중 2화 성공, 없음화 실패");
    expect(chapterLog).toContain("ch1 failure attempt=1 error=OpenAI Connection error");
    expect(chapterLog).toContain("ch1 success attempt=2");
    expect(chapterLog).toContain("ch2 success attempt=1");

    expect(harness.calls).toHaveLength(3);
    expect(harness.calls[1]?.options?.masterPlan).toBeDefined();
    expect(harness.calls[2]?.options?.previousSceneState).toEqual({
      location: "회랑",
      time_of_day: "밤",
      characters_present: ["seraphine", "leon"],
      ongoing_action: "문을 밀어 연다",
      unresolved_tension: "문 뒤의 정체",
    });
    expect(harness.calls[2]?.options?.previousSummaries).toEqual([
      { chapter: 1, title: "1화 제목", summary: "1화 요약" },
    ]);
  });
});
