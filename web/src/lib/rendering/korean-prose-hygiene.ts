export type KoreanProseHygieneSignalKind =
  | "inanimate_subject"
  | "noun_chain"
  | "nominal_predicate"
  | "stacked_adverbials"
  | "abstract_english_metaphor"
  | "passive_overuse";

export type KoreanProseHygieneSeverity = "warn" | "fail";

export interface KoreanProseHygieneSignal {
  kind: KoreanProseHygieneSignalKind;
  severity: KoreanProseHygieneSeverity;
  excerpt: string;
  lineNumber: number;
  hint: string;
}

export interface KoreanProseHygieneReport {
  signals: KoreanProseHygieneSignal[];
  counts: Record<KoreanProseHygieneSignalKind, number>;
  failCount: number;
  warnCount: number;
}

const INANIMATE_NOUNS = [
  "사실", "공기", "정적", "침묵", "시간", "빛", "낮빛", "햇빛", "어둠",
  "향", "냄새", "소리", "바람", "그림자", "공간", "분위기",
  "생각", "기억", "감정", "감각", "마음", "기분",
];

const ABSTRACT_ENGLISH_METAPHORS: Array<{
  pattern: RegExp;
  origin: string;
  hint: string;
}> = [
  { pattern: /닫는다(?!고)/g, origin: "close", hint: "닫는다 → 완성한다/마무리한다/끝낸다" },
  { pattern: /태운다(?!고)/g, origin: "ship", hint: "태운다 → 출시한다/내보낸다" },
  { pattern: /죽인다(?!고)/g, origin: "kill", hint: "죽인다 → 잡는다/고친다/없앤다" },
  { pattern: /살아있다(?!고)/g, origin: "alive", hint: "살아있다 → 유효하다/작동한다 (메타용)" },
  { pattern: /떨어트린다/g, origin: "drop", hint: "떨어트린다 → 내려놓는다/빼낸다" },
];

const NOMINAL_ENDING_PATTERN = /(\S{2,})(?:이었|였)다(?![가-힣])/g;
const NOUN_CHAIN_PATTERN = /\S+의\s+\S+인\s+\S+이라는|\S+의\s+\S+인\s+\S+(?:이|가)\s/g;
const PASSIVE_OVERUSE_PATTERN = /(?:되어졌|되어지|되어진)/g;
const ADVERBIAL_TAIL_PATTERN = /[가-힣]+(?:에|에서|으로|로|와|과|에게|로부터|에게서)\s/g;

const INANIMATE_SUBJECT_THRESHOLD = 1;
const STACKED_ADVERBIALS_THRESHOLD = 4;

function buildInanimateSubjectRegex(): RegExp {
  const alternation = INANIMATE_NOUNS
    .map((noun) => noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`(?:^|[\\s,])(${alternation})(?:이|가)\\s+\\S+`, "g");
}

const INANIMATE_SUBJECT_REGEX = buildInanimateSubjectRegex();

function lineContext(text: string, position: number): { line: number; excerpt: string } {
  const before = text.slice(0, position);
  const line = before.split("\n").length;
  const lineStartIdx = before.lastIndexOf("\n") + 1;
  const lineEndIdx = text.indexOf("\n", position);
  const excerpt = text.slice(
    lineStartIdx,
    lineEndIdx === -1 ? text.length : lineEndIdx,
  ).trim().slice(0, 80);
  return { line, excerpt };
}

function detectInanimateSubjects(text: string): KoreanProseHygieneSignal[] {
  const signals: KoreanProseHygieneSignal[] = [];
  const seenLineCounts = new Map<number, number>();

  for (const match of text.matchAll(INANIMATE_SUBJECT_REGEX)) {
    if (match.index === undefined) continue;
    const { line, excerpt } = lineContext(text, match.index);
    seenLineCounts.set(line, (seenLineCounts.get(line) ?? 0) + 1);
    if ((seenLineCounts.get(line) ?? 0) === INANIMATE_SUBJECT_THRESHOLD + 1) {
      signals.push({
        kind: "inanimate_subject",
        severity: "warn",
        lineNumber: line,
        excerpt,
        hint: `한 문단에 무정물 주어가 ${INANIMATE_SUBJECT_THRESHOLD + 1}회 이상 — 인물 감각/행동으로 풀어라.`,
      });
    }
  }

  return signals;
}

