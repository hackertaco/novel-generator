import type { PipelineAgent, ChapterContext, CriticReport, LifecycleEvent } from "./pipeline";
import { CriticAgent } from "./critic-agent";
import { SurgeonAgent } from "./surgeon-agent";
import { sanitize } from "./rule-guard";
import { segmentText } from "./segmenter";
import { accumulateUsage } from "./pipeline";
import { computeDeterministicScores } from "../evaluators/deterministic-scorer";

const MAX_ITERATIONS = 5;
const QUALITY_THRESHOLD = 0.85;

/** Deterministic gate thresholds */
const GATE_REJECT = 0.70;    // Below → skip LLM, needs rewrite
const GATE_PASS = 0.85;      // Above → skip LLM, pass through

export class QualityLoop implements PipelineAgent {
  name = "quality-loop";
  private critic: CriticAgent;
  private surgeon: SurgeonAgent;

  constructor(critic?: CriticAgent, surgeon?: SurgeonAgent) {
    this.critic = critic ?? new CriticAgent();
    this.surgeon = surgeon ?? new SurgeonAgent();
  }

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    // --- Deterministic gate: fast, $0 pre-filter ---
    yield { type: "stage_change", stage: "deterministic_gate" };

    const detScores = computeDeterministicScores(
      ctx.text,
      ctx.seed,
      ctx.chapterNumber,
      undefined,
      ctx.blueprint,
    );

    yield {
      type: "deterministic_scores",
      scores: detScores,
    } as LifecycleEvent;

    // Gate decision
    if (detScores.overall >= GATE_PASS) {
      // High quality — skip LLM evaluation entirely
      ctx.bestScore = detScores.overall;
      ctx.snapshots.push({ text: ctx.text, score: detScores.overall, iteration: 0 });
      yield {
        type: "gate_decision",
        decision: "pass",
        deterministicScore: detScores.overall,
        message: `결정적 점수 ${(detScores.overall * 100).toFixed(0)}점 — LLM 평가 스킵`,
      } as LifecycleEvent;
      return;
    }

    if (detScores.overall < GATE_REJECT) {
      // Low quality — but instead of silently returning (which does nothing),
      // escalate to LLM critic. The deterministic gate is a cost optimization,
      // not a brick wall. If we just return, the bad text passes through unchanged.
      //
      // Rationale: "reject without LLM" sounds good in theory, but the caller
      // doesn't retry. So reject = pass with bad score = worst outcome.
      // Better: escalate to LLM so at least SurgeonAgent can try to fix it.
      yield {
        type: "gate_decision",
        decision: "reject",
        deterministicScore: detScores.overall,
        message: `결정적 점수 ${(detScores.overall * 100).toFixed(0)}점 — 품질 미달, LLM 수술로 에스컬레이션`,
      } as LifecycleEvent;

      // Log weak dimensions for the LLM critic to focus on
      const weakDimensions: string[] = [];
      if (detScores.narrativeInformation < 0.5) weakDimensions.push("서사 구조");
      if (detScores.rhythm < 0.5) weakDimensions.push("문장 리듬");
      if (detScores.hookEnding < 0.3) weakDimensions.push("후킹 엔딩");
      if (detScores.characterVoice < 0.5) weakDimensions.push("캐릭터 음성");
      if (detScores.antiRepetition < 0.5) weakDimensions.push("반복");

      if (weakDimensions.length > 0) {
        yield { type: "error", message: `약한 차원: ${weakDimensions.join(", ")}` };
      }

      // Fall through to LLM evaluation instead of returning
    }

    // --- Middle zone: proceed with LLM evaluation ---
    yield {
      type: "gate_decision",
      decision: "evaluate",
      deterministicScore: detScores.overall,
      message: `결정적 점수 ${(detScores.overall * 100).toFixed(0)}점 — LLM 정밀 평가 진행`,
    } as LifecycleEvent;

    // Initial LLM evaluation
    yield { type: "stage_change", stage: "critiquing" };
    const initialReport = await this.critic.evaluate(ctx);
    if (!initialReport) {
      yield { type: "error", message: "Critic evaluation failed (JSON parse error)" };
      return;
    }

    ctx.bestScore = initialReport.overallScore;
    ctx.snapshots.push({ text: ctx.text, score: initialReport.overallScore, iteration: 0 });
    ctx.critiqueHistory.push(initialReport);
    yield { type: "evaluation", report: initialReport, overall_score: initialReport.overallScore };

    if (initialReport.overallScore >= QUALITY_THRESHOLD) return;

    let prevScore = initialReport.overallScore;
    let currentReport = initialReport;

    // Convert rule issues to CriticIssues for surgeon repair
    const ruleBasedIssues = ctx.ruleIssues
      .filter((ri) => ri.type === "short_dialogue_sequence" || ri.type === "ending_repeat")
      .map((ri) => ({
        startParagraph: ri.position,
        endParagraph: Math.min(ri.position + (ri.type === "short_dialogue_sequence" ? 4 : 1), segmentText(ctx.text).length - 1),
        category: "rhythm" as const,
        description: ri.detail,
        severity: (ri.severity !== "minor" ? "major" : "minor") as "major" | "minor",
        suggestedFix: ri.type === "short_dialogue_sequence"
          ? "짧은 대사 사이에 캐릭터의 행동, 표정, 감각 묘사를 추가하세요. 대사 자체는 유지하되, 대사 뒤나 사이에 1-2문장의 서술 비트를 넣어 리듬을 만드세요."
          : "동일한 어미가 3회 이상 반복됩니다. 어미를 다양하게 바꾸세요: ~였다/~었다 대신 ~ㄴ다/~했다/~더라/~인 채/체언 종결 등을 섞으세요. 의미는 유지하되 문장 끝만 바꾸세요.",
      }));
    if (ruleBasedIssues.length > 0) {
      currentReport.issues.push(...ruleBasedIssues);
    }

    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      const actionable = currentReport.issues.filter(iss => iss.severity !== "minor");
      if (actionable.length === 0) break;

      // Surgery phase
      yield { type: "stage_change", stage: "surgery" };

      for (const issue of actionable) {
        const paragraphs = segmentText(ctx.text);
        if (issue.startParagraph >= paragraphs.length) continue;

        const gen = this.surgeon.fix(ctx, issue);
        let result = await gen.next();
        while (!result.done) {
          // stream chunks from surgeon (ctx.text is mutated inside surgeon.fix)
          result = await gen.next();
        }
        const usage = result.value;
        ctx.totalUsage = accumulateUsage(ctx.totalUsage, usage);
      }

      ctx.text = sanitize(ctx.text);

      // Quick score check after surgery
      const newScore = await this.critic.quickScore(ctx);
      if (newScore === null || newScore < prevScore) {
        // Revert to best snapshot
        const best = ctx.snapshots.reduce((a, b) => a.score > b.score ? a : b);
        ctx.text = best.text;
        ctx.bestScore = best.score;
        yield { type: "revert", reason: "score dropped after surgery", to: best.iteration };
        yield { type: "replace_text", content: ctx.text };
        break;
      }

      ctx.bestScore = newScore;
      prevScore = newScore;
      ctx.snapshots.push({ text: ctx.text, score: newScore, iteration: i });

      if (newScore >= QUALITY_THRESHOLD) break;

      // Full re-evaluate for next iteration
      yield { type: "stage_change", stage: "critiquing" };
      const nextReport = await this.critic.evaluate(ctx);
      if (!nextReport) break;
      currentReport = nextReport;
      ctx.critiqueHistory.push(nextReport);
      yield { type: "evaluation", report: nextReport, overall_score: nextReport.overallScore };
    }
  }
}
