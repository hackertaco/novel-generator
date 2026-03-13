import type { RuleIssue, ChapterContext, PipelineAgent, LifecycleEvent } from "@/lib/agents/pipeline";

// ---------------------------------------------------------------------------
// Sanitize — remove LLM meta markers from generated text
// ---------------------------------------------------------------------------

export function sanitize(text: string): string {
  let result = text;

  // Remove lines like "--- 수정 대상 ---", "--- 수정 지시 ---", "--- 문맥 ---", etc.
  result = result.replace(/^-{2,}\s*(수정|편집|문맥|수정\s*대상|수정\s*지시).*-{2,}$/gm, "");

  // Remove lines starting with "수정:" or "수정 :"
  result = result.replace(/^수정\s*:\s*.*/gm, "");

  // Remove editor note bracket lines like "[편집자 노트: ...]"
  result = result.replace(/^\[편집[^\]]*\]$/gm, "");

  // Collapse multiple blank lines left behind by removals
  result = result.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  result = result.trim();

  return result;
}

// ---------------------------------------------------------------------------
// DeduplicateParagraphs — remove repeat paragraphs (exact or near-match)
// ---------------------------------------------------------------------------

export function deduplicateParagraphs(text: string): string {
  const paragraphs = text.split("\n\n").map((p) => p.trim()).filter((p) => p.length > 0);
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const para of paragraphs) {
    // Use first 50 characters as the fingerprint
    const fingerprint = para.slice(0, 50);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(para);
    }
  }

  return unique.join("\n\n");
}

// ---------------------------------------------------------------------------
// Sentence splitting helper
// ---------------------------------------------------------------------------

/**
 * Split text into individual sentences.
 * Handles Korean sentence endings (다., 요., 지., 나., 까.) and standard punctuation.
 */
function splitSentences(text: string): string[] {
  // Split on whitespace that follows a sentence-ending punctuation character.
  // Korean sentences typically end with 다. 요. 지. 나. 까. or plain . ! ?
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return sentences;
}

// ---------------------------------------------------------------------------
// DetectEndingRepeat
// ---------------------------------------------------------------------------

/**
 * Extract the 2-character ending suffix before the final punctuation mark.
 * e.g. "걸었다." → "었다", "웃었다!" → "었다"
 */
function extractEnding(sentence: string): string | null {
  // Match the two chars immediately before a terminal punctuation
  const match = sentence.match(/(.{2})[.!?]\s*$/);
  return match ? match[1] : null;
}

export function detectEndingRepeat(text: string): RuleIssue[] {
  const paragraphs = text.split("\n\n");
  const issues: RuleIssue[] = [];

  paragraphs.forEach((para, paraIndex) => {
    const sentences = splitSentences(para);
    if (sentences.length < 3) return;

    let runStart = 0;
    let runLength = 1;
    let currentEnding = extractEnding(sentences[0]);

    for (let i = 1; i < sentences.length; i++) {
      const ending = extractEnding(sentences[i]);
      if (ending !== null && ending === currentEnding) {
        runLength++;
        if (runLength >= 3) {
          // Only emit one issue per run (when we first hit 3)
          if (runLength === 3) {
            issues.push({
              type: "ending_repeat",
              position: paraIndex,
              detail: `문장 ${runStart + 1}~${i + 1}: 어미 "${currentEnding}" 반복`,
            });
          }
        }
      } else {
        runStart = i;
        runLength = 1;
        currentEnding = ending;
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// DetectSentenceStartRepeat
// ---------------------------------------------------------------------------

/**
 * Extract the first 2 characters of a trimmed sentence.
 * e.g. "그는 걸었다." → "그는"
 */
function extractStart(sentence: string): string {
  return sentence.trimStart().slice(0, 2);
}

export function detectSentenceStartRepeat(text: string): RuleIssue[] {
  const paragraphs = text.split("\n\n");
  const issues: RuleIssue[] = [];

  paragraphs.forEach((para, paraIndex) => {
    const sentences = splitSentences(para);
    if (sentences.length < 3) return;

    let runStart = 0;
    let runLength = 1;
    let currentStart = extractStart(sentences[0]);

    for (let i = 1; i < sentences.length; i++) {
      const start = extractStart(sentences[i]);
      if (start === currentStart) {
        runLength++;
        if (runLength >= 3) {
          if (runLength === 3) {
            issues.push({
              type: "sentence_start_repeat",
              position: paraIndex,
              detail: `문장 ${runStart + 1}~${i + 1}: 문장 시작 "${currentStart}" 반복`,
            });
          }
        }
      } else {
        runStart = i;
        runLength = 1;
        currentStart = start;
      }
    }
  });

  return issues;
}

// ---------------------------------------------------------------------------
// RuleGuardAgent — PipelineAgent implementation
// ---------------------------------------------------------------------------

export class RuleGuardAgent implements PipelineAgent {
  name = "rule-guard";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    yield { type: "stage_change", stage: "rule_check" };

    ctx.text = sanitize(ctx.text);
    ctx.text = deduplicateParagraphs(ctx.text);
    ctx.ruleIssues = [
      ...detectEndingRepeat(ctx.text),
      ...detectSentenceStartRepeat(ctx.text),
    ];
  }
}
