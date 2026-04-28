import type { NovelSeed } from "../schema/novel";
import type { ChapterBlueprint } from "../schema/planning";

export interface ChapterQualityIssue {
  type: "repeated_reveal_payload" | "overfast_deduction" | "duplicate_beat_restart";
  message: string;
  severity: "warning" | "error";
}

export interface ChapterQualityDetectionContext {
  blueprint?: Pick<ChapterBlueprint, "one_liner" | "key_points" | "already_established" | "characters_involved" | "scenes">;
  seedCharacterNames?: NovelSeed["characters"][number]["name"][];
}

interface DetectorLexicon {
  decisionMarkers: string[];
  restartMarkers: string[];
  evidenceMarkers: string[];
  certaintyMarkers: string[];
  hedgeMarkers: string[];
  anchorTokens: Set<string>;
}

const TOKEN_REGEX = /[가-힣A-Za-z0-9]{2,}/g;
const WINDOW_SIZE = 3;
const MIN_SHARED_TOKENS_FOR_REPEAT = 3;
const MIN_SHARED_TOKENS_FOR_RESTART = 5;
const MIN_SHARED_ANCHOR_TOKENS = 2;
const MAX_DYNAMIC_MARKERS = 24;

const STOPWORDS = new Set([
  "그리고", "하지만", "그러나", "그래서", "그때", "정말", "아주", "조금", "다시", "이미", "이번", "저런",
  "이런", "그런", "했다", "했다가", "하며", "하는", "하고", "해서", "하게", "하는데", "이었다", "였다",
  "있다", "있었다", "없다", "없었다", "였다가", "에서", "으로", "에게", "에서만", "였다며", "라고", "이라",
  "이라고", "이라는", "했다는", "했다고", "것을", "것이", "였다는", "정도", "바로", "조차", "마저", "처럼",
]);

const GENERIC_DECISION_MARKERS = [
  "결심", "계획", "준비", "떠나", "도망", "숨기", "버티", "빠져나", "출발", "해야", "가야", "살아남",
];

const GENERIC_RESTART_MARKERS = [
  "그리고 다시", "다시", "잠시 뒤", "얼마 지나지 않아", "그 직후", "바로 뒤이어", "한편 다시",
];

const GENERIC_EVIDENCE_MARKERS = [
  "증거", "장부", "메모", "쪽지", "편지", "기록", "서류", "숫자", "계산", "흔적", "도면", "지도",
];

const GENERIC_CERTAINTY_MARKERS = [
  "분명", "틀림없", "확실", "결국", "자명", "정답", "확신", "결론", "단정",
];

const GENERIC_HEDGE_MARKERS = [
  "아마", "어쩌면", "일지도", "아닐지도", "가능성", "짐작", "추측", "확실하진",
];

