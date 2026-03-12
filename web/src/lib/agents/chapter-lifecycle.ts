import { getAgent } from "./llm-agent";
import type { TokenUsage } from "./types";
import { buildChapterContext, buildBlueprintContext } from "@/lib/context/builder";
import type { ChapterBlueprint } from "@/lib/schema/planning";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import { evaluateStyle, type StyleResult } from "@/lib/evaluators/style";
import {
  evaluateConsistency,
  type ConsistencyResult,
} from "@/lib/evaluators/consistency";
import { extractSummaryRuleBased } from "@/lib/evaluators/summary";
import { evaluatePacing, type PacingResult } from "@/lib/evaluators/pacing";
import {
  evaluateHybrid,
  type HybridEvaluationResult,
} from "@/lib/evaluators/hybrid-evaluator";
import { selectStrategy, applyImprovement } from "./improver";
import type { NovelSeed } from "@/lib/schema/novel";
import type { ChapterSummary } from "@/lib/schema/chapter";
import { getWriterSystemPrompt } from "@/lib/prompts/writer-system-prompt";
import { runEditor } from "./editor-agent";

// --- Event types emitted during lifecycle ---

export type LifecycleEvent =
  | { type: "stage_change"; stage: string }
  | { type: "chunk"; content: string }
  | {
      type: "usage";
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost_usd: number;
    }
  | {
      type: "evaluation";
      result: { style: StyleResult; consistency: ConsistencyResult; pacing?: PacingResult };
      overall_score: number;
    }
  | { type: "retry"; attempt: number; reason: string; score: number }
  | { type: "improvement"; strategy: string; details: string }
  | { type: "replace_text"; content: string }
  | { type: "complete"; summary: ChapterSummary; final_score: number }
  | { type: "error"; message: string }
  | { type: "done" };

// --- Options ---

export interface ChapterLifecycleOptions {
  seed: NovelSeed;
  chapterNumber: number;
  previousSummaries: Array<{
    chapter: number;
    title: string;
    summary: string;
  }>;
  qualityThreshold?: number;
  maxAttempts?: number;
  useHybridEval?: boolean;
  blueprint?: ChapterBlueprint;
}

// --- Helpers ---

function accumulateUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
  };
}

function getConsistencyScore(result: ConsistencyResult): number {
  return (
    result.character_voice.score * 0.3 +
    result.foreshadowing.score * 0.3 +
    result.world_rules.score * 0.2 +
    result.continuity.score * 0.2
  );
}

function getImprovementReason(
  style: StyleResult,
  consistency: ConsistencyResult,
): string {
  const reasons: string[] = [];

  if (!style.dialogue_ratio.pass) {
    reasons.push(
      `대사 비율 ${Math.round(style.dialogue_ratio.actual_ratio * 100)}%로 목표 미달`,
    );
  }
  if (!style.hook_ending.pass) {
    reasons.push("후킹 엔딩 부족");
  }
  if (!style.paragraph_length.pass) {
    reasons.push(`문단 길이 초과 (${style.paragraph_length.violations}건)`);
  }
  if (!consistency.character_voice.pass) {
    reasons.push(
      `캐릭터 목소리 불일치 (${consistency.character_voice.issues.length}건)`,
    );
  }
  if (!consistency.foreshadowing.pass) {
    reasons.push(
      `복선 누락 (${consistency.foreshadowing.missing.length}건)`,
    );
  }

  return reasons.length > 0
    ? reasons.join(", ")
    : "전반적 품질 개선 필요";
}

function getImprovementDetails(
  style: StyleResult,
  consistency: ConsistencyResult,
): string {
  const details: string[] = [];

  if (!style.dialogue_ratio.pass) {
    details.push(
      `대사 비율이 ${Math.round(style.dialogue_ratio.actual_ratio * 100)}%로 목표 ${Math.round(style.dialogue_ratio.target_ratio * 100)}%에 미달합니다. 대사를 더 추가해주세요.`,
    );
  }
  if (!style.hook_ending.pass) {
    details.push(
      "후킹 엔딩이 부족합니다. 긴장감 있는 마무리로 수정해주세요.",
    );
  }
  if (!style.paragraph_length.pass) {
    details.push(
      `${style.paragraph_length.violations}개 문단이 ${style.paragraph_length.max_allowed_sentences}문장을 초과합니다. 짧게 나눠주세요.`,
    );
  }
  for (const missing of consistency.foreshadowing.missing) {
    details.push(
      `복선 '${missing.name}'이(가) 언급되지 않았습니다. 이번 화에서 반드시 포함해주세요.`,
    );
  }
  if (consistency.character_voice.issues.length > 0) {
    for (const issue of consistency.character_voice.issues.slice(0, 2)) {
      details.push(
        `${issue.character}의 말투가 어색합니다. 패턴: ${issue.expected_patterns.join(", ")}`,
      );
    }
  }

  return details.join("\n");
}

