import { describe, it, expect } from "vitest";
import type { LifecycleEvent, ChapterContext, PipelineAgent } from "@/lib/agents/pipeline";
import type { ChapterLifecycleOptions } from "@/lib/agents/chapter-lifecycle";

describe("Pipeline integration", () => {
  it("LifecycleEvent type includes new stage values", () => {
    // Verify new event types compile correctly
    const events: LifecycleEvent[] = [
      { type: "stage_change", stage: "writing" },
      { type: "stage_change", stage: "rule_check" },
      { type: "stage_change", stage: "critiquing" },
      { type: "stage_change", stage: "surgery" },
      { type: "stage_change", stage: "polishing" },
      { type: "stage_change", stage: "self-review" },
      { type: "revert", reason: "score dropped", to: 0 },
      { type: "replace_text", content: "new text" },
      { type: "done" },
    ];
    expect(events).toHaveLength(9);
  });

  it("preserves existing ChapterLifecycleOptions interface", () => {
    const options: ChapterLifecycleOptions = {
      seed: { world: { genre: "현대 판타지" } } as any,
      chapterNumber: 1,
      previousSummaries: [],
      qualityThreshold: 0.85,
      maxAttempts: 1,
    };
    expect(options.chapterNumber).toBe(1);
    expect(options.qualityThreshold).toBe(0.85);
  });

  it("PipelineAgent interface is correctly defined", () => {
    // Create a minimal pipeline agent to verify the interface
    const agent: PipelineAgent = {
      name: "test-agent",
      async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
        yield { type: "stage_change", stage: "testing" };
        yield { type: "done" };
      },
    };
    expect(agent.name).toBe("test-agent");
  });

  it("mock pipeline executes agents in sequence", async () => {
    const order: string[] = [];

    const agentA: PipelineAgent = {
      name: "agent-a",
      async *run() {
        order.push("a-start");
        yield { type: "stage_change", stage: "a" };
        order.push("a-end");
      },
    };

    const agentB: PipelineAgent = {
      name: "agent-b",
      async *run() {
        order.push("b-start");
        yield { type: "stage_change", stage: "b" };
        order.push("b-end");
      },
    };

    const pipeline = [agentA, agentB];
    const ctx = {
      seed: {} as any,
      chapterNumber: 1,
      previousSummaries: [],
      text: "",
      snapshots: [],
      bestScore: 0,
      ruleIssues: [],
      critiqueHistory: [],
      totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };

    const events: LifecycleEvent[] = [];
    for (const agent of pipeline) {
      for await (const event of agent.run(ctx)) {
        events.push(event);
      }
    }

    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
    expect(events.map(e => e.type)).toEqual(["stage_change", "stage_change"]);
  });
});
