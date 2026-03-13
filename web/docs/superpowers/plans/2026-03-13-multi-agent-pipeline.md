# Multi-Agent Chapter Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the monolithic chapter-lifecycle into a pipeline of 5 specialized agents (Writer, RuleGuard, Critic, Surgeon, Polisher) with shared ChapterContext.

**Architecture:** Pipeline with Middleware pattern. Each agent implements `PipelineAgent` interface, mutates shared `ChapterContext`, and yields `LifecycleEvent`s. The orchestrator iterates agents sequentially. Quality Loop internally manages Critic↔Surgeon iterations with snapshot-based rollback.

**Tech Stack:** TypeScript, OpenAI SDK (via existing LLMAgent), Zod for Critic JSON validation, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-03-13-multi-agent-pipeline-design.md`

---

## Chunk 1: Foundation + RuleGuard

### Task 1: Pipeline interfaces and shared types

**Files:**
- Create: `src/lib/agents/pipeline.ts`
- Test: `__tests__/lib/agents/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/agents/pipeline.test.ts
import { describe, it, expect } from "vitest";
import type { ChapterContext, PipelineAgent, RuleIssue, Snapshot } from "@/lib/agents/pipeline";

describe("Pipeline types", () => {
  it("ChapterContext has all required fields", () => {
    const ctx: ChapterContext = {
      seed: {} as any,
      chapterNumber: 1,
      previousSummaries: [],
      text: "test",
      snapshots: [],
      bestScore: 0,
      ruleIssues: [],
      critiqueHistory: [],
      totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
    };
    expect(ctx.text).toBe("test");
    expect(ctx.ruleIssues).toEqual([]);
    expect(ctx.snapshots).toEqual([]);
  });

  it("Snapshot stores text, score, and iteration", () => {
    const snap: Snapshot = { text: "hello", score: 0.8, iteration: 0 };
    expect(snap.iteration).toBe(0);
  });

  it("RuleIssue has type, position, detail", () => {
    const issue: RuleIssue = { type: "ending_repeat", position: 3, detail: "~였다 3연속" };
    expect(issue.type).toBe("ending_repeat");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/agents/pipeline.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement pipeline.ts**

```typescript
// src/lib/agents/pipeline.ts
// NOTE: LifecycleEvent is defined HERE (not in chapter-lifecycle.ts) to avoid circular imports.
// chapter-lifecycle.ts will re-export it from here for backward compatibility.
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import type { ChapterBlueprint } from "@/lib/schema/planning";
import type { TokenUsage } from "./types";

export interface RuleIssue {
  type: "ending_repeat" | "sentence_start_repeat" | "banned_expression";
  position: number;
  detail: string;
}

export interface CriticIssue {
  startParagraph: number;
  endParagraph: number;
  category: "characterVoice" | "rhythm" | "cliche" | "narrative" | "repetition";
  description: string;
  severity: "critical" | "major" | "minor";
  suggestedFix: string;
}

export interface CriticReport {
  overallScore: number;
  dimensions: Record<string, number>;
  issues: CriticIssue[];
}

export interface Snapshot {
  text: string;
  score: number;
  iteration: number;
}

export interface ChapterContext {
  seed: NovelSeed;
  chapterNumber: number;
  blueprint?: ChapterBlueprint;
  previousSummaries: ChapterSummary[];

  text: string;
  snapshots: Snapshot[];
  bestScore: number;

  ruleIssues: RuleIssue[];
  critiqueHistory: CriticReport[];
  totalUsage: TokenUsage;
}

export interface PipelineAgent {
  name: string;
  run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent>;
}

// LifecycleEvent — moved here from chapter-lifecycle.ts
export type LifecycleEvent =
  | { type: "stage_change"; stage: string }
  | { type: "chunk"; content: string }
  | { type: "usage"; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number }
  | { type: "evaluation"; report: CriticReport; overall_score: number }
  | { type: "retry"; attempt: number; reason: string; score: number }
  | { type: "replace_text"; content: string }
  | { type: "patch"; paragraphId: number; content: string }
  | { type: "revert"; reason: string; to: number }
  | { type: "complete"; summary: ChapterSummary; final_score: number }
  | { type: "error"; message: string }
  | { type: "done" };

export function accumulateUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/seungahjung/Documents/opensource/kakao-novel-generator/web && npx vitest run __tests__/lib/agents/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/pipeline.ts __tests__/lib/agents/pipeline.test.ts
git commit -m "feat: add PipelineAgent interface and shared ChapterContext types"
```

---

### Task 2: RuleGuard Agent — sanitize + dedup + detect

**Files:**
- Create: `src/lib/agents/rule-guard.ts`
- Test: `__tests__/lib/agents/rule-guard.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/agents/rule-guard.test.ts
import { describe, it, expect } from "vitest";
import { sanitize, deduplicateParagraphs, detectEndingRepeat, detectSentenceStartRepeat } from "@/lib/agents/rule-guard";

describe("sanitize", () => {
  it("removes --- 수정 대상 --- markers", () => {
    const text = "좋은 문장.\n\n--- 수정 대상 ---\n다른 문장.";
    expect(sanitize(text)).not.toContain("수정 대상");
  });

  it("removes 수정: prefix lines", () => {
    const text = "정상 문장.\n수정: 이 부분을 고쳤습니다.\n다음 문장.";
    expect(sanitize(text)).not.toContain("수정:");
  });

  it("removes editor comment lines", () => {
    const text = "본문.\n[편집자 노트: 여기를 수정함]\n이어서.";
    expect(sanitize(text)).not.toContain("편집자 노트");
  });
});

describe("deduplicateParagraphs", () => {
  it("removes exact duplicate paragraphs", () => {
    const text = "첫 번째 문단.\n\n두 번째 문단.\n\n첫 번째 문단.";
    const result = deduplicateParagraphs(text);
    const paragraphs = result.split("\n\n");
    expect(paragraphs).toHaveLength(2);
  });

  it("removes near-duplicate paragraphs (same prefix 50 chars)", () => {
    const prefix = "복도를 지나며 나는 마법사의 음모에 대한 첫 단서를 찾을 수 있을 것이라는 희망을 품었다.";
    const text = `${prefix} 첫 번째 버전.\n\n다른 문단.\n\n${prefix} 두 번째 버전.`;
    const result = deduplicateParagraphs(text);
    expect(result.split("\n\n")).toHaveLength(2);
  });

  it("keeps non-duplicate paragraphs intact", () => {
    const text = "문단 하나.\n\n문단 둘.\n\n문단 셋.";
    expect(deduplicateParagraphs(text).split("\n\n")).toHaveLength(3);
  });
});

describe("detectEndingRepeat", () => {
  it("detects 3 consecutive same endings", () => {
    const text = "그는 걸었다. 그녀는 웃었다. 바람이 불었다.";
    const issues = detectEndingRepeat(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe("ending_repeat");
  });

  it("does not flag varied endings", () => {
    const text = "그는 걸었다. 바람이 분다. 꽃이 피었지.";
    const issues = detectEndingRepeat(text);
    expect(issues).toHaveLength(0);
  });
});

describe("detectSentenceStartRepeat", () => {
  it("detects 3 consecutive same starts", () => {
    const text = "그는 걸었다. 그는 멈췄다. 그는 돌아봤다.";
    const issues = detectSentenceStartRepeat(text);
    expect(issues.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/agents/rule-guard.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement rule-guard.ts**

Create `src/lib/agents/rule-guard.ts` with the following exports:
- `sanitize(text: string): string` — removes meta markers, editor comments
- `deduplicateParagraphs(text: string): string` — removes duplicate paragraphs by prefix comparison
- `detectEndingRepeat(text: string): RuleIssue[]` — detects 3+ consecutive same sentence endings
- `detectSentenceStartRepeat(text: string): RuleIssue[]` — detects 3+ consecutive same sentence starts
- `class RuleGuardAgent implements PipelineAgent` — orchestrates all checks, mutates ctx

Implementation notes:
- Use Korean sentence splitter: split on `[.!?]\s` but also handle `다.`, `요.`, `지.` endings
- Ending extraction: take last 2 chars of each sentence (e.g., "었다", "는다", "했다")
- Sentence start: take first 2 characters of each sentence
- `sanitize()` regexes: `/^---\s*(수정|편집|수정 대상|수정 지시).*---$/gm`, `/^수정:\s*.*/gm`, `/^\[편집.*\]$/gm`
- Reuse `segmentText()` from `segmenter.ts` for paragraph splitting in dedup

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/agents/rule-guard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/rule-guard.ts __tests__/lib/agents/rule-guard.test.ts
git commit -m "feat: add RuleGuard agent with sanitize, dedup, and repetition detection"
```

---

## Chunk 2: Critic + Surgeon

### Task 3: Critic Agent — LLM evaluation with structured JSON output

**Files:**
- Create: `src/lib/agents/critic-agent.ts`
- Create: `src/lib/prompts/critic-prompt.ts`
- Test: `__tests__/lib/agents/critic-agent.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/agents/critic-agent.test.ts
import { describe, it, expect } from "vitest";
import { parseCriticResponse, computeOverallScore, buildCriticPrompt } from "@/lib/agents/critic-agent";
import type { CriticReport, CriticIssue } from "@/lib/agents/pipeline";

describe("parseCriticResponse", () => {
  it("parses valid JSON response into CriticReport", () => {
    const json = JSON.stringify({
      dimensions: { narrative: 0.8, characterVoice: 0.7, rhythm: 0.6, hookEnding: 0.9, immersion: 0.5 },
      issues: [{
        startParagraph: 2, endParagraph: 3, category: "characterVoice",
        description: "말투 불일치", severity: "major", suggestedFix: "반말로 수정"
      }]
    });
    const report = parseCriticResponse(json);
    expect(report).not.toBeNull();
    expect(report!.dimensions.narrative).toBe(0.8);
    expect(report!.issues).toHaveLength(1);
  });

  it("returns null for invalid JSON", () => {
    expect(parseCriticResponse("not json")).toBeNull();
  });

  it("filters out-of-bounds paragraph indices", () => {
    const json = JSON.stringify({
      dimensions: { narrative: 0.8, characterVoice: 0.7, rhythm: 0.6, hookEnding: 0.9, immersion: 0.5 },
      issues: [{
        startParagraph: 99, endParagraph: 100, category: "narrative",
        description: "test", severity: "major", suggestedFix: "test"
      }]
    });
    const report = parseCriticResponse(json, 10); // only 10 paragraphs
    expect(report!.issues).toHaveLength(0);
  });
});

describe("computeOverallScore", () => {
  it("applies correct weights", () => {
    const dims = { narrative: 1.0, characterVoice: 1.0, rhythm: 1.0, hookEnding: 1.0, immersion: 1.0 };
    expect(computeOverallScore(dims)).toBeCloseTo(1.0);
  });

  it("applies weights: 0.25 narrative, 0.25 voice, 0.20 rhythm, 0.15 hook, 0.15 immersion", () => {
    const dims = { narrative: 0.8, characterVoice: 0.6, rhythm: 0.4, hookEnding: 1.0, immersion: 0.0 };
    const expected = 0.8*0.25 + 0.6*0.25 + 0.4*0.20 + 1.0*0.15 + 0.0*0.15;
    expect(computeOverallScore(dims)).toBeCloseTo(expected);
  });
});

describe("buildCriticPrompt", () => {
  it("includes text and rule issues in prompt", () => {
    const prompt = buildCriticPrompt("소설 본문", [
      { type: "ending_repeat", position: 3, detail: "~였다 3연속" }
    ], { genre: "현대 판타지" } as any);
    expect(prompt).toContain("소설 본문");
    expect(prompt).toContain("~였다 3연속");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/agents/critic-agent.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement critic-agent.ts and critic-prompt.ts**

`src/lib/prompts/critic-prompt.ts`:
- `getCriticSystemPrompt(genre: string): string` — system prompt for Critic role
- Includes 5 evaluation dimensions with descriptions
- Includes repetition detection criteria
- Requires JSON output format matching CriticReport

`src/lib/agents/critic-agent.ts`:
- `parseCriticResponse(raw: string, paragraphCount?: number): CriticReport | null` — JSON parse + bounds check
- `computeOverallScore(dimensions: Record<string, number>): number` — weighted average
- `buildCriticPrompt(text: string, ruleIssues: RuleIssue[], seed: NovelSeed): string` — user prompt
- `class CriticAgent` with:
  - `evaluate(ctx: ChapterContext): Promise<CriticReport>` — full evaluation via callStructured or call + parse
  - `quickScore(ctx: ChapterContext): Promise<number>` — score-only call (max_tokens 200)

Implementation notes:
- Use `getAgent().call()` for evaluate and quickScore (not callStructured — we handle parsing ourselves for flexibility)
- quickScore prompt: "다음 소설 텍스트의 품질을 5개 차원으로 평가하세요. JSON만 출력: {dimensions: {narrative, characterVoice, rhythm, hookEnding, immersion}} 각 0~1 점수"
- On JSON parse failure: retry 1 time, then return null (Quality Loop handles this)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/agents/critic-agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/critic-agent.ts src/lib/prompts/critic-prompt.ts __tests__/lib/agents/critic-agent.test.ts
git commit -m "feat: add Critic agent with LLM evaluation and structured JSON output"
```

---

### Task 4: Surgeon Agent — targeted range editing

**Files:**
- Create: `src/lib/agents/surgeon-agent.ts`
- Create: `src/lib/prompts/surgeon-prompt.ts`
- Test: `__tests__/lib/agents/surgeon-agent.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/agents/surgeon-agent.test.ts
import { describe, it, expect } from "vitest";
import { buildSurgeonPrompt, applyPatch } from "@/lib/agents/surgeon-agent";
import { segmentText, reassemble } from "@/lib/agents/segmenter";

describe("buildSurgeonPrompt", () => {
  it("includes target text and surrounding context", () => {
    const prompt = buildSurgeonPrompt(
      "대상 문단", "이전 문단", "다음 문단",
      "말투 불일치", "반말로 수정", "현대 판타지"
    );
    expect(prompt).toContain("대상 문단");
    expect(prompt).toContain("이전 문단");
    expect(prompt).toContain("다음 문단");
    expect(prompt).toContain("말투 불일치");
    expect(prompt).not.toContain("---"); // No marker syntax
  });

  it("handles null prev/next context", () => {
    const prompt = buildSurgeonPrompt("대상", null, null, "이유", "방향", "로맨스");
    expect(prompt).toContain("대상");
    expect(prompt).not.toContain("null");
  });
});

describe("applyPatch", () => {
  it("replaces target range and reassembles", () => {
    const text = "문단0\n\n문단1\n\n문단2\n\n문단3";
    const result = applyPatch(text, 1, 2, "수정된 문단1\n\n수정된 문단2");
    expect(result).toContain("문단0");
    expect(result).toContain("수정된 문단1");
    expect(result).toContain("수정된 문단2");
    expect(result).toContain("문단3");
    expect(result).not.toContain("문단1\n\n문단2\n\n문단3"); // original range gone
  });

  it("ignores patch if patched text is less than 50% of original", () => {
    const text = "문단0\n\n아주 긴 문단 내용이 여기에 있습니다 충분한 길이.";
    const result = applyPatch(text, 1, 1, "짧"); // too short
    expect(result).toContain("아주 긴 문단"); // original preserved
  });

  it("ignores patch if empty string", () => {
    const text = "문단0\n\n문단1";
    const result = applyPatch(text, 1, 1, "");
    expect(result).toContain("문단1"); // original preserved
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/agents/surgeon-agent.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement surgeon-agent.ts and surgeon-prompt.ts**

`src/lib/prompts/surgeon-prompt.ts`:
- `getSurgeonSystemPrompt(): string` — "당신은 소설의 특정 구간만 수정하는 편집자입니다..."

`src/lib/agents/surgeon-agent.ts`:
- `buildSurgeonPrompt(target, prev, next, description, suggestedFix, genre): string` — natural language, NO markers
- `applyPatch(text, startParagraph, endParagraph, patchedText): string` — replaces range, safety checks
- `class SurgeonAgent` with:
  - `fix(ctx: ChapterContext, issue: CriticIssue): AsyncGenerator<string, TokenUsage>` — streams patched text

Implementation notes:
- Uses `segmentText()` from `segmenter.ts` to split paragraphs
- After patch, calls `sanitize()` from `rule-guard.ts` on the patched text
- `applyPatch` returns original text if patch is empty or < 50% length of original range

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/agents/surgeon-agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/surgeon-agent.ts src/lib/prompts/surgeon-prompt.ts __tests__/lib/agents/surgeon-agent.test.ts
git commit -m "feat: add Surgeon agent for targeted paragraph-range editing"
```

---

## Chunk 3: Quality Loop + Polisher

### Task 5: Quality Loop — Critic↔Surgeon iteration with rollback

**Files:**
- Create: `src/lib/agents/quality-loop.ts`
- Test: `__tests__/lib/agents/quality-loop.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/agents/quality-loop.test.ts
import { describe, it, expect, vi } from "vitest";
import { QualityLoop } from "@/lib/agents/quality-loop";
import type { ChapterContext, CriticReport, CriticIssue } from "@/lib/agents/pipeline";

function makeCtx(text = "문단0\n\n문단1\n\n문단2"): ChapterContext {
  return {
    seed: { world: { genre: "현대 판타지" }, characters: [], foreshadowing: [], arcs: [], chapter_outlines: [], style: {} } as any,
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

async function collectEvents(gen: AsyncGenerator<any>) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("QualityLoop", () => {
  it("stops when score meets threshold on first evaluation", async () => {
    const critic = { evaluate: vi.fn().mockResolvedValue(makeReport(0.9)), quickScore: vi.fn() };
    const surgeon = { fix: vi.fn() };
    const loop = new QualityLoop(critic as any, surgeon as any);
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
    const surgeon = { fix: surgeonFix };
    const loop = new QualityLoop(critic as any, surgeon as any);
    const ctx = makeCtx();
    await collectEvents(loop.run(ctx));
    expect(surgeonFix).toHaveBeenCalledTimes(1); // only major, not minor
  });

  it("reverts when score drops after surgery", async () => {
    const critic = {
      evaluate: vi.fn().mockResolvedValue(makeReport(0.6, [majorIssue])),
      quickScore: vi.fn().mockResolvedValue(0.5), // score dropped
    };
    const surgeonFix = vi.fn(async function*() { yield "bad text"; return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 }; });
    const surgeon = { fix: surgeonFix };
    const loop = new QualityLoop(critic as any, surgeon as any);
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
    const surgeon = { fix: surgeonFix };
    const loop = new QualityLoop(critic as any, surgeon as any);
    const ctx = makeCtx();
    await collectEvents(loop.run(ctx));
    expect(critic.evaluate.mock.calls.length).toBeLessThanOrEqual(6); // initial + max 5
  });

  it("saves initial snapshot at iteration 0", async () => {
    const critic = {
      evaluate: vi.fn().mockResolvedValue(makeReport(0.9)),
      quickScore: vi.fn(),
    };
    const loop = new QualityLoop(critic as any, {} as any);
    const ctx = makeCtx();
    await collectEvents(loop.run(ctx));
    expect(ctx.snapshots[0]).toEqual({ text: ctx.text, score: 0.9, iteration: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/agents/quality-loop.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement quality-loop.ts**

```typescript
// src/lib/agents/quality-loop.ts
import type { PipelineAgent, ChapterContext, CriticReport } from "./pipeline";
import type { LifecycleEvent } from "./chapter-lifecycle";
import { CriticAgent } from "./critic-agent";
import { SurgeonAgent } from "./surgeon-agent";
import { sanitize } from "./rule-guard";
import { segmentText } from "./segmenter";
import { accumulateUsage } from "./pipeline";

const MAX_ITERATIONS = 5;
const QUALITY_THRESHOLD = 0.85;

export class QualityLoop implements PipelineAgent {
  name = "quality-loop";
  private critic: CriticAgent;
  private surgeon: SurgeonAgent;

  constructor(critic?: CriticAgent, surgeon?: SurgeonAgent) {
    this.critic = critic ?? new CriticAgent();
    this.surgeon = surgeon ?? new SurgeonAgent();
  }

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    // Initial evaluation + snapshot
    yield { type: "stage_change", stage: "critiquing" };
    const initialReport = await this.critic.evaluate(ctx);
    if (!initialReport) return; // JSON parse failure

    ctx.bestScore = initialReport.overallScore;
    ctx.snapshots.push({ text: ctx.text, score: initialReport.overallScore, iteration: 0 });
    ctx.critiqueHistory.push(initialReport);
    yield { type: "evaluation", result: { /* ... */ }, overall_score: initialReport.overallScore } as any;

    if (initialReport.overallScore >= QUALITY_THRESHOLD) return;

    let prevScore = initialReport.overallScore;
    let currentReport = initialReport;

    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      const actionable = currentReport.issues.filter(iss => iss.severity !== "minor");
      if (actionable.length === 0) break;

      // Save snapshot before surgery
      ctx.snapshots.push({ text: ctx.text, score: prevScore, iteration: i });

      // Surgeon fixes
      yield { type: "stage_change", stage: "surgery" };
      for (const issue of actionable) {
        const paragraphs = segmentText(ctx.text);
        if (issue.startParagraph >= paragraphs.length) continue; // bounds check

        // ... stream surgeon fix, apply patch, sanitize
      }

      ctx.text = sanitize(ctx.text);

      // Quick score check
      const newScore = await this.critic.quickScore(ctx);
      if (newScore === null || newScore < prevScore) {
        // Revert to best snapshot
        const best = ctx.snapshots.reduce((a, b) => a.score > b.score ? a : b);
        ctx.text = best.text;
        ctx.bestScore = best.score;
        yield { type: "replace_text", content: ctx.text };
        break;
      }

      ctx.bestScore = newScore;
      prevScore = newScore;

      if (newScore >= QUALITY_THRESHOLD) break;

      // Full re-evaluate for next iteration
      yield { type: "stage_change", stage: "critiquing" };
      const nextReport = await this.critic.evaluate(ctx);
      if (!nextReport) break;
      currentReport = nextReport;
      ctx.critiqueHistory.push(nextReport);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/agents/quality-loop.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/quality-loop.ts __tests__/lib/agents/quality-loop.test.ts
git commit -m "feat: add Quality Loop with Critic-Surgeon iteration and snapshot rollback"
```

---

### Task 6: Polisher Agent — final style pass

**Files:**
- Create: `src/lib/agents/polisher-agent.ts`
- Create: `src/lib/prompts/polisher-prompt.ts`
- Test: `__tests__/lib/agents/polisher-agent.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/agents/polisher-agent.test.ts
import { describe, it, expect } from "vitest";
import { buildPolisherPrompt } from "@/lib/agents/polisher-agent";
import type { CriticReport } from "@/lib/agents/pipeline";

describe("buildPolisherPrompt", () => {
  it("includes text and minor issues from last CriticReport", () => {
    const report: CriticReport = {
      overallScore: 0.8,
      dimensions: { narrative: 0.8, characterVoice: 0.8, rhythm: 0.7, hookEnding: 0.9, immersion: 0.8 },
      issues: [
        { startParagraph: 1, endParagraph: 1, category: "rhythm", description: "어미 반복", severity: "minor", suggestedFix: "어미 변경" },
        { startParagraph: 3, endParagraph: 3, category: "narrative", description: "큰 문제", severity: "major", suggestedFix: "수정" },
      ],
    };
    const prompt = buildPolisherPrompt("소설 본문", report, "현대 판타지");
    expect(prompt).toContain("소설 본문");
    expect(prompt).toContain("어미 반복"); // minor issue included
    expect(prompt).not.toContain("큰 문제"); // major issue excluded
  });

  it("works with no critique history", () => {
    const prompt = buildPolisherPrompt("본문", null, "로맨스");
    expect(prompt).toContain("본문");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/agents/polisher-agent.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement polisher-agent.ts and polisher-prompt.ts**

`src/lib/prompts/polisher-prompt.ts`:
- `getPolisherSystemPrompt(genre: string): string` — "내용과 스토리는 절대 바꾸지 마세요. 문체만 다듬으세요."
- Includes: 어미 반복 제거, 리듬 조절, 캐릭터 말투 미세 조정

`src/lib/agents/polisher-agent.ts`:
- `buildPolisherPrompt(text: string, lastReport: CriticReport | null, genre: string): string`
- `class PolisherAgent implements PipelineAgent` — calls LLM once, replaces ctx.text
- Extracts minor issues from last CriticReport in ctx.critiqueHistory

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/agents/polisher-agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/polisher-agent.ts src/lib/prompts/polisher-prompt.ts __tests__/lib/agents/polisher-agent.test.ts
git commit -m "feat: add Polisher agent for final style refinement"
```

---

## Chunk 4: Writer Agent + Pipeline Integration

### Task 7: Writer Agent — extract from lifecycle + add self-review

**Files:**
- Create: `src/lib/agents/writer-agent.ts`
- Test: `__tests__/lib/agents/writer-agent.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// __tests__/lib/agents/writer-agent.test.ts
import { describe, it, expect } from "vitest";
import { handleSelfReviewResponse } from "@/lib/agents/writer-agent";

describe("handleSelfReviewResponse", () => {
  it("returns original text for NO_CHANGES response", () => {
    const result = handleSelfReviewResponse("NO_CHANGES", "원본 텍스트");
    expect(result).toBe("원본 텍스트");
  });

  it("returns new text when self-review provides revision", () => {
    const result = handleSelfReviewResponse("수정된 텍스트 여기", "원본 텍스트");
    expect(result).toBe("수정된 텍스트 여기");
  });

  it("returns original if revision is less than 70% of original length", () => {
    const original = "아주 긴 원본 텍스트가 여기에 있습니다. 충분한 길이를 가지고 있어야 합니다.";
    const short = "짧은";
    const result = handleSelfReviewResponse(short, original);
    expect(result).toBe(original);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/agents/writer-agent.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement writer-agent.ts**

Extract writer logic from `chapter-lifecycle.ts` lines 263-395 into `WriterAgent`:
- Phase 1: generate raw text (reuse existing prompt building + streaming logic)
- Phase 1.5: continue writing if text < MIN_CHAR_COUNT (reuse existing continuation logic)
- Phase 2: self-review call with NO_CHANGES handling
- `handleSelfReviewResponse(response: string, original: string): string` — exported for testing

Self-review prompt added to `prompts/writer-system-prompt.ts`:
```typescript
export function getSelfReviewPrompt(): string {
  return "방금 쓴 초고를 읽고 확인하세요: (1) 캐릭터 말투가 설정과 일치하는가 (2) 문장 구조 반복이 있는가 (3) 장면 전환이 자연스러운가. 문제가 있으면 수정한 전체 본문을 출력하세요. 문제가 없으면 NO_CHANGES만 출력하세요.";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/agents/writer-agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/writer-agent.ts src/lib/prompts/writer-system-prompt.ts __tests__/lib/agents/writer-agent.test.ts
git commit -m "feat: add Writer agent with self-review phase"
```

---

### Task 8: Refactor chapter-lifecycle.ts — pipeline runner

**Files:**
- Modify: `src/lib/agents/chapter-lifecycle.ts`
- Test: `__tests__/lib/agents/pipeline-integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// __tests__/lib/agents/pipeline-integration.test.ts
import { describe, it, expect, vi } from "vitest";

describe("Pipeline integration", () => {
  it("runChapterLifecycle yields events in correct order", async () => {
    // Mock LLM calls to avoid real API
    // Verify event sequence: stage_change(writing) → stage_change(rule_check) → stage_change(critiquing) → ... → complete → done
  });

  it("preserves existing ChapterLifecycleOptions interface", async () => {
    // Verify that existing callers won't break
    // ChapterLifecycleOptions should still accept same fields
  });

  it("LifecycleEvent type includes new stages", async () => {
    // Verify new stage values are accepted
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/agents/pipeline-integration.test.ts`
Expected: FAIL

- [ ] **Step 3: Refactor chapter-lifecycle.ts**

Replace the body of `runChapterLifecycle()` with:

```typescript
export async function* runChapterLifecycle(
  options: ChapterLifecycleOptions,
): AsyncGenerator<LifecycleEvent> {
  const ctx: ChapterContext = {
    seed: options.seed,
    chapterNumber: options.chapterNumber,
    blueprint: options.blueprint,
    previousSummaries: options.previousSummaries,
    text: "",
    snapshots: [],
    bestScore: 0,
    ruleIssues: [],
    critiqueHistory: [],
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
  };

  const pipeline: PipelineAgent[] = [
    new WriterAgent(),
    new RuleGuardAgent(),
    new QualityLoop(),
    new PolisherAgent(),
  ];

  for (const agent of pipeline) {
    yield* agent.run(ctx);
  }

  // Summary extraction (unchanged)
  const outline = options.seed.chapter_outlines.find(o => o.chapter_number === options.chapterNumber);
  const title = options.blueprint?.title || outline?.title || `${options.chapterNumber}화`;
  const summary = extractSummaryRuleBased(options.chapterNumber, title, ctx.text);
  summary.style_score = ctx.bestScore;

  yield { type: "complete", summary, final_score: ctx.bestScore };
  yield { type: "done" };
}
```

Also update `LifecycleEvent` type to include new stage values in the union.

In `chapter-lifecycle.ts` only: remove unused imports (`runEditor`, `locateIssues`, `editSegment`, `selectStrategy`, `applyImprovement`, `evaluateStyle`, `evaluateConsistency`, `evaluatePacing`, `evaluateHybrid`). Keep `segmentText` — it's still used by QualityLoop via Surgeon. Re-export `LifecycleEvent` from `pipeline.ts` for backward compatibility: `export type { LifecycleEvent } from "./pipeline";`

- [ ] **Step 4: Run ALL tests**

Run: `npx vitest run`
Expected: All pipeline tests PASS. Existing tests should still pass (check for any breakage from removed imports).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/chapter-lifecycle.ts __tests__/lib/agents/pipeline-integration.test.ts
git commit -m "refactor: replace monolithic lifecycle with pipeline runner"
```

---

### Task 9: Cleanup — delete replaced files and update imports

**Files:**
- Delete: `src/lib/agents/editor-agent.ts`
- Delete: `src/lib/agents/segment-editor.ts`
- Delete: `src/lib/agents/improver.ts`
- Delete: `src/lib/evaluators/issue-locator.ts`
- Delete: `src/lib/evaluators/hybrid-evaluator.ts`
- Delete: `src/lib/evaluators/llm-evaluator.ts`
- Delete: `src/lib/prompts/editor-system-prompt.ts`
- Delete related tests: `__tests__/lib/agents/segment-editor.test.ts`, `__tests__/lib/agents/segment-patcher-integration.test.ts`, `__tests__/lib/evaluators/issue-locator.test.ts`
- Keep but don't move yet: `src/lib/evaluators/style.ts`, `src/lib/evaluators/pacing.ts`, `src/lib/evaluators/consistency.ts` — these are imported by RuleGuard. The functions stay in their original files; RuleGuard imports from them. Migration to a single file is deferred.

- [ ] **Step 1: Delete files**

```bash
rm src/lib/agents/editor-agent.ts
rm src/lib/agents/segment-editor.ts
rm src/lib/agents/improver.ts
rm src/lib/evaluators/issue-locator.ts
rm src/lib/evaluators/hybrid-evaluator.ts
rm src/lib/evaluators/llm-evaluator.ts
rm src/lib/prompts/editor-system-prompt.ts
rm __tests__/lib/agents/segment-editor.test.ts
rm __tests__/lib/agents/segment-patcher-integration.test.ts
rm __tests__/lib/evaluators/issue-locator.test.ts
```

- [ ] **Step 2: Check for broken imports**

Run: `npx tsc --noEmit` or `npx vitest run`
Fix any remaining import references to deleted files.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All PASS (deleted test files no longer run, remaining tests pass)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove replaced editor, segment-editor, improver, and old evaluators"
```

---

## Chunk 5: Smoke Test

### Task 10: E2E verification

- [ ] **Step 1: Run full test suite one final time**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 2: Manual smoke test (if dev server running)**

Start: `npm run dev -- -p 3001`
Generate a chapter and verify:
- No `---` markers in output
- No `수정:` text in output
- No duplicate paragraphs
- Quality loop events appear in UI

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address smoke test findings"
```
