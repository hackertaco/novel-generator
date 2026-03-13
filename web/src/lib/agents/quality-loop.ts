import type { PipelineAgent, ChapterContext, CriticReport, LifecycleEvent } from "./pipeline";
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
    // Initial evaluation
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
