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
import { segmentText, reassemble } from "./segmenter";
import { locateIssues } from "@/lib/evaluators/issue-locator";
import { editSegment } from "./segment-editor";

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
  | { type: "patch"; paragraphId: number; content: string }
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
씬 구성은 참고만 하세요. 모든 씬을 이번 화에 넣을 필요 없습니다.
자연스러운 전개가 씬 개수보다 중요합니다. 넘치는 씬은 다음 화로 미루세요.`
    : "";

  const chapterRequirements = chapterNumber === 1
    ? `위 설정과 맥락을 바탕으로 1화를 작성해주세요.

## 1화의 진짜 목표
1화의 목표는 "이 주인공의 일상이 궁금하다"를 만드는 것입니다.
충격적 사건이나 대반전이 아니라, **주인공이라는 인간에 대한 호기심**이 핵심입니다.

## 1화 작성법
1. **한 장면에만 집중하세요.** 장면 전환 없이, 하나의 공간에서 하나의 상황만.
2. **주인공의 평범한 순간부터**: 아직 사건이 터지기 전. 이 사람이 어떤 사람인지 보여주세요.
   - 어떻게 말하는지, 무얼 좋아하는지, 주변 사람들과 어떤 관계인지.
   - 설명하지 말고 대화와 행동으로만.
3. **1화 끝에 작은 균열 하나**: 일상에 금이 가는 순간. 뭔가 이상한 낌새.
   - 대폭발이 아니라 "어...?" 정도의 작은 위화감.
   - 독자가 "뭐지?" 하고 2화를 눌러보게 만드는 정도.
4. **세계관은 설명하지 마세요**: 주인공의 일상을 보여주면 세계관은 자연스럽게 드러납니다.
5. **분량**: 4000~6000자. 한 장면을 깊이 있게.
6. **대사 비중 55% 이상**
7. **짧은 문단** (3문장 이하)

