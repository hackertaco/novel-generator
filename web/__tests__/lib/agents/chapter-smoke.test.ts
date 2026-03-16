import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LifecycleEvent } from "@/lib/agents/pipeline";
import type { TokenUsage } from "@/lib/agents/types";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Mock constants
// ---------------------------------------------------------------------------

const MOCK_WRITER_TEXT =
  "서윤은 카페 창가에 앉아 커피를 홀짝였다.\n\n" +
  '"오늘도 늦었네." 그녀가 중얼거렸다.\n\n' +
  "밖에서는 비가 내리고 있었다. 우산을 두고 온 것이 떠올랐다.\n\n" +
  '"언니, 여기!" 동생 수아가 문을 열고 들어왔다.\n\n' +
  "서윤은 손을 흔들며 미소를 지었다. 하지만 가슴 한구석이 묘하게 무거웠다.\n\n" +
  "그때 핸드폰이 울렸다. 모르는 번호였다.";

const MOCK_POLISHED_TEXT =
  "서윤은 카페 창가에 앉아 커피를 홀짝였다.\n\n" +
  '"오늘도 늦었어." 그녀가 나직이 중얼거렸다.\n\n' +
  "밖에서는 비가 내리고 있었다. 우산을 두고 온 것이 문득 떠올랐다.\n\n" +
  '"언니, 여기!" 동생 수아가 환하게 웃으며 문을 열고 들어왔다.\n\n' +
  "서윤은 손을 흔들며 미소를 지었다. 하지만 가슴 한구석이 묘하게 무거웠다.\n\n" +
  "그때 핸드폰이 울렸다. 모르는 번호였다.";

const MOCK_USAGE: TokenUsage = {
  prompt_tokens: 100,
  completion_tokens: 200,
  total_tokens: 300,
  cost_usd: 0.01,
};

function makeCriticResponseJson(overallScore: number) {
  return JSON.stringify({
    dimensions: {
      narrative: overallScore,
      characterVoice: overallScore,
      rhythm: overallScore,
      hookEnding: overallScore,
      immersion: overallScore,
    },
    issues:
      overallScore < 0.85
        ? [
            {
              startParagraph: 0,
              endParagraph: 0,
              category: "rhythm",
              description: "문장 리듬이 단조롭습니다",
              severity: "major",
              suggestedFix: "문장 길이를 다양하게 조절하세요",
            },
          ]
        : [],
  });
}

// ---------------------------------------------------------------------------
// Mock setup: getAgent
// ---------------------------------------------------------------------------

// Track callStream/call invocations for context-propagation verification
let callStreamInvocations: Array<{ prompt: string; taskId?: string }> = [];
let callInvocations: Array<{ prompt: string; taskId?: string }> = [];

// Control critic responses per invocation
let criticCallIndex = 0;
let criticScores: number[] = [0.9]; // default: pass on first try

vi.mock("@/lib/agents/llm-agent", () => {
  return {
    getAgent: () => ({
      /** Streaming call mock — returns AsyncGenerator<string, TokenUsage> */
      callStream(opts: { prompt: string; system?: string; taskId?: string }) {
        callStreamInvocations.push({ prompt: opts.prompt, taskId: opts.taskId });
        const taskId = opts.taskId ?? "";

        // Writer agent
        if (taskId.includes("-write")) {
          return (async function* () {
            yield MOCK_WRITER_TEXT;
            return MOCK_USAGE;
          })();
        }

        // Surgeon agent
        if (taskId.includes("surgeon-")) {
          // Return a slightly modified version of the target paragraph
          return (async function* () {
            yield "서윤은 카페 창가에 앉아 라떼를 홀짝였다.";
            return MOCK_USAGE;
          })();
        }

        // Polisher agent
        if (taskId.includes("polisher-")) {
          return (async function* () {
            yield MOCK_POLISHED_TEXT;
            return MOCK_USAGE;
          })();
        }

        // Writer continuation (auto-continue)
        if (taskId.includes("-continue-")) {
          return (async function* () {
            yield "\n\n추가 텍스트입니다.";
            return MOCK_USAGE;
          })();
        }

        // Default fallback
        return (async function* () {
          yield "mock text";
          return MOCK_USAGE;
        })();
      },

      /** Non-streaming call mock — returns AgentCallResult<string> */
      call(opts: { prompt: string; system?: string; taskId?: string }) {
        callInvocations.push({ prompt: opts.prompt, taskId: opts.taskId });
        const taskId = opts.taskId ?? "";

        // Self-review (writer)
        if (taskId.includes("self-review")) {
          return Promise.resolve({
            data: MOCK_WRITER_TEXT,
            usage: MOCK_USAGE,
            model: "mock-model",
            attempt: 1,
            duration_ms: 100,
          });
        }

        // Critic evaluate
        if (taskId.includes("critic-evaluate")) {
          const score = criticScores[criticCallIndex] ?? 0.9;
          criticCallIndex++;
          return Promise.resolve({
            data: makeCriticResponseJson(score),
            usage: MOCK_USAGE,
            model: "mock-model",
            attempt: 1,
            duration_ms: 100,
          });
        }

        // Critic quickScore
        if (taskId.includes("critic-quickscore")) {
          const score = criticScores[criticCallIndex] ?? 0.9;
          criticCallIndex++;
          return Promise.resolve({
            data: JSON.stringify({
              dimensions: {
                narrative: score,
                characterVoice: score,
                rhythm: score,
                hookEnding: score,
                immersion: score,
              },
            }),
            usage: MOCK_USAGE,
            model: "mock-model",
            attempt: 1,
            duration_ms: 100,
          });
        }

        // Default
        return Promise.resolve({
          data: "",
          usage: MOCK_USAGE,
          model: "mock-model",
          attempt: 1,
          duration_ms: 100,
        });
      },
    }),
  };
});

