import { describe, it, expect, vi } from "vitest";
import { QualityLoop } from "@/lib/agents/quality-loop";
import type { ChapterContext, CriticIssue, CriticReport, LifecycleEvent } from "@/lib/agents/pipeline";
import type { CriticAgent } from "@/lib/agents/critic-agent";
import type { SurgeonAgent } from "@/lib/agents/surgeon-agent";
import type { NovelSeed } from "@/lib/schema/novel";

function makeCtx(text = "문단0\n\n문단1\n\n문단2"): ChapterContext {
  return {
    seed: { world: { genre: "현대 판타지" }, characters: [], foreshadowing: [], arcs: [], chapter_outlines: [], style: {} } as unknown as NovelSeed,
    chapterNumber: 1,
    previousSummaries: [],
    text,
    snapshots: [],
    bestScore: 0,
    ruleIssues: [],
    critiqueHistory: [],
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
  };
}

function makeReport(score: number, issues: CriticIssue[] = []): CriticReport {
  return {
    overallScore: score,
    dimensions: { narrative: score, characterVoice: score, rhythm: score, hookEnding: score, immersion: score },
    issues,
  };
}

const majorIssue: CriticIssue = {
  startParagraph: 1, endParagraph: 1, category: "characterVoice",
  description: "말투 불일치", severity: "major", suggestedFix: "수정",
};
const minorIssue: CriticIssue = {
  startParagraph: 0, endParagraph: 0, category: "rhythm",
  description: "어미 반복", severity: "minor", suggestedFix: "변경",
};

async function collectEvents(gen: AsyncGenerator<LifecycleEvent>) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("QualityLoop", () => {
  it("stops when score meets threshold on first evaluation", async () => {
    const critic = { evaluate: vi.fn().mockResolvedValue(makeReport(0.9)), quickScore: vi.fn() };
    const surgeon = { fix: vi.fn() };
    const loop = new QualityLoop(critic as unknown as CriticAgent, surgeon as unknown as SurgeonAgent);
    const ctx = makeCtx();
    const events = await collectEvents(loop.run(ctx));
    expect(events.some(e => e.type === "evaluation")).toBe(true);
    expect(surgeon.fix).not.toHaveBeenCalled();
  });

  it("runs Surgeon on critical/major issues, skips minor", async () => {
    const critic = {
      evaluate: vi.fn().mockResolvedValueOnce(makeReport(0.6, [majorIssue, minorIssue])),
      quickScore: vi.fn().mockResolvedValue(0.9),
    };
    const surgeonFix = vi.fn(async function*() { yield "수정됨"; return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 }; });
    const surgeonFixIsolated = vi.fn().mockResolvedValue({ startParagraph: 1, endParagraph: 1, patchedText: "수정됨", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 } });
    const surgeon = { fix: surgeonFix, fixIsolated: surgeonFixIsolated };
    const loop = new QualityLoop(critic as unknown as CriticAgent, surgeon as unknown as SurgeonAgent);
    const ctx = makeCtx();
    await collectEvents(loop.run(ctx));
    expect(surgeonFixIsolated).toHaveBeenCalledTimes(1); // only major, not minor
  });

  it("reverts when score drops after surgery", async () => {
    const critic = {
      evaluate: vi.fn().mockResolvedValue(makeReport(0.6, [majorIssue])),
      quickScore: vi.fn().mockResolvedValue(0.5), // score dropped
    };
    const surgeonFix = vi.fn(async function*() { yield "bad text"; return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 }; });
    const surgeonFixIsolated = vi.fn().mockResolvedValue({ startParagraph: 1, endParagraph: 1, patchedText: "bad text", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 } });
    const surgeon = { fix: surgeonFix, fixIsolated: surgeonFixIsolated };
    const loop = new QualityLoop(critic as unknown as CriticAgent, surgeon as unknown as SurgeonAgent);
    const ctx = makeCtx();
    const originalText = ctx.text;
    await collectEvents(loop.run(ctx));
    expect(ctx.text).toBe(originalText); // reverted to snapshot
  });

  it("stops after max 5 iterations", async () => {
    let callCount = 0;
    const critic = {
      evaluate: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(makeReport(0.6 + callCount * 0.01, [majorIssue]));
      }),
      quickScore: vi.fn().mockImplementation(() => Promise.resolve(0.6 + callCount * 0.01)),
    };
    const surgeonFix = vi.fn(async function*() { yield "ok"; return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 }; });
    const surgeonFixIsolated = vi.fn().mockResolvedValue({ startParagraph: 1, endParagraph: 1, patchedText: "ok", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 } });
    const surgeon = { fix: surgeonFix, fixIsolated: surgeonFixIsolated };
    const loop = new QualityLoop(critic as unknown as CriticAgent, surgeon as unknown as SurgeonAgent);
    const ctx = makeCtx();
    await collectEvents(loop.run(ctx));
    expect(critic.evaluate.mock.calls.length).toBeLessThanOrEqual(6); // initial + max 5
  });

  it("saves initial snapshot at iteration 0", async () => {
    const critic = {
      evaluate: vi.fn().mockResolvedValue(makeReport(0.9)),
      quickScore: vi.fn(),
    };
    const loop = new QualityLoop(critic as unknown as CriticAgent, {} as unknown as SurgeonAgent);
    const ctx = makeCtx();
    await collectEvents(loop.run(ctx));
    expect(ctx.snapshots[0]).toEqual({ text: ctx.text, score: 0.9, iteration: 0 });
  });
});
