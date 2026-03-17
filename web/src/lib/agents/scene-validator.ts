/**
 * Code-based scene quality validator.
 *
 * Runs after each scene generation to catch quality issues
 * before moving to the next scene.
 */

// ---------------------------------------------------------------------------
// Tell-not-show patterns (감정을 설명하는 표현)
// ---------------------------------------------------------------------------

const TELL_NOT_SHOW_PATTERNS = [
  "마음이 아팠다", "마음이 무거웠다", "마음이 편했다",
  "불안한 마음", "불안했다", "불안감이",
  "슬픔이 밀려왔다", "슬픔을 느꼈다",
  "기쁨이 밀려왔다", "기쁨을 느꼈다",
  "분노가 치밀었다", "분노를 느꼈다",
  "혼란스러웠다", "혼란에 빠졌다",
  "행복했다", "행복을 느꼈다",
  "두려웠다", "두려움을 느꼈다", "두려움이 밀려왔다",
  "역부족이었다",
  "떨칠 수 없었다",
  "가라앉히기에는",
  "공허함을 느꼈다",
  "외로웠다",
];

// ---------------------------------------------------------------------------
// Vague narrative expressions
// ---------------------------------------------------------------------------

const VAGUE_NARRATIVE = [
  "모든 것이 달라졌다",
  "모든 것이 변했다",
  "모든 것이 무너졌다",
  "이 모든 것이 무엇을 의미하는지",
  "그 답을 찾기 위해",
  "나아가야 할 길",
  "다시 시작해야 했다",
  "결심을 굳혔다",
  "마음을 다잡았다",
];

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface SceneIssue {
  type: "dialogue_ratio" | "ending_repetition" | "tell_not_show" | "vague_narrative" | "too_short" | "too_long" | "sentence_repetition";
  message: string;
  severity: "warning" | "error";
}

