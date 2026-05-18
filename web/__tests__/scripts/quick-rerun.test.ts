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
    return [
      { chapter: 1, facts: [], extraction_status: "structured" },
      { chapter: 2, facts: [], extraction_status: "json_parse_fallback", fallback_reason: "schema_validation_failed" },
    ];
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
    if (startChapter === 2) {
      yield {
        type: "pipeline_event",
        chapter: startChapter,
        event: { type: "stage_change", stage: "future-character-debate" } as never,
      };
      yield {
        type: "pipeline_event",
        chapter: startChapter,
        event: { type: "stage_change", stage: "final-cast-hard-repair" } as never,
      };
      yield {
        type: "pipeline_event",
        chapter: startChapter,
        event: { type: "error", message: "[future-character-debate] keep_original — cast guard preserved" } as never,
      };
    }
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

class ExhaustedHarness extends FakeHarness {
  override getWorldStateSnapshot() {
    return [];
  }

  override async *run(
    seed: NovelSeed,
    startChapter: number,
    endChapter: number,
    options?: Record<string, unknown>,
  ): AsyncGenerator<HarnessEvent> {
    if (startChapter === 2) {
      this.calls.push({ chapter: startChapter, options });
      yield { type: "chapter_start", chapter: startChapter };
      yield { type: "error", chapter: startChapter, message: "upstream timeout" };
      return;
    }

    yield* super.run(seed, startChapter, endChapter, options);
  }
}

function createSeed(overrides: Partial<NovelSeed> = {}): NovelSeed {
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
    foreshadowing: [
      {
        id: "fs_gate",
        name: "문양 균열",
        description: "회랑 문양이 특정 피를 인식한다는 초기 징후",
        importance: "critical",
        planted_at: 1,
        hints_at: [],
        reveal_at: 2,
        origin: {
          episode_id: "ep_001",
          scene_id: "scene_001_corridor_gate",
          source_span: {
            start_offset: 18,
            end_offset: 49,
            excerpt: "문 표면의 문양이 세라핀의 손끝에서 붉게 갈라졌다.",
          },
        },
        linked_hint_occurrences: [],
        status: "pending",
        hint_count: 0,
      },
    ],
    chapter_outlines: [],
    extended_outlines: [],
    style: {
      tone: "긴장감 있는 로맨스 판타지",
      prose_guidelines: [],
      banned: [],
    },
    ...overrides,
  } as unknown as NovelSeed;
}

