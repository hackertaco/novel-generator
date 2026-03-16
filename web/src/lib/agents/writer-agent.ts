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

## 1화 규칙 (반드시 지킬 것!)

### 등장인물: 주인공 1명만
- 이름이 나오는 캐릭터는 **주인공 단 1명**입니다.
- 시녀, 친구, 연인, 가족 등 다른 캐릭터는 이름 없이 최소한으로만 (예: "시녀가 차를 내밀었다" 정도).
- 대화 상대가 필요하면 이름 없는 조연 1명까지만. 그 조연도 3~4마디 이내.
- 절대로 새 캐릭터를 소개하거나, 미스터리한 인물을 등장시키지 마세요.

### 장면: 딱 1개
- **하나의 공간, 하나의 시간대, 하나의 상황**만 다루세요.
- 장면 전환 금지. "그때", "갑자기", "그 순간" 으로 새 사건을 끌어오지 마세요.
- 예: 아침 식사 장면이면 아침 식사만. 산책이면 산책만. 절대 두 장면을 합치지 마세요.

### 사건: 없음
- 1화에는 **사건이 없습니다**. 전투, 추격, 침입자, 위기 상황 전부 금지.
- 1화의 목표는 "이 주인공이 어떤 사람인지" 보여주는 것뿐입니다.
- 주인공이 뭘 생각하는지, 어떤 습관이 있는지, 뭘 좋아하는지.
- 1화 끝에 아주 작은 위화감 하나만. "어...?" 정도. 폭발이 아님.

### 나쁜 1화 예시 (절대 따라하지 마세요!)
❌ 아침 식사 → 친구 만남 → 정원 산책 → 미스터리 침입자 → 전투 → 추격 → 숨기
→ 이건 5화 분량입니다. 1화에 이렇게 넣으면 안 됩니다.

### 좋은 1화 예시
✅ 아침. 방 안. 주인공이 창밖을 보며 차를 마신다. 시녀가 차를 따라준다.
   혼약 이야기가 나오지만 주인공은 대답을 피한다. 시녀가 나가고 혼자 남는다.
   창밖에서 뭔가 이상한 게 스친다. 주인공이 고개를 갸우뚱한다. 끝.
→ 이게 1화입니다. 이 정도만 쓰세요.

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
