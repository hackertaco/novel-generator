import { getAgent } from "./llm-agent";
import { segmentText, reassemble } from "./segmenter";
import { sanitize } from "./rule-guard";
import { getSurgeonSystemPrompt } from "@/lib/prompts/surgeon-prompt";
import type { TokenUsage } from "./types";
import type { ChapterContext, CriticIssue } from "./pipeline";

/**
 * Build a prompt instructing the LLM to fix a specific text range.
 * Uses natural language only — no "---" marker syntax.
 */
export function buildSurgeonPrompt(
  target: string,
  prev: string | null,
  next: string | null,
  description: string,
  suggestedFix: string,
  genre: string,
): string {
  const parts: string[] = [];

  parts.push("아래 구간을 수정하세요.");
  parts.push("");

  if (prev !== null) {
    parts.push("문맥 (수정하지 마세요):");
    parts.push(prev);
    parts.push("");
  }

  parts.push("수정할 부분:");
  parts.push(target);
  parts.push("");

  if (next !== null) {
    parts.push("문맥 (수정하지 마세요):");
    parts.push(next);
    parts.push("");
  }

  parts.push(`수정 이유: ${description}`);
  parts.push(`방향: ${suggestedFix}`);
  parts.push("");
  parts.push("수정된 부분만 출력하세요. 다른 텍스트 없이.");

  return parts.join("\n");
}

/**
 * Apply patched text to the full text, replacing paragraphs from startParagraph to
 * endParagraph (inclusive).
 *
 * Safety: returns ORIGINAL text if:
 * - patch is empty
 * - patch length is < 50% of the original range's combined length
 * - startParagraph is out of bounds
 */
export function applyPatch(
  text: string,
  startParagraph: number,
  endParagraph: number,
  patchedText: string,
): string {
  // Empty patch guard
  if (!patchedText || patchedText.trim().length === 0) {
    return text;
  }

  const segments = segmentText(text);

  // Out-of-bounds guard
  if (startParagraph >= segments.length) {
    return text;
  }

  const clampedEnd = Math.min(endParagraph, segments.length - 1);

  // Compute original range length
  const originalRangeText = segments
    .slice(startParagraph, clampedEnd + 1)
    .map((s) => s.text)
    .join("\n\n");

  // 50% length safety check
  if (patchedText.trim().length < originalRangeText.length * 0.5) {
    return text;
  }

  // Build new segment array
  const patchSegments = segmentText(patchedText);

  const before = segments.slice(0, startParagraph);
  const after = segments.slice(clampedEnd + 1);

  // Re-index all segments sequentially
  const merged = [...before, ...patchSegments, ...after].map((s, i) => ({
    ...s,
    id: i,
  }));

  return reassemble(merged);
}

/**
 * SurgeonAgent fixes a single CriticIssue by streaming a patched replacement
 * for the affected paragraph range and applying it back to the chapter text.
 */
export class SurgeonAgent {
  /**
   * Fix a single issue: streams patched text for the specified range.
   * Mutates ctx.text in place after the patch is applied.
   * Returns accumulated TokenUsage as the generator's return value.
   */
  async *fix(ctx: ChapterContext, issue: CriticIssue): AsyncGenerator<string, TokenUsage> {
    const segments = segmentText(ctx.text);
    const { startParagraph, endParagraph, description, suggestedFix } = issue;
    const genre = ctx.seed.world.genre;

    // Extract target range text
    const clampedStart = Math.min(startParagraph, segments.length - 1);
    const clampedEnd = Math.min(endParagraph, segments.length - 1);
    const target = segments
      .slice(clampedStart, clampedEnd + 1)
      .map((s) => s.text)
      .join("\n\n");

    // Get adjacent context (one segment each side)
    const prevSegment = clampedStart > 0 ? segments[clampedStart - 1].text : null;
    const nextSegment = clampedEnd < segments.length - 1 ? segments[clampedEnd + 1].text : null;

    const prompt = buildSurgeonPrompt(
      target,
      prevSegment,
      nextSegment,
      description,
      suggestedFix,
      genre,
    );

    const agent = getAgent();
    const stream = agent.callStream({
      prompt,
      system: getSurgeonSystemPrompt(),
      temperature: 0.3,
      maxTokens: 4096,
      taskId: `surgeon-ch${ctx.chapterNumber}-p${startParagraph}-${endParagraph}`,
    });

    let collected = "";
    let result = await stream.next();
    while (!result.done) {
      const chunk = result.value;
      collected += chunk;
      yield chunk;
      result = await stream.next();
    }

    const usage: TokenUsage = result.value;

    // Sanitize and apply the patch
    const cleaned = sanitize(collected);
    ctx.text = applyPatch(ctx.text, startParagraph, endParagraph, cleaned);

    return usage;
  }
}
