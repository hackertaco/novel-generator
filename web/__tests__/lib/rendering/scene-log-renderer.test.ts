import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  renderSceneLogsToProse,
  renderSceneLogToProse,
  validateRenderedScene,
} from "@/lib/rendering/scene-log-renderer";
import { selectEpisodeWindows } from "@/lib/rendering/episode-selector";
import { evaluateNovelOutputQA } from "@/lib/rendering/novel-output-qa";
import { NovelSeedSchema, type NovelSeed } from "@/lib/schema/novel";
import { runWorldModelFirstSimulation } from "@/lib/sim/world-runner";

function normalizeLegacySeedInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const seed = input as Record<string, unknown>;
  const foreshadowing = Array.isArray(seed.foreshadowing)
    ? seed.foreshadowing.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }

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
        origin: value.origin ?? {
          episode_id: `ep_${String(plantedAt).padStart(3, "0")}`,
          scene_id: `scene_${String(plantedAt).padStart(3, "0")}_01`,
          source_span: {
            start_offset: 0,
            end_offset: 1,
            excerpt: String(value.description ?? value.id ?? "foreshadowing"),
          },
        },
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
  const parsed = NovelSeedSchema.parse(normalizeLegacySeedInput(JSON.parse(raw)));
  // Renderer suites pre-date the deterministic GenreConvention hook and
  // anchor on the fixture's baseline scene structure. Strip genre_origin so
  // the regression event triplet doesn't perturb their expectations.
  return {
    ...parsed,
    characters: parsed.characters.map((character) => ({
      ...character,
      genre_origin: undefined,
    })),
  };
}

function runFixtureScene() {
  const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
    startChapter: 1,
    endChapter: 1,
    characterActionsPerChapter: 2,
  });

  return {
    sceneLog: result.sceneLogs[0]!,
    worldBrain: result.brain,
  };
}

function repeatedReaderParagraphs(texts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const paragraph of text
      .split(/\n\s*\n/u)
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !value.startsWith("#") && !value.startsWith("<!--"))) {
      counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([paragraph]) => paragraph);
}