// ---------------------------------------------------------------------------
// Helper: minimal NovelSeed for testing
// ---------------------------------------------------------------------------

function makeSeed() {
  return {
    title: "테스트 소설",
    logline: "평범한 대학생이 이상한 전화를 받는 이야기",
    total_chapters: 10,
    world: {
      name: "현대 서울",
      genre: "현대 판타지",
      sub_genre: "일상 미스터리",
      time_period: "현대",
      magic_system: null,
      key_locations: {},
      factions: {},
      rules: [],
    },
    characters: [],
    arcs: [
      {
        id: "arc_1",
        name: "시작편",
        start_chapter: 1,
        end_chapter: 5,
        summary: "주인공이 이상한 세계에 빠져든다",
        key_events: ["이상한 전화"],
        climax_chapter: 5,
      },
    ],
    chapter_outlines: [
      {
        chapter_number: 1,
        title: "이상한 전화",
        arc_id: "arc_1",
        one_liner: "서윤이 의문의 전화를 받는다",
        key_points: ["카페에서 전화를 받음"],
        characters_involved: ["서윤"],
        tension_level: 3,
      },
    ],
    foreshadowing: [],
    style: {
      max_paragraph_length: 3,
      dialogue_ratio: 0.6,
      sentence_style: "short",
      hook_ending: true,
      pov: "1인칭",
      tense: "과거형",
      formatting_rules: [],
    },
  } as unknown as NovelSeed;
}

// ---------------------------------------------------------------------------
// Collect events helper
// ---------------------------------------------------------------------------

