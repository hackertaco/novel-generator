import { getAgent } from "./llm-agent";
import { getFinalRewriterSystemPrompt } from "@/lib/prompts/final-rewriter-prompt";
import { sanitize } from "./rule-guard";
import { accumulateUsage } from "./pipeline";
import type { PipelineAgent, ChapterContext, LifecycleEvent } from "./pipeline";
import { ConstraintChecker } from "../evaluators/constraint-checker";
import {
  getAddressEntriesForCharacters,
  formatAddressMatrixForPrompt,
} from "@/lib/schema/direction";

/**
 * Build the user prompt for the FinalRewriter agent.
 * Provides chapter context (seed info, chapter number) but instructs
 * the editor NOT to change the plot — only polish prose quality.
 */
export function buildFinalRewriterPrompt(
  text: string,
  genre: string,
  chapterNumber: number,
  ctx?: ChapterContext,
): string {
  const parts: string[] = [];

  parts.push(`장르: ${genre}`);
  parts.push(`회차: ${chapterNumber}화`);

  // Inject address matrix from direction design if available
  if (ctx?.directionDesign) {
    const allCharNames = ctx.seed.characters.map((c) => c.name);
    const addressEntries = getAddressEntriesForCharacters(ctx.directionDesign, allCharNames);
    if (addressEntries.length > 0) {
      parts.push("");
      parts.push("## 호칭 규칙 (편집 시 반드시 확인!)");
      parts.push(formatAddressMatrixForPrompt(addressEntries));
      parts.push("⚠️ 호칭이 위 규칙과 다르면 수정하세요.");
    }
  }

  if (ctx?.blueprint) {
    const allowedIds = new Set(ctx.blueprint.characters_involved || []);
    const allowedNames = ctx.seed.characters
      .filter((character) => allowedIds.has(character.id))
      .map((character) => character.name);
    const forbiddenNames = ctx.seed.characters
      .filter((character) => !allowedIds.has(character.id))
      .map((character) => character.name);

    parts.push("");
    parts.push("## 등장 인물 보존 규칙 (절대 위반 금지)");
    parts.push(`허용 직접 등장 인물: ${allowedNames.join(", ") || "없음"}`);
    if (forbiddenNames.length > 0) {
      parts.push(`직접 등장 금지 인물: ${forbiddenNames.join(", ")}`);
    }
    parts.push("⚠️ 편집 중 새 캐릭터를 추가하거나, 금지 인물에게 새 대사/행동/등장을 부여하면 안 됩니다.");
    parts.push("⚠️ 이미 있는 사건의 문체만 다듬으세요. 캐스트와 플롯은 바꾸지 마세요.");
  }

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
    const prompt = buildFinalRewriterPrompt(ctx.text, genre, ctx.chapterNumber, ctx);
    const system = getFinalRewriterSystemPrompt();

    // Use writing model — rewriter quality must match writer quality
    const model = process.env.NOVEL_MODEL_WRITING || "gpt-5.4";

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
    const originalText = ctx.text;
    const cleaned = sanitize(collected);
    const minLen = originalText.length * 0.7;
    const maxLen = originalText.length * 1.3;
    if (cleaned.length >= minLen && cleaned.length <= maxLen) {
      let acceptRewrite = true;
      if (ctx.blueprint) {
        const checker = new ConstraintChecker(ctx.seed);
        const originalViolations = checker.validateCharacterAppearances(
          originalText,
          ctx.chapterNumber,
          ctx.seed,
          ctx.blueprint.characters_involved,
        );
        const rewrittenViolations = checker.validateCharacterAppearances(
          cleaned,
          ctx.chapterNumber,
          ctx.seed,
          ctx.blueprint.characters_involved,
        );
        const originalCount = originalViolations.filter((violation) =>
          violation.type === "missing_character" || violation.type === "premature_introduction"
        ).length;
        const rewrittenCount = rewrittenViolations.filter((violation) =>
          violation.type === "missing_character" || violation.type === "premature_introduction"
        ).length;

        if (rewrittenCount > originalCount) {
          acceptRewrite = false;
        }
      }

      if (acceptRewrite) {
        ctx.text = cleaned;
        yield { type: "replace_text", content: ctx.text };
      }
    }
  }
}