export interface SceneValidationResult {
  passed: boolean;
  issues: SceneIssue[];
  metrics: {
    charCount: number;
    dialogueRatio: number;
    endingRepetitionRate: number;
    tellNotShowCount: number;
    vagueNarrativeCount: number;
  };
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

/**
 * Count dialogue characters vs total characters.
 */
function measureDialogueRatio(text: string): number {
  // Match Korean dialogue patterns: "..." or 「...」 or "..."
  const dialogueMatches = text.match(/[""「][^""」]*[""」]/g) || [];
  const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
  return text.length > 0 ? dialogueChars / text.length : 0;
}

/**
 * Detect repeated sentence endings (e.g., ~였다. ~였다. ~였다.)
 */
function measureEndingRepetition(text: string): number {
  const sentences = text.split(/[.!?。]\s*/).filter((s) => s.trim().length > 5);
  if (sentences.length < 3) return 0;

  // Extract last 2-3 characters of each sentence as the "ending"
  const endings = sentences.map((s) => {
    const trimmed = s.trim();
    return trimmed.slice(-3);
  });

  // Count consecutive same endings
  let maxRepeat = 1;
  let currentRepeat = 1;
  for (let i = 1; i < endings.length; i++) {
    if (endings[i] === endings[i - 1]) {
      currentRepeat++;
      maxRepeat = Math.max(maxRepeat, currentRepeat);
    } else {
      currentRepeat = 1;
    }
  }

  // Count how many endings are the most common one
  const endingCounts = new Map<string, number>();
  for (const e of endings) {
    endingCounts.set(e, (endingCounts.get(e) || 0) + 1);
  }
  const maxCount = Math.max(...endingCounts.values());
  return maxCount / endings.length;
}

/**
 * Count tell-not-show patterns.
 */
function countTellNotShow(text: string): number {
  return TELL_NOT_SHOW_PATTERNS.filter((p) => text.includes(p)).length;
}

/**
 * Count vague narrative patterns.
 */
function countVagueNarrative(text: string): number {
  return VAGUE_NARRATIVE.filter((p) => text.includes(p)).length;
}

/**
 * Validate a single scene's text quality.
 */
export function validateScene(
  text: string,
  targetChars: number,
  sceneType: string,
): SceneValidationResult {
  const issues: SceneIssue[] = [];
  const charCount = text.length;
  const dialogueRatio = measureDialogueRatio(text);
  const endingRepetitionRate = measureEndingRepetition(text);
  const tellNotShowCount = countTellNotShow(text);
  const vagueNarrativeCount = countVagueNarrative(text);

  // Length checks
  if (charCount < targetChars * 0.3) {
    issues.push({
      type: "too_short",
      message: `씬이 너무 짧습니다 (${charCount}자, 목표 ${targetChars}자의 30% 미만). 장면과 대화를 더 전개하세요.`,
      severity: "error",
    });
  } else if (charCount > targetChars * 2) {
    issues.push({
      type: "too_long",
      message: `씬이 너무 깁니다 (${charCount}자, 목표 ${targetChars}자의 2배 초과). 핵심에 집중하세요.`,
      severity: "warning",
    });
  }

  // Dialogue ratio — dialogue/action scenes should have more
  const minDialogueRatio = sceneType === "dialogue" ? 0.4 : sceneType === "introspection" ? 0.1 : 0.2;
  if (dialogueRatio < minDialogueRatio) {
    issues.push({
      type: "dialogue_ratio",
      message: `대사 비율이 너무 낮습니다 (${(dialogueRatio * 100).toFixed(0)}%, 최소 ${(minDialogueRatio * 100).toFixed(0)}% 필요). 캐릭터의 대사를 추가하세요.`,
      severity: sceneType === "dialogue" ? "error" : "warning",
    });
  }

  // Ending repetition
  if (endingRepetitionRate > 0.5) {
    issues.push({
      type: "ending_repetition",
      message: `문장 어미가 반복됩니다 (동일 어미 비율 ${(endingRepetitionRate * 100).toFixed(0)}%). "~였다. ~였다." 패턴을 다양한 어미로 바꾸세요.`,
      severity: "error",
    });
  }

  // Tell not show
  if (tellNotShowCount >= 3) {
    issues.push({
      type: "tell_not_show",
      message: `감정을 설명하는 표현이 ${tellNotShowCount}개 있습니다. "불안했다" 대신 "손이 떨렸다", "혼란스러웠다" 대신 "거울 속 얼굴이 낯설었다" 등 행동/감각으로 보여주세요.`,
      severity: "error",
    });
  } else if (tellNotShowCount >= 1) {
    issues.push({
      type: "tell_not_show",
      message: `감정 설명 표현이 ${tellNotShowCount}개 있습니다. 가능하면 행동/감각으로 대체하세요.`,
      severity: "warning",
    });
  }

  // Vague narrative
  if (vagueNarrativeCount >= 2) {
    issues.push({
      type: "vague_narrative",
      message: `모호한 서술이 ${vagueNarrativeCount}개 있습니다. "결심을 굳혔다", "다시 시작해야 했다" 같은 표현 대신 구체적인 행동을 쓰세요.`,
      severity: "error",
    });
  }

  const errors = issues.filter((i) => i.severity === "error");
  return {
    passed: errors.length === 0,
    issues,
    metrics: { charCount, dialogueRatio, endingRepetitionRate, tellNotShowCount, vagueNarrativeCount },
  };
}

/**
 * Build a repair prompt for a scene that failed validation.
 */
export function buildSceneRepairPrompt(
  sceneText: string,
  issues: SceneIssue[],
): string {
  const errorMessages = issues
    .filter((i) => i.severity === "error")
    .map((i) => `- ${i.message}`)
    .join("\n");

  return `다음 씬에 품질 문제가 발견되었습니다. 수정해주세요.

## 문제점
${errorMessages}

## 수정 규칙
1. 감정을 "설명"하지 말고 행동/감각으로 "보여주세요" (Show, don't tell)
   - ❌ "불안했다" → ✅ "찻잔을 드는 손끝이 떨렸다"
   - ❌ "혼란스러웠다" → ✅ "거울 속 얼굴이 낯설어 손으로 볼을 만져봤다"
2. 문장 어미를 다양하게: ~였다, ~했다 만 반복하지 말고 ~ㄴ다, ~는다, ~더라, 대화체 등 섞으세요
3. 대사를 추가해서 캐릭터 목소리를 살리세요
4. 모호한 서술("결심을 굳혔다") 대신 구체적 행동("칼집에서 단검을 뽑았다")

## 현재 씬
${sceneText}

위 문제를 수정한 씬 텍스트만 출력하세요.`;
}
