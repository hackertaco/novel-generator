export interface ChapterQualityIssue {
  type: "repeated_reveal_payload" | "overfast_deduction" | "duplicate_beat_restart";
  message: string;
  severity: "warning" | "error";
}

const REVEAL_MARKERS = [
  /365/, /삼백육십오/, /\b\d{2,4}\s*일\b/, /남은\s*(시간|날)/,
];

const DECISION_KEYWORDS = [
  "수도", "떠", "도망", "출발", "크레바스", "혼자", "살려 달라고", "계획", "준비", "북부",
];

const EVIDENCE_MARKERS = [
  "기도문", "계산표", "숫자", "종이", "메모", "표", "흔적",
];

const CERTAINTY_MARKERS = [
  "분명", "결국", "정확", "틀림없", "확실", "그뿐", "죽으러 가는 거", "잖아",
];

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function hasRevealMarker(text: string): boolean {
  return REVEAL_MARKERS.some((pattern) => pattern.test(text));
}

function countDecisionKeywords(text: string): number {
  return DECISION_KEYWORDS.filter((keyword) => text.includes(keyword)).length;
}

function hasEvidenceMarker(text: string): boolean {
  return EVIDENCE_MARKERS.some((keyword) => text.includes(keyword));
}

function hasCertaintyMarker(text: string): boolean {
  return CERTAINTY_MARKERS.some((keyword) => text.includes(keyword));
}

function detectRepeatedRevealPayload(paragraphs: string[]): ChapterQualityIssue[] {
  const issues: ChapterQualityIssue[] = [];
  const windows = paragraphs.map((_, index) => {
    const windowText = paragraphs.slice(index, index + 4).join("\n\n");
    return {
      index,
      text: windowText,
      hasReveal: hasRevealMarker(windowText),
      decisionCount: countDecisionKeywords(windowText),
    };
  });

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 3; j < windows.length; j++) {
      if (
        windows[i]?.hasReveal &&
        windows[j]?.hasReveal &&
        (windows[i]?.decisionCount || 0) >= 2 &&
        (windows[j]?.decisionCount || 0) >= 2
      ) {
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

function detectDuplicateBeatRestart(paragraphs: string[]): ChapterQualityIssue[] {
  const issues: ChapterQualityIssue[] = [];
  const resetMarkers = ["그리고 얼마 지나지 않은", "그리고 얼마 지나지 않아", "그리고 잠시 뒤", "그리고 다시", "다시 오후", "다시 정문 앞"];
  const beatMarkers = ["대신전", "정문", "황궁", "칙서", "베네딕트", "레온", "세라핀"];

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i] || "";
    if (!resetMarkers.some((marker) => paragraph.includes(marker))) continue;
    const before = paragraphs.slice(Math.max(0, i - 6), i).join("\n\n");
    const after = paragraphs.slice(i, i + 6).join("\n\n");
    const overlappingMarkers = beatMarkers.filter((marker) => before.includes(marker) && after.includes(marker));
    if (overlappingMarkers.length >= 4) {
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

function detectOverfastDeduction(paragraphs: string[]): ChapterQualityIssue[] {
  const issues: ChapterQualityIssue[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    if (!hasEvidenceMarker(paragraphs[i] || "")) continue;
    const windowText = paragraphs.slice(i, i + 5).join("\n\n");
    if (hasCertaintyMarker(windowText)) {
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

export function detectChapterQualityIssues(text: string): ChapterQualityIssue[] {
  const paragraphs = splitParagraphs(text);
  return [
    ...detectRepeatedRevealPayload(paragraphs),
    ...detectDuplicateBeatRestart(paragraphs),
    ...detectOverfastDeduction(paragraphs),
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
