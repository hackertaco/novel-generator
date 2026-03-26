/**
 * ChapterStateMachine — replaces the linear pipeline with a state machine
 * that orchestrates GENERATE → VALIDATE → REPAIR/REGENERATE → POLISH → DONE.
 *
 * Pure functions (resolveTransition, decideValidation) are exported for testing.
 * The ChapterStateMachine class yields the same LifecycleEvent stream that
 * the orchestrator expects, so the caller doesn't need to change.
 */

import type {
  ChapterContext,
  LifecycleEvent,
  RuleIssue,
} from "./pipeline";
import { accumulateUsage } from "./pipeline";
import { WriterAgent } from "./writer-agent";
import { RuleGuardAgent } from "./rule-guard";
import { ConsistencyChecker } from "./consistency-checker";
import { PolisherAgent } from "./polisher-agent";
import { SurgeonAgent } from "./surgeon-agent";
import { sanitize } from "./rule-guard";
import { segmentText } from "./segmenter";
import { computeDeterministicScores } from "../evaluators/deterministic-scorer";
import { validateConflictGate, type ConflictGateResult } from "./conflict-gate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChapterState =
  | "PLAN"
  | "GENERATE"
  | "VALIDATE"
  | "PASS"
  | "REPAIR"
  | "REGENERATE"
  | "POLISH"
  | "DONE"
  | "FAILED";

export type ValidationDecision = "pass" | "repair" | "regenerate";

export interface ValidationVerdict {
  decision: ValidationDecision;
  deterministicScore: number;
  worstSeverity: "critical" | "error" | "warning" | "none";
  ruleIssues: RuleIssue[];
  repairInstructions?: string;
  regenerateReason?: string;
}

export interface TransitionLimits {
  maxRegenerations: number;
  maxRepairs: number;
  regenerateThreshold: number;
  passThreshold: number;
}

export const DEFAULT_LIMITS: TransitionLimits = {
  maxRegenerations: 2,
  maxRepairs: 3,
  regenerateThreshold: 0.55,
  passThreshold: 0.85,
};