describe("SceneLog renderer", () => {
  it("renders a batch of SceneLogs with aggregate verification counts", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 3,
      characterActionsPerChapter: 2,
    });
    const rendered = renderSceneLogsToProse({
      sceneLogs: result.sceneLogs,
      worldBrain: result.brain,
    });

    expect(rendered.scenes).toHaveLength(3);
    expect(rendered.report).toMatchObject({
      sceneCount: 3,
      renderedChapterCount: 3,
      errorCount: 0,
      warningCount: 0,
      violationCount: 0,
    });
    expect(rendered.report.dialogueLineCount).toBeGreaterThanOrEqual(12);
    expect(rendered.scenes.map((scene) => scene.report.chapter)).toEqual([1, 2, 3]);
  });

  it("renders prose and dialogue from SceneLog without leaking withheld facts", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const result = renderSceneLogToProse({ sceneLog, worldBrain });

    expect(result.text).toContain(`<!-- sceneLogId: ${sceneLog.sceneId} -->`);
    for (const sourceEventId of sceneLog.sourceEventIds) {
      expect(result.text).toContain(sourceEventId);
    }
    expect(result.text).toContain(`# ${sceneLog.chapter}화. ${sceneLog.title}`);
    expect(result.dialogueLines).toHaveLength(sceneLog.dialogueTurns.length);
    expect(result.report.violations.filter((violation) => violation.severity === "error")).toHaveLength(0);

    for (const turn of sceneLog.dialogueTurns) {
      const line = result.dialogueLines.find((candidate) => candidate.turnId === turn.turnId);
      expect(line).toEqual(expect.objectContaining({
        sourceEventId: turn.sourceEventId,
        speakerId: turn.speakerId,
      }));
      expect(line?.utterance).toBeTypeOf("string");
      expect(line?.utterance.length).toBeGreaterThan(0);
      expect(result.text).not.toContain(turn.hiddenIntent);
      for (const forbidden of turn.renderableConstraints.forbiddenExplicitFacts) {
        expect(result.text).not.toContain(forbidden);
      }
    }
  });

  it("does not leak raw world-log outcome syntax into renderer prose", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const result = renderSceneLogToProse({
      sceneLog: {
        ...sceneLog,
        sceneOutcome: "두 번째 아침: [plant] fs_time_magic: 엘리시아의 시간 속성 마법 — 1화에서 시계가 거꾸로 도는 묘사로 암시, 10화에서 발현 -> 세레나 크레센트와 엘리시아 크레센트의 신뢰 축이 -1만큼 이동한다",
      },
      worldBrain,
    });

    const proseOnly = result.text
      .split("\n")
      .filter((line) => !line.trim().startsWith("<!--"))
      .join("\n");

    expect(proseOnly).not.toContain("[plant]");
    expect(proseOnly).not.toContain("->");
    expect(proseOnly).not.toContain("신뢰 축");
    expect(proseOnly).not.toContain("fs_time_magic");
    expect(proseOnly).not.toContain("잔 받침");
    expect(proseOnly).not.toContain("얇은 물자국");
    expect(proseOnly).toContain("말로 풀 수 없는 의심이 남았다");
  });

  it("expands high-impact interaction turns into longer editorial prose", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const firstTurn = sceneLog.dialogueTurns[0]!;
    const baseDynamics = firstTurn.interactionDynamics ?? {
      utteranceCandidate: firstTurn.utterance ?? "지금은 조용히 확인해야겠어요.",
      surfaceMeaning: firstTurn.spokenIntent,
      hiddenIntention: firstTurn.hiddenIntent,
      targetInterpretations: firstTurn.listenerIds.map((characterId) => ({
        characterId,
        interpretedAs: firstTurn.listenerInterpretation,
        emotionalResponse: "다음 반응을 준비하는 의심",
      })),
      emotionalShift: {
        actorBefore: "장면 압력을 읽는 중",
        actorAfter: "긴장을 숨긴 탐색",
        targetBefore: "상대의 의도를 확인하지 못한 경계",
        targetAfter: "다음 반응을 준비하는 의심",
        intensityDelta: 1,
      },
      powerShift: {
        axis: "information",
        fromCharacterId: firstTurn.listenerIds[0] ?? null,
        toCharacterId: firstTurn.speakerId,
        delta: 1,
        reason: firstTurn.spokenIntent,
      },
      relationshipShift: {
        sourceCharacterId: firstTurn.speakerId,
        targetCharacterId: firstTurn.listenerIds[0] ?? null,
        trustDelta: 0,
        suspicionDelta: 0,
        dependencyDelta: 0,
        hostilityDelta: 0,
        reason: firstTurn.relationshipEffect,
      },
      writerHooks: {
        gesture: "손끝이 찻잔 가장자리에 멈췄다",
        silence: "맞은편이 바로 답하지 않는 침묵",
        sensoryCue: "응접실의 공기가 한 박자 낮아졌다",
        linePurpose: "숨은 압박을 확인하는 질문",
      },
    };
    const heatedSceneLog = {
      ...sceneLog,
      dialogueTurns: sceneLog.dialogueTurns.map((turn, index) =>
        index === 0
          ? {
              ...turn,
              interactionDynamics: {
                ...baseDynamics,
                emotionalShift: {
                  ...baseDynamics.emotionalShift,
                  intensityDelta: 3,
                  actorAfter: "긴장을 숨긴 탐색",
                  targetAfter: "다음 반응을 준비하는 의심",
                },
                powerShift: {
                  ...baseDynamics.powerShift,
                  delta: 3,
                  axis: "information",
                },
                relationshipShift: {
                  ...baseDynamics.relationshipShift,
                  trustDelta: -1,
                  suspicionDelta: 1,
                  hostilityDelta: 1,
                },
                writerHooks: {
                  gesture: "손끝이 찻잔 가장자리에 멈췄다",
                  silence: "맞은편이 바로 답하지 않는 침묵",
                  sensoryCue: "응접실의 공기가 한 박자 낮아졌다",
                  linePurpose: "숨은 압박을 확인하는 질문",
                },
              },
            }
          : turn
      ),
    };

    const result = renderSceneLogToProse({ sceneLog: heatedSceneLog, worldBrain });

    expect(result.report.editorialExpansionCount).toBeGreaterThan(0);
    expect(result.report.expandedTurnIds).toContain(firstTurn.turnId);
    expect(result.report.editorialExpansionPlans).toHaveLength(heatedSceneLog.dialogueTurns.length);
    expect(result.report.editorialExpansionPlans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        turnId: firstTurn.turnId,
        renderMode: expect.stringMatching(/expanded|spotlight/),
        editorialHeat: expect.any(Number),
        suggestedParagraphs: expect.any(Number),
        expansionReasons: expect.arrayContaining([
          expect.stringMatching(/감정|권력|관계|숨은 의도|상대 해석|spotlight/u),
        ]),
      }),
    ]));
    expect(result.report.editorialExpansionPlans.find((plan) =>
      plan.turnId === firstTurn.turnId
    )?.editorialHeat).toBeGreaterThanOrEqual(0.62);
    expect(result.report.paragraphCount).toBeGreaterThan(result.report.dialogueLineCount + 4);
    expect(result.text).toMatch(/다음 수를 바꾸는 신호|다음 말은 조금 더 조심스러워졌다|숨은 압박/u);
    expect(result.report.violations.filter((violation) => violation.severity === "error")).toHaveLength(0);
  });

  it("can expand two salient turns when one scene has multiple strong interactions", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 1,
      characterActionsPerChapter: 6,
    });
    const sceneLog = result.sceneLogs[0]!;
    const firstTurn = sceneLog.dialogueTurns[0]!;
    const secondTurnIndex = Math.max(1, sceneLog.dialogueTurns.findIndex((turn) =>
      turn.speakerId !== firstTurn.speakerId
    ));
    const heatedTurnIds = new Set([
      firstTurn.turnId,
      sceneLog.dialogueTurns[secondTurnIndex]?.turnId,
    ]);
    const heatedSceneLog = {
      ...sceneLog,
      dialogueTurns: sceneLog.dialogueTurns.map((turn) => {
        if (!heatedTurnIds.has(turn.turnId)) return turn;
        const dynamics = turn.interactionDynamics ?? {
          utteranceCandidate: turn.utterance ?? "지금은 조용히 확인해야겠어요.",
          surfaceMeaning: turn.spokenIntent,
          hiddenIntention: turn.hiddenIntent,
          targetInterpretations: turn.listenerIds.map((characterId) => ({
            characterId,
            interpretedAs: turn.listenerInterpretation,
            emotionalResponse: "다음 반응을 준비하는 의심",
          })),
          emotionalShift: {
            actorBefore: "장면 압력을 읽는 중",
            actorAfter: "긴장을 숨긴 탐색",
            targetBefore: "상대의 의도를 확인하지 못한 경계",
            targetAfter: "다음 반응을 준비하는 의심",
            intensityDelta: 1,
          },
          powerShift: {
            axis: "information",
            fromCharacterId: turn.listenerIds[0] ?? null,
            toCharacterId: turn.speakerId,
            delta: 1,
            reason: turn.spokenIntent,
          },
          relationshipShift: {
            sourceCharacterId: turn.speakerId,
            targetCharacterId: turn.listenerIds[0] ?? null,
            trustDelta: 0,
            suspicionDelta: 0,
            dependencyDelta: 0,
            hostilityDelta: 0,
            reason: turn.relationshipEffect,
          },
          writerHooks: {
            gesture: "손끝이 찻잔 가장자리에 멈췄다",
            silence: "맞은편이 바로 답하지 않는 침묵",
            sensoryCue: "응접실의 공기가 한 박자 낮아졌다",
            linePurpose: "숨은 압박을 확인하는 질문",
          },
        };

        return {
          ...turn,
          interactionDynamics: {
            ...dynamics,
            emotionalShift: {
              ...dynamics.emotionalShift,
              intensityDelta: 3,
            },
            powerShift: {
              ...dynamics.powerShift,
              delta: 3,
            },
            relationshipShift: {
              ...dynamics.relationshipShift,
              trustDelta: -1,
              suspicionDelta: 1,
              dependencyDelta: 1,
              hostilityDelta: 1,
            },
          },
        };
      }),
    };

    const rendered = renderSceneLogToProse({
      sceneLog: heatedSceneLog,
      worldBrain: result.brain,
    });

    expect(rendered.report.editorialExpansionCount).toBe(2);
    expect(rendered.report.expandedTurnIds).toEqual(expect.arrayContaining([...heatedTurnIds].filter(Boolean)));
    expect(new Set(rendered.report.expandedTurnIds.map((turnId) =>
      heatedSceneLog.dialogueTurns.find((turn) => turn.turnId === turnId)?.speakerId
    ))).toHaveProperty("size", 2);
  });

  it("keeps world-log hook language out of novel prose", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const firstTurn = sceneLog.dialogueTurns[0]!;
    const baseDynamics = firstTurn.interactionDynamics ?? {
      utteranceCandidate: firstTurn.utterance ?? "지금은 조용히 확인해야겠어요.",
      surfaceMeaning: firstTurn.spokenIntent,
      hiddenIntention: firstTurn.hiddenIntent,
      targetInterpretations: firstTurn.listenerIds.map((characterId) => ({
        characterId,
        interpretedAs: firstTurn.listenerInterpretation,
        emotionalResponse: "다음 반응을 준비하는 의심",
      })),
      emotionalShift: {
        actorBefore: "장면 압력을 읽는 중",
        actorAfter: "후퇴 뒤의 계산",
        targetBefore: "상대의 의도를 확인하지 못한 경계",
        targetAfter: "다음 반응을 준비하는 의심",
        intensityDelta: 3,
      },
      powerShift: {
        axis: "information",
        fromCharacterId: firstTurn.listenerIds[0] ?? null,
        toCharacterId: firstTurn.speakerId,
        delta: 3,
        reason: firstTurn.spokenIntent,
      },
      relationshipShift: {
        sourceCharacterId: firstTurn.speakerId,
        targetCharacterId: firstTurn.listenerIds[0] ?? null,
        trustDelta: -1,
        suspicionDelta: 1,
        dependencyDelta: 0,
        hostilityDelta: 1,
        reason: firstTurn.relationshipEffect,
      },
      writerHooks: {
        gesture: "라엘 아우레아는 먼저 시선을 거두고 몸을 돌린다",
        silence: "엘리시아 크레센트가 바로 답하지 않는 짧은 침묵",
        sensoryCue: "마법탑 알카나의 복도 쪽 소음이 멀어지며 말끝을 끊는다",
        linePurpose: "대화를 끊고 거리를 확보하는 선언",
      },
    };

    const prose = Array.from({ length: 32 }, (_, index) => {
      const result = renderSceneLogToProse({
        sceneLog: {
          ...sceneLog,
          sceneId: `${sceneLog.sceneId}_hook_polish_${index}`,
          chapter: 40 + index,
          title: `${40 + index}화`,
          emotionalArc: {
            ...sceneLog.emotionalArc,
            start: `${40 + index}화에서 독살당한 공작 영애가 3년 전으로 회귀해, 자신을 죽인 약혼자와 이복언니를 상대로 완벽한 복수극을 펼치며 제국 최고의 마법사로 거듭난다의 흐름이 진전된다.`,
          },
          dialogueTurns: sceneLog.dialogueTurns.map((turn, turnIndex) =>
            turnIndex === 0
              ? {
                  ...turn,
                  turnId: `${turn.turnId}_hook_polish_${index}`,
                  utterance: "재밌네요. 보통은 그렇게 정면으로 나오지 않거든요. 다음에는 다른 자리에서 묻겠습니다 다음 말은 장소를 바꾸겠습니다",
                  interactionDynamics: {
                    ...baseDynamics,
                    emotionalShift: {
                      ...baseDynamics.emotionalShift,
                      intensityDelta: 3,
                    },
                    powerShift: {
                      ...baseDynamics.powerShift,
                      delta: 3,
                    },
                    relationshipShift: {
                      ...baseDynamics.relationshipShift,
                      trustDelta: -1,
                      suspicionDelta: 1,
                      hostilityDelta: 1,
                    },
                    writerHooks: {
                      gesture: "라엘 아우레아는 먼저 시선을 거두고 몸을 돌린다",
                      silence: "엘리시아 크레센트가 바로 답하지 않는 짧은 침묵",
                      sensoryCue: "마법탑 알카나의 복도 쪽 소음이 멀어지며 말끝을 끊는다",
                      linePurpose: "대화를 끊고 거리를 확보하는 선언",
                    },
                  },
                }
              : turn
          ),
        },
        worldBrain,
      });
      return result.text;
    }).join("\n\n");

    expect(prose).not.toMatch(/\d+화에서 .*흐름이 진전된다/u);
    expect(prose).not.toContain("바로 답하지 않는 짧은 침묵");
    expect(prose).not.toContain("대화를 끊고 거리를 확보하는 선언");
    expect(prose).not.toContain("말끝을 끊는다 대화를");
    expect(prose).not.toMatch(/마지막 음절[^.?!。！？\n]{0,40}마지막 음절/u);
    expect(prose).not.toContain("다음에는 다른 자리에서 묻겠습니다 다음 말은 장소를 바꾸겠습니다");
    expect(prose).not.toContain("다음 말은 장소를 바꾸겠습니다");
    expect(prose).not.toContain("그날의 일은 조용히 다음 국면으로 넘어갔다");
    expect(prose).not.toMatch(/#\s+\d+화\.\s+\d+화/u);
    expect(prose).not.toContain("재밌네요. 보통은 그렇게 정면으로 나오지 않거든요");
    expect(prose).not.toMatch(/(?:라엘는|마리안는|카이젠는|봉쇄은|교대은|은폐은)/u);
    expect(prose).not.toMatch(/(?:남긴다|늦었다|끊었다|남았다)\s+[가-힣]/u);
  });

  it("translates director pressure and repeated agent dialogue into reader-facing prose", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 1,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const sceneLog = result.sceneLogs[0]!;
    const rendered = renderSceneLogToProse({
      sceneLog,
      worldBrain: result.brain,
      options: {
        includeTraceComments: false,
        includeTitle: true,
      },
    });
    const proseOnly = rendered.text
      .split("\n")
      .filter((line) => !line.trim().startsWith("<!--"))
      .join("\n");

    expect(proseOnly).not.toMatch(/판세\s*재정의의\s*여파로/u);
    expect(proseOnly).not.toMatch(/(?:출입\s*봉쇄|증언\s*분기|기록\s*감사|파벌\s*거래|징후\s*재출현|후폭풍\s*정리)의\s*여파로/u);
    expect(proseOnly).not.toMatch(/\.\./u);
    expect(proseOnly).not.toMatch(/엘리시아가,\s*거울/u);
    // Voice-aware dialogue가 격언체 candidate를 제거했는지 검증.
    expect(proseOnly).not.toContain("명단이 닫히면 침묵도 증언이 됩니다");
    expect(proseOnly).not.toContain("장부가 닫히면 남는 건 소문뿐입니다");
    expect(proseOnly).not.toContain("접힌 자국은 말보다 오래 남습니다");
    expect(rendered.dialogueLines.map((line) => line.utterance)).not.toContain(
      "전 같은 실수를 반복하지 않을 겁니다. 사용인들의 입이 닫히기 전에요",
    );
    expect(rendered.dialogueLines.map((line) => line.utterance)).not.toContain(
      "전 같은 실수를 반복하지 않을 겁니다. 장부 끝의 이름부터 확인하겠습니다",
    );
    expect(rendered.report.violations.filter((violation) => violation.severity === "error")).toHaveLength(0);
  });

  it("reports a violation when rendered text exposes a forbidden fact", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const result = renderSceneLogToProse({ sceneLog, worldBrain });
    const firstTurn = sceneLog.dialogueTurns[0]!;
    const leakedFact = firstTurn.renderableConstraints.forbiddenExplicitFacts[0]!;
    const violations = validateRenderedScene({
      sceneLog,
      dialogueLines: result.dialogueLines,
      text: `${result.text}\n${leakedFact}`,
    });

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden_fact_leak",
          severity: "error",
          turnId: firstTurn.turnId,
          sourceEventId: firstTurn.sourceEventId,
        }),
      ]),
    );
  });

  it("renders selected world-log episodes into QA-passing source-backed prose", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 8,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const selection = selectEpisodeWindows({
      result,
      targetEpisodeCount: 3,
      selectionMode: "highest_impact",
      maxScenesPerEpisode: 1,
    });
    const qaReports = selection.windows.map((episodeWindow) => {
      const selectedSceneIds = new Set(episodeWindow.sourceSceneIds);
      const selectedSceneLogs = result.sceneLogs.filter((sceneLog) =>
        selectedSceneIds.has(sceneLog.sceneId)
      );
      const rendered = renderSceneLogsToProse({
        sceneLogs: selectedSceneLogs,
        worldBrain: result.brain,
        options: {
          includeTraceComments: false,
          includeTitle: true,
        },
      });
      const text = rendered.scenes.map((scene) => scene.text).join("\n\n");
      const qa = evaluateNovelOutputQA({
        text,
        episodeWindow,
        sceneLogs: result.sceneLogs,
        actionLogs: result.actionLogs,
      });

      expect(rendered.report.errorCount).toBe(0);
      expect(rendered.report.chapters.every((report) => report.actionLogCoverage === 1)).toBe(true);
      expect(episodeWindow.sourceStateDeltaIds.length).toBeGreaterThanOrEqual(3);
      expect(qa.verdict).toBe("pass");
      expect(qa.metrics.sourceCoverage.score).toBe(1);
      expect(qa.metrics.sourceStateDeltaGrounding.score).toBe(1);
      expect(qa.metrics.metaLeakSafety.score).toBe(1);
      expect(qa.issues).toHaveLength(0);
      return qa;
    });

    const averageQaScore = qaReports.reduce((sum, report) => sum + report.score, 0) / qaReports.length;
    expect(selection.windows).toHaveLength(3);
    expect(averageQaScore).toBeGreaterThanOrEqual(0.85);
  });

  it("varies recurring opening, subtext, and outcome paragraphs across a multi-scene render", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 8,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const rendered = renderSceneLogsToProse({
      sceneLogs: result.sceneLogs,
      worldBrain: result.brain,
      options: {
        includeTraceComments: false,
        includeTitle: true,
      },
    });

    expect(repeatedReaderParagraphs(rendered.scenes.map((scene) => scene.text))).toHaveLength(0);
  });

  it("does not expose generic chapter-planning labels or abstract arc summaries", () => {
    const result = runWorldModelFirstSimulation(loadFixtureSeed(), {
      startChapter: 1,
      endChapter: 8,
      maxBeatsPerChapter: 3,
      characterActionsPerChapter: 4,
      characterSimulationMode: "agent_ticks",
      skipRenderedChapters: true,
      fastLedgerValidation: true,
      fastEventApplication: true,
    });
    const rendered = renderSceneLogsToProse({
      sceneLogs: result.sceneLogs,
      worldBrain: result.brain,
      options: {
        includeTraceComments: false,
        includeTitle: true,
      },
    });
    const prose = rendered.scenes.map((scene) => scene.text).join("\n\n");

    expect(prose).not.toMatch(/\d+번째 장면/u);
    expect(prose).not.toContain("회귀 후");
    expect(prose).not.toContain("시간 속성 마법을 각성");
    expect(prose).not.toContain("약혼 파기를 위한 첫 수");
    expect(prose).not.toContain("침묵의 기록 소문");
    expect(prose).not.toContain("공기가 한 박자 무겁게 가라앉");
    expect(prose).not.toMatch(/[가-힣]+은 그렇게 시작됐다/u);
    expect(prose).not.toMatch(/(?:마리안는|교대은|봉쇄은|공작가은|아우레아은|크레센트은)/u);
    expect(prose).not.toMatch(/(?:은\/는|이\/가|을\/를|과\/와|와\/과)/u);
  });

  it("resolves particles in recurring outcome paragraph variants", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const prose = Array.from({ length: 24 }, (_, index) => {
      const result = renderSceneLogToProse({
        sceneLog: {
          ...sceneLog,
          sceneId: `${sceneLog.sceneId}_particle_${index}`,
          sceneOutcome: "검증: 마리안와 카이젠의 신뢰 축이 0만큼 이동한다",
          narrativeDirectorPressures: [{
            pressureId: `pressure_particle_${index}`,
            targetScenePurpose: sceneLog.scenePurpose,
            type: "constraint",
            summary: "하인 명단 봉쇄가 다음 접근권을 제한한다",
            targetThreadIds: [],
            source: "narrative_director",
          }],
        },
        worldBrain,
      });
      return result.text;
    }).join("\n\n");

    expect(prose).not.toMatch(/(?:카이젠는|마리안는|봉쇄은|교대은|명단 봉쇄은|감시 교대은)/u);
    expect(prose).not.toMatch(/(?:은\/는|이\/가|을\/를|과\/와|와\/과)/u);
  });

  it("resolves particles in generated titles", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const prose = Array.from({ length: 32 }, (_, index) => {
      const result = renderSceneLogToProse({
        sceneLog: {
          ...sceneLog,
          sceneId: `${sceneLog.sceneId}_generated_title_particle_${index}`,
          title: `${sceneLog.chapter}화`,
          scenePurpose: "information_discovery",
          narrativeDirectorPressures: [{
            pressureId: `pressure_title_${index}`,
            targetScenePurpose: "information_discovery",
            type: "rumor",
            summary: "닫힌 기록 소문이 다음 접근권을 제한한다",
            targetThreadIds: [],
            source: "narrative_director",
          }],
        },
        worldBrain,
      });
      return result.text.split("\n").find((line) => line.startsWith("# ")) ?? "";
    }).join("\n");

    expect(prose).toMatch(/기록을 읽는 손|접힌 기록|닫히기 전의 닫힌 기록|접힌 문서를 읽는 손/u);
    expect(prose).not.toMatch(/(?:기록를|문서을|장부를 읽는 손를)/u);
    expect(prose).not.toMatch(/(?:은\/는|이\/가|을\/를|과\/와|와\/과)/u);
  });

  it("does not leak raw interaction axis labels or object particle errors in expanded prose", () => {
    const { sceneLog, worldBrain } = runFixtureScene();
    const firstTurn = sceneLog.dialogueTurns[0]!;
    const baseDynamics = firstTurn.interactionDynamics ?? {
      utteranceCandidate: firstTurn.utterance ?? "지금은 조용히 확인해야겠어요.",
      surfaceMeaning: firstTurn.spokenIntent,
      hiddenIntention: firstTurn.hiddenIntent,
      targetInterpretations: [{
        characterId: "kaizen",
        interpretedAs: firstTurn.listenerInterpretation,
        emotionalResponse: "흔들린 경계",
      }],
      emotionalShift: {
        actorBefore: "장면 압력을 읽는 중",
        actorAfter: "방어적인 날카로움",
        targetBefore: "상대의 의도를 확인하지 못한 경계",
        targetAfter: "흔들린 경계",
        intensityDelta: 3,
      },
      powerShift: {
        axis: "emotional",
        fromCharacterId: "kaizen",
        toCharacterId: firstTurn.speakerId,
        delta: 3,
        reason: firstTurn.spokenIntent,
      },
      relationshipShift: {
        sourceCharacterId: firstTurn.speakerId,
        targetCharacterId: "kaizen",
        trustDelta: -1,
        suspicionDelta: 1,
        dependencyDelta: 0,
        hostilityDelta: 1,
        reason: firstTurn.relationshipEffect,
      },
      writerHooks: {
        gesture: "손끝이 찻잔 가장자리에 멈췄다",
        silence: "카이젠 아우레아가 바로 답하지 않는 침묵",
        sensoryCue: "응접실의 공기가 한 박자 낮아졌다",
        linePurpose: "상대의 방어선을 흔드는 질문",
      },
    };
    const prose = Array.from({ length: 32 }, (_, index) => {
      const result = renderSceneLogToProse({
        sceneLog: {
          ...sceneLog,
          sceneId: `${sceneLog.sceneId}_axis_particle_${index}`,
          participantNames: ["엘리시아 크레센트", "카이젠 아우레아"],
          dialogueTurns: sceneLog.dialogueTurns.map((turn, turnIndex) =>
            turnIndex === 0
              ? {
                  ...turn,
                  turnId: `${turn.turnId}_axis_particle_${index}`,
                  speakerName: "엘리시아 크레센트",
                  listenerIds: ["kaizen"],
                  listenerNames: ["카이젠 아우레아"],
                  interactionDynamics: {
                    ...baseDynamics,
                    emotionalShift: {
                      ...baseDynamics.emotionalShift,
                      intensityDelta: 3,
                      actorAfter: "방어적인 날카로움",
                      targetAfter: "흔들린 경계",
                    },
                    powerShift: {
                      ...baseDynamics.powerShift,
                      axis: "emotional",
                      delta: 3,
                    },
                  },
                }
              : turn
          ),
        },
        worldBrain,
      });
      return result.text;
    }).join("\n\n");

    expect(prose).toContain("감정의 균형");
    expect(prose).not.toMatch(/(?:emotional|information|social|access)(?:가|은|이|을|의)?/u);
    expect(prose).not.toMatch(/(?:카이젠를|마리안를|라엘를)/u);
    expect(prose).not.toMatch(/(?:은\/는|이\/가|을\/를|과\/와|와\/과)/u);
  });
});
