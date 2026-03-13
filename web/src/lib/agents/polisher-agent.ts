import { getAgent } from "./llm-agent";
import { getPolisherSystemPrompt } from "@/lib/prompts/polisher-prompt";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import { sanitize } from "./rule-guard";
import { accumulateUsage } from "./pipeline";
import type { PipelineAgent, ChapterContext, CriticReport, LifecycleEvent } from "./pipeline";

/**
 * Build the user prompt for the Polisher agent.
 * Includes the full text and any minor issues from the last CriticReport.
 * Major/critical issues are excluded (handled by Surgeon already).
 */
export function buildPolisherPrompt(
  text: string,
  lastReport: CriticReport | null,
  genre: string,
): string {
  const parts: string[] = [];

  parts.push(`장르: ${genre}`);
  parts.push("");

  if (lastReport) {
    const minorIssues = lastReport.issues.filter(i => i.severity === "minor");
    if (minorIssues.length > 0) {
      parts.push("## 참고: 남은 마이너 이슈");
      for (const issue of minorIssues) {
        parts.push(`- [문단 ${issue.startParagraph}] ${issue.category}: ${issue.description} → ${issue.suggestedFix}`);
      }
      parts.push("");
    }
  }

  parts.push("## 교정할 본문");
  parts.push("");
  parts.push(text);

  return parts.join("\n");
}

/**
 * PolisherAgent: final style pass using LLM.
 * Replaces ctx.text with polished version.
 * Only addresses minor style issues — content must not change.
 */
export class PolisherAgent implements PipelineAgent {
  name = "polisher";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "polishing" };

    const lastReport = ctx.critiqueHistory.length > 0
      ? ctx.critiqueHistory[ctx.critiqueHistory.length - 1]
      : null;

    const genre = ctx.seed.world.genre;
    const prompt = buildPolisherPrompt(ctx.text, lastReport, genre);
    const system = getPolisherSystemPrompt(genre);

    const agent = getAgent();
    const tier = selectModelTier(ctx.seed, ctx.chapterNumber);
    const model = getModelForTier(tier);

    const stream = agent.callStream({
      prompt,
      system,
      model,
      temperature: 0.3,
      maxTokens: 8192,
      taskId: `polisher-ch${ctx.chapterNumber}`,
    });

    let collected = "";
    let result = await stream.next();
    while (!result.done) {
      collected += result.value;
      yield { type: "chunk", content: result.value };
      result = await stream.next();
    }

    const usage = result.value;
    ctx.totalUsage = accumulateUsage(ctx.totalUsage, usage);

    // Safety: only accept if polished text is at least 70% of original length
    const cleaned = sanitize(collected);
    if (cleaned.length >= ctx.text.length * 0.7) {
      ctx.text = cleaned;
      yield { type: "replace_text", content: ctx.text };
    }
  }
}