interface WindowSignature {
  index: number;
  text: string;
  tokens: Set<string>;
  decisionCount: number;
  hasNumericAnchor: boolean;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function extractContentTokens(text: string): string[] {
  const matches = text.match(TOKEN_REGEX) || [];
  return matches
    .map((token) => token.toLowerCase())
    .filter((token) => !STOPWORDS.has(token));
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function pickDynamicMarkers(tokens: string[]): string[] {
  return dedupe(tokens)
    .filter((token) => token.length >= 2)
    .slice(0, MAX_DYNAMIC_MARKERS);
}

function buildLexicon(context?: ChapterQualityDetectionContext): DetectorLexicon {
  const blueprint = context?.blueprint;
  const sceneTexts = blueprint?.scenes?.flatMap((scene) => [
    scene.purpose,
    ...(scene.must_reveal || []),
    scene.triggered_by || "",
    scene.leads_to || "",
  ]) || [];
  const evidenceSource = [
    blueprint?.one_liner || "",
    ...(blueprint?.key_points || []),
    ...(blueprint?.already_established || []),
    ...sceneTexts,
    ...(context?.seedCharacterNames || []),
  ].join("\n");
  const dynamicTokens = pickDynamicMarkers(extractContentTokens(evidenceSource));

  return {
    decisionMarkers: GENERIC_DECISION_MARKERS,
    restartMarkers: GENERIC_RESTART_MARKERS,
    evidenceMarkers: dedupe([...GENERIC_EVIDENCE_MARKERS, ...dynamicTokens]),
    certaintyMarkers: GENERIC_CERTAINTY_MARKERS,
    hedgeMarkers: GENERIC_HEDGE_MARKERS,
    anchorTokens: new Set(dynamicTokens),
  };
}

function hasAnyMarker(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

function countMarkerMatches(text: string, markers: string[]): number {
  return markers.filter((marker) => text.includes(marker)).length;
}

function hasNumericAnchor(text: string): boolean {
  return /\b\d{2,4}\b/.test(text) || /(남은|기한|마지막|시한|시간표|일정|사흘|하루|며칠)/.test(text);
}

function buildWindowSignatures(paragraphs: string[], lexicon: DetectorLexicon): WindowSignature[] {
  return paragraphs.map((_, index) => {
    const text = paragraphs.slice(index, index + WINDOW_SIZE).join("\n\n");
    return {
      index,
      text,
      tokens: new Set(extractContentTokens(text)),
      decisionCount: countMarkerMatches(text, lexicon.decisionMarkers),
      hasNumericAnchor: hasNumericAnchor(text),
    };
  });
}

function getSharedTokens(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((token) => right.has(token));
}

function countSharedAnchorTokens(sharedTokens: string[], lexicon: DetectorLexicon): number {
  return sharedTokens.filter((token) => lexicon.anchorTokens.has(token)).length;
}

function detectRepeatedRevealPayload(paragraphs: string[], lexicon: DetectorLexicon): ChapterQualityIssue[] {
  const issues: ChapterQualityIssue[] = [];
  const windows = buildWindowSignatures(paragraphs, lexicon);

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + WINDOW_SIZE; j < windows.length; j++) {
      const sharedTokens = getSharedTokens(windows[i]?.tokens || new Set<string>(), windows[j]?.tokens || new Set<string>());
      const sharedAnchorCount = countSharedAnchorTokens(sharedTokens, lexicon);
      const hasEnoughSharedPayload =
        sharedTokens.length >= MIN_SHARED_TOKENS_FOR_REPEAT ||
        sharedAnchorCount >= MIN_SHARED_ANCHOR_TOKENS;
      const repeatedDecisionPayload =
        hasEnoughSharedPayload &&
        (windows[i]?.decisionCount || 0) >= 1 &&
        (windows[j]?.decisionCount || 0) >= 1;
      const repeatedTimedReveal =
        hasEnoughSharedPayload &&
        Boolean(windows[i]?.hasNumericAnchor) &&
        Boolean(windows[j]?.hasNumericAnchor);

      if (repeatedDecisionPayload || repeatedTimedReveal) {
        issues.push({
          type: "repeated_reveal_payload",
          severity: "error",
          message: "같은 reveal/결심 payload가 한 챕터 안에서 다시 길게 반복됩니다. 뒤쪽 블록은 재설명 대신 행동/준비/위험 증가로 전진해야 합니다.",
        });
        return issues;
      }
    }
  }

  return issues;
}

function detectDuplicateBeatRestart(paragraphs: string[], lexicon: DetectorLexicon): ChapterQualityIssue[] {
  const issues: ChapterQualityIssue[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i] || "";
    if (!hasAnyMarker(paragraph, lexicon.restartMarkers)) continue;

    const before = paragraphs.slice(Math.max(0, i - WINDOW_SIZE), i).join("\n\n");
    const after = paragraphs.slice(i, i + WINDOW_SIZE).join("\n\n");
    const overlappingTokens = getSharedTokens(
      new Set(extractContentTokens(before)),
      new Set(extractContentTokens(after)),
    );
    const sharedAnchorCount = countSharedAnchorTokens(overlappingTokens, lexicon);

    if (
      overlappingTokens.length >= MIN_SHARED_TOKENS_FOR_RESTART ||
      sharedAnchorCount >= MIN_SHARED_ANCHOR_TOKENS
    ) {
      issues.push({
        type: "duplicate_beat_restart",
        severity: "error",
        message: "같은 confrontation/escape beat가 다시 처음부터 열리는 듯한 restart가 보입니다. 뒤 블록은 재시작이 아니라 결과/후폭풍으로 이어져야 합니다.",
      });
      return issues;
    }
  }