function detectNounChains(text: string): KoreanProseHygieneSignal[] {
  const signals: KoreanProseHygieneSignal[] = [];
  for (const match of text.matchAll(NOUN_CHAIN_PATTERN)) {
    if (match.index === undefined) continue;
    const { line, excerpt } = lineContext(text, match.index);
    signals.push({
      kind: "noun_chain",
      severity: "fail",
      lineNumber: line,
      excerpt,
      hint: '"~의 ~인 ~이라는" 한자어 체인 — 두 문장으로 쪼개라.',
    });
  }
  return signals;
}

function detectNominalPredicates(text: string): KoreanProseHygieneSignal[] {
  const signals: KoreanProseHygieneSignal[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    const matches = [...line.matchAll(NOMINAL_ENDING_PATTERN)];
    if (matches.length >= 3) {
      signals.push({
        kind: "nominal_predicate",
        severity: "warn",
        lineNumber: i + 1,
        excerpt: line.trim().slice(0, 80),
        hint: `한 단락에 "~였다/이었다" ${matches.length}회 — 일부는 동사 술어로 풀어라.`,
      });
    }
  }
  return signals;
}

function detectStackedAdverbials(text: string): KoreanProseHygieneSignal[] {
  const signals: KoreanProseHygieneSignal[] = [];
  const sentences = text.split(/(?<=[.!?…])\s+/);
  let position = 0;

  for (const sentence of sentences) {
    const start = text.indexOf(sentence, position);
    position = start + sentence.length;

    const matches = [...sentence.matchAll(ADVERBIAL_TAIL_PATTERN)];
    if (matches.length >= STACKED_ADVERBIALS_THRESHOLD) {
      const { line, excerpt } = lineContext(text, start);
      signals.push({
        kind: "stacked_adverbials",
        severity: "warn",
        lineNumber: line,
        excerpt,
        hint: `한 문장에 부사구가 ${matches.length}개 — 쉼표/마침표로 호흡을 끊어라.`,
      });
    }
  }
  return signals;
}

function detectAbstractEnglishMetaphors(text: string): KoreanProseHygieneSignal[] {
  const signals: KoreanProseHygieneSignal[] = [];
  for (const { pattern, origin, hint } of ABSTRACT_ENGLISH_METAPHORS) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const { line, excerpt } = lineContext(text, match.index);
      signals.push({
        kind: "abstract_english_metaphor",
        severity: "warn",
        lineNumber: line,
        excerpt,
        hint: `영어 ${origin} 직역 — ${hint}`,
      });
    }
  }
  return signals;
}

function detectPassiveOveruse(text: string): KoreanProseHygieneSignal[] {
  const signals: KoreanProseHygieneSignal[] = [];
  for (const match of text.matchAll(PASSIVE_OVERUSE_PATTERN)) {
    if (match.index === undefined) continue;
    const { line, excerpt } = lineContext(text, match.index);
    signals.push({
      kind: "passive_overuse",
      severity: "fail",
      lineNumber: line,
      excerpt,
      hint: '이중 피동 "~되어지다" — 능동형으로 풀어라.',
    });
  }
  return signals;
}

export function verifyKoreanProseHygiene(text: string): KoreanProseHygieneReport {
  const signals: KoreanProseHygieneSignal[] = [
    ...detectInanimateSubjects(text),
    ...detectNounChains(text),
    ...detectNominalPredicates(text),
    ...detectStackedAdverbials(text),
    ...detectAbstractEnglishMetaphors(text),
    ...detectPassiveOveruse(text),
  ];

  const counts: Record<KoreanProseHygieneSignalKind, number> = {
    inanimate_subject: 0,
    noun_chain: 0,
    nominal_predicate: 0,
    stacked_adverbials: 0,
    abstract_english_metaphor: 0,
    passive_overuse: 0,
  };
  let failCount = 0;
  let warnCount = 0;

  for (const signal of signals) {
    counts[signal.kind] += 1;
    if (signal.severity === "fail") failCount += 1;
    else warnCount += 1;
  }

  return { signals, counts, failCount, warnCount };
}
