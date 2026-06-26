import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildEpisodeWindowWriterPrompt,
  polishGenreSurface,
} from "@/lib/rendering/episode-window-writer";
import { selectEpisodeWindows } from "@/lib/rendering/episode-selector";
import { buildSceneBridges } from "@/lib/rendering/scene-bridge";
import { buildWorldLogEditorialMap } from "@/lib/rendering/world-log-editorial-map";
import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
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

describe("episode window writer", () => {
  it("does not reintroduce deterministic surface polish artifacts", () => {
    const polished = polishGenreSurface([
      "라엘의 말끝가 엘리시아의 귀에 걸렸고, 세레나는 얇은 의미를 숨긴 채 미소를 고쳤다.",
      "그 안에 깔린 잔 받침 소리은 쉽게 넘길 수 없었다.",
      "엘리시아는 다음 행동을 결정해야 할 순간이 다가오고 있음을 알아차렸다.",
      "엘리시아는 다음 움직임을 움직임하기 위한 말 없는 기척을 붙잡았다.",
      "그녀는 다음 움직임을 준비하며 침묵 속에 얇은 의미를 탐색했다.",
      "공기는 여전히 무겁게 가라앉았고 침묵은 더욱 깊어졌다.",
      "그는 다음 순간을 준비하며 물었다. \"어떤 선택을 하실 건가요? 어떻게 생각하나요?\"",
      "엘리시아는 주변의 시선을 한 번에 모아 받으며 다음 틈을 탐색했다.",
      "마리안은 말밑를 확인하려는 듯 손끝을 접었다.",
      "방 안의 긴장감과 압박이 다시 높아졌고, 그녀는 결심했다.",
    ].join("\n"));

    expect(polished).not.toMatch(/잔\s*받침\s*소리/u);
    expect(polished).not.toMatch(/다음\s*움직임/u);
    expect(polished).not.toMatch(/얇은\s*의미/u);
    expect(polished).not.toMatch(/말밑를/u);
    expect(polished).not.toMatch(/말끝가/u);
    expect(polished).not.toMatch(/움직임을\s*움직/u);
    expect(polished).not.toMatch(/움직임하기/u);
    expect(polished).not.toMatch(/소리은/u);
    expect(polished).not.toMatch(/짧은\s*정적를/u);
    expect(polished).not.toMatch(/공기(?:는|가)?[^.。\n]{0,20}가라앉/u);
    expect(polished).not.toMatch(/침묵(?:은|이)?[^.。\n]{0,30}(깊어|이어|남|흐르|고조|탐색|의미)/u);
    expect(polished).not.toMatch(/다음\s*순간/u);
    expect(polished).not.toMatch(/어떤\s*선택을\s*하실\s*건가요/u);
    expect(polished).not.toMatch(/어떻게\s*생각하나요/u);
    expect(polished).not.toMatch(/시선을\s*한\s*번에\s*모아\s*받/u);
    expect(polished).not.toMatch(/탐색/u);
    expect(polished).toContain("짧은 정적");
    expect(polished).toContain("문고리");
    expect(polished).toContain("대답은 지금 듣겠습니다.");
  });

  it("builds one episode prompt from a multi-scene timeline window", { timeout: 30_000 }, () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 5,
      characterActionsPerChapter: 4,
    });
    const episodeWindow = selectEpisodeWindows({
      result,
      targetEpisodeCount: 2,
      maxScenesPerEpisode: 3,
    }).windows[0]!;
    const worldLogEditorialMap = buildWorldLogEditorialMap({
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
    });
    const prompt = buildEpisodeWindowWriterPrompt({
      seed,
      worldBrain: result.brain,
      episodeWindow,
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
      worldLogEditorialMap,
    });

    expect(episodeWindow.sourceSceneIds.length).toBeGreaterThan(1);
    expect(prompt).toContain("EpisodeWindow");
    expect(prompt).toContain("timeline에서 뽑은 window");
    expect(prompt).toContain("Compressed Source Bundle");
    expect(prompt).toContain("World Log Editorial Treatment");
    expect(prompt).toContain("Treatment contract");
    expect(prompt).toMatch(/full_scene|expanded_scene|compressed_scene|summary_bridge/u);
    expect(prompt).toContain("편집 처리:");
    expect(prompt).toContain("coverage:");
    expect(prompt).toContain("Detailed Beats");
    expect(prompt).toContain("Summary Beats");
    expect(prompt).toContain("coverage contract");
    expect(prompt).toContain("good genre fiction contract");
    expect(prompt).toContain("surface blacklist");
    expect(prompt).toContain("scene seam contract");
    expect(prompt).toContain("상태를 바꿔야 한다");
    expect(prompt).toContain("가짜 소설");
    expect(prompt).toContain("빈 대사");
    expect(prompt).toContain("선택의 순간");
    expect(prompt).toContain("3~5문단마다 turn");
    expect(prompt).toContain("느꼈다, 느껴졌다, 고민");
    expect(prompt).toContain("공기가 가라앉았다");
    expect(prompt).toContain("다음 움직임");
    expect(prompt).toContain("그 아침이 지나고");
    expect(prompt).toContain("장소 전환은 문을 여는 손");
    expect(prompt).toContain("episode 구성 규칙");
    expect(prompt).toContain("scene 경계는 독자가 못 느끼게");
    expect(prompt).toContain("권장 분량");
    expect(prompt).toContain(episodeWindow.sourceSceneIds[0]!);
    expect(prompt).toContain(episodeWindow.sourceSceneIds.at(-1)!);
    expect(prompt).toContain(episodeWindow.sourceActionLogIds[0]!);
    expect(prompt).toContain("sourceActionLogIds");
    for (const sourceActionLogId of episodeWindow.sourceActionLogIds) {
      expect(prompt).toContain(sourceActionLogId);
    }
    expect(prompt.length).toBeLessThan(15000);
    expect(prompt).not.toContain(result.actionLogs[0]!.privateState.hiddenGoal);
    expect(prompt).not.toContain(result.actionLogs[0]!.privateState.roleMission);
    expect(prompt).not.toContain("장면 다리");
  });

  it("injects scene bridges as connective material between scenes", { timeout: 30_000 }, () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 5,
      characterActionsPerChapter: 4,
    });
    const episodeWindow = selectEpisodeWindows({
      result,
      targetEpisodeCount: 2,
      maxScenesPerEpisode: 3,
    }).windows[0]!;
    const windowSceneLogs = episodeWindow.sourceSceneIds
      .map((sceneId) => result.sceneLogs.find((sceneLog) => sceneLog.sceneId === sceneId)!)
      .filter(Boolean);
    const sceneBridges = buildSceneBridges({
      sceneLogs: windowSceneLogs,
      actionLogs: result.actionLogs.map((log) => ({
        logId: log.logId,
        chapter: log.chapter,
        followUpActionSeed: log.actualEffect.followUpActionSeed,
      })),
      events: [],
      schemeTimeline: [],
    });
    const prompt = buildEpisodeWindowWriterPrompt({
      seed,
      worldBrain: result.brain,
      episodeWindow,
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
      sceneBridges,
    });

    expect(sceneBridges.length).toBeGreaterThan(0);
    expect(prompt).toContain("장면 다리");
    expect(prompt).toContain("미해결 압력");
    expect(prompt).toContain("summary_bridge 한 단락");
    expect(prompt).toContain(`${windowSceneLogs[0]!.sceneId} → ${windowSceneLogs[1]!.sceneId}`);
    expect(prompt.length).toBeLessThan(16000);
  });

  it("injects QA repair context without changing the source window contract", () => {
    const seed = loadFixtureSeed();
    const result = runWorldModelFirstSimulation(seed, {
      startChapter: 1,
      endChapter: 3,
      characterActionsPerChapter: 3,
    });
    const episodeWindow = selectEpisodeWindows({
      result,
      targetEpisodeCount: 1,
      maxScenesPerEpisode: 2,
    }).windows[0]!;
    const prompt = buildEpisodeWindowWriterPrompt({
      seed,
      worldBrain: result.brain,
      episodeWindow,
      sceneLogs: result.sceneLogs,
      actionLogs: result.actionLogs,
      repairContext: {
        previousDraft: "장면 전환이 보고서처럼 끊긴 이전 초안.",
        qaSummary: "score=0.72; sceneSeam=0.45; issues=weak_scene_seam",
      },
    });

    expect(prompt).toContain("QA repair context");
    expect(prompt).toContain("score=0.72");
    expect(prompt).toContain("QA evidence 단어/표현은 본문에 한 번도 쓰지 않는다");
    expect(prompt).toContain("이전 초안");
    expect(prompt).toContain("장면 전환이 보고서처럼 끊긴 이전 초안.");
    expect(prompt).toContain("coverage contract");
    expect(prompt).toContain("scene seam contract");
    expect(prompt).toContain(episodeWindow.sourceSceneIds[0]!);
  });
});
