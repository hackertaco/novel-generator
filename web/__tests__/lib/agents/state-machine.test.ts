import { describe, it, expect } from "vitest";
import {
  resolveTransition,
  decideValidation,
  findWeakestDimensions,
  REPAIR_INSTRUCTIONS,
  DEFAULT_LIMITS,
  type StateMachineContext,
  type ChapterState,
  type ValidationVerdict,
  type TransitionLimits,
  type WeakDimension,
} from "@/lib/agents/state-machine";
import type { ChapterContext, RuleIssue } from "@/lib/agents/pipeline";
import type { NovelSeed } from "@/lib/schema/novel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChapterCtx(): ChapterContext {
  return {
    seed: {
      world: { genre: "판타지", name: "테스트", time_period: "중세", rules: [], key_locations: {} },
      characters: [],
      foreshadowing: [],
      arcs: [],
      chapter_outlines: [],
      style: {},
    } as unknown as NovelSeed,
    chapterNumber: 1,
    previousSummaries: [],
    text: "테스트 본문",
    snapshots: [],
    bestScore: 0,
    ruleIssues: [],
    critiqueHistory: [],
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 },
  };
}

function makeSMCtx(
  currentState: ChapterState,
  overrides?: Partial<Omit<StateMachineContext, "currentState">>,
): StateMachineContext {
  return {
    currentState,
    chapter: makeChapterCtx(),
    regenerationCount: 0,
    repairCount: 0,
    limits: { ...DEFAULT_LIMITS },
    transitionLog: [],
    ...overrides,
  };
}

function makeVerdict(
  decision: "pass" | "repair" | "regenerate",
  score = 0.8,
  overrides?: Partial<ValidationVerdict>,
): ValidationVerdict {
  return {
    decision,
    deterministicScore: score,
    worstSeverity: "none",
    ruleIssues: [],
    ...overrides,
  };
}

function makeRuleIssue(severity: "warning" | "error" | "critical" = "error"): RuleIssue {
  return {
    type: "ending_repeat",
    severity,
    position: 0,
    detail: "test issue",
  };
}

// ---------------------------------------------------------------------------
// resolveTransition tests
// ---------------------------------------------------------------------------