async function collectEvents(
  gen: AsyncGenerator<LifecycleEvent>,
): Promise<LifecycleEvent[]> {
  const events: LifecycleEvent[] = [];
  for await (const ev of gen) {
    events.push(ev);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Chapter Pipeline Smoke Test", () => {
  beforeEach(() => {
    callStreamInvocations = [];
    callInvocations = [];
    criticCallIndex = 0;
    criticScores = [0.9]; // high score → no retry by default
  });

  it("전체 파이프라인이 순서대로 실행된다", async () => {
    const { runChapterLifecycle } = await import(
      "@/lib/agents/chapter-lifecycle"
    );

    const events = await collectEvents(
      runChapterLifecycle({
        seed: makeSeed(),
        chapterNumber: 1,
        previousSummaries: [],
      }),
    );

    // Extract stage_change events in order
    const stages = events
      .filter((e): e is Extract<LifecycleEvent, { type: "stage_change" }> => e.type === "stage_change")
      .map((e) => e.stage);

    // Verify expected stage ordering:
    // writing → self-review → rule_check → critiquing → polishing → completing
    expect(stages).toContain("writing");
    expect(stages).toContain("self-review");
    expect(stages).toContain("rule_check");
    expect(stages).toContain("critiquing");
    expect(stages).toContain("polishing");
    expect(stages).toContain("completing");

    // Verify ordering: writing before rule_check before critiquing before polishing before completing
    const writingIdx = stages.indexOf("writing");
    const ruleCheckIdx = stages.indexOf("rule_check");
    const critiquingIdx = stages.indexOf("critiquing");
    const polishingIdx = stages.indexOf("polishing");
    const completingIdx = stages.indexOf("completing");

    expect(writingIdx).toBeLessThan(ruleCheckIdx);
    expect(ruleCheckIdx).toBeLessThan(critiquingIdx);
    expect(critiquingIdx).toBeLessThan(polishingIdx);
    expect(polishingIdx).toBeLessThan(completingIdx);

    // complete event should exist
    const completeEvent = events.find((e) => e.type === "complete");
    expect(completeEvent).toBeDefined();

    // done event should be the very last
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
  });

  it("WriterAgent의 출력이 이후 에이전트에 전달된다", async () => {
    const { runChapterLifecycle } = await import(
      "@/lib/agents/chapter-lifecycle"
    );

    const events = await collectEvents(
      runChapterLifecycle({
        seed: makeSeed(),
        chapterNumber: 1,
        previousSummaries: [],
      }),
    );

    // The polisher receives text via ctx.text — we can verify by checking
    // that the polisher's callStream was called with a prompt containing
    // text from the writer output (since ctx.text flows through the pipeline).
    const polisherCall = callStreamInvocations.find((c) =>
      c.taskId?.includes("polisher-"),
    );
    expect(polisherCall).toBeDefined();
    // The polisher prompt includes the chapter text, which originated from the writer
    expect(polisherCall!.prompt).toContain("서윤");

    // The critic also sees the writer's text
    const criticCall = callInvocations.find((c) =>
      c.taskId?.includes("critic-evaluate"),
    );
    expect(criticCall).toBeDefined();
    expect(criticCall!.prompt).toContain("서윤");
  });

  it("QualityLoop이 threshold 미만이면 surgery를 실행한다", async () => {
    // First critic: low score (below 0.85 threshold) → triggers surgery + quickScore
    // quickScore: high score → passes threshold after surgery
    criticScores = [0.5, 0.9];

    const { runChapterLifecycle } = await import(
      "@/lib/agents/chapter-lifecycle"
    );

    const events = await collectEvents(
      runChapterLifecycle({
        seed: makeSeed(),
        chapterNumber: 1,
        previousSummaries: [],
      }),
    );

    const stages = events
      .filter((e): e is Extract<LifecycleEvent, { type: "stage_change" }> => e.type === "stage_change")
      .map((e) => e.stage);

    // With a low initial score, we should see surgery stage
    expect(stages).toContain("surgery");

    // There should be an evaluation event with the low initial score
    const evalEvents = events.filter(
      (e): e is Extract<LifecycleEvent, { type: "evaluation" }> => e.type === "evaluation",
    );
    expect(evalEvents.length).toBeGreaterThanOrEqual(1);
    expect(evalEvents[0].overall_score).toBeLessThan(0.85);
  });

  it("최종 complete 이벤트에 summary가 포함된다", async () => {
    const { runChapterLifecycle } = await import(
      "@/lib/agents/chapter-lifecycle"
    );

    const events = await collectEvents(
      runChapterLifecycle({
        seed: makeSeed(),
        chapterNumber: 1,
        previousSummaries: [],
      }),
    );

    const completeEvent = events.find(
      (e): e is Extract<LifecycleEvent, { type: "complete" }> => e.type === "complete",
    );
    expect(completeEvent).toBeDefined();

    const summary = completeEvent!.summary;
    expect(summary).toBeDefined();
    expect(summary.chapter_number).toBe(1);
    expect(summary.title).toBe("이상한 전화");
    expect(typeof summary.word_count).toBe("number");
    expect(summary.word_count).toBeGreaterThan(0);
    expect(typeof summary.plot_summary).toBe("string");
  });

  it("LLM 실패 시 critic이 null을 반환하면 error 이벤트가 발생한다", async () => {
    // Return unparseable garbage so CriticAgent.evaluate returns null
    criticScores = []; // empty → fallback to default, but we need to override differently

    // Re-mock getAgent for this test to make critic.call fail
    const llmAgentModule = await import("@/lib/agents/llm-agent");
    const originalGetAgent = llmAgentModule.getAgent;

    let criticAttempts = 0;
    vi.spyOn(llmAgentModule, "getAgent").mockReturnValue({
      callStream: originalGetAgent().callStream,
      call(opts: { prompt: string; system?: string; taskId?: string }) {
        const taskId = opts.taskId ?? "";
        if (taskId.includes("critic-evaluate")) {
          criticAttempts++;
          // Return unparseable text so parseCriticResponse returns null
          return Promise.resolve({
            data: "이건 JSON이 아닙니다. 파싱 실패.",
            usage: MOCK_USAGE,
            model: "mock-model",
            attempt: 1,
            duration_ms: 100,
          });
        }
        // Delegate to the original mock for other calls
        return originalGetAgent().call(opts);
      },
    } as unknown as ReturnType<typeof llmAgentModule.getAgent>);

    const { runChapterLifecycle } = await import(
      "@/lib/agents/chapter-lifecycle"
    );

    const events = await collectEvents(
      runChapterLifecycle({
        seed: makeSeed(),
        chapterNumber: 1,
        previousSummaries: [],
      }),
    );

    // When critic returns null, QualityLoop yields an error event
    const errorEvent = events.find(
      (e): e is Extract<LifecycleEvent, { type: "error" }> => e.type === "error",
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.message).toContain("Critic evaluation failed");

    // Pipeline should still complete with done event
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");

    vi.restoreAllMocks();
  });
});
