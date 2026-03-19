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
  // LLM 결의 표현 클리셰
  "물러설 수 없었다",
  "포기할 수 없었다",
  "멈출 수 없었다",
  "시작일 뿐이야",
  "시작일 뿐이었다",
  "시작에 불과했다",
  "끝까지 가야 해",
  "끝까지 가야 했다",
  "길을 찾아야 했다",
  "자신의 길을 찾아",
  "결심은 단단했다",
  "흔들리지 않았다",
  "포기하지 않을 것이다",
  "나아갈 것이다",
  "해내야 했다",
  "해낼 수 있을 것이다",
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
  const errorIssues = issues.filter((i) => i.severity === "error");
  const errorMessages = errorIssues
    .map((i) => `- [${i.type}] ${i.message}`)
    .join("\n");

  // Build issue-specific repair guidance
  const specificGuidance: string[] = [];
  const issueTypes = new Set(errorIssues.map((i) => i.type));

  if (issueTypes.has("tell_not_show")) {
    specificGuidance.push(`### 감정 설명 → 행동/감각 전환
- "불안했다" → 손이 떨리거나, 시선이 문 쪽으로 갔다가, 호흡이 짧아지는 등의 신체 반응으로
- "혼란스러웠다" → 같은 곳을 두 번 보거나, 말을 멈추거나, 물건을 떨어뜨리는 행동으로
- "슬펐다" → 목소리가 갈라지거나, 고개를 숙이거나, 손톱으로 손등을 긁는 행동으로
각 감정 설명 표현을 찾아 해당 캐릭터에 맞는 구체적 행동으로 하나씩 교체하세요.`);
  }

  if (issueTypes.has("dialogue_ratio")) {
    specificGuidance.push(`### 대사 비율 높이기
- 긴 서술 문단을 캐릭터의 대사 + 짧은 행동 비트로 분해하세요
- 설명하던 내용을 캐릭터가 직접 말하게 바꾸세요
- 대사 뒤에는 "라고 말했다" 대신 행동 태그를 붙이세요 (예: "가자." 검집을 채웠다.)
주의: 대사를 추가할 때 캐릭터 고유의 말투를 유지하세요.`);
  }

  if (issueTypes.has("ending_repetition")) {
    specificGuidance.push(`### 어미 다양화
연속으로 같은 어미가 나오는 부분을 찾아 다음 중 하나로 교체:
~ㄴ다/~는다 (현재형), ~더라 (회상), ~ㄹ까 (의문), ~지 (확인), 대화체, 명사 종결("적막.")
3문장 이내에 같은 어미가 반복되지 않도록 하세요.`);
  }

  if (issueTypes.has("vague_narrative")) {
    specificGuidance.push(`### 모호한 서술 → 구체적 행동
"결심을 굳혔다" → 구체적으로 무엇을 했는지 (칼을 뽑았다, 편지를 찢었다, 문을 잠갔다)
"다시 시작해야 했다" → 첫 발걸음이 무엇인지 (지도를 펼쳤다, 대장간 문을 두드렸다)
추상적 결의를 삭제하고 행동 하나로 대체하세요.`);
  }

  if (issueTypes.has("too_short")) {
    specificGuidance.push(`### 분량 보완
- 기존 장면의 감각 묘사를 추가하세요 (시각 외에 청각/촉각/후각)
- 캐릭터 간 대사 교환을 1-2회 추가하세요
- 캐릭터의 짧은 내면 반응(행동 기반)을 넣으세요
주의: 분량을 늘리면서 기존 장면의 흐름과 감정톤을 유지하세요.`);
  }

  const guidanceBlock = specificGuidance.length > 0
    ? `\n## 구체적 수정 가이드\n${specificGuidance.join("\n\n")}\n`
    : "";

  return `다음 씬에 품질 문제가 발견되었습니다. 수정해주세요.

## 발견된 문제
${errorMessages}
${guidanceBlock}
## 수정 시 품질 유지 원칙
1. 수정은 문제가 있는 부분만 최소한으로 고치세요. 잘 쓴 부분을 건드리지 마세요.
2. 수정 후에도 장면의 감정 흐름과 긴장감이 유지되어야 합니다.
3. 캐릭터 말투와 성격이 바뀌면 안 됩니다.
4. 수정으로 인해 새로운 문제(어미 반복, 감정 설명 등)가 생기지 않도록 주의하세요.

## 현재 씬
${sceneText}

위 문제를 수정한 완전한 씬 텍스트만 출력하세요.`;
}