## 절대 금지
- 전투/추격/위기 상황으로 시작하기 (아직 때가 아닙니다)
- 세계관/능력 체계 설명
- 2명 이상의 새 캐릭터를 한꺼번에 소개
- 시간 점프 ("며칠 후", "다음날")
- 1화에서 주인공이 각성/변신/능력 획득하기
- 아웃라인의 모든 key_point를 소화하려 하기 (1~2개면 충분)
- "~였다. ~였다. ~였다." 어미 반복
- AI가 쓴 것 같은 문체

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

  // --- Phase 2: Editor polishes + quality loop ---
  const MAX_EDITOR_PASSES = 5;
  let editedText = rawText;
  let editorFeedback: string | null = null;

  for (let editorPass = 1; editorPass <= MAX_EDITOR_PASSES; editorPass++) {

    if (editorPass === 1) {
      // --- Pass 1: Full Editor (existing behavior) ---
      yield { type: "stage_change", stage: "editing" };

      let newEditedText = "";
      const editorStream = runEditor(
        editedText,
        seed,
        chapterNumber,
        editorFeedback,
        previousSummaries,
      );
      let editorResult = await editorStream.next();
      while (!editorResult.done) {
        newEditedText += editorResult.value;
        yield { type: "chunk", content: editorResult.value };
        editorResult = await editorStream.next();
      }

      const editorUsage: TokenUsage = editorResult.value;
      totalUsage = accumulateUsage(totalUsage, editorUsage);
      yield { type: "usage", ...editorUsage };

      if (newEditedText.length >= rawText.length * 0.5) {
        editedText = newEditedText;
      }
    } else {
      // --- Passes 2-5: Segment Patcher ---

      // Score < 0.4 after pass 1 means text is fundamentally broken — use full editor
      if (editorPass === 2 && bestScore < 0.4) {
        yield { type: "stage_change", stage: "editing" };
        let newEditedText = "";
        const fallbackFeedback = editorFeedback || "전반적 품질 개선 필요";
        const fallbackStream = runEditor(editedText, seed, chapterNumber, fallbackFeedback, previousSummaries);
        let fallbackResult = await fallbackStream.next();
        while (!fallbackResult.done) {
          newEditedText += fallbackResult.value;
          yield { type: "chunk", content: fallbackResult.value };
          fallbackResult = await fallbackStream.next();
        }
        const fallbackUsage: TokenUsage = fallbackResult.value;
        totalUsage = accumulateUsage(totalUsage, fallbackUsage);
        yield { type: "usage", ...fallbackUsage };
        if (newEditedText.length >= rawText.length * 0.5) {
          editedText = newEditedText;
        }
        yield { type: "replace_text", content: editedText };
      } else {
        yield { type: "stage_change", stage: "patching" };

        const segments = segmentText(editedText);
        const segStyle = evaluateStyle(editedText, seed.style);
        const segConsistency = evaluateConsistency(seed, chapterNumber, editedText, null);
        const segPacing = evaluatePacing(editedText, chapterNumber);

        const segmentIssues = locateIssues(segments, segStyle, segConsistency, segPacing, seed, chapterNumber);

        if (segmentIssues.length === 0) {
          // No specific issues found but score still low — fallback to full Editor
          yield { type: "stage_change", stage: "editing" };
          let newEditedText = "";
          const fallbackFeedback = editorFeedback || "전반적 품질 개선 필요";
          const fallbackStream = runEditor(editedText, seed, chapterNumber, fallbackFeedback, previousSummaries);
          let fallbackResult = await fallbackStream.next();
          while (!fallbackResult.done) {
            newEditedText += fallbackResult.value;
            yield { type: "chunk", content: fallbackResult.value };
            fallbackResult = await fallbackStream.next();
          }
          const fallbackUsage: TokenUsage = fallbackResult.value;
          totalUsage = accumulateUsage(totalUsage, fallbackUsage);
          yield { type: "usage", ...fallbackUsage };
          if (newEditedText.length >= rawText.length * 0.5) {
            editedText = newEditedText;
          }
          yield { type: "replace_text", content: editedText };
        } else {
          // Patch each failing segment sequentially
          for (const issue of segmentIssues) {
            const targetSeg = segments.find((s) => s.id === issue.segmentId);
            if (!targetSeg) continue;

            const prevSeg = segments.find((s) => s.id === issue.segmentId - 1) || null;
            const nextSeg = segments.find((s) => s.id === issue.segmentId + 1) || null;

            let patchedText = "";
            const segStream = editSegment(
              targetSeg, issue.issues, prevSeg, nextSeg,
              seed, chapterNumber, issue.context,
            );
            let segResult = await segStream.next();
            while (!segResult.done) {
              patchedText += segResult.value;
              segResult = await segStream.next();
            }
            const segUsage: TokenUsage = segResult.value;
            totalUsage = accumulateUsage(totalUsage, segUsage);
            yield { type: "usage", ...segUsage };

            // Safety: only apply patch if reasonable length
            if (patchedText.length >= targetSeg.text.length * 0.5) {
              targetSeg.text = patchedText;
              yield { type: "patch", paragraphId: issue.segmentId, content: patchedText };
            }
          }

          editedText = reassemble(segments);
        }
      }
    }

    // --- Phase 3: Evaluate ---
    yield { type: "stage_change", stage: "evaluating" };

    const styleResult = evaluateStyle(editedText, seed.style);
    const consistencyResult = evaluateConsistency(seed, chapterNumber, editedText, null);
    const pacingResult = evaluatePacing(editedText, chapterNumber);
    const overallScore =
      styleResult.overall_score * 0.35 +
      getConsistencyScore(consistencyResult) * 0.35 +
      pacingResult.overall_score * 0.30;

    yield {
      type: "evaluation",
      result: { style: styleResult, consistency: consistencyResult, pacing: pacingResult },
      overall_score: overallScore,
    };

    // Best-score tracking
    if (overallScore > bestScore) {
      bestText = editedText;
      bestScore = overallScore;
    } else if (editorPass > 1) {
      // Score regressed — revert to best and stop
      editedText = bestText;
      yield { type: "replace_text", content: bestText };
      break;
    }

    if (overallScore >= qualityThreshold || editorPass === MAX_EDITOR_PASSES) {
      break;
    }

    // Build feedback for next pass
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