describe("resolveTransition", () => {
  it("PLAN → GENERATE", () => {
    const smCtx = makeSMCtx("PLAN");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("GENERATE");
  });

  it("GENERATE → VALIDATE", () => {
    const smCtx = makeSMCtx("GENERATE");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("VALIDATE");
  });

  it("VALIDATE + pass verdict → PASS", () => {
    const smCtx = makeSMCtx("VALIDATE");
    const verdict = makeVerdict("pass", 0.9);
    const result = resolveTransition(smCtx, verdict);
    expect(result.nextState).toBe("PASS");
  });

  it("VALIDATE + repair verdict → REPAIR", () => {
    const smCtx = makeSMCtx("VALIDATE");
    const verdict = makeVerdict("repair", 0.7);
    const result = resolveTransition(smCtx, verdict);
    expect(result.nextState).toBe("REPAIR");
  });

  it("VALIDATE + regenerate verdict → REGENERATE", () => {
    const smCtx = makeSMCtx("VALIDATE");
    const verdict = makeVerdict("regenerate", 0.4);
    const result = resolveTransition(smCtx, verdict);
    expect(result.nextState).toBe("REGENERATE");
  });

  it("VALIDATE + no verdict → PASS (default)", () => {
    const smCtx = makeSMCtx("VALIDATE");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("PASS");
  });

  it("PASS → POLISH", () => {
    const smCtx = makeSMCtx("PASS");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("POLISH");
  });

  it("REPAIR → VALIDATE", () => {
    const smCtx = makeSMCtx("REPAIR");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("VALIDATE");
  });

  it("REGENERATE → GENERATE", () => {
    const smCtx = makeSMCtx("REGENERATE");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("GENERATE");
  });

  it("POLISH → DONE", () => {
    const smCtx = makeSMCtx("POLISH");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("DONE");
  });

  it("DONE → DONE (idempotent)", () => {
    const smCtx = makeSMCtx("DONE");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("DONE");
  });

  it("FAILED → FAILED (idempotent)", () => {
    const smCtx = makeSMCtx("FAILED");
    const result = resolveTransition(smCtx);
    expect(result.nextState).toBe("FAILED");
  });

  // --- Exhaustion fallbacks ---

  it("VALIDATE + regenerate but regeneration exhausted → falls back to REPAIR", () => {
    const smCtx = makeSMCtx("VALIDATE", { regenerationCount: 2 }); // maxRegenerations is 2
    const verdict = makeVerdict("regenerate", 0.4);
    const result = resolveTransition(smCtx, verdict);
    expect(result.nextState).toBe("REPAIR");
    expect(result.reason).toContain("regeneration exhausted");
  });

  it("VALIDATE + regenerate, both exhausted → force PASS", () => {
    const smCtx = makeSMCtx("VALIDATE", { regenerationCount: 2, repairCount: 3 });
    const verdict = makeVerdict("regenerate", 0.4);
    const result = resolveTransition(smCtx, verdict);
    expect(result.nextState).toBe("PASS");
    expect(result.reason).toContain("exhausted");
  });

  it("VALIDATE + repair but repair exhausted → force PASS", () => {
    const smCtx = makeSMCtx("VALIDATE", { repairCount: 3 });
    const verdict = makeVerdict("repair", 0.7);
    const result = resolveTransition(smCtx, verdict);
    expect(result.nextState).toBe("PASS");
    expect(result.reason).toContain("exhausted");
  });

  it("custom limits are respected", () => {
    const limits: TransitionLimits = { maxRegenerations: 1, maxRepairs: 1, regenerateThreshold: 0.6, passThreshold: 0.9 };
    const smCtx = makeSMCtx("VALIDATE", { regenerationCount: 1, limits });
    const verdict = makeVerdict("regenerate", 0.4);
    const result = resolveTransition(smCtx, verdict);
    // regen exhausted (1 >= 1), repair still available (0 < 1)
    expect(result.nextState).toBe("REPAIR");
  });

  it("custom limits — both exhausted with low limits", () => {
    const limits: TransitionLimits = { maxRegenerations: 1, maxRepairs: 1, regenerateThreshold: 0.6, passThreshold: 0.9 };
    const smCtx = makeSMCtx("VALIDATE", { regenerationCount: 1, repairCount: 1, limits });
    const verdict = makeVerdict("regenerate", 0.4);
    const result = resolveTransition(smCtx, verdict);
    expect(result.nextState).toBe("PASS");
  });
});

// ---------------------------------------------------------------------------
// decideValidation tests
// ---------------------------------------------------------------------------