function getPacingImprovementReason(pacing: PacingResult): string | null {
  const issues: string[] = [];

  if (!pacing.length.pass) {
    issues.push(
      `분량이 ${pacing.length.char_count}자로 최소 ${pacing.length.target_min}자에 미달합니다. 장면 묘사와 캐릭터의 내면 묘사를 더 풍부하게 추가해주세요.`,
    );
  }
  if (!pacing.scene_density.pass) {
    issues.push(
      `씬당 평균 ${pacing.scene_density.chars_per_scene}자로, 전개가 너무 빠릅니다. 각 장면을 더 깊이 있게 묘사하거나 씬 수를 줄여주세요.`,
    );
  }
  if (!pacing.description_ratio.pass) {
    issues.push(
      `묘사 비율이 ${Math.round(pacing.description_ratio.ratio * 100)}%로 부족합니다. 감각적 묘사(시각, 청각, 촉각)와 감정 묘사를 더 추가해주세요.`,
    );
  }
  if (!pacing.dialogue_pacing.pass) {
    issues.push(
      `대사가 ${pacing.dialogue_pacing.max_consecutive_dialogue_lines}줄 연속됩니다. 대사 사이에 행동, 표정, 감정 묘사를 넣어주세요.`,
    );
  }
  if (!pacing.time_jumps.pass) {
    issues.push(
      `시간 점프가 ${pacing.time_jumps.count}회로 많습니다. 시간 전환을 줄이고 현재 장면에 집중해주세요.`,
    );
  }

  return issues.length > 0 ? issues.join("\n") : null;
}

interface EvaluationSnapshot {
  styleResult: StyleResult;
  consistencyResult: ConsistencyResult;
  pacingResult?: PacingResult;
  overallScore: number;
}

function buildImprovementPrompt(
  originalPrompt: string,
  text: string,
  evaluation: EvaluationSnapshot,
): string {
  const feedback: string[] = [];

  const { styleResult, consistencyResult } = evaluation;

  if (!styleResult.dialogue_ratio.pass) {
    feedback.push(
      `- 대사 비율이 ${Math.round(styleResult.dialogue_ratio.actual_ratio * 100)}%로 목표 ${Math.round(styleResult.dialogue_ratio.target_ratio * 100)}%에 미달합니다. 대사를 더 추가해주세요.`,
    );
  }
  if (!styleResult.hook_ending.pass) {
    feedback.push(
      "- 후킹 엔딩이 부족합니다. 긴장감 있는 마무리로 수정해주세요.",
    );
  }
  if (!styleResult.paragraph_length.pass) {
    feedback.push(
      `- ${styleResult.paragraph_length.violations}개 문단이 길이를 초과합니다. ${styleResult.paragraph_length.max_allowed_sentences}문장 이하로 나눠주세요.`,
    );
  }
  for (const missing of consistencyResult.foreshadowing.missing) {
    feedback.push(
      `- 복선 '${missing.name}'이(가) 언급되지 않았습니다. 이번 화에서 반드시 포함해주세요.`,
    );
  }
  if (consistencyResult.character_voice.issues.length > 0) {
    for (const issue of consistencyResult.character_voice.issues.slice(0, 3)) {
      feedback.push(
        `- ${issue.character}의 말투가 어색합니다. 패턴: ${issue.expected_patterns.join(", ")}`,
      );
    }
  }
  if (consistencyResult.continuity.issues.length > 0) {
    for (const issue of consistencyResult.continuity.issues) {
      feedback.push(`- 연속성 문제: ${issue.expected}`);
    }
  }

  // Pacing feedback
  if (evaluation.pacingResult) {
    const pacingFeedback = getPacingImprovementReason(evaluation.pacingResult);
    if (pacingFeedback) {
      feedback.push(...pacingFeedback.split("\n").map((l) => `- ${l}`));
    }
  }

  return `${originalPrompt}

---

아래는 이전 생성 결과입니다. 피드백을 반영하여 개선된 버전을 작성해주세요.

[이전 결과]
${text}

[개선 피드백] (점수: ${Math.round(evaluation.overallScore * 100)}/100)
${feedback.join("\n")}

위 피드백을 모두 반영하여 전체 본문을 다시 작성해주세요. 소설 본문만 출력하세요.`;
}

// --- Main lifecycle generator ---

