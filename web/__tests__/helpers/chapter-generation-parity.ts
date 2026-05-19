import * as path from "path";

import {
  createRendererRegenerationRequest,
  type HarnessConfig,
  type HarnessEvent,
  type RendererRegenerationRequest,
} from "@/lib/harness";
import type { ChapterGenerationProgrammaticRunResponse } from "@/lib/orchestration";

export interface ChapterGenerationParityScenario {
  name: string;
  chapterNumber: number;
  startChapter: number;
  endChapter: number;
  preset: string;
  budgetUsd: number | null;
  mode: "standard" | "renderer_regeneration";
  seed: ReturnType<typeof createParitySeed>;
  rendererRegeneration?: RendererRegenerationRequest;
}

export interface ChapterGenerationExpectedOutcome {
  text: string;
  plotSummary: string;
  unresolvedTension: string;
}

export function createParitySeed() {
  return {
    title: "chapter generation parity smoke",
    logline: "동일 입력에서 CLI, 라이브러리, API 계약과 산출물이 일치해야 한다.",
    total_chapters: 12,
    world: {
      name: "회랑",
      genre: "fantasy",
      sub_genre: "mystery",
      time_period: "unknown",
      magic_system: "sigils",
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    story_threads: [],
    arcs: [],
    foreshadowing: [],
    chapter_outlines: [],
    extended_outlines: [],
    style: {
      tone: "긴장",
      prose_guidelines: [],
      banned: [],
    },
  };
}

export function createStandardParityScenario(): ChapterGenerationParityScenario {
  return {
    name: "standard_generation",
    chapterNumber: 4,
    startChapter: 4,
    endChapter: 4,
    preset: "default",
    budgetUsd: null,
    mode: "standard",
    seed: createParitySeed(),
  };
}

export function createRendererRegenerationParityScenario(): ChapterGenerationParityScenario {
  const seed = createParitySeed();
  const chapterNumber = 9;

  return {
    name: "renderer_regeneration",
    chapterNumber,
    startChapter: chapterNumber,
    endChapter: chapterNumber,
    preset: "default",
    budgetUsd: null,
    mode: "renderer_regeneration",
    seed,
    rendererRegeneration: createRendererRegenerationRequest({
      chapterNumber,
      blueprint: {
        chapter_number: chapterNumber,
        title: `${chapterNumber}화`,
        arc_id: "arc-9",
        one_liner: "동일 narrative state에서 prose만 다시 렌더링한다.",
        role_in_arc: "rising_action",
        scenes: [],
        emotional_arc: "긴장",
        key_points: [],
        characters_involved: [],
        tension_level: 6,
        target_word_count: 3200,
        foreshadowing_actions: [],
        dependencies: [],
      } as never,
      previousSummaries: [],
      simulationState: {
        seedTitle: seed.title,
        chapterCursor: chapterNumber - 1,
        objectiveFacts: { entries: [] },
        audienceKnowledge: { byId: {}, timeline: [], bySummary: {} },
        characters: {},
        memories: { byCharacterId: {} },
        beliefs: { byCharacterId: {}, trustMatrix: {} },
        utterances: { byCharacterId: {} },
        foreshadowRegistry: { items: {} },
        threads: {},
        eventLog: [],
      } as never,
      worldStateProjection: [],
    }),
  };
}

export function createParityHarnessConfig(): HarnessConfig {
  return {
    name: "test",
    models: {
      planning: "test",
      writing: "test",
      critique: "test",
      repair: "test",
      default: "test",
    },
    pipeline: [],
    qualityThreshold: 0.8,
    maxAttempts: 1,
    budgetUsd: null,
    evalDimensions: [],
    tracking: {
      memory: false,
      characters: false,
      threads: false,
      tone: false,
      progress: false,
      feedback: false,
    },
    output: { mode: "file", verbose: false },
    chapterLength: { min: 1, max: 1 },
    fastMode: false,
    parallelMode: false,
    simpleMode: false,
  };
}

function createParityChapterResult(
  chapterNumber: number,
  rendererRegenerationRequest?: RendererRegenerationRequest,
) {
  const expected = createChapterGenerationExpectedOutcome(
    Boolean(rendererRegenerationRequest),
  );

  return {
    chapterNumber,
    text: expected.text,
    summary: {
      title: `${chapterNumber}화`,
      plot_summary: expected.plotSummary,
      ending_scene_state: {
        location: "회랑",
        time_of_day: "night",
        characters_present: [],
        ongoing_action: "테스트 중",
        unresolved_tension: expected.unresolvedTension,
      },
    } as never,
    score: 0.92,
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      cost_usd: 0.01,
    },
    durationMs: 15,
    rendererRegenerationRequest,
  } as const;
}

