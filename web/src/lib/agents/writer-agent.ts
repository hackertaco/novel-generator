import { getAgent } from "./llm-agent";
import { getWriterSystemPrompt, getSelfReviewPrompt } from "@/lib/prompts/writer-system-prompt";
import { buildChapterContext, buildBlueprintContext } from "@/lib/context/builder";
import { selectModelTier, getModelForTier } from "@/lib/llm/tier";
import { sanitize } from "./rule-guard";
import { accumulateUsage } from "./pipeline";
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
    const { seed, chapterNumber, previousSummaries, blueprint } = ctx;
    const agent = getAgent();
    const tier = selectModelTier(seed, chapterNumber);
    const model = getModelForTier(tier);
    const systemPrompt = getWriterSystemPrompt(seed.world.genre, chapterNumber);

    // Build context prompt
    const context = blueprint
      ? buildBlueprintContext(seed, chapterNumber, previousSummaries, blueprint)
      : buildChapterContext(seed, chapterNumber, previousSummaries);

    const blueprintInstructions = blueprint
      ? `\n목표 분량: ${blueprint.target_word_count}자
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

    // Phase 1: Generate raw text
    yield { type: "stage_change", stage: "writing" };

    let rawText = "";
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
