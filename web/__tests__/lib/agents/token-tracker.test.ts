// @vitest-environment node
import { describe, it, expect } from "vitest";
import { TokenTracker } from "@/lib/agents/token-tracker";
import type { AgentLog } from "@/lib/agents/types";

function makeLog(overrides?: Partial<AgentLog>): AgentLog {
  return {
    timestamp: new Date(),
    taskId: "test",
    model: "gpt-4o-mini",
    prompt_tokens: 100,
    completion_tokens: 50,
    cost_usd: 0.0001,
    success: true,
    duration_ms: 500,
    ...overrides,
  };
}

describe("TokenTracker", () => {
  describe("constructor", () => {
    it("creates without budget", () => {
      const tracker = new TokenTracker();
      // No budget means canAfford always returns true
      expect(tracker.canAfford(1_000_000, "gpt-4o")).toBe(true);
    });

    it("creates with budget", () => {
      const tracker = new TokenTracker(1.0);
      // With budget, canAfford depends on remaining budget
      expect(tracker.canAfford(100, "gpt-4o-mini")).toBe(true);
    });
  });

  describe("record()", () => {
    it("records a successful call log", () => {
      const tracker = new TokenTracker();
      const log = makeLog();
      tracker.record(log);
      expect(tracker.getLogs()).toHaveLength(1);
    });

    it("records multiple logs", () => {
      const tracker = new TokenTracker();
      tracker.record(makeLog());
      tracker.record(makeLog({ taskId: "second" }));
      tracker.record(makeLog({ taskId: "third" }));
      expect(tracker.getLogs()).toHaveLength(3);
    });
  });

  describe("getSnapshot()", () => {
    it("returns zeros for empty tracker", () => {
      const tracker = new TokenTracker();
      expect(tracker.getSnapshot()).toEqual({
        total_tokens: 0,
        total_cost_usd: 0,
        calls: 0,
        errors: 0,
      });
    });

    it("returns correct totals after recording", () => {
      const tracker = new TokenTracker();
      tracker.record(makeLog({ prompt_tokens: 200, completion_tokens: 100, cost_usd: 0.005 }));
      tracker.record(makeLog({ prompt_tokens: 300, completion_tokens: 150, cost_usd: 0.01 }));

      const snap = tracker.getSnapshot();
      expect(snap.total_tokens).toBe(750); // 200+100+300+150
      expect(snap.total_cost_usd).toBeCloseTo(0.015);
      expect(snap.calls).toBe(2);
      expect(snap.errors).toBe(0);
    });

    it("counts errors correctly", () => {
      const tracker = new TokenTracker();
      tracker.record(makeLog({ success: true }));
      tracker.record(makeLog({ success: false, error: "timeout" }));
      tracker.record(makeLog({ success: false, error: "rate limit" }));
      tracker.record(makeLog({ success: true }));

      const snap = tracker.getSnapshot();
      expect(snap.calls).toBe(4);
      expect(snap.errors).toBe(2);
    });
  });

  describe("canAfford()", () => {
    it("returns true when no budget is set", () => {
      const tracker = new TokenTracker();
      // Even enormous token counts should be affordable with no budget
      expect(tracker.canAfford(100_000_000, "gpt-4o")).toBe(true);
    });

    it("returns true when under budget", () => {
      const tracker = new TokenTracker(1.0); // $1 budget
      // gpt-4o-mini: (1000/1M)*0.15 + (1000/1M)*0.60 = 0.00075 estimated
      expect(tracker.canAfford(1000, "gpt-4o-mini")).toBe(true);
    });

    it("returns false when over budget", () => {
      const tracker = new TokenTracker(0.001); // $0.001 budget
      // Record a log that already costs 0.001
      tracker.record(makeLog({ cost_usd: 0.001 }));
      // Now try to afford more tokens — estimated cost will push over budget
      expect(tracker.canAfford(10000, "gpt-4o")).toBe(false);
    });

    it("handles exactly at budget boundary", () => {
      // gpt-4o-mini: estimateCost(1000, 1000) = (1000/1M)*0.15 + (1000/1M)*0.60 = 0.00075
      const budget = 0.00075;
      const tracker = new TokenTracker(budget);
      // Exactly at budget should be affordable (<= comparison)
      expect(tracker.canAfford(1000, "gpt-4o-mini")).toBe(true);
    });
  });

  describe("estimateCost() (static)", () => {
    it("calculates cost for gpt-4o-mini", () => {
      // pricing: input=0.15, output=0.60 per 1M tokens
      const cost = TokenTracker.estimateCost("gpt-4o-mini", 1000, 1000);
      // (1000/1_000_000)*0.15 + (1000/1_000_000)*0.60 = 0.00075
      expect(cost).toBeCloseTo(0.00075, 8);
    });

    it("calculates cost for gpt-4o", () => {
      // pricing: input=2.50, output=10.00 per 1M tokens
      const cost = TokenTracker.estimateCost("gpt-4o", 1000, 1000);
      // (1000/1_000_000)*2.50 + (1000/1_000_000)*10.00 = 0.0125
      expect(cost).toBeCloseTo(0.0125, 8);
    });

    it("defaults to gpt-4o-mini pricing for unknown model", () => {
      const unknownCost = TokenTracker.estimateCost("some-unknown-model", 1000, 1000);
      const miniCost = TokenTracker.estimateCost("gpt-4o-mini", 1000, 1000);
      expect(unknownCost).toBe(miniCost);
    });

    it("matches partial model name", () => {
      // "anthropic/claude-sonnet-4-20250514" contains "claude-sonnet-4-20250514"
      // pricing: input=3.0, output=15.0 per 1M tokens
      const cost = TokenTracker.estimateCost("anthropic/claude-sonnet-4-20250514", 1000, 1000);
      // (1000/1_000_000)*3.0 + (1000/1_000_000)*15.0 = 0.018
      expect(cost).toBeCloseTo(0.018, 8);
    });
  });

  describe("getLogs()", () => {
    it("returns a copy, not a reference", () => {
      const tracker = new TokenTracker();
      tracker.record(makeLog());
      const logs1 = tracker.getLogs();
      const logs2 = tracker.getLogs();
      expect(logs1).toEqual(logs2);
      expect(logs1).not.toBe(logs2); // different array references
    });

    it("contains all recorded logs in order", () => {
      const tracker = new TokenTracker();
      const log1 = makeLog({ taskId: "first" });
      const log2 = makeLog({ taskId: "second" });
      const log3 = makeLog({ taskId: "third" });
      tracker.record(log1);
      tracker.record(log2);
      tracker.record(log3);

      const logs = tracker.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].taskId).toBe("first");
      expect(logs[1].taskId).toBe("second");
      expect(logs[2].taskId).toBe("third");
    });
  });
});