export function createChapterGenerationExpectedOutcome(
  rendererRegeneration: boolean,
): ChapterGenerationExpectedOutcome {
  return rendererRegeneration
    ? {
        text: "Parity runner renderer regeneration chapter.",
        plotSummary:
          "공유 narrative state에서 renderer-only 재생성 계약을 검증한다.",
        unresolvedTension:
          "세 표면이 동일한 renderer 재생성 계약을 유지하는가",
      }
    : {
        text: "Parity runner smoke chapter.",
        plotSummary:
          "공유 오케스트레이션 계약과 산출물 정합성을 검증한다.",
        unresolvedTension: "세 표면이 동일한 계약을 유지하는가",
      };
}

function createParityDoneResult(
  chapterNumber: number,
  rendererRegenerationRequest?: RendererRegenerationRequest,
) {
  const chapter = createParityChapterResult(
    chapterNumber,
    rendererRegenerationRequest,
  );

  return {
    mode: rendererRegenerationRequest
      ? "renderer_regeneration"
      : "standard",
    config: "test",
    chapters: [chapter],
    totalUsage: chapter.usage,
    totalDurationMs: chapter.durationMs,
    totalCostUsd: chapter.usage.cost_usd,
    canonicalValidationFailures: [],
    beliefInterpretationRecoveries: [],
  } as const;
}

export function createParityHarnessMockImplementation() {
  return async function* (
    _seed: unknown,
    startChapter: number,
    _endChapter: number,
    options?: {
      rendererRegeneration?: RendererRegenerationRequest;
    },
  ): AsyncGenerator<HarnessEvent> {
    const rendererRegenerationRequest = options?.rendererRegeneration;

    yield { type: "chapter_start", chapter: startChapter };
    yield {
      type: "chapter_complete",
      result: createParityChapterResult(
        startChapter,
        rendererRegenerationRequest,
      ) as never,
    };
    yield {
      type: "done",
      result: createParityDoneResult(
        startChapter,
        rendererRegenerationRequest,
      ) as never,
    };
  };
}

export class ParityPassingHarness {
  async *run(
    seed: unknown,
    startChapter: number,
    endChapter: number,
    options?: {
      rendererRegeneration?: RendererRegenerationRequest;
    },
  ): AsyncGenerator<HarnessEvent> {
    yield* createParityHarnessMockImplementation()(
      seed,
      startChapter,
      endChapter,
      options,
    );
  }
}

function toComparableRelativePath(outDir: string, artifactPath: string): string {
  const relativePath = path.relative(outDir, artifactPath);
  return (relativePath === "" ? "." : relativePath).split(path.sep).join("/");
}

export function normalizeChapterGenerationContractForParity(
  contract: ChapterGenerationProgrammaticRunResponse,
) {
  const normalized = JSON.parse(
    JSON.stringify(contract),
  ) as ChapterGenerationProgrammaticRunResponse;
  const outDir = normalized.request.options.outDir;

  return {
    ...normalized,
    runId: "<run-id>",
    request: {
      ...normalized.request,
      options: {
        ...normalized.request.options,
        outDir: outDir ? "<outDir>" : undefined,
      },
    },
    progress: {
      ...normalized.progress,
      stageRecords: normalized.progress.stageRecords.map((record) => ({
        stage: record.stage,
        status: record.status,
        dependsOn: [...record.dependsOn],
        components: [...record.components],
        details: record.details,
      })),
    },
    state: {
      ...normalized.state,
      startedAt: "<timestamp>",
      completedAt: "<timestamp>",
    },
    artifacts: [...normalized.artifacts]
      .map((artifact) => ({
        ...artifact,
        path: outDir
          ? toComparableRelativePath(outDir, artifact.path)
          : artifact.path,
      }))
      .sort((left, right) => {
        const leftKey = `${left.role}:${left.chapterNumber ?? 0}:${left.path}`;
        const rightKey = `${right.role}:${right.chapterNumber ?? 0}:${right.path}`;
        return leftKey.localeCompare(rightKey);
      }),
  };
}

export function buildApiBodyForParityScenario(
  scenario: ChapterGenerationParityScenario,
  outDir: string,
) {
  return {
    seed: scenario.seed,
    chapterNumber: scenario.chapterNumber,
    previousSummaries: [],
    preset: scenario.preset,
    mode: scenario.mode === "renderer_regeneration"
      ? "renderer_regeneration"
      : "generate",
    options: {
      outDir,
      budgetUsd: scenario.budgetUsd,
    },
    rendererRegeneration: scenario.rendererRegeneration,
  };
}
