import { getAgent } from "./llm-agent";
import { getWriterSystemPrompt, getSelfReviewPrompt } from "@/lib/prompts/writer-system-prompt";
import { buildChapterContext, buildBlueprintContext } from "@/lib/context/builder";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import { sanitize } from "./rule-guard";
import { accumulateUsage } from "./pipeline";
import { writeChapterByScenes, writeChapterParallel } from "./scene-writer";
import type { PipelineAgent, ChapterContext, LifecycleEvent } from "./pipeline";

/**
 * Handle the self-review response from the Writer.
 * Returns original text if response is NO_CHANGES, empty, or too short (< 70% of original).
 */
export function handleSelfReviewResponse(response: string, original: string): string {
  const trimmed = response.trim();

  if (!trimmed || trimmed === "NO_CHANGES") {
    return original;
  }

  // Safety: reject if revised text is less than 70% of original length
  if (trimmed.length < original.length * 0.7) {
    return original;
  }

  return trimmed;
}

/**
 * WriterAgent: generates raw chapter text with optional self-review.
 * Extracted from chapter-lifecycle.ts Phase 1.
 */
export class WriterAgent implements PipelineAgent {
  name = "writer";

  async *run(ctx: ChapterContext): AsyncGenerator<LifecycleEvent> {
    const { seed, chapterNumber, previousSummaries, blueprint, previousChapterEnding, fastMode, parallelMode } = ctx;
    const agent = getAgent();
    const tier = selectModelTier(seed, chapterNumber);
    const model = getModelForTier(tier);
    const systemPrompt = getWriterSystemPrompt(seed.world.genre, chapterNumber);

    // Scene-by-scene generation when blueprint has scenes
    if (blueprint && blueprint.scenes.length > 0) {
      yield { type: "stage_change", stage: "writing" };

      const writeFunc = parallelMode ? writeChapterParallel : writeChapterByScenes;
      const sceneResult = await writeFunc({
        seed,
        chapterNumber,
        blueprint,
        systemPrompt,
        model,
        previousSummaries: previousSummaries.map((s) => ({
          chapter: s.chapter,
          summary: s.summary,
        })),
        previousChapterEnding,
        fastMode,
        // Pass tracking context to scene writer if available
        ...(ctx.trackingContext ? {
          memoryContext: ctx.trackingContext.memoryContext,
          toneGuidance: ctx.trackingContext.toneGuidance,
          progressContext: ctx.trackingContext.progressContext,
          correctionContext: ctx.trackingContext.correctionContext,
        } : {}),
      });

      ctx.totalUsage = accumulateUsage(ctx.totalUsage, sceneResult.usage);
      yield { type: "usage", ...sceneResult.usage };

      // Self-review on assembled text (skip in fast mode for speed)
      if (!fastMode) {
        yield { type: "stage_change", stage: "self-review" };

        const selfReviewResult = await agent.call({
          prompt: `${getSelfReviewPrompt()}\n\n---\n\n${sceneResult.fullText}`,
          system: systemPrompt,
          model,
          temperature: 0.2,
          maxTokens: 12000,
          taskId: `chapter-${chapterNumber}-self-review`,
        });

        ctx.totalUsage = accumulateUsage(ctx.totalUsage, selfReviewResult.usage);
        yield { type: "usage", ...selfReviewResult.usage };

        const reviewed = handleSelfReviewResponse(selfReviewResult.data, sceneResult.fullText);
        ctx.text = sanitize(reviewed);
      } else {
        ctx.text = sanitize(sceneResult.fullText);
      }
      yield { type: "replace_text", content: ctx.text };
      return;
    }

    // Fallback: single-shot generation (no blueprint or empty scenes)
    // Build context prompt
    let context = blueprint
      ? buildBlueprintContext(seed, chapterNumber, previousSummaries, blueprint)
      : buildChapterContext(seed, chapterNumber, previousSummaries);

    // Inject previous chapter ending for continuity
    if (previousChapterEnding && chapterNumber > 1) {
      // Extract who was present in the last scene
      const prevChars = seed.characters
        .filter((c) => previousChapterEnding.includes(c.name))
        .map((c) => c.name);

      context = `# ⚠️ 직전 화(${chapterNumber - 1}화) 마지막 장면
---
${previousChapterEnding}
---
위 내용은 이미 독자가 읽었습니다. 이 직후부터 이어서 쓰세요. 같은 장면을 반복하지 마세요.
${prevChars.length > 0 ? `
## 등장인물 제약 (필수!)
직전 장면에 있던 인물: ${prevChars.join(", ")}
- 첫 장면에는 위 인물만 등장할 수 있습니다.
- 새 인물이 등장하려면 반드시 "들어오는 장면"을 먼저 쓰세요 (문이 열리고, 전갈이 오고 등).
- 이미 그 자리에 있던 것처럼 쓰면 안 됩니다.` : ""}

${context}`;
    }

    // Inject tracking context if available
    if (ctx.trackingContext) {
      const trackingSections: string[] = [];
      if (ctx.trackingContext.memoryContext) trackingSections.push(ctx.trackingContext.memoryContext);
      if (ctx.trackingContext.toneGuidance) trackingSections.push(ctx.trackingContext.toneGuidance);
      if (ctx.trackingContext.progressContext) trackingSections.push(ctx.trackingContext.progressContext);
      if (ctx.trackingContext.correctionContext) trackingSections.push(ctx.trackingContext.correctionContext);
      if (trackingSections.length > 0) {
        context = `${trackingSections.join("\n\n")}\n\n---\n\n${context}`;
      }
    }

    const blueprintInstructions = blueprint
      ? `\n목표 분량: ${blueprint.target_word_count}자
씬 구성은 참고만 하세요. 모든 씬을 이번 화에 넣을 필요 없습니다.
자연스러운 전개가 씬 개수보다 중요합니다. 넘치는 씬은 다음 화로 미루세요.`
      : "";

    const chapterRequirements = chapterNumber === 1
      ? `위 설정과 맥락을 바탕으로 1화를 작성해주세요.

## 1화 작성 가이드

### 이 소설에 맞는 도입부를 쓰세요
- 블루프린트/아웃라인에 지정된 장면과 전개를 따르세요.
- 회귀물이면 죽음/배신 장면에서 시작, 빙의물이면 눈을 뜨는 장면에서 시작, 계약물이면 계약 제안 장면에서 시작 — **소설의 전제에 맞는 도입**이어야 합니다.
- 1화는 독자가 "다음 화"를 누르게 만들어야 합니다. 긴장감이나 호기심이 필요합니다.

### 절제의 원칙
- 블루프린트에 씬이 여러 개 있더라도, 1화에 전부 넣으려 하지 마세요. 1~2개 씬에 집중하세요.
- 이름 붙은 캐릭터는 2~3명 이내로 제한하세요.
- 세계관 설명을 늘어놓지 마세요. 장면 속에서 자연스럽게 보여주세요.
- 1화 끝에 독자가 "그래서 어떻게 되는데?"라고 궁금해할 장면으로 마무리하세요.

### 분량/문체
- 3000~5000자
- 대사 비중 55% 이상
- 짧은 문단 (3문장 이하)
- "~였다. ~였다. ~였다." 어미 반복 금지

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

    // Phase 1: Generate raw text
    yield { type: "stage_change", stage: "writing" };

    let rawText = "";
    // Ch1: cap output tokens to prevent content overload
    const writeMaxTokens = chapterNumber === 1 ? 6000 : 12000;

    const llmStream = agent.callStream({
      prompt: chapterPrompt,
      system: systemPrompt,
      model,
      temperature: 0.5,
      maxTokens: writeMaxTokens,
      taskId: `chapter-${chapterNumber}-write`,
    });

    let result = await llmStream.next();
    while (!result.done) {
      rawText += result.value;
      result = await llmStream.next();
    }

    const writerUsage = result.value;
    ctx.totalUsage = accumulateUsage(ctx.totalUsage, writerUsage);
    yield { type: "usage", ...writerUsage };

    // Auto-continue if too short
    const MIN_CHAR_COUNT = blueprint?.target_word_count
      ? Math.max(blueprint.target_word_count * 0.7, 2000)
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
      const contUsage = contResult.value;
      ctx.totalUsage = accumulateUsage(ctx.totalUsage, contUsage);
      yield { type: "usage", ...contUsage };
    }

    // Phase 1.5: Self-review
    yield { type: "stage_change", stage: "self-review" };

    const selfReviewResult = await agent.call({
      prompt: `${getSelfReviewPrompt()}\n\n---\n\n${rawText}`,
      system: systemPrompt,
      model,
      temperature: 0.2,
      maxTokens: 12000,
      taskId: `chapter-${chapterNumber}-self-review`,
    });

    ctx.totalUsage = accumulateUsage(ctx.totalUsage, selfReviewResult.usage);
    yield { type: "usage", ...selfReviewResult.usage };

    const reviewed = handleSelfReviewResponse(selfReviewResult.data, rawText);
    ctx.text = sanitize(reviewed);
    yield { type: "replace_text", content: ctx.text };
  }
}