  return issues;
}

function detectOverfastDeduction(paragraphs: string[], lexicon: DetectorLexicon): ChapterQualityIssue[] {
  const issues: ChapterQualityIssue[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    if (!hasAnyMarker(paragraphs[i] || "", lexicon.evidenceMarkers)) continue;
    const windowText = paragraphs.slice(i, i + 5).join("\n\n");
    if (
      hasAnyMarker(windowText, lexicon.certaintyMarkers) &&
      !hasAnyMarker(windowText, lexicon.hedgeMarkers)
    ) {
      issues.push({
        type: "overfast_deduction",
        severity: "warning",
        message: "제한된 단서에서 너무 빨리 닫힌 결론으로 점프합니다. 중간 의심/부분 추론/오해 가능성을 한 번 거치게 하세요.",
      });
      return issues;
    }
  }

  return issues;
}

export function detectChapterQualityIssues(
  text: string,
  context?: ChapterQualityDetectionContext,
): ChapterQualityIssue[] {
  const paragraphs = splitParagraphs(text);
  const lexicon = buildLexicon(context);
  return [
    ...detectRepeatedRevealPayload(paragraphs, lexicon),
    ...detectDuplicateBeatRestart(paragraphs, lexicon),
    ...detectOverfastDeduction(paragraphs, lexicon),
  ];
}

export function formatChapterQualityIssuesForPrompt(issues: ChapterQualityIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .map((issue) => `- [${issue.type}] ${issue.message}`)
    .join("\n");
}

export function buildChapterQualityRepairPrompt(
  text: string,
  issues: ChapterQualityIssue[],
): string {
  const issueLines = formatChapterQualityIssuesForPrompt(issues);
  const guidance: string[] = [];

  if (issues.some((issue) => issue.type === "repeated_reveal_payload")) {
    guidance.push(`### 같은 reveal/결심 반복 제거
- 앞부분에서 이미 드러난 사실(숫자, 결론, 도주 결정)을 뒤에서 다시 긴 설명으로 반복하지 마세요.
- 뒤 블록은 재설명 대신 준비, 은폐, 선택 비용, 즉시 닥친 외부 위험으로 전진시키세요.
- 같은 숫자/결심 문장을 다시 쓰기보다, 그 사실 때문에 지금 무엇을 하는지로 바꾸세요.`);
  }

  if (issues.some((issue) => issue.type === "duplicate_beat_restart")) {
    guidance.push(`### 중복 beat restart 제거
- 이미 시작된 confrontation / escape / 대치 장면을 뒤에서 다시 여는 문단을 삭제하거나 압축하세요.
- 뒤 블록은 같은 사건의 재시작이 아니라 후폭풍, 책임, 감정 여파, 다음 행동으로 이어져야 합니다.
- "그리고 얼마 지나지 않은 오후"처럼 시간을 다시 여는 문장은 유지하더라도, 같은 충돌을 처음부터 다시 설명하지 마세요.`);
  }

  if (issues.some((issue) => issue.type === "overfast_deduction")) {
    guidance.push(`### 성급한 결론 늦추기
- 단서 하나만으로 정답을 확신하는 문장을 줄이세요.
- 먼저 의심, 부분 추론, 잘못 짚은 가능성 중 하나를 거치게 하세요.
- 독자가 아직 추론 중인 지점에서는 인물도 완결형 해석을 늦추세요.`);
  }

  return `다음 챕터 본문에는 구조 품질 문제가 남아 있습니다. 문체가 아니라 서사 구조를 정리하세요.\n\n## 남은 문제\n${issueLines}\n\n## 수정 지침\n${guidance.join("\n\n")}\n\n## 원칙\n- 등장인물, 사건 순서, 결말은 바꾸지 마세요.\n- 새 캐릭터나 새 설정을 추가하지 마세요.\n- 이미 좋은 문장은 유지하고, 문제가 되는 블록만 최소 수정하세요.\n- 같은 사실을 다시 말하는 대신 다음 행동/위험/선택으로 전진시키세요.\n\n## 현재 본문\n${text}\n\n수정된 전체 본문만 출력하세요.`;
}