export interface StateMachineContext {
  currentState: ChapterState;
  chapter: ChapterContext;
  regenerationCount: number;
  repairCount: number;
  lastVerdict?: ValidationVerdict;
  limits: TransitionLimits;
  transitionLog: Array<{ from: ChapterState; to: ChapterState; reason: string }>;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Determine the next state based on current state, verdict, and limits.
 *
 * Transition rules:
 *   PLAN       → GENERATE
 *   GENERATE   → VALIDATE
 *   VALIDATE   → PASS | REPAIR | REGENERATE  (based on verdict)
 *   PASS       → POLISH
 *   REPAIR     → VALIDATE  (loop back)
 *   REGENERATE → GENERATE  (loop back)
 *   POLISH     → DONE
 *
 * Exhaustion fallbacks:
 *   REGENERATE exhausted → REPAIR (if repairs remain)
 *   Both exhausted       → force PASS
 */
export function resolveTransition(
  smCtx: StateMachineContext,
  verdict?: ValidationVerdict,
): { nextState: ChapterState; reason: string } {
  const { currentState, regenerationCount, repairCount, limits } = smCtx;

  switch (currentState) {
    case "PLAN":
      return { nextState: "GENERATE", reason: "plan complete" };

    case "GENERATE":
      return { nextState: "VALIDATE", reason: "generation complete" };

    case "VALIDATE": {
      if (!verdict) {
        return { nextState: "PASS", reason: "no verdict, default pass" };
      }

      switch (verdict.decision) {
        case "pass":
          return { nextState: "PASS", reason: `score ${verdict.deterministicScore.toFixed(2)} >= pass threshold` };

        case "regenerate": {
          if (regenerationCount < limits.maxRegenerations) {
            return { nextState: "REGENERATE", reason: verdict.regenerateReason || `score ${verdict.deterministicScore.toFixed(2)} below regenerate threshold` };
          }
          // Exhaustion fallback: try repair instead
          if (repairCount < limits.maxRepairs) {
            return { nextState: "REPAIR", reason: "regeneration exhausted, falling back to repair" };
          }
          // Both exhausted: force pass
          return { nextState: "PASS", reason: "both regeneration and repair exhausted, force pass" };
        }

        case "repair": {
          if (repairCount < limits.maxRepairs) {
            return { nextState: "REPAIR", reason: verdict.repairInstructions || "repair needed" };
          }
          // Repair exhausted: force pass
          return { nextState: "PASS", reason: "repair limit exhausted, force pass" };
        }

        default:
          return { nextState: "PASS", reason: "unknown decision, default pass" };
      }
    }

    case "PASS":
      return { nextState: "POLISH", reason: "validation passed" };

    case "REPAIR":
      return { nextState: "VALIDATE", reason: "repair complete, re-validate" };

    case "REGENERATE":
      return { nextState: "GENERATE", reason: "regeneration, re-generate with corrections" };

    case "POLISH":
      return { nextState: "DONE", reason: "polishing complete" };

    case "DONE":
      return { nextState: "DONE", reason: "already done" };

    case "FAILED":
      return { nextState: "FAILED", reason: "already failed" };

    default:
      return { nextState: "FAILED", reason: `unknown state: ${currentState}` };
  }
}

/**
 * Produce a ValidationVerdict from deterministic scoring and rule-check results.
 *
 * Decision logic:
 *   score >= passThreshold AND no critical issues  → pass
 *   score <  regenerateThreshold                   → regenerate
 *   otherwise                                      → repair
 *
 * Critical consistency issues or conflict-gate failures override score-based decisions.
 */
export function decideValidation(
  deterministicScore: number,
  ruleIssueCount: number,
  consistencyCriticalCount: number,
  conflictGatePassed: boolean,
  missingFactCount: number,
  limits: TransitionLimits,
  ruleIssues: RuleIssue[] = [],
): ValidationVerdict {
  // Determine worst severity from rule issues
  let worstSeverity: ValidationVerdict["worstSeverity"] = "none";
  for (const issue of ruleIssues) {
    if (issue.severity === "critical") {
      worstSeverity = "critical";
      break;
    }
    if (issue.severity === "error" && worstSeverity !== "critical") {
      worstSeverity = "error";
    }
    if (issue.severity === "warning" && worstSeverity === "none") {
      worstSeverity = "warning";
    }
  }

  // Critical consistency issues or critical rule issues → regenerate
  if (consistencyCriticalCount > 0 || worstSeverity === "critical") {
    return {
      decision: "regenerate",
      deterministicScore,
      worstSeverity,
      ruleIssues,
      regenerateReason: consistencyCriticalCount > 0
        ? `${consistencyCriticalCount} critical consistency issues`
        : "critical rule issues detected",
    };
  }

  // Score below regenerate threshold → regenerate
  if (deterministicScore < limits.regenerateThreshold) {
    return {
      decision: "regenerate",
      deterministicScore,
      worstSeverity,
      ruleIssues,
      regenerateReason: `deterministic score ${(deterministicScore * 100).toFixed(0)} below regenerate threshold ${(limits.regenerateThreshold * 100).toFixed(0)}`,
    };
  }

  // Conflict gate failure → repair (targeted fix, not full regen)
  if (!conflictGatePassed) {
    return {
      decision: "repair",
      deterministicScore,
      worstSeverity,
      ruleIssues,
      repairInstructions: "conflict gate failed: premature resolution or tension drop detected",
    };
  }

  // Missing facts → repair
  if (missingFactCount > 0) {
    return {
      decision: "repair",
      deterministicScore,
      worstSeverity,
      ruleIssues,
      repairInstructions: `${missingFactCount} missing facts need injection`,
    };
  }

  // Score at or above pass threshold with no critical issues → pass
  if (deterministicScore >= limits.passThreshold && worstSeverity !== "error") {
    return {
      decision: "pass",
      deterministicScore,
      worstSeverity,
      ruleIssues,
    };
  }

  // Middle zone: repair (rule issues or moderate score)
  const repairTargets: string[] = [];
  if (ruleIssueCount > 0) repairTargets.push(`${ruleIssueCount} rule issues`);
  if (deterministicScore < limits.passThreshold) {
    repairTargets.push(`score ${(deterministicScore * 100).toFixed(0)} below pass threshold`);
  }

  return {
    decision: "repair",
    deterministicScore,
    worstSeverity,
    ruleIssues,
    repairInstructions: repairTargets.join("; ") || "quality improvement needed",
  };
}

// ---------------------------------------------------------------------------
// ChapterStateMachine class
// ---------------------------------------------------------------------------

export class ChapterStateMachine {
  private smCtx: StateMachineContext;
  private writerAgent: WriterAgent;
  private ruleGuardAgent: RuleGuardAgent;
  private consistencyChecker: ConsistencyChecker;
  private surgeonAgent: SurgeonAgent;
  private polisherAgent: PolisherAgent;

  /** Correction context accumulated across regenerations */
  private correctionContext: string[] = [];

