import { getAgent } from "./llm-agent";
import { getFinalRewriterSystemPrompt } from "@/lib/prompts/final-rewriter-prompt";
import { sanitize } from "./rule-guard";
import { accumulateUsage } from "./pipeline";
import type { PipelineAgent, ChapterContext, LifecycleEvent } from "./pipeline";

/**
 * Build the user prompt for the FinalRewriter agent.
 * Provides chapter context (seed info, chapter number) but instructs
 * the editor NOT to change the plot — only polish prose quality.
 */
export function buildFinalRewriterPrompt(
  text: string,
  genre: string,
  chapterNumber: number,
): string {
  const parts: string[] = [];

  parts.push(`장르: ${genre}`);
  parts.push(`회차: ${chapterNumber}화`);
  parts.push("");
  parts.push("## 다듬을 본문");
  parts.push("");
  parts.push(text);

  return parts.join("\n");
}

/**
 * FinalRewriterAgent: final editorial polish pass.
 *
 * Runs AFTER Polisher as the last pipeline step. Focuses on:
 * - Replacing expository dialogue with action-oriented dialogue
 * - Removing translationese (번역체)
 * - Adding spatial anchors to dialogue-heavy sections
 * - Converting emotional telling to physical showing
 * - Weaving worldbuilding terms into action naturally
 *
 * Uses the `repair` model (gpt-4o) to keep costs low.
 * Content/plot must NOT change — only prose quality improves.
 */
export class FinalRewriterAgent implements PipelineAgent {
  name = "final-rewriter";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "final-rewriting" };

    const genre = ctx.seed.world.genre;
    const prompt = buildFinalRewriterPrompt(ctx.text, genre, ctx.chapterNumber);
    const system = getFinalRewriterSystemPrompt();

    // Use repair model (gpt-4o) to keep costs low
    const model = process.env.NOVEL_MODEL_REPAIR || "gpt-4o";

    const agent = getAgent();
    const stream = agent.callStream({
      prompt,
      system,
      model,
      temperature: 0.3,
      maxTokens: 8192,
      taskId: `final-rewriter-ch${ctx.chapterNumber}`,
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

    // Safety: only accept if rewritten text is within ±30% of original length
    // (looser than Polisher's 70% floor because the editor may add spatial descriptions)
    const cleaned = sanitize(collected);
    const minLen = ctx.text.length * 0.7;
    const maxLen = ctx.text.length * 1.3;
    if (cleaned.length >= minLen && cleaned.length <= maxLen) {
      ctx.text = cleaned;
      yield { type: "replace_text", content: ctx.text };
    }
  }
}
