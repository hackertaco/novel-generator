/**
 * Originality evaluator — measures cliche avoidance and lexical freshness.
 *
 * No LLM calls — pure computation. Returns a score 0~1 combining:
 * - Cliche density (Korean web novel cliches)
 * - Type-Token Ratio (lexical diversity)
 * - Opening entropy (paragraph start diversity)
 */

// ---------------------------------------------------------------------------
// Korean web novel cliches dictionary
// ---------------------------------------------------------------------------

const KOREAN_CLICHES: string[] = [
  // Romance (로판) — physical reactions
  "심장이 두근거렸다",
  "심장이 두근거리기 시작했다",
  "심장이 빠르게 뛰었다",
  "눈이 마주쳤다",
  "눈이 마주치는 순간",
  "볼이 붉어졌다",
  "얼굴이 붉어졌다",
  "시간이 멈춘 것 같았다",
  "시간이 멈춘 듯했다",
  "그의 눈동자가 흔들렸다",
  "눈동자가 흔들렸다",
  "숨이 멎을 것 같았다",
  "숨이 멈추는 것 같았다",
  "온몸이 얼어붙었다",
  "몸이 얼어붙었다",
  "그 자리에 얼어붙었다",

  // Romance — descriptive cliches
  "차가운 눈빛",
  "차가운 시선",
  "따뜻한 미소",
  "부드러운 미소",
  "묘한 감정",
  "알 수 없는 끌림",
  "알 수 없는 감정",
  "설명할 수 없는 감정",
  "처음 느끼는 감정",
  "낯선 감정",

  // Romance — actions
  "결심을 굳혔다",
  "주먹을 꽉 쥐었다",
  "주먹을 불끈 쥐었다",
  "입술을 깨물었다",
  "입술을 꽉 깨물었다",
  "고개를 돌렸다",
  "시선을 피했다",
  "눈을 감았다",

  // Action/Fantasy
  "강력한 기운이 느껴졌다",
  "엄청난 기운이 느껴졌다",
  "놀라운 실력",
  "대단한 실력",
  "감히",
  "어림없다",
  "이를 악물었다",
  "이를 꽉 악물었다",
  "살기가 느껴졌다",
  "살기를 뿜어냈다",
  "기가 폭발했다",
  "오라가 폭발했다",
  "검기가 폭발했다",
  "기운이 폭발했다",
  "압도적인 힘",
  "압도적인 기운",
  "상상도 못할",
  "믿을 수 없는 속도",

  // Generic narration
  "생각보다",
  "예상대로",
  "예상과 달리",
  "역시",
  "그런데 말이야",
  "할 수 없었다",
  "어쩔 수 없었다",
  "그럴 수밖에 없었다",
  "방법이 없었다",
  "선택의 여지가 없었다",

  // Generic body language
  "고개를 끄덕였다",
  "고개를 저었다",
  "한숨을 내쉬었다",
  "깊은 한숨을 내쉬었다",
  "미간을 찌푸렸다",
  "미간이 찌푸려졌다",
  "눈을 크게 떴다",
  "눈이 커졌다",
  "입이 떡 벌어졌다",

  // Filler / weak narration
  "그러자",
  "그런데",
  "그때였다",
  "바로 그때",
  "순간",
  "그 순간",
  "다름 아닌",
  "두말할 것도 없이",
  "말할 것도 없이",

  // Overused emotional descriptions
  "가슴이 먹먹해졌다",
  "가슴이 답답했다",
  "마음이 무거워졌다",
  "마음이 아팠다",
  "눈시울이 붉어졌다",
  "눈물이 흘렀다",
  "눈물이 핑 돌았다",
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface OriginalityResult {
  /** Overall originality score 0-1 */
  score: number;
  /** Number of cliche instances found */
  clicheCount: number;
  /** Cliches per 1000 characters */
  clicheDensity: number;
  /** Lexical diversity: unique tokens / total tokens */
  typeTokenRatio: number;
  /** Shannon entropy of paragraph opening words */
  openingEntropy: number;
  /** List of cliches actually found in the text */
  clichesFound: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split Korean text into token-like units.
 * Splits on whitespace and further breaks common particles from stems.
 */
function tokenize(text: string): string[] {
  // Split on whitespace first
  const rawTokens = text.split(/\s+/).filter((t) => t.length > 0);

  const tokens: string[] = [];
  // Common Korean particles/endings to split off
  const particlePattern = /^(.{2,}?)(은|는|이|가|을|를|에|의|로|으로|에서|에게|한테|와|과|도|만|까지|부터|처럼|같이|보다|마저|조차|라도)$/;

  for (const raw of rawTokens) {
    const match = raw.match(particlePattern);
    if (match) {
      tokens.push(match[1]);
      tokens.push(match[2]);
    } else {
      tokens.push(raw);
    }
  }

  return tokens;
}

/**
 * Calculate Shannon entropy for a distribution of values.
 */
function shannonEntropy(values: string[]): number {
  if (values.length === 0) return 0;

  const freq = new Map<string, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) || 0) + 1);
  }

  const total = values.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  return entropy;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function measureOriginality(text: string): OriginalityResult {
  if (!text || text.trim().length === 0) {
    return {
      score: 0,
      clicheCount: 0,
      clicheDensity: 0,
      typeTokenRatio: 0,
      openingEntropy: 0,
      clichesFound: [],
    };
  }

  // --- 1. Cliche detection ---
  const clichesFound: string[] = [];
  let clicheCount = 0;

  for (const cliche of KOREAN_CLICHES) {
    const regex = new RegExp(cliche.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = text.match(regex);
    if (matches) {
      clicheCount += matches.length;
      clichesFound.push(cliche);
    }
  }

  const clicheDensity = text.length > 0 ? (clicheCount / text.length) * 1000 : 0;
  // clicheAvoidance: 1.0 - min(clicheDensity * 5, 1.0)
  const clicheAvoidance = 1.0 - Math.min(clicheDensity * 5, 1.0);

  // --- 2. Type-Token Ratio ---
  const tokens = tokenize(text);
  const uniqueTokens = new Set(tokens);
  const typeTokenRatio = tokens.length > 0 ? uniqueTokens.size / tokens.length : 0;
  // Normalize TTR: 0.3 -> 0, 0.7 -> 1, linear in between
  const ttrNormalized = Math.max(0, Math.min(1, (typeTokenRatio - 0.3) / 0.4));

  // --- 3. Opening entropy ---
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const openingWords: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    // Get the first "word" — first whitespace-delimited token
    const firstWord = trimmed.split(/\s+/)[0];
    if (firstWord) {
      openingWords.push(firstWord);
    }
  }

  const openingEntropy = shannonEntropy(openingWords);
  // Normalize: max reasonable entropy for Korean paragraphs ~3.5 bits
  // With 10+ paragraphs all different, entropy ~ log2(10) ~ 3.32
  const maxEntropy = openingWords.length > 1 ? Math.log2(openingWords.length) : 1;
  const entropyNormalized = maxEntropy > 0 ? Math.min(1, openingEntropy / maxEntropy) : 0;

  // --- Combine scores ---
  // When cliche density is extreme, apply additional penalty multiplier
  const clichePenaltyMultiplier = clicheDensity > 10 ? Math.max(0.3, 1.0 - (clicheDensity - 10) / 100) : 1.0;

  const score =
    (clicheAvoidance * 0.4 +
    ttrNormalized * 0.35 +
    entropyNormalized * 0.25) * clichePenaltyMultiplier;

  return {
    score: Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000,
    clicheCount,
    clicheDensity: Math.round(clicheDensity * 1000) / 1000,
    typeTokenRatio: Math.round(typeTokenRatio * 1000) / 1000,
    openingEntropy: Math.round(openingEntropy * 1000) / 1000,
    clichesFound,
  };
}