  constructor(ctx: ChapterContext, limits?: Partial<TransitionLimits>) {
    this.smCtx = {
      currentState: "PLAN",
      chapter: ctx,
      regenerationCount: 0,
      repairCount: 0,
      limits: { ...DEFAULT_LIMITS, ...limits },
      transitionLog: [],
    };

    this.writerAgent = new WriterAgent();
    this.ruleGuardAgent = new RuleGuardAgent();
    this.consistencyChecker = new ConsistencyChecker();
    this.surgeonAgent = new SurgeonAgent();
    this.polisherAgent = new PolisherAgent();
  }

  private transition(nextState: ChapterState, reason: string): void {
    const from = this.smCtx.currentState;
    this.smCtx.transitionLog.push({ from, to: nextState, reason });
    this.smCtx.currentState = nextState;
  }

  async *run(): AsyncGenerator<LifecycleEvent> {
    // PLAN → GENERATE
    this.transition("GENERATE", "start");

    while (
      this.smCtx.currentState !== "DONE" &&
      this.smCtx.currentState !== "FAILED"
    ) {
      switch (this.smCtx.currentState) {
        case "GENERATE":
          yield* this.runGenerate();
          break;

        case "VALIDATE":
          yield* this.runValidate();
          break;

        case "REPAIR":
          yield* this.runRepair();
          break;

        case "REGENERATE":
          yield* this.runRegenerate();
          break;

        case "PASS":
          yield* this.runPass();
          break;

        case "POLISH":
          yield* this.runPolish();
          break;

        default:
          this.transition("FAILED", `unexpected state: ${this.smCtx.currentState}`);
          yield { type: "error", message: `unexpected state: ${this.smCtx.currentState}` };
          break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // GENERATE: run WriterAgent
  // -----------------------------------------------------------------------
  private async *runGenerate(): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "writing" };

    // If we have correction context from previous regenerations, inject it
    if (this.correctionContext.length > 0) {
      const corrections = this.correctionContext.join("\n");
      if (!this.smCtx.chapter.trackingContext) {
        this.smCtx.chapter.trackingContext = {};
      }
      this.smCtx.chapter.trackingContext.correctionContext = corrections;
    }

    yield* this.writerAgent.run(this.smCtx.chapter);

    // Transition: GENERATE → VALIDATE
    const { nextState, reason } = resolveTransition(this.smCtx);
    this.transition(nextState, reason);
  }

  // -----------------------------------------------------------------------
  // VALIDATE: RuleGuard + DeterministicScorer + ConflictGate + ConsistencyChecker
  // -----------------------------------------------------------------------
  private async *runValidate(): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "validating" };
    const ctx = this.smCtx.chapter;

    // 1. RuleGuard (deterministic, $0)
    yield* this.ruleGuardAgent.run(ctx);

    // 2. Deterministic scoring
    const detScores = computeDeterministicScores(
      ctx.text,
      ctx.seed,
      ctx.chapterNumber,
      undefined,
      ctx.blueprint,
    );

    yield { type: "deterministic_scores", scores: detScores } as LifecycleEvent;

    // 3. Conflict gate
    const totalChapters = ctx.seed.chapter_outlines?.length || 10;
    const roleInArc = ctx.blueprint?.role_in_arc || "rising_action";
    let conflictResult: ConflictGateResult = { passed: true, issues: [], metrics: { resolutionScore: 0, tensionScore: 0, netTension: 0 } };
    try {
      conflictResult = validateConflictGate(
        ctx.text,
        ctx.chapterNumber,
        totalChapters,
        roleInArc,
        true, // treat whole chapter as last scene
      );
    } catch {
      // conflict gate is non-critical
    }

    // 4. ConsistencyChecker (LLM-based, only if text is long enough)
    let consistencyCriticalCount = 0;
    if (ctx.text.length >= 500) {
      // Collect events from consistency checker; count critical issues from its output
      const ccEvents: LifecycleEvent[] = [];
      for await (const event of this.consistencyChecker.run(ctx)) {
        ccEvents.push(event);
        yield event;
      }
      // Count critical consistency issues from ruleIssues added by checker
      consistencyCriticalCount = ctx.ruleIssues.filter(
        (ri) => ri.type === "consistency" && ri.severity === "critical"
      ).length;
    }

    // 5. Count missing facts from blueprint
    let missingFactCount = 0;
    if (ctx.blueprint?.scenes) {
      for (const scene of ctx.blueprint.scenes) {
        if (scene.must_reveal) {
          for (const fact of scene.must_reveal) {
            if (!ctx.text.includes(fact)) {
              missingFactCount++;
            }
          }
        }
      }
    }

    // 6. Produce verdict
    const errorIssues = ctx.ruleIssues.filter(
      (ri) => ri.severity === "error" || ri.severity === "critical"
    );

