/**
 * Estimate token count for mixed Korean/English text.
 * Korean characters use approximately 1.5-2 tokens each in most models.
 * English words use ~1.3 tokens on average.
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7af) {
      // Korean syllables: ~1.5-2 tokens per character
      tokens += 1.7;
    } else if (code >= 0x3130 && code <= 0x318f) {
      // Korean jamo: ~1 token
      tokens += 1;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK: ~1.5 tokens
      tokens += 1.5;
    } else if (/\s/.test(char)) {
      // Whitespace: ~0.25 tokens
      tokens += 0.25;
    } else {
      // ASCII/Latin: ~0.25 tokens per char (~1.3 per word)
      tokens += 0.25;
    }
  }
  return Math.ceil(tokens);
}

/**
 * Priority-based context item for trimming.
 */
export interface ContextItem {
  key: string; // identifier (e.g. "arc-summary-1", "chapter-5")
  content: string; // actual text
  priority: number; // higher = more important, kept first
  tokens?: number; // pre-computed token count (computed if not provided)
}

/**
 * Trim context items to fit within a token budget.
 * Higher priority items are kept first.
 * Returns the selected items and total token count.
 */
export function trimToFit(
  items: ContextItem[],
  budgetTokens: number,
): { selected: ContextItem[]; totalTokens: number; dropped: string[] } {
  // Pre-compute tokens if not provided
  const withTokens = items.map((item) => ({
    ...item,
    tokens: item.tokens ?? estimateTokens(item.content),
  }));

  // Sort by priority descending (highest first)
  const sorted = [...withTokens].sort((a, b) => b.priority - a.priority);

  const selected: ContextItem[] = [];
  const dropped: string[] = [];
  let totalTokens = 0;

  for (const item of sorted) {
    if (totalTokens + item.tokens <= budgetTokens) {
      selected.push(item);
      totalTokens += item.tokens;
    } else {
      dropped.push(item.key);
    }
  }

  return { selected, totalTokens, dropped };
}