describe("decideValidation", () => {
  const limits = DEFAULT_LIMITS;

  it("high score, no issues → pass", () => {
    const v = decideValidation(0.90, 0, 0, true, 0, limits);
    expect(v.decision).toBe("pass");
    expect(v.deterministicScore).toBe(0.90);
  });

  it("score exactly at pass threshold → pass", () => {
    const v = decideValidation(0.85, 0, 0, true, 0, limits);
    expect(v.decision).toBe("pass");
  });

  it("score just below pass threshold → repair", () => {
    const v = decideValidation(0.84, 0, 0, true, 0, limits);
    expect(v.decision).toBe("repair");
  });

  it("score below regenerate threshold → regenerate", () => {
    const v = decideValidation(0.50, 0, 0, true, 0, limits);
    expect(v.decision).toBe("regenerate");
    expect(v.regenerateReason).toBeDefined();
  });

  it("score exactly at regenerate threshold → repair (not regenerate)", () => {
    const v = decideValidation(0.55, 0, 0, true, 0, limits);
    expect(v.decision).toBe("repair");
  });

  it("critical consistency issues → regenerate regardless of score", () => {
    const v = decideValidation(0.90, 0, 2, true, 0, limits);
    expect(v.decision).toBe("regenerate");
    expect(v.regenerateReason).toContain("critical consistency");
  });

  it("critical rule issues → regenerate", () => {
    const issues = [makeRuleIssue("critical")];
    const v = decideValidation(0.90, 0, 0, true, 0, limits, issues);
    expect(v.decision).toBe("regenerate");
    expect(v.worstSeverity).toBe("critical");
  });

  it("conflict gate failure → repair", () => {
    const v = decideValidation(0.80, 0, 0, false, 0, limits);
    expect(v.decision).toBe("repair");
    expect(v.repairInstructions).toContain("conflict gate");
  });

  it("missing facts → repair", () => {
    const v = decideValidation(0.90, 0, 0, true, 3, limits);
    expect(v.decision).toBe("repair");
    expect(v.repairInstructions).toContain("missing facts");
  });

  it("error rule issues with high score → repair (not pass)", () => {
    const issues = [makeRuleIssue("error")];
    const v = decideValidation(0.90, 1, 0, true, 0, limits, issues);
    expect(v.decision).toBe("repair");
    expect(v.worstSeverity).toBe("error");
  });

  it("warning-only issues with high score → pass", () => {
    const issues = [makeRuleIssue("warning")];
    const v = decideValidation(0.90, 0, 0, true, 0, limits, issues);
    expect(v.decision).toBe("pass");
    expect(v.worstSeverity).toBe("warning");
  });

  it("multiple rule issues at different severities → worst severity wins", () => {
    const issues = [makeRuleIssue("warning"), makeRuleIssue("error"), makeRuleIssue("warning")];
    const v = decideValidation(0.90, 2, 0, true, 0, limits, issues);
    expect(v.worstSeverity).toBe("error");
  });

  it("empty rule issues → severity is none", () => {
    const v = decideValidation(0.90, 0, 0, true, 0, limits, []);
    expect(v.worstSeverity).toBe("none");
  });

  it("conflict gate + missing facts + low score: regenerate wins", () => {
    // Score below regenerateThreshold takes priority
    const v = decideValidation(0.40, 2, 0, false, 5, limits);
    expect(v.decision).toBe("regenerate");
  });

  it("mid-range score with rule issues → repair with instructions", () => {
    const v = decideValidation(0.70, 3, 0, true, 0, limits);
    expect(v.decision).toBe("repair");
    expect(v.repairInstructions).toContain("rule issues");
    expect(v.repairInstructions).toContain("score");
  });

  it("custom thresholds are respected", () => {
    const customLimits: TransitionLimits = { maxRegenerations: 2, maxRepairs: 3, regenerateThreshold: 0.70, passThreshold: 0.95 };
    // Score 0.80 would normally pass with default limits, but with custom passThreshold 0.95 it's a repair
    const v = decideValidation(0.80, 0, 0, true, 0, customLimits);
    expect(v.decision).toBe("repair");
  });

  it("custom regenerate threshold", () => {
    const customLimits: TransitionLimits = { maxRegenerations: 2, maxRepairs: 3, regenerateThreshold: 0.70, passThreshold: 0.95 };
    // Score 0.65 would normally be a repair with default limits, but with custom regenerateThreshold 0.70 it's a regenerate
    const v = decideValidation(0.65, 0, 0, true, 0, customLimits);
    expect(v.decision).toBe("regenerate");
  });

  // Edge cases
  it("score 0 → regenerate", () => {
    const v = decideValidation(0, 0, 0, true, 0, limits);
    expect(v.decision).toBe("regenerate");
  });

  it("score 1.0 → pass", () => {
    const v = decideValidation(1.0, 0, 0, true, 0, limits);
    expect(v.decision).toBe("pass");
  });

  it("all problems at once: critical consistency overrides everything", () => {
    const issues = [makeRuleIssue("error")];
    const v = decideValidation(0.90, 5, 1, false, 10, limits, issues);
    expect(v.decision).toBe("regenerate");
    expect(v.regenerateReason).toContain("critical consistency");
  });
});

// ---------------------------------------------------------------------------
// findWeakestDimensions tests
// ---------------------------------------------------------------------------