    const verdict = decideValidation(
      detScores.overall,
      errorIssues.length,
      consistencyCriticalCount,
      conflictResult.passed,
      missingFactCount,
      this.smCtx.limits,
      ctx.ruleIssues,
    );

    this.smCtx.lastVerdict = verdict;

    // Emit gate decision event
    yield {
      type: "gate_decision",
      decision: verdict.decision === "pass" ? "pass" : "reject",
      deterministicScore: verdict.deterministicScore,
      message: verdict.decision === "pass"
        ? `점수 ${(verdict.deterministicScore * 100).toFixed(0)}점 — 통과`
        : `점수 ${(verdict.deterministicScore * 100).toFixed(0)}점 — ${verdict.decision} (${verdict.repairInstructions || verdict.regenerateReason || ""})`,
    } as LifecycleEvent;

    // Update best score
    ctx.bestScore = Math.max(ctx.bestScore, detScores.overall);
    ctx.snapshots.push({
      text: ctx.text,
      score: detScores.overall,
      iteration: this.smCtx.regenerationCount + this.smCtx.repairCount,
    });

    // Resolve transition based on verdict
    const { nextState, reason } = resolveTransition(this.smCtx, verdict);
    this.transition(nextState, reason);
  }

  // -----------------------------------------------------------------------
  // REPAIR: SurgeonAgent on top issues
  // -----------------------------------------------------------------------
  private async *runRepair(): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "surgery" };
    const ctx = this.smCtx.chapter;

    this.smCtx.repairCount++;

    // Pick top issues to fix (errors and critical only, max 5)
    const actionableIssues = ctx.ruleIssues
      .filter((ri) => ri.severity === "error" || ri.severity === "critical")
      .slice(0, 5);

    if (actionableIssues.length > 0) {
      // Convert RuleIssues to CriticIssue format for the surgeon
      for (const issue of actionableIssues) {
        const paragraphs = segmentText(ctx.text);
        if (issue.position >= paragraphs.length) continue;

        const criticIssue = {
          startParagraph: issue.position,
          endParagraph: Math.min(issue.position + 1, paragraphs.length - 1),
          category: "rhythm" as const,
          description: issue.detail || issue.message || "",
          severity: "major" as const,
          suggestedFix: issue.detail,
        };

        const gen = this.surgeonAgent.fix(ctx, criticIssue);
        let result = await gen.next();
        while (!result.done) {
          result = await gen.next();
        }
        const usage = result.value;
        ctx.totalUsage = accumulateUsage(ctx.totalUsage, usage);
      }

      ctx.text = sanitize(ctx.text);
      yield { type: "replace_text", content: ctx.text };
    }

    // Clear rule issues for re-validation
    ctx.ruleIssues = [];

    // Transition: REPAIR → VALIDATE
    const { nextState, reason } = resolveTransition(this.smCtx);
    this.transition(nextState, reason);
  }

  // -----------------------------------------------------------------------
  // REGENERATE: reset text and re-generate with correction context
  // -----------------------------------------------------------------------
  private async *runRegenerate(): AsyncGenerator<LifecycleEvent> {
    this.smCtx.regenerationCount++;

    const verdict = this.smCtx.lastVerdict;
    const reason = verdict?.regenerateReason || "quality below threshold";

    yield {
      type: "retry",
      attempt: this.smCtx.regenerationCount,
      reason,
      score: verdict?.deterministicScore || 0,
    };

    // Accumulate correction context for the writer
    this.correctionContext.push(
      `재생성 시도 #${this.smCtx.regenerationCount}: ${reason}`
    );

    // Reset text (writer will produce new text)
    this.smCtx.chapter.text = "";
    this.smCtx.chapter.ruleIssues = [];

    // Transition: REGENERATE → GENERATE
    const { nextState, reason: transReason } = resolveTransition(this.smCtx);
    this.transition(nextState, transReason);
  }

  // -----------------------------------------------------------------------
  // PASS: no-op, just transition to POLISH
  // -----------------------------------------------------------------------
  private async *runPass(): AsyncGenerator<LifecycleEvent> {
    const { nextState, reason } = resolveTransition(this.smCtx);
    this.transition(nextState, reason);
  }

  // -----------------------------------------------------------------------
  // POLISH: run PolisherAgent
  // -----------------------------------------------------------------------
  private async *runPolish(): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "polishing" };

    yield* this.polisherAgent.run(this.smCtx.chapter);

    // Transition: POLISH → DONE
    const { nextState, reason } = resolveTransition(this.smCtx);
    this.transition(nextState, reason);
  }
}
