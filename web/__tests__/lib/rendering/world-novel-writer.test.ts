import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildWorldNovelWriterPrompt } from "@/lib/rendering/world-novel-writer";
import { selectEpisodeWindows } from "@/lib/rendering/episode-selector";
import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import { buildWorldBrainFromSeed } from "@/lib/sim";
import { runWorldModelFirstSimulation } from "@/lib/sim/world-runner";

function normalizeLegacySeedInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const seed = input as Record<string, unknown>;
  const foreshadowing = Array.isArray(seed.foreshadowing)
    ? seed.foreshadowing.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const value = { ...(item as Record<string, unknown>) };
      const plantedAt = typeof value.planted_at === "number"
        ? value.planted_at
        : typeof value.plant_chapter === "number"
          ? value.plant_chapter
          : 1;
      const revealAt = typeof value.reveal_at === "number"
        ? value.reveal_at
        : typeof value.reveal_chapter === "number"
          ? value.reveal_chapter
          : null;
      return {
        ...value,
        name: value.name ?? value.id,
        canonical_target: value.canonical_target ?? value.description,
        planted_at: plantedAt,
        hints_at: value.hints_at ?? value.hint_chapters ?? [],
        reveal_at: revealAt,
      };
    })
    : [];
  return {
    ...seed,
    story_threads: seed.story_threads ?? [],
    extended_outlines: seed.extended_outlines ?? [],
    foreshadowing,
  };
}

function loadFixtureSeed(): NovelSeed {
  const raw = readFileSync(
    join(process.cwd(), "seeds/test-romance-fantasy.json"),
    "utf8",
  );
  return NovelSeedSchema.parse(normalizeLegacySeedInput(JSON.parse(raw)));
}

describe("world novel writer adapter", () => {
  it("builds a Writer prompt from scene logs and independent agent action logs", () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 1,
      characterActionsPerChapter: 2,
    });
    const sceneLog = result.sceneLogs[0]!;
    const actionLogs = result.actionLogs.filter((log) => log.chapter === sceneLog.chapter);
    const episodeWindow = selectEpisodeWindows({ result }).windows[0];
    const prompt = buildWorldNovelWriterPrompt({
      seed,
      worldBrain: buildWorldBrainFromSeed(seed),
      sceneLog,
      actionLogs,
      episodeWindow,
      rendererDraft: "기계 렌더 초안",
    });

    expect(prompt).toContain("좁은 임무");
    expect(prompt).toContain("에피소드 선택");
    expect(prompt).toContain("episode window");
    expect(prompt).toContain("selectionScore");
    expect(prompt).toContain("반드시 장면화할 행동 순서");
    expect(prompt).toContain("편집 계획");
    expect(prompt).toContain("장면 구성");
    expect(prompt).toContain("setup");
    expect(prompt).toContain("inflection");
    expect(prompt).toContain("로그별 분량 지시");
    expect(prompt).toContain("renderMode");
    expect(prompt).toContain("suggestedWordBudget");
    expect(prompt).toContain("spotlight는 길게, summary는 짧게");
    expect(prompt).toContain("setup/escalation/inflection/fallout");
    expect(prompt).toContain("대사 기능");
    expect(prompt).toContain("대사 후보");
    expect(prompt).toContain("감정 변화");
    expect(prompt).toContain("권력 변화");
    expect(prompt).toContain("관계 변화");
    expect(prompt).toContain("장면 훅");
    expect(prompt).toContain("마음속");
    expect(prompt).toContain("한 문단마다 대사/행동/침묵/감각");
    expect(prompt).toContain("내부 ID");
    expect(prompt).toContain(actionLogs[0]!.privateState.agentRole);
    expect(prompt).not.toContain(actionLogs[0]!.privateState.roleMission);
    expect(prompt).not.toContain(actionLogs[0]!.privateState.hiddenGoal);
    expect(prompt).not.toContain("기계 렌더 초안");
  });
});