describe("findWeakestDimensions", () => {
  function makeScores(overrides: Partial<Record<string, number>> = {}): any {
    const base: Record<string, number> = {
      rhythm: 0.8,
      hookEnding: 0.8,
      characterVoice: 0.8,
      dialogueRatio: 0.8,
      lengthScore: 0.8,
      antiRepetition: 0.8,
      sensoryDiversity: 0.8,
      narrative: 0.8,
      immersion: 0.8,
      narrativeInformation: 0.8,
      engagement: 0.8,
      loopAvoidance: 0.8,
      dialogueQuality: 0.8,
      sentimentArc: 0.8,
      curiosityGap: 0.8,
      emotionalImpact: 0.8,
      originality: 0.8,
      pageTurner: 0.8,
      overall: 0.8,
      details: {},
    };
    return { ...base, ...overrides };
  }

  it("returns exactly N weakest dimensions", () => {
    const scores = makeScores({ rhythm: 0.1, hookEnding: 0.2, narrative: 0.3 });
    const weak = findWeakestDimensions(scores, 3);
    expect(weak).toHaveLength(3);
  });

  it("returns dimensions sorted by weighted score (ascending)", () => {
    // narrative weight=0.08, rhythm weight=0.05
    // narrative: 0.1 * 0.08 = 0.008; rhythm: 0.1 * 0.05 = 0.005
    const scores = makeScores({ rhythm: 0.1, narrative: 0.1 });
    const weak = findWeakestDimensions(scores, 2);
    // rhythm has lower weighted score so it should come first
    expect(weak[0].dimension).toBe("rhythm");
    expect(weak[1].dimension).toBe("narrative");
  });

  it("high-weight dimensions rank lower when their score is bad", () => {
    // narrativeInformation has weight 0.12 — even a moderate low score dominates
    const scores = makeScores({ narrativeInformation: 0.05, sensoryDiversity: 0.05 });
    const weak = findWeakestDimensions(scores, 2);
    // sensoryDiversity: 0.05*0.02=0.001, narrativeInformation: 0.05*0.12=0.006
    expect(weak[0].dimension).toBe("sensoryDiversity");
    expect(weak[1].dimension).toBe("narrativeInformation");
  });

  it("each weak dimension has a repair instruction", () => {
    const scores = makeScores({ rhythm: 0.1, hookEnding: 0.1, originality: 0.1 });
    const weak = findWeakestDimensions(scores, 3);
    for (const wd of weak) {
      expect(wd.instruction).toBeTruthy();
      expect(wd.instruction.length).toBeGreaterThan(5);
    }
  });

  it("includes score and weight in each entry", () => {
    const scores = makeScores({ rhythm: 0.3 });
    const weak = findWeakestDimensions(scores, 1);
    expect(weak[0].score).toBe(0.3);
    expect(weak[0].weight).toBe(0.05);
  });

  it("defaults to 3 when n is not specified", () => {
    const scores = makeScores();
    const weak = findWeakestDimensions(scores);
    expect(weak).toHaveLength(3);
  });

  it("all uniform scores returns valid results", () => {
    const scores = makeScores(); // all 0.8
    const weak = findWeakestDimensions(scores, 3);
    expect(weak).toHaveLength(3);
    // Lowest weighted scores come from lowest-weight dimensions
    const dims = weak.map((w) => w.dimension);
    // dialogueRatio(0.02), lengthScore(0.02), sensoryDiversity(0.02) should be in the result
    expect(dims).toContain("dialogueRatio");
    expect(dims).toContain("lengthScore");
    expect(dims).toContain("sensoryDiversity");
  });
});

// ---------------------------------------------------------------------------
// REPAIR_INSTRUCTIONS coverage
// ---------------------------------------------------------------------------

describe("REPAIR_INSTRUCTIONS", () => {
  it("has instructions for all 18 dimensions", () => {
    const expectedDimensions = [
      "rhythm", "hookEnding", "characterVoice", "dialogueRatio", "lengthScore",
      "antiRepetition", "sensoryDiversity", "narrative", "immersion",
      "narrativeInformation", "engagement", "loopAvoidance", "dialogueQuality",
      "sentimentArc", "curiosityGap", "emotionalImpact", "originality", "pageTurner",
    ];
    for (const dim of expectedDimensions) {
      expect(REPAIR_INSTRUCTIONS[dim]).toBeDefined();
      expect(REPAIR_INSTRUCTIONS[dim].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// StateMachineContext.weakDimensions field
// ---------------------------------------------------------------------------

describe("StateMachineContext weakDimensions field", () => {
  it("weakDimensions is optional and defaults to undefined", () => {
    const smCtx = makeSMCtx("VALIDATE");
    expect(smCtx.weakDimensions).toBeUndefined();
  });

  it("can store WeakDimension array", () => {
    const weakDims: WeakDimension[] = [
      { dimension: "rhythm", score: 0.3, weight: 0.05, instruction: "test" },
      { dimension: "narrative", score: 0.4, weight: 0.08, instruction: "test2" },
    ];
    const smCtx = makeSMCtx("REPAIR", { weakDimensions: weakDims });
    expect(smCtx.weakDimensions).toHaveLength(2);
    expect(smCtx.weakDimensions![0].dimension).toBe("rhythm");
  });
});