export async function* runChapterLifecycle(
  options: ChapterLifecycleOptions,
): AsyncGenerator<LifecycleEvent> {
  const { seed, chapterNumber, previousSummaries } = options;
  const qualityThreshold = options.qualityThreshold ?? 0.85;
  const maxAttempts = options.maxAttempts ?? 1;

  const context = options.blueprint
    ? buildBlueprintContext(seed, chapterNumber, previousSummaries, options.blueprint)
    : buildChapterContext(seed, chapterNumber, previousSummaries);
  const tier = selectModelTier(seed, chapterNumber);
  const model = getModelForTier(tier);
  const agent = getAgent();

  const blueprintInstructions = options.blueprint
    ? `\n목표 분량: ${options.blueprint.target_word_count}자
씬 구성을 반드시 따라주세요 (위 블루프린트 참조).
각 씬의 예상 분량을 참고하여 적절히 배분하세요.`
    : "";

  const chapterRequirements = chapterNumber === 1
    ? `위 설정과 맥락을 바탕으로 1화를 작성해주세요.

## 1화 핵심 목표
1화는 독자가 "다음 화" 버튼을 누르게 만드는 가장 중요한 화입니다.

## 1화 전용 요구사항
1. **오프닝 훅 (첫 3문장)**: 액션/대화/충격적 상황으로 시작. 설명이나 배경 묘사로 시작 금지.
   - 좋은 예: "검이 목을 스쳤다." / "너, 오늘 죽어." / 주인공이 위기 상황에 처한 장면
   - 나쁜 예: "어느 날..." / "이 세계는..." / 세계관 설명
2. **캐릭터 첫인상**: 주인공의 성격을 행동과 대사로 보여주기. "그는 ~한 성격이었다" 류의 설명 절대 금지.
3. **세계관은 자연스럽게**: 설정을 설명하지 말고 장면 속에 녹여내기. 독자가 읽다 보면 자연스럽게 알게 되도록.
4. **엔딩 훅**: 1화 마지막에 "이게 뭐지?" 하는 미스터리나 긴장감. 다음 화를 반드시 읽어야 하는 이유를 만들기.
5. **분량**: 반드시 4000자~6000자 (장면과 대화를 충분히 전개)
6. **대사 비중 55% 이상**: 캐릭터 간 대화로 스토리를 진행
7. **짧은 문단**: 3문장 이하. 한 줄짜리 문장도 적극 활용.
8. **감각 묘사**: 시각, 청각, 촉각 등 감각을 활용한 묘사로 몰입감 높이기

## 절대 금지
- "~였다. ~였다. ~였다." 같은 문장 구조 반복
- "마치 ~처럼" 비유 남발
- 독백으로 상황 해설 ("나는 이 상황이 위험하다고 생각했다")
- 캐릭터 소개를 나열하듯 하기
- AI가 쓴 것 같은 딱딱한 문체

출력: 소설 본문만 (메타 정보 없이)`
    : `위 설정과 맥락을 바탕으로 ${chapterNumber}화를 작성해주세요.

요구사항:
1. 반드시 3000자~6000자 분량 (절대 1500자 이하 금지. 장면과 대화를 충분히 전개하세요)
2. 짧은 문단 (3문장 이하)
3. 대사 비중 55% 이상
4. 마지막은 다음 화가 궁금해지는 후킹 엔딩
5. 캐릭터 목소리 일관성 유지
6. 장면 묘사, 감정 표현을 풍부하게
7. "~였다. ~였다. ~였다." 같은 문장 구조 반복 금지
8. 설명하지 말고 보여주기 (Show, don't tell)
${blueprintInstructions}
출력: 소설 본문만 (메타 정보 없이)`;

  const chapterPrompt = `${context}\n\n---\n\n${chapterRequirements}`;

  let totalUsage: TokenUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cost_usd: 0,
  };
  let bestText = "";
  let bestScore = 0;
  let lastEvaluation: EvaluationSnapshot | null = null;

  // --- Phase 1: Writer generates raw text (silent — user sees status messages only) ---
  yield { type: "stage_change", stage: "generating" };

  let rawText = "";
  const systemPrompt = getWriterSystemPrompt(seed.world.genre, chapterNumber);
  const llmStream = agent.callStream({
    prompt: chapterPrompt,
    system: systemPrompt,
    model,
    temperature: 0.5,
    maxTokens: 12000,
    taskId: `chapter-${chapterNumber}-write`,
  });

  let result = await llmStream.next();
  while (!result.done) {
    rawText += result.value;
    // Don't stream Writer chunks — user only sees witty status messages
    result = await llmStream.next();
  }

  let writerUsage: TokenUsage = result.value;
  totalUsage = accumulateUsage(totalUsage, writerUsage);
  yield { type: "usage", ...writerUsage };

  // Auto-continue if Writer output is too short
  const MIN_CHAR_COUNT = options.blueprint?.target_word_count
    ? Math.max(options.blueprint.target_word_count * 0.7, 2000)
    : 3000;
  const MAX_CONTINUATIONS = 2;
  let continuations = 0;
  while (rawText.length < MIN_CHAR_COUNT && continuations < MAX_CONTINUATIONS) {
    continuations++;
    const continueStream = agent.callStream({
      prompt: `다음은 현재까지 작성된 소설 본문입니다. 이어서 작성해주세요. 현재 ${rawText.length}자이고, 최소 ${MIN_CHAR_COUNT}자까지 작성해야 합니다.

자연스럽게 이어지도록 마지막 문장 이후부터 계속 써주세요. 소설 본문만 출력하세요.

[현재까지의 본문]
${rawText.slice(-1500)}`,
      system: systemPrompt,
      model,
      temperature: 0.5,
      maxTokens: 8000,
      taskId: `chapter-${chapterNumber}-continue-${continuations}`,
    });

    let contResult = await continueStream.next();
    while (!contResult.done) {
      rawText += contResult.value;
      contResult = await continueStream.next();
    }
    const contUsage: TokenUsage = contResult.value;
    totalUsage = accumulateUsage(totalUsage, contUsage);
    yield { type: "usage", ...contUsage };
  }

  // --- Phase 2: Editor polishes (stream to user) + quality loop ---
  const MAX_EDITOR_PASSES = 2;
  let editedText = rawText;
  let editorFeedback: string | null = null;

  for (let editorPass = 1; editorPass <= MAX_EDITOR_PASSES; editorPass++) {
    yield { type: "stage_change", stage: "editing" };

    // On re-edit, provide evaluation feedback to Editor
    let editorInput = editedText;
    if (editorFeedback) {
      editorInput = editedText;
    }

    let newEditedText = "";
    const editorStream = runEditor(
      editorInput,
      seed,
      chapterNumber,
      editorFeedback,
      previousSummaries,
    );
    let editorResult = await editorStream.next();
    while (!editorResult.done) {
      newEditedText += editorResult.value;
      // Stream Editor output to user — this is what they see
      yield { type: "chunk", content: editorResult.value };
      editorResult = await editorStream.next();
    }

    const editorUsage: TokenUsage = editorResult.value;
    totalUsage = accumulateUsage(totalUsage, editorUsage);
    yield { type: "usage", ...editorUsage };

    // Safety check: use editor output only if reasonable
    if (newEditedText.length >= rawText.length * 0.5) {
      editedText = newEditedText;
    }

    // --- Phase 3: Evaluate ---
    yield { type: "stage_change", stage: "evaluating" };

    const styleResult = evaluateStyle(editedText, seed.style);
    const consistencyResult = evaluateConsistency(seed, chapterNumber, editedText, null);
    const pacingResult = evaluatePacing(editedText);
    const overallScore =
      styleResult.overall_score * 0.35 +
      getConsistencyScore(consistencyResult) * 0.35 +
      pacingResult.overall_score * 0.30;

    yield {
      type: "evaluation",
      result: { style: styleResult, consistency: consistencyResult, pacing: pacingResult },
      overall_score: overallScore,
    };

    bestText = editedText;
    bestScore = overallScore;

    // If quality passes or this is the last editor pass, we're done
    if (overallScore >= qualityThreshold || editorPass === MAX_EDITOR_PASSES) {
      break;
    }

    // Quality failed — build feedback for Editor's next pass
    const issues: string[] = [];
    if (!styleResult.dialogue_ratio.pass)
      issues.push(`대사 비율 ${Math.round(styleResult.dialogue_ratio.actual_ratio * 100)}% (목표 ${Math.round(styleResult.dialogue_ratio.target_ratio * 100)}%)`);
    if (!styleResult.hook_ending.pass)
      issues.push("후킹 엔딩 부족");
    if (!styleResult.paragraph_length.pass)
      issues.push(`긴 문단 ${styleResult.paragraph_length.violations}개`);
    const pacingIssues = getPacingImprovementReason(pacingResult);
    if (pacingIssues) issues.push(pacingIssues);

    editorFeedback = `점수: ${Math.round(overallScore * 100)}점 (기준: ${Math.round(qualityThreshold * 100)}점)\n문제:\n${issues.map(i => `- ${i}`).join("\n")}`;

    yield {
      type: "retry",
      attempt: editorPass + 1,
      reason: issues.join(", "),
      score: overallScore,
    };

    // Clear streamed text for re-edit
    yield { type: "replace_text", content: "" };
  }

  // Extract summary
  yield { type: "stage_change", stage: "completing" };

  const outline = seed.chapter_outlines.find(
    (o) => o.chapter_number === chapterNumber,
  );
  const title = options.blueprint?.title || outline?.title || `${chapterNumber}화`;
  const summary = extractSummaryRuleBased(chapterNumber, title, bestText);
  summary.style_score = bestScore;

  yield { type: "complete", summary, final_score: bestScore };
  yield { type: "done" };
}