describe("quick-rerun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats a final summary with failed chapter list", () => {
    expect(formatRunSummary([
      { chapter: 1, success: true, attempts: 1, errorMessages: [], attemptDetails: [], safeguardStages: [], pipelineWarnings: [] },
      { chapter: 2, success: false, attempts: 4, errorMessages: ["boom"], attemptDetails: [], safeguardStages: [], pipelineWarnings: [] },
      { chapter: 3, success: true, attempts: 2, errorMessages: [], attemptDetails: [], safeguardStages: [], pipelineWarnings: [] },
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
    expect(fs.existsSync(path.join(outDir, "report.json"))).toBe(true);

    const progressLog = fs.readFileSync(path.join(outDir, "progress.log"), "utf-8");
    const chapterLog = fs.readFileSync(path.join(outDir, "quick-rerun.log"), "utf-8");
    const persistedSeed = JSON.parse(fs.readFileSync(path.join(outDir, "seed.json"), "utf-8")) as NovelSeed;
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf-8")) as {
      summary: string;
      safeguardSummary: Record<string, number>;
      artifactVerification: { ok: boolean; checks: Array<{ kind: string; exists: boolean }> };
      usageTotals: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number };
      durationTotalsMs: number;
      foreshadowingVerificationItems: Array<{
        id: string;
        name: string;
        plantedAt: number;
        revealAt: number | null;
        lifecycle: string;
        terminalState: {
          status: string;
          source: string;
          provenance: {
            sourceEpisodeIds: string[];
            sourceSceneIds: string[];
            sourceOccurrenceCount: number;
          };
        } | null;
        abandonmentReason?: string;
        abandonmentMarker?: string;
        intentionalAbandonment: {
          marker: string;
          source: string;
          provenance: {
            sourceEpisodeIds: string[];
            sourceSceneIds: string[];
            sourceOccurrenceCount: number;
          };
        } | null;
        sourceEpisodeIds: string[];
        sourceSceneIds: string[];
        sourceOccurrenceCount: number;
        sharedTargetSummary: string;
      }>;
      foreshadowVerificationInput: {
        registeredForeshadowItems: Array<{
          id: string;
          registrationEpisode: number;
          registrationEpisodeId: string;
          candidateResolutionEvents: Array<{
            episodeNumber: number;
            episodeId: string;
          }>;
        }>;
        episodeSequence: Array<{
          episodeNumber: number;
          episodeId: string;
        }>;
      };
      foreshadowContinuityVerifierReport: {
        resolutionWindowEpisodes: number;
        evaluationHorizonEpisode: number;
        totals: {
          total: number;
          resolvedWithinWindow: number;
          pending: number;
          missed: number;
          expired: number;
          intentionallyAbandoned: number;
        };
        items: Array<{
          id: string;
          status: string;
          resolutionEpisode: number | null;
          resolutionEpisodeId: string | null;
          countsAsFailure: boolean;
          threadVerdictClassification: string;
          expiryReasoning: {
            kind: string;
            deadlineEpisode: number;
            evaluationHorizonEpisode: number;
            resolutionEpisode: number | null;
            episodesLate: number | null;
            episodesRemaining: number | null;
            summary: string;
          };
        }>;
      };
      factExtractionFallbacks: {
        total: number;
        byKind: Record<string, number>;
        chapters: Array<{ chapter: number; kind: string; reason?: string }>;
      };
      lowScoreChapters: Array<{
        chapter: number;
        score: number;
        safeguardStages: string[];
        pipelineWarnings: string[];
        factExtractionFallbackKind?: string;
      }>;
      statuses: Array<{
        chapter: number;
        attemptDetails: Array<{ stageHistory: string[]; safeguardStages: string[]; pipelineWarnings: string[] }>;
        safeguardStages: string[];
        pipelineWarnings: string[];
      }>;
    };

    expect(persistedSeed.foreshadowing[0]).toMatchObject({
      id: "fs_gate",
      lifecycle: "pending",
      origin: {
        episode_id: "ep_001",
        scene_id: "scene_001_corridor_gate",
        source_span: {
          start_offset: 18,
          end_offset: 49,
          excerpt: "문 표면의 문양이 세라핀의 손끝에서 붉게 갈라졌다.",
        },
      },
      verification_metadata: {
        source_episode_ids: ["ep_001"],
        source_scene_ids: ["scene_001_corridor_gate"],
        source_occurrence_count: 1,
        shared_target_summary: "회랑 문양이 특정 피를 인식한다는 초기 징후",
      },
    });
    expect(progressLog).toContain("ch1 retry scheduled in 0s");
    expect(progressLog).toContain("[rerun] 2화 중 2화 성공, 없음화 실패");
    expect(progressLog).toContain("[rerun] safeguard summary");
    expect(progressLog).toContain("[rerun] fact-extractor fallbacks total=1 ch2:json_parse_fallback");
    expect(progressLog).toContain("[rerun] low-score chapters ch1=0.63, ch2=0.63");
    expect(progressLog).toContain("[rerun] artifact verification passed");
    expect(chapterLog).toContain("ch1 failure attempt=1 error=OpenAI Connection error");
    expect(chapterLog).toContain("ch1 success attempt=2");
    expect(chapterLog).toContain("ch2 success attempt=1");
    expect(chapterLog).toContain("fact-extractor-fallbacks total=1 ch2:json_parse_fallback");
    expect(chapterLog).toContain("low-score-chapters ch1=0.63, ch2=0.63");
    expect(chapterLog).toContain("safeguards future-character-debate=1");
    expect(result.reportPath).toBe(path.join(outDir, "report.json"));
    expect(result.artifactVerification.ok).toBe(true);
    expect(result.report.summary).toBe("2화 중 2화 성공, 없음화 실패");
    expect(report.summary).toBe("2화 중 2화 성공, 없음화 실패");
    expect(report.safeguardSummary["future-character-debate"]).toBe(1);
    expect(report.safeguardSummary["final-cast-hard-repair"]).toBe(1);
    expect(report.artifactVerification.ok).toBe(true);
    expect(report.artifactVerification.checks.some((check) => check.kind === "report" && check.exists)).toBe(true);
    expect(report.usageTotals).toEqual({ prompt_tokens: 2, completion_tokens: 2, total_tokens: 4, cost_usd: 0.002 });
    expect(report.durationTotalsMs).toBe(50);
    expect(report.factExtractionFallbacks.total).toBe(1);
    expect(report.factExtractionFallbacks.byKind.json_parse_fallback).toBe(1);
    expect(report.factExtractionFallbacks.chapters).toEqual([
      { chapter: 2, kind: "json_parse_fallback", reason: "schema_validation_failed" },
    ]);
    expect(report.lowScoreChapters).toHaveLength(2);
    expect(report.lowScoreChapters[0]).toMatchObject({
      chapter: 1,
      safeguardStages: [],
      pipelineWarnings: [],
    });
    expect(report.lowScoreChapters[0]?.score).toBeCloseTo(0.62725, 5);
    expect(report.lowScoreChapters[1]).toMatchObject({
      chapter: 2,
      safeguardStages: ["future-character-debate", "final-cast-hard-repair"],
      pipelineWarnings: ["[future-character-debate] keep_original — cast guard preserved"],
      factExtractionFallbackKind: "json_parse_fallback",
    });
    expect(report.foreshadowingVerificationItems).toEqual([
      {
        id: "fs_gate",
        name: "문양 균열",
        plantedAt: 1,
        revealAt: 2,
        lifecycle: "pending",
        terminalState: null,
        intentionalAbandonment: null,
        sourceEpisodeIds: ["ep_001"],
        sourceSceneIds: ["scene_001_corridor_gate"],
        sourceOccurrenceCount: 1,
        sharedTargetSummary: "회랑 문양이 특정 피를 인식한다는 초기 징후",
      },
    ]);
    expect(report.foreshadowVerificationInput.registeredForeshadowItems).toEqual([
      expect.objectContaining({
        id: "fs_gate",
        registrationEpisode: 1,
        registrationEpisodeId: "ep_001",
        candidateResolutionEvents: [],
      }),
    ]);
    expect(report.foreshadowVerificationInput.episodeSequence).toEqual([
      expect.objectContaining({
        episodeNumber: 1,
        episodeId: "ep_001",
      }),
      expect.objectContaining({
        episodeNumber: 2,
        episodeId: "ep_002",
      }),
    ]);
    expect(report.foreshadowContinuityVerifierReport).toMatchObject({
      resolutionWindowEpisodes: 80,
      evaluationHorizonEpisode: 2,
      totals: {
        total: 1,
        resolvedWithinWindow: 0,
        pending: 1,
        missed: 0,
        expired: 0,
        intentionallyAbandoned: 0,
      },
      items: [
        {
          id: "fs_gate",
          status: "pending",
          resolutionEpisode: null,
          resolutionEpisodeId: null,
          countsAsFailure: false,
          threadVerdictClassification: "non_terminal_failure",
          expiryReasoning: {
            kind: "deadline_not_reached",
            deadlineEpisode: 81,
            evaluationHorizonEpisode: 2,
            resolutionEpisode: null,
            episodesLate: null,
            episodesRemaining: 79,
          },
        },
      ],
    });
    expect(report.lowScoreChapters[1]?.score).toBeCloseTo(0.62725, 5);
    expect(report.statuses[1]?.safeguardStages).toEqual(["future-character-debate", "final-cast-hard-repair"]);
    expect(report.statuses[1]?.pipelineWarnings).toEqual(["[future-character-debate] keep_original — cast guard preserved"]);
    expect(report.statuses[1]?.attemptDetails[0]?.stageHistory).toContain("future-character-debate");

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

  it("records exhausted retries and summary artifacts when a later chapter never completes", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-rerun-fail-test-"));
    const harness = new ExhaustedHarness();
    const sleep = vi.fn(async () => {});

    const result = await runQuickRerun({
      harness,
      seed: createSeed(),
      maxChapters: 2,
      outDir,
      retryDelaysMs: [0, 0],
      sleep,
    });

    expect(result.statuses).toEqual([
      expect.objectContaining({ chapter: 1, success: true, attempts: 2 }),
      expect.objectContaining({
        chapter: 2,
        success: false,
        attempts: 3,
        errorMessages: ["upstream timeout"],
      }),
    ]);
    expect(sleep).toHaveBeenCalledTimes(3);

    expect(fs.existsSync(path.join(outDir, "seed.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "chapters", "ch01.txt"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "chapters", "ch02.txt"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "world-state.json"))).toBe(false);

    const progressLog = fs.readFileSync(path.join(outDir, "progress.log"), "utf-8");
    const chapterLog = fs.readFileSync(path.join(outDir, "quick-rerun.log"), "utf-8");
    expect(progressLog).toContain("ch2 failed after 3 attempts");
    expect(progressLog).toContain("[rerun] 2화 중 1화 성공, 2화 실패");
    expect(chapterLog).toContain("ch2 failure attempt=1 error=upstream timeout");
    expect(chapterLog).toContain("ch2 failure attempt=2 error=upstream timeout");
    expect(chapterLog).toContain("ch2 failure attempt=3 error=upstream timeout");
    expect(chapterLog).toContain("summary 2화 중 1화 성공, 2화 실패");
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf-8")) as {
      usageTotals: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number };
      durationTotalsMs: number;
      foreshadowVerificationVerdictSummary: {
        totalThreads: number;
        failureThreads: number;
        intentionalNonFailureClosures: number;
      };
      foreshadowVerificationInput: {
        registeredForeshadowItems: Array<{ id: string }>;
        episodeSequence: Array<{ episodeNumber: number }>;
      };
    };
    expect(report.usageTotals).toEqual({ prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost_usd: 0.001 });
    expect(report.durationTotalsMs).toBe(25);
    expect(report.foreshadowVerificationVerdictSummary).toMatchObject({
      totalThreads: 1,
      failureThreads: 1,
      intentionalNonFailureClosures: 0,
    });
    expect(report.foreshadowVerificationInput.registeredForeshadowItems).toHaveLength(1);
    expect(report.foreshadowVerificationInput.episodeSequence).toHaveLength(1);
  });

  it("persists intentional-abandonment markers through seed and report serialization", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-rerun-abandon-test-"));
    const harness = new FakeHarness();

    await runQuickRerun({
      harness,
      seed: createSeed({
        foreshadowing: [
          {
            id: "fs_cut",
            name: "폐기된 균열 떡밥",
            description: "중반 구조 개편으로 더 이상 회수하지 않기로 한 떡밥",
            importance: "minor",
            planted_at: 1,
            hints_at: [],
            reveal_at: null,
            abandonment_marker: "intentional-abandonment:timeline-cut",
            origin: {
              episode_id: "ep_001",
              scene_id: "scene_001_corridor_gate",
              source_span: {
                start_offset: 18,
                end_offset: 49,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
          },
        ],
      }),
      maxChapters: 1,
      outDir,
      retryDelaysMs: [0],
      sleep: async () => {},
    });

    const persistedSeed = JSON.parse(fs.readFileSync(path.join(outDir, "seed.json"), "utf-8")) as NovelSeed;
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf-8")) as {
      foreshadowingVerificationItems: Array<{
        id: string;
        lifecycle: string;
        terminalState: {
          status: string;
          source: string;
          provenance: {
            sourceEpisodeIds: string[];
            sourceSceneIds: string[];
            sourceOccurrenceCount: number;
          };
        } | null;
        abandonmentMarker?: string;
        intentionalAbandonment: {
          marker: string;
          source: string;
          provenance: {
            sourceEpisodeIds: string[];
            sourceSceneIds: string[];
            sourceOccurrenceCount: number;
          };
        } | null;
      }>;
      foreshadowVerificationInput: {
        registeredForeshadowItems: Array<{
          id: string;
          lifecycle: string;
          abandonmentMarker?: string;
        }>;
        episodeSequence: Array<{ episodeNumber: number; episodeId: string }>;
      };
      foreshadowVerificationVerdictSummary: {
        totalThreads: number;
        resolvedThreads: number;
        failureThreads: number;
        intentionalNonFailureClosures: number;
        threadVerdicts: Array<{
          id: string;
          classification: string;
          countsAsFailure: boolean;
        }>;
      };
    };

    expect(persistedSeed.foreshadowing[0]).toMatchObject({
      id: "fs_cut",
      lifecycle: "intentionally_abandoned",
      abandonment_marker: "intentional-abandonment:timeline-cut",
    });
    expect(report.foreshadowingVerificationItems).toEqual([
      expect.objectContaining({
        id: "fs_cut",
        lifecycle: "intentionally_abandoned",
        terminalState: {
          status: "intentionally_abandoned",
          source: "abandonment_marker",
          provenance: {
            sourceEpisodeIds: ["ep_001"],
            sourceSceneIds: ["scene_001_corridor_gate"],
            sourceOccurrenceCount: 1,
          },
        },
        abandonmentMarker: "intentional-abandonment:timeline-cut",
        intentionalAbandonment: {
          marker: "intentional-abandonment:timeline-cut",
          source: "abandonment_marker",
          provenance: {
            sourceEpisodeIds: ["ep_001"],
            sourceSceneIds: ["scene_001_corridor_gate"],
            sourceOccurrenceCount: 1,
          },
        },
      }),
    ]);
    expect(report.foreshadowVerificationInput.registeredForeshadowItems).toEqual([
      expect.objectContaining({
        id: "fs_cut",
        lifecycle: "intentionally_abandoned",
        abandonmentMarker: "intentional-abandonment:timeline-cut",
      }),
    ]);
    expect(report.foreshadowVerificationInput.episodeSequence).toEqual([
      expect.objectContaining({
        episodeNumber: 1,
        episodeId: "ep_001",
      }),
    ]);
    expect(report.foreshadowVerificationVerdictSummary).toMatchObject({
      totalThreads: 1,
      resolvedThreads: 0,
      failureThreads: 0,
      intentionalNonFailureClosures: 1,
    });
    expect(report.foreshadowVerificationVerdictSummary.threadVerdicts).toEqual([
      expect.objectContaining({
        id: "fs_cut",
        classification: "intentional_non_failure_closure",
        countsAsFailure: false,
      }),
    ]);
  });

  it("does not serialize a fully revealed foreshadow as resolved unless the episode payoff explicitly links the originating foreshadow id", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "quick-rerun-resolution-gate-"));
    const harness = new FakeHarness();

    await runQuickRerun({
      harness,
      seed: createSeed({
        foreshadowing: [
          {
            id: "fs_gate",
            name: "문양 균열",
            description: "회랑 문양이 특정 피를 인식한다는 초기 징후",
            importance: "critical",
            planted_at: 1,
            hints_at: [],
            reveal_at: 2,
            origin: {
              episode_id: "ep_001",
              scene_id: "scene_001_corridor_gate",
              source_span: {
                start_offset: 18,
                end_offset: 49,
              },
            },
            linked_hint_occurrences: [],
            status: "pending",
            hint_count: 0,
            resolution: {
              cause: { revealed: true, chapter: 2, evidence: ["원인 공개"] },
              identity: { revealed: true, chapter: 2, evidence: ["정체 공개"] },
              consequence: { revealed: true, chapter: 2, evidence: ["결과 공개"] },
            },
          },
        ],
      }),
      maxChapters: 1,
      outDir,
      retryDelaysMs: [0],
      sleep: async () => {},
    });

    const persistedSeed = JSON.parse(fs.readFileSync(path.join(outDir, "seed.json"), "utf-8")) as NovelSeed;
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf-8")) as {
      foreshadowingVerificationItems: Array<{
        id: string;
        lifecycle: string;
        terminalState: {
          status: string;
          source: string;
          provenance: {
            sourceEpisodeIds: string[];
            sourceSceneIds: string[];
            sourceOccurrenceCount: number;
          };
        } | null;
      }>;
      foreshadowVerificationInput: {
        registeredForeshadowItems: Array<{
          id: string;
          lifecycle: string;
        }>;
      };
      foreshadowVerificationVerdictSummary: {
        failureThreads: number;
        nonTerminalFailures: number;
      };
    };

    expect(persistedSeed.foreshadowing[0]).toMatchObject({
      id: "fs_gate",
      lifecycle: "pending",
      resolution: expect.objectContaining({
        status: "partial",
      }),
    });
    expect(report.foreshadowingVerificationItems).toEqual([
      expect.objectContaining({
        id: "fs_gate",
        lifecycle: "pending",
        terminalState: null,
      }),
    ]);
    expect(report.foreshadowVerificationInput.registeredForeshadowItems).toEqual([
      expect.objectContaining({
        id: "fs_gate",
        lifecycle: "pending",
      }),
    ]);
    expect(report.foreshadowVerificationVerdictSummary).toMatchObject({
      failureThreads: 1,
      nonTerminalFailures: 1,
    });
  });
});
